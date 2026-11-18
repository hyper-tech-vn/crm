export const CUSTOMER_MARKETING_HOME = '/objects/hypertechCustomers';
export const isLegacyCrmTemplatePath = (path: string) =>
  /^\/(?:getting-started)(?:\/|[?#]|$)/.test(path) ||
  /^\/objects\/(?:people|opportunities)(?:\/|[?#]|$)/.test(path) ||
  /^\/object\/(?:person|opportunity)(?:\/|[?#]|$)/.test(path);
