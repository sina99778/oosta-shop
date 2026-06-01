# Security overview

A summary of the security measures in the oostaAI platform and how they're verified.

## Authentication & authorization

- Passwords hashed with **bcrypt** (`bcryptjs`), configurable cost via `BCRYPT_SALT_ROUNDS`.
- Stateless **JWT** access tokens (`Authorization: Bearer <token>`).
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
- `trust proxy` set to 1 so client IPs are correct behind the reverse proxy (accurate rate limiting).

## Payments & the delivery engine

- Order totals are recomputed **server-side** from `ProductPlan.price` (never trusted from the client).
- Payment is confirmed via **server-side verification** (`/payments/verify`); delivery is **idempotent**.
- Inventory is claimed atomically inside a DB transaction using `SELECT … FOR UPDATE SKIP LOCKED`,
  so concurrent paid orders can **never** be assigned the same unit (no overselling).
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
- concurrent **oversell prevention** (exactly one paid, one out-of-stock) and idempotent delivery
- **cross-user order access → 404**, unknown payment authority → 404, invalid order payloads → 400

## Operational notes

- Rotate `JWT_SECRET` and database credentials for production.
- Serve only over HTTPS (terminate TLS at Nginx) so HSTS and secure cookies are effective.
- Keep dependencies patched (`npm audit`).
