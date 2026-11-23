import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
assert.match(reset.html, /dir="rtl" align="right"/);
assert.match(
  reset.html,
  /<img[^>]*src="https:\/\/oostaai\.store\/brand\/oosta-email-mark-96\.png"[^>]*width="40"[^>]*height="40"[^>]*alt="اوستا ای‌آی"/,
);
assert.match(reset.html, /border-right:4px solid #176c80/);
assert.match(reset.html, /href="https:\/\/oostaai\.store\/fa\/dashboard"/);
assert.match(reset.text, /https:\/\/oostaai\.store\/fa#footer-contact/);
const mark = readFileSync(
  new URL("../../web/public/brand/oosta-email-mark-96.png", import.meta.url),
);
assert.equal(mark.subarray(1, 4).toString(), "PNG");
assert.equal(mark.readUInt32BE(16), 96);
assert.equal(mark.readUInt32BE(20), 96);
assert(mark.byteLength < 15 * 1024);
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
assert.match(notice.html, /dir="ltr" align="left"/);
const stock = renderEmail({
  locale: "en",
  kind: "stock",
  subject: "Back in stock",
  body: "Your plan is available.",
  details: ["Synthetic plan"],
  action: { label: "View plan", url: "https://oostaai.store/en/products/fixture?plan=example" },
});
assert.match(stock.html, /Availability alert/);
assert.match(stock.html, /border-left:4px solid #176c80/);
assert.match(stock.html, /href="https:\/\/oostaai\.store\/en\/products\/fixture\?plan=example"/);
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
