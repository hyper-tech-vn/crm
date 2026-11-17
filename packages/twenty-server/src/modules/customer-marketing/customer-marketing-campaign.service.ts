import { isErpUuid } from 'src/engine/core-modules/auth/erp/erp-crm-config';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidV4 } from 'uuid';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type ErpCrmRequestPolicy } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { requireErpCapability } from 'src/engine/core-modules/auth/erp/erp-crm-operation-policy';
import {
  CAMPAIGN_OBJECT,
  type CampaignRecord,
  type CustomerRecord,
  type DraftInput,
} from './customer-marketing.types';
import {
  marketingMutationStorage,
  validateDraft,
} from './customer-marketing.policy';
import { CustomerMarketingReadService } from './customer-marketing-read.service';
import {
  applyContactFilter,
  encodeMarketingCursor,
  marketingCursor,
  marketingSize,
  toContact,
} from './customer-marketing-query';
export const toDraft = (record: CampaignRecord) => ({
  id: record.id,
  shopId: record.shopId,
  kind: record.kind,
  name: record.name,
  subject: record.subject,
  bodyText: record.bodyText,
  minOrders: Number(record.minOrders),
  maxOrders: record.maxOrders === null ? null : Number(record.maxOrders),
  version: Number(record.draftVersion),
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
@Injectable()
export class CustomerMarketingCampaignService {
  constructor(
    private readonly orm: WorkspaceOrmManager,
    private readonly customers: CustomerMarketingReadService,
  ) {}
  async list(query: Record<string, string>) {
    const size = marketingSize(query.size);
    const cursor = marketingCursor(query.after);
    const builder = this.orm
      .getRepository<CampaignRecord>(CAMPAIGN_OBJECT)
      .createQueryBuilder('campaign');
    if (cursor) {
      builder.andWhere(
        '(campaign.createdAt,campaign.id)<(:cursor_at::timestamptz,:cursor_id::uuid)',
        { cursor_at: cursor.at, cursor_id: cursor.id },
      );
    }
    const rows = await builder
      .orderBy('campaign.createdAt', 'DESC')
      .addOrderBy('campaign.id', 'DESC')
      .take(size + 1)
      .getMany<CampaignRecord>();
    const items = rows.slice(0, size);
    const last = items[items.length - 1];
    return {
      items: items.map(toDraft),
      nextCursor:
        rows.length > size && last
          ? encodeMarketingCursor(last.createdAt, last.id)
          : null,
    };
  }
  async record(id: string) {
    if (!isErpUuid(id)) {
      throw new BadRequestException('Mã chiến dịch không hợp lệ.');
    }
    const record = await this.orm
      .getRepository<CampaignRecord>(CAMPAIGN_OBJECT)
      .findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(
        'Không tìm thấy chiến dịch trong phạm vi được cấp.',
      );
    }
    return record;
  }
  async save(
    policy: ErpCrmRequestPolicy,
    input: DraftInput,
    id?: string,
    expectedVersion?: number,
  ) {
    requireErpCapability(policy, 'crm-campaign:read');
    requireErpCapability(policy, 'crm-campaign:manage');
    requireErpCapability(policy, 'crm-customer:read');
    validateDraft(input);
    const shop = await this.customers
      .query()
      .where({ sourceShopId: input.shopId })
      .take(1)
      .getOne<CustomerRecord>();
    if (!shop) {
      throw new BadRequestException(
        'Shop chưa có khách trong Twenty hoặc nằm ngoài phạm vi được cấp.',
      );
    }
    const draftFields = {
      shopId: input.shopId,
      kind: input.kind,
      name: input.name.trim(),
      subject: input.subject.trim(),
      bodyText: input.bodyText,
      minOrders: input.minOrders,
      maxOrders: input.maxOrders,
    };
    return marketingMutationStorage.run('SAVE_CAMPAIGN', () =>
      this.orm.runInWorkspaceTransaction(async (transaction) => {
        const campaigns =
          transaction.getRepository<CampaignRecord>(CAMPAIGN_OBJECT);
        if (!id) {
          const newId = uuidV4();
          await campaigns.insert({
            id: newId,
            ...draftFields,
            sourceOrganizationId: policy.access.organizationId,
            createdByErpEmployeeId: policy.access.employeeId,
            draftVersion: 1,
          });
          const created = await campaigns.findOne({ where: { id: newId } });
          if (!created) {
            throw new NotFoundException();
          }
          return toDraft(created);
        }
        if (!Number.isInteger(expectedVersion) || expectedVersion! < 1) {
          throw new BadRequestException('Phiên bản chiến dịch không hợp lệ.');
        }
        const result = await campaigns.update(
          { id, draftVersion: expectedVersion },
          { ...draftFields, draftVersion: expectedVersion! + 1 },
        );
        if (result.affected !== 1) {
          throw new ConflictException(
            'Chiến dịch đã thay đổi hoặc nằm ngoài phạm vi cập nhật.',
          );
        }
        const saved = await campaigns.findOne({ where: { id } });
        if (!saved) {
          throw new NotFoundException();
        }
        return toDraft(saved);
      }),
    );
  }
  async audience(id: string) {
    const draft = await this.record(id);
    const filter = {
      shopId: draft.shopId,
      minOrders: String(draft.minOrders),
      ...(draft.maxOrders === null
        ? {}
        : { maxOrders: String(draft.maxOrders) }),
    };
    const requiredConsent =
      draft.kind === 'PROMOTION' ? 'SUBSCRIBED' : 'UNKNOWN';
    const states = await applyContactFilter(this.customers.query(), filter)
      .select('customer.consentState', 'state')
      .addSelect('count(*)', 'total')
      .addSelect(
        'count(*) FILTER(WHERE customer."purchaseCount"=0)',
        'without_purchase',
      )
      .addSelect('count(*) FILTER(WHERE NOT customer."emailValid")', 'invalid')
      .addSelect('count(*) FILTER(WHERE customer."emailValid")', 'eligible')
      .groupBy('customer.consentState')
      .getRawMany<{
        state: string;
        total: string;
        without_purchase: string;
        invalid: string;
        eligible: string;
      }>();
    const sample = await applyContactFilter(this.customers.query(), {
      ...filter,
      consent: requiredConsent,
    })
      .andWhere('customer.emailValid = :valid_email', { valid_email: true })
      .orderBy('customer.lastRecordedAt', 'DESC')
      .addOrderBy('customer.id', 'DESC')
      .take(20)
      .getMany<CustomerRecord>();
    return {
      matchedContacts: states.reduce(
        (sum, state) => sum + Number(state.total),
        0,
      ),
      eligibleContacts: Number(
        states.find((state) => state.state === requiredConsent)?.eligible ?? 0,
      ),
      countsByConsent: Object.fromEntries(
        states.map((state) => [state.state, Number(state.total)]),
      ),
      withoutPurchase: states.reduce(
        (sum, state) => sum + Number(state.without_purchase),
        0,
      ),
      invalidEmails: states.reduce(
        (sum, state) => sum + Number(state.invalid),
        0,
      ),
      requiredConsent,
      sample: { items: sample.map(toContact), nextCursor: null },
    };
  }
}
