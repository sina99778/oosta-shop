# Storefront logo and Persian plan labels

The supplied image has an alpha channel. The storefront uses a cropped transparent copy for the wordmark and homepage and a resized copy for the favicon.

Persian plan labels are formatted in the browser from the existing product and order DTOs. The selected plan ID and facet values remain the inputs to quoting and checkout. The order and receipt views reuse their existing authenticated fetches. No API schema, cache policy, ownership, database role, payment verification or fulfillment logic changed.

The storefront regression verifies localized labels, warranty coverage, original plan IDs, distinct Gemini tiers and English labels. Catalog titles supplied in the future can include terms outside the translation rules. The rules affect presentation only and warranty eligibility still comes from the existing variant data.

`npm run verify`, full lint, the production web image build, and both dependency audits passed. The web-only release `20261114-fa-brand-options` passed the public preview smoke. Chrome at 390px confirmed the transparent wordmark, homepage logos, favicon and no horizontal overflow. The live Persian Canva page displayed the 12 existing plan IDs and returned only the seven invitation plans after selecting that filter. No real orders or payments were placed.
