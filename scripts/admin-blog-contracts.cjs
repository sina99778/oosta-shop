/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
process.env.TSX_TSCONFIG_PATH = path.resolve(__dirname, "../apps/web/tsconfig.json");
require("tsx/cjs");

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const fa = require("../apps/web/app/[locale]/dictionaries/fa.json");
const en = require("../apps/web/app/[locale]/dictionaries/en.json");
const post = {
  id: "fixture-article",
  slug: "beginner-guide",
  title: "راهنمای ابزارها",
  excerpt: "مقاله نمونه",
  content: "## شروع\n\nراهنمای آزمایشی",
  status: "DRAFT",
  hasCover: true,
  coverAlt: "کوله‌پشتی با ابزارهای برنامه‌نویسی",
  publishedAt: null,
  createdAt: new Date().toISOString(),
};
const live = {
  ...post,
  id: "public-fixture",
  slug: "public-guide",
  status: "PUBLISHED",
  publishedAt: post.createdAt,
};
let fail = false;
let editable = post;
let isPublished = true;
const load = Module._load;
Module._load = function (request, ...args) {
  if (request.endsWith(".module.css"))
    return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
  if (request === "next/link")
    return ({ children, ...props }) => React.createElement("a", props, children);
  if (request === "next/image")
    return ({ priority, ...props }) => React.createElement("img", { ...props, loading: priority ? "eager" : "lazy" });
  if (request === "next/navigation")
    return {
      useRouter: () => ({ replace: () => {} }),
      useParams: () => ({ locale: "fa" }),
      notFound: () => { throw new Error("Page not found"); },
    };
  if (request === "next/server") return { connection: async () => {} };
  if (request === "../dictionaries" || request === "../../dictionaries")
    return { getDictionary: async () => fa };
  if (request === "@/lib/seo")
    return {
      siteUrl: () => "https://example.invalid",
      fetchJson: async (url, revalidate) => {
        assert.equal(revalidate, 0, "Article routes must check the current publication state");
        return url === "/blog" ? { posts: isPublished ? [live] : [] } : isPublished ? { post: live } : null;
      },
    };
  if (request === "@/lib/auth") return { useAuth: () => ({ token: "fixture-session" }) };
  if (request === "@/lib/use-api")
    return {
      useApi: (url, token) => {
        assert.equal(token, "fixture-session");
        if (url === null) return { data: null, loading: false };
        assert.match(url, /^\/admin\/blog(?:\/fixture-article)?$/);
        return {
          data: fail ? null : url === "/admin/blog" ? { posts: [post, live] } : { post: editable },
          loading: false,
          error: fail ? new Error("Fixture outage") : null,
          refetch: () => {},
        };
      },
    };
  return load.call(this, request, ...args);
};
const { AdminBlogList } = require("../apps/web/components/admin/admin-blog-list.tsx");
const { AdminBlogEditor } = require("../apps/web/components/admin/admin-blog-editor.tsx");
const { Markdown } = require("../apps/web/components/markdown.tsx");
const { Journal, JournalArticle } = require("../apps/web/components/journal.tsx");
const { default: BlogPage } = require("../apps/web/app/[locale]/blog/page.tsx");
const { default: BlogPostPage } = require("../apps/web/app/[locale]/blog/[slug]/page.tsx");
Module._load = load;
const screen = (Component, options = {}) =>
  renderToStaticMarkup(React.createElement(Component, { locale: "fa", dict: fa, ...options }));
const list = screen(AdminBlogList);
assert.match(list, /مدیریت مقاله‌ها/);
assert.match(list, /type="search"/);
assert.match(list, /aria-pressed="true"/);
assert(list.includes("/fa/admin/blog/fixture-article"));
assert(!list.includes('href="/fa/blog/beginner-guide"'));
assert.match(screen(AdminBlogList, { locale: "en", dict: en }), /Articles/);
const edit = screen(AdminBlogEditor, { postId: post.id });
assert(edit.includes("ذخیره پیش‌نویس"));
assert(edit.includes("ذخیره تصویر جلد"));
assert(!edit.includes("مشاهده مقاله"));
assert(!edit.includes("برای همیشه حذف شود"));
editable = { ...live, id: post.id };
assert(screen(AdminBlogEditor, { postId: post.id }).includes("/fa/blog/public-guide"));
assert(!screen(AdminBlogEditor).includes('type="file"'));
fail = true;
assert.match(screen(AdminBlogList), /role="alert"/);
assert.match(screen(AdminBlogEditor, { postId: post.id }), /تلاش دوباره/);
assert(!screen(AdminBlogEditor, { postId: post.id }).includes("<textarea"));
const md =
  "## Heading\n\n![pic](/api/blog-media/a123)\n\n![tracker](https://example.invalid/tracker)\n\n[external](https://example.invalid/path)\n\n!video https://www.youtube.com/watch?v=abcdefghijk\n\n<b>raw</b>";
