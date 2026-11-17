import Link from "next/link";
import { assetUrl } from "@/lib/api";
import { fetchJson } from "@/lib/seo";
import { HomeCatalog } from "./home-catalog";
import { PromptLab } from "./prompt-lab";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import type { BlogPostSummary, Category, Paginated, ProductSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./storefront.module.css";

export async function HomeSections({
  locale,
  heroTitle,
  heroSubtitle,
}: {
  locale: Locale;
  dict: Dictionary;
  heroTitle: string;
  heroSubtitle: string;
}) {
  const [categoryData, productData, blogData] = await Promise.all([
    fetchJson<{ categories: Category[] }>("/categories"),
    fetchJson<Paginated<ProductSummary>>("/products?pageSize=8&sort=recommended"),
    fetchJson<{ posts: BlogPostSummary[] }>("/blog"),
  ]);
  const selections = productData?.items ?? [];
  const fa = locale === "fa";
  const articles = blogData?.posts.slice(0, 3) ?? [];
  const learningHref = articles.length ? "#learning" : "#prompt-lab";
  const categories = categoryData?.categories ?? [];
  const categoryLabels: Record<string, string> = fa
    ? {
        "ai-accounts": "هوش مصنوعی",
        "software-licenses": "نرم‌افزار و لایسنس",
        "gift-cards": "گیفت‌کارت",
      }
    : {
        "ai-accounts": "AI tools",
        "software-licenses": "Software & licenses",
        "gift-cards": "Gift cards",
      };
  const shortcuts = ["chatgpt", "gemini", "canva", "capcut"].flatMap((slug) =>
    selections.filter((product) => product.slug === slug),
  );
  const faqs = fa
    ? [
        [
          "برای شروع باید اشتراک بخرم؟",
          "نه؛ می‌توانی از آموزش‌ها و پرامپت‌ها شروع کنی و بعد، بر اساس کاربردت، دربارهٔ نیاز به اشتراک تصمیم بگیری.",
        ],
        [
          "اطلاعات خرید را کجا دریافت می‌کنم؟",
          "پس از تأیید پرداخت، وضعیت سفارش و اطلاعات دسترسی در حساب کاربری نمایش داده می‌شود. رسید کارت‌به‌کارت ابتدا بررسی می‌شود.",
        ],
        [
          "برای انتخاب ابزار چطور کمک بگیرم؟",
          "کاربرد موردنظرت را در بخش پشتیبانی یا برای ادمین تلگرام اوستا بنویس. پیش از خرید، نوع دسترسی و شرایط پلن را بررسی کن.",
        ],
      ]
    : [
        [
          "Do I need a subscription to get started?",
          "No. Start with guides and prompts, then decide whether a subscription fits your needs.",
        ],
        [
          "Where will I receive my purchase?",
          "Order status and access details appear in your account after payment confirmation. Bank transfer receipts require review.",
        ],
        [
          "How can I get help choosing?",
          "Describe your needs through support or Oosta's Telegram support. Review access type and plan terms before buying.",
        ],
      ];
  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 id="home-title">
              {heroTitle.split("\n").map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </h1>
            <p>{heroSubtitle}</p>
            <form
              role="search"
              action={`/${locale}/products`}
              method="get"
              className={styles.heroSearch}
              aria-label={fa ? "جست‌وجوی محصولات اوستا" : "Search Oosta products"}
            >
              <label className="sr-only" htmlFor="home-product-search">
                {fa ? "نام محصول" : "Product name"}
              </label>
              <input
                id="home-product-search"
                name="q"
                type="search"
                dir="auto"
                maxLength={100}
                placeholder={fa ? "نام ابزار یا اشتراک" : "Tool or subscription name"}
              />
              <Button type="submit" size="lg">
                {fa ? "جست‌وجو" : "Search"}
              </Button>
            </form>
            {shortcuts.length > 0 && (
              <nav
                className={styles.shortcuts}
                aria-label={fa ? "دسترسی سریع به محصولات" : "Quick product links"}
              >
                {shortcuts.map((product) => (
                  <Link
                    prefetch={false}
                    key={product.id}
                    href={`/${locale}/products/${product.slug}`}
                  >
                    <bdi>{product.name}</bdi>
                  </Link>
                ))}
              </nav>
            )}
            <div className={styles.heroActions}>
              <Link prefetch={false} href={`/${locale}/products`} className={styles.textLink}>
                {fa ? "همهٔ محصولات" : "Browse all products"}
                <span aria-hidden="true">{fa ? "←" : "→"}</span>
              </Link>
              <a href={learningHref} className={styles.textLink}>
                {articles.length
                  ? fa
                    ? "خواندن مقاله‌ها"
                    : "Read articles"
                  : fa
                    ? "تمرین پرامپت‌نویسی"
                    : "Try a prompt"}
              </a>
            </div>
          </div>
          <figure className={styles.brandPanel}>
            <div className={styles.brandStage}>
              {/* The brand image ships in two pre-scaled sizes. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/oosta-hero-v1-640.webp"
                srcSet="/brand/oosta-hero-v2-320.webp 320w, /brand/oosta-hero-v1-640.webp 640w"
                width={640}
                height={640}
                alt={
                  fa
                    ? "نشان اوستا ای‌آی؛ استاد ایرانی با مغز دیجیتال و مدارهای فیروزه‌ای"
                    : "Oosta AI: a Persian master with a digital brain and turquoise circuits"
                }
                fetchPriority="high"
                className={styles.brandImage}
                sizes="(max-width: 700px) 160px, (max-width: 900px) 260px, (max-width: 1250px) 320px, 400px"
              />
            </div>
          </figure>
        </div>
      </section>
      <HomeCatalog
        locale={locale}
        products={selections}
        categories={categories}
        categoryLabels={categoryLabels}
        unavailable={productData === null}
      />
      {articles.length > 0 && (
        <section className={styles.learning} id="learning" aria-labelledby="learning-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="learning-title">{fa ? "مجلهٔ اوستا" : "Oosta journal"}</h2>
            </div>
            <Link prefetch={false} href={`/${locale}/blog`} className={styles.textLink}>
              {fa ? "همهٔ مقاله‌ها" : "All articles"}
              <span aria-hidden="true">←</span>
            </Link>
          </div>
          <div className={styles.readingGrid}>
            {articles.map((item) => (
              <Link
                prefetch={false}
                key={item.id}
                href={`/${locale}/blog/${item.slug}`}
                className={styles.readingCard}
              >
                {item.hasCover && (
                  <div className={styles.readingImage}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetUrl(`/blog-cover/${item.id}`)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                )}
                <h3>{item.title}</h3>
                {item.excerpt && <p>{item.excerpt}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
      <PromptLab key={locale} locale={locale} />
      <section className={styles.community} aria-labelledby="community-title">
        <div>
          <h2 id="community-title">{fa ? "کانال تلگرام اوستا" : "Oosta on Telegram"}</h2>
          <p>
            {fa
              ? "آموزش‌ها، پرامپت‌ها و تجربه‌های تازهٔ اوستا را در کانال تلگرام دنبال کن."
              : "Follow Oosta's Telegram channel for tutorials, prompts and new ideas."}
          </p>
        </div>
        <a
          href="https://t.me/oostaAi"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.communityLink}
        >
          <span dir="ltr">@oostaAi</span>
          <span>{fa ? "رفتن به کانال" : "Visit the channel"} ↗</span>
        </a>
      </section>
      <section className={styles.guide} aria-labelledby="guide-title">
        <div>
          <h2 id="guide-title">{fa ? "راهنمای انتخاب و خرید" : "Help choosing and buying"}</h2>
          <a
            href="https://t.me/oostaAiSupport"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.textLink}
          >
            {fa ? "گفت‌وگو با پشتیبانی تلگرام" : "Talk to Telegram support"}
            <span aria-hidden="true">↗</span>
          </a>
          <Link prefetch={false} href={`/${locale}/support`} className={styles.supportLink}>
            {fa ? "یا ثبت تیکت در حساب کاربری" : "Or open a support ticket"}
          </Link>
        </div>
        <div className={styles.questions}>
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
