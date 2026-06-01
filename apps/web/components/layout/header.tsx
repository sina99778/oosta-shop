"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { LocaleSwitcher } from "./locale-switcher";
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
};

export function Header({ locale, dict }: { locale: Locale; dict: NavDict }) {
  const { user, logout, loading } = useAuth();
  const base = `/${locale}`;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href={base} className="text-lg font-bold tracking-tight">
            oosta<span className="text-primary">AI</span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-muted sm:flex">
            <Link href={`${base}/products`} className="hover:text-foreground">
              {dict.products}
            </Link>
            {user && (
              <Link href={`${base}/dashboard`} className="hover:text-foreground">
                {dict.dashboard}
              </Link>
            )}
            {user?.role === "ADMIN" && (
              <Link href={`${base}/admin`} className="hover:text-foreground">
                {dict.admin}
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
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
                  className="inline-flex h-8 items-center rounded-lg px-3 text-sm hover:bg-surface"
                >
                  {dict.login}
                </Link>
                <Link
                  href={`${base}/signup`}
                  className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
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
