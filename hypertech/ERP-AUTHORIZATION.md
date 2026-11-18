# ERP authorization for CRM

Clerk authenticates. ERP is the source of capabilities, employee identity and data
scope. No new ERP bounded module or independent assignment database is introduced.
The endpoint lives in existing `user-management/accesscontrol`; its dedicated JWT
filter chain lives in existing `configuration`.

## Assignment and compatibility

ERP V54 adds ten CRM capabilities and six ordinary permission groups. Only
SYSTEM_ADMIN receives the CRM_ADMIN group automatically. V55 additionally seeds
one common CRM group (access and customer read/create/update): directors, deputy
directors, co-founder and system admin at ORGANIZATION; Sales department managers,
Sales leads, Operations department managers and Support leads at UNIT_SUBTREE;
Seller and Support agents at SELF. Other roles receive no new grant. Existing
grants/scopes are preserved; no CRM administration, delete/export or campaign-send
right is added by the common group. Marketing/special rights still use ERP's
existing group UI. Runtime authorization checks capabilities, never role names.
ERP currently assigns groups to roles; for selected employees sharing a role,
use an existing custom role carrying the needed groups and retain their other
required groups. This change does not add per-employee ACLs.

- CRM_SALES: access, customer read/create/update.
- CRM_MARKETING: access, customer read, campaign read/manage.
- CRM_CUSTOMER_DELETE and CRM_CUSTOMER_EXPORT: separate destructive/export rights.
- CRM_CAMPAIGN_SEND: separate campaign send right; also needs customer read.
- CRM_ADMIN: all CRM capabilities. Instance administration additionally requires
  ERP `system:manage` with ORGANIZATION scope; CRM admin alone cannot become
  native instance administrator or impersonate users.

Native Member/Admin roles are a compatibility projection, assigned on login.
Native roles can further restrict an action; they cannot bypass the ERP checks.
An admin promotion may require sign-in again for native UI/settings access.

## Enforcement

The callback asks ERP before provisioning membership. A private core table links
native user/workspace member to Clerk subject and ERP organization/employee. These
identities cannot be silently rebound by changing an email. A legacy unbound
account needs an ERP CRM administrator to reconcile it. The native workspace must
already exist. No workspace is created and no invitation email is sent.

The validated Clerk ID token is encrypted with AES-GCM, a purpose-derived APP_SECRET
key and native user ID as AAD. The encrypted column is excluded from default
selections and has no public GraphQL/API representation. ERP validates signature,
issuer, expiration, verified identity and CRM audience. CRM never accepts browser
permission claims. The proof expires at the ID token's expiry and requires a new
Clerk login; native session renewal cannot extend it.

Each authenticated HTTP request resolves current ERP authorization; duplicate
checks share only a request-local promise. There is no cross-request permission
cache and no allowlist fallback. ERP denial, wrong organization, absent binding,
expired proof and ERP outage fail closed. A signOut-only mutation remains usable
after access is revoked. API keys, application principals and impersonation are
not accepted for this adapter.

Customer list/count/aggregate/join and mutation SQL applies independent read and
write grants even through native permission-bypass repositories. Company scope
uses accountOwnerId. Person/opportunity scope uses the current company's owner;
without a company, it uses immutable createdByWorkspaceMemberId. UNIT_SUBTREE maps
ERP's current active employee IDs to bound native workspace members. Unmapped IDs
never grant ownership. Queries must match the configured workspace schema.
Reference changes check and lock the destination company within the write
transaction. Scoped callers cannot detach a company or forge creator provenance.

Unknown objects/operations require ERP CRM admin. Merge/upsert, raw workspace SQL,
subscriptions and unsupported scoped objects are denied rather than widened.
Raw SQL requires the full ORGANIZATION CRM capability set. Native campaign/list
objects lack stable ownership columns: campaign read/manage require ORGANIZATION
scope; sending/tests/previews additionally require ORGANIZATION customer read and
campaign send. There is no listmonk connector in this change. Signed public asset
links retain their native expiry; this adapter does not retract already issued
public URLs. Background system maintenance retains native authorization; user
jobs without an ERP request decision cannot silently acquire one.

## Release order

This branch is not deployed. Before release:

1. Back up the native database. Run ERP V54 and the generated Twenty 2.59 fast
   instance command `AddHypertechErpIdentityFastInstanceCommand`. Current compose
   disables automatic migrations, so the new table must exist before switching
   the CRM image. Existing users/workspaces/customer rows are not backfilled or
   reassigned by either migration.
2. Configure ERP's endpoint flag/client ID and CRM's ERP organization/workspace/native
   admin-role IDs. Retain the stable APP_SECRET. Remove the obsolete Clerk allowlist
   variable from the service environment.
3. Deploy the matching committed source image, then log in through Clerk as an
   existing ERP system admin. Check a scoped sales account, marketer, denied account,
   existing-session revocation and ERP outage through the real browser.
4. For rollback, restore the previous image/configuration together. The additive
   private table and permission seeds may remain; reverting the application does
   not require deleting customer data. Reverting to the old image also restores
   its old authorization behavior and must be treated accordingly.

## Local verification

Focused authorization/Clerk and native query-builder tests use the ordinary server
Jest configuration. Set ERP_CRM_TEST_DATABASE_URL only to a disposable PostgreSQL
database to enable the real SQL ownership suite. The generated identity migration
was produced using InstanceCommandGenerationService against an isolated database;
its resulting schema matches the entity metadata. Do not run the generation step
against production.

The contract-only type check is `tsgo -p hypertech/tsconfig.erp.json`; the backend
SWC build is separate. Whole-server type checks also depend on all upstream SDK,
email and shared declaration outputs and must not be inferred from SWC compilation.

Local delivery checks: 150 focused tests passed together, followed by the additional
trailing-slash permission case and a separate identity migration PostgreSQL test.
The latter exercises the generated command beside legacy rows, verifies default
proof-column exclusion and unique employee/subject bindings, and rolls back its
fixture. Set ERP_CRM_MIGRATION_TEST_DATABASE_URL only to a separate empty database
for that test. Changed-source lint, contract type check and backend SWC build passed.
The full-server comparison retains the unchanged baseline's 69 declaration/type
errors and introduces no new errors; a clean full-server type check is not claimed.

## Native customer marketing (local feature, not released)

[Customer marketing](customer-marketing.md) keeps CRM state in native Twenty objects. ERP supplies only read-only source contacts/order facts and fresh independent visibility/capability checks. Native ORM scopes custom records before reads/counts/writes; dedicated actions own consent/audit and campaign mutations. Application installation grants no additional role permissions. Existing immutable identity, Clerk authentication and ERP authorization boundaries remain in force.
