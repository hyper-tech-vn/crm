export const ERP_CRM_CAPABILITIES = [
  'crm:access',
  'crm:admin',
  'crm-customer:read',
  'crm-customer:create',
  'crm-customer:update',
  'crm-customer:delete',
  'crm-customer:export',
  'crm-campaign:read',
  'crm-campaign:manage',
  'crm-campaign:send',
] as const;

export type ErpCrmCapability = (typeof ERP_CRM_CAPABILITIES)[number];
export type ErpCrmGrant = {
  scope: 'ORGANIZATION' | 'UNIT_SUBTREE' | 'SELF';
  ownerEmployeeIds: string[];
};
export type ErpCrmAccess = {
  version: 1;
  organizationId: string;
  employeeId: string;
  instanceAdministration: boolean;
  permissions: Partial<Record<ErpCrmCapability, ErpCrmGrant>>;
};
export type ErpCrmProof = {
  idToken: string;
  clerkSubject: string;
  email: string;
  expiresAt: number;
};
