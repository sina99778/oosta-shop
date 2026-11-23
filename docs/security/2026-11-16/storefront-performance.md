# Storefront performance

Before the change, the median public first-byte time from the VPS was 421 ms for the Persian homepage and 930 ms for the catalog (three requests each). The catalog API median was 796 ms. One request for the dynamically resized hero took 3.54 seconds and transferred 141,864 bytes. The homepage referenced 13 script/style files transferring 210 KB total in the sample, each with contradictory immutable and private no-store headers.

The hero and wordmark use versioned WebP files. Nginx preserves public immutable caching only for the fingerprinted Next chunks/fonts and the exact versioned brand files. HTML, account, order, ticket, admin and payment API cache policies stay private. Catalog sorting, source freshness, checkout validation, permissions and payment policy remain independent of the presentation optimization.

Recommended and newest catalog sorts load full plan and rating data only for the visible page. Related products calculate stock and ratings only for the displayed products. Supplier snapshots are reread from the database; only parsing of identical bytes is reused. Each use still enforces the existing offer age and variant checks.

The detail page sends the public product DTO in the HTML and removes the browser's duplicate GET. Metadata and page rendering share one request-scoped product lookup. Only the payment method flags go to the product view; the public payment configuration's card fields are omitted from its props.

The release passed full verification (166 smoke checks), ESLint, both production image builds and both npm audits. Origin and CDN checks confirmed immutable public asset responses, private/no-store for account, admin, order and ticket responses, and rejection of POST on versioned images. Public payment settings remained disabled.

Using three public HTTPS requests per path from the same VPS, median homepage first byte moved from 421 to 333 ms and catalog first byte from 930 to 576 ms. The direct origin catalog API moved from 587 to 203 ms. The public ChatGPT HTML first byte moved from 330 to 612 ms because it now includes detail and plan markup. Before the change, a separate ChatGPT detail request took 675 ms median public first-byte time after scripts had started. These are HTTP measurements, not a browser LCP measurement. The 320px and 640px hero files are 41,316 and 103,108 bytes. The versioned wordmark is 6,330 bytes.
