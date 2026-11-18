import { renderHook } from '@testing-library/react';
import { useNativeMarketingActions } from '@/customer-marketing/useNativeMarketingActions';
const mockOpen = jest.fn();
let mockCapabilities = {
  syncCustomers: false,
  exportCustomers: false,
  updateConsent: false,
  manageCampaigns: false,
};
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ clerk: true }),
}));
jest.mock('@/customer-marketing/useMarketingResource', () => ({
  useMarketingResource: () => ({ data: mockCapabilities }),
}));
jest.mock('@/side-panel/routing/hooks/useOpenRoutedPageInSidePanel', () => ({
  useOpenRoutedPageInSidePanel: () => ({ openRoutedPageInSidePanel: mockOpen }),
}));
it('hides writes without ERP capability and keeps customer order lookup', () => {
  const { result } = renderHook(() =>
    useNativeMarketingActions('hypertechCustomer', 'native-id'),
  );
  expect(result.current.map((action) => action.id)).toEqual([
    'hypertech-orders',
  ]);
});
it('opens an authorized operation in the native routed side panel', () => {
  mockCapabilities = {
    syncCustomers: true,
    exportCustomers: true,
    updateConsent: true,
    manageCampaigns: true,
  };
  const { result } = renderHook(() =>
    useNativeMarketingActions('hypertechCustomer', 'native-id'),
  );
  const action = result.current.find((item) => item.id === 'hypertech-consent');
  expect(action?.keepSidePanelOpen).toBe(true);
  action?.onClick();
  expect(mockOpen).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/crm-actions/consent/native-id',
      resetNavigationStack: true,
    }),
  );
});
it('does not contribute marketing actions to unrelated native objects', () => {
  const { result } = renderHook(() => useNativeMarketingActions('company'));
  expect(result.current).toEqual([]);
});
