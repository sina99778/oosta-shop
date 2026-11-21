import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { Wordmark } from "@/components/wordmark";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n";
import styles from "./auth.module.css";

export function AuthShell({
  auth,
  locale,
  offer,
  children,
}: {
  auth: Dictionary["auth"];
  locale: Locale;
  offer?: boolean;
  children: ReactNode;
}) {
  const fa = locale === "fa";
  return (
    <Container className="flex justify-center py-10 sm:py-16">
      <div className={styles.shell}>
        <aside className={styles.panel} aria-label={auth.panelEyebrow}>
          <Wordmark className={styles.brand} />
          <div>
            <h2>{auth.panelTitle}</h2>
            <ul className={styles.points}>
              {auth.panelPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          {offer && (
            <div className={styles.offer}>
              <strong>{fa ? "۱۵٪ هدیهٔ اولین خرید" : "15% off your first purchase"}</strong>
              <p>
                {fa
                  ? "کد هدیه در صندوق پیام حسابت است."
                  : "Find your welcome code in your account inbox."}
              </p>
            </div>
          )}
        </aside>
        <div className={styles.form}>{children}</div>
      </div>
    </Container>
  );
}
