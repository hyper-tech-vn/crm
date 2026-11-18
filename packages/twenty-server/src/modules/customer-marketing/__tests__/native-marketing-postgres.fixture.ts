import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';
import { type RawAuthContext } from 'src/engine/core-modules/auth/types/raw-auth-context.type';
import { DataSource } from 'typeorm';
import { FieldMetadataType, FeatureFlagKey } from 'twenty-shared/types';
import { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import { type QueryExecutor } from 'src/engine/workspace-query-executor/types/query-executor.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { NO_RECORD_READ_RESTRICTIONS } from 'src/engine/permissions/constants/no-record-read-restrictions.constant';
import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import customer from '../../../../../../hypertech/customer-marketing-app/src/objects/customer.object';
import campaign from '../../../../../../hypertech/customer-marketing-app/src/objects/campaign.object';
import consentEvent from '../../../../../../hypertech/customer-marketing-app/src/objects/consentEvent.object';
export const NATIVE_TEST_SCHEMA = 'hypertech_native_marketing_test';
export const NATIVE_WORKSPACE = '33333333-3333-4333-8333-333333333333';
const definitions = [customer, campaign, consentEvent].map((result) => {
  if (!result.success) {
    throw new Error(result.errors.join('; '));
  }
  return result.config;
});
const standardFields = [
  {
    name: 'id',
    type: FieldMetadataType.UUID,
    defaultValue: 'uuid',
    isNullable: false,
  },
  {
    name: 'createdAt',
    type: FieldMetadataType.DATE_TIME,
    defaultValue: 'now',
    isNullable: false,
  },
  {
    name: 'updatedAt',
    type: FieldMetadataType.DATE_TIME,
    defaultValue: 'now',
    isNullable: false,
  },
  {
    name: 'deletedAt',
    type: FieldMetadataType.DATE_TIME,
    defaultValue: null,
    isNullable: true,
  },
];
const objects = definitions.map((definition) => {
  const rawFields = [
    ...standardFields,
    ...definition.fields,
    ...(definition.nameSingular === 'hypertechConsentEvent'
      ? [
          {
            name: 'customerId',
            type: FieldMetadataType.UUID,
            isNullable: false,
            defaultValue: null,
          },
        ]
      : []),
  ];
  const fields = rawFields.map((field) =>
    getFlatFieldMetadataMock({
      id: `${definition.nameSingular}-${field.name}`,
      universalIdentifier: `${definition.nameSingular}-${field.name}`,
      objectMetadataId: definition.universalIdentifier,
      name: field.name,
      type: field.type as FieldMetadataType,
      isNullable: field.isNullable,
      defaultValue: field.defaultValue,
    }),
  );
  const metadata = getFlatObjectMetadataMock({
    id: definition.universalIdentifier,
    universalIdentifier: definition.universalIdentifier,
    nameSingular: definition.nameSingular,
    namePlural: definition.namePlural,
    applicationUniversalIdentifier: '9b283fec-ec32-56a2-b0ce-3b6c38e3a099',
    workspaceId: NATIVE_WORKSPACE,
    fieldIds: fields.map((field) => field.id),
  });
  const tableShape: WorkspaceTableShape = {
    objectMetadataId: definition.universalIdentifier,
    nameSingular: definition.nameSingular,
    tableName: computeObjectTargetTable(metadata),
    schemaName: NATIVE_TEST_SCHEMA,
    columnNames: fields.map((field) => field.name),
    columnShapeByColumnName: Object.fromEntries(
      fields.map((field) => [
        field.name,
        {
          columnName: field.name,
          fieldName: field.name,
          fieldMetadataId: field.id,
          fieldMetadataType: field.type,
        },
      ]),
    ),
    relationShapeByFieldName: {},
    hasDeletedAtColumn: true,
  };
  return { definition, fields, metadata, tableShape };
});
const objectMaps = {
  byUniversalIdentifier: Object.fromEntries(
    objects.map((object) => [
      object.metadata.universalIdentifier,
      object.metadata,
    ]),
  ),
  universalIdentifierById: Object.fromEntries(
    objects.map((object) => [
      object.metadata.id,
      object.metadata.universalIdentifier,
    ]),
  ),
  universalIdentifiersByApplicationId: {},
};
const allFields = objects.flatMap((object) => object.fields);
const fieldMaps = {
  byUniversalIdentifier: Object.fromEntries(
    allFields.map((field) => [field.universalIdentifier, field]),
  ),
  universalIdentifierById: Object.fromEntries(
    allFields.map((field) => [field.id, field.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {},
};
const disabledFlags = Object.values(FeatureFlagKey).reduce(
  (flags, key) => ({ ...flags, [key]: false }),
  {} as Record<FeatureFlagKey, boolean>,
);
export const prepareNativeTables = async (database: DataSource) => {
  await database.query(`CREATE SCHEMA "${NATIVE_TEST_SCHEMA}"`);
  for (const object of objects) {
    const columns = object.fields.map((field) => {
      const type =
        field.type === FieldMetadataType.UUID
          ? 'uuid'
          : field.type === FieldMetadataType.DATE_TIME
            ? 'timestamptz'
            : field.type === FieldMetadataType.NUMBER
              ? 'double precision'
              : field.type === FieldMetadataType.BOOLEAN
                ? 'boolean'
                : 'text';
      const defaultValue =
        field.defaultValue === null || field.defaultValue === undefined
          ? ''
          : field.defaultValue === 'uuid'
            ? ' DEFAULT gen_random_uuid()'
            : field.defaultValue === 'now'
              ? ' DEFAULT now()'
              : typeof field.defaultValue === 'number' ||
                  typeof field.defaultValue === 'boolean'
                ? ` DEFAULT ${field.defaultValue}`
                : ` DEFAULT ${String(field.defaultValue)}`;
      return `"${field.name}" ${type}${field.name === 'id' ? ' PRIMARY KEY' : ''}${field.isNullable === false ? ' NOT NULL' : ''}${defaultValue}`;
    });
    await database.query(
      `CREATE TABLE "${NATIVE_TEST_SCHEMA}"."${object.tableShape.tableName}"(${columns.join(',')})`,
    );
  }
  await database.query(
    `ALTER TABLE "${NATIVE_TEST_SCHEMA}"."_hypertechConsentEvent" ADD FOREIGN KEY ("customerId") REFERENCES "${NATIVE_TEST_SCHEMA}"."_hypertechCustomer"(id) ON DELETE RESTRICT`,
  );
};
export const buildNativeTestOrm = (database: DataSource) => {
  const makeRepository = (
    name: string,
    executor: QueryExecutor,
    transactional = false,
  ): WorkspaceRepository => {
    const object = objects.find(
      (object) => object.definition.nameSingular === name,
    );
    if (!object) {
      throw new Error('Unexpected test object');
    }
    return new WorkspaceRepository({
      tableShape: object.tableShape,
      flatObjectMetadata: object.metadata,
      internalContext: {
        workspaceId: NATIVE_WORKSPACE,
        featureFlagsMap: disabledFlags,
        billingEntitlements: {},
        flatObjectMetadataMaps: objectMaps,
        flatFieldMetadataMaps: fieldMaps,
        flatIndexMaps: createEmptyFlatEntityMaps(),
        permissionsPrincipals: undefined,
        recordPermissions: {
          isReadDisabled: jest.fn().mockResolvedValue(false),
          assertCanRunOperationOrThrow: jest.fn(),
          buildReadRecordsAccessSQLCondition: jest.fn().mockResolvedValue(true),
          buildWriteRecordsAccessSQLCondition: jest
            .fn()
            .mockResolvedValue(true),
          assertCreatedRecordsMatchRowLevelPermissionsOrThrow: jest.fn(),
          assertUpdatesKeepRecordAccessOrThrow: jest.fn(),
        },
        recordFieldPermissions: {
          buildUnreadableFieldsSQLConditions: jest.fn().mockResolvedValue([]),
        },
        recordAccessGroupWrite: {
          isWriteTransactionRequired: jest.fn().mockResolvedValue(false),
          isRecordsBeforeWriteRequired: jest.fn().mockResolvedValue(false),
          findRelatedRecordsBeforeDelete: jest.fn().mockResolvedValue([]),
          recomputeAfterWrite: jest.fn().mockResolvedValue([]),
        },
        recordAccessGroupQueue: { queueRecompute: jest.fn() },
        recordStock: {
          assertRecordStockAvailable: jest.fn(),
          acquireRecordStock: jest.fn(),
          releaseRecordStock: jest.fn(),
        },
        objectIdByNameSingular: Object.fromEntries(
          objects.map((object) => [
            object.definition.nameSingular,
            object.metadata.id,
          ]),
        ),
        eventEmitterService: { emitDatabaseBatchEvent: jest.fn() },
        coreDataSource: database,
        recordReadRestrictions: NO_RECORD_READ_RESTRICTIONS,
      },
      authContext: buildSystemAuthContext({
        workspace: {
          id: NATIVE_WORKSPACE,
          databaseSchema: NATIVE_TEST_SCHEMA,
        } as NonNullable<RawAuthContext['workspace']>,
      }),
      executor,
      permissionsPrincipals: {
        workspaceId: NATIVE_WORKSPACE,
        mainPrincipal: {
          type: 'apiKey',
          apiKeyId: 'fixture-key',
          roleId: 'fixture-role',
        },
        applicationPrincipal: { type: 'customApplication' },
      },
      shouldBypassPermissionChecks: false,
      shouldSkipEventEmission: false,
      tableShapeByObjectMetadataId: (id) =>
        objects.find((object) => object.metadata.id === id)!.tableShape,
      flatObjectMetadataByObjectMetadataId: (id) =>
        objects.find((object) => object.metadata.id === id)!.metadata,
      getRepositoryForObjectMetadataId: jest.fn(),
      isTransactional: transactional,
      runInNewTransaction: async (work) =>
        database.transaction(async (manager) =>
          work(
            makeRepository(
              name,
              {
                execute: (statement) =>
                  normalize(manager.query(statement.text, statement.values)),
              },
              true,
            ),
          ),
        ),
    });
  };
  const normalize = async (
    query: Promise<unknown>,
  ): Promise<Record<string, unknown>[]> => {
    const result = await query;
    if (!Array.isArray(result)) {
      throw new Error('Unexpected fixture result');
    }
    return (
      Array.isArray(result[0]) && typeof result[1] === 'number'
        ? result[0]
        : result
    ) as Record<string, unknown>[];
  };
  const executor: QueryExecutor = {
    execute: (statement) =>
      normalize(database.query(statement.text, statement.values)),
  };
  return {
    getRepository: (name: string) => makeRepository(name, executor),
    runInWorkspaceTransaction: async (
      work: (scope: {
        getRepository: (name: string) => WorkspaceRepository;
      }) => Promise<unknown>,
    ) =>
      database.transaction(async (manager) =>
        work({
          getRepository: (name) =>
            makeRepository(
              name,
              {
                execute: (statement) =>
                  normalize(manager.query(statement.text, statement.values)),
              },
              true,
            ),
        }),
      ),
  } as unknown as WorkspaceOrmManager;
};
