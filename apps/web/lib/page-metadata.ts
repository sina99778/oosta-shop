// Shared page-level metadata for the storefront.
//
// Next merges metadata shallowly: a page that sets `alternates` or `openGraph`
// replaces the layout's whole object. Without these helpers every page that
// doesn't set its own metadata inherits the layout's `canonical: /<locale>`,
// which tells search engines that pages like /fa/products and /fa/blog are
// duplicates of the home page.
import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { siteUrl } from "@/lib/seo";

// Products, blog posts and CMS pages are stored in a single language (Persian).
// The /en/... copies render the same body inside English chrome, so they point
// their canonical at the Persian URL and are not advertised as English hreflang.
export const CONTENT_LOCALE: Locale = "fa";

// Landscape card for Open Graph/Telegram/X previews (a square image renders as
// a small thumbnail). Rendered from the brand mark with Persian text set in Estedad.
export const DEFAULT_SHARE_IMAGE = {
  url: "/brand/oosta-og-1200x630.jpg",
  width: 1200,
  height: 630,
  alt: "اوستا ای‌آی — فروشگاه و مجلهٔ هوش مصنوعی",
};

// Square brand mark for schema.org Organization.logo.
const ORGANIZATION_LOGO = { url: "/brand/oosta-ai.png", width: 640, height: 640 };

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path}`;
}

export function metadataExcerpt(markdown: string, limit = 160): string {
  const plain = markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+>]|\d+\.)\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= limit) return plain;
  const prefix = plain.slice(0, limit - 1);
  const space = plain[limit - 1] === " " ? prefix.length : prefix.lastIndexOf(" ");
  return `${space > 0 ? prefix.slice(0, space).trimEnd() : prefix}…`;
}

export function collectionJsonLd(locale: Locale, path: string, title: string, description: string) {
  const home = absoluteUrl(`/${locale}`);
  const url = `${home}${path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: title,
        description,
        inLanguage: locale === "fa" ? "fa-IR" : "en",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: locale === "fa" ? "خانه" : "Home", item: home },
          { "@type": "ListItem", position: 2, name: title, item: url },
        ],
      },
    ],
  };
}

// A storefront page that exists in both locales with its own translated chrome
// (home, catalog, blog index): self-canonical plus fa/en/x-default hreflang.
export function localizedPageMetadata(
  locale: Locale,
  path: string,
  title: string,
  description: string,
): Metadata {
  const url = absoluteUrl(`/${locale}${path}`);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        fa: absoluteUrl(`/fa${path}`),
        en: absoluteUrl(`/en${path}`),
        "x-default": absoluteUrl(`/fa${path}`),
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "oostaAI",
      locale: locale === "fa" ? "fa_IR" : "en_US",
      type: "website",
      images: [DEFAULT_SHARE_IMAGE],
    },
  };
}

// Single-language content (product, blog post, CMS page): canonical is always
// the Persian URL; hreflang lists only the Persian version.
export function contentAlternates(path: string): NonNullable<Metadata["alternates"]> {
  const canonical = absoluteUrl(`/${CONTENT_LOCALE}${path}`);
  return { canonical, languages: { fa: canonical, "x-default": canonical } };
}

// Sign-in, account, checkout, support and admin pages: never indexed, and no
// canonical inherited from the layout (a noindex page must not claim to be
// a copy of the home page). No Open Graph either: these pages are prerendered,
// and the VPS build (NEXT_PUBLIC_API_URL=/api) has no public origin, so the
// layout's og:url/og:image would point at localhost.
export const PRIVATE_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: false },
  alternates: null,
  openGraph: null,
};

// Sign-in and sign-up are public but have no search value; their links may
// still be followed.
export const AUTH_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: true },
  alternates: null,
  openGraph: null,
};

// The store as a schema.org Organization; other entities reference it by @id.
export function organizationJsonLd() {
  const site = siteUrl();
  return {
    "@type": "Organization",
    "@id": `${site}/#organization`,
    name: "oostaAI",
    alternateName: "اوستا ای‌آی",
    url: `${site}/${CONTENT_LOCALE}`,
    logo: {
      "@type": "ImageObject",
      url: `${site}${ORGANIZATION_LOGO.url}`,
      width: ORGANIZATION_LOGO.width,
      height: ORGANIZATION_LOGO.height,
    },
  };
}

// Home page graph: the Organization plus the WebSite with its catalog search.
export function homeJsonLd(locale: Locale, name: string, description: string) {
  const site = siteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationJsonLd(),
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: `${site}/${locale}`,
        name,
        description,
        inLanguage: locale === "fa" ? "fa-IR" : "en",
        publisher: { "@id": `${site}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${site}/${locale}/products?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

// JSON for a <script type="application/ld+json">: `<` is escaped so stored
// text can never close the script element.
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
