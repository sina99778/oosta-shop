# Catalog opening and navigation performance

The user clarified that initial catalog opening was slow. The investigation also found a document reload on search and full-catalog plan hydration for popularity and sales ranking.

Popular and bestselling orders now rank lightweight product candidates against approved rating aggregates or paid sales before hydrating the displayed page. Rating rounding, tie breakers, paid-status filtering and supplier-QA exclusion retain their existing rules. Current inventory and supplier state are read for the displayed products without adding a stale stock cache. Isolated regressions verify order, pagination and exactly one hydrated product when the requested page size is one.

The search form keeps a native GET action for no-JavaScript use. After hydration, a small client boundary serializes successful form controls using FormData/URLSearchParams and navigates through the existing router. A query-keyed Suspense boundary provides loading feedback while results change. The initial next/form implementation was replaced with a smaller local wrapper. The browser document-preservation regression failed on the original native-only form and passed on the navigation implementation.

The first three catalog images use eager/high-priority loading; subsequent and homepage cards retain their previous defaults. Cold-cache browser measurements use a 390px viewport, 3x CPU slowdown, 120ms latency and 200,000 bytes/sec. The baseline first-three image starts were 1719, 1002 and 858ms across three runs, all lazy. Final image-start measurements are recorded below. No speculative page prefetch was enabled.

Final first-image starts were 732, 521 and 489ms, compared with the baseline median of 1002ms. Catalog LCP observations were 1544, 1424 and 960ms; baseline observations were 1460, 2080 and 1980ms. The sample median changed from 1980 to 1424ms. This is a three-run synthetic result rather than field data. JavaScript transfer decreased from 151,197 to 150,190 bytes after replacing the temporary form implementation. The final same-document search assertion passed and displayed the requested ChatGPT result.

The initial origin API popularity median was 514ms before the build load. After the rank-before-hydration change, it was 186ms in a three-request sample. Other sorts retain their existing implementations. The backend requests are from the VPS and are separate from Iranian visitor latency. From the existing Iran host, the catalog HTML initially took 1.220s to first byte and 1.221s total. All sampled public script, stylesheet, image and wordmark requests from that host succeeded.

After the release, the three Iran-host catalog HTTP first-byte observations were 1.164, 0.810 and 1.001 seconds. These HTTP timings measure receipt of HTML, not a complete browser render.

Final npm run verify passed with 173 smoke checks and disposable database regressions, including ranking and denied-access paths. Full lint, local API/web builds, VPS image builds and both dependency audits passed. The first final verification attempt raced a parallel production build that regenerated Next route types; rerunning verification after build completion passed. The signed-event concurrency test logged its transaction timeout and completed successfully. No real purchase, payment or Telegram notification was triggered by tests.

Public route smoke checks cover Persian and English catalog pages. Anonymous admin, order and ticket APIs return 401/private-no-store. Preview payment configuration remains disabled. No schema migration or private cache policy change was required.
