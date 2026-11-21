import Link from "next/link";
import { Container } from "@/components/ui/container";

export function RelatedContentLinks({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  if (!links.length) return null;

  return (
    <Container className="pb-12">
      <section className="border-t border-border pt-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <ul className="mt-2 flex flex-wrap gap-x-6">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                prefetch={false}
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