const preview = renderToStaticMarkup(React.createElement(Markdown, { text: md, preview: true }));
assert(preview.includes('src="/api/blog-media/a123"'));
assert(preview.includes("&lt;b&gt;"));
assert(!preview.includes("<iframe"));
assert(!preview.includes('src="https://example.invalid'));
assert(!preview.includes('href="https://example.invalid'));
const published = renderToStaticMarkup(React.createElement(Markdown, { text: md }));
assert(published.includes("https://www.youtube.com/embed/abcdefghijk"));
assert(published.includes('href="https://example.invalid/path"'));
const emptyJournal = screen(Journal, { posts: [], unavailable: false });
assert(emptyJournal.includes("هنوز مقاله‌ای منتشر نشده"));
assert(emptyJournal.includes('href="/fa/products"'));
assert(screen(Journal, { posts: [], unavailable: true }).includes(fa.common.somethingWrong));
const archive = { ...live, id: "archive-fixture", slug: "archive-guide", hasCover: false };
const journal = screen(Journal, { posts: [live, archive], unavailable: false });
assert(journal.includes("تازه‌ترین مقاله"));
assert(journal.includes("آرشیو مقاله‌ها"));
assert(journal.indexOf("/fa/blog/public-guide") < journal.indexOf("/fa/blog/archive-guide"));
assert(journal.includes("/blog-cover/public-fixture"));
assert(!journal.includes("/blog-cover/archive-fixture"));
const article = screen(JournalArticle, { post: live, back: fa.blog.back });
assert(article.includes("حدود ۱ دقیقه مطالعه"));
assert(article.includes(`<time dateTime="${live.publishedAt}"`));
assert(article.includes("راهنمای آزمایشی"));
// The page title is the only h1; a post's "##" sections are h2 (not h4), so the
// outline is h1 > h2 > h3 for readers and search engines.
assert.match(article, /<h2[^>]*>شروع<\/h2>/);
// The cover carries the editor's alt text; a post without one stays decorative.
assert.match(article, /<img[^>]+alt="کوله‌پشتی با ابزارهای برنامه‌نویسی"[^>]*class="articleCover"/);
assert.match(
  screen(JournalArticle, { post: { ...live, coverAlt: null }, back: fa.blog.back }),
  /<img[^>]+alt=""[^>]*class="articleCover"/,
);
assert(!/<h[456][^>]*>شروع</.test(article));
// A Persian title that starts with a Latin product name must stay RTL;
// dir="auto" would pick LTR from the first letter and scramble the line.
const latinFirst = { ...live, title: "ChatGPT، Claude یا Gemini؟", excerpt: "Claude و Gemini" };
assert.match(screen(JournalArticle, { post: latinFirst, back: fa.blog.back }), /<h1 dir="rtl">/);
assert.match(screen(JournalArticle, { post: latinFirst, back: fa.blog.back }), /<p dir="rtl">Claude/);
assert.match(screen(Journal, { posts: [latinFirst], unavailable: false }), /<h3 dir="rtl">ChatGPT/);
assert.match(
  screen(JournalArticle, { post: { ...live, title: "Plain English title", excerpt: null }, back: fa.blog.back }),
  /<h1 dir="auto">Plain English title/,
);
assert(article.includes('href="/fa/blog"'));
async function checkPublication() {
  const params = Promise.resolve({ locale: "fa", slug: live.slug });
  const publicPosts = async () => React.Children.toArray((await BlogPage({ params })).props.children)
    .find((child) => child.type === Journal).props.posts;
  assert.equal((await publicPosts()).length, 1);
  await BlogPostPage({ params });
  isPublished = false;
  assert.equal((await publicPosts()).length, 0);
  await assert.rejects(BlogPostPage({ params }), /Page not found/);
  console.log("PASS: admin articles, isolated Markdown preview, public journal and current publication state");
}

checkPublication().catch(error => { console.error(error); process.exitCode = 1; });
