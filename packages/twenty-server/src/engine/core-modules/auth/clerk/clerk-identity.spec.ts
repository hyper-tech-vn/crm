import {
  authorizeClerkIdentity,
  CLERK_TRANSACTION_TTL_MS,
  openClerkTransaction,
  readClerkAllowlist,
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
  it('requires the configured subject and verified email together', () => {
    expect(
      authorizeClerkIdentity(
        { ...IDENTITY, email: 'ADMIN@example.com', email_verified: true },
        [IDENTITY],
      ),
    ).toEqual(IDENTITY);
    for (const claims of [
      { ...IDENTITY, email_verified: false },
      { ...IDENTITY, email_verified: 'true' },
      { ...IDENTITY, sub: 'user_attacker', email_verified: true },
      { ...IDENTITY, email: 'other@example.com', email_verified: true },
    ]) {
      expect(() => authorizeClerkIdentity(claims, [IDENTITY])).toThrow();
    }
  });

  it('does not accept an empty or malformed allowlist', () => {
    for (const value of [
      '[]',
      '{}',
      'null',
      '[{"sub":"user_test"}]',
      '[{"sub":"not-a-clerk-sub","email":"admin@example.com"}]',
    ]) {
      expect(() => readClerkAllowlist(value)).toThrow();
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
