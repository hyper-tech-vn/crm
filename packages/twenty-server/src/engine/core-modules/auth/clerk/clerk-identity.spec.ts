import {
  readVerifiedClerkIdentity,
  CLERK_TRANSACTION_TTL_MS,
  openClerkTransaction,
  sealClerkTransaction,
} from './clerk-identity';

const SECRET = 'transaction-test-secret-at-least-32-characters';
const IDENTITY = { sub: 'user_authorized', email: 'admin@example.com' };
const TRANSACTION = {
  state: 'bound-state',
  nonce: 'oidc-nonce',
  codeVerifier: 'pkce-verifier',
  createdAt: 1000,
};

describe('Hypertech Clerk identity boundary', () => {
  it('requires a verified identity but leaves authorization to ERP', () => {
    expect(
      readVerifiedClerkIdentity({
        ...IDENTITY,
        email: 'ADMIN@example.com',
        email_verified: true,
      }),
    ).toEqual(IDENTITY);
    expect(
      readVerifiedClerkIdentity({
        sub: 'user_other',
        email: 'other@example.com',
        email_verified: true,
      }).sub,
    ).toBe('user_other');
    for (const claims of [
      { ...IDENTITY, email_verified: false },
      { ...IDENTITY, email_verified: 'true' },
      { ...IDENTITY, sub: 'invalid', email_verified: true },
      { ...IDENTITY, email: 'invalid', email_verified: true },
    ]) {
      expect(() => readVerifiedClerkIdentity(claims)).toThrow();
    }
  });

  it('binds the OAuth state and PKCE verifier to an authenticated encrypted cookie', () => {
    const encrypted = sealClerkTransaction(TRANSACTION, SECRET);
    expect(encrypted).not.toContain('pkce-verifier');
    expect(
      openClerkTransaction(encrypted, TRANSACTION.state, SECRET, 1001),
    ).toEqual(TRANSACTION);
    expect(() =>
      openClerkTransaction(encrypted, 'another-browser-state', SECRET, 1001),
    ).toThrow();
    expect(() =>
      openClerkTransaction(
        encrypted,
        TRANSACTION.state,
        SECRET + 'different',
        1001,
      ),
    ).toThrow();
    const corrupted = Buffer.from(encrypted, 'base64url');
    corrupted[30] ^= 1;
    expect(() =>
      openClerkTransaction(
        corrupted.toString('base64url'),
        TRANSACTION.state,
        SECRET,
        1001,
      ),
    ).toThrow();
  });

  it('rejects stale and future transactions', () => {
    const encrypted = sealClerkTransaction(TRANSACTION, SECRET);
    expect(() =>
      openClerkTransaction(
        encrypted,
        TRANSACTION.state,
        SECRET,
        1000 + CLERK_TRANSACTION_TTL_MS + 1,
      ),
    ).toThrow();
    expect(() =>
      openClerkTransaction(encrypted, TRANSACTION.state, SECRET, 999),
    ).toThrow();
  });
});
