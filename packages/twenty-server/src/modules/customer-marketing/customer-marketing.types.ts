import { type ObjectRecord } from 'twenty-shared/types';
export const CUSTOMER_OBJECT = 'hypertechCustomer';
export const CAMPAIGN_OBJECT = 'hypertechCampaign';
export const CONSENT_EVENT_OBJECT = 'hypertechConsentEvent';
export const CONSENT_STATES = [
  'UNKNOWN',
  'PENDING',
  'SUBSCRIBED',
  'DECLINED',
  'UNSUBSCRIBED',
  'SUPPRESSED',
] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];
export type SourceContact = {
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
};
export type SourcePage = {
  items: SourceContact[];
  nextCursor: string | null;
  snapshotAt: string;
};
export type SourceSummary = {
  totalOrders: number;
  ordersWithEmail: number;
  ordersWithoutEmail: number;
  contactCount: number;
  invalidEmailContacts: number;
  shops: { id: string; name: string; channel: string }[];
};
export type ContactVisibility = { all: boolean; keys: string[] };
export type CustomerVisibility = {
  read: ContactVisibility;
  update: ContactVisibility;
  export: ContactVisibility;
  consent: ContactVisibility;
};
export type CustomerRecord = ObjectRecord & {
  preferredName: string | null;
  customerNotes: string | null;
  id: string;
  name: string;
  sourceOrganizationId: string;
  sourceKey: string;
  sourceShopId: string | null;
  shopName: string | null;
  channel: string | null;
  emailValid: boolean;
  recipientName: string | null;
  recipientPhone: string | null;
  country: string | null;
  orderCount: number;
  purchaseCount: number;
  completedCount: number;
  activeCount: number;
  firstRecordedAt: string | Date;
  lastRecordedAt: string | Date;
  sourceSnapshotAt: string | Date;
  consentState: ConsentState;
  consentVersion: number;
  evidenceAt: string | Date | null;
  evidenceReference: string | null;
};
export type DraftInput = {
  shopId: string;
  kind: 'CONSENT_REQUEST' | 'PROMOTION';
  name: string;
  subject: string;
  bodyText: string;
  minOrders: number;
  maxOrders: number | null;
};
export type CampaignRecord = ObjectRecord &
  DraftInput & {
    id: string;
    sourceOrganizationId: string;
    createdByErpEmployeeId: string;
    draftVersion: number;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
export type ConsentChange = {
  state: ConsentState;
  evidenceAt: string;
  evidenceReference: string;
  expectedVersion: number;
};
export type MarketingMutation =
  | 'SYNC_CUSTOMERS'
  | 'RECORD_CONSENT'
  | 'SAVE_CAMPAIGN';
