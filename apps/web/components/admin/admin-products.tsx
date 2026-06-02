"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { assetUrl } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  type: string;
  isActive: boolean;
  hasImage?: boolean;
  image?: string | null;
  planCount: number;
  inventoryCount: number;
  category: { name: string };
};

export function AdminProducts({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin;
  const [reload, setReload] = useState(0);
  const bust = `?_r=${reload}`;
  const products = useApi<{ products: AdminProduct[] }>(
    token ? `/admin/products${bust}` : null,
    token ?? undefined,
  );

  const [showCat, setShowCat] = useState(false);
  const [cName, setCName] = useState("");
  const [cSlug, setCSlug] = useState("");
  const [cErr, setCErr] = useState<string | null>(null);
  const [cBusy, setCBusy] = useState(false);

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    setCBusy(true);
    setCErr(null);
    try {
      await api.post("/admin/categories", { name: cName, slug: cSlug }, token ?? undefined);
      setCName("");
      setCSlug("");
      setShowCat(false);
      setReload((r) => r + 1);
    } catch (err) {
      setCErr(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setCBusy(false);
    }
  }

  return (
    <Container className="space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.products}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCat((s) => !s)}>
            + {t.newCategory}
          </Button>
          <Link href={`/${locale}/admin/products/new`}>
            <Button size="sm">+ {t.newProduct}</Button>
          </Link>
        </div>
      </div>

      {showCat && (
        <Card>
          <h3 className="mb-3 font-semibold">{t.newCategory}</h3>
          <form onSubmit={createCategory} className="flex flex-wrap items-end gap-2">
            <Input
              placeholder={t.name}
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              required
              className="min-w-40 flex-1"
            />
            <Input
              placeholder={t.slug}
              value={cSlug}
              onChange={(e) => setCSlug(e.target.value)}
              required
              dir="ltr"
              className="min-w-40 flex-1"
            />
            <Button type="submit" disabled={cBusy}>
              {cBusy ? t.saving : t.create}
            </Button>
          </form>
          {cErr && <p className="mt-2 text-sm text-danger">{cErr}</p>}
        </Card>
      )}

      {products.loading ? (
        <Spinner className="size-6" />
      ) : (
        <div className="space-y-2">
          {products.data?.products.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                  {p.hasImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${assetUrl(`/products/${p.id}/image`)}?v=${reload}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm font-bold text-muted/50">
                      {p.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted">
                    {p.category.name} · {p.type} · {p.planCount} {t.plans} · {p.inventoryCount}{" "}
                    {t.available}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={p.isActive ? "success" : "muted"}>
                  {p.isActive ? t.active : t.inactive}
                </Badge>
                <Link href={`/${locale}/admin/products/${p.id}`}>
                  <Button size="sm" variant="outline">
                    {t.manage}
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
