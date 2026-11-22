export type ProductVariant = {
  plan: string;
  access: "PERSONAL" | "SHARED" | "TEAM";
  fulfillment: "ACCOUNT" | "INVITE" | "CODE" | "UPGRADE";
  delivery: "AUTOMATIC" | "MANUAL";
  warranty: { kind: "NONE" | "WARRANTED"; days: number; coverage: "NONE" | "LOGIN" | "FULL" };
  region: string;
  quota: string;
};
export type SupplierMapping = {
  supplier: string;
  externalId: string;
  fingerprint: string;
  automaticVerified?: boolean;
  variantKey?: string;
};

const planTerms: [RegExp, string][] = [
  [/\b(?:with\s+)?(?:full\s+warrant(?:y|naty)|fw)\b/gi, ""],
  [/\b(?:no\s+warranty|without\s+warranty|nw)\b/gi, ""],
  [/\b(?:\(?w\d+d\)?|bh\d+h)\b/gi, ""],
  [
    /\b(?:with\s+)?\d+(?:\s*(?:to|[-–])\s*\d+)?\s*[- ]?\s*(?:days?|months?|hours?|d|m|h)\s+warr(?:anty|naty)\b/gi,
    "",
  ],
  [/\bwarr(?:anty|naty)\s*(?:\d+\s*(?:days?|months?|years?|hours?|d|m|y|h))?/gi, ""],
  [/\b(\d+(?:\s*[-–]\s*\d+)?)\s*[- ]?\s*(?:years?|yrs?|y)\b/gi, "$1 ساله"],
  [
    /\b(\d+(?:\s*[-–]\s*\d+)?)\s*[- ]?\s*(?:months?|mos?|m)\b(?!\s*(?:tokens?|credits?))/gi,
    "$1 ماهه",
  ],
  [/\b(\d+(?:\s*[-–]\s*\d+)?)\s*[- ]?\s*(?:days?|d)\b/gi, "$1 روزه"],
  [/\bwithout (?:a )?card\b|\bno card(?: needed)?\b/gi, "بدون نیاز به کارت"],
  [
    /\bcdk\s*[-–]\s*redeem code\b|\b(?:redeem code|activation code|cdk|licen[cs]e key|key)\b/gi,
    "کد فعال‌سازی",
  ],
  [/\b(?:activation link|redeem link)\b/gi, "لینک فعال‌سازی"],
  [/\b(?:private|personal|individual|ready) account\b/gi, "اکانت اختصاصی"],
  [/\b(?:admin dashboard|admin panel|admin pannel|panel)\b/gi, "پنل مدیریت"],
  [/\b(?:slot invite for )?(\d+)\s+(permanent\s+)?slots?\b/gi, "$1 جای دعوت $2"],
  [/^slot\s*[-–]\s*(?=.*\binvite\b)/i, ""],
  [
    /\b(?:invite slot|slot invite|family slot|team slot|invites?|invitations?|slot[st]?)\b/gi,
    "دعوت",
  ],
  [/\b(?:auto delivery|automatic delivery)\b/gi, "تحویل خودکار"],
  [/\bmanual delivery\b/gi, "تحویل دستی"],
  [/\b(?:accounts?|acc)\b/gi, "اکانت"],
  [/\bsubscription\b/gi, "اشتراک"],
  [/\b(?:education|edu|student)\b/gi, "آموزشی"],
  [/\b(?:personal|individual|private)\b/gi, "اختصاصی"],
  [/\bshared\b/gi, "اشتراکی"],
  [/\bteam\b/gi, "تیمی"],
  [/\b(?:admin|administrator)\b/gi, "مدیر"],
  [/\bworkspace\b/gi, "فضای کاری"],
  [/\b(?:upgrade|upgrading)\b/gi, "ارتقای حساب"],
  [/\brenewal\b/gi, "تمدید"],
  [/\bactivation\b/gi, "فعال‌سازی"],
  [/\bdevices?\b/gi, "دستگاه"],
  [/\bseats?\b/gi, "کاربر"],
  [/\b(?:gb|gigabytes?)\b/gi, "گیگابایت"],
  [/\b(?:tb|terabytes?)\b/gi, "ترابایت"],
  [/\bcredits?\b/gi, "اعتبار"],
  [/\btokens?\b/gi, "توکن"],
  [/\bunlimited\b/gi, "نامحدود"],
  [/\blifetime\b|\bpermanent\b/gi, "دائمی"],
  [/\b(?:officially owned|official|real money|super good)\b/gi, ""],
  [/\b(?:link)\b/gi, "لینک"],
  [/\b(?:people|users)\b/gi, "نفر"],
  [/\bdrive\b/gi, "فضای ذخیره‌سازی"],
  [/\bextended\b/gi, "تمدیدشده"],
  [/\bfor\s+(?=\d)/gi, ""],
  [/\(awesome\)/gi, ""],
  [/\baccess\b/gi, "دسترسی"],
  [/\bgift\b/gi, "هدیه"],
  [/\b(?:random)\b/gi, "متغیر"],
  [/\b(?:all apps|full app)\b/gi, "همهٔ برنامه‌ها"],
  [/\b(?:login)\b/gi, "ورود"],
];

