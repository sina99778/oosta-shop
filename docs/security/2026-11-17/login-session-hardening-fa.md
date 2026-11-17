# سخت‌سازی نشست ورود — 2026-11-17

پیگیری موارد ۴ و ۷ از [full-project-review-fa.md](full-project-review-fa.md).

## مشکل

- JWT هفت‌روزه در `localStorage` بود؛ هر XSS می‌توانست آن را بخواند و بیرون ببرد.
- راهی برای تغییر رمز نبود و هیچ توکنی پیش از انقضا باطل نمی‌شد.
- «خروج» فقط توکن را از مرورگر پاک می‌کرد؛ نسخه دزدیده‌شده تا ۷ روز معتبر می‌ماند.

## تغییرات

### API
- **کوکی نشست:** `oosta_session` با `HttpOnly; SameSite=Lax; Path=/` و `Max-Age` برابر انقضای JWT. در production پرچم `Secure` هم دارد (`apps/api/src/lib/sessionCookie.ts`). signup، login و change-password این کوکی را می‌گذارند.
- **احراز هویت:** `authenticate` هدر `Authorization` را ترجیح می‌دهد و بعد کوکی را می‌خواند. Bearer و API key برای اسکریپت‌ها و اتوماسیون مثل قبل کار می‌کنند.
- **محافظ CSRF:** هر درخواست نوشتنی (غیر از GET/HEAD/OPTIONS) که با کوکی احراز شود، باید `Origin` یا در نبودش `Referer` از `CORS_ORIGIN` داشته باشد؛ وگرنه `403 CSRF_REJECTED`.
- **ابطال نشست:** ستون `users.sessionVersion` اضافه شد (migration `20261117000100_user_session_version`). JWT مقدار `sv` را حمل می‌کند و اگر با DB نخواند، `401` برمی‌گردد. توکن‌های قدیمی بدون `sv` معادل ۰ حساب می‌شوند، پس استقرار کسی را خارج نمی‌کند. الگوریتم JWT به `HS256` قفل شد.
- **endpointهای جدید:**
  - `POST /auth/change-password`: رمز فعلی لازم است و rate limit دارد. رمز فعلی اشتباه `400` می‌دهد تا نشست سالم کاربر نیفتد. پس از تغییر، همه نشست‌های قبلی باطل می‌شوند و کوکی تازه صادر می‌شود.
  - `POST /auth/logout`: کوکی را پاک می‌کند.
  - `POST /auth/logout-all`: همه دستگاه‌ها را خارج می‌کند.
  - این دو کار (`change-password` و `logout-all`) با API key ممنوع‌اند (`403`).
- `sessionVersion` در پاسخ‌های کاربر برنمی‌گردد. مسیر `/auth` از قبل `Cache-Control: private, no-store` داشت.

### وب
- `lib/api.ts` همه درخواست‌ها را با `credentials: "include"` می‌فرستد و دیگر هدر `Authorization` نمی‌سازد.
- `lib/auth.tsx` توکن را ذخیره نمی‌کند و کلید قدیمی `oosta_token` را هنگام بارگذاری پاک می‌کند. فیلد `token` در context اکنون فقط یک نشانگر غیرمحرمانه (`session:<userId>`) است، تا ده‌ها کامپوننت موجود بدون تغییر کار کنند.
- صفحه جدید `/[locale]/dashboard/security`: تغییر رمز و «خروج از همه دستگاه‌ها». لینک آن در ناوبری حساب کاربری آمده است.

## بررسی‌ها

- **قرمز پیش از اصلاح:** `npm run test:isolated` با `AssertionError: Expected an oosta_session cookie` شکست خورد.
- **سبز پس از اصلاح:** تست جدید `apps/api/scripts/auth-session-regressions.ts` (که به `test:isolated` اضافه شد) روی DB یک‌بارمصرف با کاربر ساختگی این موارد را پوشش می‌دهد:
  - ویژگی‌های کوکی، از جمله `Secure` در production
  - رد کوکی جعلی و درخواست بدون احراز
  - رد Origin بیگانه، Origin غایب و Referer بیگانه، روی `change-password` و `/orders`
  - بی‌اثر بودن تلاش‌های ردشده
  - رمز فعلی اشتباه و رمز جدید ضعیف
  - ممنوعیت API key
  - ابطال کوکی و Bearer قدیمی پس از تغییر رمز و `logout-all`
  - کارکرد Bearer بدون Origin
- **نتایج کل مجموعه:**

| بررسی | نتیجه |
|---|---|
| `npm run verify` | exit 0، ۵۵ PASS |
| `npm run lint` | بدون خطا |
| `npm run build` | موفق؛ صفحه `/dashboard/security` ساخته شد |
| `npm audit --omit=dev` و `npm audit` | `found 0 vulnerabilities`، بدون تغییر وابستگی |

### آزمون دستی در مرورگر (dev)

