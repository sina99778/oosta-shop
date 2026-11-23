# Admin order workspace

The order list supports the full order ID or its displayed eight-character suffix. The server validates an alphanumeric identifier and matches it together with the existing status and pagination filters. Full IDs use equality. A suffix can match multiple orders, so the UI shows the matching list.

Order pages reuse the authenticated admin detail and receipt endpoints. Scoped receipt history retains pagination and counts only the selected order's pending receipts. It reuses the existing private receipt preview and approval implementation. The order detail selects only inventory status and counts reserved and delivered units separately. Existing role checks, cache headers, receipt authorization, bank verification, and idempotent delivery remain in place.

The disposable regression covers exact scope, search with status, rejected wildcard input, anonymous and ordinary user denial, reserved versus delivered counts, and credential exclusion. The public preview write restrictions are unchanged.

`npm run verify`, `npm run lint`, both production image builds and both npm audit commands passed. The audits reported zero vulnerabilities. Synthetic browser renders fit 320, 390 and 1440 pixels without horizontal overflow. There are no database migrations in this release.

Release `20261116-admin-orders` served the Persian and English administration pages over HTTPS. Anonymous search, detail and receipt requests were denied with a private, no-store response. Authenticated read-only smoke checks against the running API verified order search, detail and scoped receipt reads, current-role enforcement, invalid search validation and the missing-order response. Public payment configuration still has both methods disabled. Receipt approval and end-to-end delivery were tested only against a disposable database.
