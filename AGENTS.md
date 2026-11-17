# Project quality and security checks

Preserve the approved bold navy/mint Oosta storefront direction.

For each implementation phase:
- Trace affected frontend callers, API DTOs, validation schemas and authorization checks together.
- Reproduce logic/security bugs with a regression before fixing them. Cover denied access and failure paths as well as successful requests.
- Run `npm run verify`, affected ESLint checks, and the relevant production build before claiming completion. Inspect the actual outputs.
- Check dependency advisories after dependency changes and before release: `npm audit --omit=dev` and `npm audit`. Keep unresolved advisories visible; passing behavior tests does not mean an advisory-free application.
- Use `npm run test:isolated` for migrations, purchases, refunds, inventory and restore tests. It creates a disposable database. Never seed or reset the working database for tests.
- Use synthetic users, tokens, payment providers and notification stubs. Do not send real Telegram notifications, call paid models or perform real gateway payments during automated tests.
- Review cache policy for private responses, order/ticket ownership, current database roles, payment verification, idempotent delivery and sensitive output for every affected flow.
- Record checks, fixes and remaining limits in `docs/security/`. Do not claim zero bugs or that the whole deployed system is secure from local tests.

The historical `security-review*.cjs` scripts assert some old vulnerable behavior; they are investigation evidence, not the green regression suite. Current tests are the scripts called by `npm run verify`.

Historical dependency findings and tested scope are documented in `docs/security/2026-11-05/review-fa.md`. The subsequent dependency fixes, audit results and compatibility limits are in `docs/security/2026-11-05/dependency-remediation-fa.md`.
