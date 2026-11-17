# Blu checkout for pre-funded stock

Add an opt-in mode for card-to-card orders using the validated Blu destination. Create the invoice and hold internal stock in one transaction. The existing approval path delivers held stock and retains owner-only credential access. Release elapsed holds in bounded batches under the same order lock. Preserve the private payment-only QA and legacy checkout paths.

- Reproduce missing invoice and stock hold for a normal buyer with the mode enabled.
- Cover concurrent attempts for the final unit, expired release, owner access and exactly-once delivery.
- Verify locally and deploy in preview with the switch disabled pending sellable stock and a real sale trace.
