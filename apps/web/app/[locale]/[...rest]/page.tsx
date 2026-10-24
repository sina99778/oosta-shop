import { notFound } from "next/navigation";

// Any address under a locale that no route claims gets the branded 404
// (app/[locale]/not-found.tsx) inside the normal header and footer.
export default function UnknownPage() {
  notFound();
}
