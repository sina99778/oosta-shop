import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Envelope, Postmark } from "@/components/stamp";

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  // Deep-link straight to the delivered credentials when the order id is known.
  const { order } = await searchParams;
  const orderHref =
    order && /^[a-z0-9]+$/i.test(order)
      ? `/${locale}/dashboard/orders/${order}`
      : `/${locale}/dashboard`;

  return (
    <Container className="flex justify-center py-16">
      <Envelope className="w-full max-w-md text-center">
        <div className="px-6 pt-8 pb-7">
          <Postmark
            label={dict.home.postmarkLabel}
            id="success-postmark"
            className="mx-auto w-[220px] -rotate-6 text-primary"
          />
          <h1 className="mt-4 text-2xl font-black">{dict.checkout.successTitle}</h1>
          <p className="mt-2 text-sm leading-7 text-muted">{dict.checkout.successBody}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={orderHref}
              className="inline-flex h-12 items-center rounded-[10px] bg-primary px-6 font-bold text-primary-foreground hover:bg-primary-hover"
            >
              {dict.checkout.viewOrders}
            </Link>
            <Link
              href={`/${locale}/products`}
              className="inline-flex h-12 items-center rounded-[10px] border border-border px-5 text-sm hover:border-primary hover:text-primary"
            >
              {dict.checkout.backToStore}
            </Link>
          </div>
        </div>
      </Envelope>
    </Container>
  );
}
