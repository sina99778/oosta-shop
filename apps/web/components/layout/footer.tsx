import Link from "next/link";
import { Container } from "@/components/ui/container";
import { assetUrl } from "@/lib/api";
import { localizedSetting, telegramSupportHref, type SiteConfig } from "@/lib/settings";
import { sitePolicies } from "@/lib/site-policies";
import type { Locale } from "@/lib/i18n";
import { Wordmark } from "@/components/wordmark";
import styles from "./site-chrome.module.css";

type FooterDict = {
  rights: string;
  aboutDefault: string;
  shopTitle: string;
  supportTitle: string;
  contactTitle: string;
  trustTitle: string;
};

type NavDict = { home: string; products: string; blog: string; support: string; dashboard: string };

function socialHref(value: string, base: string) {
  return /^https?:\/\//i.test(value) ? value : `${base}/${value.replace(/^@/, "")}`;
}

export function Footer({
  locale,
  dict,
  nav,
  config,
}: {
  locale: Locale;
  dict: FooterDict;
  nav: NavDict;
  config: SiteConfig;
}) {
  const fa = locale === "fa";
  const base = `/${locale}`;
  const { settings, enamadBadge } = config;
  const about = localizedSetting(settings, "footerAbout", locale) ?? dict.aboutDefault;
  const telegramHref = telegramSupportHref(settings);
  const contact = [
    ...(settings.contactEmail
      ? [{ label: settings.contactEmail, href: `mailto:${settings.contactEmail}` }]
      : []),
    ...(settings.contactPhone
      ? [{ label: settings.contactPhone, href: `tel:${settings.contactPhone}` }]
      : []),
    ...(settings.contactInstagram
      ? [
          {
            label: "Instagram",
            href: socialHref(settings.contactInstagram, "https://instagram.com"),
          },
        ]
      : []),
  ];
  const badge = enamadBadge ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl("/site-assets/enamad")}
      alt={fa ? "نماد اعتماد الکترونیکی" : "Electronic trust mark"}
      className={styles.trustMark}
      width={76}
      height={76}
      loading="lazy"
    />
  ) : null;

  return (
    <footer className={`oosta-footer ${styles.footer}`}>
      <Container className={styles.footerGrid}>
        <div className={styles.footerBrand}>
          <Link prefetch={false} href={base} aria-label={fa ? "اوستا، صفحهٔ اصلی" : "Oosta home"}>
            <Wordmark />
          </Link>
          <p>{about}</p>
        </div>
        <nav className={styles.footerColumn} aria-label={dict.shopTitle}>
          <h2>{dict.shopTitle}</h2>
          <Link prefetch={false} href={`${base}/products`}>
            {nav.products}
          </Link>
          <Link prefetch={false} href={`${base}/blog`}>
            {nav.blog}
          </Link>
          <a href="https://t.me/oostaAi" target="_blank" rel="noopener noreferrer">
            {fa ? "کانال اوستا" : "Oosta Telegram channel"}
          </a>
        </nav>
        <section className={styles.footerColumn} aria-labelledby="footer-support">
          <h2 id="footer-support">{dict.supportTitle}</h2>
          <Link prefetch={false} href={`${base}/dashboard`}>
            {fa ? "پیگیری سفارش‌ها" : "Track orders"}
          </Link>
          <Link prefetch={false} href={`${base}/support`}>
            {fa ? "ثبت و پیگیری تیکت" : "Open or track a ticket"}
          </Link>
          {sitePolicies.map(({ slug, ...translations }) => (
            <Link prefetch={false} href={`${base}/p/${slug}`} key={slug}>
              {translations[locale].title}
            </Link>
          ))}
        </section>
        <section className={styles.footerColumn} aria-labelledby="footer-contact">
          <h2 id="footer-contact">{dict.contactTitle}</h2>
          <a
            href={telegramHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`oosta-button ${styles.contactAction}`}
            data-button-variant="outline"
          >
            {fa ? "پشتیبانی تلگرام" : "Telegram support"}
            <span aria-hidden="true">↗</span>
          </a>
          {contact.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              dir="ltr"
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {label}
            </a>
          ))}
          {badge && (
            <div className={styles.badge}>
              <span>{dict.trustTitle}</span>
              {settings.enamadLink && /^https?:\/\//i.test(settings.enamadLink) ? (
                <a href={settings.enamadLink} target="_blank" rel="noopener noreferrer">
                  {badge}
                </a>
              ) : (
                badge
              )}
            </div>
          )}
        </section>
      </Container>
      <div className={styles.footerBase}>
        <Container className={styles.footerBaseRow}>
          <p>
            <bdi>© {new Date().getFullYear()} oostaAI</bdi>{" "}
            <span className={styles.rights}>{dict.rights}</span>
          </p>
          <a href="#oosta-page-top" className={styles.backToTop}>
            {fa ? "بازگشت به بالا" : "Back to top"} <span aria-hidden="true">↑</span>
          </a>
        </Container>
      </div>
    </footer>
  );
}
