# Backend audit corrections

- **3. Email identity.** Signup, login, and administrator bootstrap normalize email addresses. The migration canonicalizes existing email values and the database enforces canonical storage through a check constraint and its existing unique index. The isolated regression exercises a legacy mixed-case email, migration rollback on collision, signup with extra whitespace, login with different casing, duplicate-signup rejection, and welcome gift ownership.
- **4. Supplier synchronization.** Refreshes check freshness and perform supplier HTTP outside a database transaction. Concurrent requests for the same supplier in one process share a refresh. Replicas may issue separate catalog requests, but the short advisory transaction rechecks the snapshot before saving. Tests inspect database activity during the stubbed fetch, exercise concurrent syncs and denied administration, and verify that a supplier failure preserves the previous snapshot and allows a retry.
- **7. Telegram generation.** The private administrator chat receives approved generated images as documents. The latest authorized result stays in memory for up to ten minutes. Replying directly to its Telegram message supplies it to the agent for a separately approved placement. If sending fails, `/lastimage` resends the retained result without another model call. A process restart clears this buffer. The regression stubs OpenRouter and Telegram, exercises unauthorized chats, one-time approval, upload retry, reuse, and model rejection.
- **9. Analytics identity.** The API uses Express's configured proxy trust to determine the IP and records unknown country for new page views. Direct client country headers cannot establish geographic attribution. Historical country data is retained. Visits still store a daily visitor hash and pathname, and the public analytics endpoint remains an approximate traffic signal. Proxy/CDN behavior in production requires separate verification.
- **11. Catalog order.** Positive admin sort values pin products before ordinary ranking in recommended and newest results, before pagination. The regression checks denied admin writes, authorized updates, first-page results, and other supported search modes.
- **12 and 17. Sales dashboard.** Daily sales use Tehran calendar dates for stored UTC payment timestamps. The unused paid amount aggregate was replaced with a count query. The test checks the admin role, private no-store caching, an evening UTC payment, the rial value of a toman payment, and exclusion of a refunded order.

## Existing email collisions

Before deploying, run this read-only query in the target database to see whether the canonical email migration will stop.

```sql
SELECT array_agg(id ORDER BY "createdAt", id) AS account_ids
FROM users
WHERE email IS NOT NULL
GROUP BY lower(btrim(email) COLLATE "C")
HAVING COUNT(*) > 1;
```

Each result needs identity and ownership review before migrating. Resolve the conflicting addresses with verified owners while keeping account IDs and existing orders, sessions, and gifts intact. Schedule the migration and API rollout together. If the deployment already attempted the migration and recorded a Prisma failure, mark the rolled-back migration as rolled back after resolving the conflict and then retry deployment.
