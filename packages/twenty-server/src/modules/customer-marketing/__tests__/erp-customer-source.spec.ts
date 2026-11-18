import {
  ErpCustomerSourceClient,
  needsCustomerVisibility,
  parseCustomerVisibility,
} from '../erp-customer-source.client';
const org = '11111111-1111-4111-8111-111111111111';
const empty = { all: false, keys: [] };
const visibility = {
  read: { all: true, keys: [] },
  update: empty,
  export: empty,
  consent: empty,
};
describe('read-only ERP customer source', () => {
  const environment = { ...process.env };
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    process.env.ERP_CRM_BASE_URL = 'https://erp-api.hyper-tech.vn';
    process.env.ERP_CRM_ORGANIZATION_ID = org;
    process.env.ERP_CRM_WORKSPACE_ID = org;
    process.env.APP_SECRET = 'local-test-only-secret-value-with-32-characters';
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...environment };
  });
  it('accepts only bounded typed visibility decisions', () => {
    expect(parseCustomerVisibility(visibility)).toEqual(visibility);
    expect(() =>
      parseCustomerVisibility({
        ...visibility,
        read: { all: 'yes', keys: [] },
      }),
    ).toThrow();
    expect(() =>
      parseCustomerVisibility({
        ...visibility,
        read: { all: true, keys: ['invalid'] },
      }),
    ).toThrow();
  });
  it('calls only the fixed ERP source with the private proof and GET semantics', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(visibility), { status: 200 }),
    );
    expect(
      await new ErpCustomerSourceClient().visibility('private-proof'),
    ).toEqual(visibility);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://erp-api.hyper-tech.vn/api/v1/orders/crm-customers/visibility',
    );
    expect(options.headers.Authorization).toBe('Bearer private-proof');
    expect(options.method).toBeUndefined();
    expect(options.body).toBeUndefined();
    expect(options.redirect).toBe('error');
  });
  it('rejects malformed contact pages before source ingestion', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ email: 'buyer@example.test', consent: 'SUBSCRIBED' }],
          nextCursor: null,
          snapshotAt: '2026-11-17T12:00:00Z',
        }),
        { status: 200 },
      ),
    );
    await expect(
      new ErpCustomerSourceClient().contacts('proof', null),
    ).rejects.toThrow('page is invalid');
  });
  it('does not relay ERP provider diagnostics', async () => {
    fetchMock.mockResolvedValue(
      new Response('private database diagnostics', { status: 500 }),
    );
    await expect(
      new ErpCustomerSourceClient().visibility('proof'),
    ).rejects.toThrow('source is unavailable');
  });
  it('loads customer scope for the new UI and native customer relations', () => {
    expect(needsCustomerVisibility('/auth/erp-marketing/customers', null)).toBe(
      true,
    );
    expect(
      needsCustomerVisibility(
        '/graphql',
        'query { hypertechCustomers { edges { node { id } } } }',
      ),
    ).toBe(true);
    expect(
      needsCustomerVisibility(
        '/graphql',
        'query { hypertechCampaigns { edges { node { id } } } }',
      ),
    ).toBe(false);
    expect(
      needsCustomerVisibility('/auth/erp-marketing/campaigns', null, 'GET'),
    ).toBe(false);
    expect(
      needsCustomerVisibility('/auth/erp-marketing/campaigns', null, 'POST'),
    ).toBe(true);
    expect(
      needsCustomerVisibility(
        '/auth/erp-marketing/campaigns/11111111-1111-4111-8111-111111111111/audience',
        null,
      ),
    ).toBe(true);
  });
});
