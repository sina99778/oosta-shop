# Card payment desk implementation plan

> Execute inline under executing-plans; user approved implementation. Preserve the existing codex checkpoint branch and unrelated deployment work.

- [x] Add red regressions for pending-review duplicate-payment presentation, closed state concealment, pending fulfillment instructions and upload validation. Read current DTO/receipt route/ownership/quota with UI.
- [x] Implement CardCheckout payment desk, localized copy and small file validator. Preserve existing API/upload fields and financial formatter. Make all controls keyboard accessible and respect reduced motion.
- [x] Verify real component renders with synthetic fixtures; visually inspect local synthetic preview in desktop/mobile. Run verify, relevant lint, production build and audits. Record scope and limits in docs/security.
- [x] Get independent final review and fix actionable issues. Keep public server preview read-only; do not create real orders or enable payments for review.

