# Oosta VPS deployment implementation plan

> Execute inline using executing-plans. User authorized deployment to 91.107.254.140 and confirmed oostaai.store.

Goal: run the approved storefront on this shared VPS without disrupting existing services.
Architecture: existing host Nginx proxies loopback-bound Oosta web/API containers; a separate Postgres volume stores Oosta data. Use a read-only preview until gateway, catalog and administrator setup are ready.

Constraints: preserve navy/mint UI; never reset/seed working DB; no real payments, Telegram or paid-model calls in tests; keep secrets out of repository, logs and build context. Follow AGENTS.md.

- [x] Inspect resources, existing ports, DNS and Docker networks. Preserve all existing containers and Nginx sites.
- [x] Add a shared-VPS Compose overlay (loopback ports, resource limits, bundled proxy opt-in), read-only Nginx template and exclude runtime secrets from Docker context. Check composed configuration and denied HTTP methods.
- [x] Transfer filtered source into /opt/oostaAI/releases/<release>; keep generated secrets and persistent DB under separate protected shared paths. Build API then web sequentially; use dedicated swap if memory requires it.
- [x] Start isolated Oosta containers, apply existing migrations, inspect readiness, errors, restarts and resource use. Never run demo seed. Keep optional external providers blank.
- [x] Add and validate only Oosta Nginx site; test Host routing and request header normalization, private no-store and denied writes. Obtain domain TLS if DNS/CDN routes ACME to this origin; otherwise report exact DNS/CDN action.
- [x] Run verify, affected lint, production builds, audit and deployed HTTP checks. Record results and rollback instructions in docs/security. Independent review of deployment changes before final handoff.

Review focus: current sites retain routing; no DB/API public port; no mock purchase can reach API from public routes; runtime secrets never enter image/context; origin TLS and CDN cache policy checked separately.

