# Release operations implementation plan

**Goal:** Finish repeatable release checks and daily encrypted database backups while keeping unsupported supplier checkout closed.

**Design:** Reuse the isolated database runner, the existing preview smoke checker and the age backup helper. No new dependency, payment switch, supplier purchase, customer DTO or frontend change. The owner's request to proceed autonomously covers implementation and deployment of these reversible operational changes.

**Constraints:** Preserve navy/mint storefront, existing nginx exceptions and real data. No paid provider or Telegram calls in automated tests. Existing supplier-stock snapshots alone do not authorize checkout. No new spending grant is inferred.

- [x] Reproduce the smoke checker's incorrect rejection of immutable assets with a synthetic HTTP server; fix only its static cache expectation and add to contracts.
- [x] Add read-only GitHub CI: install, generate Prisma, verify with disposable Postgres, lint, build and both audits; no deploy credentials or production DB.
- [x] Add a locked daily server backup runner using the existing age helper, atomic ciphertext publication and 30-day retention. Test success and failure using command stubs, then run a real encrypted backup and install the timer.
- [x] Run verify, lint, build, dependency audits and production preview smoke. Record observed inventory/payment/collector blockers without enabling unsupported sales.
- [x] Commit and push changes; document operating and rollback instructions and any user action needed for actual sellable stock.

**Ruling:** Work on the owner's existing `codex/oosta-redesign-security-checkpoint` branch; no new checkout or branch is needed for this continuation. No graph exists; targeted reads suffice for these scripts.

**Result:** GitHub run 44069641195 passed all checks on Ubuntu after fixing the synthetic contract environment and disposable PostgreSQL sockets. No procurement budget or public sales activation.
