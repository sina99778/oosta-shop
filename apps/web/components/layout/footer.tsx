import Link from "next/link";
import { Container } from "@/components/ui/container";
import type { Locale } from "@/lib/i18n";

type FooterDict = { tagline: string; rights: string };
type NavDict = { home: string; products: string };

export function Footer({ locale, dict, nav }: { locale: Locale; dict: FooterDict; nav: NavDict }) {
  const year = new Date().getFullYear();
  const base = `/${locale}`;
  return (
    <footer className="mt-16 border-t border-border">
      <div className="h-px bg-brand-gradient opacity-60" />
      <Container className="grid gap-8 py-12 sm:grid-cols-3">
        <div className="space-y-3">
          <Link
            href={base}
            className="flex items-center gap-2 text-lg font-extrabold tracking-tight"
          >
            <span className="grid size-8 place-items-center rounded-xl bg-brand-gradient text-white">
              o
            </span>
            <span>
              oosta<span className="text-gradient">AI</span>
            </span>
          </Link>
          <p className="max-w-xs text-sm text-muted">{dict.tagline}</p>
        </div>

        <nav className="flex flex-col gap-2 text-sm">
          <Link href={base} className="text-muted transition-colors hover:text-foreground">
            {nav.home}
          </Link>
          <Link
            href={`${base}/products`}
            className="text-muted transition-colors hover:text-foreground"
          >
            {nav.products}
          </Link>
        </nav>

        <div className="text-sm text-muted sm:text-end">
          <p>© {year} oostaAI</p>
          <p className="mt-1">{dict.rights}</p>
        </div>
      </Container>
    </footer>
  );
}
