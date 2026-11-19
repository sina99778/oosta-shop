# Blu preview receipt polling

Run a two-minute systemd timer on the storefront host. Its local database command selects only the current QA campaign and pending owner receipts. The timer sends each bounded lookup over the existing loopback reverse tunnel using a dedicated forced-command SSH key. The collector checks the saved encrypted session and publishes through the existing signed observation endpoint.

- Add failing isolated cases for receipt selection, owner role, and dismissal of already matched evidence.
- Add failing collector input and runner tests for secret-free output, no work when empty, retries and enrollment errors.
- Implement the local selector, bounded runner, private collector stdin mode and timer.
- Run the full project checks, review the change, then activate and verify the deployed scope with a no-work timer run and replay of the retained real receipt.

The timer retries until 24 hours after the invoice deadline. The original bank transaction window governs matching. Re-enrollment and transport failures appear in the private service journal. This phase only runs provisional matching for the configured QA user and campaign.
