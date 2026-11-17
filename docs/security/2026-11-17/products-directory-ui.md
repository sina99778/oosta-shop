# Products directory refinement

The public product directory had enough title, search and category content to push the first product to approximately 860px on a 390px mobile viewport. The revision shortens the heading, compacts search and puts category links behind a native details disclosure. The summary displays the current category. Category links include the existing public product counts.

On mobile the directory cards use a single horizontal row per product with the image beside the product information. The two-column 390px override was removed. These layout rules are scoped to the directory grid so the homepage retains its existing grid. Product image versions, low-priority lazy loading and disabled speculative prefetch remain in use.

The server component continues to normalize the incoming category, search, sort and page parameters and to call the same public API DTO. Category links preserve search and sort while returning to page one. API validation, live inventory and payment decisions are handled by the existing endpoints.

The existing synthetic catalog contract was extended to require the category disclosure to start collapsed. It failed before implementation and passed after. npm run verify passed with 173 smoke checks and the disposable database suites. The signed-event concurrency suite logged a transaction timeout and completed successfully. Full ESLint, local production builds and the VPS web image build passed. Both npm audits reported zero advisories. The deployment checks cover public catalog/detail routes and anonymous order, ticket and admin requests returning 401 with private/no-store.

This phase changes product browsing. Product descriptions, supplier terms and subscription fulfillment are governed by their existing data and logic.

Live dark-theme screenshots were inspected at 1440px and 390px. Browser checks at 1440px, 390px and 320px found no horizontal page overflow. The first product starts at 569px on the 390px viewport, compared with approximately 860px before the change, and at 599px on the 320px viewport. The category disclosure opens through its native summary and its links retain touch targets at least 44px tall.
