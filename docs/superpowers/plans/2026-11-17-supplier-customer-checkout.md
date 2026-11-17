# Supplier customer checkout implementation plan

**Goal:** Connect a buyer-bound firm quote, one payment session, verified payment and the durable supplier engine through actual application HTTP paths and the existing product price panel. Tests use synthetic suppliers and the existing mock gateway only.

**Design:** Persist a private customer quote before payment. Consume it once under a quote lock, creating an unpaid order and AWAITING_PAYMENT fulfillment record with immutable supplier terms. Payment verification transitions the order to paid/pending and the record to READY; the existing engine dispatches or recovers by lookup. A bounded worker recovers interrupted paid checkouts. The app constructor accepts trusted internal adapter dependencies; production passes none, exposing no registration endpoint or environment bypass. Existing indicative quotes remain available.

**Scope:** Connect online payment and unique-amount card-to-card through signed Blu evidence. Production mock protections remain enforced. Supplier card approval requires exact immutable quote/invoice/order, current USER, a matching signed deposit/reference and valid payment window; a receipt image alone never starts procurement. Existing internal-stock/QA Blu guards remain in force. Public supplier checkout stays unavailable with the empty live adapter registry, and host nginx is not opened by this phase. No real supplier order, bank or gateway call is authorized by this work.

- [ ] Add failing HTTP regression for quote ownership/expiry/schema, one order/session per quote, no purchase before verified payment, failed/forged callback denial, paid delivery/vault privacy, replay, expired-after-payment review and worker recovery with one debit.
- [ ] Add additive private quote schema/migration; extract bounded offer selection for reuse; implement checkout service/router, callback delegation and bounded recovery worker with trusted dependency injection.
- [ ] Connect the existing supplier price panel to firm quotes when available; bind purchase to quote id only, clear stale/session-switched quotes and disable expired/duplicate submissions. Keep indicative fallback safe and preserve navy/mint styling.
- [ ] Run isolated regressions/full verify, lint, build and both audits; obtain final independent review; document exact limits, commit/push and inspect CI. No production debit activation.
