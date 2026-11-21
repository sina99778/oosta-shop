import type { Locale } from "./i18n";

export const siteInfoSlugs = ["about", "contact"] as const;

export const sitePolicies = [
  {
    slug: "terms",
    fa: {
      title: "شرایط خرید و استفاده",
      content:
        "پیش از پرداخت، نوع دسترسی، مدت اشتراک، شیوهٔ تحویل و ضمانت همان پلن را بررسی کنید. مبلغ نهایی را در مرحلهٔ تأیید سبد خرید می‌بینید.\n\nپس از ثبت سفارش، وضعیت پرداخت و تحویل را از جزئیات سفارش در پنل کاربری پیگیری کنید. در صورت بروز مشکل، شمارهٔ سفارش را در تیکت پشتیبانی بنویسید.",
    },
    en: {
      title: "Purchase terms",
      content:
        "Before paying, check the plan’s access type, subscription term, delivery method and warranty. The order confirmation shows the final amount.\n\nYou can track payment and delivery in your order details. Include the order number if you open a support ticket.",
    },
  },
  {
    slug: "return-policy",
    fa: {
      title: "ضمانت و بازگشت وجه",
      content:
        "مدت و نوع پوشش ضمانت هر اشتراک در مشخصات همان پلن نمایش داده می‌شود.\n\nبرای بررسی مشکل تحویل، قطع دسترسی یا درخواست بازگشت وجه، در بخش پشتیبانی تیکت ثبت کنید و شمارهٔ سفارش و شرح مشکل را بنویسید. درخواست بر اساس شرایط همان پلن و وضعیت سفارش بررسی می‌شود.",
    },
    en: {
      title: "Warranty and refunds",
      content:
        "Each plan shows its warranty period and coverage.\n\nFor a delivery or access issue, or to request a refund, open a support ticket with your order number and a description of the issue. We review the request based on the plan’s terms and the status of the order.",
    },
  },
  {
    slug: "privacy-policy",
    fa: {
      title: "حریم خصوصی",
      content:
        "فروشگاه از اطلاعات حساب برای ورود و پیگیری سفارش، و از اطلاعات پرداخت برای بررسی و تطبیق واریزی استفاده می‌کند. اطلاعاتی که در تیکت می‌فرستید برای رسیدگی به درخواست پشتیبانی استفاده می‌شود.\n\nرمز عبور، کد پیامکی یا اطلاعات محرمانهٔ کارت بانکی را در تیکت یا پیام تلگرام ارسال نکنید. برای پرسش دربارهٔ اطلاعات حسابتان از بخش پشتیبانی استفاده کنید.",
    },
    en: {
      title: "Privacy",
      content:
        "The store uses account details for sign-in and order tracking, payment details to verify payments, and support ticket information to handle your request.\n\nKeep passwords, one-time codes and confidential card details out of support tickets and Telegram messages. Contact support if you have questions about your account data.",
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
