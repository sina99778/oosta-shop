/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const directory = path.join(__dirname, "product-content");
const files = fs.readdirSync(directory).filter((file) => /^top-[a-z-]+\.fa\.json$/.test(file));
const products = files.flatMap((file) =>
  JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")),
);
const slugs = [
  "chatgpt",
  "gemini",
  "claude",
  "cursor",
  "perplexity",
  "grok",
  "copilot",
  "github-education",
  "canva",
  "capcut",
  "adobe-creative-cloud",
  "figma",
  "microsoft-365",
  "microsoft-office",
  "windows",
  "notion",
  "netflix",
  "spotify",
  "youtube-premium",
  "discord",
  "prime-video",
  "apple-music",
  "linkedin",
  "zoom",
];
assert.deepEqual(products.map((product) => product.slug).sort(), slugs.sort());
assert.equal(new Set(products.map((product) => product.metaTitle)).size, products.length);
assert.equal(new Set(products.map((product) => product.metaDescription)).size, products.length);
const domains = [
  "openai.com",
  "chatgpt.com",
  "google.com",
  "anthropic.com",
  "claude.com",
  "claude.ai",
  "cursor.com",
  "cursor.sh",
  "perplexity.ai",
  "x.ai",
  "grok.com",
  "microsoft.com",
  "github.com",
  "github.blog",
  "canva.com",
  "capcut.com",
  "adobe.com",
  "figma.com",
  "notion.com",
  "notion.so",
  "netflix.com",
  "spotify.com",
  "youtube.com",
  "discord.com",
  "primevideo.com",
  "amazon.com",
  "amazon.co.uk",
  "apple.com",
  "linkedin.com",
  "zoom.com",
  "zoom.us",
];
for (const product of products) {
  const words = product.description.trim().split(/\s+/).length;
  assert(words >= 230 && words <= 800, product.slug + " needs a substantive description");
  assert(
    product.shortDescription.length > 60 && product.shortDescription.length <= 300,
    product.slug,
  );
  assert(product.metaTitle.length >= 30 && product.metaTitle.length <= 80, product.slug);
  assert(
    product.metaDescription.length >= 110 && product.metaDescription.length <= 180,
    product.slug,
  );
  assert(!/^# /m.test(product.description), "Page already provides the H1");
  assert((product.description.match(/^## /gm) ?? []).length >= 4, product.slug);
  assert((product.description.match(/^### /gm) ?? []).length >= 3, product.slug);
  assert(!/<script|<iframe|javascript:/i.test(product.description), product.slug);
  assert(product.sources.length > 0, product.slug);
  for (const source of product.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert(
      domains.some((domain) => url.hostname === domain || url.hostname.endsWith("." + domain)),
      source.url,
    );
  }
  assert(
    product.sources.some((source) => product.description.includes(source.url)),
    product.slug,
  );
}
const chatgpt = products.find((product) => product.slug === "chatgpt");
for (const slug of ["claude", "cursor", "grok"]) {
  const product = products.find((entry) => entry.slug === slug);
  assert(!/API/.test(product.metaTitle), slug);
  assert(product.metaTitle.length <= 50, slug);
}
const withSpecs = products.filter((product) => product.specs?.length);
assert.equal(withSpecs.length, 16);
for (const product of withSpecs) {
  assert.equal(new Set(product.specs.map(({ label }) => label)).size, product.specs.length);
  assert(
    product.specs.every(
      ({ label, value }) => label.length <= 100 && value.length <= 500 && value.trim(),
    ),
  );
}
assert(chatgpt.description.includes("زمان ضمانت از تحویل اکانت شروع می‌شود."));
assert(chatgpt.description.includes("موارد خارج از ضمانت"));
const gemini = products.find((product) => product.slug === "gemini");
assert.match(gemini.metaTitle, /Plus.*Pro/);
assert.match(gemini.description, /## Google AI Plus/);
assert.match(gemini.description, /۴۰۰ گیگابایت/);
assert.match(gemini.description, /شش‌ماهه/);
assert.match(gemini.description, /سهمیه/);
assert(gemini.sources.some(({ url }) => url.includes("/answer/16882689")));
console.log(
  "PASS: 24 distinct reviewed product descriptions, metadata, headings, official references and existing ChatGPT warranty",
);
