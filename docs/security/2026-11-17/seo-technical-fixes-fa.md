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
  - `PRIVATE_PAGE_METADATA` برابر `noindex, nofollow` و `AUTH_PAGE_METADATA` برابر `noindex, follow`. هر دو `alternates: null` دارند تا canonical صفحهٔ اصلی ارث نرسد.
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
  - در build محلی، `og:url` صفحه‌های استاتیک به `localhost:4000` اشاره می‌کرد، چون آدرس سایت هنگام build تنظیم نبود. در production، `NEXT_PUBLIC_API_URL=${PUBLIC_ORIGIN}/api` به‌عنوان build arg داده می‌شود و `siteUrl()` دامنهٔ واقعی را برمی‌گرداند.

## محدودیت‌ها

- روی سرور مستقر نشده است.
- هدر `X-Robots-Tag: noindex, nofollow` در nginx پیش‌نمایش برای صفحهٔ اصلی، کاتالوگ و وبلاگ هنوز فعال است. باز کردن آن تصمیم مالک است و این تغییر آن را باز نمی‌کند.
- این موارد اصلاح نشدند:
  - ۷۲ محصول کم‌محتوا. این کار محتوایی است، نه فنی.
  - نبود `offers` در حالت پیش‌نمایش. عمدی است.
- با Google Rich Results Test یا Search Console آزموده نشد، چون صفحه‌ها هنوز noindex هستند و ابزار در دسترس نبود.
- تصویر OG پیش‌فرض مربعی است (۶۴۰×۶۴۰). برای کارت بزرگ شبکه‌ها، یک تصویر ۱۲۰۰×۶۳۰ بهتر است.
- صفحهٔ محصول بدون API، خطای ۵۰۰ می‌دهد. این رفتار قبلی است (`fetchJson` با `required`) و در این تغییر عوض نشد.
