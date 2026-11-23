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

## 3. Create an administrator (first deploy only)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -e ADMIN_EMAIL=admin@your-domain.com api npm run db:bootstrap
```

The bootstrap command creates only a new administrator and prints a generated password once. It never resets the database. Store the password securely. Demo seeding is blocked in production.

## Shared VPS with existing Nginx

Use `docker-compose.vps.yml` as an overlay. It keeps the bundled Nginx behind an opt-in profile, binds web/API only to `127.0.0.1:3400` and `127.0.0.1:4400`, leaves Postgres unpublished, and limits runtime memory. Build API and web sequentially on a small server. Set `PUBLIC_ORIGIN=https://oostaai.store`; browser API requests use same-origin `/api`, while SSR uses the internal API service.

```bash
cd /opt/oostaAI/current
docker compose -p oosta -f docker-compose.prod.yml -f docker-compose.vps.yml --env-file /opt/oostaAI/shared/.env.production build api
docker compose -p oosta -f docker-compose.prod.yml -f docker-compose.vps.yml --env-file /opt/oostaAI/shared/.env.production build web
docker compose -p oosta -f docker-compose.prod.yml -f docker-compose.vps.yml --env-file /opt/oostaAI/shared/.env.production up -d --no-build postgres api web
```

The current deployment is a **read-only preview**, using the host site in `/etc/nginx/sites-available/oostaai.store`. `deploy/nginx/shared-vps-preview.conf` is its template: enable the commented TLS lines only after issuing the origin certificate. Preserve the ACME webroot for renewal, test with `nginx -t`, then reload. Host port 80 still serves the origin for CDN compatibility; the CDN currently redirects visitors to HTTPS. Configure the CDN to use HTTPS to port 443 and validate the origin certificate before claiming encrypted end-to-end delivery.

Public writes return 503 except the exact login route **over origin HTTPS**, which retains API validation/rate limiting. HTTP login returns 503 even if the visitor reached the CDN with HTTPS; set the CDN origin protocol to verified HTTPS with SNI `oostaai.store` before sign-in. Once configured, the administrator can sign in and view data; account creation, editing, ordering and payment verification remain closed. Responses are no-store and noindex. Do not remove the preview restrictions until real gateway credentials, catalog/inventory, ownership checks and backup/restore operations have been reviewed. Never expose the mock API directly or open its loopback ports.

Secrets live outside releases at `/opt/oostaAI/shared/.env.production` with mode 600. Optional Telegram/AI credentials remain blank. The admin bootstrap output is kept at `/opt/oostaAI/shared/admin-bootstrap.txt`, also mode 600; it contains a credential, so never commit or paste it into logs. The initial PostgreSQL backup is `/opt/oostaAI/shared/backups/first-deploy.dump`; arrange scheduled off-server backups before accepting real purchases.

Check this preview explicitly (synthetic invalid input only; no real gateway calls):

```bash
node scripts/preview-http-check.cjs https://oostaai.store
# After verified HTTPS origin is enabled (expects login input validation instead of the TLS guard):
node scripts/preview-http-check.cjs https://oostaai.store --login-ready
```

To stop only Oosta, run the same Compose selection with `stop web api postgres`. Keep `oosta_pgdata`, secrets and backups. Do not stop other projects, delete volumes, or roll back migrations against a live database casually. The dedicated `/opt/oostaAI/shared/build.swap` adds 2 GiB swap for this shared server; it is currently active but not persisted across reboot.

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

### Free Navasan FX on the shared VPS

The VPS overlay mounts root-owned `/opt/oostaAI/shared/suppliers.env` (mode 600) read-only at `/run/secrets/oosta-suppliers.env`; create it before recreating the API. Store `NAVASAN_API_KEY` there, never in a release, image, shell argument or browser setting. A configured key supplies the default 30% currency-markup estimate policy only when no saved policy exists.

Attempts are reserved before HTTP in private `fx.navasan.free`: eight-hour spacing, cap 100 per rolling 31 days, including failures. Do not reset the ledger on restart/key change. Preserve the latest ledger when restoring a backup. HTTP 401/403 blocks retries pending operator review; no paid fallback exists. The local three-month expiry is not proof of the provider's actual expiry date. Rates are explicitly sampled estimates, capped at ten hours of source age. Supplier checkout stays disabled. See `docs/security/2026-11-07/free-fx-fa.md`.

| Task              | Command                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Logs              | `docker compose -f docker-compose.prod.yml logs -f api web`                                      |
| Manual migrate    | `… exec api npx prisma migrate deploy`                                                           |
| DB backup         | `… exec -T postgres pg_dump -U oosta oosta > backup.sql`                                         |
| DB restore        | `cat backup.sql \| … exec -T postgres psql -U oosta -d oosta`                                    |
| Update & redeploy | `git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` |

The Telegram backup button and interval now require `BACKUP_AGE_RECIPIENT` in the production environment. Use a public age recipient and keep the matching recovery key off the server. Follow [the encrypted backup and recovery drill](docs/security/2026-11-16/encrypted-backups.md) for decryption and disposable restoration.

## Payments (Zarinpal)

For the separate Blu matched-receipt worker, `BLU_AUTO_APPROVE_ENABLED=true` enables automatic receipt approval only after a signed matching bank claim and an intact stock reservation. The shared-VPS overlay passes this server-only flag; its default is false. Setting it to false and recreating the API restores manual approval. The existing collector timer retries persisted matches. This switch does not enable public checkout, create stock or authorize supplier spending. Keep the receipt route and `BLU_STOCK_CHECKOUT_ENABLED` scoped to the intended rollout. See `docs/security/2026-11-15/blu-automatic-approval.md` for checks and limits.

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
