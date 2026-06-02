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
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-7">
          <Link
            href={base}
            className="flex items-center gap-2 text-lg font-extrabold tracking-tight"
          >
            <span className="grid size-8 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
              o
            </span>
            <span>
              oosta<span className="text-gradient">AI</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 sm:flex">
            {link(`${base}/products`, dict.products)}
            {user && link(`${base}/dashboard`, dict.dashboard)}
            {user && link(`${base}/support`, dict.support)}
            {user?.role === "ADMIN" && link(`${base}/admin`, dict.admin)}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle label={themeLabel} />
          <LocaleSwitcher current={locale} />
          {!loading &&
            (user ? (
              <>
                <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
                <Button variant="outline" size="sm" onClick={logout}>
                  {dict.logout}
                </Button>
              </>
            ) : (
              <>
                <Link
                  href={`${base}/login`}
                  className="hidden h-9 items-center rounded-xl px-3.5 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground sm:inline-flex"
                >
                  {dict.login}
                </Link>
                <Link
                  href={`${base}/signup`}
                  className="inline-flex h-9 items-center rounded-xl bg-brand-gradient px-4 text-sm font-medium text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98]"
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
