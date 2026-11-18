import {
  Controller,
  Get,
  Header,
  Patch,
  Post,
  Req,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { type Request } from 'express';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { AccessPolicyGuard } from 'src/engine/guards/access-policy.guard';
import { ErpMarketingAuthExceptionFilter } from './erp-marketing-auth-exception.filter';
import { CustomerMarketingHttpService } from 'src/modules/customer-marketing/customer-marketing-http.service';

@Controller('auth/erp-marketing')
@UseFilters(ErpMarketingAuthExceptionFilter)
@UseGuards(
  JwtAuthGuard,
  AccessPolicyGuard({
    authPrincipals: {
      userSession: {
        standard: true,
        impersonated: false,
        playground: false,
        workspaceAgnostic: false,
      },
      apiKey: false,
      oauthClient: false,
      application: false,
    },
    requiredPermissionFlags: [],
  }),
)
export class ErpMarketingController {
  constructor(private readonly proxy: CustomerMarketingHttpService) {}
  @Get([
    'capabilities',
    'summary',
    'customers',
    'customers/export',
    'customers/:key',
    'customers/:key/orders',
    'campaigns',
    'campaigns/:id',
    'campaigns/:id/audience',
  ])
  @Header('Cache-Control', 'private, no-store')
  read(@Req() request: Request) {
    return this.proxy.request(request);
  }
  @Post(['customers/:key/consent', 'campaigns', 'sync'])
  @Header('Cache-Control', 'private, no-store')
  create(@Req() request: Request) {
    return this.proxy.request(request);
  }
  @Patch('campaigns/:id')
  @Header('Cache-Control', 'private, no-store')
  update(@Req() request: Request) {
    return this.proxy.request(request);
  }
}
