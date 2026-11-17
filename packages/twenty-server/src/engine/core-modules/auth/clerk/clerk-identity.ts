import {
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export type ClerkIdentity = { sub: string; email: string };
export type ClerkClaims = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  picture?: unknown;
};
export type ClerkTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
};

export const CLERK_TRANSACTION_COOKIE = '__Host-hypertech-clerk';
export const CLERK_TRANSACTION_TTL_MS = 5 * 60 * 1000;

export const readClerkAllowlist = (value: string): ClerkIdentity[] => {
  const parsed: unknown = JSON.parse(value);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Clerk requires an explicit subject/email allowlist');
  }

  return parsed.map((entry: unknown) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('sub' in entry) ||
      !('email' in entry) ||
      typeof entry.sub !== 'string' ||
      typeof entry.email !== 'string' ||
      !/^user_[A-Za-z0-9]+$/.test(entry.sub) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)
    ) {
      throw new Error('Invalid Clerk subject/email allowlist entry');
    }

    return { sub: entry.sub, email: entry.email.toLowerCase() };
  });
};

export const authorizeClerkIdentity = (
  claims: ClerkClaims,
  allowlist: ClerkIdentity[],
): ClerkIdentity => {
  if (
    claims.email_verified !== true ||
    typeof claims.sub !== 'string' ||
    typeof claims.email !== 'string'
  ) {
    throw new Error('Verified Clerk identity required');
  }

  const email = claims.email.toLowerCase();
  const identity = allowlist.find(
    (entry) => entry.sub === claims.sub && entry.email === email,
  );

  if (!identity) {
    throw new Error('Clerk identity is not authorized for this CRM');
  }

  return identity;
};

const transactionKey = (secret: string): Buffer => {
  if (secret.length < 32) {
    throw new Error(
      'Clerk transaction secret must have at least 32 characters',
    );
  }

  return createHash('sha256')
    .update('hypertech-clerk-transaction-v1\0')
    .update(secret)
    .digest();
};

export const sealClerkTransaction = (
  transaction: ClerkTransaction,
  secret: string,
): string => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', transactionKey(secret), nonce);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(transaction), 'utf8'),
    cipher.final(),
  ]);

  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString(
    'base64url',
  );
};

export const openClerkTransaction = (
  value: string,
  state: string,
  secret: string,
  now = Date.now(),
): ClerkTransaction => {
  if (value.length > 4096 || state.length > 256) {
    throw new Error('Invalid Clerk transaction');
  }

  const bytes = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    transactionKey(secret),
    bytes.subarray(0, 12),
  );
  cipher.setAuthTag(bytes.subarray(12, 28));
  const decoded: unknown = JSON.parse(
    Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(
      'utf8',
    ),
  );

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('state' in decoded) ||
    !('nonce' in decoded) ||
    !('codeVerifier' in decoded) ||
    !('createdAt' in decoded) ||
    typeof decoded.state !== 'string' ||
    typeof decoded.nonce !== 'string' ||
    typeof decoded.codeVerifier !== 'string' ||
    typeof decoded.createdAt !== 'number' ||
    !Number.isFinite(decoded.createdAt) ||
    now < decoded.createdAt ||
    now - decoded.createdAt > CLERK_TRANSACTION_TTL_MS
  ) {
    throw new Error('Invalid or expired Clerk transaction');
  }

  const actualState = Buffer.from(decoded.state);
  const providedState = Buffer.from(state);

  if (
    actualState.length !== providedState.length ||
    !timingSafeEqual(actualState, providedState)
  ) {
    throw new Error('Clerk state mismatch');
  }

  return {
    state: decoded.state,
    nonce: decoded.nonce,
    codeVerifier: decoded.codeVerifier,
    createdAt: decoded.createdAt,
  };
};
