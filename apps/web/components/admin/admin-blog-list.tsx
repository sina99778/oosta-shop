"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminBlogPost } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function AdminBlogList({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.blog;
  const { data, loading } = useApi<{ posts: AdminBlogPost[] }>(
    token ? "/admin/blog" : null,
    token ?? undefined,
  );

  return (
    <Container className="space-y-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <Link href={`/${locale}/admin/blog/new`}>
          <Button size="sm">+ {t.new}</Button>
        </Link>
      </div>

      {loading ? (
        <Spinner className="size-6" />
      ) : !data || data.posts.length === 0 ? (
        <p className="text-muted">{t.none}</p>
      ) : (
        <div className="space-y-2">
          {data.posts.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="font-mono text-xs text-muted" dir="ltr">
                  /{p.slug}
                </p>
                <p className="text-xs text-muted">
                  {p.publishedAt
                    ? formatDate(p.publishedAt, locale)
                    : formatDate(p.createdAt, locale)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={p.status === "PUBLISHED" ? "success" : "muted"}>
                  {p.status === "PUBLISHED" ? t.published : t.draft}
                </Badge>
                <Link href={`/${locale}/admin/blog/${p.id}`}>
                  <Button size="sm" variant="outline">
                    {dict.admin.manage}
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}
