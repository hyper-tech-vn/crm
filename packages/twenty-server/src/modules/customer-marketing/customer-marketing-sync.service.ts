import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { In } from 'typeorm';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type ErpCrmRequestPolicy } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import {
  CUSTOMER_OBJECT,
  type CustomerRecord,
} from './customer-marketing.types';
import {
  marketingMutationStorage,
  requireSync,
  sourceCustomerId,
} from './customer-marketing.policy';
import { ErpCustomerSourceClient } from './erp-customer-source.client';
@Injectable()
export class CustomerMarketingSyncService {
  constructor(
    private readonly orm: WorkspaceOrmManager,
    private readonly source: ErpCustomerSourceClient,
  ) {}
  async synchronize(
    policy: ErpCrmRequestPolicy,
    proof: string,
    after: string | null,
  ) {
    requireSync(policy);
    const page = await this.source.contacts(proof, after);
    if (
      !Array.isArray(page.items) ||
      page.items.length > 100 ||
      !Number.isFinite(Date.parse(page.snapshotAt))
    ) {
      throw new ServiceUnavailableException('Nguồn đồng bộ ERP chưa hợp lệ.');
    }
    for (const contact of page.items) {
      const expectedKey = createHash('md5')
        .update(
          `${policy.access.organizationId}:${contact.shopId ?? 'manual'}:${contact.email}`,
        )
        .digest('hex');
      if (expectedKey !== contact.key) {
        throw new ServiceUnavailableException(
          'Định danh liên hệ nguồn không khớp.',
        );
      }
    }
    const rows = page.items
      .map((contact) => ({
        id: sourceCustomerId(contact.key, policy.workspaceId),
        name: contact.email,
        sourceOrganizationId: policy.access.organizationId,
        sourceKey: contact.key,
        sourceShopId: contact.shopId,
        shopName: contact.shopName,
        channel: contact.channel,
        emailValid: contact.emailValid,
        recipientName: contact.recipientName,
        recipientPhone: contact.recipientPhone,
        country: contact.country,
        orderCount: contact.orderCount,
        purchaseCount: contact.purchaseCount,
        completedCount: contact.completedCount,
        activeCount: contact.activeCount,
        firstRecordedAt: new Date(contact.firstRecordedAt),
        lastRecordedAt: new Date(contact.lastRecordedAt),
        sourceSnapshotAt: new Date(page.snapshotAt),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (!rows.length) {
      return { imported: 0, nextCursor: page.nextCursor };
    }
    await marketingMutationStorage.run('SYNC_CUSTOMERS', () =>
      this.orm.runInWorkspaceTransaction(async (transaction) => {
        const customers =
          transaction.getRepository<CustomerRecord>(CUSTOMER_OBJECT);
        await customers.insert(rows, { onConflictDoNothing: true });
        const existing = await customers
          .createQueryBuilder('customer')
          .where({ id: In(rows.map((row) => row.id)) })
          .orderBy('customer.id', 'ASC')
          .forUpdate()
          .getMany<CustomerRecord>();
        const byId = new Map(existing.map((row) => [row.id, row]));
        for (const row of rows) {
          const current = byId.get(row.id);
          if (
            !current ||
            current.sourceKey !== row.sourceKey ||
            current.sourceOrganizationId !== row.sourceOrganizationId
          ) {
            throw new ServiceUnavailableException(
              'Định danh đồng bộ CRM không khớp.',
            );
          }
          if (new Date(current.sourceSnapshotAt) >= row.sourceSnapshotAt) {
            continue;
          }
          const { id, ...sourceFields } = row;
          await customers.update({ id }, sourceFields);
        }
      }),
    );
    return { imported: rows.length, nextCursor: page.nextCursor };
  }
}
