import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import {
  erpCrmRequestStorage,
  type ErpCrmRequestPolicy,
} from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { CustomerMarketingSyncService } from '../customer-marketing-sync.service';
import { CustomerMarketingReadService } from '../customer-marketing-read.service';
import { CustomerMarketingConsentService } from '../customer-marketing-consent.service';
import { CustomerMarketingCampaignService } from '../customer-marketing-campaign.service';
import { type ErpCustomerSourceClient } from '../erp-customer-source.client';
import { marketingMutationStorage } from '../customer-marketing.policy';
import {
  buildNativeTestOrm,
  NATIVE_TEST_SCHEMA,
  NATIVE_WORKSPACE,
  prepareNativeTables,
} from './native-marketing-postgres.fixture';
const org = '11111111-1111-4111-8111-111111111111';
const employee = '22222222-2222-4222-8222-222222222222';
const shop = '44444444-4444-4444-8444-444444444444';
const at = '2026-11-17T10:00:00Z';
const contact = (email: string, purchaseCount = 0) => ({
  key: createHash('md5').update(`${org}:${shop}:${email}`).digest('hex'),
  shopId: shop,
  shopName: 'Native test shop',
  channel: 'SHOPIFY',
  email,
  emailValid: true,
  recipientName: 'Source recipient',
  recipientPhone: null,
  country: null,
  orderCount: 1,
  purchaseCount,
  completedCount: 0,
  activeCount: 0,
  firstRecordedAt: at,
  lastRecordedAt: at,
});
const actor = (): ErpCrmRequestPolicy => {
  const grant = {
    scope: 'ORGANIZATION' as const,
    ownerEmployeeIds: [employee],
    ownerWorkspaceMemberIds: [],
  };
  return {
    userId: 'user',
    workspaceId: NATIVE_WORKSPACE,
    workspaceMemberId: employee,
    databaseSchema: NATIVE_TEST_SCHEMA,
    access: {
      version: 1,
      organizationId: org,
      employeeId: employee,
      instanceAdministration: false,
      permissions: {},
    },
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
      read: { all: true, keys: [] },
      update: { all: true, keys: [] },
      export: { all: true, keys: [] },
      consent: { all: true, keys: [] },
    },
  };
};
(process.env.ERP_MARKETING_TEST_DATABASE_URL ? describe : describe.skip)(
  'native Twenty marketing persistence',
  () => {
    let database: DataSource;
    const environment = { ...process.env };
    beforeAll(async () => {
      jest.useRealTimers();
      const url = new URL(process.env.ERP_MARKETING_TEST_DATABASE_URL!);
      if (
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/native_crm_marketing_test'
      ) {
        throw new Error('Use only the isolated native marketing test database');
      }
      process.env.AUTH_CLERK_ENABLED = 'true';
      database = new DataSource({ type: 'postgres', url: url.toString() });
      await database.initialize();
      await prepareNativeTables(database);
    }, 30000);
    afterAll(async () => {
      if (database?.isInitialized) {
        await database.query(`DROP SCHEMA "${NATIVE_TEST_SCHEMA}" CASCADE`);
        await database.destroy();
      }
      process.env = { ...environment };
    });
    beforeEach(async () => {
      await database.query(
        `TRUNCATE "${NATIVE_TEST_SCHEMA}"."hypertechConsentEvent", "${NATIVE_TEST_SCHEMA}"."hypertechCampaign", "${NATIVE_TEST_SCHEMA}"."hypertechCustomer"`,
      );
    });
    const services = () => {
      const orm = buildNativeTestOrm(database);
      const source = { contacts: jest.fn() };
      const read = new CustomerMarketingReadService(orm);
      return {
        orm,
        source,
        read,
        sync: new CustomerMarketingSyncService(
          orm,
          source as unknown as ErpCustomerSourceClient,
        ),
        consent: new CustomerMarketingConsentService(orm),
        campaigns: new CustomerMarketingCampaignService(orm, read),
      };
    };
    it('collects all source emails into Twenty and repeated sync preserves explicit consent', async () => {
      const policy = actor();
      await erpCrmRequestStorage.run({ policy }, async () => {
        const { source, sync, read, consent } = services();
        const first = contact('buyer+tag@example.test');
        const second = contact('buyer@example.test', 2);
        source.contacts.mockResolvedValue({
          items: [first, second],
          nextCursor: null,
          snapshotAt: at,
        });
        expect(await sync.synchronize(policy, 'private-proof', null)).toEqual({
          imported: 2,
          nextCursor: null,
        });
        expect((await read.contacts({})).items).toHaveLength(2);
        expect((await read.record(policy, first.key)).consentState).toBe(
          'UNKNOWN',
        );
        policy.customerDetailsUpdate = true;
        const customerRecord = await read.record(policy, first.key);
        await services().orm.getRepository('hypertechCustomer').update(
          { id: customerRecord.id },
          {
            preferredName: 'Preferred customer name',
            customerNotes: 'CRM-owned follow-up note',
          },
        );
        await expect(
          services()
            .orm.getRepository('hypertechCustomer')
            .executeRaw('SELECT 1', {}),
        ).rejects.toThrow();
        await consent.record(policy, first.key, {
          state: 'SUBSCRIBED',
          evidenceAt: '2026-11-17T11:00:00Z',
          evidenceReference: 'External opt-in form response 123',
          expectedVersion: 0,
        });
        source.contacts.mockResolvedValue({
          items: [
            { ...first, recipientName: 'Updated source recipient' },
            second,
          ],
          nextCursor: null,
          snapshotAt: '2026-11-17T12:00:00Z',
        });
        await sync.synchronize(policy, 'private-proof', null);
        const current = await read.record(policy, first.key);
        expect(current.consentState).toBe('SUBSCRIBED');
        expect(current.consentVersion).toBe(1);
        expect(current.recipientName).toBe('Updated source recipient');
        expect(current.preferredName).toBe('Preferred customer name');
        expect(current.customerNotes).toBe('CRM-owned follow-up note');
        expect((await read.contacts({})).items).toHaveLength(2);
        expect(
          await database.query(
            `SELECT count(*)::int AS count FROM "${NATIVE_TEST_SCHEMA}"."hypertechConsentEvent"`,
          ),
        ).toEqual([{ count: 1 }]);
      });
    });
    it('keeps consent and audit atomic, rejects stale commands and excludes opt-outs immediately', async () => {
      const policy = actor();
      await erpCrmRequestStorage.run({ policy }, async () => {
        const { source, sync, read, consent, campaigns } = services();
        const first = contact('cancelled@example.test');
        source.contacts.mockResolvedValue({
          items: [first],
          nextCursor: null,
          snapshotAt: at,
        });
        await sync.synchronize(policy, 'proof', null);
        const draft = await campaigns.save(policy, {
          shopId: shop,
          kind: 'PROMOTION',
          name: 'Offer',
          subject: 'Subject',
          bodyText: 'Body',
          minOrders: 0,
          maxOrders: null,
        });
        expect((await campaigns.audience(draft.id)).eligibleContacts).toBe(0);
        await consent.record(policy, first.key, {
          state: 'SUBSCRIBED',
          evidenceAt: '2026-11-17T11:00:00Z',
          evidenceReference: 'External opt-in response 123',
          expectedVersion: 0,
        });
        expect((await campaigns.audience(draft.id)).eligibleContacts).toBe(1);
        await expect(
          consent.record(policy, first.key, {
            state: 'DECLINED',
            evidenceAt: '2026-11-17T11:01:00Z',
            evidenceReference: 'Other response 456',
            expectedVersion: 0,
          }),
        ).rejects.toThrow('đã thay đổi');
        await database.query(
          `ALTER TABLE "${NATIVE_TEST_SCHEMA}"."hypertechConsentEvent" ADD CONSTRAINT reject_test_optout CHECK ("nextState" <> 'UNSUBSCRIBED')`,
        );
        await expect(
          consent.record(policy, first.key, {
            state: 'UNSUBSCRIBED',
            evidenceAt: '2026-11-17T11:02:00Z',
            evidenceReference: 'Unsubscribe response 789',
            expectedVersion: 1,
          }),
        ).rejects.toThrow();
        expect((await read.record(policy, first.key)).consentState).toBe(
          'SUBSCRIBED',
        );
        expect((await read.record(policy, first.key)).consentVersion).toBe(1);
        await database.query(
          `ALTER TABLE "${NATIVE_TEST_SCHEMA}"."hypertechConsentEvent" DROP CONSTRAINT reject_test_optout`,
        );
        await consent.record(policy, first.key, {
          state: 'UNSUBSCRIBED',
          evidenceAt: '2026-11-17T11:03:00Z',
          evidenceReference: 'Unsubscribe response 999',
          expectedVersion: 1,
        });
        expect((await campaigns.audience(draft.id)).eligibleContacts).toBe(0);
      });
    });
    it('serializes concurrent consent commands without duplicate audit events', async () => {
      const policy = actor();
      await erpCrmRequestStorage.run({ policy }, async () => {
        const { source, sync, consent, read } = services();
        const first = contact('race@example.test');
        source.contacts.mockResolvedValue({
          items: [first],
          nextCursor: null,
          snapshotAt: at,
        });
        await sync.synchronize(policy, 'proof', null);
        const outcomes = await Promise.allSettled([
          consent.record(policy, first.key, {
            state: 'SUBSCRIBED',
            evidenceAt: '2026-11-17T11:00:00Z',
            evidenceReference: 'External positive response 123',
            expectedVersion: 0,
          }),
          consent.record(policy, first.key, {
            state: 'DECLINED',
            evidenceAt: '2026-11-17T11:00:00Z',
            evidenceReference: 'External negative response 456',
            expectedVersion: 0,
          }),
        ]);
        expect(
          outcomes.filter((outcome) => outcome.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
          outcomes.filter((outcome) => outcome.status === 'rejected'),
        ).toHaveLength(1);
        expect((await read.record(policy, first.key)).consentVersion).toBe(1);
        expect(
          await database.query(
            `SELECT count(*)::int AS count FROM "${NATIVE_TEST_SCHEMA}"."hypertechConsentEvent"`,
          ),
        ).toEqual([{ count: 1 }]);
      });
    });
    it('keeps native draft ownership and optimistic versions independent from customer scope', async () => {
      const policy = actor();
      await erpCrmRequestStorage.run({ policy }, async () => {
        const { source, sync, campaigns } = services();
        source.contacts.mockResolvedValue({
          items: [contact('draft@example.test', 1)],
          nextCursor: null,
          snapshotAt: at,
        });
        await sync.synchronize(policy, 'proof', null);
        const input = {
          shopId: shop,
          kind: 'CONSENT_REQUEST' as const,
          name: 'Invite',
          subject: 'Subject',
          bodyText: 'Body',
          minOrders: 0,
          maxOrders: null,
        };
        const draft = await campaigns.save(policy, input);
        expect((await campaigns.list({})).items).toHaveLength(1);
        expect(
          (
            await campaigns.save(
              policy,
              { ...input, subject: 'Updated' },
              draft.id,
              1,
            )
          ).version,
        ).toBe(2);
        await expect(
          campaigns.save(policy, input, draft.id, 1),
        ).rejects.toThrow('đã thay đổi');
        const outside = actor();
        outside.grants['crm-campaign:read'] = {
          scope: 'SELF',
          ownerEmployeeIds: [org],
          ownerWorkspaceMemberIds: [],
        };
        await erpCrmRequestStorage.run({ policy: outside }, async () => {
          expect((await campaigns.list({})).items).toHaveLength(0);
          await expect(campaigns.record(draft.id)).rejects.toThrow(
            'Không tìm thấy',
          );
        });
      });
    });
    it('applies independent source scope before native lists, counts, export and mutation', async () => {
      const policy = actor();
      const { source, sync, read, consent } = services();
      const first = contact('first@example.test');
      const second = contact('outside@example.test');
      source.contacts.mockResolvedValue({
        items: [first, second],
        nextCursor: null,
        snapshotAt: at,
      });
      await erpCrmRequestStorage.run({ policy }, () =>
        sync.synchronize(policy, 'proof', null),
      );
      policy.customerVisibility = {
        read: { all: false, keys: [first.key] },
        update: { all: false, keys: [] },
        export: { all: false, keys: [] },
        consent: { all: false, keys: [] },
      };
      await erpCrmRequestStorage.run({ policy }, async () => {
        expect((await read.contacts({})).items.map((row) => row.email)).toEqual(
          [first.email],
        );
        policy.customerDetailsUpdate = true;
        const editableRecord = await read.record(policy, first.key);
        const write = await services()
          .orm.getRepository('hypertechCustomer')
          .update(
            { id: editableRecord.id },
            { customerNotes: 'must remain blocked' },
          );
        expect(write.affected).toBe(0);
        expect((await read.record(policy, first.key)).customerNotes).toBe(
          editableRecord.customerNotes,
        );
        await expect(read.record(policy, second.key)).rejects.toThrow(
          'Không tìm thấy',
        );
        expect(
          (await read.exportContacts(policy, { shopId: shop })).items,
        ).toHaveLength(0);
        await expect(
          consent.record(policy, first.key, {
            state: 'SUBSCRIBED',
            evidenceAt: '2026-11-17T11:00:00Z',
            evidenceReference: 'External form response 123',
            expectedVersion: 0,
          }),
        ).rejects.toThrow('ngoài phạm vi');
        await expect(
          marketingMutationStorage.run('SYNC_CUSTOMERS', () =>
            services()
              .orm.getRepository('hypertechCustomer')
              .update({}, { consentState: 'SUBSCRIBED' }),
          ),
        ).rejects.toThrow();
      });
    });
  },
);
