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
# Full node_modules (incl. Prisma CLI for migrate deploy) hoisted at the repo root.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/prisma ./prisma
EXPOSE 4000
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
