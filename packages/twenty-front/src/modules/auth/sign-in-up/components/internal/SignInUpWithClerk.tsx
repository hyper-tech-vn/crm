import { useLingui } from '@lingui/react/macro';
import { MainButton } from 'twenty-ui/components/input';

import { authProvidersState } from '@/client-config/states/authProvidersState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

import { SignInUpSeparator } from './SignInUpSeparator';
import { StyledSsoButtonContainer } from './SignInUpSsoButtonStyles';

export const SignInUpWithClerk = () => {
  const { t } = useLingui();
  const authProviders = useAtomStateValue(authProvidersState);

  if (!authProviders.clerk) {
    return null;
  }

  return (
    <>
      <StyledSsoButtonContainer>
        <MainButton
          fullWidth
          onClick={() =>
            window.location.assign(`${REACT_APP_SERVER_BASE_URL}/auth/clerk`)
          }
        >
          {t`Sign in`}
        </MainButton>
      </StyledSsoButtonContainer>
      <SignInUpSeparator />
    </>
  );
};
