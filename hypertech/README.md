# Hypertech CRM

Fork of [Twenty](https://github.com/twentyhq/twenty) pinned to `twenty/v2.59.0`
(`d690a8c63e161d6257e5f0b165fb3d9b6b40ea1f`). Hypertech changes live on
`hypertech/clerk-marketing`.

## First customization: Clerk sign-in

The login screen exposes **Continue with Hypertech** when the provider is enabled.
The independent provider uses Clerk's authorization-code flow with PKCE, state,
nonce and an authenticated, encrypted, five-minute browser transaction cookie.
The OIDC library verifies the ID token; when required email claims are absent,
it also verifies the matching UserInfo subject; the application then requires a verified
email. ERP authorizes access before entering Twenty's existing user/workspace/session flow.
No Clerk role, metadata flag, email allowlist or Twenty membership grants ERP authority.

Only single-workspace deployments and the `https://clerk.hyper-tech.vn` issuer are
supported. The integration does not create an email/calendar connected account.
Twenty's existing workspace membership and role checks still apply.

Configure the following **runtime secrets on the server**, never in Git:

```dotenv
AUTH_CLERK_ENABLED=true
AUTH_CLERK_ISSUER=https://clerk.hyper-tech.vn
AUTH_CLERK_CLIENT_ID=<confidential OAuth client ID>
AUTH_CLERK_CLIENT_SECRET=<confidential OAuth client secret>
ERP_CRM_BASE_URL=https://erp-api.hyper-tech.vn
ERP_CRM_ORGANIZATION_ID=<existing ERP organization UUID>
ERP_CRM_WORKSPACE_ID=<existing Twenty workspace UUID>
ERP_CRM_ADMIN_ROLE_ID=<existing native admin role UUID in that workspace>
IS_MULTIWORKSPACE_ENABLED=false
SERVER_URL=https://crm.hyper-tech.vn
APP_SECRET=<existing stable random secret of at least 32 characters>
```

Register the exact callback `https://crm.hyper-tech.vn/auth/clerk/callback` in
Clerk. The OAuth client must support `openid profile email`, S256 and
`client_secret_basic`. Keep secrets out of the image and build logs. Restart the
application after changing OAuth configuration. ERP must enable `app.crm-access.enabled=true`
and set `app.crm-access.client-id` to the exact confidential CRM OAuth client ID.
The issuer and JWKS remain ERP's existing Clerk configuration; the extra audience
is accepted only on the CRM access GET and the closed read-only
`/api/v1/orders/crm-customers/**` source API in the matching ERP feature.

See [ERP-AUTHORIZATION.md](ERP-AUTHORIZATION.md) for permissions, scope, migration,
compatibility, verification and release order. Existing native sessions need a new
Clerk login to establish the immutable ERP identity binding. ERP access is checked
on each authenticated request; revocation does not wait for native session expiry.
Clerk logout by itself does not revoke native sessions, but expired Clerk proof
requires reauthentication. No refresh token is retained.

## Original Clerk integration verification

Use Node matching the root `engines`, the pinned Yarn release, and the upstream
build workflow. The focused provider tests run with:

```sh
node node_modules/.bin/jest packages/twenty-server/src/engine/core-modules/auth/clerk \
  --config packages/twenty-server/jest.config.mjs --runInBand
```

Validation of the first customization: 15 provider tests passed, the isolated
`node node_modules/.bin/tsgo -p hypertech/tsconfig.clerk.json` check passed,
changed-file server/frontend lint passed, and the backend SWC build passed.
The complete frontend production build passes after building UI/SDK/renderer
dependencies and extracting/compiling Lingui catalogs. Full monorepo type checks
have not been rerun with all backend dependency outputs; the isolated provider
check is green. A real Clerk login remains a release verification step.

Before enabling production: build both server and frontend, configure a real
confidential client, check the redirect and cookie flags, complete a permitted
admin login and verify an unauthorized account is denied. Keep the previous
image available for rollback. `compose.upstream.yml` is the deployment baseline,
not evidence that this custom source is already deployed.

## Customer marketing

[The native CRM feature](customer-marketing.md) stores customers, notes, consent
evidence and campaign drafts in Twenty, with source-only ERP synchronization and
fresh ERP authorization. Its SDK application must be installed before release;
local verification is not a production installation. Listmonk delivery and
unsubscribe synchronization remain future integration work; this feature sends
no email.

See [LICENSE-BOUNDARY.md](LICENSE-BOUNDARY.md) and the upstream [LICENSE](../LICENSE).
Publish the matching source commit and source URL with each deployed custom image.

## Release image

The release image layers the compiled server changes and the complete frontend
build over the exact upstream amd64 image digest in `hypertech/Dockerfile`.
Unchanged server code and dependencies remain from that pinned image. This does
not run a second dependency installation on the execution host.

After committing source changes and completing the normal dependency, backend
and frontend builds:

```sh
python3 hypertech/package-image.py /tmp/hypertech-crm-release
# Run on an amd64 Docker host with that context:
docker build --build-arg SOURCE_COMMIT=<git-sha> -t hypertech-crm:clerk-<git-sha> /tmp/hypertech-crm-release
```

`compose.production.yml` is the Coolify desired state. It uses an explicitly
loaded local image (`pull_policy: never`), preserves the upstream volume names,
and disables password login. Set `HYPERTECH_CRM_IMAGE` to the release tag and
supply the Clerk runtime variables in Coolify. Coolify manages the public HTTPS
route. Keep the previous compose, environment and image for rollback.

Coolify attaches a shared `.env` to service containers. Non-application services
explicitly override application secrets with `${HYPERTECH_NONAPP_EMPTY:-}`; the
placeholder avoids Coolify replacing a literal empty value with a stack secret.
Verify rendered Compose and actual container environments before each release.

When Clerk is enabled, the custom guard denies the native password sign-in,
sign-up, email-verification login and password-reset API entry points. The login
screen hides credentials even if an existing workspace still advertises them.

Before each frontend release run `lingui extract --overwrite --clean` and
`lingui compile --typescript` in `packages/twenty-front`, then `vite build`.
Generated translation catalog churn is a build artifact, not a source change.
