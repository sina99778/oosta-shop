type EmailKind = "security" | "delivery" | "campaign" | "notice" | "welcome" | "stock";
type EmailLocale = "fa" | "en";

type EmailContent = {
  locale: EmailLocale;
  subject: string;
  body: string;
  details?: readonly string[];
  code?: string;
  action?: { label: string; url: string };
};

const categories = {
  security: { fa: "امنیت حساب", en: "Account security", color: "#b7ecd8" },
  delivery: { fa: "تحویل سفارش", en: "Order delivered", color: "#b7ecd8" },
  campaign: { fa: "پیشنهاد اوستا", en: "Oosta offers", color: "#f8d38c" },
  notice: { fa: "اطلاعیهٔ اوستا", en: "Oosta updates", color: "#c9d9fc" },
  welcome: { fa: "هدیهٔ اولین خرید", en: "First purchase gift", color: "#b7ecd8" },
  stock: { fa: "اطلاع‌رسانی موجودی", en: "Availability alert", color: "#b7ecd8" },
};
const brandOrigin = "https://oostaai.store";

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => entities[character]);

function checkedUrl(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      (process.env.NODE_ENV === "production" || url.protocol !== "http:"))
  ) {
    throw new Error("Email action requires a secure URL");
  }
  return url.href;
}

export function renderEmail(content: EmailContent & { kind: Exclude<EmailKind, "campaign"> }) {
  return render(content);
}

export function renderCampaignEmail(content: EmailContent & { unsubscribeUrl: string }) {
  return render({ ...content, kind: "campaign" }, checkedUrl(content.unsubscribeUrl));
}

export function renderWelcomeEmail(locale: EmailLocale, code: string, percent: number, base: URL) {
  const fa = locale === "fa";
  return renderEmail({
    locale,
    kind: "welcome",
    subject: fa ? "به اوستا خوش اومدی!" : "Welcome to Oosta AI",
    body: fa
      ? `این کد ${percent.toLocaleString("fa-IR")}٪ از مبلغ اولین خریدت کم می‌کند. کد مخصوص همین حساب است و فقط یک‌بار استفاده می‌شود.`
      : `Take ${percent}% off your first purchase. This single-use code belongs to your account.`,
    code,
    action: {
      label: fa ? "دیدن محصولات" : "Browse products",
      url: new URL(`/${locale}/products`, base).href,
    },
  });
}

function render(content: EmailContent & { kind: EmailKind }, unsubscribeUrl?: string) {
  const { locale, kind, subject, body, details = [], code, action } = content;
  const fa = locale === "fa";
  const dir = fa ? "rtl" : "ltr";
  const align = fa ? "right" : "left";
  const category = categories[kind];
  const brand = fa ? "اوستا ای‌آی" : "Oosta AI";
  const unsubscribe = fa ? "لغو عضویت" : "Unsubscribe";
  const account = {
    label: fa ? "حساب کاربری" : "My account",
    url: `${brandOrigin}/${locale}/dashboard`,
  };
  const support = {
    label: fa ? "راه‌های پشتیبانی اوستا" : "Oosta support",
    url: `${brandOrigin}/${locale}#footer-contact`,
  };
  const securityNote = fa
    ? "اوستا هرگز رمز عبور یا اطلاعات کارت شما را از طریق ایمیل نمی‌پرسد."
    : "Oosta never asks for your password or card details by email.";
  const url = action && checkedUrl(action.url);
  const text = [
    body,
    ...details,
    code,
    securityNote,
    `${account.label} — ${account.url}`,
    `${support.label} — ${support.url}`,
    url,
    unsubscribeUrl && `${unsubscribe} — ${unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  const rows = details
    .map(
      (row) =>
        `<tr><td dir="auto" align="${align}" style="text-align:${align};padding:7px 14px;color:#143039;font-size:14px;line-height:1.7">${escape(row)}</td></tr>`,
    )
    .join("");
  const button =
    action && url
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td dir="${dir}" align="${align}" style="padding-top:22px;text-align:${align}">
  <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#176057" style="border-radius:9px;mso-padding-alt:15px 24px"><a href="${escape(url)}" style="display:inline-block;mso-padding-alt:0;padding:15px 24px;color:#ffffff;font-weight:bold;font-size:15px;text-decoration:none">${escape(action.label)}</a></td></tr></table>
</td></tr></table>`
      : "";
  return {
    subject,
    text,
    html: `<!doctype html>
<html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#eaf0f3;font-family:Tahoma,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#eaf0f3"><tr><td align="center" style="padding:26px 12px">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" dir="${dir}" style="max-width:560px;border-spacing:0">
<tr><td dir="${dir}" align="${align}" bgcolor="#101d2e" style="text-align:${align};padding:26px 24px 30px;border-top:5px solid ${category.color};border-radius:14px 14px 0 0;color:#fff">
  <table role="presentation" dir="${dir}" cellspacing="0" cellpadding="0"><tr>
    <td valign="middle"><img src="${brandOrigin}/brand/oosta-email-mark-96.png" width="40" height="40" alt="${brand}" referrerpolicy="no-referrer" style="display:block;border:0;color:#fff;font-size:10px"></td>
    <td valign="middle" style="padding-${align}:10px;font-size:17px;font-weight:bold;color:#fff">${brand}</td>
  </tr></table>
  <p style="margin:19px 0 10px"><span style="display:inline-block;border-radius:16px;background:#213346;padding:4px 10px;font-size:13px;line-height:1.5;color:${category.color}">${category[locale]}</span></p>
  <h1 style="margin:0;font-size:26px;line-height:1.52;font-weight:bold;color:#fff">${escape(subject)}</h1>
</td></tr>
<tr><td dir="${dir}" align="${align}" bgcolor="#ffffff" style="text-align:${align};padding:23px 24px 26px;border-left:1px solid #d5e0e7;border-right:1px solid #d5e0e7;color:#182b39">
  <p style="margin:0;font-size:15px;line-height:1.95;color:#182b39">${escape(body).replace(/\r?\n/g, "<br>")}</p>
  ${rows || code ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f3f8f7" style="margin-top:16px;border-${align}:4px solid #176c80;border-radius:8px">${rows}${code ? `<tr><td dir="ltr" align="center" style="padding:12px 10px;color:#143039;font:15px/1.6 monospace;overflow-wrap:anywhere;word-break:break-all">${escape(code)}</td></tr>` : ""}</table>` : ""}
  ${button}
</td></tr>
<tr><td dir="${dir}" align="${align}" bgcolor="#f1f5f7" style="text-align:${align};padding:14px 24px;border:1px solid #d5e0e7;border-radius:0 0 14px 14px;color:#465866;font-size:13px;line-height:1.6">
  <p style="margin:0 0 7px">${securityNote}</p>
  <a href="${account.url}" style="color:#173d39;text-decoration:underline">${account.label}</a> ·
  <a href="${support.url}" style="color:#173d39;text-decoration:underline">${support.label}</a>${unsubscribeUrl ? ` · <a href="${escape(unsubscribeUrl)}" style="color:#173d39;text-decoration:underline">${unsubscribe}</a>` : ""}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`,
  };
}
