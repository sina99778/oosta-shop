"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Container } from "@/components/ui/container";
import type { Locale } from "@/lib/i18n";
import type { ReactNode } from "react";
import styles from "./account.module.css";

const sections = [
  [
    "overview",
    "/dashboard",
    "حساب من و سفارش‌ها",
    "Account & orders",
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  ],
  ["inbox", "/dashboard/inbox", "صندوق پیام", "Inbox", "M3 5h18v14H3z M3 13h6l1.5 2h3l1.5-2h6"],
  [
    "support",
    "/support",
    "پشتیبانی",
    "Support",
    "M21 11a8 8 0 0 1-8 8H8l-5 2 1.5-4.5A8 8 0 1 1 21 11Z M8 11h.01 M12 11h.01 M16 11h.01",
  ],
  [
    "security",
    "/dashboard/security",
    "امنیت حساب",
    "Security",
    "M12 22s7-3.5 7-10V6l-7-3-7 3v6c0 6.5 7 10 7 10Z M9 12l2 2 4-4",
  ],
] as const;

export function AccountFrame({
  locale,
  section,
  title,
  detail,
  action,
  children,
}: {
  locale: Locale;
  section: "overview" | "orders" | "inbox" | "support" | "security";
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const fa = locale === "fa";
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current;
    const current = nav?.querySelector("[aria-current]");
    if (!nav || !current) return;
    const bounds = nav.getBoundingClientRect();
    const link = current.getBoundingClientRect();
    if (link.left < bounds.left) nav.scrollBy({ left: link.left - bounds.left - 4 });
    else if (link.right > bounds.right) nav.scrollBy({ left: link.right - bounds.right + 4 });
  }, [section]);
  return (
    <Container className={styles.shell}>
      <nav
        ref={navigation}
        aria-label={fa ? "حساب کاربری" : "Customer account"}
        className={styles.nav}
      >
        {sections.map(([id, path, persian, english, icon]) => (
          <Link
            key={id}
            href={`/${locale}${path}`}
            aria-current={
              id === section
                ? "page"
                : id === "overview" && section === "orders"
                  ? "location"
                  : undefined
            }
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={icon} />
            </svg>
            {fa ? persian : english}
          </Link>
        ))}
      </nav>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{fa ? "حساب اوستا" : "Oosta account"}</p>
          <h1>{title}</h1>
          {detail && <div className={styles.heroDetail}>{detail}</div>}
        </div>
        {action}
      </header>
      {children}
    </Container>
  );
}
