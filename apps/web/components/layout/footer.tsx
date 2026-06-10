import Link from "next/link";
import { Container } from "@/components/ui/container";
import { assetUrl } from "@/lib/api";
import { localizedSetting, type SiteConfig } from "@/lib/settings";
import type { Locale } from "@/lib/i18n";

type FooterDict = {
  tagline: string;
  rights: string;
  aboutTitle: string;
  aboutDefault: string;
  shopTitle: string;
  supportTitle: string;
  contactTitle: string;
  trustTitle: string;
};
type NavDict = {
  home: string;
  products: string;
  blog: string;
  support: string;
  dashboard: string;
};

// "@handle" -> platform URL; full URLs pass through.
function socialHref(value: string, base: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}/${value.replace(/^@/, "")}`;
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-muted transition-colors hover:text-foreground">
      {label}
    </Link>
  );
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
  const year = new Date().getFullYear();
  const base = `/${locale}`;
  const { settings, enamadBadge } = config;
  const about = localizedSetting(settings, "footerAbout", locale) ?? dict.aboutDefault;

  const contact: Array<{ label: string; href: string }> = [];
  if (settings.contactEmail) {
    contact.push({ label: settings.contactEmail, href: `mailto:${settings.contactEmail}` });
  }
  if (settings.contactPhone) {
    contact.push({ label: settings.contactPhone, href: `tel:${settings.contactPhone}` });
  }
  if (settings.contactTelegram) {
    contact.push({
      label: `Telegram — ${settings.contactTelegram.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "@")}`,
      href: socialHref(settings.contactTelegram, "https://t.me"),
    });
  }
  if (settings.contactInstagram) {
    contact.push({
      label: `Instagram — ${settings.contactInstagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@")}`,
      href: socialHref(settings.contactInstagram, "https://instagram.com"),
    });
  }

  const badge = enamadBadge ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl("/site-assets/enamad")}
      alt="نماد اعتماد الکترونیکی"
      className="h-24 w-24 rounded-xl border border-border bg-white object-contain p-1"
    />
  ) : null;

  return (
    <footer className="mt-20 border-t border-border bg-surface/40">
      <div className="h-px bg-brand-gradient opacity-60" />
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Link
            href={base}
            className="flex items-center gap-2 text-lg font-extrabold tracking-tight"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
              o
            </span>
            <span>
              oosta<span className="text-gradient">AI</span>
            </span>
          </Link>
          <p className="text-sm font-medium text-muted">{dict.tagline}</p>
          <p className="text-sm leading-relaxed text-muted">{about}</p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">
            {dict.shopTitle}
          </h3>
          <div className="flex flex-col gap-2.5">
            <FooterLink href={base} label={nav.home} />
            <FooterLink href={`${base}/products`} label={nav.products} />
            <FooterLink href={`${base}/blog`} label={nav.blog} />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">
            {dict.supportTitle}
          </h3>
          <div className="flex flex-col gap-2.5">
            <FooterLink href={`${base}/support`} label={nav.support} />
            <FooterLink href={`${base}/dashboard`} label={nav.dashboard} />
          </div>
          {contact.length > 0 && (
            <>
              <h3 className="pt-3 text-sm font-bold uppercase tracking-wider text-foreground/80">
                {dict.contactTitle}
              </h3>
              <div className="flex flex-col gap-2.5">
                {contact.map((c) => (
                  <a
                    key={c.href}
                    href={c.href}
                    target={c.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="text-sm text-muted transition-colors hover:text-foreground"
                    dir="ltr"
                  >
                    {c.label}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">
            {dict.trustTitle}
          </h3>
          {badge &&
            (settings.enamadLink ? (
              <a
                href={settings.enamadLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block transition-transform hover:scale-105"
              >
                {badge}
              </a>
            ) : (
              badge
            ))}
          {!badge && <p className="text-sm text-muted">—</p>}
        </div>
      </Container>

      <div className="border-t border-border">
        <Container className="flex flex-col items-center justify-between gap-2 py-5 text-sm text-muted sm:flex-row">
          <p>© {year} oostaAI</p>
          <p>{dict.rights}</p>
        </Container>
      </div>
    </footer>
  );
}
