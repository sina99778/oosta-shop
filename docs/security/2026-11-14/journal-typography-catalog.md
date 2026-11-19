# Homepage journal, typography and catalog covers

The homepage consumes the existing public published-only blog summary DTO and displays up to three posts. Drafts are excluded by the API. A missing or empty public list hides the section, and the hero links to the prompt when the journal is empty. Published examples with and without a cover were exercised with synthetic React fixtures. No articles were published to production for the test.

Canva's education titles use the storefront label «دانشجویی». The variant IDs, default warranty, authorization, private cache policy, order ownership, payment checks and fulfillment are unaffected. Persian type uses the locally hosted Estedad font with its included SIL OFL license. English uses the existing Geist font.

The cover import backed up the production database and verified the archive table listing. It matched previous cover hashes before updating exactly 45 existing WebP records in one transaction. All new hashes matched production. The source manifest is in `scripts/catalog-covers/sources.json`. Muse AI uses a neutral icon because the supplier title and available sites did not establish a matching brand. Only prepared raster images are served from the database, with the existing product image cache policy.

`npm run verify`, full ESLint, the local production build, the production image build, both audits and the public preview HTTP smoke passed. The automated security and commerce checks ran against a disposable database. Public browser and direct-origin checks verified the imported font and catalog, with intermittent public edge timeouts during verification.
