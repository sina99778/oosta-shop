import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "../dictionaries";
import { isLocale } from "@/lib/i18n";
import { contactLinks, getSiteSettings } from "@/lib/settings";
import { Container } from "@/components/ui/container";
import { Envelope } from "@/components/stamp";

export const metadata: Metadata = { robots: { index: false } };

// Password recovery without SMS/email: the buyer reaches support, who issues a
// one-time reset link from the admin "customers" page.
export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const a = dict.auth;
  const contact = contactLinks(await getSiteSettings());

  return (
    <Container className="max-w-xl py-14 animate-fade-in">
      <Envelope>
        <div className="p-6 sm:p-8">
          <h1 className="text-2xl font-black">{a.forgotTitle}</h1>
          <p className="mt-2 text-sm text-muted">{a.forgotBody}</p>
          <ol className="mt-5 space-y-3 text-sm leading-7">
            {[a.forgotStep1, a.forgotStep2, a.forgotStep3].map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-primary text-xs font-black text-primary">
                  {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(i + 1)}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-[10px] bg-surface p-3 text-sm leading-7">{a.forgotBot}</p>
          <div className="mt-6 border-t border-dashed border-border pt-5">
            {contact.length === 0 ? (
              <p className="text-sm text-muted">{a.forgotNoContact}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {contact.map((c) => (
                  <li key={c.href}>
                    <a
                      href={c.href}
                      dir="ltr"
                      className="inline-flex h-11 items-center rounded-[10px] border border-border bg-card px-4 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
                    >
                      {c.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href={`/${locale}/login`}
            className="mt-6 inline-block text-sm text-primary hover:underline"
          >
            {a.backToLogin}
          </Link>
        </div>
      </Envelope>
    </Container>
  );
}
