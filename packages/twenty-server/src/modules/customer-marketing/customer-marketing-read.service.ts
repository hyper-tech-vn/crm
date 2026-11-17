import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type ErpCrmRequestPolicy } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { requireErpCapability } from 'src/engine/core-modules/auth/erp/erp-crm-operation-policy';
import { nativeMarketingPredicate } from './native-marketing-record-policy';
import {
  CUSTOMER_OBJECT,
  type CustomerRecord,
  type SourceSummary,
} from './customer-marketing.types';
import { sourceCustomerId } from './customer-marketing.policy';
import {
  applyContactFilter,
  encodeMarketingCursor,
  marketingCursor,
  marketingSize,
  toContact,
} from './customer-marketing-query';
@Injectable()
export class CustomerMarketingReadService {
  constructor(private readonly orm: WorkspaceOrmManager) {}
  query() {
    return this.orm
      .getRepository<CustomerRecord>(CUSTOMER_OBJECT)
      .createQueryBuilder('customer');
  }
  async record(policy: ErpCrmRequestPolicy, key: string) {
    if (!/^[a-f0-9]{32}$/.test(key)) {
      throw new BadRequestException('Mã khách hàng không hợp lệ.');
    }
    requireErpCapability(policy, 'crm-customer:read');
    const record = await this.query()
      .where({ id: sourceCustomerId(key, policy.workspaceId) })
      .getOne<CustomerRecord>();
    if (!record || record.sourceKey !== key) {
      throw new NotFoundException(
        'Không tìm thấy khách hàng trong phạm vi được cấp.',
      );
    }
    return record;
  }
  async contacts(query: Record<string, string>) {
    const size = marketingSize(query.size);
    const cursor = marketingCursor(query.after);
    const builder = applyContactFilter(this.query(), query);
    if (cursor) {
      builder.andWhere(
        '(customer.lastRecordedAt,customer.id) < (:cursor_at::timestamptz,:cursor_id::uuid)',
        { cursor_at: cursor.at, cursor_id: cursor.id },
      );
    }
    const rows = await builder
      .orderBy('customer.lastRecordedAt', 'DESC')
      .addOrderBy('customer.id', 'DESC')
      .take(size + 1)
      .getMany<CustomerRecord>();
    const items = rows.slice(0, size);
    const last = items[items.length - 1];
    return {
      items: items.map(toContact),
      nextCursor:
        rows.length > size && last
          ? encodeMarketingCursor(last.lastRecordedAt, last.id)
          : null,
    };
  }
  async exportContacts(
    policy: ErpCrmRequestPolicy,
    query: Record<string, string>,
  ) {
    requireErpCapability(policy, 'crm-customer:export');
    if (!query.shopId) {
      throw new BadRequestException('Chọn một shop trước khi xuất khách hàng.');
    }
    const builder = applyContactFilter(this.query(), query);
    const predicate = nativeMarketingPredicate(
      policy,
      builder.tableShape,
      builder.alias,
      'crm-customer:export',
    );
    builder.addRowAccessCondition(predicate.sql, predicate.parameters);
    const rows = await builder
      .orderBy('customer.id', 'ASC')
      .take(5001)
      .getMany<CustomerRecord>();
    if (rows.length > 5000) {
      throw new BadRequestException(
        'Tệp vượt 5.000 khách. Thu hẹp phân nhóm trước khi xuất.',
      );
    }
    return {
      items: rows.map((row) => ({
        email: row.name,
        recipientName: row.recipientName,
        shopName: row.shopName,
        consent: row.consentState,
        purchaseCount: Number(row.purchaseCount),
      })),
    };
  }
  async summary(source: SourceSummary) {
    const states = await this.query()
      .select('customer.consentState', 'state')
      .addSelect('count(*)', 'total')
      .addSelect('count(*) FILTER(WHERE NOT customer."emailValid")', 'invalid')
      .groupBy('customer.consentState')
      .getRawMany<{ state: string; total: string; invalid: string }>();
    const shops = await this.query()
      .select('customer.sourceShopId', 'id')
      .addSelect('max(customer."shopName")', 'name')
      .addSelect('max(customer.channel)', 'channel')
      .where('customer.sourceShopId IS NOT NULL')
      .groupBy('customer.sourceShopId')
      .orderBy('name', 'ASC')
      .getRawMany<{ id: string; name: string; channel: string }>();
    return {
      ...source,
      sourceContactCount: source.contactCount,
      contactCount: states.reduce((sum, row) => sum + Number(row.total), 0),
      invalidEmailContacts: states.reduce(
        (sum, row) => sum + Number(row.invalid),
        0,
      ),
      consentCounts: Object.fromEntries(
        states.map((row) => [row.state, Number(row.total)]),
      ),
      shops,
    };
  }
}
