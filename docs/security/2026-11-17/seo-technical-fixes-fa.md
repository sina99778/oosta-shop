# اصلاحات فنی سئو — 2026-11-17

ادامهٔ [بازبینی سئوی محصولات و وبلاگ](seo-popular-products-blog-review-fa.md). موارد ۲، ۴، ۶ و ۷ جدول مشکلات آن گزارش در کد اصلاح شدند. فقط متادیتا، JSON-LD و نقشهٔ سایت تغییر کرد. API، DTOها، اعتبارسنجی، دسترسی‌ها و تنظیم nginx دست نخوردند.

## یافته‌ها

- **ارث‌بری canonical:** Next متادیتا را سطحی ادغام می‌کند. هر صفحه‌ای که `alternates` نداشت، canonical را از layout ارث می‌برد که `/<locale>` است. این صفحه‌ها خود را تکراریِ صفحهٔ اصلی معرفی می‌کردند:
  - کاتالوگ و فهرست وبلاگ
  - ورود و ثبت‌نام
  - داشبورد، پشتیبانی، پرداخت و ادمین
- **محتوای تک‌زبانه:** محصول، پست و صفحهٔ CMS در دیتابیس فیلد انگلیسی ندارند. با این حال:
  - نسخهٔ `/en/...` با hreflang `en` معرفی می‌شد.
  - هر دو نسخه در نقشهٔ سایت بودند.
- **اصلاح گزارش قبلی:** پست وبلاگ از قبل JSON-LD از نوع `Article` داشت، ولی بدون ناشر، `mainEntityOfPage` و زبان. مورد ۷ آن گزارش این را کامل ننوشته بود.

## تغییرات

- **`apps/web/lib/page-metadata.ts` (جدید):** helperهای مشترک:
  - `localizedPageMetadata`: canonical خودِ صفحه، hreflang `fa`/`en`/`x-default` و OG با تصویر برند.
  - `contentAlternates`: canonical همیشه نسخهٔ فارسی است و hreflang فقط `fa` و `x-default`.
  - `PRIVATE_PAGE_METADATA` برابر `noindex, nofollow` و `AUTH_PAGE_METADATA` برابر `noindex, follow`. هر دو `alternates: null` و `openGraph: null` دارند تا canonical و تگ‌های OG صفحهٔ اصلی ارث نرسند.
  - `organizationJsonLd`، `homeJsonLd` و `safeJsonLd`. `safeJsonLd` هر `<` را به `\u003c` تبدیل می‌کند.
- **کاتالوگ و فهرست وبلاگ:**
  - هر کدام عنوان و توضیح اختصاصی از دیکشنری دارند (`meta.catalogTitle` و موارد مشابه، در fa و en).
  - canonical هر صفحه خودش است.
  - آدرس‌های فیلتردار کاتالوگ (`?category=` و `?q=`) همان canonical کاتالوگ را می‌گیرند.
- **ورود و ثبت‌نام:** `noindex, follow`.
- **داشبورد، پشتیبانی، پرداخت و ادمین:**
  - `noindex, nofollow` از طریق layout همان بخش.
  - layout بخش ادمین از قبل وجود داشت. برای `dashboard`، `support` و `checkout` یک layout جدید ساخته شد که فقط `children` را برمی‌گرداند.
- **محصول، پست وبلاگ و صفحهٔ CMS:**
  - نسخهٔ `/en` به canonical فارسی اشاره می‌کند و hreflang `en` حذف شد.
  - `url` و `@id` در JSON-LD محصول هم آدرس فارسی است.
  - نقشهٔ سایت برای این سه نوع فقط آدرس فارسی را دارد. صفحهٔ اصلی، کاتالوگ و فهرست وبلاگ هنوز در هر دو زبان در نقشه هستند.
- **تصویر اشتراک‌گذاری:**
  - layout یک `og:image` پیش‌فرض دارد: `/brand/oosta-ai.png` در ابعاد ۶۴۰×۶۴۰.
  - محصول یا پستی که تصویر ندارد، یا تصویرش آدرس ناامن دارد، به همین تصویر برمی‌گردد. قبلاً در این حالت `og:image` نداشت.
