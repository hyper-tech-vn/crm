export const MARKETING_CONSENT_STATES = [
  'UNKNOWN',
  'PENDING',
  'SUBSCRIBED',
  'DECLINED',
  'UNSUBSCRIBED',
  'SUPPRESSED',
] as const;
export type MarketingConsent = (typeof MARKETING_CONSENT_STATES)[number];
export type MarketingCampaignKind = 'CONSENT_REQUEST' | 'PROMOTION';
export type MarketingContact = {
  id?: string;
  preferredName?: string | null;
  customerNotes?: string | null;
  sourceSnapshotAt?: string;
  key: string;
  shopId: string | null;
  shopName: string | null;
  channel: string | null;
  email: string;
  emailValid: boolean;
  recipientName: string | null;
  recipientPhone: string | null;
  country: string | null;
  orderCount: number;
  purchaseCount: number;
  completedCount: number;
  activeCount: number;
  firstRecordedAt: string;
  lastRecordedAt: string;
  consent: MarketingConsent;
  version: number;
  evidenceAt: string | null;
  evidenceReference: string | null;
};
export type MarketingPage<TItem> = {
  items: TItem[];
  nextCursor: string | null;
};
export type MarketingSummary = {
  totalOrders: number;
  ordersWithEmail: number;
  ordersWithoutEmail: number;
  contactCount: number;
  sourceContactCount?: number;
  invalidEmailContacts: number;
  consentCounts: Partial<Record<MarketingConsent, number>>;
  shops: { id: string; name: string; channel: string }[];
};
export type MarketingOrder = {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  kind: string;
  recordedAt: string;
  recipientName: string | null;
};
export type MarketingDraftInput = {
  shopId: string;
  kind: MarketingCampaignKind;
  name: string;
  subject: string;
  bodyText: string;
  minOrders: number;
  maxOrders: number | null;
};
export type MarketingDraft = MarketingDraftInput & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type MarketingAudience = {
  matchedContacts: number;
  eligibleContacts: number;
  countsByConsent: Partial<Record<MarketingConsent, number>>;
  withoutPurchase: number;
  invalidEmails: number;
  requiredConsent: MarketingConsent;
  sample: MarketingPage<MarketingContact>;
};
export type MarketingCapabilities = {
  syncCustomers?: boolean;
  manageWorkflows?: boolean;
  manageCampaigns: boolean;
  updateConsent: boolean;
  exportCustomers: boolean;
};

export type MarketingContactExport = {
  items: {
    email: string;
    recipientName: string | null;
    shopName: string | null;
    consent: MarketingConsent;
    purchaseCount: number;
  }[];
};
