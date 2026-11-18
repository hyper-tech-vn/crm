import { ForbiddenException } from '@nestjs/common';
import { type ErpCrmRequestPolicy } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import {
  marketingMutationStorage,
  sourceCustomerId,
  validateConsentChange,
  validateDraft,
} from '../customer-marketing.policy';
import {
  nativeMarketingPredicate,
  requireNativeMarketingWrite,
} from '../native-marketing-record-policy';
import {
  CAMPAIGN_OBJECT,
  CONSENT_EVENT_OBJECT,
  CUSTOMER_OBJECT,
} from '../customer-marketing.types';
const org = '11111111-1111-4111-8111-111111111111';
const employee = '22222222-2222-4222-8222-222222222222';
const workspace = '33333333-3333-4333-8333-333333333333';
const key = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const policy = (): ErpCrmRequestPolicy => {
  const grant = {
    scope: 'ORGANIZATION' as const,
    ownerEmployeeIds: [employee],
    ownerWorkspaceMemberIds: [],
  };
  return {
    access: {
      version: 1,
      organizationId: org,
      employeeId: employee,
      instanceAdministration: false,
      permissions: {},
    },
    userId: 'user',
    workspaceId: workspace,
    workspaceMemberId: employee,
    databaseSchema: 'crm_test',
    grants: {
      'crm:access': grant,
      'crm:admin': grant,
      'crm-customer:read': grant,
      'crm-customer:create': grant,
      'crm-customer:update': grant,
      'crm-customer:export': grant,
      'crm-campaign:read': grant,
      'crm-campaign:manage': grant,
    },
    customerVisibility: {
      read: { all: false, keys: [key] },
      update: { all: false, keys: [] },
      export: { all: false, keys: [] },
      consent: { all: false, keys: [key] },
    },
  };
};
const shape = (nameSingular: string) =>
  ({
    nameSingular,
    schemaName: 'crm_test',
    columnNames: [
      'id',
      'sourceOrganizationId',
      'sourceKey',
      'customerId',
      'createdByErpEmployeeId',
    ],
  }) as WorkspaceTableShape;
