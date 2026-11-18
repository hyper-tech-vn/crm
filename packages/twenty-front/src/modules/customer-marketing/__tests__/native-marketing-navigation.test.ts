import { v5 as uuidV5 } from 'uuid';
import {
  nativeMarketingAudiencePath,
  nativeMarketingLegacyPath,
  nativeMarketingViewPath,
} from '@/customer-marketing/native-marketing-navigation';
const WORKSPACE_ID = '99250470-05df-41cb-9b6c-ce48f3c225d2';
it('preserves old record bookmarks using the native record identity', () => {
  const key = '0123456789abcdef0123456789abcdef';
  expect(nativeMarketingLegacyPath('customers', key, WORKSPACE_ID)).toBe(
    `/object/hypertechCustomer/${uuidV5(key, WORKSPACE_ID)}`,
  );
  expect(nativeMarketingLegacyPath('campaigns', 'draft-id', WORKSPACE_ID)).toBe(
    '/object/hypertechCampaign/draft-id',
  );
  expect(nativeMarketingLegacyPath('segments', undefined, WORKSPACE_ID)).toBe(
    nativeMarketingViewPath('customers', WORKSPACE_ID),
  );
});
it.each([
  ['PROMOTION', 'SUBSCRIBED', 1],
  ['CONSENT_REQUEST', 'UNKNOWN', null],
] as const)(
  'opens the native audience with consent, shop and purchase filters for %s',
  (kind, consent, maxOrders) => {
    const path = nativeMarketingAudiencePath({
      shopId: 'shop-id',
      kind,
      minOrders: 1,
      maxOrders,
    });
    const url = new URL(path, 'https://crm.example.com');
    expect(url.pathname).toBe('/objects/hypertechCustomers');
    expect(url.searchParams.get('filter[consentState][IS][0]')).toBe(consent);
    expect(url.searchParams.get('filter[sourceShopId][IS]')).toBe('shop-id');
    expect(url.searchParams.get('filter[emailValid][IS]')).toBe('true');
    expect(
      url.searchParams.get('filter[purchaseCount][GREATER_THAN_OR_EQUAL]'),
    ).toBe('1');
    expect(
      url.searchParams.get('filter[purchaseCount][LESS_THAN_OR_EQUAL]'),
    ).toBe(maxOrders === null ? null : '1');
  },
);
