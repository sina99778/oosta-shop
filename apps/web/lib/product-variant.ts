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
export function variantDescription(v: ProductVariant, fa: boolean): string {
  const access = {
    PERSONAL: fa ? "اختصاصی" : "Individual",
    SHARED: fa ? "اشتراکی" : "Shared",
    TEAM: fa ? "تیمی" : "Team",
  };
  const kind = {
    ACCOUNT: fa ? "اکانت آماده" : "Ready account",
    INVITE: fa ? "اینوایتی" : "Invitation",
    CODE: fa ? "کد فعال‌سازی" : "Redeem code",
    UPGRADE: fa ? "فعال‌سازی روی حساب" : "Account upgrade",
  };
  const delivery =
    v.delivery === "AUTOMATIC"
      ? fa
        ? "تحویل خودکار"
        : "Automatic delivery"
      : fa
        ? "تحویل دستی"
        : "Manual delivery";
  const warranty =
    v.warranty.kind === "NONE"
      ? fa
        ? "بدون ضمانت"
        : "No warranty"
      : `${v.warranty.days.toLocaleString(fa ? "fa-IR" : "en-US")} ${fa ? "روز ضمانت" : "days warranty"} · ${v.warranty.coverage === "FULL" ? (fa ? "پوشش کامل" : "Full coverage") : fa ? "مشکل ورود" : "Login only"}`;
  return [
    access[v.access],
    kind[v.fulfillment],
    warranty,
    delivery,
    v.region === "UNSPECIFIED" ? null : planOptionValue(v.region, fa),
    v.quota === "UNSPECIFIED" ? null : planOptionValue(v.quota, fa),
  ]
    .filter(Boolean)
    .join(" · ");
}
