# Public product image caching

Public product summaries and detail DTOs now include an image version derived from the product's existing updatedAt timestamp. The shared frontend image URL helper puts this version in the query. Existing DTOs without the optional field retain their legacy URL. Product cards, detail galleries and product metadata share the helper.

The Nginx rule only matches the two existing public product image routes and forwards their version query to the API. It permits GET, HEAD and OPTIONS. Success responses retain the API's one-hour public cache policy. Missing and removed images explicitly return private/no-store. Admin receipt images and all private API paths stay outside this rule.

Admin upload and removal already update the Prisma product timestamp. No schema or database migration was needed. The synthetic regression checks a changed version after upload, agreement between list and detail, uncached missing/removed images, public image bytes, and upload rejection for anonymous and non-admin users. The first frontend version test failed before the helper fix. An initial isolated run exposed an incorrect test search using a slug in the name search field. That fixture was corrected to search the synthetic product name.

Final verification passed with 173 smoke checks and the rest of npm run verify, including disposable database regressions. Full lint and the API/web production builds passed. Both dependency audits reported zero advisories. The signed-event concurrency regression logged a transaction timeout and passed its test suite. No real purchases, bank operations or Telegram notifications were triggered by tests.

The browser benchmark uses the public catalog with a 390px viewport, 3x CPU throttling, 120ms network latency and 200,000 bytes/sec. It clears the browser cache before the first navigation, then revisits with cache enabled. Before the fix, all eight visible product images transferred again on the second navigation.

After deployment, the same eight product images had zero network transfer on the second navigation, serving 126,042 bytes of image bodies from browser cache. The second-navigation LCP observation was 696 ms. This is one simulated browser run and is not a field measurement or a consistent speedup guarantee. Public missing-image requests returned 404/private-no-store. POST to the public image route returned 405. Unauthenticated admin, receipt, order and ticket requests returned 401/private-no-store. Preview payment flags remained disabled.

The image cache TTL is one hour. A previously open page can keep its previous image until its cache lifetime ends. New product DTOs generate a new URL after a product update. The timestamp can also invalidate an unchanged image after a non-image edit.
