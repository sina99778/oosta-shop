# Security overview

A summary of the security measures in the oostaAI platform and how they're verified.

## Authentication & authorization

- Passwords hashed with **bcrypt** (`bcryptjs`), configurable cost via `BCRYPT_SALT_ROUNDS`.
- Stateless **JWT** access tokens. Browsers get them only as an **httpOnly, SameSite=Lax
  session cookie** (`Secure` in production) — never readable by page scripts; API clients
  may still send `Authorization: Bearer <token>`. Cookie-authenticated state-changing
  requests must carry an allowed `Origin`/`Referer` (CSRF defense in depth).
- Emails are matched case-insensitively; login compares against a dummy hash for unknown
  users so response timing doesn't reveal which accounts exist.
- `authenticate` middleware protects private routes; `requireRole('ADMIN')` guards all `/admin/*`.
- Login returns a **uniform "Invalid credentials"** error (no user-enumeration via response).
- `passwordHash` is never included in any API response.
- Order/vault data is **owner-scoped**: a user can only read their own orders/credentials.

## Input validation & rate limiting

- Every request body / query / route param is validated with **Zod**; failures return `400 VALIDATION_ERROR`.
- **Global rate limiter** (120 req/min/IP) on all routes; **strict limiter** (10/15 min/IP) on `/auth/*`.
- JSON body size capped (1 MB).

## Transport & headers

- **helmet** sets secure headers (`X-Content-Type-Options: nosniff`, frame options, HSTS over TLS, etc.).
- `x-powered-by` disabled.
- **CORS** restricted to the configured `CORS_ORIGIN` allow-list.
- `trust proxy` = `TRUST_PROXY_HOPS` (prod default 2: ArvanCloud → nginx) so client IPs are
  correct for rate limiting. Restrict nginx to CDN ranges (`deploy/nginx/snippets/cdn-only.conf`)
  so the forwarded IP can't be forged. Server-side-rendering calls from the web container are
  exempt from the global limiter.
- The web app sends a **Content-Security-Policy** (no foreign scripts, no framing, no plugins)
  plus `nosniff`, `Referrer-Policy` and `X-Frame-Options`.

## Payments & the delivery engine

- Order totals are recomputed **server-side** from `ProductPlan.price` (never trusted from the client).
- Payment is confirmed via **server-side verification** (`/payments/verify`); delivery is **idempotent**.
- Stock is **reserved at checkout** (`SELECT … FOR UPDATE SKIP LOCKED`) and released when an
  unpaid order expires, fails or is rejected; delivery **row-locks the order**, so duplicate
  callbacks/approvals deliver exactly once. Paid-but-out-of-stock orders become
  `PAID_UNFULFILLED` (never silently failed).
- Units from an undone (refunded) sale are `REVOKED`, never resold — the buyer has seen them.
- Delivered credentials are **encrypted at rest** with AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`),
  so DB dumps and Telegram backups don't expose sellable stock.
- Card-to-card receipts are type-checked by **file signature** (not the client's mimetype)
  and capped per order; each user can hold only `MAX_OPEN_ORDERS_PER_USER` unpaid orders.

## AI admin agent (Telegram)

- Payment-gateway changes, contact/trust-badge changes and deletions are **queued** and only
  run after the admin taps ✅ — a prompt injection hidden in a ticket or review cannot apply them.
- The system prompt marks customer-written content as untrusted data; inventory secrets are
  **masked** before tool output is sent to the LLM provider.
- Payment fields are gateway-agnostic; the Zarinpal adapter re-verifies with the gateway.

## Production guards (fail-fast at boot)

When `NODE_ENV=production`, the API refuses to start if:

- `JWT_SECRET` is still the development default, or
- `PAYMENT_PROVIDER=zarinpal` while `ZARINPAL_MERCHANT_ID` is the placeholder.

Error responses never leak stack traces in production.

## Verification

The in-process suite (`npm run smoke -w @oosta/api`) asserts these behaviours, including:

- auth flows + uniform invalid-credentials, `passwordHash` never leaked
- role guard (USER → 403, anonymous → 401), auth rate-limiter trips (429)
- **oversell prevention** via reservation, and idempotent delivery under concurrent callbacks
- **cross-user order access → 404**, unknown payment authority → 404, invalid order payloads → 400

`npm test -w @oosta/api` runs Postgres-backed integration tests for the concurrency and
money paths (double callbacks/approvals, reservation, expiry, PAID_UNFULFILLED, REVOKED,
encryption). Both suites run in CI.

## Operational notes

- Rotate `JWT_SECRET` and database credentials for production.
- Serve only over HTTPS (terminate TLS at Nginx) so HSTS and secure cookies are effective.
- Keep dependencies patched (`npm audit`).
