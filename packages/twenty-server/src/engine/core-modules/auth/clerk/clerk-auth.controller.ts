import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';

import { type Request, type Response } from 'express';
import { ApiPath } from 'twenty-shared/types';

import { ErpCrmLoginWorkspaceService } from '../erp/erp-crm-login.workspace-service';
import { UserSessionCookieService } from 'src/engine/core-modules/user-session/services/user-session-cookie.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

import { ClerkOidcService } from './clerk-oidc.service';

@Controller(`${ApiPath.Auth}/clerk`)
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class ClerkAuthController {
  constructor(
    private readonly clerkOidcService: ClerkOidcService,
    private readonly erpLogin: ErpCrmLoginWorkspaceService,
    private readonly sessionCookies: UserSessionCookieService,
  ) {}

  @Get()
  async start(@Res() response: Response) {
    await this.clerkOidcService.start(response);
  }

  @Get('callback')
  async callback(@Req() request: Request, @Res() response: Response) {
    const user = await this.clerkOidcService.finish(request, response);
    const redirectUrl = await this.erpLogin.signIn(user);
    this.sessionCookies.clearSessionCookie(response);

    response.redirect(redirectUrl);
  }
}
