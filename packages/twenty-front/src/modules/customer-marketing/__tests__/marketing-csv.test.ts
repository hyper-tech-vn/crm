import { marketingCsv } from '@/customer-marketing/marketing-csv';
it('exports source contacts including unknown consent and preserves plus-tag emails', () => {
  const csv = marketingCsv({
    items: [
      {
        email: 'buyer+tag@example.com',
        recipientName: 'Buyer',
        shopName: 'Store A',
        consent: 'UNKNOWN',
        purchaseCount: 2,
      },
    ],
  });
  expect(csv).toContain('buyer+tag@example.com');
  expect(csv).toContain('UNKNOWN');
  expect(csv.startsWith('\uFEFF')).toBe(true);
});
it('quotes newlines/quotes and prevents spreadsheet formula execution', () => {
  const csv = marketingCsv({
    items: [
      {
        email: '=cmd@example.com',
        recipientName: '=1+1',
        shopName: 'Store,"A"\nB',
        consent: 'SUBSCRIBED',
        purchaseCount: 1,
      },
    ],
  });
  expect(csv).toContain('"\'=cmd@example.com"');
  expect(csv).toContain('"\'=1+1"');
  expect(csv).toContain('Store,""A""\nB');
});
