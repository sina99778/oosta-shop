import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "../../dictionaries";
import { isLocale } from "@/lib/i18n";
import { Container } from "@/components/ui/container";
import { XIcon } from "@/components/checkout-ui";
import styles from "@/components/checkout.module.css";

export default async function CheckoutCancelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const fa = locale === "fa";

  return (
    <Container className={styles.page}>
      <section className={styles.result} data-tone="danger">
        <span className={styles.resultIcon} aria-hidden="true">
          <XIcon size={34} />
        </span>
        <h1>{dict.checkout.failTitle}</h1>
        <p>{dict.checkout.failBody}</p>
        <div className={styles.resultActions}>
          <Link
            href={`/${locale}/cart`}
            className="oosta-button inline-flex min-h-11 items-center px-5"
          >
            {fa ? "تلاش دوباره از سبد خرید" : "Try again from cart"}
          </Link>
          <Link
            href={`/${locale}/products`}
            className="oosta-button inline-flex min-h-11 items-center px-5"
            data-button-variant="outline"
          >
            {dict.checkout.backToStore}
          </Link>
        </div>
      </section>
    </Container>
  );
}
