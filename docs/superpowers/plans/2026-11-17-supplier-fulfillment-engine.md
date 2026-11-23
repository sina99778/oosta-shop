# Supplier fulfillment engine implementation plan

**Goal:** Persist one purchase per paid customer order, dispatch once, recover by lookup, and deliver credentials atomically. Run only synthetic providers in tests; spend no real funds.

**Design:** Reuse canonical variant matching, current pricing policy, order locks, inventory vault and PAID_PENDING_FULFILLMENT. Add an internal adapter contract requiring a vendor-enforced price ceiling, stable idempotency and lookup. The live registry stays empty because current supplier contracts do not establish these guarantees together. Public checkout and quote DTO remain disabled/indicative. No fake adapter or purchase switch is exposed through HTTP.

**Payment boundary:** Only a single-item, quantity-one SUPPLIER order with persisted paidAt, nonempty paymentRefId, a current ordinary user and matching planSnapshot is eligible. Existing payment handlers and their stock behavior are unchanged. A future checkout integration must persist those verified payment facts; this phase does not fabricate payment or silently enable customer orders.

**Failure boundary:** Commit SENDING before networking, never repeat POST after an ambiguous response. Reconcile via lookup only, including after process restart. NOT_FOUND cannot prove no debit. Expired quote, mismatched product/currency/reference, changed variant, closed/refunded order or invalid credentials becomes review without exposing credentials. Positive delivery updates inventory, order and job together under the existing order lock.

- [x] Write isolated failing regressions: unpaid/role/variant denial, missing guarantees, cheapest matching selection, expired quote, simultaneous dispatch, crash/timeout recovery, pending/stock failure, response mismatch, refund race and duplicate delivery; no real providers.
- [x] Add additive job migration and internal engine; preserve real database and existing checkout guards.
- [x] Trace DTO/vault authorization and retain no-store; run verify, lint, build and both audits. Review diff and document tested scope/remaining supplier contract blocker.
- [x] Commit/push without deploying a debit-capable adapter or spending funds.

**Ruling:** Continue on the owner's existing branch and leave concurrent frontend work untouched. This implementation deliberately stops at the internal fulfillment boundary, with public payment still closed until a supported live adapter and verified checkout issuance exist.
