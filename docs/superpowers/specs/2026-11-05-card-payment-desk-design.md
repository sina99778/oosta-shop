# Oosta payment desk — approved design

User approved «میز پرداخت اوستا؛ اجرا کن» on 2026-11-05.

Product: manual transfer checkout for Oosta buyers. Character: confident, precise, warm. Keep approved navy/mint and Persian RTL. Signature: a mint cut-line on the destination card, repeated in the receipt progress rail.

Design: desktop two-column payment desk; mobile single-column. Navy destination card has readable grouped LTR digits, holder/bank and explicit copy feedback. Amount uses existing formatPrice (IRR stored as Rial, displayed Toman for fa). Receipt area has accessible native file selection plus drag/drop, raster preview (PDF filename only), remove/replace, inline type/5MB validation, optional reference and one clear submit. No timer, invented SLA, security guarantee, or receipt-as-payment-success claim.

State behavior: pending/rejected show transfer; pending review emphasizes received-not-approved and avoids another payment; optional additional receipt remains available. Paid/pending fulfillment/refunded/expired hide card and upload; pending fulfillment explicitly says do not pay again. Errors have retry; failed upload retains file/reference. API DTO/auth ownership/schema/payment logic stay as-is. No new dependency.

Approaches: selected two-column payment desk keeps transfer details and upload together. Sequential wizard adds navigation and hides details when uploading; declined. Static polish alone would leave weak upload feedback.

Verification: synthetic DTO rendering and file selection validation, full verify/disposable DB, affected ESLint, production build, audit before any deployment. Review cache/ownership/roles and receipt quota as existing API integration. Preview sales restriction remains in place.
