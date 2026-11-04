# Deployment (VPS via Docker Compose)

The production stack runs four containers behind Nginx on a single domain:

```
Internet → nginx (80/443) ─┬─ /        → web  (Next.js, :3000)
                           └─ /api/...  → api  (Express, :4000) → postgres (:5432)
```

`NEXT_PUBLIC_API_URL` is baked into the web image at build time as `${PUBLIC_ORIGIN}/api`.

## Prerequisites

- A Linux VPS with **Docker** + **Docker Compose**
- A domain with an `A` record pointing at the server

## 1. Configure

```bash
git clone <repo> && cd oostaAI
cp .env.production.example .env.production
# Edit .env.production: PUBLIC_ORIGIN, POSTGRES_PASSWORD, JWT_SECRET,
# and the Zarinpal settings (or PAYMENT_PROVIDER=mock to start without a gateway).
```

## 2. Build & run

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The API container runs `prisma migrate deploy` automatically on startup.

## 3. Seed sample data (optional, first deploy only)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -e ADMIN_EMAIL=admin@your-domain.com api npm run db:bootstrap
```

This creates the demo catalog and an admin (`admin@oosta.local` / `Admin@12345`).
The bootstrap command creates only a new administrator and prints a generated password once. It never resets the database. Store the password securely. Demo seeding is blocked in production.

## 4. Enable TLS (Let's Encrypt)

1. Obtain certificates (e.g. with `certbot`) for your domain.
2. Copy `fullchain.pem` and `privkey.pem` into `deploy/nginx/certs/`.
3. Uncomment the `listen 443 ssl` server block in `deploy/nginx/default.conf` and set `server_name`.
4. Set `PUBLIC_ORIGIN=https://your-domain` in `.env.production`, then rebuild web and reload nginx:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build web
   docker compose -f docker-compose.prod.yml restart nginx
   ```

## Operations

| Task              | Command                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Logs              | `docker compose -f docker-compose.prod.yml logs -f api web`                                      |
| Manual migrate    | `… exec api npx prisma migrate deploy`                                                           |
| DB backup         | `… exec -T postgres pg_dump -U oosta oosta > backup.sql`                                         |
| DB restore        | `cat backup.sql \| … exec -T postgres psql -U oosta -d oosta`                                    |
| Update & redeploy | `git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` |

## Payments (Zarinpal)

- Set `PAYMENT_PROVIDER=zarinpal`, a real `ZARINPAL_MERCHANT_ID`, and `ZARINPAL_SANDBOX=false`.
- After paying, Zarinpal returns the browser to `${PUBLIC_ORIGIN}/<locale>/checkout/callback`;
  the frontend then calls `POST /api/payments/verify`, which verifies the transaction with
  Zarinpal and runs instant delivery.
- The API refuses to boot in production if `JWT_SECRET` is the dev default or the Zarinpal
  merchant id is the placeholder (see `SECURITY.md`).

## Security/UI fixes deployment

Rebuild both images and run the production stack normally; the API applies migrations at startup. This release adds `PAID_PENDING_FULFILLMENT` so a captured payment with exhausted stock remains visible for manual fulfillment/refund. Do not run an older API against this status without a rollback plan.

Production refuses published placeholder JWT secrets, secrets shorter than 32 characters, and Zarinpal sandbox mode. Replace insecure values before restarting. Runtime sandbox overrides are also blocked. The Telegram bot accepts only the administrator's private chat; agent mutations now require approval of a specific operation and expire after two minutes.

Nginx normalizes forwarding headers using the official ArvanCloud CIDRs in `deploy/nginx/trusted-cdn.conf`. Keep that file synchronized with the provider's official feed, and replace it if changing CDN. Docker uses `172.30.0.0/24`; if changing the subnet, update `TRUST_PROXY` to match. Review origin firewall rules on the actual server. The SSL configuration generator retains the 6 MB request limit.

Use `npm run test:isolated` with PostgreSQL binaries available via `PG_BIN` (on Windows the local portable installation is detected). Tests create and remove their own cluster and never use the project's database. The full smoke suite and payment/receipt concurrency regressions run there.

If upgrading an existing Compose network to the explicit subnet, recreate the stack network during a maintenance window (`docker compose ... down`, without `-v`, then `up -d --build`). Keep the named PostgreSQL volume. Push alone does not deploy this release.