- **JSON-LD:**
  - صفحهٔ اصلی یک `@graph` دارد با `Organization` و `WebSite`. `SearchAction` آن به `/<locale>/products?q=` اشاره می‌کند، که کاتالوگ واقعاً پشتیبانی می‌کند.
  - پست وبلاگ `BlogPosting` است و این فیلدها را دارد: `mainEntityOfPage`، `inLanguage: fa-IR`، `datePublished`، و `publisher` و `author` برابر Organization.
  - `dateModified` اضافه نشد، چون API عمومی وبلاگ `updatedAt` برنمی‌گرداند. برای افزودنش باید DTO عوض شود.

## بررسی‌ها

- **رگرسیون:** `scripts/seo-metadata-contracts.cjs` جدید است و به `test:contracts` اضافه شد. با داده و API ساختگی اجرا می‌شود و به شبکه دسترسی ندارد. این‌ها را بررسی می‌کند:
  - canonical و hreflang کاتالوگ و وبلاگ در دو زبان
  - رد شدن locale نامعتبر بدون هیچ fetch
  - robots صفحه‌های ورود و ثبت‌نام و هر چهار layout خصوصی
  - canonical فارسی برای پست و صفحهٔ CMS
  - BlogPosting، Organization و WebSite
  - نبود آدرس `/en/(products|blog|p)/…` در نقشهٔ سایت
  - escape شدن `</script>` در عنوان پست و عنوان سایت
  - خروجی دقیق `safeJsonLd`
- **اثبات رگرسیون:** همین تست روی کد قبل از تغییر شکست خورد، چون کاتالوگ `generateMetadata` نداشت.
- **تست قدیمی محصول:** `scripts/product-seo-contracts.cjs` با رفتار جدید به‌روز شد:
  - hreflang `en` وجود ندارد.
  - canonical نسخهٔ `/en` همان آدرس فارسی است.
  - تصویر ناامن به تصویر برند برمی‌گردد و آدرس `javascript:` هرگز در خروجی نمی‌آید.
- **خطای پیداشده و اصلاح‌شده حین کار:** هنگام نوشتن `safeJsonLd` با shell، یک بک‌اسلش حذف شد و escape عملاً بی‌اثر شد. اصلاح شد و assertion دقیق `safeJsonLd` در تست جلوی تکرارش را می‌گیرد.
- **دستورها:**
  - `npm run verify` با exit 0 تمام شد. هر دو تست سئو PASS دادند و هر دو گزارش `node --test` برابر `fail 0` بودند.
  - `npm run lint` بدون خطا رد شد.
  - `npm run build -w @oosta/web` موفق بود.
  - prettier روی فایل‌های تغییرکرده اجرا شد.
  - وابستگی‌ای تغییر نکرد.
- **HTML واقعی:** خروجی build با `next start` محلی اجرا شد و تگ‌های `<head>` با curl خوانده شدند:
  - `/fa/products` و `/en/blog`: canonical خودشان، سه hreflang، عنوان اختصاصی و `og:image`.
  - `/fa/login`: `noindex, follow`.
  - `/fa/dashboard`، `/fa/admin` و `/fa/support`: `noindex, nofollow` و بدون canonical.
  - `/fa`: JSON-LD شامل Organization و WebSite.
  - در build محلی، `og:url` صفحه‌های استاتیک به `localhost:4000` اشاره می‌کرد. فرض اولیهٔ من این بود که در production دامنهٔ واقعی ساخته می‌شود. این فرض غلط بود و بخش استقرار علت و اصلاحش را شرح می‌دهد.

## استقرار

