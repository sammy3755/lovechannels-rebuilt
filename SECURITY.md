# Security and provider configuration

The browser uses same-origin API endpoints. No database password, Google secret,
Paystack secret, or administrator password belongs in public files. The production
server connects over verified TLS as lovechannels_app, a non-owner role without
superuser, BYPASSRLS, role-creation, database-creation, or private-schema CREATE
privileges. Private tables have RLS enabled with access scoped to that server role;
member record ownership and administrator permissions are checked by the API.
This is a trusted server role, not a client-facing database role. Do not enable a
public SQL/Data API or grant anonymous access to the private schema.

Passwords use asynchronous scrypt (N=131072, r=8, p=1). Existing hashes upgrade on
successful login. New passwords require 15 characters; spaces are preserved.
Session tokens are random and stored only as hashes. HTTPS cookies are HttpOnly,
Secure, SameSite=Strict. Password changes revoke other sessions. Mutations require
JSON, enforce body limits and reject cross-origin browser requests. Queries use
bound parameters. Public user responses use an explicit field allowlist.

Hosted rate limits are database-backed and survive function restarts and rejected
transactions. Login is limited by IP and by account; registration, password changes,
OAuth, and the API have additional budgets. Trusted IP headers are read only on
Vercel. Public analytics require opt-in and exclude private dashboard contents.

Google sign-in uses authorization code flow, PKCE S256, random state, a short-lived
HttpOnly browser binding, nonce, Google signature/issuer/audience/expiry checks and
verified email claims. Challenges are single-use. A matching email never silently
links a Google identity to an existing password account. Sign in with the password
and connect the matching Google account from Member > Profile first.

## Enable Google

Create a Web application OAuth client in Google Cloud. Set its authorized redirect:
https://lovechannels-rebuilt.vercel.app/api/auth/google/callback
Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as encrypted Vercel production
variables, then redeploy. PUBLIC_URL must be the canonical HTTPS site address.
The Google button appears only after configuration. Keep secrets out of chat.

## Operational items still requiring configuration

- No transactional email provider is configured: email verification and self-service
  password recovery are not active. Account assistance currently goes to the office.
- Paystack requires the church's PAYSTACK_SECRET_KEY and provider webhook setup.
- Outbound calls require a chosen provider, consent and credentials; no calls are sent.
- Confirm homecell directory, building map, ministry contacts and published content.
- Account MFA and advanced platform WAF rules have not been configured.

Automated checks cover access control, record isolation, unsafe input, OAuth claim
validation/replay/account linking, rate limits, uploads and payment settlement.
These controls reduce risk; they are not a guarantee against every future attack.
Keep dependencies patched, restrict platform access, and review logs and backups.

## Session duration

Member sessions expire after 15 minutes without authenticated activity or after
8 hours from sign-in, whichever comes first. Administrator sessions expire after
5 minutes without authenticated activity or after 2 hours from sign-in. The API
enforces both deadlines with server timestamps. Activity renews only the idle
limit; it never extends the maximum lifetime. Background status checks do not
renew either deadline. The browser locks private screens when the deadline passes.

Existing sessions without these timestamps are invalid after this upgrade and
require sign-in again. Logout revokes the current session; switching accounts
revokes the replaced browser session. Password changes revoke other sessions.
An authenticated member opening the admin route is offered administrator sign-in,
not redirected to the member dashboard. Both password and Google admin sign-in
require an administrator role from the database. Public navigation does not link
to administration; server permissions remain the access boundary.
