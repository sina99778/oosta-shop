# Build the API (run from the repo root: docker build -f apps/api/Dockerfile .)

# ---- Build stage ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
RUN npm run prisma:generate -w @oosta/api \
  && npm run build -w @oosta/api

# ---- Runtime stage ----
FROM node:24-alpine AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production
# Postgres client (pg_dump/psql) for the Telegram backup/restore feature.
RUN apk add --no-cache postgresql16-client \
  || apk add --no-cache postgresql17-client \
  || apk add --no-cache postgresql-client
# Full node_modules (incl. Prisma CLI for migrate deploy) hoisted at the repo root.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/prisma ./prisma
EXPOSE 4000
# Apply pending migrations, then start the server. `exec` makes node PID 1 so it
# receives SIGTERM directly (graceful shutdown) instead of being SIGKILLed.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
