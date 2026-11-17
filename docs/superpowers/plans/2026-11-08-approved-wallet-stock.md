# Approved one-off real-stock purchase

User explicitly raised cumulative QA spending limit to USD1.58 including prior .01, accepting wallet exposure1.57 for one SKU54 iLovePdf Premium1Yr quoted at .40. No new approval needed. Existing private QA path only; public sales remain disabled. Smallest design: optional immutable selection field walletExposureUsd literal1.57, allowed only for exact SKU/name/type/max.40; preflight and immediate pre-POST wallet read reject higher balance/nonfinite. Unknown result reserves full exposure and blocks campaign; global cap1.58. This accepts upstream repricing risk explicitly; it does not manufacture a vendor price lock. Do not top up wallet during test. No new dependencies or schema migrations.

- [x] RED approved-selection contract; implement narrow selection authorization, wallet guards, exposure reservation, campaign ceiling and accurate admin copy. Preserve default stock denial.
- [x] Disposable DB regression approved stock owner delivery/replay/access and cumulative budget, full verify/lint/build/audits and independent read-only review.
- [x] Backup and deploy only affected Oosta API/web; preserve live purchase/FX ledger. Fresh quote/wallet checks, private15min policy for existing profile; exactly one own-site purchase POST. Finally disablepolicy. Unknown -> GET reconciliation only, never another purchase.
- [x] Verify actual debit, exactly one delivered unit, owner200/no-store/nonowner404, no duplicate charge on replay. Private credential storage, no secrets output.
- [x] Read-only official account login/status if normal login works; no password change/AI credits/CAPTCHA bypass. Recordactualresults/limits under docs/security.
