# Blu invoice pilot

Implement the approved unique payable amount in authenticated CARD_TO_CARD checkout. Only the server-configured QA profile receives this invoice while bank-to-order reconciliation is being built. Use an integer-rial key unique across all retained invoices for the receiving IBAN. Keep the order currency and adjust the final total with a 1–249 toman discount. Persist destination card, base price, discount, exact amount and a 30-minute transfer window with the order. Preserve the manual receipt flow for late transfers and hide the payment card after the deadline. Do not alter public payment flags.

1. Write isolated HTTP and checkout rendering regressions for ownership, immutable card/amount, concurrent allocations and expiry.
2. Add nullable unique invoice key, locked allocation and a validated payment snapshot. Show the amount, discount and expiry in the existing card checkout.
3. Run the disposable database and full repository gates, review the diff and document the results. Leave the pilot off the public server until the bank evidence/claim and QA steps can be verified together.

Follow-on phase: ingest signed, minimized bank events, reserve each transaction once and reconcile payment/fulfillment with manual review. A live test transfer is separate from this implementation and must target an actual QA invoice.
