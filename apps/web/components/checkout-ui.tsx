import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { monogram } from "./product-card";
import styles from "./checkout.module.css";

const stepLabels = {
  fa: ["سبد خرید", "بازبینی فاکتور", "پرداخت", "تحویل"],
  en: ["Cart", "Invoice review", "Payment", "Delivery"],
} as const;

/** Figma checkout progress: 1 cart → 2 invoice review → 3 payment → 4 delivery. */
export function CheckoutSteps({ locale, current }: { locale: Locale; current: 1 | 2 | 3 | 4 }) {
  const fa = locale === "fa";
  const digits = new Intl.NumberFormat(fa ? "fa-IR" : "en-US");
  return (
    <ol className={styles.steps} aria-label={fa ? "مراحل خرید" : "Checkout steps"}>
      {stepLabels[locale].map((label, index) => {
        const step = index + 1;
        const done = step < current;
        return (
          <li
            key={label}
            data-state={done ? "done" : step === current ? "current" : "next"}
            aria-current={step === current ? "step" : undefined}
          >
            <span className={styles.stepDot} aria-hidden="true">
              {done ? <CheckIcon size={14} /> : digits.format(step)}
            </span>
            <span className={styles.stepLabel}>
              {label}
              {done && <span className="sr-only">{fa ? " (انجام شد)" : " (done)"}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function LineTile({ name }: { name: string }) {
  return (
    <span className={styles.tile} aria-hidden="true">
      {monogram(name)}
    </span>
  );
}

export function CartEmpty({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <BoxIcon />
      </span>
      <h2>{fa ? "سبد خریدت خالی است." : "Your cart is empty."}</h2>
      <p>
        {fa
          ? "از فروشگاه یک ابزار یا اشتراک انتخاب کن؛ می‌توانی تا ۱۰ قلم بدون ورود هم به سبد اضافه کنی."
          : "Pick a tool or subscription from the store. You can add up to ten items without signing in."}
      </p>
      <div className={styles.emptyActions}>
        <Link
          className="oosta-button inline-flex min-h-11 items-center px-5"
          href={`/${locale}/products`}
        >
          {fa ? "رفتن به فروشگاه" : "Go to the store"}
        </Link>
        <Link
          className="oosta-button inline-flex min-h-11 items-center px-5"
          data-button-variant="outline"
          href={`/${locale}/blog`}
        >
          {fa ? "مجلهٔ اوستا" : "Oosta journal"}
        </Link>
      </div>
    </div>
  );
}

type IconProps = { size?: number };
function Svg({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
  </Svg>
);
export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const CardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18M7 15h3" />
  </Svg>
);
export const ReceiptIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);
export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </Svg>
);
export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </Svg>
);
export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" />
  </Svg>
);
