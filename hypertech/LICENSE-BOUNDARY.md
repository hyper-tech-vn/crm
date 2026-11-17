# Hypertech fork boundary

Base: Twenty 2.59.0 (d690a8c63e161d6257e5f0b165fb3d9b6b40ea1f).

Retain upstream LICENSE, notices and trademark policy. Hypertech core modifications follow the applicable AGPL source-availability terms; separate integrations through published interfaces may use the upstream Application Exception. Do not claim ownership of Twenty branding.

Implement the Hypertech Clerk client independently using standard OIDC via openid-client and the ordinary social-login/session extension points in AGPL source. Do not copy, modify, enable, remove checks from, or route through commercial SAML/OIDC identity-provider implementation files marked @license Enterprise. No Enterprise feature flag or fake license is enabled. The paid workspace SSO configuration UI remains unchanged.

The custom authentication provider is Clerk-specific, statically configured by the operator and authorized by ERP through its existing access-control API. The ERP adapter and SQL ownership checks are original Hypertech code within existing AGPL extension points. It is separate from the vendor's configurable Enterprise SSO product.
