"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "@/components/wordmark";
import type { Locale } from "@/lib/i18n";
import styles from "./site-chrome.module.css";

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
  const [openPath, setOpenPath] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuOpen = openPath === pathname;
  const fa = locale === "fa";
  const base = `/${locale}`;
  const menuLabel = fa ? "منوی اصلی" : "Main menu";

  const routes = [
    { href: base, label: dict.home },
    { href: `${base}/products`, label: dict.products },
    { href: `${base}/blog`, label: dict.blog },
    { href: `${base}/support`, label: dict.support },
    ...(user ? [{ href: `${base}/dashboard`, label: dict.dashboard }] : []),
    ...(user?.role === "ADMIN" ? [{ href: `${base}/admin`, label: dict.admin }] : []),
  ];

  function navigation() {
    return routes.map(({ href, label }) => {
      const active = pathname === href || (href !== base && pathname.startsWith(`${href}/`));
      return (
        <Link
          prefetch={false}
          key={href}
          href={href}
          className={styles.navLink}
          onClick={() => setOpenPath(null)}
          aria-current={active ? "page" : undefined}
        >
          {label}
        </Link>
      );
    });
  }

  function accountActions() {
    if (loading) return null;
    if (user)
      return (
        <Button
          variant="outline"
          type="button"
          size="sm"
          onClick={() => {
            setOpenPath(null);
            void logout();
          }}
        >
          {dict.logout}
        </Button>
      );
    return (
      <>
        <Link
          prefetch={false}
          href={`${base}/login`}
          onClick={() => setOpenPath(null)}
          className={`oosta-button ${styles.accountAction}`}
          data-button-variant="outline"
        >
          {dict.login}
        </Link>
        <Link
          prefetch={false}
          href={`${base}/signup`}
          onClick={() => setOpenPath(null)}
          className={`oosta-button ${styles.accountAction}`}
          data-button-variant="primary"
        >
          {dict.signup}
        </Link>
      </>
    );
  }

  return (
    <header
      className={`oosta-header ${styles.header}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !menuOpen) return;
        setOpenPath(null);
        menuButton.current?.focus();
      }}
    >
      <Container className={styles.headerRow}>
        <Link
          prefetch={false}
          href={base}
          aria-label={fa ? "اوستا، صفحهٔ اصلی" : "Oosta home"}
          className={styles.brand}
          onClick={() => setOpenPath(null)}
        >
          <Wordmark />
        </Link>
        <nav className={styles.desktopNav} aria-label={menuLabel}>
          {navigation()}
        </nav>
        <div className={styles.toolbar}>
          <ThemeToggle label={themeLabel} />
          <LocaleSwitcher current={locale} />
          <div className={styles.desktopAccount}>{accountActions()}</div>
          <button
            type="button"
            ref={menuButton}
            className={`oosta-button ${styles.menuButton}`}
            data-button-variant="outline"
            aria-label={menuOpen ? (fa ? "بستن منو" : "Close menu") : menuLabel}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setOpenPath(menuOpen ? null : pathname)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
              width="21"
              height="21"
            >
              <path d={menuOpen ? "M6 6l12 12M18 6 6 18" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
      </Container>
      <nav
        id="mobile-navigation"
        aria-label={menuLabel}
        hidden={!menuOpen}
        className={styles.mobileNav}
      >
        <Container className={styles.mobileInner}>
          <div className={styles.mobileLinks}>{navigation()}</div>
          {!loading && <div className={styles.mobileAccount}>{accountActions()}</div>}
        </Container>
      </nav>
    </header>
  );
}
