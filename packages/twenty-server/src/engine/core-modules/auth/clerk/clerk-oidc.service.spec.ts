import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { Issuer, type TokenSet } from 'openid-client';

import { ClerkOidcService } from './clerk-oidc.service';
import {
  CLERK_TRANSACTION_COOKIE,
  sealClerkTransaction,
} from './clerk-identity';

const SECRET = 'transaction-test-secret-at-least-32-characters';
const IDENTITY = { sub: 'user_authorized', email: 'admin@example.com' };

describe('Clerk OIDC flow', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      AUTH_CLERK_ENABLED: 'true',
      AUTH_CLERK_ISSUER: 'https://clerk.hyper-tech.vn',
      SERVER_URL: 'https://crm.hyper-tech.vn',
      AUTH_CLERK_CLIENT_ID: 'client',
      AUTH_CLERK_CLIENT_SECRET: 'secret',
      APP_SECRET: SECRET,
      AUTH_CLERK_ALLOWED_IDENTITIES: JSON.stringify([IDENTITY]),
      IS_MULTIWORKSPACE_ENABLED: 'false',
    };
  });

  afterEach(() => {
    process.env = originalEnvironment;
    jest.restoreAllMocks();
  });

  const response = () =>
    ({
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      setHeader: jest.fn(),
      redirect: jest.fn(),
    }) as unknown as Response;

  it('does not expose a disabled provider', async () => {
    process.env.AUTH_CLERK_ENABLED = 'false';
    await expect(
      new ClerkOidcService().start(response()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a callback without the browser transaction before token exchange', async () => {
    const discovery = jest.spyOn(Issuer, 'discover');
    await expect(
      new ClerkOidcService().finish(
        {
          query: { state: 'state', code: 'untrusted-code' },
          headers: {},
        } as unknown as Request,
        response(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(discovery).not.toHaveBeenCalled();
  });

  it('does not exchange a code when its browser state is mismatched', async () => {
    const discovery = jest.spyOn(Issuer, 'discover');
    const cookie = sealClerkTransaction(
      {
        state: 'real-state',
        nonce: 'nonce',
        codeVerifier: 'verifier',
        createdAt: Date.now(),
      },
      SECRET,
    );
    await expect(
      new ClerkOidcService().finish(
        {
          query: { state: 'attacker-state', code: 'untrusted-code' },
          headers: {
            cookie: `unrelated=value; ${CLERK_TRANSACTION_COOKIE}=${cookie}`,
          },
        } as unknown as Request,
        response(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(discovery).not.toHaveBeenCalled();
  });
  it('rejects multi-workspace configuration', async () => {
    process.env.IS_MULTIWORKSPACE_ENABLED = 'true';
    await expect(new ClerkOidcService().start(response())).rejects.toThrow(
      'single-workspace',
    );
  });

  it.each(['authorized', 'unauthorized', 'mismatched'])(
    'validates the token and enforces the allowlist (identity=%s)',
    async (identityCase) => {
      const authorized = identityCase === 'authorized';
      const callback = jest.fn().mockResolvedValue({
        claims: () => ({
          sub: identityCase === 'unauthorized' ? 'user_other' : IDENTITY.sub,
        }),
      });
      const issuer = new Issuer({
        issuer: 'https://clerk.hyper-tech.vn',
        authorization_endpoint: 'https://clerk.hyper-tech.vn/oauth/authorize',
        token_endpoint: 'https://clerk.hyper-tech.vn/oauth/token',
        jwks_uri: 'https://clerk.hyper-tech.vn/.well-known/jwks.json',
        userinfo_endpoint: 'https://clerk.hyper-tech.vn/oauth/userinfo',
      });
      jest
        .spyOn(issuer.Client.prototype, 'callback')
        .mockImplementation(callback);
      jest.spyOn(issuer.Client.prototype, 'userinfo').mockResolvedValue({
        ...IDENTITY,
        sub: identityCase === 'authorized' ? IDENTITY.sub : 'user_other',
        email_verified: true,
      });
      jest.spyOn(Issuer, 'discover').mockResolvedValue(issuer);
      const transaction = {
        state: 'state',
        nonce: 'nonce',
        codeVerifier: 'verifier',
        createdAt: Date.now(),
      };
      const request = {
        method: 'GET',
        url: '/auth/clerk/callback?state=state&code=code',
        query: { state: 'state', code: 'code' },
        headers: {
          cookie: `${CLERK_TRANSACTION_COOKIE}=${sealClerkTransaction(transaction, SECRET)}`,
        },
      } as unknown as Request;
      const result = new ClerkOidcService().finish(request, response());
      if (authorized) {
        await expect(result).resolves.toMatchObject({
          email: IDENTITY.email,
          picture: null,
          action: 'list-available-workspaces',
        });
      } else {
        await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
      }
      expect(callback).toHaveBeenCalledWith(
        'https://crm.hyper-tech.vn/auth/clerk/callback',
        expect.objectContaining({ code: 'code' }),
        { state: 'state', nonce: 'nonce', code_verifier: 'verifier' },
      );
    },
  );
  it.each([true, false])(
    'uses signed ID-token email claims without a UserInfo dependency (verified=%s)',
    async (verified) => {
      const issuer = new Issuer({
        issuer: 'https://clerk.hyper-tech.vn',
        authorization_endpoint: 'https://clerk.hyper-tech.vn/oauth/authorize',
        token_endpoint: 'https://clerk.hyper-tech.vn/oauth/token',
        jwks_uri: 'https://clerk.hyper-tech.vn/.well-known/jwks.json',
        userinfo_endpoint: 'https://clerk.hyper-tech.vn/oauth/userinfo',
      });
      jest
        .spyOn(issuer.Client.prototype, 'callback')
        .mockResolvedValue({
          claims: () => ({ ...IDENTITY, email_verified: verified }),
        } as unknown as TokenSet);
      const userinfo = jest
        .spyOn(issuer.Client.prototype, 'userinfo')
        .mockRejectedValue(new Error('UserInfo unavailable'));
      jest.spyOn(Issuer, 'discover').mockResolvedValue(issuer);
      const transaction = {
        state: 'state',
        nonce: 'nonce',
        codeVerifier: 'verifier',
        createdAt: Date.now(),
      };
      const request = {
        method: 'GET',
        url: '/auth/clerk/callback?state=state&code=code',
        query: { state: 'state', code: 'code' },
        headers: {
          cookie: `${CLERK_TRANSACTION_COOKIE}=${sealClerkTransaction(transaction, SECRET)}`,
        },
      } as unknown as Request;
      const result = new ClerkOidcService().finish(request, response());
      if (verified) {
        await expect(result).resolves.toMatchObject({ email: IDENTITY.email });
      } else {
        await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
      }
      expect(userinfo).not.toHaveBeenCalled();
    },
  );
});
