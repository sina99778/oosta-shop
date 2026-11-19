# Homepage product cards

The homepage product section now reuses storefront product cards with large covers, localized availability and a quote label. It shows ChatGPT, Gemini, CapCut and Canva first when available through the public summary endpoint. Empty categories are hidden. Category selection queries the public catalog and offers a link to the full category when more results exist. Only public summary DTOs reach the homepage client.

Full verify, lint, web build, both dependency audits and the production web image build passed. Release `20261114-home-catalog` was deployed. The in-app browser failed to initialize. An isolated Chrome instance verified the actual public page, eight default cards, 176px cover height at 1280px, filtering to six networking products and two columns without horizontal overflow at 390px. The preview HTTP smoke passed.
