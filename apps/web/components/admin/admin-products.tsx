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
import type { Locale } from "@/lib/i18n";
import type { Category } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  type: string;
  isActive: boolean;
  planCount: number;
  inventoryCount: number;
  category: { name: string };
};

const selectClass = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm";

export function AdminProducts({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin;
  const [reload, setReload] = useState(0);
  const bust = `?_r=${reload}`;
  const products = useApi<{ products: AdminProduct[] }>(
    token ? `/admin/products${bust}` : null,
    token ?? undefined,
  );
  const categories = useApi<{ categories: Category[] }>(
    token ? `/admin/categories${bust}` : null,
    token ?? undefined,
  );

  const [pName, setPName] = useState("");
  const [pSlug, setPSlug] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pType, setPType] = useState("ACCOUNT");
  const [pCat, setPCat] = useState("");
  const [pErr, setPErr] = useState<string | null>(null);
  const [pBusy, setPBusy] = useState(false);

  const [cName, setCName] = useState("");
  const [cSlug, setCSlug] = useState("");
  const [cErr, setCErr] = useState<string | null>(null);
  const [cBusy, setCBusy] = useState(false);

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    setPBusy(true);
    setPErr(null);
    try {
      await api.post(
        "/admin/products",
        { name: pName, slug: pSlug, description: pDesc, type: pType, categoryId: pCat },
        token ?? undefined,
      );
      setPName("");
      setPSlug("");
      setPDesc("");
      setPCat("");
      setReload((r) => r + 1);
    } catch (err) {
      setPErr(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setPBusy(false);
    }
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    setCBusy(true);
    setCErr(null);
    try {
      await api.post("/admin/categories", { name: cName, slug: cSlug }, token ?? undefined);
      setCName("");
      setCSlug("");
      setReload((r) => r + 1);
    } catch (err) {
      setCErr(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setCBusy(false);
    }
  }

  return (
    <Container className="space-y-8 py-8">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">{t.newProduct}</h2>
          <form onSubmit={createProduct} className="space-y-2">
            <Input
              placeholder={t.name}
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              required
            />
            <Input
              placeholder={t.slug}
              value={pSlug}
              onChange={(e) => setPSlug(e.target.value)}
              required
            />
            <Input
              placeholder={t.description}
              value={pDesc}
              onChange={(e) => setPDesc(e.target.value)}
              required
            />
            <select
              value={pType}
              onChange={(e) => setPType(e.target.value)}
              className={selectClass}
            >
              <option value="ACCOUNT">ACCOUNT</option>
              <option value="LICENSE">LICENSE</option>
              <option value="GIFTCARD">GIFTCARD</option>
            </select>
            <select
              value={pCat}
              onChange={(e) => setPCat(e.target.value)}
              required
              className={selectClass}
            >
              <option value="" disabled>
                {t.category}
              </option>
              {categories.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {pErr && <p className="text-sm text-danger">{pErr}</p>}
            <Button type="submit" className="w-full" disabled={pBusy}>
              {pBusy ? t.saving : t.create}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">{t.newCategory}</h2>
          <form onSubmit={createCategory} className="space-y-2">
            <Input
              placeholder={t.name}
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              required
            />
            <Input
              placeholder={t.slug}
              value={cSlug}
              onChange={(e) => setCSlug(e.target.value)}
              required
            />
            {cErr && <p className="text-sm text-danger">{cErr}</p>}
            <Button type="submit" className="w-full" disabled={cBusy}>
              {cBusy ? t.saving : t.create}
            </Button>
          </form>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">{t.products}</h2>
        {products.loading ? (
          <Spinner className="size-6" />
        ) : (
          <div className="space-y-2">
            {products.data?.products.map((p) => (
              <Card key={p.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted">
                    {p.category.name} · {p.type} · {p.planCount} {t.plans} · {p.inventoryCount}{" "}
                    {t.available}
                  </p>
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
      </div>
    </Container>
  );
}
