# Blu Automatic Approval Implementation Plan

**Goal:** Approve matched Blu receipts and deliver reserved inventory without an operator click.

**Architecture:** Reuse receipt approval and order locking. Add a default-off server flag, a narrow eligibility guard inside that transaction, and a bounded sweep after event ingestion and on the existing polling job. No public sales activation, new supplier debit or dependency.

**Scope:** The owner requested automation following the completed real bank test and previously directed autonomous implementation. Preserve private QA and ordinary stock checkout boundaries. Payment-only QA invoices must never fulfill. Ambiguous claims, invalid destinations/amounts/timestamps, changed user roles, unreserved inventory and missing receipts remain manual.

- [x] Add failing isolated regressions for automatic private and ordinary stock delivery, feature-off, replay/concurrency, receipt mismatch, review flags, destination/amount/time tampering, missing inventory and changed role.
- [x] Extend the existing receipt approval transaction with a server-only automatic mode; recheck all eligibility under the order lock. Implement bounded matching sweep, per-order failure isolation and polling recovery.
- [x] Hook signed event success and existing poll queue; add env schema, example and compose flag. Keep frontend DTO and current authenticated admin route unchanged.
- [x] Run full verify, ESLint, production builds and both dependency audits. Document tested scope and remaining bank/account limitations.
- [x] Back up, deploy and enable only automatic approval. Verify live flags, collector, no duplicate delivery of the already paid real order, no new spend, no public payment activation. Record results.
