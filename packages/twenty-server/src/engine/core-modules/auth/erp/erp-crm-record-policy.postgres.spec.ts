import { DataSource } from 'typeorm';
import { FieldMetadataType } from 'twenty-shared/types';
import { WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/query-builder/workspace-select-query-builder';
import { NO_RECORD_READ_RESTRICTIONS } from 'src/engine/permissions/constants/no-record-read-restrictions.constant';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import {
  erpCrmRequestStorage,
  type ErpCrmRequestPolicy,
} from './erp-crm-request-context';

const schemaName = 'erp_crm_policy_test';
const owner = '50000000-0000-4000-8000-000000000001';
const colleague = '50000000-0000-4000-8000-000000000002';
const outside = '50000000-0000-4000-8000-000000000003';
const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const shape = (
  nameSingular: string,
  columns: string[],
): WorkspaceTableShape => ({
  objectMetadataId: nameSingular,
  nameSingular,
  schemaName,
  tableName: nameSingular,
  columnNames: columns,
  columnShapeByColumnName: Object.fromEntries(
    columns.map((columnName) => [
      columnName,
      {
        columnName,
        fieldName: columnName,
        fieldMetadataId: columnName,
        fieldMetadataType: FieldMetadataType.UUID,
      },
    ]),
  ),
  relationShapeByFieldName: {},
  hasDeletedAtColumn: true,
});
const company = shape('company', ['id', 'accountOwnerId', 'deletedAt']);
const person = shape('person', [
  'id',
  'companyId',
  'createdByWorkspaceMemberId',
  'deletedAt',
]);
const policy = (
  scope: 'SELF' | 'UNIT_SUBTREE' | 'ORGANIZATION',
  owners: string[],
): ErpCrmRequestPolicy => {
  const grant = {
    scope,
    ownerEmployeeIds: [],
    ownerWorkspaceMemberIds: owners,
  };
  return {
    userId: id(99),
    workspaceId: id(98),
    workspaceMemberId: owner,
    databaseSchema: schemaName,
    access: {
      version: 1,
      organizationId: id(97),
      employeeId: id(96),
      instanceAdministration: false,
      permissions: {},
    },
    grants: {
      'crm:access': grant,
      'crm-customer:read': grant,
      'crm-customer:update': grant,
      'crm-customer:delete': grant,
    },
  };
};

(process.env.ERP_CRM_TEST_DATABASE_URL ? describe : describe.skip)(
  'ERP CRM real PostgreSQL record boundary',
  () => {
    const environment = process.env;
    let database: DataSource;
    beforeAll(async () => {
      jest.useRealTimers();
      process.env.AUTH_CLERK_ENABLED = 'true';
      database = new DataSource({
        type: 'postgres',
        url: process.env.ERP_CRM_TEST_DATABASE_URL,
      });
      await database.initialize();
      await database.query(`CREATE SCHEMA "${schemaName}"`);
      await database.query(
        `CREATE TABLE "${schemaName}".company (id uuid PRIMARY KEY, "accountOwnerId" uuid, "deletedAt" timestamptz)`,
      );
      await database.query(
        `CREATE TABLE "${schemaName}".person (id uuid PRIMARY KEY, "companyId" uuid, "createdByWorkspaceMemberId" uuid, "deletedAt" timestamptz)`,
      );
      for (const [index, creator] of [owner, colleague, outside].entries()) {
        await database.query(
          `INSERT INTO "${schemaName}".company VALUES ($1,$2,NULL)`,
          [id(index + 1), creator],
        );
        await database.query(
          `INSERT INTO "${schemaName}".person VALUES ($1,$2,$3,NULL)`,
          [id(index + 11), id(index + 1), outside],
        );
      }
      await database.query(
        `INSERT INTO "${schemaName}".person VALUES ($1,NULL,$2,NULL)`,
        [id(14), owner],
      );
    }, 30000);
    afterAll(async () => {
      if (database?.isInitialized) {
        await database.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        await database.destroy();
      }
      process.env = environment;
    });
    const builder = (tableShape: WorkspaceTableShape) =>
      new WorkspaceSelectQueryBuilder(tableShape.nameSingular, {
        tableShape,
        executor: {
          execute: async (statement) => {
            const rows = await database.query(statement.text, statement.values);
            return Array.isArray(rows[0]) && typeof rows[1] === 'number'
              ? rows[0]
              : rows;
          },
        },
        recordReadRestrictions: NO_RECORD_READ_RESTRICTIONS,
        tableShapeByObjectMetadataId: () => company,
        onBeforeExecute: () => undefined,
        formatResult: (records) => records as never,
      });

    it.each([
      ['SELF', [owner], 1, 2],
      ['UNIT_SUBTREE', [owner, colleague], 2, 3],
      ['ORGANIZATION', [], 3, 4],
    ] as const)(
      'scopes list/count/company ownership with %s',
      async (scope, owners, companies, people) => {
        await erpCrmRequestStorage.run(
          { policy: policy(scope, [...owners]) },
          async () => {
            expect(await builder(company).getCount()).toBe(companies);
            expect(await builder(person).getCount()).toBe(people);
            expect(
              (await builder(company).orWhere('TRUE').getMany()).length,
            ).toBe(companies);
          },
        );
      },
    );
    it('filters direct bulk mutations and refuses cross-workspace SQL', async () => {
      await erpCrmRequestStorage.run(
        { policy: policy('SELF', [owner]) },
        async () => {
          const deletion = WorkspaceSelectQueryBuilder.toMutationQueryBuilder(
            builder(person).where('TRUE'),
            'delete',
          ).returning(['id']);
          const deleted = (await deletion.execute()).generatedMaps;
          expect(deleted.map((row: { id: string }) => row.id).sort()).toEqual([
            id(11),
            id(14),
          ]);
          expect(() =>
            builder({ ...company, schemaName: 'foreign_workspace' }).getQuery(),
          ).toThrow('workspace mismatch');
        },
      );
      expect(
        (
          await database.query(
            `SELECT count(*)::int AS count FROM "${schemaName}".person`,
          )
        )[0].count,
      ).toBe(2);
    });
  },
);
