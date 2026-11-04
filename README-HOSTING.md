# Love Channels hosting

The production app runs on Vercel with a private Neon Postgres database. The GitHub repository is `sammy3755/lovechannels-rebuilt`; pushes to `main` deploy through the connected Vercel project.

## Site and dashboards

The public site uses the existing design, media, carousels and colour palettes. Member and administrator routes are `/#/member` and `/#/admin`. Signing in is required; administrator endpoints check the account role on every request. Production never enables the local demo shortcuts.

## Runtime

- Node 24; install with `npm ci`.
- Static files: `public/`.
- Hosted API: `api/index.mjs`, `hosting/handler.mjs`, `hosting/server/`.
- Private schema: `hosting/schema.sql`. Apply this once to a new database before its first deployment.
- Uploaded photographs, sessions and application records persist in Postgres. They do not depend on Vercel's temporary filesystem.
- The original `server/` remains available for the local SQLite preview. `START-WEBSITE.cmd` starts that preview without cloud credentials.

## Vercel environment variables

Set `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `RATE_LIMIT_SECRET` and `COOKIE_SECURE=1`. The bootstrap password creates only the first administrator; it does not reset existing accounts. `TRUSTED_COUNTRY_HEADER=x-vercel-ip-country` reads Vercel's country header for consented analytics. Keep all secrets in Vercel's encrypted environment settings and outside source control. `PUBLIC_URL` must be the canonical HTTPS site URL before enabling Paystack.

## Verification

`npm run test:hosting` runs isolated Postgres integration checks using PGlite, without connecting to production. `npm test` checks the local SQLite edition. Hosted checks cover member isolation, administrator permissions, booking types, testimonies and consent, uploads, questions, campaign publication, analytics, homecell capacity, follow-up consent, and payment signatures, prices and idempotent settlement.

## Services still requiring church configuration

Bank-transfer instructions are available on the giving page. To activate Paystack, supply the church's own `PAYSTACK_SECRET_KEY` in Vercel, set `PUBLIC_URL`, and configure the provider's webhook to `/api/payments/webhook`. Test the provider flow before accepting payments. No card information is collected by this application.

AI outbound calling currently stores consented follow-up requests for preparation; no calling provider is connected and it does not place calls. Import the verified homecell directory in admin before automatic assignments can resolve. The church must confirm the new building address and map link in admin. Specific featured videos, podcast episodes, events, contacts and notices can be edited in admin.

Neon was selected because the connected Supabase organisation had reached its free-project limit. Other Supabase projects were left in place. Do not enable a public database Data API for the private schema; all access goes through the authenticated server.
