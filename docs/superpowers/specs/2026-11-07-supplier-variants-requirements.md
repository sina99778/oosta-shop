# Supplier offer variants — requirements captured 2026-11-07

The user explicitly wants warranted offers compared with warranted offers, non-warranted with non-warranted, invite with invite, and automatic/manual delivery in separate comparable groups. Customers must choose these attributes on each product's purchase page. Non-warranted and invite products are valid categories; they must not be globally excluded merely for those properties.

## Proposed interpretation

These are independent attributes of one sellable variant, not mutually exclusive options. An invite may have a warranty and manual delivery. Comparison requires the complete selected combination plus the exact subscription plan, duration, region and relevant credit/device/access limits.

- Fulfillment/access: ready account, email invitation/seat, redemption code, supported activation flow; individual versus shared access remains explicit where relevant.
- Warranty: none or a verified term and coverage. A 24-hour login replacement policy is not equivalent to 30-day full-period coverage. User override: unknown warranty is automatically NONE/no warranty. Explicit conflicting warranty text cannot support a warranted mapping.
- Delivery mode: verified automatic versus manual processing. Inventory count, nullable stock or API availability alone does not prove automatic delivery. An automatic supplier delivery is not payment confirmation.
- Subscription identity: ChatGPT plan, Google AI Plus versus Pro, CapCut/Canva plan, duration, region and any material quota remain part of the match.

## Purchase page behavior

Keep the approved navy/mint direction. Display only attributes relevant to that product, with choices derived from reviewed supplier mappings. Separate controls for duration, access/fulfillment type, warranty and delivery make combined selections clear. Unsupported combinations are disabled with a reason rather than silently replaced with a different configuration.

Show the selected combination in a compact summary, estimated range and explicit final-quote action. Changing any selection invalidates the prior quote and requires a fresh server-side quote. Do not advertise current final Rial prices before an exchange-rate source and commercial pricing policy are configured.

## Server/order guarantees to implement

Use a stable internal variant ID with reviewed mappings to supplier identity plus supplier product ID. The two Canboso identities remain separate even with a common base URL. The server validates the full variant; client labels or client-supplied price are not authoritative.

A quote binds buyer/order context, variant/version, quantity, supplier cost and currency/rate snapshot, sale price and expiry. The order retains an immutable description of the purchased attributes. Choosing a fallback must preserve the exact variant; it must not change warranty, access type or delivery mode after customer acceptance. Uncertain external purchase outcomes still block buying from another supplier until resolved.

Existing ProductPlan currently has label/duration/price but lacks structured warranty, fulfillment and delivery attributes. Existing public DTO and product-detail selection use planId; these must be traced and evolved together with admin editing, stock read models, order validation, checkout and delivery. Do not implement these options as unvalidated display-only text.

## Open decisions / unimplemented scope

This file records the requested business grouping and proposed UI/server interpretation; the implementation phase is tracked in the companion plan and security report. Exact supplier mappings, ambiguous descriptions/warranty terms, exchange-rate source, markup/minimum profit and handling cost changes without supplier reservation remain open. Credentials, raw wholesale catalog and real customer data are excluded from this document.
