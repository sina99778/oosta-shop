# Controlled real Blu receipt trace — 2026-11-12

The owner submitted one real receipt to QA invoice `cmwe4kxl20001ql01eg5gmlqn`. Its exact amount was 10,010 IRR / 1,001 toman. The receipt arrived at 22:43:28 UTC. An authenticated bank read found one exact credit for the enrolled receiving account. The signed publisher returned `BLU_EVENT_MATCHED`. Repeating the real read and publication returned the same result. Database reconciliation then confirmed one observation, one owner receipt, the expected matched order, no competing-evidence flag and a bank timestamp inside the original invoice window.

## Bugs reproduced and fixed

The entered receipt number matched the bank's explicitly labeled reference and differed from its labeled tracking code. The old collector reported referenceMatches=1 and BLU_EVENT_NOT_SENT. A synthetic signing regression first failed because the reference yielded no signed event. A separate isolated HTTP regression failed because the receiver rejected the new typed identifier.

Reference evidence now requires one unique labeled tracking value and one unique labeled reference value, with the structured field absent. Conflicting structured evidence and multiple distinct labeled values fail closed. The event explicitly carries receiptIdentifierType=REFERENCE. Reference and tracking identifiers use different HMAC domains. Events without the optional type retain TRACKING semantics for compatibility. Matching recomputes the corresponding domain from a pending owner receipt, while competing-evidence lookup covers both domains. The legacy database field trackingDigest retains its name and contains the typed HMAC. No schema migration was needed.

A second real attempt still failed at the signer. Redacted diagnostics established that the history row names the receiving IBAN, while the detail identifies the exact configured receiving card. Amount, currency, direction and time agreed. A new synthetic regression reproduced rejection of that exact card. The collector now receives the configured card privately, and the signer permits only the exact receiving IBAN or that exact validated 16-digit card in the optional detail destination. An unspecified or different card and a different IBAN remain rejected. The history row must still independently match the enrolled IBAN and integer-rial credit. No bank identifiers or description text were logged.

## Verification and deployment

The reference receiver was published in API release `20261112-blu-reference`. The collector was independently updated on the Iran host after its six synthetic tests passed there. Both defect regressions failed before their corresponding fixes, then passed. Final full `npm run verify`, full lint and production builds passed. The verify suite used disposable databases and included denied signatures, tampering, unknown identifier types, typed identifier confusion, concurrent/replayed claims, cross-domain competing rows and unchanged payment state. Both dependency audits reported zero vulnerabilities before release. Independent review found no actionable issues in either increment.

After both real publications, the QA order remained PENDING_REVIEW, paidAt was null and there were zero product/inventory items. The evidence ledger contained exactly one matching observation with reviewRequired=false. No extra transfer was required for retries. The saved-session check passed after publication without requesting another password or OTP.

The temporary receipt-specific Nginx exception was removed after successful reconciliation. Nginx validation and reload passed and that POST now returns the preview restriction. The signed ingestion route remains protected by its signature and QA scope. The deployed preview HTTP smoke passed afterward. A private post-match database backup preserves the observation and its claim. Restoring an earlier database must reconcile the retained bank evidence before enabling automatic transitions.

## Remaining limits

This trace proves receipt submission, receiving-bank lookup, signed transport, scoped matching and replay idempotence for one real card credit using labeled reference evidence. The bank response exposes no independently verified final settlement field. Payment approval and product fulfillment remain outside this QA transition. The collector is still invoked by an operator through the saved bank session. Continuous collection, production approval policy and customer-order activation require subsequent implementation and validation. The personal receiving account remains shared with the owner's personal use. This controlled result does not establish security of the entire deployed application.

