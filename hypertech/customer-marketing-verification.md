# Native CRM verification — 17 November 2026

ERP source commit `f4326b84a` contains only read APIs; no CRM migration/state remains in ERP. Native source baseline `0e232bb7425aaa239b3c2125863c5895d981e4fc`.

- Full Twenty server and frontend `tsgo -p tsconfig.json --noEmit`: PASS, direct execution without Nx cached results.
- Changed frontend/server type-aware oxlint: zero warnings/errors. Prettier and git diff checks pass.
- Backend focused Jest:51 tests in7 suites passed, including5 native PostgreSQL persistence tests and existing scoped ORM regressions. One unchanged identity-migration test was explicitly skipped because its separate migration DB was not configured; it is not claimed as tested here.
- Frontend Jest:347 tests in7 suites passed. Sync invalid-response/failed-page, stale requests, consent/campaign form, CSV injection, navigation and legacy-landing behavior covered.
- SDK app typecheck and CLI app build:PASS. Customer record layout and field metadata validated; not installed on a real workspace yet.
- Lingui extract/compile, production Vite build and SWC server build:PASS (12543 source files compiled). Generated catalog source churn restored after the build; production artifacts retain the extracted messages.
- CUA visual review: real feature components in a clearly labeled synthetic fixture shell, desktop and390×844 mobile. Checked list/sync success, notes/consent detail and campaign live text preview. Screenshots are fixture previews, not production data or a native metadata-install E2E. A browser dispatch timeout on shop selection was not treated as a successful selection/save; form saving is covered by UI and real PostgreSQL tests separately.

Raw logs/screenshots are in ignored workspace `output/crm-customer-marketing-20261117/`; hashes identify the exact retained evidence. Real PostgreSQL persistence tests use normal WorkspaceRepository and ERP policy storage, with vendor permissions mocked granted. The new metadata profile layout has only schema/build validation, not live native record-page verification.

No push, shared deployment, app installation, production source sync or real email send occurred. Native release still needs app lifecycle installation, schema/role verification and authenticated source-sync/profile/consent/draft smoke checks with the matching ERP API. Manual admin sync is the version-one trigger. Listmonk delivery/public consent confirmation are not implemented.

Application manifest content hash: `c8082156904dfba0c82140e3bc3a7b1b89f84da529bf3e57a042746ae7bdd05d`.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `final-server-tests.log`           | `25051ef2619724a915abd33baea791d406c8674a3544edb42de656f5dd93eb88` |
| `final-front-tests.log`            | `488819d88485fd770b0e1f46fece8b01f15098750b352b847cb37323e08205ac` |
| `final-twenty-server-lint.log`     | `502906f220e267d8a79cf1fb7ba02457d3e4b4b2a3f6931aa463f91163c00725` |
| `final-twenty-front-lint.log`      | `7f9147b4ddafe29de62ec5ccb580fe296b09232f632a433b4fc1ca684b52d945` |
| `final-twenty-server-types.log`    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `final-twenty-front-types.log`     | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `final-app-types.log`              | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `final-front-build.log`            | `cf7413ee50e37e6196af0c3592da02c80e54c6ef7e9fb5a53e94faa6323f9756` |
| `final-server-build.log`           | `935658d45c1d64b9703bb418a7f9a3e47e0cf2da2ebf9c956b1e7595b7e9869b` |
| `final-app-build.log`              | `7e1c0edb22fca8747186b22741d7ede047d40630c88294f2be50ae5fd48626e0` |
| `native-customers-final.jpg`       | `44bd36450834efc77cd1ff718741b3c3e5c91d35d43abdeddb3bf2ac49ea6034` |
| `native-customer-detail-final.jpg` | `cd3284c8095370906dc821eb550872e32548ea7365d61dd42023aaf0d1b1f3cd` |
| `native-customer-mobile-final.jpg` | `44c8fb9285c3c1e4f62cee5b525bc43343449cfcf3e7460af7fbfb9a99cb2aef` |
| `native-campaign-final.jpg`        | `338a68c861dfd667750fbbe78d9ee63ad47124013aa7cc7ab1b067b3fc4def93` |

## Release compiler correction

Direct SWC compilation passed syntax checks but emitted ESM with unresolved src aliases. The isolated new-image bootstrap detected this before rollout. Rebuilt with the repository production command `nest build --path ./tsconfig.build.json` (10589 files, CommonJS and resolved aliases); packaging now rejects the wrong compiler output. The first image candidate was never started in production. Native image application-context preflight is required before switching Coolify.

The image bootstrap also detected JwtAuthGuard missing WorkspaceCacheStorageService in AuthModule. Imported the existing WorkspaceCacheStorageModule (no new module), then reran full server typecheck, changed-file lint,32 focused tests and the Nest build successfully. The replacement image must pass the same isolated bootstrap before release.

Production metadata installation showed custom-object physical tables use the native underscore prefix. Fixed consent-evidence scope lookup to use computeTableName and changed the PostgreSQL fixture to use real custom-object naming. Added scoped evidence reads for two customers. All51 targeted backend tests, full server types, changed-file type-aware lint and the Nest build pass after this correction. No customer consent was changed in production for testing.

