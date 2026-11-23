# Customer account and support

The storefront's signed-in pages share navigation and a responsive layout. The order list has an in-progress filter. Owner-only order details use the existing DTO, show item delivery, payment and receipt history, and hide the retry-payment link for an expired Blu invoice. The order-specific support link prefills the displayed eight-character reference as editable text. The URL does not grant access to an order or bind a ticket to another account.

Customer and staff replies now use scoped nested writes that record the message and new status atomically. The owner predicate is part of the customer's database update. Current administrator roles protect staff responses. Customer ticket writes use an account-scoped rate limit. Telegram receives a short ticket identifier and an event type rather than the subject, author, or message. The backend keeps private no-store responses and the existing order, receipt and credential authorization rules.

The preview proxy permits authenticated support actions on their narrow HTTPS paths. Checkout, payment verification and other write restrictions are unchanged. Tests use synthetic tickets only.

`npm run verify`, ESLint, both production image builds and both npm audits passed. The disposable database suite completed 166 smoke checks. Its failure trigger reproduced a partial customer reply before the change and then verified rollback for both customer and staff replies. It also verified cross-account denial, the account-scoped limit and closed-ticket behavior. Synthetic browser renders fitted 320, 390 and 1440 pixels without horizontal overflow.

Release `20261116-customer-support` served the account and ticket routes over HTTPS. Anonymous support writes returned 401 and private/no-store. Invalid input, a missing ticket, and a stale staff role were rejected by the running API. Public order creation, payment verification and signup still return 503 in preview. Live checks used invalid or denied requests and did not submit a ticket or send a notification.
