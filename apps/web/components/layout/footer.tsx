import { Container } from "@/components/ui/container";

type FooterDict = { tagline: string; rights: string };

export function Footer({ dict }: { dict: FooterDict }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border">
      <Container className="flex flex-col gap-1 py-8 text-sm text-muted">
        <p className="font-semibold text-foreground">oostaAI</p>
        <p>{dict.tagline}</p>
        <p>
          © {year} oostaAI. {dict.rights}
        </p>
      </Container>
    </footer>
  );
}
