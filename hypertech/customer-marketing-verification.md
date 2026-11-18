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
