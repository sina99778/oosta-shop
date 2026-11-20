import Link from "next/link";
import Image from "next/image";
import { Markdown } from "@/components/markdown";
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
    dateStyle: "long", timeZone: "Asia/Tehran",
  }).format(new Date(iso));
  return <time dateTime={iso}>{date}</time>;
}

function Story({ post, locale, readMore, featured = false }: { post: BlogPostSummary; locale: Locale; readMore: string; featured?: boolean }) {
  return (
    <article className={featured ? styles.featured : styles.story} data-cover={post.hasCover}>
      <Link href={`/${locale}/blog/${post.slug}`} className={styles.storyLink}>
        {post.hasCover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(`/blog-cover/${post.id}`)} loading={featured ? "eager" : "lazy"} decoding="async" alt="" className={styles.storyCover} />
        )}
        <div className={styles.storyCopy}>
          {post.publishedAt && <div className={styles.date}><JournalDate iso={post.publishedAt} locale={locale} /></div>}
          <h3 dir={textDir(post.title)}>{post.title}</h3>
          {post.excerpt && <p dir={textDir(post.excerpt)}>{post.excerpt}</p>}
          <span className={styles.read}>{readMore} <span aria-hidden="true" dir="ltr">↗</span></span>
        </div>
      </Link>
    </article>
  );
}

export function Journal({ locale, dict, posts, unavailable }: { locale: Locale; dict: Dictionary; posts: BlogPostSummary[]; unavailable: boolean }) {
  const fa = locale === "fa";
  const [featured, ...archive] = posts;
  return (
    <div className={styles.journal}>
      <header className={styles.masthead}>
        <div>
          <h1>{fa ? "مجلهٔ اوستا" : "Oosta Journal"}</h1>
          <p>{fa ? "آموزش پرامپت‌نویسی، راهنمای ابزارها و کاربردهای هوش مصنوعی." : "Prompt writing, tool guides and practical uses for AI."}</p>
        </div>
        <div className={styles.brandArt} aria-hidden="true">
          <Image src="/brand/oosta-hero-v2-320.webp" alt="" width={250} height={250} preload />
        </div>
      </header>
      {featured ? (
        <>
          <section aria-labelledby="latest-story" className={styles.section}>
            <h2 id="latest-story">{fa ? "تازه‌ترین مقاله" : "Latest article"}</h2>
            <Story post={featured} locale={locale} readMore={dict.blog.readMore} featured />
          </section>
          {archive.length > 0 && <section aria-labelledby="story-archive" className={styles.section}>
            <h2 id="story-archive">{fa ? "آرشیو مقاله‌ها" : "Article archive"}</h2>
            <div className={styles.storyGrid}>{archive.map(post => <Story key={post.id} post={post} locale={locale} readMore={dict.blog.readMore} />)}</div>
          </section>}
        </>
      ) : (
        <section className={styles.empty}>
          <h2>{unavailable ? dict.common.somethingWrong : (fa ? "هنوز مقاله‌ای منتشر نشده" : "No articles published yet")}</h2>
          <Link href={`/${locale}/products`} className={styles.read}>{fa ? "دیدن ابزارهای فروشگاه" : "Browse the store"} <span aria-hidden="true">↗</span></Link>
        </section>
      )}
    </div>
  );
}

export function JournalArticle({ post, locale, back }: { post: BlogPostDetail; locale: Locale; back: string }) {
  const fa = locale === "fa";
  const minutes = Math.max(1, Math.ceil(post.content.trim().split(/\s+/u).length / 200));
  const time = new Intl.NumberFormat(locale).format(minutes);
  return (
    <article className={styles.articlePage}>
      <header className={styles.articleHeader}>
        <Link href={`/${locale}/blog`} className={styles.read}>{back}</Link>
        <h1 dir={textDir(post.title)}>{post.title}</h1>
        {post.excerpt && <p dir={textDir(post.excerpt)}>{post.excerpt}</p>}
        <div className={styles.articleMeta}>
          {post.publishedAt && <JournalDate iso={post.publishedAt} locale={locale} />}
          <span>{fa ? `حدود ${time} دقیقه مطالعه` : `About ${time} min read`}</span>
        </div>
      </header>
      {post.hasCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(`/blog-cover/${post.id}`)} alt={post.coverAlt ?? ""} className={styles.articleCover} decoding="async" />
      )}
      {/* The title is the page h1, so "##" in the article is h2 (matches .prose h2/h3). */}
      <Markdown text={post.content} className={styles.prose} headingOffset={0} />
      <footer className={styles.articleFooter}><Link href={`/${locale}/blog`} className={styles.read}>{back}</Link></footer>
    </article>
  );
}
