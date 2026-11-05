"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "@/components/wordmark";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const base = `/${locale}`;

  const link = (href: string, label: string) => {
    const active = pathname === href || (href !== base && pathname.startsWith(href));
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={() => setMenuOpen(false)}
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
    <header className="oosta-header sticky top-0 z-40 border-b border-border bg-background">
      <Container className="flex h-[78px] items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link
            href={base}
            aria-label={locale === "fa" ? "اوستا، صفحهٔ اصلی" : "Oosta home"}
            className="flex items-center gap-2"
          >
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {link(base, dict.home)}
            {link(`${base}/products`, dict.products)}
            {link(`${base}/blog`, dict.blog)}
            {user && link(`${base}/dashboard`, dict.dashboard)}
            {link(`${base}/support`, dict.support)}
            {user?.role === "ADMIN" && link(`${base}/admin`, dict.admin)}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="md:hidden"
            aria-label={locale === "fa" ? "منوی اصلی" : "Main menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </Button>
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
                  className="hidden h-10 items-center rounded border border-border px-4 text-xs text-foreground transition-colors hover:border-primary hover:text-primary sm:inline-flex"
                >
                  {dict.login}
                </Link>
                <Link
                  href={`${base}/signup`}
                  className="hidden sm:inline-flex h-10 items-center rounded bg-brand-gradient px-4 text-xs font-medium text-white transition-colors hover:brightness-110"
                >
                  {dict.signup}
                </Link>
              </>
            ))}
        </div>
      </Container>
      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="flex flex-wrap gap-5 border-t border-border px-4 py-4 md:hidden"
        >
          {link(base, dict.home)}
          {link(`${base}/products`, dict.products)}
          {link(`${base}/blog`, dict.blog)}
          {!user && link(`${base}/login`, dict.login)}
          {!user && link(`${base}/signup`, dict.signup)}
          {user && link(`${base}/dashboard`, dict.dashboard)}
          {link(`${base}/support`, dict.support)}
          {user?.role === "ADMIN" && link(`${base}/admin`, dict.admin)}
        </nav>
      )}
    </header>
  );
}
