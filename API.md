# oostaAI Admin API

Programmatic admin access for scripts and AI assistants. **Hand this file to your
assistant** — it documents everything needed to manage the store.

## Base URL

```
https://oostaai.store/api
```

(Local dev: `http://localhost:4000`.)

## Authentication

Create a key in the admin panel → **API** tab, then send it on every request as:

```
X-API-Key: oosta_sk_xxxxxxxxxxxxxxxxxxxxxxxx
```

(`Authorization: Bearer oosta_sk_...` also works.) The key has **full admin
access**. All `/admin/*` endpoints below require it.

## Conventions

- All bodies and responses are JSON (`Content-Type: application/json`), except
  image uploads (multipart/form-data).
- Errors: `{ "error": { "code": "...", "message": "..." } }` with a 4xx/5xx status.
- Money is a number in the product's currency (default `IRR`).

---

## Products

| Method | Path                  | Body                                            |
| ------ | --------------------- | ----------------------------------------------- |
| GET    | `/admin/products`     | — (list)                                        |
| GET    | `/admin/products/:id` | — (detail incl. plans, specs, SEO)              |
| POST   | `/admin/products`     | create (see below)                              |
| PATCH  | `/admin/products/:id` | partial update (any field below)                |
| DELETE | `/admin/products/:id` | (refused if it has orders — deactivate instead) |

Create/update body:

```json
{
  "name": "ChatGPT Plus Account",
  "slug": "chatgpt-plus-account",
  "shortDescription": "Instant, ready-to-use account.",
  "description": "Full **Markdown** description…",
  "specs": [{ "label": "Warranty", "value": "30 days" }],
  "isFeatured": true,
  "metaTitle": "Buy ChatGPT Plus",
  "metaDescription": "…",
  "type": "ACCOUNT", // ACCOUNT | LICENSE | GIFTCARD
  "categoryId": "<category id>",
  "isActive": true
}
```

### Categories

- `GET /admin/categories`
- `POST /admin/categories` `{ "name": "...", "slug": "..." }`

### Plans (price lives here)

- `POST /admin/products/:productId/plans` `{ "label": "1 Month", "price": 350000, "salePrice": 290000 }`
- `PATCH /admin/plans/:id` (partial: label, price, salePrice (number or null), isActive)
- `DELETE /admin/plans/:id`

### Images

- `POST /admin/products/:id/image` — multipart field `image` (primary image)
- `DELETE /admin/products/:id/image`
- `POST /admin/products/:id/images` — multipart field `image` (add a gallery image)
- `DELETE /admin/product-images/:imageId`

### Inventory (the deliverable stock)

- `POST /admin/inventory/bulk`

```json
{
  "planId": "<plan id>",
  "items": [
    { "accountEmail": "a@x.com", "accountPassword": "pw" }, // ACCOUNT
    { "licenseKey": "XXXX-YYYY" }, // LICENSE
    { "giftCardCode": "GC-123" } // GIFTCARD
  ]
}
```

- `GET /admin/inventory?planId=...&status=AVAILABLE`

---

## Content & SEO

- `POST /admin/seo/generate` → AI meta (needs GEMINI_API_KEY on the server)

```json
{
  "name": "…",
  "category": "…",
  "type": "ACCOUNT",
  "description": "…",
  "locale": "fa",
  "focusKeyword": "…"
}
```

returns `{ metaTitle, metaDescription, shortDescription, keywords[] }`.

- `GET /admin/ai/status` → `{ "enabled": true|false }`

---

## Blog

| Method | Path                    | Body                                                   |
| ------ | ----------------------- | ------------------------------------------------------ |
| GET    | `/admin/blog`           | list posts                                             |
| GET    | `/admin/blog/:id`       | one post                                               |
| POST   | `/admin/blog`           | `{ title, slug, excerpt, content (Markdown), status }` |
| PATCH  | `/admin/blog/:id`       | partial update                                         |
| DELETE | `/admin/blog/:id`       | delete                                                 |
| POST   | `/admin/blog/:id/cover` | multipart `image` (cover)                              |
| POST   | `/admin/blog/media`     | multipart `image` → returns a URL to embed in content  |

