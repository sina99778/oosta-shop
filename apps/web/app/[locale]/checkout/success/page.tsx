import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";

export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);

  return (
    <Container className="flex justify-center py-20">
      <Card className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-success/15 text-2xl text-success">
          ✓
        </div>
        <h1 className="text-xl font-bold">{dict.checkout.successTitle}</h1>
        <p className="mt-2 text-muted">{dict.checkout.successBody}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {dict.checkout.viewOrders}
          </Link>
          <Link
            href={`/${locale}/products`}
            className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm hover:bg-surface"
          >
            {dict.checkout.backToStore}
          </Link>
        </div>
      </Card>
    </Container>
  );
}
