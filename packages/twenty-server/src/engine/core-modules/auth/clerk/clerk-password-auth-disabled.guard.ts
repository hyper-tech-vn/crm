import {
  type CanActivate,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { isClerkAuthEnabled } from './clerk-enabled';

@Injectable()
export class ClerkPasswordAuthDisabledGuard implements CanActivate {
  canActivate(): boolean {
    if (isClerkAuthEnabled()) {
      throw new ForbiddenException('Use Hypertech Clerk to sign in.');
    }

    return true;
  }
}
