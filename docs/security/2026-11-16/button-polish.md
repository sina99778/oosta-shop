# Button polish

The shared button uses scoped visual variants with a rounded edge, short shadow and pressed state. Search, prompt copying and header buttons use the same styles. Product-card actions, account links and admin primary controls follow the same visual treatment without adding nested interactive elements.

The styling preserves native button type, disabled state, accessibility attributes and click handlers. Keyboard focus stays visible and reduced-motion preferences suppress the pressed translation. No API contract, payment action, role policy or cache behavior changed.

`npm run verify`, ESLint, the production web build and both npm audits passed. Chromium renders checked the corner radius, shadow, pressed state, visible focus, reduced motion and disabled state with synthetic catalog data at 320, 390 and 1440 pixels. Release `20261116-button-polish` serves the new button markup and CSS over HTTPS. The live checks covered home, catalog search and availability and availability of the login page. Header account links and the login form depend on browser hydration, so their authenticated interactions were not part of the live HTML checks. Public payments remain disabled.
