import { useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { IconUser, IconFilter, IconMail, IconSettings } from 'twenty-ui/icon';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { NavigationDrawerScrollableContent } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerScrollableContent';
import { getSettingsPath } from 'twenty-shared/utils';
import { SettingsPath } from 'twenty-shared/types';
export const MarketingNavigation = () => {
  const { t } = useLingui();
  const location = useLocation();
  return (
    <NavigationDrawerScrollableContent>
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
      <NavigationDrawerItem
        label={t`Tài khoản`}
        Icon={IconSettings}
        to={getSettingsPath(SettingsPath.ProfilePage)}
      />
    </NavigationDrawerScrollableContent>
  );
};
