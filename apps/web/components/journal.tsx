import Link from "next/link";
import { Markdown, markdownOutline } from "@/components/markdown";
import { monogram } from "@/components/product-card";
import { formatPrice } from "@/lib/format";
import { JournalShare } from "./journal-share";
import { assetUrl } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import type { BlogPostDetail, BlogPostSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./journal.module.css";

// Any Persian/Arabic letter makes the text RTL. dir="auto" alone takes the
// direction from the first strong letter, so "ChatGPT، Claude یا Gemini؟"
// would render LTR and scramble the punctuation.
function textDir(text: string): "rtl" | "auto" {
  return /[\u0600-\u06FF]/.test(text) ? "rtl" : "auto";
}

export function JournalDate({ iso, locale }: { iso: string; locale: Locale }) {
  const date = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    dateStyle: "long",
    timeZone: "Asia/Tehran",
  }).format(new Date(iso));
  return <time dateTime={iso}>{date}</time>;
}

function minutesLabel(minutes: number | undefined, locale: Locale): string | null {
  if (!minutes) return null;
  const time = new Intl.NumberFormat(locale).format(minutes);
  return locale === "fa" ? `${time} دقیقه مطالعه` : `${time} min read`;
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// Covers without an image get one of three brand tints, stable per post.
function coverTone(id: string): "navy" | "teal" | "deep" {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return (["navy", "teal", "deep"] as const)[sum % 3];
}

function Story({
  post,
  locale,
  readMore,
  featured = false,
}: {
  post: BlogPostSummary;
  locale: Locale;
  readMore: string;
  featured?: boolean;
}) {
  const fa = locale === "fa";
  const minutes = minutesLabel(post.readingMinutes, locale);
  return (
    <article className={featured ? styles.featured : styles.story} data-cover={post.hasCover}>
      <Link href={`/${locale}/blog/${post.slug}`} className={styles.storyLink}>
        <div className={styles.coverBox} data-tone={coverTone(post.id)}>
          {post.hasCover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(`/blog-cover/${post.id}`)}
              loading={featured ? "eager" : "lazy"}
              decoding="async"
              alt=""
              className={styles.storyCover}
            />
          )}
          {(featured || post.tag) && (
            <span className={styles.coverBadge}>
              {featured ? (fa ? "برگزیده" : "Featured") : post.tag}
            </span>
          )}
        </div>
        <div className={styles.storyCopy}>
          {featured && post.tag && <span className={styles.tag}>{post.tag}</span>}
          <h3 dir={textDir(post.title)}>{post.title}</h3>
          {post.excerpt && <p dir={textDir(post.excerpt)}>{post.excerpt}</p>}
          <div className={styles.date}>
            <ClockIcon />
            {post.publishedAt && <JournalDate iso={post.publishedAt} locale={locale} />}
            {post.publishedAt && minutes && <span aria-hidden="true">·</span>}
            {minutes && <span>{minutes}</span>}
          </div>
          {featured && <span className={styles.readButton}>{readMore}</span>}
        </div>
      </Link>
    </article>
  );
}

export type JournalTag = { tag: string; count: number };

