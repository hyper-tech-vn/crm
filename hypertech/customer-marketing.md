# Hypertech customer marketing in Twenty

## Ownership

Twenty owns the CRM: native `hypertechCustomer`, `hypertechConsentEvent` and `hypertechCampaign` objects in the workspace database. Preferred names and notes, consent state/version/evidence and campaign drafts live here. ERP owns orders, source contacts and authorization, and exposes only the read-only `/api/v1/orders/crm-customers` contract in its existing order module. Clerk authenticates identities. No new ERP bounded module or Nest module is introduced; providers extend existing AuthModule/TokenModule.

The former ERP-owned marketing draft is superseded and must not ship. This feature branch starts at `0e232bb7425aaa239b3c2125863c5895d981e4fc`; its matching ERP source branch is `feat/crm-customer-source-20261117`, starting at `e5379b32927c4edfc096797ccdef236eeccf0d98`.

## Native application and user flow

`hypertech/customer-marketing-app` contains SDK2.59.0 application declarations with stable universal identifiers, customer/campaign/evidence views and a customer profile layout. Its application role grants no records/tools and is non-assignable; native workspace roles and fresh ERP permissions both remain mandatory. Customer source/consent fields are read-only in generic Twenty editors; preferredName/customerNotes are editable with customer-update permission. The profile hides technical IDs. Campaign and audit mutations use dedicated actions, never unrestricted generic writes.

The Clerk-enabled workspace opens `/marketing/customers`; old B2B menus/landing pages are replaced while native custom-object record routes remain accessible. The UI collects all populated order emails per shop, displays recipient snapshots and source order facts, filters consent/cohorts, exports a selected shop up to5000 contacts under independent export scope, records consent evidence, and saves plain-text campaign drafts with live audience preview. Dates display Asia/Ho_Chi_Minh. ERP recording dates are labeled explicitly; there are no inferred purchase dates, winback cohorts or monetary fields.

Version one has an explicit administrator action to synchronize paged source contacts. The adapter validates source-key derivation, uses deterministic native IDs, ignores replayed/older snapshots and updates only source fields. It never overwrites Twenty notes or consent. Page transactions and source cursors allow a failed sync to be retried. Future orders require this manual action until an incremental trigger is implemented.

Consent writes lock the native customer row, require expected version and dated evidence, update one row and append one immutable evidence event in the same transaction. Failure rolls back both; concurrent stale commands fail. UNKNOWN is never inferred as subscribed. Promotions preview only valid SUBSCRIBED contacts; consent-request drafts target valid UNKNOWN contacts. Pending/declined/unsubscribed/suppressed contacts are excluded. Purchase count minimum is explicit and defaults to zero, preserving cancelled/replacement-only contacts in collection.

## Authorization and transport

The native BFF exposes a closed `/auth/erp-marketing` route map, uses existing JwtAuthGuard/AccessPolicyGuard/global ERP guard, immutable identity binding and private Clerk proof. Non-CRM mutation origins and non-JSON requests are rejected. ERP source calls are GET-only, fixed-origin and bounded; proof and provider diagnostics never reach the browser.

Fresh ERP capability and source visibility checks run for each request. Read/update/export/consent scopes are independent and applied in native ORM before lists, counts and writes. An all-visible source response cannot widen narrower original grants. Campaigns retain immutable ERP creator ownership and use live SELF/UNIT/ORG grants. Generic GraphQL/REST, related rows and raw-query paths remain enforced. Customer notes updates have a closed field allowlist; source fields, consent, audit and campaign writes require the dedicated request-local mutation intent.

The ORM generated insert uses its already-validated compiled executor rather than recursively entering the public raw-query API, which incorrectly required unrelated delete/send grants on ordinary creates. The public raw-query guard is unchanged. Regression tests cover repository behavior and real PostgreSQL ERP scope.

## Verification and rollout boundary

Native application build validated successfully. Focused UI tests cover filters, stale resource requests, consent/campaign forms, CSV injection protection, sync paging/failure and landing routes. Real PostgreSQL tests through WorkspaceRepository cover idempotent sync preserving notes/consent, atomic audit rollback, concurrent consent, draft version/ownership and independent scope restrictions. Native roles are mocked granted in that persistence fixture; it is not Clerk/login/metadata-install E2E. ERP source has its full Java21 reactor and real PostgreSQL integration evidence in `docs/tickets/crm-customer-source-20261117` in ERP.

Release prerequisites: install the native SDK app in the intended workspace using its existing application lifecycle, verify the manifest/schema/role scope, release matching ERP source API and companion server/front changes, then run one authorized admin sync and verify a native profile, notes edit, consent and draft round trip. Back up current CRM/ERP metadata and data before shared-environment mutation. Production release: native image `hypertech-crm:erp-2a250e6b710e` and ERP v1.0.325 (`e2042726`). The native app is installed in the existing Hypertech workspace. Authorized synchronization imported 1,407 contacts from 1,493 source orders across three shops; 53 source orders lacked email. All imported contacts remain UNKNOWN, with no invented consent evidence or sent email. The real Clerk browser session, customer list, customer detail and source order history passed after deploying the session-cookie opt-in header fix. Server and worker are healthy. Exact vendor demo companies, people and opportunities were soft-deleted with an operator snapshot; no real customer was deleted.

No public consent-confirmation flow, Listmonk synchronization/delivery, campaign send, scheduling or attribution is implemented. No actual email is sent. Listmonk remains the intended delivery engine after the native CRM/consent flow is established.

[Exact local verification and limits](customer-marketing-verification.md).

## Native manual campaign workflows

The existing CREATE_RECORD action has a Hypertech-campaign-only branch. It creates native drafts using the same scoped business service as the reviewed CRM form. It accepts only a standard manual native user run of the configured workspace custom application; application/API key/system/agent/restricted/foreign actors are rejected. Worker execution resolves the immutable Clerk identity and fresh ERP grants and customer visibility for every business action, including retries. The user-only ERP decision receives the verified native initiator; the original native user and application context still constrain all ORM reads and writes. No persistent delegated token or system business authority is introduced. Expired Clerk proof or revoked organization CRM administration fails visibly.

A draft ID derives from workspace/run/step. Concurrent retries insert once and return the current draft without overwriting reviewer edits. Native workflow run output retains the campaign record ID. There is no consent transition or email delivery side effect. Existing workflows keep their own versions; no running workflow is rewritten. The operator script `configure-marketing-workflows.cjs` uses native create/version/activation/run services with a freshly authorized existing administrator. It derives three manual workflows per synchronized real shop: consent request (UNKNOWN, minimum0), purchased customer care (SUBSCRIBED, minimum1), repeat customer care (SUBSCRIBED, minimum2). Initial run IDs are recorded privately and a second initial batch is rejected.

## Hypertech company and distinct marketing cohorts

The real Hypertech company uses the existing native Company object and is visible through the native company list/profile. Legacy demo people/opportunities remain hidden; company routes are now available. Customer imports still use the existing Twenty customer object per ERP shop/email key and preserve CRM notes and consent. No buyer is assigned to Hypertech as their employer.

`expand-marketing.cjs` runs an explicitly authorized, bounded import using fresh existing administrator authentication and current ERP decisions per page. It creates only the real Hypertech company (name/domain from the user's existing company context) and refines the three first-purchase workflows/drafts to exactly one purchase. Repeat-purchase cohorts start at two; promotion eligibility still requires SUBSCRIBED. It preserves existing native run history and publishes new workflow versions through the vendor lifecycle, never rewrites active versions or user-authored draft content. The operation saves scoped before snapshots and refuses ambiguous/edited definitions. No consent or outbound email is fabricated.
