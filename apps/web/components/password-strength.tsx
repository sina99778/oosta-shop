import type { Locale } from "@/lib/i18n";
import styles from "./auth.module.css";

export function passwordStrength(password: string) {
  const normalized = password.toLowerCase();
  const length = [...password].length;
  if (!password) return 0;
  if (
    length < 8 ||
    new Set(normalized).size < 5 ||
    /^(?:password|qwerty|123456|abcdef|admin123)/i.test(normalized)
  )
    return 1;
  const kinds = [/\p{L}/u, /\p{N}/u, /[^\p{L}\p{N}\s]/u].filter((pattern) =>
    pattern.test(password),
  ).length;
  return (length >= 12 && kinds === 3) || length >= 16 ? 3 : 2;
}

export function PasswordStrength({
  id,
  locale,
  password,
}: {
  id: string;
  locale: Locale;
  password: string;
}) {
  const fa = locale === "fa";
  const score = passwordStrength(password);
  const label = (
    fa ? ["هنوز وارد نشده", "ضعیف", "متوسط", "قوی"] : ["Not entered", "Weak", "Fair", "Strong"]
  )[score];
  return (
    <div id={id} className={styles.strength} data-strength={score}>
      <p>
        <span>{fa ? "قدرت تقریبی رمز" : "Estimated password strength"}</span>{" "}
        <strong aria-live="polite">{label}</strong>
      </p>
      <div className={styles.strengthBars} aria-hidden="true">
        {[1, 2, 3].map((level) => (
          <span key={level} data-filled={level <= score} />
        ))}
      </div>
    </div>
  );
}
