import type { Locale } from "./i18n";

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
] as const;

export function sitePolicy(slug: string, locale: Locale) {
  const policy = sitePolicies.find((entry) => entry.slug === slug);
  return policy ? { slug: policy.slug, ...policy[locale] } : null;
}
