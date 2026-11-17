import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type Request } from 'express';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildWorkspaceAuthContextFromRequest } from 'src/engine/core-modules/auth/utils/build-workspace-auth-context-from-request.util';
import { ErpCrmIdentityStore } from 'src/engine/core-modules/auth/erp/erp-crm-identity.store';
import { erpCrmRequestStorage } from 'src/engine/core-modules/auth/erp/erp-crm-request-context';
import { erpCrmEnabled } from 'src/engine/core-modules/auth/erp/erp-crm-config';
import { resolveErpMarketingRoute } from 'src/engine/core-modules/auth/erp/erp-marketing-routes';
import { requireErpCapability } from 'src/engine/core-modules/auth/erp/erp-crm-operation-policy';
import { CustomerMarketingReadService } from './customer-marketing-read.service';
import { CustomerMarketingConsentService } from './customer-marketing-consent.service';
import { CustomerMarketingSyncService } from './customer-marketing-sync.service';
import {
  CustomerMarketingCampaignService,
  toDraft,
} from './customer-marketing-campaign.service';
import { ErpCustomerSourceClient } from './erp-customer-source.client';
import { requireSync } from './customer-marketing.policy';
import {
  type ConsentChange,
  type DraftInput,
} from './customer-marketing.types';
import { toContact } from './customer-marketing-query';
const FILTER_KEYS = new Set([
  'shopId',
  'query',
  'minOrders',
  'maxOrders',
  'consent',
  'after',
  'size',
]);
@Injectable()
export class CustomerMarketingHttpService {
  constructor(
    private readonly orm: WorkspaceOrmManager,
    private readonly identities: ErpCrmIdentityStore,
    private readonly source: ErpCustomerSourceClient,
    private readonly customers: CustomerMarketingReadService,
    private readonly consent: CustomerMarketingConsentService,
    private readonly sync: CustomerMarketingSyncService,
    private readonly campaigns: CustomerMarketingCampaignService,
  ) {}
  async request(request: Request) {
    const route = resolveErpMarketingRoute(request.method, request.path);
    const policy = erpCrmRequestStorage.getStore()?.policy;
    if (
      !erpCrmEnabled() ||
      !route ||
      !policy ||
      request.user?.id !== policy.userId ||
      request.workspace?.id !== policy.workspaceId
    ) {
      throw new ForbiddenException('ERP CRM authorization is required.');
    }
    for (const capability of route.capabilities) {
      requireErpCapability(policy, capability);
    }
    if (
      request.method !== 'GET' &&
      (request.headers.origin !== 'https://crm.hyper-tech.vn' ||
        !request.is('application/json'))
    ) {
      throw new ForbiddenException(
        'Use the CRM application to update marketing data.',
      );
    }
    if (
      request.method !== 'GET' &&
      Buffer.byteLength(JSON.stringify(request.body) ?? '') > 256 * 1024
    ) {
      throw new BadRequestException('Nội dung vượt giới hạn.');
    }
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.query)) {
      if (
        !FILTER_KEYS.has(key) ||
        typeof value !== 'string' ||
        value.length > 200
      ) {
        throw new BadRequestException('Bộ lọc không hợp lệ.');
      }
      query[key] = value;
    }
    const path = route.suffix;
    const proof = async () => {
      const identity = await this.identities.proof(policy.userId);
      if (
        identity.binding.workspaceId !== policy.workspaceId ||
        identity.binding.organizationId !== policy.access.organizationId ||
        identity.binding.employeeId !== policy.access.employeeId
      ) {
        throw new ForbiddenException();
      }
      return identity.proof.idToken;
    };
    return this.orm.executeInWorkspaceContext(async () => {
      if (path === '/capabilities') {
        let syncCustomers = false;
        try {
          requireSync(policy);
          syncCustomers = true;
        } catch {
          syncCustomers = false;
        }
        return {
          manageCampaigns:
            !!policy.grants['crm-campaign:read'] &&
            !!policy.grants['crm-campaign:manage'],
          updateConsent:
            !!policy.grants['crm-customer:update'] &&
            !!policy.grants['crm-campaign:manage'],
          exportCustomers: !!policy.grants['crm-customer:export'],
          syncCustomers,
        };
      }
      if (path === '/sync') {
        const after: unknown = request.body?.after;
        if (
          after !== null &&
          after !== undefined &&
          (typeof after !== 'string' || after.length > 160)
        ) {
          throw new BadRequestException('Cursor đồng bộ không hợp lệ.');
        }
        return this.sync.synchronize(
          policy,
          await proof(),
          after === undefined ? null : (after as string | null),
        );
      }
      if (path === '/summary') {
        return this.customers.summary(await this.source.summary(await proof()));
      }
      if (path === '/customers/export') {
        return this.customers.exportContacts(policy, query);
      }
      if (path === '/customers') {
        return this.customers.contacts(query);
      }
      const contact = path.match(
        /^\/customers\/([a-f0-9]{32})(?:\/(orders|consent))?$/,
      );
      if (contact) {
        if (contact[2] === 'consent') {
          return this.consent.record(
            policy,
            contact[1],
            request.body as ConsentChange,
          );
        }
        const record = await this.customers.record(policy, contact[1]);
        if (contact[2] === 'orders') {
          return this.source.history(await proof(), record.sourceKey, query);
        }
        return toContact(record);
      }
      const campaign = path.match(
        /^\/campaigns(?:\/([a-f0-9-]{36}))?(?:\/(audience))?$/,
      );
      if (campaign) {
        if (request.method === 'POST') {
          return this.campaigns.save(policy, request.body as DraftInput);
        }
        if (request.method === 'PATCH') {
          return this.campaigns.save(
            policy,
            request.body?.draft as DraftInput,
            campaign[1],
            request.body?.expectedVersion as number,
          );
        }
        if (campaign[2]) {
          return this.campaigns.audience(campaign[1]);
        }
        if (campaign[1]) {
          return toDraft(await this.campaigns.record(campaign[1]));
        }
        return this.campaigns.list(query);
      }
      throw new ForbiddenException('Unsupported native CRM operation.');
    }, buildWorkspaceAuthContextFromRequest(request));
  }
}
