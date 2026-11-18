import { isErpUuid } from 'src/engine/core-modules/auth/erp/erp-crm-config';
import { BadRequestException } from '@nestjs/common';
import { type WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/query-builder/workspace-select-query-builder';
import {
  type CustomerRecord,
  CONSENT_STATES,
} from './customer-marketing.types';
export const marketingSize = (value: unknown, defaultSize = 30) => {
  const size = value === undefined ? defaultSize : Number(value);
  if (!Number.isInteger(size) || size < 1 || size > 100) {
    throw new BadRequestException('Kích thước trang từ 1 đến 100.');
  }
  return size;
};
export const marketingCursor = (
  value: unknown,
): { at: string; id: string } | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (
    typeof value !== 'string' ||
    value.length > 160 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new BadRequestException('Cursor không hợp lệ.');
  }
  const [at, id, ...extra] = Buffer.from(value, 'base64url')
    .toString('utf8')
    .split('|');
  if (
    extra.length ||
    !at ||
    !Number.isFinite(Date.parse(at)) ||
    !id ||
    !isErpUuid(id)
  ) {
    throw new BadRequestException('Cursor không hợp lệ.');
  }
  return { at, id };
};
export const encodeMarketingCursor = (at: string | Date, id: string) =>
  Buffer.from(`${new Date(at).toISOString()}|${id}`).toString('base64url');
export const applyContactFilter = (
  builder: WorkspaceSelectQueryBuilder,
  query: Record<string, string>,
  alias = 'customer',
) => {
  if (query.shopId) {
    if (!isErpUuid(query.shopId)) {
      throw new BadRequestException('Shop không hợp lệ.');
    }
    builder.andWhere(`${alias}.sourceShopId = :filter_shop`, {
      filter_shop: query.shopId,
    });
  }
  const minimum = Number(query.minOrders ?? 0);
  const maximum =
    query.maxOrders === undefined ? null : Number(query.maxOrders);
  if (
    !Number.isInteger(minimum) ||
    minimum < 0 ||
    minimum > 1000000 ||
    (maximum !== null &&
      (!Number.isInteger(maximum) || maximum < minimum || maximum > 1000000))
  ) {
    throw new BadRequestException('Phân nhóm số đơn không hợp lệ.');
  }
  builder.andWhere(`${alias}.purchaseCount >= :filter_min`, {
    filter_min: minimum,
  });
  if (maximum !== null) {
    builder.andWhere(`${alias}.purchaseCount <= :filter_max`, {
      filter_max: maximum,
    });
  }
  if (query.query) {
    if (query.query.length > 150) {
      throw new BadRequestException('Từ khóa quá dài.');
    }
    builder.andWhere(
      `(strpos(lower(${alias}.name), :filter_query) > 0 OR strpos(lower(COALESCE(${alias}.recipientName,'')), :filter_query) > 0)`,
      { filter_query: query.query.trim().toLowerCase() },
    );
  }
  if (query.consent) {
    if (
      !CONSENT_STATES.includes(query.consent as (typeof CONSENT_STATES)[number])
    ) {
      throw new BadRequestException('Trạng thái consent không hợp lệ.');
    }
    builder.andWhere(`${alias}.consentState = :filter_consent`, {
      filter_consent: query.consent,
    });
  }
  return builder;
};
export const toContact = (record: CustomerRecord) => ({
  id: record.id,
  key: record.sourceKey,
  shopId: record.sourceShopId,
  shopName: record.shopName,
  channel: record.channel,
  email: record.name,
  preferredName: record.preferredName,
  customerNotes: record.customerNotes,
  emailValid: record.emailValid,
  recipientName: record.recipientName,
  recipientPhone: record.recipientPhone,
  country: record.country,
  orderCount: Number(record.orderCount),
  purchaseCount: Number(record.purchaseCount),
  completedCount: Number(record.completedCount),
  activeCount: Number(record.activeCount),
  firstRecordedAt: record.firstRecordedAt,
  lastRecordedAt: record.lastRecordedAt,
  consent: record.consentState,
  version: Number(record.consentVersion),
  evidenceAt: record.evidenceAt,
  evidenceReference: record.evidenceReference,
  sourceSnapshotAt: record.sourceSnapshotAt,
});
