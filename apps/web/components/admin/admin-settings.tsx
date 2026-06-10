"use client";

// Admin "Settings" tab: live theme colors, homepage copy, contact info and the
// Enamad trust badge. Saving merge-patches /admin/settings; an empty field is
// sent as "" which clears the override back to the built-in default.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError, assetUrl } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type Settings = Partial<Record<string, string>>;

const TEXT_FIELDS = [
  "heroTitleFa",
  "heroTitleEn",
  "heroSubtitleFa",
  "heroSubtitleEn",
  "announcementFa",
  "announcementEn",
  "footerAboutFa",
  "footerAboutEn",
] as const;
const CONTACT_FIELDS = [
  "contactEmail",
  "contactPhone",
  "contactTelegram",
  "contactInstagram",
] as const;
const COLOR_FIELDS = [
  { key: "themePrimary", label: "primary" },
  { key: "themePrimaryDark", label: "primaryDark" },
  { key: "themeAccent", label: "accent" },
  { key: "themeAccentDark", label: "accentDark" },
] as const;

export function AdminSettings({ dict }: { dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.settings;
  const [form, setForm] = useState<Settings>({});
  const [hasBadge, setHasBadge] = useState(false);
  const [loading, setLoading] = useState(true);
  // Saving sends EVERY field ("" clears server-side), so it must stay disabled
  // until the current values actually loaded — otherwise one click could wipe
  // all stored overrides after a failed GET.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [badgeBump, setBadgeBump] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ settings: Settings; enamadBadge: boolean }>("/admin/settings", token)
      .then((res) => {
        setForm(res.settings);
        setHasBadge(res.enamadBadge);
        setLoaded(true);
      })
      .catch(() => setErr(dict.common.somethingWrong))
      .finally(() => setLoading(false));
  }, [token, dict.common.somethingWrong]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      // Send every known field; "" clears the override server-side.
      const patch: Record<string, string> = {};
      for (const key of [
        ...COLOR_FIELDS.map((c) => c.key),
        ...TEXT_FIELDS,
        ...CONTACT_FIELDS,
        "enamadLink",
      ]) {
        patch[key] = form[key] ?? "";
      }
      const res = await api.patch<{ settings: Settings }>("/admin/settings", patch, token);
      setForm(res.settings);
      setMsg(t.saved);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function uploadBadge(file: File) {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      await api.upload("/admin/settings/enamad", fd, token);
      setHasBadge(true);
      setBadgeBump((b) => b + 1);
      setMsg(t.saved);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function removeBadge() {
    if (!token) return;
    await api.del("/admin/settings/enamad", token).catch(() => {});
    setHasBadge(false);
  }

  if (loading) {
    return (
      <Container className="py-10">
        <Spinner />
      </Container>
    );
  }

  const field = (key: string, label: string) => (
    <label key={key} className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <Input value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
    </label>
  );

  return (
    <Container className="max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.intro}</p>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">{t.theme}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {COLOR_FIELDS.map((c) => (
            <label key={c.key} className="block">
              <span className="mb-1 block text-sm text-muted">{t[c.label]}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form[c.key] || "#0284c7"}
                  onChange={(e) => set(c.key, e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
                />
                <Input
                  value={form[c.key] ?? ""}
                  onChange={(e) => set(c.key, e.target.value)}
                  placeholder="#0284c7"
                  dir="ltr"
                  className="font-mono"
                />
              </div>
            </label>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">{t.copy}</h2>
        <div className="grid gap-4 sm:grid-cols-2">{TEXT_FIELDS.map((k) => field(k, t[k]))}</div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">{t.contact}</h2>
        <div className="grid gap-4 sm:grid-cols-2">{CONTACT_FIELDS.map((k) => field(k, t[k]))}</div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">{t.enamad}</h2>
        <p className="text-sm text-muted">{t.enamadHint}</p>
        <div className="flex flex-wrap items-center gap-4">
          {hasBadge ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${assetUrl("/site-assets/enamad")}?v=${badgeBump}`}
              alt="enamad"
              className="h-24 w-24 rounded-xl border border-border bg-white object-contain p-1"
            />
          ) : (
            <p className="text-sm text-muted">{t.enamadNone}</p>
          )}
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadBadge(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {hasBadge ? t.enamadReplace : t.enamadUpload}
            </Button>
            {hasBadge && (
              <Button variant="outline" size="sm" onClick={removeBadge}>
                {t.enamadRemove}
              </Button>
            )}
          </div>
        </div>
        {field("enamadLink", t.enamadLink)}
      </Card>

      {err && <p className="text-sm text-danger">{err}</p>}
      {msg && <p className="text-sm text-success">{msg}</p>}
      <Button onClick={save} disabled={busy || !loaded}>
        {t.save}
      </Button>
    </Container>
  );
}
