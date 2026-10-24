"use client";

// "Returned to sender": the envelope shown for a missing page or a failed render.

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Envelope, StatusPostmark } from "@/components/stamp";

const COPY = {
  fa: {
    notFound: {
      stamp: "برگشت خورد",
      code: "۴۰۴",
      title: "این آدرس در دفتر پست ما نیست",
      body: "شاید نشانی را اشتباه نوشته‌اید یا این صفحه جابه‌جا شده. از اینجا راه را دوباره پیدا کنید:",
    },
    error: {
      stamp: "در راه ماند",
      code: "خطا",
      title: "پاکت در مسیر گیر کرد",
      body: "مشکلی موقت پیش آمد. یک بار دیگر امتحان کنید؛ اگر تکرار شد به پشتیبانی خبر بدهید.",
    },
    home: "صفحهٔ اصلی",
    products: "محصولات",
    support: "پشتیبانی",
    retry: "دوباره امتحان کن",
  },
  en: {
    notFound: {
      stamp: "Returned",
      code: "404",
      title: "This address isn't on our route",
      body: "The link may be mistyped or the page has moved. Find your way from here:",
    },
    error: {
      stamp: "Delayed",
      code: "Error",
      title: "This envelope got stuck on the way",
      body: "Something went wrong for a moment. Try again; if it keeps happening, let support know.",
    },
    home: "Home",
    products: "Products",
    support: "Support",
    retry: "Try again",
  },
};

export function ReturnedEnvelope({
  kind,
  action,
}: {
  kind: "notFound" | "error";
  action?: (label: string) => ReactNode;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale === "en" ? "en" : "fa";
  const t = COPY[locale];
  const c = t[kind];
  const link =
    "inline-flex h-11 items-center rounded-[10px] border border-border bg-card px-4 text-sm font-bold transition-colors hover:border-primary hover:text-primary";

  return (
    <Container className="max-w-2xl py-16 animate-fade-in">
      <Envelope>
        <div className="relative px-6 py-10 sm:px-10">
          <StatusPostmark
            label={c.stamp}
            tone="closed"
            className="absolute end-6 top-6 size-[96px] text-sm sm:end-10"
          />
          <p className="font-mono text-5xl font-black text-primary">{c.code}</p>
          <h1 className="mt-4 max-w-[80%] text-2xl font-black">{c.title}</h1>
          <p className="mt-2 max-w-md text-sm leading-7 text-muted">{c.body}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {action?.(t.retry)}
            {/* Plain anchors: they work even when client navigation is broken. */}
            <a href={`/${locale}`} className={link}>
              {t.home}
            </a>
            <a href={`/${locale}/products`} className={link}>
              {t.products}
            </a>
            <a href={`/${locale}/support`} className={link}>
              {t.support}
            </a>
          </div>
        </div>
      </Envelope>
    </Container>
  );
}
