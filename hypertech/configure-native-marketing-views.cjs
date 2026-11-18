// Run only inside the deployed application with the private operation mount.
require('/app/node_modules/reflect-metadata');
process.env.DISABLE_CRON_JOBS_REGISTRATION = 'true';
const localRequire = require('node:module').createRequire(
  '/app/packages/twenty-server/package.json',
);
const { NestFactory } = localRequire('@nestjs/core');
const { getRepositoryToken } = localRequire('@nestjs/typeorm');
const { DataSource } = localRequire('typeorm');
const load = (path) =>
  require('/app/packages/twenty-server/dist/' + path + '.js');
const { AppModule } = load('app.module');
const { ErpCrmIdentityEntity } = load(
  'engine/core-modules/auth/erp/erp-crm-identity.entity',
);
const { AccessTokenService } = load(
  'engine/core-modules/auth/token/services/access-token.service',
);
const { erpCrmRequestStorage } = load(
  'engine/core-modules/auth/erp/erp-crm-request-context',
);
const { bindDataToRequestObject } = load(
  'engine/utils/bind-data-to-request-object.util',
);
const { buildWorkspaceAuthContextFromRequest } = load(
  'engine/core-modules/auth/utils/build-workspace-auth-context-from-request.util',
);
const workspaceId = process.env.ERP_CRM_WORKSPACE_ID;
const { v5: uuidV5 } = localRequire('uuid');
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
    abortOnError: false,
  });
  try {
    const bindings = await app
      .get(getRepositoryToken(ErpCrmIdentityEntity))
      .find({
        where: {
          workspaceId,
          organizationId: process.env.ERP_CRM_ORGANIZATION_ID,
        },
        take: 2,
      });
    if (bindings.length !== 1)
      throw Error('Expected the existing single administrator binding');
    const token = await app.get(AccessTokenService).generateAccessToken({
      userId: bindings[0].userId,
      workspaceId,
      authProvider: 'clerk',
      isImpersonating: false,
    });
    const authorized = (method, path, body, work) =>
      erpCrmRequestStorage.run({}, async () => {
        const request = {
          method,
          path: '/auth/erp-marketing' + path,
          query: {},
          body,
          headers: {
            authorization: 'Bearer ' + token.token,
            origin: 'https://crm.hyper-tech.vn',
            'content-type': 'application/json',
          },
          get(name) {
            return this.headers[name.toLowerCase()];
          },
          is(type) {
            return type === 'application/json';
          },
        };
        const auth = await app
          .get(AccessTokenService)
          .validateTokenByRequest(request);
        bindDataToRequestObject(auth, request, undefined);
        const policy = erpCrmRequestStorage.getStore()?.policy;
        if (policy?.grants['crm:admin']?.scope !== 'ORGANIZATION')
          throw Error(
            'Current ERP CRM organization administration is required',
          );
        const context = buildWorkspaceAuthContextFromRequest(request);
        return work({ request, auth, policy, context });
      });
    await authorized('GET', '/summary', {}, async ({ auth }) => {
      const database = app.get(DataSource);
      const { ViewService } = load(
        'engine/metadata-modules/view/services/view.service',
      );
      const { ViewFieldService } = load(
        'engine/metadata-modules/view-field/services/view-field.service',
      );
      const { ViewFilterService } = load(
        'engine/metadata-modules/view-filter/services/view-filter.service',
      );
      const objects = await database.query(
        'SELECT id,"nameSingular" FROM core."objectMetadata" WHERE "workspaceId"=$1 AND "nameSingular"=ANY($2::text[])',
        [workspaceId, ['hypertechCustomer', 'hypertechCampaign']],
      );
      if (objects.length !== 2)
        throw Error('Expected existing native marketing objects');
      const definitions = [
        ['customers', 'hypertechCustomer', 'Tất cả khách hàng', 'LIST', []],
        [
          'customers-table',
          'hypertechCustomer',
          'Bảng khách hàng',
          'TABLE',
          [],
        ],
        [
          'customers-unknown',
          'hypertechCustomer',
          'Chưa hỏi nhận email',
          'LIST',
          [['consentState', 'IS', ['UNKNOWN']]],
        ],
        [
          'customers-subscribed',
          'hypertechCustomer',
          'Đồng ý nhận ưu đãi',
          'LIST',
          [['consentState', 'IS', ['SUBSCRIBED']]],
        ],
        [
          'customers-first',
          'hypertechCustomer',
          'Mua lần đầu · Đã đồng ý',
          'LIST',
          [
            ['consentState', 'IS', ['SUBSCRIBED']],
            ['emailValid', 'IS', true],
            ['purchaseCount', 'IS', 1],
          ],
        ],
        [
          'customers-repeat',
          'hypertechCustomer',
          'Mua lại · Đã đồng ý',
          'LIST',
          [
            ['consentState', 'IS', ['SUBSCRIBED']],
            ['emailValid', 'IS', true],
            ['purchaseCount', 'GREATER_THAN_OR_EQUAL', 2],
          ],
        ],
        ['campaigns', 'hypertechCampaign', 'Tất cả chiến dịch', 'LIST', []],
        [
          'campaigns-table',
          'hypertechCampaign',
          'Bảng chiến dịch',
          'TABLE',
          [],
        ],
      ];
      for (const [key, objectName, name, type, filters] of definitions) {
        const object = objects.find((item) => item.nameSingular === objectName);
        const fields = await database.query(
          'SELECT id,name FROM core."fieldMetadata" WHERE "objectMetadataId"=$1',
          [object.id],
        );
        const fieldId = (name) => {
          const field = fields.find((item) => item.name === name);
          if (!field) throw Error('Missing native field ' + name);
          return field.id;
        };
        const id = uuidV5('hypertech:native-view:' + key, workspaceId);
        const [existing] = await database.query(
          'SELECT id,name,type,"objectMetadataId" FROM core.view WHERE id=$1',
          [id],
        );
        if (
          existing &&
          (existing.name !== name ||
            existing.type !== type ||
            existing.objectMetadataId !== object.id)
        )
          throw Error('Preserve edited native view ' + key);
        if (!existing)
          await app.get(ViewService).createOne({
            workspaceId,
            createdByUserWorkspaceId: auth.userWorkspaceId,
            createViewInput: {
              id,
              universalIdentifier: id,
              objectMetadataId: object.id,
              name,
              type,
              icon: type === 'LIST' ? 'IconList' : 'IconTable',
              position: definitions.findIndex((item) => item[0] === key),
              openRecordIn: 'SIDE_PANEL',
              visibility: 'WORKSPACE',
            },
          });
        const columns =
          objectName === 'hypertechCustomer'
            ? [
                ['name', 240],
                ['consentState', 160],
                ['purchaseCount', 90],
                ['shopName', 150],
                ['recipientName', 180],
                ['lastRecordedAt', 160],
              ]
            : [
                ['name', 280],
                ['kind', 160],
                ['subject', 280],
                ['minOrders', 100],
                ['maxOrders', 100],
                ['draftVersion', 100],
                ['updatedAt', 160],
              ];
        const existingFields = await database.query(
          'SELECT "fieldMetadataId" FROM core."viewField" WHERE "viewId"=$1',
          [id],
        );
        await app.get(ViewFieldService).createMany({
          workspaceId,
          createViewFieldInputs: columns.flatMap(([name, size], position) =>
            existingFields.some(
              (item) => item.fieldMetadataId === fieldId(name),
            )
              ? []
              : [
                  {
                    id: uuidV5('column:' + name, id),
                    universalIdentifier: uuidV5('column:' + name, id),
                    viewId: id,
                    fieldMetadataId: fieldId(name),
                    position,
                    size,
                    isVisible: true,
                    isCanonical: true,
                  },
                ],
          ),
        });
        for (const [name, operand, value] of filters) {
          const filterId = uuidV5('filter:' + name, id);
          const [existingFilter] = await database.query(
            'SELECT id FROM core."viewFilter" WHERE id=$1',
            [filterId],
          );
          if (!existingFilter)
            await app.get(ViewFilterService).createOne({
              workspaceId,
              createViewFilterInput: {
                id: filterId,
                universalIdentifier: filterId,
                viewId: id,
                fieldMetadataId: fieldId(name),
                operand,
                value,
              },
            });
        }
        console.log(
          'NATIVE_VIEW_READY ' +
            JSON.stringify({
              key,
              id,
              type,
              columns: columns.length,
              filters: filters.length,
            }),
        );
      }
      const campaign = objects.find(
        (item) => item.nameSingular === 'hypertechCampaign',
      );
      const profileFields = await database.query(
        'SELECT vf.id,vf."isVisible",f.name FROM core."viewField" vf JOIN core.view v ON v.id=vf."viewId" JOIN core."fieldMetadata" f ON f.id=vf."fieldMetadataId" WHERE v."objectMetadataId"=$1 AND v.type=$2',
        [campaign.id, 'FIELDS_WIDGET'],
      );
      const visible = [
        'name',
        'kind',
        'subject',
        'bodyText',
        'minOrders',
        'maxOrders',
        'draftVersion',
        'createdAt',
        'updatedAt',
      ];
      for (const field of profileFields.filter(
        (field) => field.isVisible !== visible.includes(field.name),
      ))
        await app.get(ViewFieldService).updateOne({
          workspaceId,
          updateViewFieldInput: {
            id: field.id,
            update: { isVisible: visible.includes(field.name) },
          },
        });
      console.log('NATIVE_UI_CONFIGURATION_COMPLETED');
    });
  } finally {
    await app.close();
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('NATIVE_UI_CONFIGURATION_FAILED', error.name, error.message);
    process.exit(1);
  });
