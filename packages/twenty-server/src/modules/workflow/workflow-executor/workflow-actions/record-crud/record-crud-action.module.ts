import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { CustomerMarketingWorkflowService } from 'src/modules/customer-marketing/customer-marketing-workflow.service';
import { CustomerMarketingCampaignService } from 'src/modules/customer-marketing/customer-marketing-campaign.service';
import { CustomerMarketingReadService } from 'src/modules/customer-marketing/customer-marketing-read.service';
import { Module } from '@nestjs/common';

import { RecordCrudModule } from 'src/engine/core-modules/record-crud/record-crud.module';
import { WorkflowCommonModule } from 'src/modules/workflow/common/workflow-common.module';
import { WorkflowExecutionContextModule } from 'src/modules/workflow/workflow-executor/services/workflow-execution-context.module';
import { CreateRecordWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/record-crud/create-record.workflow-action';
import { DeleteRecordWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/record-crud/delete-record.workflow-action';
import { FindRecordsWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/record-crud/find-records.workflow-action';
import { PickRecordWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/record-crud/pick-record.workflow-action';
import { UpdateRecordWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/record-crud/update-record.workflow-action';
import { UpsertRecordWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/record-crud/upsert-record.workflow-action';

@Module({
  imports: [
    TokenModule,
    WorkflowExecutionContextModule,
    RecordCrudModule,
    WorkflowCommonModule,
  ],
  providers: [
    CustomerMarketingWorkflowService,
    CustomerMarketingCampaignService,
    CustomerMarketingReadService,
    CreateRecordWorkflowAction,
    UpsertRecordWorkflowAction,
    UpdateRecordWorkflowAction,
    DeleteRecordWorkflowAction,
    FindRecordsWorkflowAction,
    PickRecordWorkflowAction,
  ],
  exports: [
    CreateRecordWorkflowAction,
    UpsertRecordWorkflowAction,
    UpdateRecordWorkflowAction,
    DeleteRecordWorkflowAction,
    FindRecordsWorkflowAction,
    PickRecordWorkflowAction,
  ],
})
export class RecordCRUDActionModule {}
