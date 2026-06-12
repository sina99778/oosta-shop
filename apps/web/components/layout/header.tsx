"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import type { Locale } from "@/lib/i18n";

type NavDict = {
  home: string;
  products: string;
  dashboard: string;
  admin: string;
  login: string;
  signup: string;
  logout: string;
  account: string;
  support: string;
  blog: string;
};

export function Header({
  locale,
  dict,
  themeLabel,
}: {
  locale: Locale;
  dict: NavDict;
  themeLabel: string;
}) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const base = `/${locale}`;

  const link = (href: string, label: string) => {
    const active = pathname === href || (href !== base && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={cn(
          "text-sm transition-colors",
          active ? "font-medium text-foreground" : "text-muted hover:text-foreground",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <Container className="flex h-[70px] items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link
            href={base}
            className="flex items-center gap-2 text-2xl font-black tracking-[-0.06em]"
          >
            <span>
              oosta<span className="text-primary">AI</span>
            </span>
            <span className="size-2 rounded-full bg-primary" />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {link(base, dict.home)}
            {link(`${base}/products`, dict.products)}
            {link(`${base}/blog`, dict.blog)}
            {user && link(`${base}/dashboard`, dict.dashboard)}
            {user && link(`${base}/support`, dict.support)}
            {user?.role === "ADMIN" && link(`${base}/admin`, dict.admin)}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`${base}/products`}
            aria-label={dict.products}
            className="relative hidden size-10 items-center justify-center border border-border text-foreground transition-colors hover:border-primary hover:text-primary sm:inline-flex"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6" />
              <circle cx="10" cy="20" r="1" />
              <circle cx="18" cy="20" r="1" />
            </svg>
            <span className="absolute -end-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-white">
              0
            </span>
          </Link>
          <ThemeToggle label={themeLabel} />
          <LocaleSwitcher current={locale} />
          {!loading &&
            (user ? (
              <>
                <span className="hidden text-sm text-muted lg:inline">{user.name}</span>
                <Button variant="outline" size="sm" className="rounded-none" onClick={logout}>
                  {dict.logout}
                </Button>
              </>
            ) : (
              <>
                <Link
                  href={`${base}/login`}
                  className="hidden h-10 items-center border border-border px-4 text-sm text-foreground transition-colors hover:border-primary hover:text-primary sm:inline-flex"
                >
                  {dict.login}
                </Link>
                <Link
                  href={`${base}/signup`}
                  className="inline-flex h-10 items-center bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-hover active:scale-[0.98]"
                >
                  {dict.signup}
                </Link>
              </>
            ))}
        </div>
      </Container>
    </header>
  );
}
