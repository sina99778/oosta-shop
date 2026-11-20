import { ApiError } from "./api";
import type { Locale } from "./i18n";

const messages: Record<string, readonly [fa: string, en: string]> = {
  UNAUTHORIZED: ["برای ادامه دوباره وارد حساب شو.", "Sign in again to continue."],
  FORBIDDEN: ["به این عملیات دسترسی نداری.", "You don’t have access to this action."],
  INVALID_CREDENTIALS: [
    "ایمیل، شماره موبایل یا رمز عبور درست نیست.",
    "The email, phone number, or password is incorrect.",
  ],
  ACCOUNT_CONFLICT: [
    "حسابی با این ایمیل یا شماره موبایل وجود دارد.",
    "An account with this email or phone number already exists.",
  ],
  NETWORK_ERROR: [
    "ارتباط با سرور برقرار نشد. دوباره تلاش کن.",
    "Couldn’t reach the server. Please try again.",
  ],
  RATE_LIMITED: [
    "تعداد تلاش‌ها زیاد است. کمی بعد دوباره تلاش کن.",
    "Too many attempts. Try again later.",
  ],
  VALIDATION_ERROR: ["اطلاعات واردشده را بررسی کن.", "Check the information you entered."],
  NOT_FOUND: ["مورد درخواستی پیدا نشد.", "The requested item was not found."],
  CART_FULL: [
    "سبد خریدت پر است. برای افزودن گزینهٔ جدید، یکی از موارد سبد را حذف کن.",
    "Your cart is full. Remove an item before adding another.",
  ],
  OUT_OF_STOCK: ["این پلن دیگر موجود نیست.", "This option has sold out."],
  ORDER_IN_PROGRESS: [
    "برای این گزینه یک سفارش باز داری. وضعیت آن را در داشبورد بررسی کن.",
    "This option already has an open order. Check its status in your dashboard.",
  ],
  CART_CHANGED: [
    "قیمت یا موجودی تغییر کرده است. گزینه را دوباره بررسی کن.",
    "Price or availability changed. Review the option again.",
  ],
  NO_CURRENT_OFFER: [
    "این گزینه فعلاً نزد تأمین‌کننده موجود نیست.",
    "This option is currently unavailable from the supplier.",
  ],
  PRICING_UNAVAILABLE: [
    "قیمت‌گذاری موقتاً در دسترس نیست. کمی بعد دوباره تلاش کن.",
    "Pricing is temporarily unavailable. Try again shortly.",
  ],
  NO_FILE: ["فایل رسید را انتخاب کن.", "Choose a receipt file."],
  INVALID_FILE: [
    "فایل JPG، PNG، WebP، GIF یا PDF تا ۵ مگابایت انتخاب کن.",
    "Choose a JPG, PNG, WebP, GIF, or PDF file up to 5 MB.",
  ],
  BAD_FILE_TYPE: ["نوع فایل رسید معتبر نیست.", "The receipt file type is invalid."],
  UPLOAD_ERROR: [
    "بارگذاری نشد. نوع فایل و سقف ۵ مگابایت را بررسی کن.",
    "Upload failed. Check the file type and the 5 MB size limit.",
  ],
  BLU_REFERENCE_REQUIRED: [
    "شماره پیگیری بانک را وارد کن.",
    "Enter the bank tracking or reference number.",
  ],
  RECEIPT_LIMIT: [
    "به سقف ارسال رسید رسیده‌ای. با پشتیبانی تماس بگیر.",
    "You’ve reached the receipt upload limit. Contact support.",
  ],
  ORDER_CLOSED: ["مهلت پرداخت این سفارش تمام شده است.", "This order’s payment window has expired."],
  ALREADY_REVIEWED: [
    "رسید قبلاً بررسی شده است. وضعیت سفارش را ببین.",
    "The receipt was already reviewed. Check your order status.",
  ],
  ALREADY_PAID: [
    "این سفارش دیگر رسید نمی‌پذیرد. وضعیت سفارش را ببین.",
    "This order no longer accepts receipts. Check your order status.",
  ],
};

export function apiErrorMessage(
  error: unknown,
  locale: Locale,
  fallback: string,
  form?: "login" | "signup",
) {
  if (!(error instanceof ApiError) || !error.code) return fallback;
  let code = error.code;
  if (form === "login" && code === "UNAUTHORIZED") code = "INVALID_CREDENTIALS";
  if (form === "signup" && code === "CONFLICT") code = "ACCOUNT_CONFLICT";
  return Object.hasOwn(messages, code) ? messages[code][locale === "fa" ? 0 : 1] : fallback;
}
