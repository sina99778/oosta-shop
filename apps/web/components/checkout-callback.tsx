"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { AlertIcon, ClockIcon, RefreshIcon } from "@/components/checkout-ui";
import styles from "./checkout.module.css";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function CheckoutCallback({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fa = locale === "fa";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"verifying" | "unknown" | "missing">("verifying");
  const authority = searchParams.get("Authority");
  const status = searchParams.get("Status");
  useEffect(() => {
    if (!authority || !status) {
      queueMicrotask(() => setState("missing"));
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setState("verifying");
    });
    api
      .post<{ status: "paid" | "failed" | "pending"; orderId?: string }>("/payments/verify", {
        authority,
        status,
      })
      .then((result) => {
        if (!active) return;
        if ((result.status === "paid" || result.status === "pending") && result.orderId)
          router.replace(`/${locale}/dashboard/orders/${encodeURIComponent(result.orderId)}`);
        else if (result.status === "failed") router.replace(`/${locale}/checkout/cancel`);
        else setState("unknown");
      })
      .catch(() => {
        if (active) setState("unknown");
      });
    return () => {
      active = false;
    };
  }, [authority, status, attempt, locale, router]);
  const tone = state === "unknown" ? "pending" : state === "missing" ? "danger" : undefined;
  return (
    <Container className={styles.page}>
      <section className={styles.result} data-tone={tone} role="status">
        <span className={styles.resultIcon} aria-hidden="true">
          {state === "verifying" ? (
            <RefreshIcon size={34} />
          ) : state === "unknown" ? (
            <ClockIcon size={34} />
          ) : (
            <AlertIcon size={34} />
          )}
        </span>
        <h1>
          {state === "verifying"
            ? dict.checkout.verifying
            : state === "missing"
              ? dict.checkout.missingParams
              : fa
                ? "نتیجه پرداخت هنوز مشخص نیست"
                : "Payment confirmation pending"}
        </h1>
        <p>
          {state === "verifying"
            ? fa
              ? "این صفحه را نبند؛ تأیید پرداخت معمولاً چند ثانیه طول می‌کشد."
              : "Keep this page open; verification normally finishes in a few seconds."
            : state === "missing"
              ? fa
                ? "اگر از درگاه برگشته‌ای و سفارش در داشبورد ثبت شده، وضعیتش را آنجا ببین."
                : "If you just returned from the gateway, inspect your order status in the dashboard."
              : fa
                ? "پیش از پرداخت دوباره، وضعیت سفارش را بررسی کن تا پرداخت تکراری ثبت نشود."
                : "Check your order in the dashboard before paying again."}
        </p>
        {state === "verifying" && <div className={styles.progress} aria-hidden="true" />}
        {state !== "verifying" && (
          <div className={styles.resultActions}>
            {state === "unknown" && (
              <Button onClick={() => setAttempt((n) => n + 1)}>
                {fa ? "بررسی دوباره" : "Check again"}
              </Button>
            )}
            <Link
              className="oosta-button inline-flex min-h-11 items-center px-5"
              data-button-variant={state === "unknown" ? "outline" : "primary"}
              href={`/${locale}/dashboard`}
            >
              {dict.checkout.viewOrders}
            </Link>
          </div>
        )}
      </section>
    </Container>
  );
}
