import { notFound } from "next/navigation";

// Unknown storefront paths render the branded [locale]/not-found page with a 404 status.
export default function MissingPage(): never {
  notFound();
}
