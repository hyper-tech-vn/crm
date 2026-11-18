import {
  ErpCustomerSourceClient,
  needsCustomerVisibility,
} from 'src/modules/customer-marketing/erp-customer-source.client';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';

import { type RawAuthContext } from 'src/engine/core-modules/auth/types/raw-auth-context.type';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { ErpCrmAccessClient } from './erp-crm-access.client';
import { type ErpCrmCapability } from './erp-crm-access.types';
import { getErpCrmConfig, erpCrmEnabled } from './erp-crm-config';
import { ErpCrmIdentityStore } from './erp-crm-identity.store';
import {
  authorizeErpCrmHttpRequest,
  isErpCrmLogoutRequest,
} from './erp-crm-operation-policy';
import {
  erpCrmRequestStorage,
  type ErpCrmRequestPolicy,
} from './erp-crm-request-context';

@Injectable()
export class ErpCrmAuthorizationService {
  constructor(
    private readonly identities: ErpCrmIdentityStore,
    private readonly accessClient: ErpCrmAccessClient,
    private readonly customerSource: ErpCustomerSourceClient = new ErpCustomerSourceClient(),
  ) {}

  async authorize(request: Request, auth: RawAuthContext): Promise<void> {
    if (!erpCrmEnabled() || isErpCrmLogoutRequest(request)) {
      return;
    }
    const carrier = erpCrmRequestStorage.getStore();
    if (!auth.user || auth.authProvider !== AuthProviderEnum.Clerk) {
      throw new UnauthorizedException('Sign in through Clerk.');
    }
    if (
      !carrier ||
      auth.apiKey ||
      auth.application ||
      auth.impersonationContext?.impersonatorUserWorkspaceId ||
      auth.impersonationContext?.impersonatedUserWorkspaceId
    ) {
      throw new ForbiddenException('ERP CRM authorization is required.');
    }
    if (!carrier.resolving) {
      carrier.resolving = this.resolve(auth, request).then((policy) => {
        carrier.policy = policy;
      });
    }
    await carrier.resolving;
    if (
      !carrier.policy ||
      carrier.policy.userId !== auth.user.id ||
      (auth.workspace && auth.workspace.id !== carrier.policy.workspaceId) ||
      (auth.workspaceMemberId &&
        auth.workspaceMemberId !== carrier.policy.workspaceMemberId)
    ) {
      throw new ForbiddenException('CRM actor changed during request.');
    }
    auth.user = {
      ...auth.user,
      canAccessFullAdminPanel: carrier.policy.access.instanceAdministration,
      canImpersonate: carrier.policy.access.instanceAdministration,
    };
    authorizeErpCrmHttpRequest(request, carrier.policy);
  }

  private async resolve(
    auth: RawAuthContext,
    request: Request,
  ): Promise<ErpCrmRequestPolicy> {
    if (!auth.user) {
      throw new UnauthorizedException();
    }
    const config = getErpCrmConfig();
    const { binding, proof } = await this.identities.proof(auth.user.id);
    if (
      binding.organizationId !== config.organizationId ||
      binding.workspaceId !== config.workspaceId ||
      (auth.workspace && auth.workspace.id !== config.workspaceId) ||
      proof.email !== auth.user.email ||
      (auth.workspaceMemberId &&
        auth.workspaceMemberId !== binding.workspaceMemberId)
    ) {
      throw new ForbiddenException(
        'ERP CRM identity does not match this workspace.',
      );
    }
    const access = await this.accessClient.resolve(proof.idToken);
    if (access.employeeId !== binding.employeeId) {
      throw new ForbiddenException('ERP CRM identity cannot be reassigned.');
    }
    const employeeIds = [
      ...new Set(
        Object.values(access.permissions).flatMap(
          (grant) => grant?.ownerEmployeeIds ?? [],
        ),
      ),
    ];
    const members =
      await this.identities.workspaceMembersForEmployees(employeeIds);
    const grants: ErpCrmRequestPolicy['grants'] = {};
    for (const [key, grant] of Object.entries(access.permissions)) {
      if (grant) {
        grants[key as ErpCrmCapability] = {
          ...grant,
          ownerWorkspaceMemberIds: grant.ownerEmployeeIds.flatMap(
            (employeeId) =>
              members.get(employeeId) ? [members.get(employeeId)!] : [],
          ),
        };
      }
    }
    return {
      access,
      grants,
      ...(needsCustomerVisibility(
        request.path,
        request.method === 'GET' ? request.query?.query : request.body?.query,
        request.method,
      )
        ? {
            customerVisibility: await this.customerSource.visibility(
              proof.idToken,
            ),
          }
        : {}),
      userId: auth.user.id,
      workspaceId: config.workspaceId,
      workspaceMemberId: binding.workspaceMemberId,
      databaseSchema: auth.workspace?.databaseSchema ?? undefined,
    };
  }
}
