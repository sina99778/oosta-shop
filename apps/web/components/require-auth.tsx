"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
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
  const { user, loading, sessionError, retrySession } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || sessionError) return;
    if (!user) {
      router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (role && user.role !== role) {
      router.replace(`/${locale}`);
    }
  }, [loading, sessionError, user, role, router, locale, pathname]);

  if (sessionError)
    return (
      <Container className="space-y-4 py-20 text-center">
        <p role="alert">
          {locale === "fa"
            ? "بررسی حساب موقتاً ممکن نیست. نشست شما حفظ شده است."
            : "Unable to check your account. Your session has been kept."}
        </p>
        <Button onClick={retrySession}>{locale === "fa" ? "تلاش دوباره" : "Try again"}</Button>
      </Container>
    );

  if (loading || !user || (role && user.role !== role)) {
    return (
      <Container className="py-24 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }

  return <>{children}</>;
}
