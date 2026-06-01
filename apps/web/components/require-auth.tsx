"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";

// Client-side route guard. Redirects unauthenticated users to login (preserving the
// intended destination via ?next). Pass `role` to additionally require a specific role.
export function RequireAuth({
  locale,
  role,
  children,
}: {
  locale: Locale;
  role?: "ADMIN";
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (role && user.role !== role) {
      router.replace(`/${locale}`);
    }
  }, [loading, user, role, router, locale, pathname]);

  if (loading || !user || (role && user.role !== role)) {
    return (
      <Container className="py-24 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }

  return <>{children}</>;
}
