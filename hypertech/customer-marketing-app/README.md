# Hypertech native CRM application

These Twenty SDK declarations own customer, consent-event and campaign objects in the Twenty workspace database. They do not create ERP tables or reuse licensed vendor campaigning features. Stable universal identifiers make metadata synchronization repeatable.

The companion native server adapter validates fresh ERP permissions and source visibility before every read/write. The application role is deliberately non-assignable and grants no records or tools; it cannot become an authorization bypass. Customer source fields and consent/campaign mutations are controlled by the adapter. Source synchronization never overwrites consent. Consent evidence/audit and campaign drafts remain in Twenty. No delivery or email send is enabled by metadata installation.