- **محیط:** وب روی `localhost:3000` و API روی `localhost:4000`، با یک Postgres یک‌بارمصرف روی پورت 55432. دیتابیس کاری دست نخورد و کاربر ساختگی بود. پس از آزمون، سرورها خاموش شدند و دیتابیس حذف شد.
- **نتایج:**
  - کلید قدیمی `oosta_token` که دستی در `localStorage` گذاشته شده بود، هنگام بارگذاری پاک شد.
  - پس از ثبت‌نام و ورود، `localStorage` خالی بود و `document.cookie` هم خالی بود، یعنی کوکی httpOnly است. با این حال `/auth/me` با کوکی `200` داد و نشست پس از بارگذاری کامل صفحه ماند.
  - رمز فعلی اشتباه پیام «رمز عبور فعلی درست نیست.» را نشان داد و نشست نیفتاد.
  - تغییر رمز موفق، مرورگر را وارد نگه داشت، اما نشست دستگاه دوم (curl) را `401` کرد.
  - `logout-all` از یک Origin بیگانه با `403 CSRF_REJECTED` رد شد. از خود صفحه، مرورگر و دستگاه دیگر هر دو `401` شدند و کاربر به صفحه ورود رفت.
  - ورود دوباره از فرم با رمز جدید کار کرد. دکمه «خروج» در هدر کوکی را پاک کرد و پس از بارگذاری دوباره، `/auth/me` همچنان `401` بود.
- **آزموده نشد:** production پشت nginx/CDN با HTTPS و پرچم `Secure`، و مرورگرهای دیگر (Safari/Firefox).

### استقرار روی VPS (2026-11-17)

- **release:** `/opt/oostaAI/releases/20261117-login-session` از commit `b9ef681` (git archive) ساخته شد و `current` به آن اشاره می‌کند. فایل‌های migrationهای قبلاً اعمال‌شده از release قبلی کپی شدند تا بایت‌به‌بایت یکسان بمانند (تفاوت فقط CRLF بود).
- **پشتیبان و برگشت:**
  - backup دیتابیس با مجوز 0600: `/opt/oostaAI/shared/backups/pre-login-session-20261117.dump` (۲۲ جدول داده با `pg_restore -l` خوانده شد).
  - ایمیج‌های قبلی با tag `oosta-api:pre-login-session-20261117` و `oosta-web:pre-login-session-20261117` نگه داشته شدند.
  - نسخه قبلی پیکربندی nginx: `/opt/oostaAI/shared/backups/nginx-oostaai.store.pre-login-session`.
- **migration:** فقط `20261117000100_user_session_version` اعمال شد (یک ستون اضافه با مقدار پیش‌فرض). به داده‌ها دست نخورد و چیزی seed نشد.
- **nginx:** catch-all پیش‌نمایش همه POSTها را با 503 می‌بست، پس `logout` نمی‌توانست کوکی را پاک کند. include جدید `deploy/nginx/oosta-auth-session-preview.conf` فقط `POST` به `logout`، `logout-all` و `change-password` را روی HTTPS عبور می‌دهد. `nginx -t` موفق بود و nginx reload شد. ثبت‌نام و بقیه نوشتن‌ها همچنان 503 هستند.
- **بررسی‌های زنده روی `https://oostaai.store`:**
  - `POST /api/auth/logout` جواب `204` داد، با `Set-Cookie: oosta_session=; HttpOnly; SameSite=Lax; Secure; Max-Age=0`.
  - `logout-all` و `change-password` بدون نشست `401` دادند. `GET logout` جواب `405` داد. کوکی جعلی روی `/auth/me` `401` گرفت. signup جواب `503` داد.
  - صفحه‌های `/fa`، `/fa/products`، `/fa/login` و `/fa/dashboard/security` همه `200` دادند.
  - `scripts/preview-http-check.cjs --login-ready` PASS شد، به جز یک فرض قدیمی: اسکریپت انتظار `no-store` را روی فایل‌های fingerprinted در `/_next` دارد، در حالی که `oosta-static-assets.conf` عمداً برای آن‌ها `immutable` می‌فرستد. این بررسی‌ها با همان اسکریپت، فقط بدون این یک assert، اجرا شدند.
- **آزموده نشد:** ورود واقعی ادمین در production، چون با رمز واقعی وارد نمی‌شوم. ادمین باید یک بار دوباره وارد شود و بعد از آن، خروج و ورود دوباره را امتحان کند.

## محدودیت‌ها و کارهای باقی‌مانده

- **فراموشی رمز** پیاده نشد، چون پروژه کانال ایمیل یا پیامک ندارد. فعلاً بازیابی فقط از طریق ادمین ممکن است.
- **CSP** هنوز `script-src` ندارد. با کوکی httpOnly، XSS دیگر توکن را نمی‌دزدد، اما تا وقتی صفحه باز است می‌تواند به نام کاربر درخواست بفرستد. CSP با nonce کار بعدی است.
- **تست مرورگر:** جریان کوکی فقط در dev آزموده شد (بخش بالا). production پشت nginx/CDN هنوز آزموده نشده است.
  - در dev، وب و API باید هر دو `localhost` باشند، یا هر دو `127.0.0.1`.
  - در production، `CORS_ORIGIN` (یعنی `PUBLIC_ORIGIN`) باید دقیقاً همان originی باشد که کاربر باز می‌کند. اگر سایت هم روی `www` و هم بدون آن سرو شود، هر دو باید در `CORS_ORIGIN` باشند.
- **ورود دوباره:** کاربرانی که با نسخه قبلی وارد شده‌اند، پس از استقرار یک بار باید دوباره وارد شوند، چون توکن `localStorage` پاک می‌شود.
- **API key:** بدون انقضا و scope باقی ماند (مورد ۶ بازبینی). 2FA ادمین هم هنوز پیاده نشده است.
