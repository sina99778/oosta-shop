# Security, storefront and API fixes — 2026-11-04

This change addresses the verified application defects from the local review.

- Serialize fulfillment and receipt transitions with PostgreSQL order-row locks. Keep disclosed inventory sold after a refund. Preserve captured payments awaiting stock with `PAID_PENDING_FULFILLMENT`.
- Limit receipt count per order and buyer/day. Update multipart dependencies and enforce field/part/nesting limits. Normalize Persian phone digits and reject passwords that bcrypt would truncate.
- Reject insecure production JWT configuration, production sandbox verification and unsupported currency/amounts. Normalize IRR/IRT dashboard revenue. Demo seed cannot run in production; use the non-destructive administrator bootstrap instead.
- Normalize forwarded addresses in nginx with an explicit CDN allow-list and proxy subnet. Keep the generated HTTPS upload limit consistent.
- Restrict Telegram management to the administrator's private chat. Require a single-use confirmation before restore or agent mutation, show complete operation arguments, generate temporary filenames internally, and stop accepting API requests during restore. Backups check the dump process as well as compression; restoration runs in a single transaction.
- Restore mobile navigation, external product images, accessible labels/tab controls, input/upload constraints, and readable button contrast. Preserve safe return destinations across login/signup, retain sessions during transient failures, and separate empty lists from errors.
- Add pagination to admin queues, visible mutation errors, resumable unpublished product creation, and an explicit receipt-status refresh. Payment callbacks offer rechecking for uncertain outcomes and lead to the authenticated order rather than an unverified success message.
- Reject malformed JSON responses and cap client request time. Backend outages use a retryable error boundary rather than a product 404.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:security`, and `npm run test:isolated`.

The isolated runner creates a temporary PostgreSQL cluster, applies all migrations, seeds synthetic data, runs the existing 152-check smoke suite plus concurrency/receipt/quota/parser/proxy/client/revenue/backup regressions, then stops and removes its cluster. Set `PG_BIN` if PostgreSQL tools are not in the default Windows portable location or PATH. It never uses the application database.

The storefront was also checked in a real browser with synthetic API responses at mobile width: the external image loads, navigation exposes login/signup, the return destination survives switching forms, unavailable online payments stay disabled, and an upstream 503 displays a retryable store error.

## Deployment and remaining limitations

Follow `DEPLOYMENT.md`. Deploy the new database enum before accepting requests with this application version; normal API container startup runs migrations. Production configuration with sample/short JWT keys or sandbox mode intentionally fails closed. Keep `deploy/nginx/trusted-cdn.conf` synchronized with the actual CDN and match `TRUST_PROXY` to the Docker subnet.

Next.js, request parsers, Zod and other compatible dependencies were updated. A fresh `npm ci --ignore-scripts` was checked. The complete npm audit still reports **19 package warnings: 3 high in the Prisma CLI / @prisma/config / deepmerge-ts chain, and 16 moderate mainly in lint tooling**. These are not claimed fixed; forcing a major Prisma/toolchain downgrade or upgrade was avoided. Review the remaining dependency advisories in a separate compatibility migration. No public-input exploit of the remaining Prisma configuration issue was demonstrated here.

Existing review reports, screenshots, old vulnerability reproduction scripts and raw audit outputs are local review artifacts and are not part of this commit. No production service or database was deployed or changed by the tests.
