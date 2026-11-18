import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ERP_CRM_CAPABILITIES,
  type ErpCrmAccess,
  type ErpCrmGrant,
} from './erp-crm-access.types';
import { getErpCrmConfig, isErpUuid } from './erp-crm-config';

export const parseErpCrmAccess = (
  value: unknown,
  organizationId: string,
): ErpCrmAccess => {
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('organizationId' in value) ||
    value.organizationId !== organizationId ||
    !('employeeId' in value) ||
    !isErpUuid(value.employeeId) ||
    !('permissions' in value) ||
    !value.permissions ||
    typeof value.permissions !== 'object' ||
    Array.isArray(value.permissions)
  ) {
    throw new Error('Invalid ERP CRM authorization response');
  }

  const permissions: ErpCrmAccess['permissions'] = {};
  for (const capability of ERP_CRM_CAPABILITIES) {
    const grant: unknown = Reflect.get(value.permissions, capability);
    if (grant === undefined) {
      continue;
    }
    if (
      !grant ||
      typeof grant !== 'object' ||
      !('scope' in grant) ||
      !['ORGANIZATION', 'UNIT_SUBTREE', 'SELF'].includes(String(grant.scope)) ||
      !('ownerEmployeeIds' in grant) ||
      !Array.isArray(grant.ownerEmployeeIds) ||
      grant.ownerEmployeeIds.length > 10000 ||
      !grant.ownerEmployeeIds.every(isErpUuid)
    ) {
      throw new Error('Invalid ERP CRM grant');
    }
    if (
      grant.scope === 'SELF' &&
      (grant.ownerEmployeeIds.length !== 1 ||
        grant.ownerEmployeeIds[0] !== value.employeeId)
    ) {
      throw new Error('Invalid ERP self scope');
    }
    permissions[capability] = {
      scope: grant.scope as ErpCrmGrant['scope'],
      ownerEmployeeIds: [...grant.ownerEmployeeIds],
    };
  }
  if (!permissions['crm:access']) {
    throw new ForbiddenException('ERP has not granted CRM access.');
  }
  if (permissions['crm:admin']?.scope !== 'ORGANIZATION') {
    delete permissions['crm:admin'];
  }

  return {
    version: 1,
    organizationId,
    employeeId: value.employeeId,
    instanceAdministration:
      'instanceAdministration' in value &&
      value.instanceAdministration === true,
    permissions,
  };
};

@Injectable()
export class ErpCrmAccessClient {
  async resolve(idToken: string): Promise<ErpCrmAccess> {
    const config = getErpCrmConfig();
    let response: Response;
    try {
      response = await fetch(config.endpoint, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'application/json',
          'User-Agent': 'Hypertech-CRM/1.0',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'ERP authorization is unavailable.',
      );
    }
    if (response.status === 401) {
      throw new UnauthorizedException('Clerk sign-in must be renewed.');
    }
    if (response.status === 403) {
      throw new ForbiddenException('ERP has denied CRM access.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'ERP authorization is unavailable.',
      );
    }
    try {
      const body = await response.text();
      if (body.length > 1024 * 1024) {
        throw new Error('ERP response is too large');
      }
      return parseErpCrmAccess(JSON.parse(body), config.organizationId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'ERP authorization response is invalid.',
      );
    }
  }
}
