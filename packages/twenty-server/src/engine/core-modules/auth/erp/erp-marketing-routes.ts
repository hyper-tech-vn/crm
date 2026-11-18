import { type ErpCrmCapability } from './erp-crm-access.types';

export const ERP_MARKETING_PREFIX = '/auth/erp-marketing';
export type ErpMarketingRoute = {
  suffix: string;
  capabilities: ErpCrmCapability[];
};

export const resolveErpMarketingRoute = (
  method: string,
  path: string,
): ErpMarketingRoute | null => {
  const suffix = path.replace(/\/+$/, '').slice(ERP_MARKETING_PREFIX.length);
  if (!path.startsWith(`${ERP_MARKETING_PREFIX}/`)) {
    return null;
  }
  if (method === 'POST' && suffix === '/sync') {
    return {
      suffix,
      capabilities: [
        'crm:admin',
        'crm-customer:read',
        'crm-customer:create',
        'crm-customer:update',
      ],
    };
  }
  const customerRead: ErpCrmCapability[] = ['crm-customer:read'];
  const campaignRead: ErpCrmCapability[] = ['crm-campaign:read'];
  if (method === 'GET' && suffix === '/customers/export') {
    return {
      suffix,
      capabilities: ['crm-customer:read', 'crm-customer:export'],
    };
  }
  if (
    method === 'GET' &&
    (/^\/(capabilities|summary|customers)$/.test(suffix) ||
      /^\/customers\/[a-f0-9]{32}(?:\/orders)?$/.test(suffix))
  ) {
    return { suffix, capabilities: customerRead };
  }
  if (method === 'GET' && /^\/campaigns(?:\/[a-f0-9-]{36})?$/.test(suffix)) {
    return { suffix, capabilities: campaignRead };
  }
  if (
    method === 'GET' &&
    /^\/campaigns\/[a-f0-9-]{36}\/audience$/.test(suffix)
  ) {
    return { suffix, capabilities: [...customerRead, ...campaignRead] };
  }
  if (
    method === 'POST' &&
    /^\/customers\/[a-f0-9]{32}\/consent$/.test(suffix)
  ) {
    return {
      suffix,
      capabilities: [
        ...customerRead,
        'crm-customer:update',
        'crm-campaign:manage',
      ],
    };
  }
  if (
    (method === 'POST' && suffix === '/campaigns') ||
    (method === 'PATCH' && /^\/campaigns\/[a-f0-9-]{36}$/.test(suffix))
  ) {
    return {
      suffix,
      capabilities: [...customerRead, ...campaignRead, 'crm-campaign:manage'],
    };
  }
  return null;
};
