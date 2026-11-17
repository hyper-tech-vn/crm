import { render } from '@testing-library/react';
import { SignInUpSsoExchangeTokenEffect } from '@/auth/sign-in-up/components/internal/SignInUpSsoExchangeTokenEffect';

const mockRedeemSsoExchangeToken = jest.fn();
jest.mock('@/auth/hooks/useRedeemSsoExchangeToken', () => ({
  useRedeemSsoExchangeToken: () => ({
    redeemSsoExchangeToken: mockRedeemSsoExchangeToken,
  }),
}));

describe('SignInUpSsoExchangeTokenEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(
      {},
      '',
      '/welcome?returnToPath=%2Fobjects%2Fcompanies#ssoExchangeToken=test-exchange',
    );
  });

  it('waits for public client configuration, then exchanges and removes the one-time credential', () => {
    const { rerender } = render(
      <SignInUpSsoExchangeTokenEffect enabled={false} />,
    );
    expect(mockRedeemSsoExchangeToken).not.toHaveBeenCalled();
    expect(window.location.hash).toContain('ssoExchangeToken');
    rerender(<SignInUpSsoExchangeTokenEffect enabled />);
    expect(mockRedeemSsoExchangeToken).toHaveBeenCalledWith('test-exchange');
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?returnToPath=%2Fobjects%2Fcompanies');
  });

  it('does not redeem again after a remount or client configuration refresh', () => {
    const first = render(<SignInUpSsoExchangeTokenEffect enabled />);
    first.unmount();
    render(<SignInUpSsoExchangeTokenEffect enabled />);
    expect(mockRedeemSsoExchangeToken).toHaveBeenCalledTimes(1);
  });

  it('leaves normal sign-in without a callback credential unchanged', () => {
    window.history.replaceState({}, '', '/welcome');
    render(<SignInUpSsoExchangeTokenEffect enabled />);
    expect(mockRedeemSsoExchangeToken).not.toHaveBeenCalled();
  });
});
