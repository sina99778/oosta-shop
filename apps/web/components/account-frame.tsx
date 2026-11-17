import Link from "next/link";
import { Container } from "@/components/ui/container";
import type { Locale } from "@/lib/i18n";
import type { ReactNode } from "react";
import styles from "./account.module.css";

export function AccountFrame({
  locale,
  section,
  title,
  detail,
  action,
  children,
}: {
  locale: Locale;
  section: "orders" | "support" | "security";
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const fa = locale === "fa";
  return (
    <Container className={styles.shell}>
      <nav aria-label={fa ? "حساب کاربری" : "Customer account"} className={styles.nav}>
        <Link
          href={`/${locale}/dashboard`}
          aria-current={section === "orders" ? "location" : undefined}
        >
          {fa ? "سفارش‌ها" : "Orders"}
        </Link>
        <Link
          href={`/${locale}/support`}
          aria-current={section === "support" ? "location" : undefined}
        >
          {fa ? "پشتیبانی" : "Support"}
        </Link>
        <Link
          href={`/${locale}/dashboard/security`}
          aria-current={section === "security" ? "location" : undefined}
        >
          {fa ? "امنیت حساب" : "Security"}
        </Link>
      </nav>
      <header className={styles.hero}>
        <div>
          <h1>{title}</h1>
          {detail && <div className={styles.heroDetail}>{detail}</div>}
        </div>
        {action}
      </header>
      {children}
    </Container>
  );
}
