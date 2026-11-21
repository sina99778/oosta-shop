# باز کردن صفحهٔ اصلی، کاتالوگ و وبلاگ برای موتورهای جست‌وجو — 2026-11-17

به تأیید صریح مالک («Yes, open indexing»)، پس از انتشار شش مقالهٔ اول ([blog-articles-fa.md](blog-articles-fa.md)).

## پیش از تغییر

- `shared-vps-preview.conf` روی کل سایت هدر `X-Robots-Tag: noindex, nofollow` می‌گذاشت.
- فقط صفحه‌های تکی محصول با `oosta-product-indexing.conf` باز بودند.
- صفحهٔ اصلی، کاتالوگ و وبلاگ در گوگل ثبت نمی‌شدند.

## تغییر

- **فایل جدید** `deploy/nginx/oosta-content-indexing.conf` (روی سرور: `/etc/nginx/oosta-content-indexing.conf`):
  - یک `location` با regex دقیق `^/(?:fa|en)(?:/products|/blog(?:/<slug>)?)?$` که فقط `/fa`، `/en`، `/fa|en/products`، `/fa|en/blog` و `/fa|en/blog/<slug>` را می‌گیرد.
  - برای این مسیرها `X-Robots-Tag: index, follow` می‌گذارد.
  - همان محدودیت‌های حالت پیش‌نمایش را دارد: فقط GET، HEAD و OPTIONS (بقیه 503)، `Cache-Control: private, no-store` و `X-Oosta-Mode: preview-read-only`.
  - با regex بقیهٔ `location`ها (API، دارایی‌های استاتیک، صفحه‌های تکی محصول) هم‌پوشانی ندارد.
- **سایت nginx:** یک خط `include` بعد از `oosta-product-indexing.conf` اضافه شد. نسخهٔ قالب در مخزن (`shared-vps-preview.conf`) فقط یک توضیح گرفت.
- **پیش از اعمال:** backup به نام `/etc/nginx/sites-available/oostaai.store.pre-content-indexing-20261117` گرفته شد. اگر `nginx -t` شکست می‌خورد، همین backup خودکار برگردانده می‌شد. تست پاس شد و nginx فقط reload شد، بدون restart.
- **بازگشت:** خط `include` را حذف کنید، یا backup را برگردانید و `nginx -t && systemctl reload nginx` را اجرا کنید.

## بررسی‌ها

- **رگرسیون:**
  - `scripts/preview-http-check.cjs` فلگ `--content-indexed` گرفت:
    - صفحه‌های `/fa`، `/en`، `/fa/products`، `/en/products`، `/fa/blog` و اولین پستی که در `/fa/blog` لینک شده باید `index, follow` باشند.
    - صفحه‌های `/fa/login`، `/fa/dashboard`، `/fa/admin`، `/fa/checkout/cancel` و `/api/products` باید `noindex` بمانند.
  - `scripts/preview-http-regressions.cjs` (بخشی از `test:contracts`) رفتار nginx را با یک سرور ساختگی شبیه‌سازی می‌کند و این موارد را بررسی می‌کند:
    - با فلگ، اگر صفحهٔ اصلی noindex باشد، بررسی شکست می‌خورد.
    - با فلگ، اگر یک صفحهٔ خصوصی (`/fa/dashboard`) قابل ثبت باشد، بررسی شکست می‌خورد.
    - بدون فلگ، رفتار قبلی حفظ می‌شود.
- **بررسی زنده پیش از تغییر:** با `--content-indexed` شکست خورد (`/fa robots`). بعد از تغییر با `--login-ready --supplier-wallet-ready --content-indexed` پاس شد.
- **هدرهای زنده:**
  - **`index, follow`:** `/fa`، `/en`، `/fa/products` (با و بدون `?category=`)، `/fa/blog`، `/fa/blog/<slug>`، `/en/blog/<slug>` و صفحه‌های تکی محصول.
  - **`noindex, nofollow`:**
    - صفحه‌های حساب و مدیریت: `/fa/login`، `/fa/signup`، `/fa/dashboard`، `/fa/support`، `/fa/admin` و `/fa/checkout/cancel`
    - صفحه‌های CMS در `/fa/p/*`
    - `/api/*`
    - `/sitemap.xml` و `/robots.txt`. این هدر فقط جلوی ثبت خود این فایل‌ها را می‌گیرد، نه خواندنشان.
  - **درخواست‌های دیگر:**
    - `POST /fa/blog` همچنان 503 می‌دهد.
    - `/fa/blog/` با 308 به آدرس بدون اسلش می‌رود.
- **ESLint و prettier:** روی دو اسکریپت پاس شدند.
- **robots.txt و نقشهٔ سایت:** `robots.txt` همه‌چیز را مجاز می‌داند، به‌جز داشبورد، ادمین و پشتیبانی. نقشهٔ سایت ۱۰۹ آدرس دارد.

