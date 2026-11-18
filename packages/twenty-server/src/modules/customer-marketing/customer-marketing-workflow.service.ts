import { ForbiddenException, Injectable } from '@nestjs/common';
import { type Request } from 'express';
import { FieldActorSource } from 'twenty-shared/types';
import { ErpCrmAuthorizationService } from 'src/engine/core-modules/auth/erp/erp-crm-authorization.service';
import {
  erpCrmEnabled,
  getErpCrmConfig,
} from 'src/engine/core-modules/auth/erp/erp-crm-config';
import { requireErpCapability } from 'src/engine/core-modules/auth/erp/erp-crm-operation-policy';
import { erpCrmRequestStorage } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkflowExecutionContext } from 'src/modules/workflow/workflow-executor/types/workflow-execution-context.type';
import { type WorkflowRunInfo } from 'src/modules/workflow/workflow-executor/types/workflow-action-input.type';
import { CustomerMarketingCampaignService } from './customer-marketing-campaign.service';
import { type DraftInput } from './customer-marketing.types';

@Injectable()
export class CustomerMarketingWorkflowService {
  constructor(
    private readonly authorization: ErpCrmAuthorizationService,
    private readonly orm: WorkspaceOrmManager,
    private readonly campaigns: CustomerMarketingCampaignService,
  ) {}

  async prepare(
    execution: WorkflowExecutionContext,
    runInfo: WorkflowRunInfo,
    stepId: string,
    input: DraftInput,
  ) {
    const auth = execution.authContext;
    if (
      !erpCrmEnabled() ||
      auth.type !== 'user' ||
      !execution.isActingOnBehalfOfUser ||
      execution.initiator.source !== FieldActorSource.MANUAL ||
      execution.initiator.workspaceMemberId !== auth.workspaceMemberId ||
      auth.userSessionVariant !== 'standard' ||
      auth.agentId ||
      auth.runtimeLimitingRole ||
      runInfo.workspaceId !== getErpCrmConfig().workspaceId ||
      auth.workspace.id !== runInfo.workspaceId ||
      execution.application.id !==
        auth.workspace.workspaceCustomApplicationId ||
      auth.application?.id !== execution.application.id
    ) {
      throw new ForbiddenException(
        'Campaign drafts require a manual workspace workflow.',
      );
    }
    // Revalidate the initiating user; the original application still limits native ORM access.
    return erpCrmRequestStorage.run({}, async () => {
      await this.authorization.authorize(
        {
          method: 'POST',
          path: '/auth/erp-marketing/campaigns',
        } as Request,
        {
          user: auth.user,
          workspace: auth.workspace,
          workspaceMemberId: auth.workspaceMemberId,
          userWorkspaceId: auth.userWorkspaceId,
          authProvider: AuthProviderEnum.Clerk,
        },
      );
      const policy = erpCrmRequestStorage.getStore()?.policy;
      if (
        !policy ||
        requireErpCapability(policy, 'crm:admin').scope !== 'ORGANIZATION'
      ) {
        throw new ForbiddenException(
          'Organization CRM administration is required.',
        );
      }
      return this.orm.executeInWorkspaceContext(
        () =>
          this.campaigns.prepareFromWorkflow(
            policy,
            input,
            runInfo.workflowRunId,
            stepId,
          ),
        auth,
      );
    });
  }
}
