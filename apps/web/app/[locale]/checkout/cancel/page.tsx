import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";

export default async function CheckoutCancelPage({
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
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger/15 text-2xl text-danger">
          ✕
        </div>
        <h1 className="text-xl font-bold">{dict.checkout.failTitle}</h1>
        <p className="mt-2 text-muted">{dict.checkout.failBody}</p>
        <div className="mt-6 flex justify-center">
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
