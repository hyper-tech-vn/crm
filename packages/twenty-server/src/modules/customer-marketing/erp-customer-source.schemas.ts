import { z } from 'zod';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const time = z.string().datetime({ offset: true });
const sourceContact = z.object({
  key: z.string().regex(/^[a-f0-9]{32}$/),
  shopId: z.string().uuid().nullable(),
  shopName: z.string().max(10000).nullable(),
  channel: z.string().max(100).nullable(),
  email: z.string().min(1).max(320),
  emailValid: z.boolean(),
  recipientName: z.string().max(10000).nullable(),
  recipientPhone: z.string().max(1000).nullable(),
  country: z.string().max(1000).nullable(),
  orderCount: count,
  purchaseCount: count,
  completedCount: count,
  activeCount: count,
  firstRecordedAt: time,
  lastRecordedAt: time,
});
export const sourcePageSchema = z.object({
  items: z.array(sourceContact).max(100),
  nextCursor: z.string().min(1).max(160).nullable(),
  snapshotAt: time,
});
export const sourceSummarySchema = z.object({
  totalOrders: count,
  ordersWithEmail: count,
  ordersWithoutEmail: count,
  contactCount: count,
  invalidEmailContacts: count,
  shops: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().max(10000),
        channel: z.string().max(100),
      }),
    )
    .max(10000),
});