export function planDisplayLabel(label: string, fa: boolean): string {
  if (!fa) return label;
  const title = /\bcanva\b/i.test(label)
    ? label
        .replace(/\b(?:education|edu|student) accounts?\b/gi, "اکانت دانشجویی")
        .replace(/\b(?:education|edu|student)\b/gi, "دانشجویی")
    : label;
  const translated = planTerms.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    title,
  );
  return (
    translated
      .replace(/\(\s*\)|\[\s*\]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s·,–-]+|[\s·,–-]+$/g, "")
      .replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]) || label
  );
}

export function planOptionValue(value: string, fa: boolean): string {
  if (value === "UNSPECIFIED") return fa ? "مشخص نشده" : "Unspecified";
  if (fa && value === "US") return "آمریکا";
  if (fa && value === "GLOBAL") return "جهانی";
  return planDisplayLabel(value, fa);
}
export type PlanTrustSummary = {
  warranty: string;
  delivery: string;
  access: string;
};

const accessLabels = {
  PERSONAL: { fa: "اختصاصی", en: "Individual" },
  SHARED: { fa: "اشتراکی", en: "Shared" },
  TEAM: { fa: "تیمی", en: "Team" },
} as const;

const fulfillmentLabels = {
  ACCOUNT: { fa: "اکانت آماده", en: "Ready account" },
  INVITE: { fa: "اینوایتی", en: "Invitation" },
  CODE: { fa: "کد فعال‌سازی", en: "Redeem code" },
  UPGRADE: { fa: "فعال‌سازی روی حساب", en: "Account upgrade" },
} as const;

function deliveryLabel(delivery: ProductVariant["delivery"], fa: boolean): string {
  return delivery === "AUTOMATIC"
    ? fa
      ? "تحویل خودکار"
      : "Automatic delivery"
    : fa
      ? "تحویل دستی"
      : "Manual delivery";
}

function warrantyLabel(
  warranty: ProductVariant["warranty"],
  fa: boolean,
  loginText: { fa: string; en: string },
): string {
  if (warranty.kind === "NONE") return fa ? "بدون ضمانت" : "No warranty";
  const days = `${warranty.days.toLocaleString(fa ? "fa-IR" : "en-US")} ${fa ? "روز ضمانت" : "days warranty"}`;
  if (warranty.coverage === "FULL") return `${days} · ${fa ? "پوشش کامل" : "Full coverage"}`;
  if (warranty.coverage === "LOGIN") return `${days} · ${fa ? loginText.fa : loginText.en}`;
  return days;
}

/** Build scannable warranty, delivery, and access rows for the buy box. */
export function planTrustSummary(
  plan: {
    durationDays?: number | null;
    quoteRequired?: boolean;
    variant?: ProductVariant | null;
  },
  locale: "fa" | "en",
  options?: { cardToCard?: boolean },
): PlanTrustSummary {
  const fa = locale === "fa";
  const lang = fa ? "fa" : "en";
  const variant = plan.variant ?? null;

  const warranty = variant
    ? warrantyLabel(variant.warranty, fa, { fa: "فقط مشکل ورود", en: "Login issues only" })
    : fa
      ? "ضمانت مشخص نشده"
      : "Warranty unspecified";

  const baseDelivery = variant
    ? `${fulfillmentLabels[variant.fulfillment][lang]} · ${deliveryLabel(variant.delivery, fa)}`
    : fa
      ? "تحویل طبق مشخصات پلن"
      : "Delivery per plan details";
  const delivery = options?.cardToCard
    ? `${baseDelivery}${fa ? " (کارت‌به‌کارت پس از تأیید رسید)" : " (card transfer after receipt approval)"}`
    : baseDelivery;

  const duration =
    plan.durationDays == null
      ? plan.quoteRequired
        ? fa
          ? "مدت طبق عنوان پلن"
          : "Duration per plan title"
        : fa
          ? "بدون انقضا"
          : "Perpetual"
      : `${plan.durationDays.toLocaleString(fa ? "fa-IR" : "en-US")} ${fa ? "روز" : "days"}`;

  const access = variant
    ? [
        accessLabels[variant.access][lang],
        duration,
        variant.region === "UNSPECIFIED" ? null : planOptionValue(variant.region, fa),
        variant.quota === "UNSPECIFIED" ? null : planOptionValue(variant.quota, fa),
      ]
        .filter(Boolean)
        .join(" · ")
    : `${duration} · ${fa ? "نوع دسترسی مشخص نشده" : "Access type unspecified"}`;

  return { warranty, delivery, access };
}

export function variantDescription(v: ProductVariant, fa: boolean): string {
  const lang = fa ? "fa" : "en";
  return [
    accessLabels[v.access][lang],
    fulfillmentLabels[v.fulfillment][lang],
    warrantyLabel(v.warranty, fa, { fa: "مشکل ورود", en: "Login only" }),
    deliveryLabel(v.delivery, fa),
    v.region === "UNSPECIFIED" ? null : planOptionValue(v.region, fa),
    v.quota === "UNSPECIFIED" ? null : planOptionValue(v.quota, fa),
  ]
    .filter(Boolean)
    .join(" · ");
}
