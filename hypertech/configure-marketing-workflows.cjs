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
const { CoreWorkflowVersionRunService } = load(
  'engine/core-modules/workflow/services/core-workflow-version-run.service',
);
const { WorkflowCoreSyncService } = load(
  'engine/core-modules/workflow/services/workflow-core-sync.service',
);
const { getWorkflowPrefillIds } = load(
  'engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflows.util',
);
const { TRIGGER_STEP_ID } = localRequire('twenty-shared/workflow');
const workspaceId = process.env.ERP_CRM_WORKSPACE_ID;
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
    await erpCrmRequestStorage.run({}, async () => {
      const request = {
        method: 'GET',
        path: '/auth/erp-marketing/summary',
        query: {},
        body: {},
        headers: { authorization: 'Bearer ' + token.token },
        get(name) {
          return this.headers[name.toLowerCase()];
        },
      };
      const auth = await app
        .get(AccessTokenService)
        .validateTokenByRequest(request);
      bindDataToRequestObject(auth, request, undefined);
      const policy = erpCrmRequestStorage.getStore()?.policy;
      if (policy?.grants['crm:admin']?.scope !== 'ORGANIZATION')
        throw Error('Current ERP CRM admin authority is required');
      const summary = await app
        .get(CustomerMarketingHttpService)
        .request(request);
      if (summary.contactCount < 1 || summary.shops.length < 1)
        throw Error('Real synchronized customers are required');
      const context = buildWorkspaceAuthContextFromRequest(request);
      await app.get(WorkspaceOrmManager).executeInWorkspaceContext(async () => {
        if (process.env.REMOVE_VENDOR_WORKFLOWS === 'true') {
          const defaults = getWorkflowPrefillIds(workspaceId);
          const ids = [
            defaults.coreQuickLeadWorkflowId,
            defaults.coreCreateCompanyWorkflowId,
          ];
          const dataSource = app.get(DataSource);
          const current = await dataSource.query(
            'SELECT * FROM core.workflow WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
            [workspaceId, ids],
          );
          const versions = await dataSource.query(
            'SELECT * FROM core."workflowVersion" WHERE "workspaceId"=$1 AND "coreWorkflowId"=ANY($2::uuid[])',
            [workspaceId, ids],
          );
          if (
            current.some(
              (row) =>
                new Date(row.updatedAt).valueOf() !==
                new Date(row.createdAt).valueOf(),
            ) ||
            versions.some(
              (row) =>
                new Date(row.updatedAt).valueOf() !==
                new Date(row.createdAt).valueOf(),
            )
          )
            throw Error(
              'Vendor templates were edited; preserve them for review',
            );
          const schema = auth.workspace.databaseSchema;
          if (!/^[a-z0-9_]+$/.test(schema))
            throw Error('Invalid workspace schema');
          const [runs] = await dataSource.query(
            `SELECT count(*)::int AS count FROM "${schema}"."workflowRun" WHERE "coreWorkflowId"=ANY($1::uuid[])`,
            [ids],
          );
          if (runs.count !== 0)
            throw Error(
              'Vendor workflows have run history; preserve them for review',
            );
          if (
            current.length &&
            !fs.existsSync('/operation/vendor-workflows-removed.json')
          )
            fs.writeFileSync(
              '/operation/vendor-workflows-removed.json',
              JSON.stringify({ current, versions }),
              { mode: 0o600 },
            );
          if (current.length)
            await app.get(WorkflowCoreSyncService).deleteFromCore(
              workspaceId,
              current.map((row) => row.id),
            );
          console.log('UNMODIFIED_VENDOR_WORKFLOWS_REMOVED ' + current.length);
        }
        const result = [];
        for (const shop of summary.shops) {
          for (const cohort of [
            {
              key: 'consent',
              label: 'Hỏi quyền nhận email',
              kind: 'CONSENT_REQUEST',
              minimum: 0,
              subject: `May we keep in touch? — ${shop.name}`,
              body: `Hello,\n\nThank you for your interest in ${shop.name}. Would you like to receive occasional emails about our products and offers?\n\nIf you would like to hear from us, please reply YES to this email. If you do not reply, we will not add you to promotional emails.\n\nThank you,\n${shop.name}`,
            },
            {
              key: 'customers',
              label: 'Chăm sóc khách đã mua',
              kind: 'PROMOTION',
              minimum: 1,
              subject: `Thank you from ${shop.name}`,
              body: `Hello,\n\nThank you for choosing ${shop.name}. We appreciate your support. If you have questions about your purchase or would like help choosing your next item, simply reply to this email.\n\nThank you,\n${shop.name}`,
            },
            {
              key: 'repeat',
              label: 'Chăm sóc khách mua lại',
              kind: 'PROMOTION',
              minimum: 2,
              subject: `A thank-you for coming back — ${shop.name}`,
              body: `Hello,\n\nThank you for shopping with ${shop.name} again. We appreciate your continued support. If there is anything we can help you with, please reply to this email.\n\nThank you,\n${shop.name}`,
            },
          ]) {
            const name = `${shop.name} · ${cohort.label}`;
            const rows = await app
              .get(DataSource)
              .query(
                'SELECT id, "lastPublishedCoreWorkflowVersionId" FROM core.workflow WHERE "workspaceId"=$1 AND name=$2',
                [workspaceId, name],
              );
            if (rows.length > 1) throw Error('Ambiguous existing workflow');
            let entry;
            if (rows.length) {
              entry = {
                id: rows[0].id,
                versionId: rows[0].lastPublishedCoreWorkflowVersionId,
                name,
              };
              if (!entry.versionId)
                throw Error('Existing workflow needs review before activation');
            } else {
              const stepId = randomUUID();
              const created = await app
                .get(CoreWorkflowMutationWorkspaceService)
                .createWorkflowWithContent({
                  workspaceId,
                  userWorkspaceId: auth.userWorkspaceId,
                  name,
                  trigger: {
                    name: 'Tạo bản nháp để duyệt',
                    type: 'MANUAL',
                    settings: {
                      outputSchema: {},
                      icon: 'IconMail',
                      availability: { type: 'GLOBAL' },
                    },
                    nextStepIds: [],
                  },
                  steps: [
                    {
                      id: stepId,
                      name: 'Tạo campaign trong Twenty',
                      type: 'CREATE_RECORD',
                      valid: true,
                      nextStepIds: [],
                      settings: {
                        input: {
                          objectName: 'hypertechCampaign',
                          objectRecord: {
                            shopId: shop.id,
                            kind: cohort.kind,
                            name,
                            subject: cohort.subject,
                            bodyText: cohort.body,
                            minOrders: cohort.minimum,
                            maxOrders: null,
                          },
                        },
                        outputSchema: {},
                        errorHandlingOptions: {
                          retryOnFailure: { value: 1 },
                          continueOnFailure: { value: false },
                        },
                      },
                    },
                  ],
                  edges: [{ source: TRIGGER_STEP_ID, target: stepId }],
                });
              await app
                .get(CoreWorkflowLifecycleWorkspaceService)
                .activateCoreWorkflowVersion({
                  workspaceId,
                  userWorkspaceId: auth.userWorkspaceId,
                  coreWorkflowVersionId: created.coreWorkflowVersionId,
                });
              entry = {
                id: created.coreWorkflow.id,
                versionId: created.coreWorkflowVersionId,
                name,
              };
            }
            result.push(entry);
          }
        }
        fs.writeFileSync(
          '/operation/marketing-workflows.json',
          JSON.stringify(result, null, 2),
          { mode: 0o600 },
        );
        console.log(
          'NATIVE_MARKETING_WORKFLOWS_READY ' +
            JSON.stringify({
              workflows: result.length,
              shops: summary.shops.length,
            }),
        );
        if (process.env.RUN_MARKETING_DRAFTS === 'true') {
          if (fs.existsSync('/operation/marketing-workflow-runs.json'))
            throw Error(
              'Initial runs already recorded; use native UI for additional runs',
            );
          const runs = [];
          for (const entry of result) {
            const run = await app.get(CoreWorkflowVersionRunService).run({
              authContext: context,
              coreWorkflowVersionId: entry.versionId,
            });
            runs.push({ ...entry, ...run });
            fs.writeFileSync(
              '/operation/marketing-workflow-runs.json',
              JSON.stringify(runs, null, 2),
              { mode: 0o600 },
            );
          }
          console.log('NATIVE_MARKETING_DRAFT_RUNS_QUEUED ' + runs.length);
        }
      }, context);
    });
  } finally {
    await app.close();
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('WORKFLOW_CONFIGURATION_FAILED', error.name, error.message);
    process.exit(1);
  });
