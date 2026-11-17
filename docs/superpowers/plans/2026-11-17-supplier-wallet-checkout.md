# Supplier existing-wallet checkout

> **For agentic workers:** Use superpowers:executing-plans inline; one independent final review.

**Goal:** Enable real customer checkout using the existing supplier wallet balances under the owner's explicit acceptance of price drift, without topping up wallets.

**Architecture:** Keep priceCeiling=false for vendors without a contractual ceiling. A separate walletExposure capability requires a persisted per-vendor authorization. Reserve the entire remaining authorization for one order, including its payment window. Retain it on uncertain debit; settle once only after a verified complete/no-charge result. Reject a wallet above the authorized remainder before dispatch. An upstream concurrent top-up cannot be controlled by this system and is outside this authorization.

**Tech stack:** Existing Prisma/PostgreSQL, Express, Zod, Next; no dependencies.

**Spec:** Owner's latest explicit choice accepts price drift up to each existing wallet; snapshots and actual API contracts are in docs/security/2026-11-17/supplier-live-contract-check-fa.md. Preserve 30% dollar markup at quoting; actual drift can reduce realized profit. Never increase the customer's paid price.

## Constraints / scope

- Start with Canboso/PremiKey and Vente, whose real purchase contracts provide idempotency. ToolsMarket buy lacks documented idempotency; AItoolify lacks non-purchasing lookup by our reference and has only USDT .02, so neither is silently enabled.
- Canboso history omits delivery data. After losing the purchase response, hold for review; do not replay POST or try another vendor.
- Exact reviewed product/variant mapping, automated account/code delivery only. No user-supplied passwords or external activation flow.
- Persist budgets separately from public settings. No new public budget mutation endpoint.
- Isolated DB and synthetic fetch only in tests. Do not perform a real purchase merely to verify this release.

## Tasks

- [ ] Add a regression for wallet-based capability without falsely asserting priceCeiling; watch RED. Add budget table and job exposure; reserve/settle under DB locks, block double-reservation and top-ups, preserve uncertain exposure.
- [ ] Build real fixed-origin Canboso and Vente adapters, strict normalized results and read-only recovery. Synthetic HTTP fixtures cover identity, currency, quantities, price drift, no-charge, malformed/timeout, credentials and no purchase on failure. Default registry remains empty unless server-owned rollout flag is set.
- [ ] Connect reservations to quote/order/worker expiry, then real registry to app. Quote/checkout denial paths remain private/no-store and owner-scoped. Refresh stale mapped catalogs before firm quotes.
- [ ] Run verify, affected lint, builds sequentially, both audits. Independent review and fix findings with regression. Record results/limits.
- [ ] Deploy with encrypted off-server backup, initialize budgets no higher than the approved snapshots/current balances, expose only the needed supplier/card paths, verify read-only public/private behavior and timers. No real purchase or bank payment for automated rollout tests.

## Review focus

Concurrent orders cannot reserve the same wallet; a second process/restart cannot forget a pending debit. Unpaid expiry releases only never-dispatched jobs without bank evidence. Settlement cannot refund a reservation twice or refill beyond the original authorization. Revoked authorization blocks dispatch but not read-only recovery. Unexpected price/identity/type cannot cause a second purchase. User authentication/receipt ownership and synthetic denied paths remain covered.
