# Catalog cover rendering

Updated 45 WebP covers with a hash-guarded transaction after checking a product table backup. Google Antigravity uses Google's higher-resolution image. Vector sources are rendered at sufficient resolution before making the WebP. Some remaining brand assets still use the best available app icon.

The storefront uses a versioned URL for uploaded product covers. It continues to use the existing public image endpoint and cache policy. Product DTOs, gallery IDs, access rules, private caching, order ownership, payments and fulfillment were unaffected.

Full verification against a disposable database, lint, the production image build and both dependency audits passed. Public cover responses for Antigravity, Canva and CapCut matched the released files.
