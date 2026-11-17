import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { type Request, type Response } from 'express';
import { Client, generators, Issuer } from 'openid-client';

import {
  authorizeClerkIdentity,
  CLERK_TRANSACTION_COOKIE,
  CLERK_TRANSACTION_TTL_MS,
  openClerkTransaction,
  readClerkAllowlist,
  sealClerkTransaction,
  type ClerkClaims,
} from './clerk-identity';

import { isClerkAuthEnabled } from './clerk-enabled';
import { readCookieValue } from 'src/engine/core-modules/user-session/utils/read-cookie-value.util';

@Injectable()
export class ClerkOidcService {
  private readonly logger = new Logger(ClerkOidcService.name);
  private clientPromise: Promise<Client> | undefined;

  private config() {
    if (!isClerkAuthEnabled()) {
      throw new NotFoundException();
    }

    if (process.env.IS_MULTIWORKSPACE_ENABLED === 'true') {
      throw new Error(
        'Hypertech Clerk authentication requires single-workspace mode',
      );
    }

    const issuer = new URL(process.env.AUTH_CLERK_ISSUER ?? '');
    const serverUrl = new URL(process.env.SERVER_URL ?? '');
    const clientId = process.env.AUTH_CLERK_CLIENT_ID;
    const clientSecret = process.env.AUTH_CLERK_CLIENT_SECRET;
    const transactionSecret = process.env.APP_SECRET ?? '';

    if (
      issuer.origin !== 'https://clerk.hyper-tech.vn' ||
      issuer.pathname !== '/' ||
      serverUrl.protocol !== 'https:' ||
      !clientId ||
      !clientSecret ||
      transactionSecret.length < 32
    ) {
      throw new Error('Invalid Hypertech Clerk authentication configuration');
    }

    return {
      issuer: issuer.origin,
      callbackUrl: new URL('/auth/clerk/callback', serverUrl).toString(),
      clientId,
      clientSecret,
      transactionSecret,
      allowlist: readClerkAllowlist(
        process.env.AUTH_CLERK_ALLOWED_IDENTITIES ?? '[]',
      ),
    };
  }

  private async client() {
    const config = this.config();

    if (!this.clientPromise) {
      this.clientPromise = Issuer.discover(config.issuer)
        .then((issuer) => {
          for (const endpoint of [
            issuer.metadata.authorization_endpoint,
            issuer.metadata.token_endpoint,
            issuer.metadata.jwks_uri,
            issuer.metadata.userinfo_endpoint,
          ]) {
            if (!endpoint || new URL(endpoint).origin !== config.issuer) {
              throw new Error('Unexpected Clerk discovery endpoint');
            }
          }

          return new issuer.Client({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uris: [config.callbackUrl],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_basic',
          });
        })
        .catch((error: unknown) => {
          this.clientPromise = undefined;
          throw error;
        });
    }

    return this.clientPromise;
  }

  async start(response: Response) {
    const config = this.config();
    const client = await this.client();
    const transaction = {
      state: generators.state(),
      nonce: generators.nonce(),
      codeVerifier: generators.codeVerifier(),
      createdAt: Date.now(),
    };

    response.cookie(
      CLERK_TRANSACTION_COOKIE,
      sealClerkTransaction(transaction, config.transactionSecret),
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: CLERK_TRANSACTION_TTL_MS,
      },
    );
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(
      client.authorizationUrl({
        scope: 'openid profile email',
        state: transaction.state,
        nonce: transaction.nonce,
        code_challenge: generators.codeChallenge(transaction.codeVerifier),
        code_challenge_method: 'S256',
      }),
    );
  }

  async finish(request: Request, response: Response) {
    const config = this.config();
    response.clearCookie(CLERK_TRANSACTION_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');

    let step = 'transaction';

    try {
      const encrypted = readCookieValue({
        cookieHeader: request.headers.cookie ?? '',
        cookieName: CLERK_TRANSACTION_COOKIE,
      });
      const state = request.query.state;

      if (typeof encrypted !== 'string' || typeof state !== 'string') {
        throw new Error('Missing Clerk transaction');
      }

      const transaction = openClerkTransaction(
        encrypted,
        state,
        config.transactionSecret,
      );
      const client = await this.client();
      step = 'token';
      const tokens = await client.callback(
        config.callbackUrl,
        client.callbackParams(request),
        {
          state: transaction.state,
          nonce: transaction.nonce,
          code_verifier: transaction.codeVerifier,
        },
      );
      step = 'userinfo';
      const idTokenClaims = tokens.claims();
      const claims: ClerkClaims = await client.userinfo(tokens);

      if (claims.sub !== idTokenClaims.sub) {
        throw new Error('Clerk UserInfo subject mismatch');
      }
      step = 'identity';
      const identity = authorizeClerkIdentity(claims, config.allowlist);

      return {
        email: identity.email,
        firstName:
          typeof claims.given_name === 'string' ? claims.given_name : undefined,
        lastName:
          typeof claims.family_name === 'string'
            ? claims.family_name
            : undefined,
        picture: null,
        action: 'list-available-workspaces' as const,
      };
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : 'Unknown';
      this.logger.warn(`Clerk sign-in rejected at ${step} (${errorName})`);
      throw new UnauthorizedException(
        'Clerk sign-in failed. Please start a new sign-in.',
      );
    }
  }
}
