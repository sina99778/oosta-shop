import type { Locale } from "./i18n";

export const siteInfoSlugs = ["about", "contact"] as const;
export const indexedPolicySlugs = ["terms", "return-policy", "privacy-policy"] as const;

export const sitePolicies = [
  {
    slug: "terms",
    fa: {
      title: "شرایط خرید و استفاده",
      content:
        "خرید از فروشگاه اوستا به معنای پذیرش شرایط زیر است. پیش از پرداخت، نوع دسترسی، مدت اشتراک، شیوهٔ تحویل، شرایط فعال‌سازی و نوع ضمانت همان پلن را در صفحهٔ محصول بررسی کنید.\n\n## انتخاب پلن، قیمت تقریبی و فاکتور\n\n- مبلغ‌هایی که پیش از فاکتور برای برخی گزینه‌های تأمین‌کننده با عنوان **قیمت تقریبی** نمایش داده می‌شوند، برآورد فعلی هستند و قیمت قطعی به شمار نمی‌روند.\n- هنگام رفتن به مرحلهٔ تأیید سفارش، موجودی و قیمت واقعی دوباره بررسی شده و مبلغ قابل پرداخت در **فاکتور نهایی** با مهلت اعتبار مشخص ثبت می‌شود.\n- اگر مهلت فاکتور به پایان برسد یا قیمت و موجودی تغییر کند، ادامهٔ پرداخت تنها پس از دریافت فاکتور تازه امکان‌پذیر است.\n\n## سبد مهمان و نگهداری اقلام\n\n- افزودن محصول پیش از ورود، تنها در مرورگر شما و تا ۲۴ ساعت (حداکثر ۱۰ قلم) نگهداری می‌شود و به معنای رزرو موجودی نیست.\n- پس از ورود به حساب کاربری، اقلام موجود به سبد حساب منتقل می‌شوند؛ در صورت پر بودن سبد یا تغییر موجودی، ادامهٔ ثبت سفارش با گزینه‌های موجود انجام می‌شود.\n\n## پرداخت، تحویل و لغو سفارش\n\n- پرداخت از طریق درگاه آنلاین یا کارت‌به‌کارت (در صورت فعال بودن هر روش) انجام می‌شود. در پرداخت کارت‌به‌کارت، تحویل پس از تأیید پرداخت انجام می‌شود. بسته به وضعیت پرداخت، تأیید می‌تواند خودکار یا با بررسی پشتیبانی باشد.\n- اطلاعات تحویل و جزئیات سفارش در حساب کاربری شما در دسترس است. پس از تحویل کد فعال‌سازی یا اطلاعات اکانت سالم مطابق مشخصات پلن، امکان لغو یا مرجوعی سلیقه‌ای وجود ندارد؛ مگر در مواردی که مشمول شرایط ضمانت همان پلن باشد.\n\n## استفادهٔ مجاز و پشتیبانی\n\n- مسئولیت رعایت قوانین سرویس مبدأ (از جمله پرهیز از اشتراک‌گذاری اکانت اختصاصی یا تغییر تنظیمات امنیتی برخلاف راهنمای پلن) بر عهدهٔ خریدار است.\n- برای پیگیری سفارش، شمارهٔ سفارش و شرح دقیق مشکل را در تیکت پشتیبانی ثبت کنید. رمز عبور، کد یک‌بارمصرف یا اطلاعات محرمانهٔ کارت بانکی را در تیکت و پیام تلگرام ارسال نکنید.",
    },
    en: {
      title: "Purchase terms",
      content:
        "Placing an order on Oosta confirms these purchase terms. Before paying, review the plan’s access type, duration, delivery method, activation rules, and warranty coverage on the product page.\n\n## Plan details, indicative prices, and invoices\n\n- Any amount labeled **Estimated price** on product listings or plan cards is indicative only, not a locked quote.\n- Before payment starts, availability and current pricing are rechecked and shown in your **final invoice** along with its validity window.\n- If the invoice expires or supplier price or availability changes, you must request a fresh invoice before paying.\n\n## Guest cart\n\n- Items saved before signing in stay in your browser for up to 24 hours (up to 10 items) and do not reserve stock.\n- After you sign in with a customer account, available items move to your account cart.\n\n## Payment, delivery, and cancellations\n\n- Orders are paid through the enabled payment methods. Card-transfer orders are delivered after payment is verified automatically or reviewed by support.\n- Delivered credentials or activation codes that match the plan terms cannot be canceled after delivery except under the plan’s stated warranty.\n\n## Support\n\n- Track payment and delivery in your dashboard and include the order number in support tickets. Never share passwords, one-time codes, or confidential card details in tickets or Telegram.",
    },
  },
  {
    slug: "return-policy",
    fa: {
      title: "ضمانت و بازگشت وجه",
      content:
        "شرایط ضمانت هر اشتراک دقیقاً بر اساس پلن انتخاب‌شده هنگام خرید تعیین می‌شود. پیش از نهایی کردن سفارش، وضعیت ضمانت را در خلاصهٔ کنار دکمهٔ خرید و بخش شرایط همان پلن بررسی کنید.\n\n## انواع پوشش ضمانت\n\n- **ضمانت کامل:** در بازهٔ مشخص‌شده، مشکلات ورود و فعال‌سازی یا قطع دسترسی اشتراک در صورتی که ناشی از اکانت یا فعال‌سازی تحویل‌شده باشد، بررسی و جایگزین یا رفع می‌شود.\n- **ضمانت فقط مشکل ورود:** پوشش محدود به تحویل سالم و ورود اولیهٔ بدون خطا در بازهٔ اعلام‌شده است و شامل قطع دسترسی در ادامهٔ دوره نمی‌شود.\n- **بدون ضمانت:** اشتراک با بررسی سلامت اولیه تحویل می‌شود و پس از تحویل، تعهد تعویض یا تمدید دورهٔ مصرف وجود ندارد.\n\n## موارد خارج از پوشش ضمانت\n\n- تغییر رمز عبور، نشانی ایمیل یا تنظیمات تأیید دومرحله‌ای در اکانت‌های آماده (مگر آنکه در شرایط اختصاصی پلن مجاز اعلام شده باشد).\n- در اختیار گذاشتن اکانت اختصاصی به افراد دیگر یا استفاده هم‌زمان بیش از سقف مجاز پلن.\n- محدودیت یا مسدودی ناشی از نقض قوانین سرویس مبدأ یا خطای کاربری پس از تحویل صحیح.\n\n## شرایط بازگشت وجه\n\n- اگر سفارش پرداخت‌شده به دلیل ناموجودی، تغییر شرایط تأمین یا عدم امکان تحویل تکمیل نشود، پس از بررسی تیکت پشتیبانی مبلغ آن مسترد می‌شود.\n- واریز بازگشت وجه صرفاً به همان کارت یا حساب پرداخت‌کننده انجام می‌شود و امکان عودت به حساب شخص ثالث وجود ندارد.\n- برای ثبت درخواست ضمانت یا بازگشت وجه، در پنل کاربری تیکت ثبت کنید و شمارهٔ سفارش و شرح خطا را (بدون ارسال رمز عبور یا کد تأیید) بنویسید.",
    },
    en: {
      title: "Warranty and refunds",
      content:
        "Warranty terms depend strictly on the specific plan you select at checkout. Always check the warranty summary next to the buy button and the plan’s activation terms before paying.\n\n## Warranty coverage tiers\n\n- **Full coverage:** Within the stated warranty days, login issues or unexpected loss of subscription access caused by the delivered account or activation are reviewed and resolved or replaced.\n- **Login issues only:** Coverage is limited to valid initial sign-in during the stated window and does not cover access drops later in the term.\n- **No warranty:** No ongoing replacement warranty applies beyond initial valid delivery.\n\n## Exclusions\n\n- Changing the password, email, or two-factor authentication settings on ready accounts unless explicitly permitted in the plan’s activation rules.\n- Sharing personal accounts or exceeding plan device limits.\n- Account restrictions caused by violating the upstream provider’s terms of service.\n\n## Refunds\n\n- If a paid order cannot be fulfilled due to unavailability or delivery failure, a refund is processed strictly back to the original paying bank card or account after ticket review.\n- To request warranty support or a refund, open a support ticket with your order number and issue description without sending passwords or OTP codes.",
    },
  },
  {
    slug: "privacy-policy",
    fa: {
      title: "حریم خصوصی",
      content:
        "اوستا فقط داده‌های لازم برای ورود امن، پردازش سفارش، اطلاع‌رسانی و پشتیبانی را نگهداری می‌کند و اطلاعات حساب شما را در اختیار اشخاص غیرمرتبط قرار نمی‌دهد.\n\n## اطلاعات حساب، بازیابی رمز و اعلان‌ها\n\n- برای ثبت سفارش و دسترسی به محصولات تحویل‌شده، اطلاعات حساب کاربری و نشست ورود ذخیره می‌شود.\n- اگر ایمیل حساب را برای بازیابی تأیید کرده باشید، می‌توانید از آن برای بازنشانی رمز استفاده کنید. اعلان موجودی به ایمیل حساب ارسال می‌شود، به شرطی که درخواست «موجود شد خبرم کن» ثبت کرده باشید. لغو اعلان موجودی در هر زمان از صفحهٔ محصول یا پنل کاربری ممکن است.\n\n## اطلاعات پرداخت و تیکت‌های پشتیبانی\n\n- رسیدها و شناسه‌های واریزی صرفاً برای تطبیق و تأیید پرداخت نگهداری می‌شوند.\n- متن تیکت‌ها برای رسیدگی به پشتیبانی و پیگیری ضمانت ثبت می‌شود. لطفاً رمز عبور، کد تأیید پیامکی یا اطلاعات محرمانهٔ کارت (مانند رمز دوم و CVV2) را در تیکت یا پیام تلگرام وارد نکنید.\n\n## حافظهٔ مرورگر و آمار بازدید\n\n- اگر پیش از ورود محصولی به سبد اضافه کنید، تنها شناسهٔ پلن و زمان افزودن به‌صورت موقت (تا ۲۴ ساعت) همراه با ترجیح تم (روشن/تیره) در مرورگر شما ذخیره می‌شود.\n- آمار بازدید و مراحل خرید در خود سایت بدون کوکی و بدون ذخیرهٔ نشانی IP خام (با شناسهٔ روزانهٔ یک‌طرفه) جمع‌آوری می‌شود تا خطاهای پرداخت و جست‌وجو بهتر شوند.\n- اگر گوگل آنالیتیکس فعال شود، فروشگاه بازدید صفحه‌های عمومی را بدون پارامترهای آدرس ثبت می‌کند. این امکان برای ورود، حساب، سبد، پرداخت، پشتیبانی و بازیابی رمز در نظر گرفته نشده است. گوگل آنالیتیکس ممکن است از کوکی استفاده کند.",
    },
    en: {
      title: "Privacy",
      content:
        "Oosta stores only the data required for secure sign-in, order fulfillment, notifications, and customer support.\n\n## Account, password recovery, and notifications\n\n- Account credentials and session metadata are used for authentication and order tracking.\n- You can use your account email to reset your password after verifying it for recovery. If you subscribe to a stock-availability alert, it is sent to your account email and you can cancel the subscription at any time.\n\n## Payment and support data\n\n- Payment receipts and transaction references are used strictly to verify and reconcile your order.\n- Support tickets are stored to handle delivery and warranty requests. Never share passwords, one-time codes, or sensitive card PIN/CVV details in tickets or Telegram.\n\n## Browser storage and analytics\n\n- Guest cart selections store only the plan ID and timestamp locally in your browser for up to 24 hours, alongside your light/dark theme preference.\n- First-party storefront analytics run without cookies or stored raw IP addresses using daily rotating hashes.\n- If Google Analytics is enabled, the store records visits to public pages without sending URL query parameters as part of the page view. Sign-in, account, cart, payment, support, recovery, and admin pages are excluded. Google Analytics may use cookies.",
    },
  },
  {
    slug: "about",
    fa: {
      title: "درباره ما",
      content:
        "اوستا فروشگاه اشتراک ابزارهای هوش مصنوعی، طراحی و بهره‌وری است. در صفحهٔ هر محصول می‌توانید مدت اشتراک، نوع دسترسی، روش تحویل و شرایط ضمانت هر پلن را پیش از خرید بررسی کنید.\n\nپس از خرید، جزئیات پرداخت و تحویل سفارش در پنل کاربری در دسترس است. برای پرسش‌های پیش از خرید یا پیگیری سفارش، از راه‌های ارتباطی صفحهٔ تماس استفاده کنید.",
    },
    en: {
      title: "About us",
      content:
        "Oosta is a store for AI, design and productivity subscriptions. Before buying, you can check each plan’s duration, access type, delivery method and warranty on the product page.\n\nAfter checkout, you can find payment and delivery details in your account. For questions about a plan or an order, use the options on our contact page.",
    },
  },
  {
    slug: "contact",
    fa: {
      title: "تماس با ما",
      content:
        "برای پرسش دربارهٔ پلن‌ها می‌توانید به پشتیبانی پیام بدهید. برای پیگیری پرداخت، تحویل یا ضمانت سفارش، در پنل کاربری تیکت ثبت کنید و شمارهٔ سفارش را بنویسید.",
    },
    en: {
      title: "Contact us",
      content:
        "Contact support if you have questions about a plan. For payment, delivery or warranty issues, open a ticket in your account and include your order number.",
    },
  },
] as const;

export function sitePolicy(slug: string, locale: Locale) {
  const policy = sitePolicies.find((entry) => entry.slug === slug);
  return policy ? { slug: policy.slug, ...policy[locale] } : null;
}
