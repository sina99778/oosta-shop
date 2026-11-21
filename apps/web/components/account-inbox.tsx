"use client";

import Link from "next/link";
import { useState } from "react";
import { AccountFrame } from "@/components/account-frame";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { Locale } from "@/lib/i18n";
import type { WelcomeGift } from "@/lib/types";
import styles from "./account.module.css";

export function AccountInbox({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const { token } = useAuth();
  const { data, loading, error, refetch } = useApi<{ welcomeGift: WelcomeGift | null }>(
    token ? "/auth/inbox" : null,
    token ?? undefined,
  );
  const [copyResult, setCopyResult] = useState<{ code: string; copied: boolean }>();
  const gift = data?.welcomeGift;
  const copyState = gift?.code === copyResult?.code ? copyResult : undefined;
  const format = new Intl.NumberFormat(fa ? "fa-IR" : "en");
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopyResult({ code, copied: true });
    } catch {
      setCopyResult({ code, copied: false });
    }
  }
  return (
    <AccountFrame locale={locale} section="inbox" title={fa ? "صندوق پیام" : "Inbox"}>
      {loading ? (
        <p role="status" className={styles.panel}>
          {fa ? "در حال دریافت پیام‌ها…" : "Loading messages…"}
        </p>
      ) : error ? (
        <QueryError
          message={fa ? "صندوق پیام در دسترس نیست." : "The inbox is unavailable."}
          onRetry={refetch}
        />
      ) : gift ? (
        <article className={styles.coupon}>
          <span className={styles.couponBadge}>
            {fa
              ? `${format.format(gift.percent)}٪ تخفیف خرید اول`
              : `${gift.percent}% off your first purchase`}
          </span>
          <h2 className="text-xl font-semibold">
            {fa ? "به اوستا خوش اومدی!" : "Welcome to Oosta!"}
          </h2>
          {gift.state === "AVAILABLE" ? (
            <>
              <p className="mt-2 text-sm leading-7">
                {fa
                  ? "کد را هنگام بررسی فاکتور سبد خرید وارد کن."
                  : "Enter your code when reviewing your cart invoice."}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <code dir="ltr" className={styles.couponCode}>
                  {gift.code}
                </code>
                <Button type="button" onClick={() => void copy(gift.code)}>
                  <span aria-hidden="true">{copyState?.copied ? "✓" : "⧉"}</span>
                  {fa ? "کپی کد تخفیف" : "Copy discount code"}
                </Button>
                <Link href={`/${locale}/products`} className={styles.action}>
                  {fa ? "دیدن محصولات" : "Browse products"}
                </Link>
              </div>
              <p className="mt-2 text-sm" role="status">
                {copyState &&
                  (copyState.copied
                    ? fa
                      ? "کد کپی شد."
                      : "Code copied."
                    : fa
                      ? "کد را انتخاب و دستی کپی کن."
                      : "Select and copy the code manually.")}
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm">
              {gift.state === "RESERVED"
                ? fa
                  ? "یک سفارش در انتظار تعیین وضعیت است."
                  : "An order is awaiting a payment decision."
                : fa
                  ? "مهلت استفاده از هدیه با ثبت اولین پرداخت به پایان رسیده است."
                  : "The gift expired when the first payment was completed."}
            </p>
          )}
        </article>
      ) : (
        <p className={styles.panel}>{fa ? "صندوق پیامت خالی است." : "Your inbox is empty."}</p>
      )}
    </AccountFrame>
  );
}