## سازگاری با metadata صفحه‌ها

- canonical صفحهٔ کاتالوگ و وبلاگ به خودشان اشاره می‌کند. آدرس‌های فیلتردار کاتالوگ canonical کاتالوگ را می‌گیرند.
- پست‌ها و محصولات انگلیسی canonical نسخهٔ فارسی را دارند ([seo-technical-fixes-fa.md](seo-technical-fixes-fa.md)). پس باز بودن `/en/blog/<slug>` محتوای تکراری نمی‌سازد.
- صفحه‌های ورود و حساب علاوه بر هدر nginx، تگ `meta robots` با مقدار noindex هم دارند.

## Google Search Console

- **ورود:** مالک در پنل مرورگر داخلی با حساب گوگل خودش وارد شد. هیچ رمزی وارد یا ذخیره نشد.
- **property:** از نوع URL prefix با آدرس `https://oostaai.store/` ساخته شد. این نوع به تغییر DNS نیاز ندارد.
- **تأیید مالکیت:** با روش فایل HTML انجام شد.
  - فایل جدید `deploy/nginx/oosta-search-console.conf` (روی سرور: `/etc/nginx/oosta-search-console.conf`) با یک `location =` دقیق، فقط `/googlecc8e43ab596ea33a.html` را با متن استاندارد گوگل سرو می‌کند.
  - پیش از تغییر از کانفیگ سایت backup گرفته شد (`oostaai.store.pre-search-console-20261117`). بعد `nginx -t` اجرا شد و nginx فقط reload شد.
  - نتیجه در Search Console: «Ownership verified»، روش «HTML file».
- **این فایل نباید حذف شود.** گوگل دوره‌ای آن را دوباره چک می‌کند. برای همین `preview-http-check --content-indexed` حالا وجود و محتوای فایل را هم بررسی می‌کند. `preview-http-regressions` هم حالتی را پوشش می‌دهد که فایل حذف شده باشد.
- **نقشهٔ سایت:** `sitemap.xml` ارسال شد. وضعیت اولیه «Couldn't fetch» و «Temporary processing error» بود.
  - از سمت ما فایل سالم است: پاسخ `200` با نوع `application/xml` و ۱۰۹ آدرس، که با user-agent Googlebot هم همین را برمی‌گرداند.
  - بررسی چند ساعت بعد لازم است.
- **تست زنده و درخواست ثبت:**
  - تست زندهٔ `https://oostaai.store/fa` در Search Console نتیجه داد: «URL is available to Google» و «Page can be indexed». یعنی CDN آروان جلوی Googlebot را نمی‌گیرد.
  - برای `/fa` و `/fa/blog` درخواست ثبت (Request indexing) ارسال شد.
- **داده‌های قبلی:** گزارش Indexing از قبل «23 not indexed، 0 indexed» نشان می‌داد. علتش هدر noindex دوران پیش‌نمایش بود.

## محدودیت‌ها

- ثبت واقعی در گوگل زمان می‌برد و تضمینی نیست. وضعیت نقشهٔ سایت و صفحه‌های ثبت‌شده باید در روزهای آینده در Search Console بررسی شود.
- صفحه‌های کاتالوگ با `Cache-Control: private, no-store` سرو می‌شوند. این حالت پیش‌نمایش است و مانع ثبت نیست، ولی کش CDN را برای این صفحه‌ها بی‌اثر می‌کند.
- ۷۲ محصول کم‌محتوا همچنان قابل ثبت‌اند. این مشکل در [بازبینی سئو](seo-popular-products-blog-review-fa.md) آمده و برطرف نشده است.
- صفحه‌های CMS (`/p/*`) عمداً باز نشدند.

## به‌روزرسانی ۲۲ نوامبر ۲۰۲۶

«درباره اوستا» و «تماس با اوستا» در CMS به حالت منتشرشده رفتند. تنظیم عمومی تلگرام، `@oostaAiSupport`، ثبت شد و صفحهٔ تماس هم لینک تلگرام و هم مسیر تیکت را نشان می‌دهد. محتوای CMS و حضور هر دو نشانی در نقشهٔ سایت پیش از تغییر ایندکس روی دامنهٔ زنده تأیید شدند.

قطعهٔ Nginx پس از `nginx -t` با reload اعمال شد. دو مسیر فارسی هدر `index, follow` و canonical فارسی دارند. نسخه‌های انگلیسی، صفحات قوانین، سبد، ورود، داشبورد و API در بررسی زنده همچنان `noindex` داشتند. برای این انتشار محتوایی، ایمیج برنامه جایگزین نشد. نسخهٔ قبلی قطعهٔ Nginx در `/opt/oostaAI/shared/oosta-content-indexing.before-cms-20261122.conf` است.
