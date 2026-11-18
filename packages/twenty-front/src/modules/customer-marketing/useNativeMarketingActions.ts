import { useLingui } from '@lingui/react/macro';
import { useOpenRoutedPageInSidePanel } from '@/side-panel/routing/hooks/useOpenRoutedPageInSidePanel';
import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import { type MarketingCapabilities } from '@/customer-marketing/marketing-types';
import {
  IconRefresh,
  IconMail,
  IconCheck,
  IconShoppingBag,
  IconDownload,
} from 'twenty-ui/icon';
import { authProvidersState } from '@/client-config/states/authProvidersState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useNativeMarketingActions = (
  objectName: string,
  recordId?: string,
) => {
  const { t } = useLingui();
  const enabled =
    useAtomStateValue(authProvidersState).clerk &&
    ['hypertechCustomer', 'hypertechCampaign'].includes(objectName);
  const capabilities = useMarketingResource<MarketingCapabilities>(
    enabled ? '/capabilities' : null,
  );
  const { openRoutedPageInSidePanel } = useOpenRoutedPageInSidePanel();
  const open = (action: string, title: string) =>
    openRoutedPageInSidePanel({
      path: `/crm-actions/${action}/${recordId ?? 'new'}`,
      pageTitle: title,
      resetNavigationStack: true,
    });
  if (!enabled) {
    return [];
  }
  return [
    {
      id: 'hypertech-sync',
      section: 'THIS_OBJECT',
      label: t`Đồng bộ khách từ ERP`,
      Icon: IconRefresh,
      isAvailable:
        objectName === 'hypertechCustomer' &&
        !recordId &&
        !!capabilities.data?.syncCustomers,
      onClick: () => open('sync', t`Đồng bộ khách từ ERP`),
    },
    {
      id: 'hypertech-export',
      section: 'THIS_OBJECT',
      label: t`Xuất khách theo shop`,
      Icon: IconDownload,
      isAvailable:
        objectName === 'hypertechCustomer' &&
        !recordId &&
        !!capabilities.data?.exportCustomers,
      onClick: () => open('export', t`Xuất khách theo shop`),
    },
    {
      id: 'hypertech-consent',
      section: 'SELECTION',
      label: t`Ghi nhận quyền nhận email`,
      Icon: IconCheck,
      isAvailable:
        objectName === 'hypertechCustomer' &&
        !!recordId &&
        !!capabilities.data?.updateConsent,
      onClick: () => open('consent', t`Quyền nhận email`),
    },
    {
      id: 'hypertech-orders',
      section: 'SELECTION',
      label: t`Đơn hàng từ ERP`,
      Icon: IconShoppingBag,
      isAvailable: objectName === 'hypertechCustomer' && !!recordId,
      onClick: () => open('orders', t`Đơn hàng từ ERP`),
    },
    {
      id: 'hypertech-campaign',
      section: recordId ? 'SELECTION' : 'THIS_OBJECT',
      label: recordId ? t`Soạn chiến dịch` : t`Tạo chiến dịch`,
      Icon: IconMail,
      isAvailable:
        objectName === 'hypertechCampaign' &&
        (!!recordId || !!capabilities.data?.manageCampaigns),
      onClick: () => open('campaign', t`Chiến dịch`),
    },
  ]
    .filter((action) => action.isAvailable)
    .map((action) => ({ ...action, keepSidePanelOpen: true }));
};
