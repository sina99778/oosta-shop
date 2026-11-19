# Storefront discovery polish

The home page foregrounds search and the catalog. Its quick links come from existing published product records. Existing editorial content and prompt tools remain available below the catalog. Product cards retain the availability and quote distinctions.

The public product directory renders the first results on the server and reads search, category, sort, and page from the URL. It normalizes duplicated and malformed parameters, limits search length to the catalog API schema, and encodes values with URLSearchParams. It uses the existing public catalog and category endpoints. Arbitrary search requests are not stored in the Next data cache. Unavailable results provide a reload link, and pages beyond the end preserve the filters in the recovery link.

This release changes the web image only. Payment configuration, purchase gates, user authorization, and database state are outside its write scope.

`npm run verify`, ESLint and the production web image build passed. Both npm audits reported zero vulnerabilities. Catalog contracts cover encoded search, retained filters and page links, invalid input, and out-of-range recovery. Synthetic browser checks at 320, 390 and 1440 pixels found no horizontal overflow.

Release `20261116-storefront-discovery` was verified over public HTTPS in Persian and English. The smoke checked the home search and product ordering, a live ChatGPT search, sorting and pagination links, empty and out-of-range results, and the Gemini cover response. Public payment methods remained disabled.
