import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import { type MarketingCapabilities } from '@/customer-marketing/marketing-types';
import { useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import {
  IconUser,
  IconBuildingSkyscraper,
  IconFilter,
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
        to="/marketing/customers"
        active={location.pathname.startsWith('/marketing/customers')}
      />
      <NavigationDrawerItem
        label={t`Phân nhóm khách`}
        Icon={IconFilter}
        to="/marketing/segments"
        active={location.pathname.startsWith('/marketing/segments')}
      />
      <NavigationDrawerItem
        label={t`Chiến dịch`}
        Icon={IconMail}
        to="/marketing/campaigns"
        active={location.pathname.startsWith('/marketing/campaigns')}
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
