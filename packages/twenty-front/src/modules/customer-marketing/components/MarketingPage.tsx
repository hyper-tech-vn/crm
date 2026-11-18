import { Navigate, useParams } from 'react-router-dom';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { nativeMarketingLegacyPath } from '@/customer-marketing/native-marketing-navigation';

export const MarketingPage = () => {
  const { section, recordId } = useParams();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  return (
    <Navigate
      replace
      to={nativeMarketingLegacyPath(section, recordId, currentWorkspace?.id)}
    />
  );
};
