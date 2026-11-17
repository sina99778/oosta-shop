# Catalog sorting and subscription selection

The default public catalog, homepage categories and related products now put editorially recognized brands first. Explicit newest sorting uses creation time. Available sorting uses the same fresh supplier availability as the public product DTO. Popular sorting uses approved ratings and review counts. Bestselling sorting and its dedicated endpoint use paid order quantities and exclude QA orders. Refunded and pending orders are excluded. Sorting runs before pagination and respects category and search filters.

Subscription selectors use a keyboard-accessible native details disclosure. The selected plan remains visible in its summary, and the expanded list scrolls. Filtering still uses original plan IDs and variant values.

Public catalog query validation accepts only the defined sorting enum. Customer and administrator authorization, private cache controls, payment verification, delivery and database roles remain on their existing paths.

Full verify, ESLint, production API and web builds and both dependency audits passed. The disposable database regression covers default recognition, available stock, approved-only ratings, paid-only sales, missing prices, pagination and invalid query values. UI contract tests cover the disclosure and existing plan values. Price sorting uses known published prices. Supplier quotes require a selected plan and products without a published price follow the priced products.

Release `20261114-catalog-sorting` passed the public preview smoke. Browser interaction at 390px verified catalog form sorting, homepage sorting, opening and closing the subscription selector and showing the selected Canva plan in the collapsed summary. A transient browser navigation timeout required retrying the homepage check. The production first page begins ChatGPT, Gemini, Canva and CapCut.
