# Supplier variants and read-only pricing implementation plan

User approved implementation on 2026-11-07 and explicitly overrode unknown warranty: normalize it to NONE. No guessed profit or exchange rate; no real external purchase.

Architecture: extend ProductPlan with structured variant/source and private reviewed supplier mappings, snapshot selected attributes into OrderItem. Reuse private SiteSetting keys for normalized supplier catalog snapshots and pricing settings; public settings whitelist excludes them. Five fixed-host GET-only adapters keep Canboso accounts separate. Supplier quotes are explicitly indicative, authenticated, no-store and never accepted by existing order creation. Supplier purchasing stays unavailable until a separately verified financial workflow exists.

- [x] Red tests for unknown warranty normalization, exact attribute matching, private mapping isolation and safe money/rate/stock handling.
- [x] Add additive migration, shared API variant validation, DTO/admin CRUD and immutable order snapshots; block changing semantics of plans already holding inventory/orders.
- [x] Implement GET-only supplier catalogs, admin sync/mapping/pricing and indicative quote API, with stale/failed/mismatched offers excluded and no secret/raw-error exposure.
- [x] Add admin variant/mapping controls and supplier settings page; storefront independent variant filters and invalid-combination feedback, indicative quote state, purchase guard for supplier plans. Preserve old local plan flow and navy/mint.
- [x] Run synthetic unit/UI contracts plus disposable DB migration/access/snapshot regressions. Run full verify, affected lint, production build and audits. Independent final review; document remaining rate/profit/external-purchase limits.

Ruling: use existing private SiteSetting storage for modest catalog snapshots instead of new supplier DB tables. Provider identity is part of each key. Reviewed mapping fingerprints bind product semantics but exclude changing cost/stock. Price settings default disabled and rates expire; USD and USDT are independent. No wallet or buy/activation request is implemented in this phase.


## Verification ledger

2026-11-07: all phase checks passed: `npm run verify` (including disposable database), affected API/scripts ESLint, web ESLint, `npm run build`, `npm audit --omit=dev`, `npm audit`. Both audits report zero known vulnerabilities. No production migration/deployment, real payment, vendor purchase or notification was performed.

Final review: independent reviewer identified dotenv import order, incomplete delivery fingerprint and NONE-to-WARRANTED mapping. Each reproduced RED then passed GREEN. Additional automatic-to-manual mapping regression reproduced RED and passed GREEN; runtime matching now rechecks warranty/delivery as well as approvals.

Ruling: suppliers without structured warranty duration remain NONE by user instruction, even when a title suggests a warranty — do not invent terms. Text-only warranty promotion and sub-day warranty support remain deferred and documented. Source plan/region/quota/coverage matching is explicitly reviewed by the administrator rather than guessed by names. Cost if wrong: a mistaken administrator mapping can still pair materially different offers; supplier checkout remains disabled.

Ruling: this phase returns non-payable indicative quotes, not the final purchase quote from the broader requirements. No exchange-rate vendor or profit value has been chosen. Cost if misunderstood: these estimates cannot authorize purchases; enforced by the order service and covered by regression.

Browser evidence: local synthetic desktop catalog, warranty filtering and incompatible choices, selection invalidation, reset and manual invitation selection. Full scope, test evidence and limits: `docs/security/2026-11-07/supplier-variants-implementation-fa.md`.
