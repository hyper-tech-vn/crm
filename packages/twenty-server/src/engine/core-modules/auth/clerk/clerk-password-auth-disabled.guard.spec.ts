import { ForbiddenException } from '@nestjs/common';

import { ClerkPasswordAuthDisabledGuard } from './clerk-password-auth-disabled.guard';

describe('Clerk-only password authentication boundary', () => {
  const originalFlag = process.env.AUTH_CLERK_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.AUTH_CLERK_ENABLED;
    } else {
      process.env.AUTH_CLERK_ENABLED = originalFlag;
    }
  });

  it('denies native password and email authentication while Clerk is enabled', () => {
    process.env.AUTH_CLERK_ENABLED = 'true';
    expect(() => new ClerkPasswordAuthDisabledGuard().canActivate()).toThrow(
      ForbiddenException,
    );
  });

  it('preserves the upstream provider flow when the custom provider is off', () => {
    process.env.AUTH_CLERK_ENABLED = 'false';
    expect(new ClerkPasswordAuthDisabledGuard().canActivate()).toBe(true);
  });
});
