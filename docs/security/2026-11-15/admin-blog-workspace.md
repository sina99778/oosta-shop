# Article management workspace

The admin list includes draft and published filters, row links and a retry state. The editor uses the existing authorized article endpoints and validators. Draft is the default for new articles. Existing submissions preserve their selected publication state. The public article link uses the persisted published slug. A cover upload updates only cover state and preserves unsaved text. New images are inserted into the text and remain editable before saving. Deletion requires a second button. The write lock prevents overlapping saves, uploads and deletion in one editor.

The preview uses the same Markdown parser as published articles. It renders only the site's blog-media URLs as images, displays external links as text and does not embed video. Raw HTML remains escaped. Uploaded cover and media URLs use the existing public asset model. Only the article records and draft text are admin-only until published. The existing 5 MB raster MIME filter, request validation and current administrator middleware remain in place.

The host preview needs its specific HTTPS admin-blog exception for the existing validated routes. General preview restrictions, checkout gating and customer endpoints remain in place. Tests use fixtures. The production smoke check uses rejected or validation-only requests and performs no content mutation.

The public journal and article metadata/body fetch the current publication state without the Next data cache. This prevents stale article text from continuing to render after an administrator moves a post back to draft. The publication fixture failed against the cached routes before this change.

Verification includes the isolated database smoke suite, rendering contracts, ESLint, a production Next.js build, and both npm audits. Desktop and mobile layouts were checked with synthetic article data. The HTTPS smoke covered the Persian and English journal, both admin entry points, missing article 404, anonymous read/write/upload denial with private no-store responses, and the existing customer checkout restriction. Production has no published articles yet.
