import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { nativeMarketingViewPath } from '@/customer-marketing/native-marketing-navigation';
import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import { type MarketingCapabilities } from '@/customer-marketing/marketing-types';
import { useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import {
  IconUser,
  IconBuildingSkyscraper,
  IconMail,
  IconSettings,
  IconSettingsAutomation,
} from 'twenty-ui/icon';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { NavigationDrawerScrollableContent } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerScrollableContent';
import { getSettingsPath } from 'twenty-shared/utils';
import { AppPath, SettingsPath } from 'twenty-shared/types';
export const MarketingNavigation = () => {
  const { t } = useLingui();
  const location = useLocation();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const capabilities =
    useMarketingResource<MarketingCapabilities>('/capabilities');
  return (
    <NavigationDrawerScrollableContent>
      <NavigationDrawerItem
        label={t`Công ty`}
        Icon={IconBuildingSkyscraper}
        to="/objects/companies"
        active={
          location.pathname === '/objects/companies' ||
          location.pathname.startsWith('/object/company/')
        }
      />
      <NavigationDrawerItem
        label={t`Khách hàng`}
        Icon={IconUser}
        to={nativeMarketingViewPath('customers', currentWorkspace?.id)}
        active={
          location.pathname.startsWith('/objects/hypertechCustomers') ||
          location.pathname.startsWith('/object/hypertechCustomer/')
        }
      />
      <NavigationDrawerItem
        label={t`Chiến dịch`}
        Icon={IconMail}
        to={nativeMarketingViewPath('campaigns', currentWorkspace?.id)}
        active={
          location.pathname.startsWith('/objects/hypertechCampaigns') ||
          location.pathname.startsWith('/object/hypertechCampaign/')
        }
      />
      {capabilities.data?.manageWorkflows && (
        <NavigationDrawerItem
          label={t`Quy trình`}
          Icon={IconSettingsAutomation}
          to={AppPath.WorkflowIndexPage}
          active={location.pathname.startsWith(AppPath.WorkflowIndexPage)}
        />
      )}
      <NavigationDrawerItem
        label={t`Tài khoản`}
        Icon={IconSettings}
        to={getSettingsPath(SettingsPath.ProfilePage)}
      />
    </NavigationDrawerScrollableContent>
  );
};
