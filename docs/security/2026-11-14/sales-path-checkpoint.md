# Sales path checkpoint

The live check found 97 active public products and zero available internal inventory. The Blu timer was active and its report was idle. Quotes for ChatGPT, Gemini Pro, Canva and CapCut succeeded. Their current DTOs were verified without creating customer orders or debiting suppliers.

Both prior delivered QA orders were readable by their owner, had one credential per purchased unit, returned 404 to another authenticated account and 401 anonymously. The ordinary account was denied the admin Blu endpoint. All inspected private responses used no-store. Total recorded QA charges were USD 0.41. No further purchase was made.

The payment configuration reported online payments available through the mock provider because the controlled production mock override was enabled. Disabling that override prevented API startup, so it was restored and the API recovered. The release instead hides the mock provider from the customer payment configuration in production. Development mock checkout remains available. The startup override is still required by the preview's current provider configuration. Real public order creation remains behind the preview proxy, with Blu stock checkout disabled. This correction does not mark previous pending bank evidence as paid.

Supplier quote failures now distinguish unavailable pricing, unavailable offers, authentication and rate limiting without displaying upstream exception text. Expired quotes display an explicit retry message. The selected plan has a collapsible terms summary and a link to the product's existing full conditions. The actual warranty definitions and source-matching rules remain intact.

The catalog regression first reproduced the wrong default ChatGPT plan. A personal ChatGPT Plus account with full 30-day coverage and 30-day duration is now displayed first on that product. Existing stock logic still chooses an available plan. Products with no matching variant retain their original order.

The full verify suite, lint, web production build and both dependency audits passed. The final priority regression also passed in a disposable database. Published quotes remain indicative. Customer sales still need genuinely deliverable stock or a supplier purchasing contract that can enforce the accepted charge. Automatic final payment approval requires a verified settlement basis beyond the retained provisional Blu match.

Release `20261114-sale-readiness` passed API/web production builds and the public preview HTTP checks. The public payment DTO now reports both methods unavailable. The timer remained active and the homepage returned 200. A browser at 390px verified the preferred full-month Plus selection, its terms disclosure and navigation to the full existing warranty conditions. The production-mock display regression reproduced the misleading online=true flag, then passed after the read-path correction while preserving development mock checkout.
