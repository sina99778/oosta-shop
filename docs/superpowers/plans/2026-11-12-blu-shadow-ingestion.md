# Blu signed observation and claim pilot

Accept only compact Ed25519-signed bank observations. Use the same QA user and destination as the invoice pilot. Only retain observations for a matching QA invoice amount and destination. A signed credit describes the observed bank row and does not assert final settlement.

1. Reproduce the missing route with the disposable HTTP suite. Cover denied and tampered signatures, stale observations, exact replay, inconsistent repeats, mismatch, receipt timing, duplicate order claim and unchanged payment.
2. Add the immutable observation ledger and one-to-one provisional claim under the existing order lock. Store the amount and time, a transaction digest and a hash of the receipt code. Only a pending receipt with the exact tracking code and a credit within the invoice window is eligible.
3. Add a small collector adapter for strict bank-row/receipt evidence and exact wire signing, with no unfiltered history export.
4. Run verify, lint, production build and audits, then review. Live deployment and payment activation require a controlled real invoice trace. No order is marked paid or delivered by this phase.
