# Full available test matrix

User requests autonomous completion of all tests; previous cumulative spending ceiling remains USD/USDT1, with USD0.01 already spent. No additional spending is needed to exercise the implemented API-test purchase, recovery and owner vault. Normal stock purchasing/activation and public gateway sales remain disabled/unimplemented; do not loosen those controls merely to mark a test as passed.

- [x] Re-run complete verify, disposable-database migration/smoke/concurrency/refund/restore suites and all contracts.
- [x] Run whole-repository lint and both production builds. Root lint initially included third-party Telegram export JavaScript; exclude only ChatExport reference folders, preserving every application/test check.
- [x] Extend upstream failure matrix: invalid wallet numeric values, unsupported monetary precision, wrong identity/product/quantity/amount, cancelled/pending outcomes, oversized/non-JSON/HTTP failures and uncertain lookup.
- [x] Add direct exact-variant/source selection matrix: expired/future snapshots, fingerprint/warranty/delivery/flags, full variant axes and duration.
- [x] Add FX blocked-key rotation and corrupt-ledger rejection checks; confirm neither can spend/reset quota.
- [x] Live browser: real profile login, actual delivered vault, mask/reveal/hide without logging credential, 390px mobile overflow check, logout/browser-back and wrong-password rejection. Save masked screenshots; reset viewport and leave session logged out.
- [x] Deploy bounded preflight fixes after verified checks; preserve real purchase and FX ledgers, backups and preview restrictions. Read-only live smoke of existing purchase, owner/nonowner/cache/category isolation and configured supplier status; no new supplier POST buys.
- [x] Record results, costs, findings and explicitly untested/unavailable production features in docs/security.

Findings: balance NaN/Infinity was accepted because Decimal.lt(NaN) is false; reject nonfinite wallet. Prices with more than six fractional digits could be rounded when reserved in DECIMAL(18,6); reject before dispatch. Each reproduced in a failing contract before the fix; subsequent expanded verify passes. No dependency added.
