import { renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';

import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { isAppEffectRedirectEnabledState } from '@/auth/states/isAppEffectRedirectEnabledState';
import { useRedeemSsoExchangeToken } from '@/auth/hooks/useRedeemSsoExchangeToken';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { clearSessionGeneration } from '@/auth/utils/clearSessionGeneration';
import { getSessionGeneration } from '@/auth/utils/getSessionGeneration';
import { logError } from '~/utils/logError';

import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

const mockGetAuthTokensFromSsoExchangeToken = jest.fn();
const mockLoadCurrentUser = jest.fn();
const mockNavigateAfterSignIn = jest.fn();
const mockGetWorkspaceAuthTokens = jest.fn();
let mockIsOnAWorkspace = true;

jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: () => ({
    isOnAWorkspace: mockIsOnAWorkspace,
  }),
}));
jest.mock('@/users/hooks/useLoadCurrentUser', () => ({
  useLoadCurrentUser: () => ({ loadCurrentUser: mockLoadCurrentUser }),
}));
jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    navigateAfterMultiWorkspaceSignInUp: mockNavigateAfterSignIn,
    getAuthTokensFromLoginToken: mockGetWorkspaceAuthTokens,
  }),
}));

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: () => [mockGetAuthTokensFromSsoExchangeToken],
}));

const mockEnqueueToast = jest.fn();

jest.mock('twenty-ui/components/feedback', () => ({
  ...jest.requireActual('twenty-ui/components/feedback'),
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));

jest.mock('~/utils/logError');

const renderHooks = () => {
  const { result } = renderHook(() => useRedeemSsoExchangeToken(), {
    wrapper: ({ children }) => JotaiProvider({ store: jotaiStore, children }),
  });

  return { result };
};

const freshTokenPair = {
  accessOrWorkspaceAgnosticToken: {
    token: 'fresh-access-token',
    expiresAt: '2100-01-01T00:00:00.000Z',
  },
  refreshToken: {
    token: 'fresh-refresh-token',
    expiresAt: '2100-01-01T00:00:00.000Z',
  },
};

describe('useRedeemSsoExchangeToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOnAWorkspace = true;
    mockLoadCurrentUser.mockResolvedValue({
      user: {
        availableWorkspaces: {
          availableWorkspacesForSignIn: [
            { loginToken: 'workspace-login-token' },
          ],
        },
        email: 'admin@example.com',
      },
    });
    mockNavigateAfterSignIn.mockResolvedValue(undefined);
    localStorage.clear();
    clearSessionGeneration();
    resetJotaiStore();
    jotaiStore.set(isMultiWorkspaceEnabledState.atom, false);

    mockGetAuthTokensFromSsoExchangeToken.mockResolvedValue({
      data: {
        getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair },
      },
    });
  });

  it('should disable the redirect effect while exchanging and restore it after', async () => {
    const redirectFlagsAtExchangeTime: unknown[] = [];

    mockGetAuthTokensFromSsoExchangeToken.mockImplementation(() => {
      redirectFlagsAtExchangeTime.push(
        jotaiStore.get(isAppEffectRedirectEnabledState.atom),
      );

      return Promise.resolve({
        data: { getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair } },
      });
    });

    const { result } = renderHooks();

    await result.current.redeemSsoExchangeToken('sso-exchange-token');

    expect(redirectFlagsAtExchangeTime).toEqual([false]);
    expect(jotaiStore.get(isAppEffectRedirectEnabledState.atom)).toBe(true);
  });

  // The cookie is httpOnly, so nothing else tells the client it is signed in.
  it('should mark the session active once the exchange succeeds', async () => {
    const { result } = renderHooks();

    await result.current.redeemSsoExchangeToken('sso-exchange-token');

    expect(jotaiStore.get(isCookieAuthActiveState.atom)).toBe(true);
    expect(getSessionGeneration()).not.toBeNull();
  });

  it('loads the authenticated user and enters native workspace verification on a workspace domain', async () => {
    const { result } = renderHooks();
    await result.current.redeemSsoExchangeToken('sso-exchange-token');
    expect(mockLoadCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockGetWorkspaceAuthTokens).toHaveBeenCalledWith(
      'workspace-login-token',
    );
    expect(mockNavigateAfterSignIn).not.toHaveBeenCalled();
  });

  it('uses domain navigation for multi-workspace deployments', async () => {
    jotaiStore.set(isMultiWorkspaceEnabledState.atom, true);
    const { result } = renderHooks();
    await result.current.redeemSsoExchangeToken('sso-exchange-token');
    expect(mockNavigateAfterSignIn).toHaveBeenCalledTimes(1);
    expect(mockGetWorkspaceAuthTokens).not.toHaveBeenCalled();
  });

  it('refuses to guess a workspace or automatically enroll an account', async () => {
    mockLoadCurrentUser.mockResolvedValueOnce({
      user: {
        availableWorkspaces: { availableWorkspacesForSignIn: [] },
        email: 'admin@example.com',
      },
    });
    const { result } = renderHooks();
    await result.current.redeemSsoExchangeToken('sso-exchange-token');
    expect(mockGetWorkspaceAuthTokens).not.toHaveBeenCalled();
    expect(mockEnqueueToast).toHaveBeenCalledWith({
      status: 'error',
      children: 'Authentication failed',
    });
  });

  it('leaves central-domain workspace selection to the existing global effect', async () => {
    mockIsOnAWorkspace = false;
    const { result } = renderHooks();
    await result.current.redeemSsoExchangeToken('sso-exchange-token');
    expect(mockLoadCurrentUser).not.toHaveBeenCalled();
    expect(mockNavigateAfterSignIn).not.toHaveBeenCalled();
  });

  it('should leave the session inactive when the exchange fails', async () => {
    mockGetAuthTokensFromSsoExchangeToken.mockRejectedValueOnce(
      new Error('Invalid SSO exchange token'),
    );

    const { result } = renderHooks();

    await result.current.redeemSsoExchangeToken('sso-exchange-token');

    expect(jotaiStore.get(isCookieAuthActiveState.atom)).toBe(false);
    expect(getSessionGeneration()).toBeNull();
  });

  it('should toast when redemption fails', async () => {
    mockGetAuthTokensFromSsoExchangeToken.mockRejectedValueOnce(
      new Error('Invalid SSO exchange token'),
    );

    const { result } = renderHooks();

    await result.current.redeemSsoExchangeToken('sso-exchange-token');

    expect(mockEnqueueToast).toHaveBeenCalledWith({
      status: 'error',
      children: 'Authentication failed',
    });
    expect(jotaiStore.get(isAppEffectRedirectEnabledState.atom)).toBe(true);
  });

  it('reports a missing exchange result without showing technical details', async () => {
    mockGetAuthTokensFromSsoExchangeToken.mockResolvedValueOnce({ data: {} });

    const { result } = renderHooks();

    await result.current.redeemSsoExchangeToken('sso-exchange-token');

    expect(jest.mocked(logError)).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'No getAuthTokensFromSSOExchangeToken result',
      }),
    );
    expect(mockEnqueueToast).toHaveBeenCalledWith({
      status: 'error',
      children: 'Authentication failed',
    });
  });
});