`status`: `DRAFT` | `PUBLISHED`. Inside `content` (Markdown) you can embed an
uploaded image with `![alt](<media url>)` and a video with `!video <url>`
(YouTube / Aparat / .mp4).

---

## Pages (standalone CMS pages)

Served publicly at `https://oostaai.store/<locale>/p/<slug>` (e.g. about, terms, FAQ).

| Method | Path               | Body                                          |
| ------ | ------------------ | --------------------------------------------- |
| GET    | `/admin/pages`     | list pages                                    |
| GET    | `/admin/pages/:id` | one page                                      |
| POST   | `/admin/pages`     | `{ title, slug, content (Markdown), status }` |
| PATCH  | `/admin/pages/:id` | partial update                                |
| DELETE | `/admin/pages/:id` | delete                                        |

`status` defaults to `PUBLISHED`. Public reads: `GET /pages` and `GET /pages/:slug`.

---

## Site settings (theme & copy, no redeploy)

- `GET /admin/settings` → current overrides
- `PATCH /admin/settings` → merge-patch; set a key to `null` (or `""`) to revert to the default

Keys (all optional): `themePrimary`, `themePrimaryDark`, `themeAccent`,
`themeAccentDark` (hex like `#0ea5e9` — buttons/links/gradients; `*Dark` falls
back to the light value), `heroTitleEn`, `heroTitleFa`, `heroSubtitleEn`,
`heroSubtitleFa` (home hero copy), `announcementEn`, `announcementFa`
(announcement bar above the header), `footerAboutEn`, `footerAboutFa` (footer
about text), `contactEmail`, `contactPhone`, `contactTelegram`,
`contactInstagram` (footer contact column), `enamadLink` (URL the Enamad badge
links to). Public read: `GET /site-settings` (also returns `enamadBadge: bool`).

Enamad trust badge image (shown in the footer):

- `POST /admin/settings/enamad` — multipart field `image`
- `DELETE /admin/settings/enamad`
- Public: `GET /site-assets/enamad`

---

## Payment gateways (runtime, no redeploy)

- `GET /admin/settings/payments` → current gateway config
- `PATCH /admin/settings/payments` → merge-patch; `null` (or `""` for strings)
  reverts a key to the env default

Keys: `provider` (`"zarinpal"` | `"mock"`), `zarinpalMerchantId`,
`zarinpalSandbox` (bool), `cardEnabled` (bool — offer card-to-card at checkout),
`cardNumber` (16 digits; spaces/dashes/Persian digits normalized), `cardHolder`,
`cardBank`. Public read used by checkout: `GET /payments/config`.

```json
{ "provider": "zarinpal", "cardEnabled": true, "cardNumber": "6219861012345678" }
```

```json
{ "themePrimary": "#7c3aed", "heroTitleFa": "اکانت‌های هوش مصنوعی، تحویل آنی" }
```

---

## Product ordering

`PATCH /admin/products/:id` accepts `sortOrder` (int). Higher = shown earlier on
listing pages; ties fall back to newest-first. Default is `0`.

---

## Orders, reviews, tickets, stats (read/manage)

- `GET /admin/orders?status=PAID` · `GET /admin/orders/:id`
- `GET /admin/stats` — revenue, sales-by-day, top products, low stock
- `GET /admin/reviews?status=PENDING` · `POST /admin/reviews/:id/approve|reject` · `DELETE /admin/reviews/:id`
- `GET /admin/tickets?status=OPEN` · `GET /admin/tickets/:id` · `POST /admin/tickets/:id/messages` `{ body }` · `POST /admin/tickets/:id/status` `{ status }`

---

## Example (create a product end-to-end)

```bash
BASE=https://oostaai.store/api
KEY=oosta_sk_xxx

# 1) create product
PID=$(curl -s -X POST "$BASE/admin/products" -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' \
  -d '{"name":"Spotify Premium","slug":"spotify-premium","description":"…","type":"ACCOUNT","categoryId":"<cat>"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["product"]["id"])')

# 2) add a plan
curl -s -X POST "$BASE/admin/products/$PID/plans" -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"label":"1 Month","price":150000}'

# 3) add stock
curl -s -X POST "$BASE/admin/inventory/bulk" -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' \
  -d '{"planId":"<plan id>","items":[{"accountEmail":"a@x.com","accountPassword":"pw"}]}'
```
