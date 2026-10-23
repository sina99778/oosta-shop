"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
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
  cart: string;
  menu: string;
  closeMenu: string;
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
  const { count } = useCart();
  const pathname = usePathname();
  const base = `/${locale}`;
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation and on Escape; lock page scroll while open.
  useEffect(() => {
    queueMicrotask(() => setMenuOpen(false));
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [menuOpen]);

  const isActive = (href: string) =>
    pathname === href || (href !== base && pathname.startsWith(href));

  const navItems: Array<[string, string]> = [
    [base, dict.home],
    [`${base}/products`, dict.products],
    [`${base}/blog`, dict.blog],
    ...(user
      ? ([
          [`${base}/dashboard`, dict.dashboard],
          [`${base}/support`, dict.support],
        ] as Array<[string, string]>)
      : []),
    ...(user?.role === "ADMIN" ? ([[`${base}/admin`, dict.admin]] as Array<[string, string]>) : []),
  ];

  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={cn(
        "text-sm transition-colors",
        isActive(href) ? "font-medium text-foreground" : "text-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

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
            {navItems.map(([href, label]) => link(href, label))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`${base}/cart`}
            aria-label={count > 0 ? `${dict.cart} (${count})` : dict.cart}
            className="relative inline-flex size-10 items-center justify-center border border-border text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6" />
              <circle cx="10" cy="20" r="1" />
              <circle cx="18" cy="20" r="1" />
            </svg>
            {count > 0 && (
              <span className="absolute -end-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-5 text-primary-foreground">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
          <ThemeToggle label={themeLabel} />
          <LocaleSwitcher current={locale} />
          {!loading &&
            (user ? (
              <>
                <span className="hidden text-sm text-muted lg:inline">{user.name}</span>
                {/* Wrapper carries the breakpoint: Button's own inline-flex would win over "hidden". */}
                <span className="hidden sm:inline-flex">
                  <Button variant="outline" size="sm" className="rounded-none" onClick={logout}>
                    {dict.logout}
                  </Button>
                </span>
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
                  className="hidden h-10 items-center bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.98] sm:inline-flex"
                >
                  {dict.signup}
                </Link>
              </>
            ))}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? dict.closeMenu : dict.menu}
            className="inline-flex size-10 items-center justify-center border border-border text-foreground transition-colors hover:border-primary hover:text-primary md:hidden"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </Container>

      {/* Mobile menu (below md) — the desktop nav is hidden there. Portaled to
          <body>: the header's backdrop-blur would otherwise become the containing
          block of this fixed panel and clip it to the 70px header. */}
      {menuOpen &&
        createPortal(
          <div
            id="mobile-menu"
            className="fixed inset-x-0 top-[70px] bottom-0 z-40 overflow-y-auto border-t border-border bg-background md:hidden"
          >
            <Container className="flex flex-col py-4">
              <nav className="flex flex-col">
                {navItems.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center border-b border-border text-base",
                      isActive(href) ? "font-bold text-primary" : "text-foreground",
                    )}
                  >
                    {label}
                  </Link>
                ))}
                <Link
                  href={`${base}/cart`}
                  className="flex min-h-12 items-center justify-between border-b border-border text-base"
                >
                  {dict.cart}
                  {count > 0 && (
                    <span className="rounded-full bg-primary px-2 text-xs font-bold leading-5 text-primary-foreground">
                      {count}
                    </span>
                  )}
                </Link>
              </nav>
              {!loading && (
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {user ? (
                    <Button variant="outline" className="col-span-2 rounded-none" onClick={logout}>
                      {dict.logout} ({user.name})
                    </Button>
                  ) : (
                    <>
                      <Link
                        href={`${base}/login`}
                        className="inline-flex h-12 items-center justify-center border border-border text-sm"
                      >
                        {dict.login}
                      </Link>
                      <Link
                        href={`${base}/signup`}
                        className="inline-flex h-12 items-center justify-center bg-primary text-sm font-bold text-primary-foreground"
                      >
                        {dict.signup}
                      </Link>
                    </>
                  )}
                </div>
              )}
            </Container>
          </div>,
          document.body,
        )}
    </header>
  );
}
