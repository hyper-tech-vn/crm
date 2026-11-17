# Hypertech CRM

Fork of [Twenty](https://github.com/twentyhq/twenty) pinned to `twenty/v2.59.0`
(`d690a8c63e161d6257e5f0b165fb3d9b6b40ea1f`). Hypertech changes live on
`hypertech/clerk-marketing`.

## First customization: Clerk sign-in

The login screen exposes **Continue with Hypertech** when the provider is enabled.
The independent provider uses Clerk's authorization-code flow with PKCE, state,
nonce and an authenticated, encrypted, five-minute browser transaction cookie.
The OIDC library verifies the ID token and matching UserInfo subject; the application then requires a verified
email and an exact Clerk subject/email pair from the operator's allowlist before
entering Twenty's existing user/workspace/session flow.

Only single-workspace deployments and the `https://clerk.hyper-tech.vn` issuer are
supported. The integration does not create an email/calendar connected account.
Twenty's existing workspace membership and role checks still apply.

Configure the following **runtime secrets on the server**, never in Git:

```dotenv
AUTH_CLERK_ENABLED=true
AUTH_CLERK_ISSUER=https://clerk.hyper-tech.vn
AUTH_CLERK_CLIENT_ID=<confidential OAuth client ID>
AUTH_CLERK_CLIENT_SECRET=<confidential OAuth client secret>
AUTH_CLERK_ALLOWED_IDENTITIES=[{"sub":"user_REPLACE","email":"admin@example.com"}]
IS_MULTIWORKSPACE_ENABLED=false
SERVER_URL=https://crm.hyper-tech.vn
APP_SECRET=<existing stable random secret of at least 32 characters>
```

Register the exact callback `https://crm.hyper-tech.vn/auth/clerk/callback` in
Clerk. The OAuth client must support `openid profile email`, S256 and
`client_secret_basic`. Keep secrets out of the image and build logs. Restart the
application after changing OAuth configuration. Removing an allowlist entry
blocks future logins; revoke that user's existing Twenty sessions separately.
Clerk logout does not automatically revoke an existing Twenty session.

## Verification

Use Node matching the root `engines`, the pinned Yarn release, and the upstream
build workflow. The focused provider tests run with:

```sh
node node_modules/.bin/jest packages/twenty-server/src/engine/core-modules/auth/clerk \
  --config packages/twenty-server/jest.config.mjs --runInBand
```

Validation of the first customization: 11 provider tests passed, the isolated
`node node_modules/.bin/tsgo -p hypertech/tsconfig.clerk.json` check passed,
changed-file server/frontend lint passed, and the backend SWC build passed.
The complete monorepo type checks are not green in this focused checkout: the
email/client SDK/UI dependency outputs are not fully built. A complete frontend
production build and real Clerk login remain release prerequisites.

Before enabling production: build both server and frontend, configure a real
confidential client, check the redirect and cookie flags, complete a permitted
admin login and verify an unauthorized account is denied. Keep the previous
image available for rollback. `compose.upstream.yml` is the deployment baseline,
not evidence that this custom source is already deployed.

## Planned marketing integration

Twenty holds customer profiles, companies, pipeline and activity. listmonk sends
campaigns. A connector still needs to be implemented: export only opted-in
contacts, map segments to lists, deduplicate email addresses and propagate
unsubscribe/suppression back to the CRM. This fork does not currently synchronize
contacts or send campaigns.

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