- **release `20261117-seo-technical`** (commit `851aba6`):
  - فقط وب دوباره ساخته شد و با `--no-deps` بالا آمد. کانتینر API دست نخورد.
  - این release دو commit از Codex را هم شامل می‌شد (`29cd433` و `567bd5a`، موتور fulfillment تأمین‌کننده). این دو فقط API و migration `20261117000200_supplier_fulfillments` را تغییر می‌دهند. API از release جدید ساخته نشد و این migration روی دیتابیس اجرا نشد. آن کد هنوز روی سرور فعال نیست.
  - **پیش از استقرار:** backup دیتابیس با مجوز 0600 (`pre-seo-technical-20261117.dump`) و tag ایمیج قبلی وب (`oosta-web:pre-seo-technical-20261117`).
- **باگ پیدا شده پس از استقرار:**
  - روی سایت زنده، صفحه‌های استاتیک (ورود، ثبت‌نام، داشبورد، امنیت حساب، پرداخت و ادمین) `og:image` برابر `http://localhost:3000/brand/oosta-ai.png` داشتند.
  - **علت:** `docker-compose.vps.yml` وب را با `NEXT_PUBLIC_API_URL=/api` می‌سازد. در این حالت `siteUrl()` هنگام prerender دامنه را نمی‌داند و به `localhost:3000` برمی‌گردد. `og:url` این صفحه‌ها از قبل همین مشکل را داشت و این تغییر `og:image` را هم به آن اضافه کرد.
  - **اصلاح:** همهٔ صفحه‌های استاتیک، صفحه‌های خصوصی یا ورود هستند. پس `PRIVATE_PAGE_METADATA` و `AUTH_PAGE_METADATA` حالا `openGraph: null` دارند.
  - **رگرسیون:** assertion جدید در `seo-metadata-contracts.cjs` قبل از اصلاح شکست خورد و بعد از آن پاس شد. `verify`، lint و build دوباره پاس شدند.
  - این اصلاح با release `20261117-seo-technical-2` مستقر شد.
  - پیش از آن، ایمیج وب tag شد: `oosta-web:pre-seo-technical-2-20261117`. کد `apps/api` با release قبلی یکسان بود.
  - **بررسی پس از اصلاح:** روی سایت زنده، این صفحه‌ها `200` دادند و هیچ تگ OG یا آدرس `localhost` نداشتند. robots آن‌ها درست بود:
    - `/fa/login` و `/en/signup`: `noindex, follow`
    - `/fa/dashboard`، `/fa/admin` و `/fa/checkout/cancel`: `noindex, nofollow`
- **بررسی‌های زنده** روی `https://oostaai.store`:
  - `preview-http-check --login-ready` پاس شد.
  - `/fa/products` و `/en/blog` canonical خودشان و hreflang درست را دارند.
  - `/en/products/chatgpt` به `/fa/products/chatgpt` canonical شده و hreflang `en` ندارد.
  - صفحهٔ اصلی JSON-LD از نوع `WebSite` دارد.
  - نقشهٔ سایت ۱۰۳ آدرس دارد و هیچ‌کدام `/en/products/` نیست. قبلاً ۲۰۰ آدرس داشت.
  - هدر nginx برای صفحه‌های تکی محصول `index, follow` و برای بقیه `noindex, nofollow` است، مثل قبل.

## اصلاح ریشه‌ای: آدرس سایت در build سرور

- **مشکل:** `docker-compose.vps.yml` وب را با `NEXT_PUBLIC_API_URL=/api` می‌سازد. این مقدار دامنه ندارد، پس `siteUrl()` هنگام prerender به `http://localhost:3000` برمی‌گشت.
- **اصلاح** (commit `db0f05e`):
  - `docker-compose.prod.yml` به build وب آرگومان `NEXT_PUBLIC_WEB_URL: ${PUBLIC_ORIGIN}` می‌دهد. overlay سرور آن را تغییر نمی‌دهد، پس روی VPS هم اعمال می‌شود.
  - `apps/web/Dockerfile` در مرحلهٔ build، `ARG` و `ENV NEXT_PUBLIC_WEB_URL` را پیش از `npm run build` تعریف می‌کند. مقدار پیش‌فرض خالی است، پس رفتار قبلی (ساختن آدرس از API URL) برای کسی که این آرگومان را نمی‌دهد عوض نمی‌شود.
  - این مقدار فقط دامنهٔ عمومی سایت است و چیز محرمانه‌ای نیست.
