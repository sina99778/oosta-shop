"use client";

import Link from "next/link";
import { useState } from "react";
import { AccountFrame } from "@/components/account-frame";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { Locale } from "@/lib/i18n";
import styles from "./account.module.css";

type WelcomeGift = { code: string; percent: number; state: "AVAILABLE" | "RESERVED" | "USED" };

export function AccountInbox({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const { token } = useAuth();
  const { data, loading, error, refetch } = useApi<{ welcomeGift: WelcomeGift | null }>(
    token ? "/auth/inbox" : null,
    token ?? undefined,
  );
  const [copyResult, setCopyResult] = useState("");
  const gift = data?.welcomeGift;
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopyResult(fa ? "کد کپی شد." : "Code copied.");
    } catch {
      setCopyResult(fa ? "کد را انتخاب و دستی کپی کن." : "Select and copy the code manually.");
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
        <article className={styles.panel}>
          <h2 className="text-xl font-semibold">
            {fa ? "به اوستا خوش اومدی!" : "Welcome to Oosta!"}
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted">
            {fa
              ? `برای اولین خرید، ${gift.percent.toLocaleString("fa-IR")}٪ تخفیف هدیه داری. کد را در فاکتور سبد خرید وارد کن.`
              : `Enjoy ${gift.percent}% off your first purchase. Enter the code when reviewing your cart invoice.`}
          </p>
          {gift.state === "AVAILABLE" ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <code
                dir="ltr"
                className="max-w-full break-all rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary"
              >
                {gift.code}
              </code>
              <Button type="button" onClick={() => void copy(gift.code)}>
                {fa ? "کپی کد تخفیف" : "Copy discount code"}
              </Button>
              <Link href={`/${locale}/products`} className={styles.action}>
                {fa ? "دیدن محصولات" : "Browse products"}
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-sm text-primary">
              {gift.state === "RESERVED"
                ? fa
                  ? "یک سفارش در انتظار تعیین وضعیت است."
                  : "An order is awaiting a payment decision."
                : fa
                  ? "مهلت استفاده از هدیه با ثبت اولین پرداخت به پایان رسیده است."
                  : "The gift expired when the first payment was completed."}
            </p>
          )}
          <p className="mt-2 text-sm text-muted" role="status">
            {copyResult}
          </p>
        </article>
      ) : (
        <p className={styles.panel}>{fa ? "صندوق پیامت خالی است." : "Your inbox is empty."}</p>
      )}
    </AccountFrame>
  );
}
