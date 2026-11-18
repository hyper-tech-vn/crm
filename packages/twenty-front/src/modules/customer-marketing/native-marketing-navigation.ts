import { v5 as uuidV5 } from 'uuid';

export const NATIVE_CUSTOMERS_PATH = '/objects/hypertechCustomers';
export const nativeMarketingViewPath = (
  kind: 'customers' | 'campaigns',
  workspaceId?: string,
) => {
  const path =
    kind === 'customers' ? NATIVE_CUSTOMERS_PATH : NATIVE_CAMPAIGNS_PATH;
  return workspaceId
    ? `${path}?viewId=${uuidV5(`hypertech:native-view:${kind}`, workspaceId)}`
    : path;
};
export const NATIVE_CAMPAIGNS_PATH = '/objects/hypertechCampaigns';
export const nativeMarketingAudiencePath = (draft: {
  shopId: string;
  kind: 'PROMOTION' | 'CONSENT_REQUEST';
  minOrders: number;
  maxOrders: number | null;
}) => {
  const filters = new URLSearchParams();
  filters.set('filter[sourceShopId][IS]', draft.shopId);
  filters.set(
    'filter[consentState][IS][0]',
    draft.kind === 'PROMOTION' ? 'SUBSCRIBED' : 'UNKNOWN',
  );
  filters.set('filter[emailValid][IS]', 'true');
  filters.set(
    'filter[purchaseCount][GREATER_THAN_OR_EQUAL]',
    String(draft.minOrders),
  );
  if (draft.maxOrders !== null) {
    filters.set(
      'filter[purchaseCount][LESS_THAN_OR_EQUAL]',
      String(draft.maxOrders),
    );
  }
  return `${NATIVE_CUSTOMERS_PATH}?${filters}`;
};
export const nativeMarketingLegacyPath = (
  section: string | undefined,
  recordId: string | undefined,
  workspaceId: string | undefined,
) => {
  if (section === 'campaigns') {
    return recordId && recordId !== 'new'
      ? `/object/hypertechCampaign/${recordId}`
      : nativeMarketingViewPath('campaigns', workspaceId);
  }
  if (recordId && /^[a-f0-9]{32}$/.test(recordId) && workspaceId) {
    return `/object/hypertechCustomer/${uuidV5(recordId, workspaceId)}`;
  }
  return nativeMarketingViewPath('customers', workspaceId);
};