The live browser exposed a missing native session-cookie opt-in header on the new REST client: Clerk login succeeded but the BFF correctly refused ambient cookies. Added the same shared SESSION_COOKIE_OPT_IN_HEADER_NAME used by Apollo, without reading or exposing session/Clerk tokens or relaxing server policy. All347 frontend tests, full frontend types, changed-file type-aware lint, Lingui extract/compile and production Vite build pass. The candidate backend is healthy; authenticated HTTP BFF/native GraphQL verification confirms1407 real contacts,3 shops,1493 source orders and all1407 UNKNOWN consent states. The corrected image `2a250e6b710e` passed real-browser Clerk session/customer list/detail/source-order verification in production on 2026-11-18.

## Manual workflow increment

39 marketing tests (including real PostgreSQL concurrent workflow draft creation and preserving reviewer edits) and17 existing ERP authorization/scope tests pass. Full server typecheck, changed-file type-aware lint and production Nest build pass. The worker action has no mail or consent side effect. Workflow run/version/step IDs remain native. Production backup `twenty-before-workflows.dump` restored into isolated PostgreSQL16 with1 user,1 workspace and1407 contacts; SHA256 `60e3c1f6f151fd2b985c3ec55cc734004952f1ff52f6b5c928181c1f3c07f019`. Deployment/bootstrap/browser/run evidence is recorded separately after release.

## Production workflow verification · 2026-11-18

Runtime server/worker image `hypertech-crm:erp-0a1254362fef`, source `0a1254362fef4cb8ab45bdb747376137855b21ca`, is deployed through the existing Coolify CRM service. Both containers run with zero restarts; server health is green. Operator-only source `3834b416` refreshes the native workflow/version/navigation flat metadata maps before configuration: the first attempt correctly refused to delete persisted seed workflows absent from a stale flat cache, with no data mutation. The native invalidate/recompute API resolved the inconsistency; no raw metadata writes or guard bypass was used.

The two exact vendor defaults had unchanged creation/update timestamps and zero run history. Their full definitions and database restore point were saved privately before native lifecycle deletion. Five vendor companies, five people and six opportunities remain soft-deleted; live counts are all zero. Real customers remain1407, all UNKNOWN, and consent evidence remains zero.

Nine native manual workflows are active: HANOSS, HangCreative and JanyCreative each have consent-request, purchased-customer care and repeat-customer care. All nine first runs completed through the live worker and produced nine native version1 drafts. The real browser shows the nine active workflows with a successful recent run and nine drafts in Campaigns. The native customer profile layout, source order detail and native session-cookie authorization were verified. The JanyCreative repeat-customer draft matches18 customers and correctly has0 eligible promotional recipients. No email, public confirmation, schedule or automatic source sync is enabled.

The increment passed39 marketing tests,17 existing ERP authorization/scope tests,29 focused frontend tests, full server/frontend types, changed-file type-aware lint, Nest production build, Lingui extraction/compilation and Vite production build. New image application-context bootstrap passed before traffic switched. Production screenshots and hashed verification logs are in the task release evidence directory.

Rollback: deactivate the nine new manual workflow versions before restoring the prior `2a250e6b710e` image through the existing image variable and Coolify lifecycle. Keep additive native customers/drafts and consent history; never restore the pre-import database over newer business data. Exact old vendor definitions remain in the private operator snapshot if restoration is intentionally needed.

## Hypertech company and cohort expansion · 2026-11-18

Source/image `03778448c49bc56f6a37363f9cbb7b26e527bf53` / `hypertech-crm:erp-03778448c49b` is deployed to the same Coolify service and persistent volumes. Full frontend types, changed-file type-aware lint,30 focused frontend tests, Lingui and Vite production build pass; the isolated candidate application-context bootstrap passes. Server is healthy and server/worker have zero restarts. Backend runtime sources and ERP modules are unchanged.

A fresh native database backup restored successfully with1407 contacts before expansion (SHA256 `becb4ae49f1013c3ce859f01588df5f42072c3233bb51f2155ee5f3b84c4467c`). Authorized paged imports raised the native count to1422; a final real-browser sync processed1423 contacts, adding16 compared with the before-state. Consent remains UNKNOWN for all1423. The first operator attempt imported customers but the native API rejected an invalid optional link subfield before company creation. Correcting it to the native LinksMetadata structure succeeded; the native company hook stores the canonical domain without protocol. No guards or validation were disabled.

The existing Company API created one real Hypertech record, domain `hyper-tech.vn`, owned/created by the existing administrator. Company list/profile and the new Company navigation are verified in the real Clerk-authenticated browser. Buyer records remain per shop; they are not falsely assigned to Hypertech as employees. No other demo companies/people/opportunities were restored.

