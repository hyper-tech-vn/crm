import { z } from 'zod';
import { isErpUuid } from 'src/engine/core-modules/auth/erp/erp-crm-config';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { v5 as uuidV5 } from 'uuid';
import { type ErpCrmRequestPolicy } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { requireErpCapability } from 'src/engine/core-modules/auth/erp/erp-crm-operation-policy';
import { type ErpCrmCapability } from 'src/engine/core-modules/auth/erp/erp-crm-access.types';
import {
  CONSENT_STATES,
  type ConsentChange,
  type ConsentState,
  type DraftInput,
  type MarketingMutation,
} from './customer-marketing.types';
export const marketingMutationStorage =
  new AsyncLocalStorage<MarketingMutation>();
export const sourceCustomerId = (sourceKey: string, workspaceId: string) =>
  uuidV5(sourceKey, workspaceId);
export const nativeCustomerVisibility = (
  policy: ErpCrmRequestPolicy,
  capability: ErpCrmCapability | 'consent',
) => {
  const permissions = policy.customerVisibility;
  if (!permissions) {
    throw new ForbiddenException(
      'ERP customer visibility has not been resolved.',
    );
  }
  const key =
    capability === 'consent'
      ? 'consent'
      : capability === 'crm-customer:read'
        ? 'read'
        : capability === 'crm-customer:update'
          ? 'update'
          : capability === 'crm-customer:export'
            ? 'export'
            : null;
  if (!key) {
    throw new ForbiddenException('Unsupported customer scope.');
  }
  const required: Record<typeof key, ErpCrmCapability[]> = {
    read: ['crm-customer:read'],
    update: ['crm-customer:read', 'crm-customer:update'],
    export: ['crm-customer:read', 'crm-customer:export'],
    consent: [
      'crm-customer:read',
      'crm-customer:update',
      'crm-campaign:manage',
    ],
  };
  const grants = required[key].map((capability) =>
    requireErpCapability(policy, capability),
  );
  if (
    permissions[key].all &&
    grants.some((grant) => grant.scope !== 'ORGANIZATION')
  ) {
    throw new ForbiddenException(
      'ERP customer scope changed; reload before continuing.',
    );
  }
  return permissions[key];
};
export const requireSync = (policy: ErpCrmRequestPolicy) => {
  requireErpCapability(policy, 'crm:admin');
  for (const permission of [
    'crm-customer:read',
    'crm-customer:create',
    'crm-customer:update',
  ] as const) {
    if (requireErpCapability(policy, permission).scope !== 'ORGANIZATION') {
      throw new ForbiddenException(
        'Source synchronization requires organization customer administration.',
      );
    }
  }
};
export const validateConsentChange = (
  previous: ConsentState,
  currentVersion: number,
  previousEvidence: Date | null,
  change: ConsentChange,
  now = new Date(),
) => {
  if (
    !change ||
    !Number.isInteger(change.expectedVersion) ||
    change.expectedVersion < 0
  ) {
    throw new BadRequestException('Phiên bản consent không hợp lệ.');
  }
  if (change.expectedVersion !== currentVersion) {
    throw new ConflictException(
      'Consent đã thay đổi. Hãy tải lại trước khi lưu.',
    );
  }
  if (
    !CONSENT_STATES.includes(change.state) ||
    change.state === 'UNKNOWN' ||
    previous === 'SUPPRESSED' ||
    (change.state === 'PENDING' && previous !== 'UNKNOWN')
  ) {
    throw new BadRequestException('Trạng thái xác nhận không hợp lệ.');
  }
  if (
    !z.string().datetime({ offset: true }).safeParse(change.evidenceAt).success
  ) {
    throw new BadRequestException(
      'Thời điểm bằng chứng phải có múi giờ rõ ràng.',
    );
  }
  const at = new Date(change.evidenceAt);
  if (
    !Number.isFinite(at.valueOf()) ||
    at.valueOf() < Date.UTC(2000, 0, 1) ||
    at.valueOf() > now.valueOf() + 300000 ||
    (previousEvidence && at <= previousEvidence)
  ) {
    throw new BadRequestException(
      'Thời điểm bằng chứng phải hợp lệ và mới hơn xác nhận trước.',
    );
  }
  if (
    typeof change.evidenceReference !== 'string' ||
    change.evidenceReference.trim().length < 10 ||
    change.evidenceReference.length > 1000
  ) {
    throw new BadRequestException(
      'Cần bằng chứng xác nhận từ 10 đến 1.000 ký tự.',
    );
  }
  return at;
};
export const validateDraft = (value: DraftInput) => {
  const text = (input: unknown, max: number) =>
    typeof input === 'string' && !!input.trim() && input.length <= max;
  if (
    !value ||
    !isErpUuid(value.shopId) ||
    !['CONSENT_REQUEST', 'PROMOTION'].includes(value.kind) ||
    !text(value.name, 150) ||
    !text(value.subject, 200) ||
    /[\r\n]/.test(value.subject) ||
    !text(value.bodyText, 50000) ||
    !Number.isInteger(value.minOrders) ||
    value.minOrders < 0 ||
    value.minOrders > 1000000 ||
    (value.maxOrders !== null &&
      (!Number.isInteger(value.maxOrders) ||
        value.maxOrders < value.minOrders ||
        value.maxOrders > 1000000))
  ) {
    throw new BadRequestException(
      'Bản nháp chưa hợp lệ. Kiểm tra shop, nội dung và phân nhóm.',
    );
  }
};
