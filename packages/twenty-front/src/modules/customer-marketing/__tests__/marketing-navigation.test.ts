import { isLegacyCrmTemplatePath } from '@/customer-marketing/marketing-navigation';
it.each(['/object/person/example', '/getting-started?step=1'])(
  'recognizes deprecated template path %s',
  (path) => expect(isLegacyCrmTemplatePath(path)).toBe(true),
);
it.each([
  '/home',
  '/objects/companies',
  '/object/company/example',
  '/marketing/customers',
  '/marketing/campaigns/new',
  '/settings/profile',
  '/welcome',
  '/objects-other',
  '/objects/hypertechCustomers',
  '/object/hypertechCustomer/example',
  '/objects/hypertechCampaigns',
])('keeps current or unrelated route %s', (path) =>
  expect(isLegacyCrmTemplatePath(path)).toBe(false),
);