- **رگرسیون:** `scripts/web-build-origin-contracts.cjs` به `test:contracts` اضافه شد. این‌ها را بررسی می‌کند:
  - آرگومان‌های build در ادغام prod و VPS
  - ترتیب `ARG`/`ENV` نسبت به `npm run build` در Dockerfile
  - خروجی `siteUrl()` با env سرور
  - تست قبل از اصلاح شکست خورد.
- **بررسی‌ها:**
  - `docker compose config` با env ساختگی، آرگومان‌های ادغام‌شده را `NEXT_PUBLIC_API_URL: /api` و `NEXT_PUBLIC_WEB_URL: https://example.test` نشان داد.
  - **کار هم‌زمان Codex:** هنگام اجرای بررسی‌ها، Codex تغییرات commit‌نشده‌ای در همین checkout داشت (checkout تأمین‌کننده). یکی از آن‌ها، `supplier-quote-panel.tsx`، خطای type داشت و `verify` و build را می‌شکست. آن تغییرات دست نخوردند.
  - بررسی‌ها در یک worktree موقت از HEAD به‌اضافهٔ فقط چهار فایل این تغییر اجرا شدند. `npm run verify` با exit 0 تمام شد (۶۰ خط PASS و `fail 0`) و `npm run lint` بدون خطا رد شد.
  - `next build` در آن worktree اجرا نشد، چون Turbopack با `node_modules` لینک‌شده کار نمی‌کند. این تغییر کد وب را عوض نمی‌کند. build واقعی، build Docker روی سرور بود و موفق شد.
- **استقرار:** release `20261117-web-origin`.
  - فقط وب ساخته و با `--no-deps` بالا آمد. `apps/api` با release قبلی یکسان بود.
  - ایمیج قبلی tag شد: `oosta-web:pre-web-origin-20261117`.
  - خروجی `docker compose config` روی سرور، `NEXT_PUBLIC_WEB_URL: https://oostaai.store` را نشان داد.
- **بررسی پس از استقرار:**
  - در کد سرور build‌شده، سه فایلی که در ایمیج قبلی `localhost:3000` داشتند، حالا `https://oostaai.store` دارند و هیچ فایلی `localhost:3000` ندارد.
  - روی سایت زنده هیچ صفحه‌ای `localhost` ندارد. صفحه‌های بررسی‌شده: `/fa`، `/fa/products`، `/fa/blog`، `/en/products/chatgpt`، `/fa/login`، `/fa/dashboard` و `/fa/admin`.
  - canonicalها و robots درست بودند و `preview-http-check --login-ready` پاس شد.
- `openGraph: null` روی صفحه‌های خصوصی و ورود باقی ماند. این صفحه‌ها چیزی برای اشتراک‌گذاری ندارند.

## محدودیت‌ها

- هدر `X-Robots-Tag: noindex, nofollow` در nginx پیش‌نمایش برای صفحهٔ اصلی، کاتالوگ و وبلاگ هنوز فعال است. باز کردن آن تصمیم مالک است و این تغییر آن را باز نمی‌کند.
- این موارد اصلاح نشدند:
  - ۷۲ محصول کم‌محتوا. این کار محتوایی است، نه فنی.
  - نبود `offers` در حالت پیش‌نمایش. عمدی است.
- با Google Rich Results Test یا Search Console آزموده نشد، چون صفحه‌ها هنوز noindex هستند و ابزار در دسترس نبود.
- تصویر OG پیش‌فرض مربعی است (۶۴۰×۶۴۰). برای کارت بزرگ شبکه‌ها، یک تصویر ۱۲۰۰×۶۳۰ بهتر است.
- صفحهٔ محصول بدون API، خطای ۵۰۰ می‌دهد. این رفتار قبلی است (`fetchJson` با `required`) و در این تغییر عوض نشد.