it('uses stable workspace-specific customer IDs', () => {
  expect(sourceCustomerId(key, workspace)).toBe(
    sourceCustomerId(key, workspace),
  );
  expect(sourceCustomerId(key, workspace)).not.toBe(sourceCustomerId(key, org));
});
it('intersects source visibility with native customer read and independent export scope', () => {
  const read = nativeMarketingPredicate(
    policy(),
    shape(CUSTOMER_OBJECT),
    'c',
    'crm-customer:read',
  );
  expect(read.sql).toContain('"sourceOrganizationId"');
  expect(Object.values(read.parameters)).toContainEqual([
    sourceCustomerId(key, workspace),
  ]);
  const exporting = nativeMarketingPredicate(
    policy(),
    shape(CUSTOMER_OBJECT),
    'c',
    'crm-customer:export',
  );
  expect(Object.values(exporting.parameters)).toContainEqual([]);
});
it('does not widen an organization grant without a fresh source decision', () => {
  const actor = policy();
  delete actor.customerVisibility;
  expect(() =>
    nativeMarketingPredicate(
      actor,
      shape(CUSTOMER_OBJECT),
      'c',
      'crm-customer:read',
    ),
  ).toThrow(ForbiddenException);
});
it('scopes evidence through the current native customer rather than snapshot owners', () => {
  const result = nativeMarketingPredicate(
    policy(),
    shape(CONSENT_EVENT_OBJECT),
    'e',
    'crm-customer:read',
  );
  expect(result.sql).toContain('EXISTS');
  expect(result.sql).toContain('"_hypertechCustomer"');
  expect(Object.values(result.parameters)).toContainEqual([
    sourceCustomerId(key, workspace),
  ]);
});
it('uses ERP employee ownership for scoped campaigns', () => {
  const actor = policy();
  actor.grants['crm-campaign:read']!.scope = 'SELF';
  const result = nativeMarketingPredicate(
    actor,
    shape(CAMPAIGN_OBJECT),
    'campaign',
    'crm-campaign:read',
  );
  expect(result.sql).toContain('"createdByErpEmployeeId"');
  expect(Object.values(result.parameters)).toContainEqual([employee]);
});
it.each([CUSTOMER_OBJECT, CAMPAIGN_OBJECT, CONSENT_EVENT_OBJECT])(
  'rejects direct writes and deletes even for CRM admin on %s',
  (name) => {
    expect(() =>
      requireNativeMarketingWrite(policy(), shape(name), 'update', []),
    ).toThrow(ForbiddenException);
    expect(() =>
      marketingMutationStorage.run('RECORD_CONSENT', () =>
        requireNativeMarketingWrite(policy(), shape(name), 'delete', []),
      ),
    ).toThrow(ForbiddenException);
  },
);
it('source ingestion cannot overwrite any consent field', () => {
  marketingMutationStorage.run('SYNC_CUSTOMERS', () => {
    expect(() =>
      requireNativeMarketingWrite(policy(), shape(CUSTOMER_OBJECT), 'update', [
        { name: 'buyer@example.test' },
      ]),
    ).not.toThrow();
    expect(() =>
      requireNativeMarketingWrite(policy(), shape(CUSTOMER_OBJECT), 'update', [
        { consentState: 'SUBSCRIBED' },
      ]),
    ).toThrow(ForbiddenException);
  });
});
it('consent updates cannot change source identity or recipient data', () => {
  marketingMutationStorage.run('RECORD_CONSENT', () => {
    expect(() =>
      requireNativeMarketingWrite(policy(), shape(CUSTOMER_OBJECT), 'update', [
        { consentState: 'SUBSCRIBED', consentVersion: 1 },
      ]),
    ).not.toThrow();
    expect(() =>
      requireNativeMarketingWrite(policy(), shape(CUSTOMER_OBJECT), 'update', [
        { name: 'other@example.test' },
      ]),
    ).toThrow(ForbiddenException);
  });
});
it('evidence must match the customer, organization and current ERP actor', () => {
  marketingMutationStorage.run('RECORD_CONSENT', () => {
    const event = {
      sourceOrganizationId: org,
      sourceKey: key,
      customerId: sourceCustomerId(key, workspace),
      actorErpEmployeeId: employee,
    };
    expect(() =>
      requireNativeMarketingWrite(
        policy(),
        shape(CONSENT_EVENT_OBJECT),
        'create',
        [event],
      ),
    ).not.toThrow();
    expect(() =>
      requireNativeMarketingWrite(
        policy(),
        shape(CONSENT_EVENT_OBJECT),
        'create',
        [{ ...event, actorErpEmployeeId: org }],
      ),
    ).toThrow(ForbiddenException);
  });
});
it('requires explicit recent evidence and optimistic versions', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const change = {
    state: 'SUBSCRIBED' as const,
    evidenceAt: '2026-11-17T11:00:00Z',
    evidenceReference: 'External form response 123',
    expectedVersion: 0,
  };
  expect(
    validateConsentChange('UNKNOWN', 0, null, change, now).toISOString(),
  ).toBe(change.evidenceAt.replace('Z', '.000Z'));
  expect(() => validateConsentChange('UNKNOWN', 1, null, change, now)).toThrow(
    'đã thay đổi',
  );
  expect(() =>
    validateConsentChange(
      'UNKNOWN',
      0,
      null,
      { ...change, evidenceAt: '2026-11-17T11:00:00' },
      now,
    ),
  ).toThrow();
  expect(() =>
    validateConsentChange('SUPPRESSED', 0, null, change, now),
  ).toThrow();
  expect(() =>
    validateConsentChange(
      'DECLINED',
      0,
      null,
      { ...change, state: 'PENDING' },
      now,
    ),
  ).toThrow();
});
it('keeps all contacts eligible for explicit zero-purchase segments', () => {
  const draft = {
    shopId: org,
    kind: 'PROMOTION' as const,
    name: 'Offer',
    subject: 'Subject',
    bodyText: 'Body',
    minOrders: 0,
    maxOrders: null,
  };
  expect(() => validateDraft(draft)).not.toThrow();
  expect(() =>
    validateDraft({ ...draft, subject: 'Header\r\ninjection' }),
  ).toThrow();
  expect(() =>
    validateDraft({ ...draft, minOrders: 2, maxOrders: 1 }),
  ).toThrow();
});

it('rejects an all-contact source decision that would widen an initial scoped grant', () => {
  const actor = policy();
  actor.grants['crm-customer:read']!.scope = 'SELF';
  actor.customerVisibility!.read = { all: true, keys: [] };
  expect(() =>
    nativeMarketingPredicate(
      actor,
      shape(CUSTOMER_OBJECT),
      'c',
      'crm-customer:read',
    ),
  ).toThrow('scope changed');
});

it('allows only CRM-owned notes/name through the native customer editor', () => {
  const actor = policy();
  actor.customerDetailsUpdate = true;
  expect(() =>
    requireNativeMarketingWrite(actor, shape(CUSTOMER_OBJECT), 'update', [
      { preferredName: 'Customer name', customerNotes: 'Follow up next month' },
    ]),
  ).not.toThrow();
  expect(() =>
    requireNativeMarketingWrite(actor, shape(CUSTOMER_OBJECT), 'update', [
      { consentState: 'SUBSCRIBED' },
    ]),
  ).toThrow();
  expect(() =>
    requireNativeMarketingWrite(actor, shape(CUSTOMER_OBJECT), 'update', [
      { name: 'other@example.test' },
    ]),
  ).toThrow();
});
