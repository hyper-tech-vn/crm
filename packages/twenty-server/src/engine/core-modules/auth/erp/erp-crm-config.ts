import { isClerkAuthEnabled } from '../clerk/clerk-enabled';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const erpCrmEnabled = isClerkAuthEnabled;

export const getErpCrmConfig = () => {
  const base = new URL(process.env.ERP_CRM_BASE_URL ?? '');
  const organizationId = process.env.ERP_CRM_ORGANIZATION_ID ?? '';
  const workspaceId = process.env.ERP_CRM_WORKSPACE_ID ?? '';
  const secret = process.env.APP_SECRET ?? '';

  if (
    base.origin !== 'https://erp-api.hyper-tech.vn' ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password ||
    !UUID.test(organizationId) ||
    !UUID.test(workspaceId) ||
    secret.length < 32
  ) {
    throw new Error('Invalid ERP CRM authorization configuration');
  }

  return {
    endpoint: new URL('/api/v1/access/applications/crm', base).toString(),
    organizationId,
    workspaceId,
    secret,
  };
};

export const isErpUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);
