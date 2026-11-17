export const CUSTOMER_MARKETING_HOME = '/marketing/customers';
export const isLegacyCrmTemplatePath = (path: string) =>
  /^\/(?:home|getting-started)(?:\/|[?#]|$)/.test(path) ||
  /^\/objects\/(?:companies|people|opportunities)(?:\/|[?#]|$)/.test(path) ||
  /^\/object\/(?:company|person|opportunity)(?:\/|[?#]|$)/.test(path);
