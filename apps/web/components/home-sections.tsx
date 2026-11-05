import Image from "next/image";
import Link from "next/link";
import { fetchJson } from "@/lib/seo";
import { HomeCatalog } from "./home-catalog";
import { PromptLab } from "./prompt-lab";
import type { Locale } from "@/lib/i18n";
import type { Category, ProductSummary } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./storefront.module.css";

// Selections from the owner's Telegram export; historical offers are excluded.
const reading = [
  {
    id: 160,
    image: "prompt-guide",
    fa: "از سؤال معمولی تا پرامپت حرفه‌ای",
    en: "From a question to a better prompt",
    tagFa: "پرامپت‌نویسی",
    tagEn: "Prompting",
    descriptionFa: "چطور درخواستت را دقیق‌تر بنویسی و خروجی بهتری بگیری.",
    descriptionEn: "Give your request context, structure and a clear outcome.",
  },
  {
    id: 161,
    image: "student-guide",
    fa: "یک دستیار برای مسیر پژوهش",
    en: "A companion for your research",
    tagFa: "برای دانشجوها",
    tagEn: "For students",
    descriptionFa: "از خواندن مقاله تا نظم دادن به ایده‌های پروژه و پایان‌نامه.",
    descriptionEn: "From reading papers to organizing your next project.",
  },
  {
    id: 155,
    image: "compare-ai",
    fa: "ChatGPT یا Gemini؛ از کجا شروع کنم؟",
    en: "ChatGPT or Gemini: where to start?",
    tagFa: "شناخت ابزارها",
    tagEn: "Tool guides",
    descriptionFa: "پیش از انتخاب اشتراک، با کاربرد و تفاوت ابزارها آشنا شو.",
    descriptionEn: "Get to know the tools before choosing a subscription.",
  },
];

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
  const [categoryData, productData] = await Promise.all([
    fetchJson<{ categories: Category[] }>("/categories"),
    fetchJson<{ products: ProductSummary[] }>("/products/bestselling?limit=8"),
  ]);
  const fa = locale === "fa";
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
  const paths = fa
    ? [
        { title: "یاد بگیر", sub: "آموزش‌های کاربردی، به زبان ساده", href: "#learning" },
        { title: "امتحان کن", sub: "پرامپت‌هایی برای کار واقعی", href: "#prompt-lab" },
        { title: "ابزارت را پیدا کن", sub: "اشتراک و دسترسی مناسب تو", href: "#home-catalog" },
      ]
    : [
        { title: "Learn", sub: "Practical guides, in plain language", href: "#learning" },
        { title: "Try", sub: "Prompts for real work", href: "#prompt-lab" },
        { title: "Find your tool", sub: "Access that fits your needs", href: "#home-catalog" },
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
        <div className={styles.heroMeta}>
          <span>
            {fa ? "آموزش، تجربه و ابزارهای هوش مصنوعی" : "AI learning, practice and tools"}
          </span>
          <span dir="ltr">A NEW WAY TO THINK / OOSTA AI</span>
        </div>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span className={styles.smallRule} />
              {fa ? "هوش مصنوعی، به زبان خودمان" : "AI, in a language that makes sense"}
            </span>
            <h1 id="home-title">
              {heroTitle.split("\n").map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </h1>
            <p>{heroSubtitle}</p>
            <div className={styles.heroActions}>
              <a href="#learning" className={styles.primaryLink}>
                {fa ? "از یادگیری شروع کن" : "Start with learning"}
                <span aria-hidden="true">↙</span>
              </a>
              <a href="#home-catalog" className={styles.textLink}>
                {fa ? "دیدن ابزارها و اشتراک‌ها" : "Tools & subscriptions"}
                <span aria-hidden="true">←</span>
              </a>
            </div>
            <div className={styles.heroTopics}>
              <span>{fa ? "پژوهش" : "Research"}</span>
              <i />
              <span>{fa ? "تولید محتوا" : "Content"}</span>
              <i />
              <span>{fa ? "پرامپت‌نویسی" : "Prompting"}</span>
            </div>
          </div>
          <figure className={styles.brandPanel}>
            <div className={styles.artMeta}>
              <span dir="ltr">PERSIAN ROOTS. DIGITAL MIND.</span>
              <span>01 / ∞</span>
            </div>
            <div className={styles.brandStage}>
              <Image
                src="/brand/oosta-ai.png"
                width={640}
                height={640}
                alt={
                  fa
                    ? "نشان اوستا ای‌آی؛ استاد ایرانی با مغز دیجیتال و مدارهای فیروزه‌ای"
                    : "Oosta AI: a Persian master with a digital brain and turquoise circuits"
                }
                preload
                className={styles.brandImage}
                sizes="(max-width: 700px) 140vw, 650px"
              />
            </div>
            <figcaption className={styles.brandCaption}>
              <span>
                {fa
                  ? "دانش دیروز. امکان‌های فردا."
                  : "Yesterday's wisdom. Tomorrow's possibilities."}
              </span>
              <span dir="ltr">oostaAI</span>
            </figcaption>
          </figure>
        </div>
        <nav className={styles.heroCategories} aria-label={fa ? "مسیرهای شروع" : "Start here"}>
          {paths.map((path, i) => (
            <a key={path.href} href={path.href}>
              <span className={styles.index}>
                {new Intl.NumberFormat(fa ? "fa" : "en", { minimumIntegerDigits: 2 }).format(i + 1)}
              </span>
              <span>
                <strong>{path.title}</strong>
                <small>{path.sub}</small>
              </span>
              <span className={styles.categoryArrow} aria-hidden="true">
                ↖
              </span>
            </a>
          ))}
        </nav>
      </section>
      <section className={styles.learning} id="learning" aria-labelledby="learning-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>
              {fa ? "از تجربه‌های اوستا" : "From the Oosta notebook"}
            </span>
            <h2 id="learning-title">{fa ? "از دانستن، به ساختن." : "From knowing to making."}</h2>
          </div>
          <Link href={`/${locale}/blog`} className={styles.textLink}>
            {fa ? "مجلهٔ اوستا" : "Oosta journal"}
            <span aria-hidden="true">←</span>
          </Link>
        </div>
        <div className={styles.readingGrid}>
          {reading.map((item) => (
            <a
              key={item.id}
              href={`https://t.me/oostaAi/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.readingCard}
            >
              <div className={styles.readingImage}>
                <Image
                  src={`/editorial/${item.image}.jpg`}
                  alt=""
                  width={900}
                  height={506}
                  sizes="(max-width: 700px) 90vw, 33vw"
                />
              </div>
              <div className={styles.readingMeta}>
                <span>{fa ? item.tagFa : item.tagEn}</span>
                <span>{fa ? "از آرشیو کانال ↗" : "Channel archive ↗"}</span>
              </div>
              <h3>{fa ? item.fa : item.en}</h3>
              <p>{fa ? item.descriptionFa : item.descriptionEn}</p>
            </a>
          ))}
        </div>
      </section>
      <PromptLab key={locale} locale={locale} />
      <HomeCatalog
        locale={locale}
        products={productData?.products ?? []}
        categories={categories}
        categoryLabels={categoryLabels}
        unavailable={productData === null}
      />
      <section className={styles.community} aria-labelledby="community-title">
        <div>
          <span className={styles.eyebrow}>
            {fa ? "گفت‌وگو این‌جا ادامه دارد" : "Keep the conversation going"}
          </span>
          <h2 id="community-title">
            {fa ? "یادگیری این‌جا تمام نمی‌شود." : "Learning goes beyond this page."}
          </h2>
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
          <span className={styles.eyebrow}>{fa ? "قبل از قدم بعدی" : "Before your next step"}</span>
          <h2 id="guide-title">{fa ? "سؤال خوب، شروع خوب." : "A good question. A good start."}</h2>
          <a
            href="https://t.me/oostaAiSupport"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.textLink}
          >
            {fa ? "گفت‌وگو با پشتیبانی تلگرام" : "Talk to Telegram support"}
            <span aria-hidden="true">↗</span>
          </a>
          <Link href={`/${locale}/support`} className={styles.supportLink}>
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
