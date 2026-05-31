# oostaAI — Digital Products Sales Platform

E-commerce platform for selling digital goods (AI accounts, licenses, gift cards) with
**fully automatic, instant delivery**: the moment a Stripe payment is confirmed, an available
inventory item is atomically assigned to the order and revealed to the buyer.

## Tech stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend  | Node.js + Express.js                |
| Database | PostgreSQL                          |
| ORM      | Prisma                              |
| Auth     | JWT + bcrypt                        |
| Payments | Stripe (Checkout + webhooks)        |

## Monorepo layout

```
oostaAI/
├── apps/
│   ├── api/        # Express REST API (auth, catalog, orders, Stripe, delivery engine)
│   └── web/        # Next.js storefront, user dashboard, admin dashboard
├── packages/       # (reserved for shared code)
├── docker-compose.yml
├── tsconfig.base.json
└── package.json    # npm workspaces root
```

## Prerequisites

- **Node.js >= 20** (this repo is developed on Node 24 — see `.node-version`)
- **Docker** (for the local Postgres container)

## Getting started

```bash
# 1. Install all workspace dependencies
npm install

# 2. Start the local Postgres database
npm run db:up

# 3. Configure environment variables
#    Copy .env.example values into apps/api/.env and apps/web/.env.local
#    (see .env.example for the full contract)

# 4. Run the apps (added in later phases)
npm run dev:api
npm run dev:web
```

## Useful scripts (root)

| Script              | Description                      |
| ------------------- | -------------------------------- |
| `npm run db:up`     | Start the Postgres dev container |
| `npm run db:down`   | Stop the Postgres dev container  |
| `npm run lint`      | Lint all workspaces              |
| `npm run format`    | Format the repo with Prettier    |
| `npm run typecheck` | Type-check all workspaces        |
| `npm run build`     | Build all workspaces             |

## Implementation status

This project is being built in phases. **Phase 0 (scaffolding & tooling)** is complete:
monorepo workspaces, shared TypeScript/ESLint/Prettier config, the environment contract,
the local Postgres compose file, and skeleton `api` / `web` workspaces. Subsequent phases add
the Prisma schema, API, payments + delivery engine, and the frontend.
