import { FieldActorSource } from 'twenty-shared/types';
import { CustomerMarketingWorkflowService } from '../customer-marketing-workflow.service';
import { type CustomerMarketingCampaignService } from '../customer-marketing-campaign.service';
import { type ErpCrmAuthorizationService } from 'src/engine/core-modules/auth/erp/erp-crm-authorization.service';
import {
  erpCrmRequestStorage,
  type ErpCrmRequestPolicy,
} from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkflowExecutionContext } from 'src/modules/workflow/workflow-executor/types/workflow-execution-context.type';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const input = {
  shopId: workspaceId,
  kind: 'CONSENT_REQUEST' as const,
  name: 'Ask consent',
  subject: 'Permission',
  bodyText: 'May we contact you?',
  minOrders: 0,
  maxOrders: null,
};
const run = {
  workspaceId,
  workflowRunId: '22222222-2222-4222-8222-222222222222',
};
const step = '33333333-3333-4333-8333-333333333333';
const execution = () =>
  ({
    isActingOnBehalfOfUser: true,
    initiator: { source: FieldActorSource.MANUAL, workspaceMemberId: 'member' },
    application: { id: 'custom' },
    authContext: {
      type: 'user',
      user: { id: 'user' },
      workspace: { id: workspaceId, workspaceCustomApplicationId: 'custom' },
      workspaceMemberId: 'member',
      application: { id: 'custom' },
      userSessionVariant: 'standard',
    },
  }) as unknown as WorkflowExecutionContext;
describe('manual native campaign workflow delegation', () => {
  const environment = { ...process.env };
  beforeAll(() => {
    process.env.AUTH_CLERK_ENABLED = 'true';
    process.env.ERP_CRM_BASE_URL = 'https://erp-api.hyper-tech.vn';
    process.env.ERP_CRM_ORGANIZATION_ID = workspaceId;
    process.env.ERP_CRM_WORKSPACE_ID = workspaceId;
    process.env.APP_SECRET = 'workflow-test-secret-with-at-least-32-characters';
  });
  afterAll(() => {
    process.env = { ...environment };
  });
  const setup = () => {
    const policy = {
      grants: { 'crm:admin': { scope: 'ORGANIZATION' } },
    } as unknown as ErpCrmRequestPolicy;
    const authorize = jest.fn(async () => {
      erpCrmRequestStorage.getStore()!.policy = policy;
    });
    const prepareFromWorkflow = jest.fn().mockResolvedValue({ id: 'campaign' });
    const executeInWorkspaceContext = jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    );
    const service = new CustomerMarketingWorkflowService(
      { authorize } as unknown as ErpCrmAuthorizationService,
      { executeInWorkspaceContext } as unknown as WorkspaceOrmManager,
      { prepareFromWorkflow } as unknown as CustomerMarketingCampaignService,
    );
    return {
      service,
      authorize,
      prepareFromWorkflow,
      executeInWorkspaceContext,
      policy,
    };
  };
  it('refreshes ERP authorization on every execution, preserving native application limits and isolating request policy', async () => {
    const {
      service,
      authorize,
      prepareFromWorkflow,
      executeInWorkspaceContext,
      policy,
    } = setup();
    const actor = execution();
    await service.prepare(actor, run, step, input);
    await service.prepare(actor, run, step, input);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(executeInWorkspaceContext).toHaveBeenLastCalledWith(
      expect.any(Function),
      actor.authContext,
    );
    expect(prepareFromWorkflow).toHaveBeenLastCalledWith(
      policy,
      input,
      run.workflowRunId,
      step,
    );
    expect(erpCrmRequestStorage.getStore()).toBeUndefined();
    authorize.mockRejectedValueOnce(new Error('Clerk proof expired'));
    await expect(service.prepare(actor, run, step, input)).rejects.toThrow(
      'expired',
    );
    expect(prepareFromWorkflow).toHaveBeenCalledTimes(2);
  });
  it.each([
    'system',
    'apiKey',
    'application',
    'pendingActivationUser',
  ] as const)('rejects %s principals before authorization', async (type) => {
    const { service, authorize } = setup();
    const actor = execution();
    actor.authContext = {
      ...actor.authContext,
      type,
    } as WorkflowExecutionContext['authContext'];
    await expect(service.prepare(actor, run, step, input)).rejects.toThrow();
    expect(authorize).not.toHaveBeenCalled();
  });
  it.each([
    'automated',
    'foreign-app',
    'foreign-workspace',
    'foreign-member',
    'agent',
    'limiting-role',
    'restricted-session',
  ])('rejects invalid delegation %s', async (reason) => {
    const { service, authorize } = setup();
    const actor = execution();
    if (actor.authContext.type !== 'user') {
      throw new Error();
    }
    if (reason === 'automated') {
      actor.isActingOnBehalfOfUser = false;
    }
    if (reason === 'foreign-app') {
      actor.application.id = 'other';
    }
    if (reason === 'foreign-workspace') {
      actor.authContext.workspace.id = step;
    }
    if (reason === 'foreign-member') {
      actor.initiator.workspaceMemberId = 'other';
    }
    if (reason === 'agent') {
      actor.authContext.agentId = 'agent';
    }
    if (reason === 'limiting-role') {
      actor.authContext.runtimeLimitingRole = {} as NonNullable<
        typeof actor.authContext.runtimeLimitingRole
      >;
    }
    if (reason === 'restricted-session') {
      actor.authContext.userSessionVariant = 'playground';
    }
    await expect(service.prepare(actor, run, step, input)).rejects.toThrow();
    expect(authorize).not.toHaveBeenCalled();
  });
  it('rejects revoked organization administration', async () => {
    const { service, policy, prepareFromWorkflow } = setup();
    delete policy.grants['crm:admin'];
    await expect(
      service.prepare(execution(), run, step, input),
    ).rejects.toThrow();
    expect(prepareFromWorkflow).not.toHaveBeenCalled();
  });
});
