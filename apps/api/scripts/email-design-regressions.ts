import assert from "node:assert/strict";
import { renderEmail, renderCampaignEmail } from "../src/lib/email-design";

const reset = renderEmail({
  locale: "fa",
  kind: "security",
  subject: "بازیابی رمز عبور",
  body: "این پیوند یک‌بار قابل استفاده است.",
  action: { label: "رمز جدید", url: "https://oostaai.store/fa/reset-password#token=test" },
  details: ['<img src=x onerror="alert(1)">'],
});
assert.match(reset.html, /lang="fa" dir="rtl"/);
assert.equal((reset.html.match(/<td dir="rtl" align="right"/g) ?? []).length, 4);
assert.match(reset.html, /border-left:1px solid #d5e0e7;border-right:1px solid #d5e0e7/);
assert.doesNotMatch(reset.html, /border-inline/);
assert.match(reset.html, /#token=test/);
assert.match(reset.html, /&lt;img/);
assert.doesNotMatch(reset.html, /<img src=x|<script/i);
assert.match(reset.text, /https:\/\/oostaai.store\/fa\/reset-password#token=test/);
assert.throws(() =>
  renderEmail({
    locale: "en",
    kind: "notice",
    subject: "Notice",
    body: "Update",
    action: { label: "Read", url: "javascript:alert(1)" },
  }),
);
const campaign = renderCampaignEmail({
  locale: "fa",
  subject: "پیشنهاد اوستا",
  body: "پلن‌ها را مرور کنید.",
  action: { label: "محصولات", url: "https://oostaai.store/fa/products" },
  unsubscribeUrl: "https://oostaai.store/unsubscribe?ref=one&token=test",
});
assert.match(campaign.html, /لغو عضویت/);
assert.match(campaign.html, /ref=one&amp;token=test/);
assert.match(campaign.text, /لغو عضویت/);
const notice = renderEmail({ locale: "en", kind: "notice", subject: "Notice", body: "Update" });
assert.equal((notice.html.match(/<td dir="ltr" align="left"/g) ?? []).length, 3);
assert.throws(() =>
  renderCampaignEmail({
    locale: "fa",
    subject: "Offer",
    body: "Offer",
    unsubscribeUrl: "",
  }),
);
console.log(
  "PASS: branded transactional and marketing mail, safe text and links, RTL, plain text and unsubscribe",
);
