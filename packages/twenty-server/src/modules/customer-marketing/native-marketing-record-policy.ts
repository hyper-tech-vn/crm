import { computeTableName } from 'src/engine/utils/compute-table-name.util';
import { ForbiddenException } from '@nestjs/common';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import { type ErpCrmRequestPolicy } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { type ErpCrmCapability } from 'src/engine/core-modules/auth/erp/erp-crm-access.types';
import { requireErpCapability } from 'src/engine/core-modules/auth/erp/erp-crm-operation-policy';
import {
  CUSTOMER_OBJECT,
  CAMPAIGN_OBJECT,
  CONSENT_EVENT_OBJECT,
} from './customer-marketing.types';
import {
  marketingMutationStorage,
  nativeCustomerVisibility,
  requireSync,
  sourceCustomerId,
} from './customer-marketing.policy';
export const isNativeMarketingObject = (name: string) =>
  [CUSTOMER_OBJECT, CAMPAIGN_OBJECT, CONSENT_EVENT_OBJECT].includes(name);
const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';
export const nativeMarketingReadCapability = (
  name: string,
): ErpCrmCapability =>
  name === CAMPAIGN_OBJECT ? 'crm-campaign:read' : 'crm-customer:read';
export const nativeMarketingPredicate = (
  policy: ErpCrmRequestPolicy,
  shape: WorkspaceTableShape,
  alias: string,
  capability: ErpCrmCapability,
) => {
  const grant = requireErpCapability(policy, capability);
  const parameter =
    'hypertech_' +
    alias.replace(/[^a-zA-Z0-9]/g, '_') +
    '_' +
    capability.replace(/[^a-z]/g, '_');
  const organization = `${quote(alias)}."sourceOrganizationId" = :${parameter}_org`;
  const parameters: Record<string, unknown> = {
    [parameter + '_org']: policy.access.organizationId,
  };
  if (!shape.columnNames.includes('sourceOrganizationId')) {
    throw new ForbiddenException(
      'Native CRM schema does not match the installed application.',
    );
  }
  if (shape.nameSingular === CAMPAIGN_OBJECT) {
    if (!shape.columnNames.includes('createdByErpEmployeeId')) {
      throw new ForbiddenException('Native CRM campaign ownership is missing.');
    }
    return {
      sql:
        organization +
        (grant.scope === 'ORGANIZATION'
          ? ''
          : ` AND ${quote(alias)}."createdByErpEmployeeId" = ANY(:${parameter}_owners::text[])`),
      parameters: {
        ...parameters,
        [parameter + '_owners']: grant.ownerEmployeeIds,
      },
    };
  }
  const visibility = nativeCustomerVisibility(policy, capability);
  if (shape.nameSingular === CUSTOMER_OBJECT) {
    return {
      sql:
        organization +
        (visibility.all
          ? ''
          : ` AND ${quote(alias)}."id" = ANY(:${parameter}_ids::uuid[])`),
      parameters: {
        ...parameters,
        [parameter + '_ids']: visibility.keys.map((key) =>
          sourceCustomerId(key, policy.workspaceId),
        ),
      },
    };
  }
  if (shape.nameSingular === CONSENT_EVENT_OBJECT) {
    if (!shape.columnNames.includes('customerId')) {
      throw new ForbiddenException(
        'Native consent customer relation is missing.',
      );
    }
    const contact = `${quote(shape.schemaName)}.${quote(computeTableName(CUSTOMER_OBJECT, true))}`;
    return {
      sql:
        organization +
        ` AND EXISTS (SELECT 1 FROM ${contact} AS "hypertech_event_customer" WHERE "hypertech_event_customer"."id" = ${quote(alias)}."customerId" AND "hypertech_event_customer"."sourceOrganizationId" = :${parameter}_org AND "hypertech_event_customer"."deletedAt" IS NULL` +
        (visibility.all
          ? ')'
          : ` AND "hypertech_event_customer"."id" = ANY(:${parameter}_ids::uuid[]))`),
      parameters: {
        ...parameters,
        [parameter + '_ids']: visibility.keys.map((key) =>
          sourceCustomerId(key, policy.workspaceId),
        ),
      },
    };
  }
  throw new ForbiddenException('Unsupported native CRM object.');
};
export const requireNativeMarketingWrite = (
  policy: ErpCrmRequestPolicy,
  shape: WorkspaceTableShape,
  action: 'create' | 'update' | 'delete',
  records: Record<string, unknown>[],
) => {
  const intent = marketingMutationStorage.getStore();
  if (
    !intent &&
    shape.nameSingular === CUSTOMER_OBJECT &&
    action === 'update' &&
    policy.customerDetailsUpdate
  ) {
    requireErpCapability(policy, 'crm-customer:read');
    requireErpCapability(policy, 'crm-customer:update');
    const editable = new Set(['preferredName', 'customerNotes']);
    if (
      records.some((record) =>
        Object.keys(record).some((name) => !editable.has(name)),
      )
    ) {
      throw new ForbiddenException(
        'Source and consent fields use their dedicated CRM actions.',
      );
    }
    if (
      records.some((record) =>
        Object.values(record).some(
          (value) =>
            value !== null &&
            (typeof value !== 'string' || value.length > 10000),
        ),
      )
    ) {
      throw new ForbiddenException(
        'Customer details must contain bounded text.',
      );
    }
    return { policy, capability: 'crm-customer:update' as const };
  }
  if (action === 'delete' || !intent) {
    throw new ForbiddenException(
      'Use the Hypertech CRM customer and campaign actions.',
    );
  }
  for (const record of records) {
    if (
      'sourceOrganizationId' in record &&
      record.sourceOrganizationId !== policy.access.organizationId
    ) {
      throw new ForbiddenException('Native CRM organization cannot change.');
    }
  }
  if (shape.nameSingular === CAMPAIGN_OBJECT) {
    if (intent !== 'SAVE_CAMPAIGN') {
      throw new ForbiddenException();
    }
    requireErpCapability(policy, 'crm-campaign:read');
    requireErpCapability(policy, 'crm-customer:read');
    requireErpCapability(policy, 'crm-campaign:manage');
    for (const record of records) {
      if (
        'createdByErpEmployeeId' in record &&
        (action !== 'create' ||
          record.createdByErpEmployeeId !== policy.access.employeeId)
      ) {
        throw new ForbiddenException('Campaign creator is immutable.');
      }
    }
    return { policy, capability: 'crm-campaign:manage' as const };
  }
  if (shape.nameSingular === CUSTOMER_OBJECT && intent === 'SYNC_CUSTOMERS') {
    requireSync(policy);
    const protectedFields = [
      'preferredName',
      'customerNotes',
      'consentState',
      'consentVersion',
      'evidenceAt',
      'evidenceReference',
    ];
    if (
      records.some((record) => protectedFields.some((key) => key in record))
    ) {
      throw new ForbiddenException('Source sync cannot overwrite consent.');
    }
    return {
      policy,
      capability: (action === 'create'
        ? 'crm-customer:create'
        : 'crm-customer:update') as ErpCrmCapability,
    };
  }
  if (
    intent !== 'RECORD_CONSENT' ||
    (shape.nameSingular === CONSENT_EVENT_OBJECT && action !== 'create') ||
    (shape.nameSingular === CUSTOMER_OBJECT && action !== 'update')
  ) {
    throw new ForbiddenException();
  }
  requireErpCapability(policy, 'crm-customer:read');
  requireErpCapability(policy, 'crm-customer:update');
  requireErpCapability(policy, 'crm-campaign:manage');
  if (shape.nameSingular === CUSTOMER_OBJECT) {
    const allowed = new Set([
      'consentState',
      'consentVersion',
      'evidenceAt',
      'evidenceReference',
    ]);
    if (
      records.some((record) =>
        Object.keys(record).some((key) => !allowed.has(key)),
      )
    ) {
      throw new ForbiddenException(
        'Consent action cannot alter source fields.',
      );
    }
  }
  if (shape.nameSingular === CONSENT_EVENT_OBJECT) {
    const visibility = nativeCustomerVisibility(policy, 'consent');
    for (const record of records) {
      if (
        typeof record.sourceKey !== 'string' ||
        typeof record.customerId !== 'string' ||
        sourceCustomerId(record.sourceKey, policy.workspaceId) !==
          record.customerId ||
        (!visibility.all && !visibility.keys.includes(record.sourceKey)) ||
        record.actorErpEmployeeId !== policy.access.employeeId
      ) {
        throw new ForbiddenException(
          'Consent evidence is outside the current ERP scope.',
        );
      }
    }
  }
  return { policy, capability: 'crm-customer:update' as const };
};
