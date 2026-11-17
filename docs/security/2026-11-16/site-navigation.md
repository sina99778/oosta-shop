# Header and footer

The shared storefront header and footer use a compact desktop layout and a mobile navigation disclosure. The current section matches complete URL path segments. Escape closes the disclosure and returns focus to its button. Language switching preserves the current path, query and anchor. The admin link follows the existing client session role and does not replace the server's authorization checks.

The footer groups existing shop, order and support links. Optional contact fields and the trust badge come from site settings. A trust mark is rendered only when configured. Its optional target is limited to HTTP(S). Neither layout change creates routes, modifies API permissions or changes private caching.

`npm run verify`, ESLint, the production web build and both npm audits passed. The browser fixture covered widths 320, 390 and 1440, mobile menu opening, Escape and focus recovery, switching the theme, and locale navigation with queries and anchors. Role visibility and optional trust-mark behavior were tested with synthetic claims and settings. Release `20261116-site-navigation` verified the visible layout and active product section on both public locales. Public payment configuration stayed disabled.
