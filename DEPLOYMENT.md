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
docker compose -f docker-compose.prod.yml --env-file .env.production exec api npm run db:seed
```

This creates the demo catalog and an admin (`admin@oosta.local` / `Admin@12345`).
**Change the admin password** (or seed your own data) before going live.

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
