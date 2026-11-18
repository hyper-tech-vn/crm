import { type CustomerVisibility } from 'src/modules/customer-marketing/customer-marketing.types';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type ErpCrmAccess,
  type ErpCrmCapability,
  type ErpCrmGrant,
} from './erp-crm-access.types';

export type ErpCrmRequestPolicy = {
  access: ErpCrmAccess;
  userId: string;
  workspaceId: string;
  workspaceMemberId: string;
  databaseSchema?: string;
  selfProfileUpdate?: boolean;
  customerDetailsUpdate?: boolean;
  customerVisibility?: CustomerVisibility;
  grants: Partial<
    Record<
      ErpCrmCapability,
      ErpCrmGrant & { ownerWorkspaceMemberIds: string[] }
    >
  >;
};

export type ErpCrmRequestCarrier = {
  policy?: ErpCrmRequestPolicy;
  resolving?: Promise<void>;
  provisioning?: boolean;
  verifiedCompanyIds?: Set<string>;
};
export const erpCrmRequestStorage =
  new AsyncLocalStorage<ErpCrmRequestCarrier>();
