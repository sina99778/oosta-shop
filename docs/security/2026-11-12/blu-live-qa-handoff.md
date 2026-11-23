# Blu live QA handoff

The subsequent real receipt was matched and replay-tested successfully. The temporary receipt ingress was retired. See [the real receipt trace](blu-real-receipt-trace.md) for the follow-up fixes, evidence and remaining limits.

Release `20261112-blu-live-qa` was activated on 2026-11-12. API readiness, database health and existing storefront read access passed after recreation. The production API Docker image was built from the staged source. The previous API image and private environment were retained for rollback. Pre-release and post-invoice PostgreSQL backups are stored privately on the storefront host.

## Invoice and amount reuse

The previous 10,000 IRR invoice expired. Its bank-and-amount reservation remains in place. A new campaign issued invoice `cmwe4kxl20001ql01eg5gmlqn` for 10,010 IRR, equal to 1,001 toman. It expires at 2026-11-12T23:04:26.352Z. The optional private QA amount is constrained to 10,000 through 10,240 IRR in 10 IRR increments. Repeating issuance returns the same invoice. Repricing an existing campaign fails. The regression reproduced the fixed-amount conflict before the configuration change.

Issuance is still loopback-only and checks the current database ADMIN role. The owner is the existing ordinary QA profile. The private checkout returns bank details only to that owner, uses private/no-store caching, and contains no product or inventory items. Public invoice issuance returned 503. QA fulfillment and manual approval remain refused.

## Signing and narrowly scoped ingress

The Iran host generated an Ed25519 private key, kept root-only on that host, and a separate tracking HMAC key. The shop received the public verification key and HMAC key through verified SSH. Sensitive values were not printed. The bank session remains encrypted on the Iran host.

Host Nginx now includes `/etc/nginx/oosta-blu-qa-preview.conf`. The two HTTPS POST exceptions are `/api/internal/blu-events` and `/api/orders/cmwe4kxl20001ql01eg5gmlqn/receipt`. The signed ingress has a 4 KiB body limit. Other methods return 405 and plaintext requests return 503. Existing preview restrictions apply to all other writes.

A public unsigned observation returned 401. A correctly signed, deliberately invalid empty observation sent from the Iran host reached the application and returned 400/BLU_EVENT_INVALID. This checks signature transport without inventing a bank transaction. Incoming evidence is scoped to the active QA campaign. The receiver records provisional evidence and never fulfills an order or marks it paid.

The live receipt endpoint returned 401 for anonymous access, 400/NO_FILE for an owner request without a file and 404/NOT_FOUND for a non-owner multipart submission. The previous invoice's receipt endpoint remained blocked with 503. These checks left the new invoice PENDING with zero receipts and zero bank observations. Nginx syntax and reload succeeded.

## Verification and remaining work

`npm run verify` passed using disposable databases, including the reissue, same-campaign repricing, authorization, failure and no-fulfillment regressions. Full lint and the local production build passed. The API production Docker build and deployed preview HTTP smoke passed. Both `npm audit --omit=dev` and `npm audit` reported zero vulnerabilities. The first local audit attempts failed certificate validation. Repeating with Node's system certificate authority support succeeded while preserving TLS verification.

Computer-use initialization failed with a kernel-assets path error, so no QA browser session was prepared. The existing private QA profile file provides the login credentials. Its contents were not printed.

The user must still make the exact manual test transfer during the invoice window, then upload the real receipt and tracking code under the QA account. Bank reading, signed publication and end-to-end correlation of that real deposit are still pending. There has been no real transfer in this phase. The bank publisher currently requires a private interactive terminal. Operation is provisional and operator-driven, and automatic sales approval remains pending real-bank evidence and settlement evaluation. After the test, remove the exact receipt exception from the Nginx snippet and reload after `nginx -t`. This document records the tested scope, and does not establish security of the whole deployed system.

