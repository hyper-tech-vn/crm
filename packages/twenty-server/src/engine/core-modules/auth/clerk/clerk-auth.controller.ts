import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';

import { type Request, type Response } from 'express';
import { ApiPath } from 'twenty-shared/types';

import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

import { ClerkOidcService } from './clerk-oidc.service';

@Controller(`${ApiPath.Auth}/clerk`)
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class ClerkAuthController {
  constructor(
    private readonly clerkOidcService: ClerkOidcService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async start(@Res() response: Response) {
    await this.clerkOidcService.start(response);
  }

  @Get('callback')
  async callback(@Req() request: Request, @Res() response: Response) {
    const user = await this.clerkOidcService.finish(request, response);
    const redirectUrl = await this.authService.signInUpWithSocialSso(
      user,
      AuthProviderEnum.Clerk,
    );

    response.redirect(redirectUrl);
  }
}
