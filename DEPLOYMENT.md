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
# CREDENTIALS_ENCRYPTION_KEY (openssl rand -hex 32 — back it up off-server!),
# and the Zarinpal settings (or PAYMENT_PROVIDER=mock to start without a gateway).
# ./oosta.sh doctor --fix generates any missing secrets for you.
```

> **Upgrading an existing install:** after pulling, set `CREDENTIALS_ENCRYPTION_KEY`
> and redeploy — on boot the API encrypts the existing plaintext stock once. Users
> are logged out once (sessions moved from localStorage to an httpOnly cookie).
> The site must be served over **HTTPS** (e.g. TLS at the ArvanCloud edge) because
> the session cookie is `Secure`; on a plain-HTTP test box set `COOKIE_SECURE=false`.

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

## 5. Lock the origin to the CDN (ArvanCloud)

The API trusts `TRUST_PROXY_HOPS=2` proxies (Arvan edge → nginx) to find each
visitor's real IP for rate limiting. If the server IP is also reachable directly, a
client can forge `X-Forwarded-For` and dodge the login brute-force limits. Once the
domain is proxied through Arvan:

```bash
curl -s https://www.arvancloud.ir/fa/ips.txt | sed 's/.*/allow &;/' > deploy/nginx/snippets/cdn-allow.list
# then uncomment `include /etc/nginx/snippets/cdn-only.conf;` in deploy/nginx/default.conf
docker compose -f docker-compose.prod.yml restart nginx
```

Re-run the `curl` line occasionally (Arvan's ranges change). Without a CDN, set
`TRUST_PROXY_HOPS=1` instead.

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