Nine draft campaigns and nine active native workflows remain. Three first-purchase workflows publish new versions through the native lifecycle; old run/version history is preserved. Their existing campaign drafts are updated with optimistic versions to minimum1/maximum1 purchase, while repeat cohorts begin at2. The three consent-request cohorts still target UNKNOWN contacts with minimum0. Read-only live assertions confirm the active definitions and nine drafts have these distinct ranges. The browser verified the JanyCreative first-purchase draft at1..1,996 matched contacts and0 eligible promotional recipients. Nothing is sent and no consent evidence is invented. Source synchronization and workflow triggering remain manual.

Production evidence/screenshots are in `output/crm-marketing-expansion-20261118` in the shared task workspace. Private before snapshots remain on the execution host under the existing restricted operator backup directory. A UI rollback can restore the previous `0a1254362fef` image while preserving the added company, customers and draft/version history; it would hide Company navigation again. Do not restore the older whole database over the newly imported customers.

## Native Twenty UI correction — 2026-11-18

Authoritative direction: use Twenty's existing UI. The supplied phone image is the
rejected custom page, not the target design. Native record index/list/table/profile,
view picker, filters, sorting, command menu and routed side panel own presentation.
No new ERP bounded module, application role or backend authorization rule is added.

| Region/capability | Native owner | Preserved behavior |
| --- | --- | --- |
| Customers/segments | RecordIndexContainer, LIST/TABLE, native saved views | ERP row scope; search/filter/sort/selection; native profiles |
| Campaigns | Native campaign record index/profile | Nine existing drafts; versioned scoped saves |
| Customer profile | Native page layout and fields widget | Editable notes/name; protected source/consent fields |
| Campaign profile | Native fields widget visibility overrides | Business fields visible; technical IDs hidden |
| Operations | PageCardLayout/RecordShowPageHeader/command menu | Sync/export, consent evidence, ERP orders, draft editor |
| Mobile navigation | Native MobileHomePage/drawer items/bottom bar | Reachable customers, campaigns, company, account and permitted workflows |
| Legacy URLs | Native record/index redirects | Source-key customer bookmark resolves to the same native UUID |

Palette: no new brand or neutral palette. All surfaces, text, borders, spacing and
icons inherit Twenty theme tokens/native components in both themes. No bitmap
mockup was generated. Native controls remain keyboard accessible; narrowed headers
use short visible labels with the full accessible name.

Database restore test before metadata configuration: SHA256
`2cbf590a9b36cd3f968ae84c434ab67fcf86bfc24c61c0441029fe68e9fc460c`,
restored workspace/user/contact counts `1|1|1423`. Configuration uses native
ViewService/ViewFieldService/ViewFilterService with fresh ERP administrator scope.
Eight deterministic workspace views verified. Latest authorized ERP sync produced
1431 customers; consent events remained zero and existing campaign drafts nine.
Workflow activation/history and real consent were not modified by view configuration.

Local behavior tests: legacy record routing, audience consent/shop/purchase query
filters, denied/allowed ERP capabilities and native side-panel navigation. Existing
campaign validation/version conflicts, request abort/error, CSV formula protection
and API tests retained. Native mobile LIST observed at 390px and 320px, with native
overflow chips for additional fields; consent SUBSCRIBED filter correctly returned
zero. Native campaign profile resolved authored visibility overrides and showed no
technical source/shop/employee IDs. Final deployment screenshots/checks recorded
below when completed.

Release gates: 36 tests in 8 suites passed; direct `tsgo -p
packages/twenty-front/tsconfig.json --noEmit` passed. Type-aware lint identified
only static style issues (duplicate imports, braces, naming and prop spreading),
which were corrected; final focused oxlint reported zero warnings/errors. Lingui
extract/compile and Vite production build passed. Generated catalogs were restored.

Published runtime source `3e799ae2ca3536a620e0729ae2a459c120d9c3d3`, image
`hypertech-crm:erp-3e799ae2ca35` (image revision label matches source). Image AppModule
bootstrap passed before cutover. Coolify desired image, existing PostgreSQL volume
and ERP/Clerk configuration validated before StartService. Server healthy, worker
running, both zero restarts. PostgreSQL/Redis healthy; 1431 customers and nine drafts
preserved after deployment, zero consent events.

Live browser verified legacy `/marketing/customers` redirect to deterministic native
LIST, native header sync action, populated 390px list and count 1431. Native sync
opens a routed full-screen panel on mobile and reports page progress without email
sending. Additional interaction evidence follows.

Live acceptance found a native refetch defect: matching a find-many operation by
name also resumed skipped pickers with `id.in: []`. Source synchronization completed
1431 records but the subsequent refresh surfaced a filter error. The shared native
`useRefetchFindManyRecords` now skips `standby` queries, matching the existing native
aggregate/workflow refetch pattern. Active query failures still propagate. Two
regression tests added; 38 tests in nine suites, focused lint and rebuilt frontend
passed. No backend policy or query validation was relaxed.

Consent panel showed current UNKNOWN and disabled save without evidence. No real
consent was edited. Native command menu order lookup stayed open in its routed
panel and rendered the existing ERP order with its Vietnamese status. A fresh
page load rendered the populated customer profile and protected source fields.
