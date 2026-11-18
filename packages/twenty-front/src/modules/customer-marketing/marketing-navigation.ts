export const CUSTOMER_MARKETING_HOME = '/marketing/customers';
export const isLegacyCrmTemplatePath = (path: string) =>
  /^\/(?:home|getting-started)(?:\/|[?#]|$)/.test(path) ||
  /^\/objects\/(?:people|opportunities)(?:\/|[?#]|$)/.test(path) ||
  /^\/object\/(?:person|opportunity)(?:\/|[?#]|$)/.test(path);
