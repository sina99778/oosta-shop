"use client";

import { useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

export function ProductSearchForm({
  locale,
  className,
  children,
}: {
  locale: Locale;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const action = `/${locale}/products`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string") query.append(key, value);
    });
    startTransition(() => router.push(`${action}?${query}`));
  }

  return (
    <form
      role="search"
      action={action}
      method="get"
      className={className}
      aria-busy={pending}
      onSubmit={submit}
    >
      {children}
      {pending && (
        <span role="status" className="sr-only">
          {locale === "fa" ? "در حال دریافت محصولات" : "Loading products"}
        </span>
      )}
    </form>
  );
}
