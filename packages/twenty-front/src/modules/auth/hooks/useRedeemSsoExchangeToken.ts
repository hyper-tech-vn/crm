import { isAppEffectRedirectEnabledState } from '@/auth/states/isAppEffectRedirectEnabledState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useAuth } from '@/auth/hooks/useAuth';
import { useIsCurrentLocationOnAWorkspace } from '@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { useMarkSessionActive } from '@/auth/hooks/useMarkSessionActive';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useMutation } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { doNotTranslate } from 'twenty-shared/i18n';
import { useToast } from 'twenty-ui/components/feedback';
import { GetAuthTokensFromSsoExchangeTokenDocument } from '~/generated-metadata/graphql';
import { logError } from '~/utils/logError';

export const useRedeemSsoExchangeToken = () => {
  const { enqueueToast } = useToast();
  const markSessionActive = useMarkSessionActive();
  const { isOnAWorkspace } = useIsCurrentLocationOnAWorkspace();
  const { loadCurrentUser } = useLoadCurrentUser();
  const { navigateAfterMultiWorkspaceSignInUp, getAuthTokensFromLoginToken } =
    useAuth();
  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );
  const setIsAppEffectRedirectEnabled = useSetAtomState(
    isAppEffectRedirectEnabledState,
  );
  const [getAuthTokensFromSsoExchangeToken] = useMutation(
    GetAuthTokensFromSsoExchangeTokenDocument,
  );

  const redeemSsoExchangeToken = useCallback(
    async (ssoExchangeToken: string) => {
      // Keeps PageChangeEffect from consuming returnToPath while the server swaps the session cookie
      setIsAppEffectRedirectEnabled(false);

      try {
        const { data } = await getAuthTokensFromSsoExchangeToken({
          variables: { ssoExchangeToken },
        });

        if (!isDefined(data?.getAuthTokensFromSSOExchangeToken)) {
          throw new Error(
            doNotTranslate('No getAuthTokensFromSSOExchangeToken result'),
          );
        }

        markSessionActive();

        // SSO issues a workspace-agnostic cookie. On a workspace domain,
        // the global sign-in effect is absent, so complete the native
        // workspace selection/verification flow here.
        if (isOnAWorkspace) {
          const { user } = await loadCurrentUser();
          if (isMultiWorkspaceEnabled) {
            await navigateAfterMultiWorkspaceSignInUp(
              user.availableWorkspaces,
              user.email,
            );
          } else {
            const memberships =
              user.availableWorkspaces.availableWorkspacesForSignIn;
            const loginToken =
              memberships.length === 1 ? memberships[0].loginToken : null;
            if (!isDefined(loginToken)) {
              throw new Error(
                doNotTranslate('No unambiguous workspace sign-in token'),
              );
            }
            await getAuthTokensFromLoginToken(loginToken);
          }
        }
      } catch (error: unknown) {
        logError(error);
        enqueueToast({ status: 'error', children: t`Authentication failed` });
      } finally {
        setIsAppEffectRedirectEnabled(true);
      }
    },
    [
      getAuthTokensFromSsoExchangeToken,
      markSessionActive,
      isOnAWorkspace,
      loadCurrentUser,
      navigateAfterMultiWorkspaceSignInUp,
      getAuthTokensFromLoginToken,
      isMultiWorkspaceEnabled,
      setIsAppEffectRedirectEnabled,
      enqueueToast,
    ],
  );

  return { redeemSsoExchangeToken };
};
