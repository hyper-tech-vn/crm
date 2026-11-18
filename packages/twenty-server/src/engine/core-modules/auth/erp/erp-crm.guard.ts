import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';

import { AccessTokenService } from 'src/engine/core-modules/auth/token/services/access-token.service';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { getRequest } from 'src/utils/extract-request';
import { erpCrmEnabled } from './erp-crm-config';
import { erpCrmRequestStorage } from './erp-crm-request-context';

@Injectable()
export class ErpCrmGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!erpCrmEnabled()) {
      return true;
    }
    const request = getRequest(context) as Request | undefined;
    if (
      !request ||
      !/^\/(graphql|metadata|admin-panel|rest|files|mcp|auth)(\/|$)/.test(
        request.path,
      )
    ) {
      return true;
    }
    const guards = this.reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (guards?.includes(PublicEndpointGuard)) {
      return true;
    }
    if (!erpCrmRequestStorage.getStore()?.policy) {
      await this.tokens.validateTokenByRequest(request);
    }
    return true;
  }
}