export function Journal({
  locale,
  dict,
  posts,
  unavailable,
  tags = [],
  activeTag = "",
}: {
  locale: Locale;
  dict: Dictionary;
  posts: BlogPostSummary[];
  unavailable: boolean;
  tags?: JournalTag[];
  activeTag?: string;
}) {
  const fa = locale === "fa";
  const [featured, ...archive] = posts;
  const tagHref = (tag: string) =>
    `/${locale}/blog${tag ? `?${new URLSearchParams({ tag })}` : ""}`;
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>{fa ? "راهنماها و آموزش‌ها" : "Guides and tutorials"}</p>
          <h1>{fa ? "مجلهٔ اوستا" : "Oosta Journal"}</h1>
          <p className={styles.heroLead}>
            {fa
              ? "مقایسهٔ ابزارهای هوش مصنوعی، راهنمای خرید اشتراک از ایران، آموزش پرامپت‌نویسی و نکته‌های کاربردی."
              : "AI tool comparisons, buying guides, prompt-writing lessons and practical tips."}
          </p>
          {tags.length > 0 && (
            <nav className={styles.tags} aria-label={fa ? "موضوع مقاله‌ها" : "Article topics"}>
              <Link href={tagHref("")} aria-current={!activeTag ? "page" : undefined}>
                {fa ? "همه" : "All"}
              </Link>
              {tags.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={tagHref(tag)}
                  aria-current={activeTag === tag ? "page" : undefined}
                >
                  {tag} <span>{new Intl.NumberFormat(locale).format(count)}</span>
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>
      <div className={styles.journal}>
        {featured ? (
          <>
            <section aria-labelledby="latest-story" className={styles.section}>
              <h2 id="latest-story" className="sr-only">
                {fa ? "تازه‌ترین مقاله" : "Latest article"}
              </h2>
              <Story post={featured} locale={locale} readMore={dict.blog.readMore} featured />
            </section>
            {archive.length > 0 && (
              <section aria-labelledby="story-archive" className={styles.section}>
                <h2 id="story-archive" className="sr-only">
                  {fa ? "آرشیو مقاله‌ها" : "Article archive"}
                </h2>
                <div className={styles.storyGrid}>
                  {archive.map((post) => (
                    <Story
                      key={post.id}
                      post={post}
                      locale={locale}
                      readMore={dict.blog.readMore}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className={styles.empty}>
            <h2>
              {unavailable
                ? dict.common.somethingWrong
                : fa
                  ? "هنوز مقاله‌ای منتشر نشده"
                  : "No articles published yet"}
            </h2>
            <Link href={`/${locale}/products`} className={styles.read}>
              {fa ? "دیدن ابزارهای فروشگاه" : "Browse the store"} <span aria-hidden="true">↗</span>
            </Link>
          </section>
        )}
      </div>
    </>
  );
}

export type ArticleProduct = {
  slug: string;
  name: string;
  fromPrice: number | null;
  currency: string;
};

export function JournalArticle({
  post,
  locale,
  back,
  products = [],
  supportHref = "",
  url = "",
}: {
  post: BlogPostDetail;
  locale: Locale;
  back: string;
  products?: ArticleProduct[];
  supportHref?: string;
  url?: string;
}) {
  const fa = locale === "fa";
  const minutes =
    post.readingMinutes ?? Math.max(1, Math.ceil(post.content.trim().split(/\s+/u).length / 200));
  const time = new Intl.NumberFormat(locale).format(minutes);
  const outline = markdownOutline(post.content);
  const hasAside = outline.length > 1 || products.length > 0 || Boolean(url);
  return (
    <article className={styles.articlePage}>
      <nav aria-label={fa ? "مسیر صفحه" : "Breadcrumb"} className={styles.crumbs}>
        <Link href={`/${locale}`}>{fa ? "خانه" : "Home"}</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/${locale}/blog`}>{fa ? "مجلهٔ اوستا" : "Oosta journal"}</Link>
        {post.tag && (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`/${locale}/blog?${new URLSearchParams({ tag: post.tag })}`}>
              {post.tag}
            </Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page" dir={textDir(post.title)}>
          {post.title}
        </span>
      </nav>
      <header className={styles.articleHeader}>
        {post.tag && (
          <Link
            href={`/${locale}/blog?${new URLSearchParams({ tag: post.tag })}`}
            className={styles.tag}
          >
            {post.tag}
          </Link>
        )}
        <h1 dir={textDir(post.title)}>{post.title}</h1>
        {post.excerpt && <p dir={textDir(post.excerpt)}>{post.excerpt}</p>}
        <div className={styles.articleMeta}>
          <span className={styles.byline}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/oosta-ai.png" alt="" width={32} height={32} />
            <strong>{fa ? "تحریریهٔ اوستا" : "Oosta editors"}</strong>
          </span>
          <span className={styles.metaRule} aria-hidden="true" />
          {post.publishedAt && <JournalDate iso={post.publishedAt} locale={locale} />}
          <span>{fa ? `حدود ${time} دقیقه مطالعه` : `About ${time} min read`}</span>
        </div>
      </header>
      {post.hasCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl(`/blog-cover/${post.id}`)}
          alt={post.coverAlt ?? ""}
          className={styles.articleCover}
          decoding="async"
        />
      )}
      <div className={hasAside ? styles.articleBody : styles.articleBodySingle}>
        {hasAside && (
          <aside
            className={styles.articleAside}
            aria-label={fa ? "راهنمای مقاله" : "Article guide"}
          >
            {outline.length > 1 && (
              <nav className={styles.asideCard} aria-labelledby="article-toc">
                <h2 id="article-toc">{fa ? "در این مقاله" : "In this article"}</h2>
                <ol className={styles.toc}>
                  {outline.map((item) => (
                    <li key={item.id}>
                      <a href={`#${item.id}`} dir={textDir(item.title)}>
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            {products.length > 0 && (
              <section className={styles.asideCard} aria-labelledby="article-products">
                <h2 id="article-products">{fa ? "ابزارهای این مقاله" : "Tools in this article"}</h2>
                <ul className={styles.asideProducts}>
                  {products.map((product) => (
                    <li key={product.slug}>
                      <Link
                        href={`/${locale}/products/${encodeURIComponent(product.slug)}`}
                        prefetch={false}
                      >
                        <span className={styles.asideTile} aria-hidden="true">
                          {monogram(product.name)}
                        </span>
                        <span className={styles.asideProductText}>
                          <bdi>{product.name}</bdi>
                          {product.fromPrice !== null && (
                            <small>
                              {fa ? "از " : "From "}
                              {formatPrice(product.fromPrice, product.currency, locale)}
                            </small>
                          )}
                        </span>
                        <span className={styles.asideArrow} aria-hidden="true">
                          {fa ? "←" : "→"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {url && <JournalShare url={url} title={post.title} locale={locale} />}
          </aside>
        )}
        <div className={styles.articleMain}>
          {/* The title is the page h1, so "##" in the article is h2 (matches .prose h2/h3). */}
          <Markdown text={post.content} className={styles.prose} headingOffset={0} />
          {supportHref && (
            <aside className={styles.consult} aria-labelledby="article-consult">
              <div>
                <h2 id="article-consult">
                  {fa ? "هنوز مطمئن نیستی کدام؟" : "Still not sure which one?"}
                </h2>
                <p>
                  {fa
                    ? "کاربردت را بنویس؛ پیشنهاد دقیق می‌دهیم."
                    : "Tell us what you need and we’ll suggest the right plan."}
                </p>
              </div>
              <a
                href={supportHref}
                target="_blank"
                rel="noopener noreferrer"
                className="oosta-button inline-flex min-h-12 items-center px-5"
              >
                {fa ? "مشاوره در تلگرام" : "Ask on Telegram"}
              </a>
            </aside>
          )}
          <footer className={styles.articleFooter}>
            <Link href={`/${locale}/blog`} className={styles.read}>
              {back}
            </Link>
          </footer>
        </div>
      </div>
      {post.related && post.related.length > 0 && (
        <section aria-labelledby="related-articles" className={styles.section}>
          <h2 id="related-articles">{fa ? "مقاله‌های مرتبط" : "Related articles"}</h2>
          <div className={styles.storyGrid}>
            {post.related.map((item) => (
              <Story
                key={item.id}
                post={item}
                locale={locale}
                readMore={fa ? "ادامه مطلب" : "Read more"}
              />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
