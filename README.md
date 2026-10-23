# oostaAI — Digital Products Sales Platform

E-commerce platform for selling digital goods (AI accounts, licenses, gift cards) with
**fully automatic, instant delivery**: the moment a payment is confirmed, an available
inventory item is atomically assigned to the order and revealed to the buyer.

## Tech stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend  | Node.js + Express.js                |
| Database | PostgreSQL                          |
| ORM      | Prisma                              |
| Auth     | JWT + bcrypt                        |
| Payments | Zarinpal (gateway-agnostic design)  |

## Monorepo layout

```
oostaAI/
├── apps/
│   ├── api/        # Express REST API (auth, catalog, orders, payments, delivery engine)
│   └── web/        # Next.js storefront, user dashboard, admin dashboard
├── packages/       # (reserved for shared code)
├── scripts/        # dev helper scripts
├── docker-compose.yml
├── tsconfig.base.json
└── package.json    # npm workspaces root
```

## Prerequisites

- **Node.js >= 20** (developed on Node 24 — see `.node-version`)
- **PostgreSQL** — either Docker (`docker-compose.yml`) or a local install (see below)

## Getting started

```bash
# 1. Install all workspace dependencies
npm install

# 2. Start PostgreSQL
npm run db:up                 # via Docker
# or: npm run db:local:start  # local, no-Docker instance

# 3. Configure environment variables
#    Copy apps/api/.env.example -> apps/api/.env
#    (and apps/web/.env.example -> apps/web/.env.local)

# 4. Apply migrations and seed sample data
npm run prisma:migrate -w @oosta/api
npm run db:seed -w @oosta/api

# 5. Run the apps
npm run dev:api
npm run dev:web
```

### Seeded test accounts

| Role  | Email             | Password    |
| ----- | ----------------- | ----------- |
| Admin | admin@oosta.local | Admin@12345 |
| User  | user@oosta.local  | User@12345  |

## Local Postgres without Docker

If you can't run Docker, use a portable PostgreSQL instead — the connection string is
identical (`postgresql://oosta:oosta@localhost:5432/oosta`). Once the binaries are
extracted and a data cluster initialized, manage the server with:

```bash
npm run db:local:start    # start the local Postgres server
npm run db:local:status   # is it running?
npm run db:local:stop     # stop it
```

> The local server is a plain process (not a Windows service), so it does **not**
> auto-start after a reboot — run `db:local:start` again when you begin a session.
> Override locations with the `PG_BIN` / `PG_DATA` / `PG_LOG` / `PG_PORT` env vars.

## Useful scripts (root)

| Script                    | Description                          |
| ------------------------- | ------------------------------------ |
| `npm run db:up`           | Start the Postgres dev container     |
| `npm run db:down`         | Stop the Postgres dev container      |
| `npm run db:local:start`  | Start the local (no-Docker) Postgres |
| `npm run db:local:stop`   | Stop the local Postgres              |
| `npm run db:local:status` | Show local Postgres status           |
| `npm run lint`            | Lint all workspaces                  |
| `npm run format`          | Format the repo with Prettier        |
| `npm run typecheck`       | Type-check all workspaces            |
| `npm run build`           | Build all workspaces                 |

| `npm test -w @oosta/api` | API integration tests (needs a migrated `DATABASE_URL`) |

## How orders, stock and delivery work

- **Checkout reserves stock.** Creating an order marks its units `RESERVED`
  (`SELECT … FOR UPDATE SKIP LOCKED`), so two buyers can never pay for the same
  last unit. Unpaid orders expire after `ORDER_EXPIRY_MINUTES_ONLINE` /
  `ORDER_EXPIRY_MINUTES_CARD` and a background sweeper returns their stock.
- **Delivery happens once.** Payment callbacks and receipt approvals lock the
  order row; duplicates (refreshes, double taps, web + bot) are no-ops.
- **Paid but out of stock** (a late payment after expiry) becomes
  `PAID_UNFULFILLED` — never silently `FAILED`. The admin restocks and taps
  "Deliver order" (panel or Telegram), or refunds.
- **Undoing a delivered card-to-card sale** marks its units `REVOKED`: the buyer
  already saw them, so they are never resold.
- **Credentials are encrypted at rest** (AES-256-GCM, `CREDENTIALS_ENCRYPTION_KEY`),
  including inside DB backups. Keep an off-server copy of the key.
- **Sessions** are an httpOnly cookie (no token in `localStorage`); state-changing
  cookie requests must come from an allowed origin.
- **The Telegram AI agent** can't change payment/contact settings or delete data
  on its own — those are queued and need the admin's ✅ tap, and customer-written
  text (tickets, reviews) is treated as untrusted data.

CI (`.github/workflows/ci.yml`) runs format, lint, typecheck, build and the
Postgres-backed API tests on every push/PR.
