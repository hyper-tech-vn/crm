import { type MarketingContactExport } from './marketing-types';

const csvCell = (value: string) => {
  const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};
export const marketingCsv = (data: MarketingContactExport) =>
  '\uFEFF' +
  [
    ['email', 'recipient_name', 'shop', 'consent', 'purchase_count'],
    ...data.items.map((contact) => [
      contact.email,
      contact.recipientName ?? '',
      contact.shopName ?? '',
      contact.consent,
      String(contact.purchaseCount),
    ]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
