import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v5 as uuidV5 } from 'uuid';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { requireErpCapability } from 'src/engine/core-modules/auth/erp/erp-crm-operation-policy';
import { type ErpCrmRequestPolicy } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import {
  CONSENT_EVENT_OBJECT,
  CUSTOMER_OBJECT,
  type ConsentChange,
  type CustomerRecord,
} from './customer-marketing.types';
import {
  marketingMutationStorage,
  nativeCustomerVisibility,
  sourceCustomerId,
  validateConsentChange,
} from './customer-marketing.policy';
import { toContact } from './customer-marketing-query';
@Injectable()
export class CustomerMarketingConsentService {
  constructor(private readonly orm: WorkspaceOrmManager) {}
  async record(
    policy: ErpCrmRequestPolicy,
    key: string,
    change: ConsentChange,
  ) {
    requireErpCapability(policy, 'crm-customer:read');
    requireErpCapability(policy, 'crm-customer:update');
    requireErpCapability(policy, 'crm-campaign:manage');
    const scope = nativeCustomerVisibility(policy, 'consent');
    if (
      !/^[a-f0-9]{32}$/.test(key) ||
      (!scope.all && !scope.keys.includes(key))
    ) {
      throw new ForbiddenException(
        'Khách hàng ngoài phạm vi xác nhận consent.',
      );
    }
    return marketingMutationStorage.run('RECORD_CONSENT', () =>
      this.orm.runInWorkspaceTransaction(async (transaction) => {
        const customers =
          transaction.getRepository<CustomerRecord>(CUSTOMER_OBJECT);
        const id = sourceCustomerId(key, policy.workspaceId);
        const current = await customers
          .createQueryBuilder('customer')
          .where({ id })
          .forUpdate()
          .getOne<CustomerRecord>();
        if (!current || current.sourceKey !== key) {
          throw new NotFoundException('Không tìm thấy khách hàng.');
        }
        const evidenceAt = validateConsentChange(
          current.consentState,
          Number(current.consentVersion),
          current.evidenceAt ? new Date(current.evidenceAt) : null,
          change,
        );
        const patch = {
          consentState: change.state,
          consentVersion: Number(current.consentVersion) + 1,
          evidenceAt,
          evidenceReference: change.evidenceReference.trim(),
        };
        const result = await customers.update(
          { id, consentVersion: change.expectedVersion },
          patch,
        );
        if (result.affected !== 1) {
          throw new ConflictException('Consent đã thay đổi. Hãy tải lại.');
        }
        await transaction.getRepository(CONSENT_EVENT_OBJECT).insert({
          id: uuidV5(
            `consent:${id}:${patch.consentVersion}`,
            policy.workspaceId,
          ),
          name: `${current.name} · ${patch.consentVersion}`,
          sourceOrganizationId: policy.access.organizationId,
          sourceKey: key,
          customerId: id,
          previousState: current.consentState,
          nextState: change.state,
          evidenceAt,
          evidenceReference: patch.evidenceReference,
          actorErpEmployeeId: policy.access.employeeId,
          consentVersion: patch.consentVersion,
        });
        return toContact({ ...current, ...patch });
      }),
    );
  }
}
