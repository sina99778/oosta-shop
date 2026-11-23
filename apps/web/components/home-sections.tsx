import Link from "next/link";
import { assetUrl } from "@/lib/api";
import { fetchJson } from "@/lib/seo";
import { HomeCatalog } from "./home-catalog";
import { HomeCompare, type CompareProduct } from "./home-compare";
import { PromptLab } from "./prompt-lab";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import type {
  BlogPostSummary,
  Category,
  Paginated,
  ProductDetail,
  ProductSummary,
} from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./home.module.css";

// Products offered side by side in the plan comparison, in tab order.
const COMPARE_SLUGS = ["chatgpt", "gemini", "claude"];

function toPersianDigits(value: number, fa: boolean): string {
  return value.toLocaleString(fa ? "fa-IR" : "en-US");
}

export async function HomeSections({
  locale,
  heroTitle,
  heroSubtitle,
  supportHref,
}: {
  locale: Locale;
  dict: Dictionary;
  heroTitle: string;
  heroSubtitle: string;
  supportHref: string;
}) {
  const [categoryData, productData, blogData, ...compared] = await Promise.all([
    fetchJson<{ categories: Category[] }>("/categories"),
    fetchJson<Paginated<ProductSummary>>("/products?pageSize=8&sort=recommended", 15),
    fetchJson<{ posts: BlogPostSummary[] }>("/blog"),
    ...COMPARE_SLUGS.map((slug) =>
      fetchJson<{ product: ProductDetail }>(`/products/${encodeURIComponent(slug)}`, 60),
    ),
  ]);
  // eslint-disable-next-line react-hooks/purity -- This server component validates cached prices at request time.
  const now = Date.now();
  const selections = (productData?.items ?? []).map((product) =>
    product.indicativePriceFrom && Date.parse(product.indicativePriceFrom.expiresAt) <= now
      ? { ...product, indicativePriceFrom: null }
      : product,
  );
  const fa = locale === "fa";
  const base = `/${locale}`;
  const articles = blogData?.posts.slice(0, 3) ?? [];
  const learningHref = articles.length ? "#learning" : "#prompt-lab";
  const categories = categoryData?.categories ?? [];
  const comparison: CompareProduct[] = compared.flatMap((entry) => {
    const product = entry?.product;
    const plans = product?.plans.filter((plan) => plan.availability !== "OUT_OF_STOCK") ?? [];
    return product && plans.length
      ? [{ name: product.name, slug: product.slug, plans: plans.slice(0, 4) }]
      : [];
  });
  const shortcuts = ["chatgpt", "gemini", "cursor", "canva", "capcut"].flatMap((slug) =>
    selections.filter((product) => product.slug === slug),
  );
  const heroLines = heroTitle.split("\n");
  const journey = fa
    ? [
        {
          title: "یاد بگیر",
          body: "مقاله‌ها و آموزش‌های کوتاه دربارهٔ اینکه هر ابزار واقعاً به چه کاری می‌آید.",
          link: "مجلهٔ اوستا",
          href: articles.length ? "#learning" : `${base}/blog`,
        },
        {
          title: "تمرین کن",
          body: "در آزمایشگاه پرامپت، پرامپت خودت را بنویس و نسخهٔ بهترش را ببین.",
          link: "آزمایشگاه پرامپت",
          href: "#prompt-lab",
        },
        {
          title: "ابزار مناسب را بگیر",
          body: "پلن‌ها را مقایسه کن؛ اطلاعات خرید خودکار در حسابت تحویل می‌شود.",
          link: "فروشگاه",
          href: `${base}/products`,
        },
      ]
    : [
        {
          title: "Learn",
          body: "Short guides on what each AI tool is actually good for.",
          link: "Oosta journal",
          href: articles.length ? "#learning" : `${base}/blog`,
        },
        {
          title: "Practise",
          body: "Write your own prompt in the prompt lab and see a sharper version.",
          link: "Prompt lab",
          href: "#prompt-lab",
        },
        {
          title: "Get the right tool",
          body: "Compare plans; purchase details are delivered to your account automatically.",
          link: "Store",
          href: `${base}/products`,
        },
      ];
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
          "کاربرد موردنظرت را برای پشتیبانی تلگرام اوستا بنویس. پیش از خرید، نوع دسترسی و شرایط پلن را بررسی کن.",
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
          "Describe your needs to Oosta’s Telegram support. Review access type and plan terms before buying.",
        ],
      ];

  return (
    <div className={styles.home}>
      <section className={styles.stage} aria-labelledby="home-title">
        <div className={styles.wrap}>
          <div className={styles.hero}>
            <figure className={styles.mascot}>
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
                sizes="(max-width: 700px) 220px, 360px"
              />
            </figure>
            <h1 id="home-title">
              {heroLines.map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </h1>
            <p>{heroSubtitle}</p>
            <form
              role="search"
              action={`${base}/products`}
              method="get"
              className={styles.search}
              aria-label={fa ? "جست‌وجوی محصولات اوستا" : "Search Oosta products"}
            >
              <svg
                className={styles.searchIcon}
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <label className="sr-only" htmlFor="home-product-search">
                {fa ? "نام محصول" : "Product name"}
              </label>
              <input
                id="home-product-search"
                name="q"
                type="search"
                dir="auto"
                maxLength={100}
                placeholder={
                  fa ? "مثلاً «ویرایش ویدیو» یا ChatGPT" : "e.g. “video editing” or ChatGPT"
                }
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
                <span>{fa ? "پرجست‌وجوها:" : "Popular:"}</span>
                {shortcuts.map((product) => (
                  <Link prefetch={false} key={product.id} href={`${base}/products/${product.slug}`}>
                    <bdi>{product.name}</bdi>
                  </Link>
                ))}
              </nav>
            )}
            <div className={styles.heroLinks}>
              <a href={learningHref}>
                {articles.length
                  ? fa
                    ? "شروع یادگیری رایگان"
                    : "Start learning for free"
                  : fa
                    ? "تمرین پرامپت‌نویسی"
                    : "Try a prompt"}
              </a>
              <Link prefetch={false} href={`${base}/products`}>
                {fa ? "همهٔ محصولات" : "Browse all products"}
                <span aria-hidden="true">{fa ? "←" : "→"}</span>
              </Link>
            </div>
          </div>
          <ol className={styles.journey} aria-label={fa ? "مسیر اوستا" : "How Oosta works"}>
            {journey.map((step, index) => (
              <li key={step.title}>
                <a href={step.href}>
                  <span className={styles.journeyNumber} aria-hidden="true">
                    {toPersianDigits(index + 1, fa)}
                  </span>
                  <h2>{step.title}</h2>
                  <p>{step.body}</p>
                  <small>
                    {step.link} <span aria-hidden="true">{fa ? "←" : "→"}</span>
                  </small>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <HomeCatalog
        locale={locale}
        products={selections}
        categories={categories}
        unavailable={productData === null}
      />
      {comparison.length > 0 && <HomeCompare locale={locale} products={comparison} />}
      <PromptLab key={locale} locale={locale} />
      {articles.length > 0 && (
        <section className={styles.journal} id="learning" aria-labelledby="learning-title">
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <h2 id="learning-title">{fa ? "مجلهٔ اوستا" : "Oosta journal"}</h2>
              <Link prefetch={false} href={`${base}/blog`} className={styles.textLink}>
                {fa ? "همهٔ مقاله‌ها" : "All articles"}
                <span aria-hidden="true">{fa ? "←" : "→"}</span>
              </Link>
            </div>
            <ul className={styles.articles}>
              {articles.map((item) => (
                <li key={item.id}>
                  <Link
                    prefetch={false}
                    href={`${base}/blog/${item.slug}`}
                    className={styles.article}
                  >
                    <div className={styles.cover}>
                      {item.hasCover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetUrl(`/blog-cover/${item.id}`)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      {item.tag && <span className={styles.tag}>{item.tag}</span>}
                    </div>
                    <div className={styles.articleBody}>
                      <h3>{item.title}</h3>
                      {item.excerpt && <p>{item.excerpt}</p>}
                      {item.readingMinutes ? (
                        <small>
                          {fa
                            ? `${toPersianDigits(item.readingMinutes, true)} دقیقه مطالعه`
                            : `${item.readingMinutes} min read`}
                        </small>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <section className={`${styles.wrap} ${styles.guide}`} aria-labelledby="guide-title">
        <div className={styles.guideIntro}>
          <h2 id="guide-title">{fa ? "راهنمای انتخاب و خرید" : "Help choosing and buying"}</h2>
          <p>
            {fa
              ? "سؤالی داری که اینجا نیست؟ پیش از خرید در تلگرام بپرس یا سفارشت را با تیکت پیگیری کن."
              : "Have a question that isn’t answered here? Ask on Telegram before buying, or track an order with a ticket."}
          </p>
          <div className={styles.guideActions}>
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="oosta-button inline-flex h-11 items-center px-5 text-sm"
            >
              {fa ? "مشاوره در تلگرام" : "Ask on Telegram"} <span aria-hidden="true">↗</span>
            </a>
            <Link
              prefetch={false}
              href={`${base}/support`}
              className="oosta-button inline-flex h-11 items-center px-5 text-sm"
              data-button-variant="outline"
            >
              {fa ? "پیگیری سفارش با تیکت" : "Track an order with a ticket"}
            </Link>
          </div>
        </div>
        <div className={styles.questions}>
          {faqs.map(([q, a], index) => (
            <details key={q} open={index === 0}>
              <summary>
                {q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className={`${styles.wrap} ${styles.band}`} aria-labelledby="telegram-title">
        <div className={styles.bandInner}>
          <div>
            <h2 id="telegram-title">
              {fa ? "مشاوره پیش از خرید در تلگرام" : "Pre-purchase advice on Telegram"}
            </h2>
            <p>
              {fa
                ? "کاربردت را بنویس؛ کمکت می‌کنیم ابزار و پلن درست را انتخاب کنی. آموزش‌ها و پرامپت‌های تازه هم در کانال اوستاست."
                : "Tell us what you need and we’ll help you pick the right tool and plan. New guides and prompts land on the channel."}
            </p>
          </div>
          <div className={styles.bandActions}>
            <a
              href="https://t.me/oostaAi"
              target="_blank"
              rel="noopener noreferrer"
              className="oosta-button inline-flex items-center gap-2 text-sm"
              data-button-variant="outline"
            >
              <span dir="ltr">@oostaAi</span>
              <span>{fa ? "کانال" : "Channel"}</span>
            </a>
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="oosta-button inline-flex items-center gap-2 text-sm"
            >
              {fa ? "مشاوره پیش از خرید" : "Ask before buying"} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
