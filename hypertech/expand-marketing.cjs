// Run only inside the deployed application with the private operation mount.
require('/app/node_modules/reflect-metadata');
process.env.DISABLE_CRON_JOBS_REGISTRATION = 'true';
const localRequire = require('node:module').createRequire(
  '/app/packages/twenty-server/package.json',
);
const { NestFactory } = localRequire('@nestjs/core');
const { getRepositoryToken } = localRequire('@nestjs/typeorm');
const { DataSource } = localRequire('typeorm');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
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
const { WorkspaceOrmManager } = load('engine/twenty-orm/workspace-orm.manager');
const { CustomerMarketingHttpService } = load(
  'modules/customer-marketing/customer-marketing-http.service',
);
const { CoreWorkflowMutationWorkspaceService } = load(
  'engine/core-modules/workflow/services/core-workflow-mutation.workspace-service',
);
const { CoreWorkflowLifecycleWorkspaceService } = load(
  'engine/core-modules/workflow/services/core-workflow-lifecycle.workspace-service',
);
const workspaceId = process.env.ERP_CRM_WORKSPACE_ID;
const { v5: uuidV5 } = localRequire('uuid');
const { CustomerMarketingCampaignService, toDraft } = load(
  'modules/customer-marketing/customer-marketing-campaign.service',
);
const { CreateRecordService } = load(
  'engine/core-modules/record-crud/services/create-record.service',
);
const { buildWorkflowRunTriggerContext } = load(
  'modules/workflow/workflow-trigger/utils/build-workflow-run-trigger-context.util',
);
const { CoreWorkflowVersionMutationWorkspaceService } = load(
  'engine/core-modules/workflow/services/core-workflow-version-mutation.workspace-service',
);
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
    const call = (method, path, body = {}) =>
      authorized(method, path, body, ({ request }) =>
        app.get(CustomerMarketingHttpService).request(request),
      );
    const before = await call('GET', '/summary');
    let after = null,
      pages = 0,
      processed = 0;
    do {
      const page = await call('POST', '/sync', { after });
      processed += page.imported;
      after = page.nextCursor;
      if (++pages > 200)
        throw Error('Source exceeded reviewed synchronization bound');
    } while (after);
    const summary = await call('GET', '/summary');
    console.log(
      'CUSTOMERS_SYNCHRONIZED ' +
        JSON.stringify({
          before: before.contactCount,
          after: summary.contactCount,
          source: summary.sourceContactCount,
          processed,
          pages,
          shops: summary.shops.length,
          consent: summary.consentCounts,
        }),
    );
    await authorized('GET', '/summary', {}, async ({ auth, policy, context }) =>
      app.get(WorkspaceOrmManager).executeInWorkspaceContext(async () => {
        const repository = app
          .get(WorkspaceOrmManager)
          .getRepository('company');
        const existing = await repository.find({
          where: { name: 'Hypertech' },
          take: 2,
        });
        if (existing.length > 1)
          throw Error(
            'Ambiguous Hypertech companies; preserve existing records',
          );
        let company = existing[0];
        if (!company) {
          const id = uuidV5('hypertech:own-company', workspaceId);
          const { createdBy } = buildWorkflowRunTriggerContext({
            workspaceMember: context.workspaceMember,
          });
          const created = await app.get(CreateRecordService).execute({
            objectName: 'company',
            objectRecord: {
              id,
              name: 'Hypertech',
              domainName: {
                primaryLinkUrl: 'https://hyper-tech.vn',
                primaryLinkLabel: 'Hypertech',
                secondaryLinks: [],
              },
              accountOwnerId: policy.workspaceMemberId,
            },
            authContext: context,
            createdBy,
          });
          if (!created.success) throw Error(created.error || created.message);
          company = await repository.findOne({ where: { id } });
          if (!company) throw Error('Created company was not readable');
        }
        fs.writeFileSync(
          '/operation/hypertech-company.json',
          JSON.stringify({ id: company.id, name: company.name }),
          { mode: 0o600 },
        );
        console.log(
          'HYPERTECH_COMPANY_READY ' +
            JSON.stringify({ id: company.id, name: company.name }),
        );
      }, context),
    );
    const refinements = [];
    for (const shop of summary.shops) {
      await authorized(
        'GET',
        '/summary',
        {},
        async ({ auth, policy, context }) =>
          app.get(WorkspaceOrmManager).executeInWorkspaceContext(async () => {
            const originalName = `${shop.name} · Chăm sóc khách đã mua`;
            const name = `${shop.name} · Chăm sóc khách mua lần đầu`;
            const database = app.get(DataSource);
            const rows = await database.query(
              'SELECT * FROM core.workflow WHERE "workspaceId"=$1 AND name=ANY($2::text[])',
              [workspaceId, [originalName, name]],
            );
            if (rows.length !== 1)
              throw Error(
                'Expected one existing purchased-customer workflow per shop',
              );
            const workflow = rows[0];
            const [published] = await database.query(
              'SELECT * FROM core."workflowVersion" WHERE "workspaceId"=$1 AND id=$2',
              [workspaceId, workflow.lastPublishedCoreWorkflowVersionId],
            );
            const action = published?.steps?.[0];
            const input = action?.settings?.input?.objectRecord;
            if (
              published?.applicationId !==
                context.workspace.workspaceCustomApplicationId ||
              published?.steps?.length !== 1 ||
              published?.triggers?.length !== 1 ||
              published.triggers[0].type !== 'MANUAL' ||
              action.type !== 'CREATE_RECORD' ||
              action.settings.input.objectName !== 'hypertechCampaign' ||
              input?.shopId !== shop.id ||
              input?.kind !== 'PROMOTION' ||
              input?.minOrders !== 1 ||
              (input.maxOrders !== null && input.maxOrders !== 1) ||
              ![originalName, name].includes(input.name)
            )
              throw Error('Workflow content changed; preserve it for review');
            const campaignService = app.get(CustomerMarketingCampaignService);
            const campaigns = await campaignService.list({ size: '100' });
            const matching = campaigns.items.filter(
              (draft) =>
                draft.shopId === shop.id &&
                [originalName, name].includes(draft.name),
            );
            if (matching.length !== 1)
              throw Error(
                'Expected one existing first-purchase campaign draft',
              );
            const draft = await campaignService.record(matching[0].id);
            const originalInput = {
              ...input,
              name: originalName,
              maxOrders: null,
            };
            if (
              draft.subject !== input.subject ||
              draft.bodyText !== input.bodyText ||
              draft.kind !== 'PROMOTION' ||
              Number(draft.minOrders) !== 1 ||
              (draft.maxOrders !== null && Number(draft.maxOrders) !== 1)
            )
              throw Error('Campaign was edited; preserve reviewer changes');
            const snapshotPath = `/operation/first-purchase-before-${shop.id}.json`;
            if (!fs.existsSync(snapshotPath))
              fs.writeFileSync(
                snapshotPath,
                JSON.stringify({ workflow, published, draft }),
                { mode: 0o600 },
              );
            let versionId = published.id;
            if (input.maxOrders !== 1 || input.name !== name) {
              const [draftCount] = await database.query(
                'SELECT count(*)::int AS count FROM core."workflowVersion" WHERE "workspaceId"=$1 AND "coreWorkflowId"=$2 AND status=\'DRAFT\'',
                [workspaceId, workflow.id],
              );
              if (draftCount.count)
                throw Error(
                  'A native workflow draft exists; preserve it for review',
                );
              const mutations = app.get(
                CoreWorkflowVersionMutationWorkspaceService,
              );
              const version =
                await mutations.createDraftFromCoreWorkflowVersion({
                  workspaceId,
                  userWorkspaceId: auth.userWorkspaceId,
                  coreWorkflowId: workflow.id,
                  coreWorkflowVersionIdToCopy: published.id,
                });
              await mutations.updateStep({
                workspaceId,
                userWorkspaceId: auth.userWorkspaceId,
                coreWorkflowVersionId: version.id,
                step: {
                  ...action,
                  settings: {
                    ...action.settings,
                    input: {
                      ...action.settings.input,
                      objectRecord: { ...input, name, maxOrders: 1 },
                    },
                  },
                },
              });
              await app
                .get(CoreWorkflowLifecycleWorkspaceService)
                .activateCoreWorkflowVersion({
                  workspaceId,
                  userWorkspaceId: auth.userWorkspaceId,
                  coreWorkflowVersionId: version.id,
                });
              versionId = version.id;
            }
            if (workflow.name !== name)
              await app
                .get(CoreWorkflowMutationWorkspaceService)
                .updateWorkflow({
                  workspaceId,
                  userWorkspaceId: auth.userWorkspaceId,
                  coreWorkflowId: workflow.id,
                  name,
                });
            if (draft.name !== name || draft.maxOrders === null)
              await campaignService.save(
                policy,
                {
                  shopId: shop.id,
                  kind: 'PROMOTION',
                  name,
                  subject: draft.subject,
                  bodyText: draft.bodyText,
                  minOrders: 1,
                  maxOrders: 1,
                },
                draft.id,
                Number(draft.draftVersion),
              );
            const audience = await campaignService.audience(draft.id);
            refinements.push({
              shop: shop.name,
              workflowId: workflow.id,
              versionId,
              campaignId: draft.id,
              matched: audience.matchedContacts,
              eligible: audience.eligibleContacts,
              minOrders: 1,
              maxOrders: 1,
            });
            console.log(
              'FIRST_PURCHASE_COHORT_READY ' +
                JSON.stringify(refinements[refinements.length - 1]),
            );
          }, context),
      );
    }
    fs.writeFileSync(
      '/operation/marketing-expansion-result.json',
      JSON.stringify({
        summary: {
          contacts: summary.contactCount,
          sourceContacts: summary.sourceContactCount,
          shops: summary.shops,
          consentCounts: summary.consentCounts,
        },
        processed,
        pages,
        refinements,
      }),
      { mode: 0o600 },
    );
    console.log(
      'MARKETING_EXPANSION_COMPLETED ' +
        JSON.stringify({
          customers: summary.contactCount,
          refinedWorkflows: refinements.length,
        }),
    );
  } finally {
    await app.close();
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('MARKETING_EXPANSION_FAILED', error.name, error.message);
    process.exit(1);
  });
