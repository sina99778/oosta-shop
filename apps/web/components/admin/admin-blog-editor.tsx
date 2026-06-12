"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError, assetUrl } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { AdminBlogPostDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

const selectClass = "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AdminBlogEditor({
  locale,
  postId,
  dict,
}: {
  locale: Locale;
  postId?: string;
  dict: Dictionary;
}) {
  const { token } = useAuth();
  const t = dict.admin.blog;
  const router = useRouter();
  const [reload, setReload] = useState(0);
  const { data, loading } = useApi<{ post: AdminBlogPostDetail }>(
    postId && token ? `/admin/blog/${postId}?_r=${reload}` : null,
    token ?? undefined,
  );

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    if (data?.post) {
      const p = data.post;
      queueMicrotask(() => {
        setTitle(p.title);
        setSlug(p.slug);
        setSlugTouched(true);
        setExcerpt(p.excerpt ?? "");
        setContent(p.content);
        setStatus(p.status);
      });
    }
  }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = { title, slug, excerpt: excerpt.trim() || null, content, status };
      if (postId) {
        await api.patch(`/admin/blog/${postId}`, payload, token);
        setMsg(t.saved);
        setReload((r) => r + 1);
      } else {
        const res = await api.post<{ id: string }>("/admin/blog", payload, token);
        router.push(`/${locale}/admin/blog/${res.id}`);
      }
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover() {
    if (!coverFile || !postId || !token) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", coverFile);
      await api.upload(`/admin/blog/${postId}/cover`, form, token);
      setCoverFile(null);
      setReload((r) => r + 1);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia(file: File) {
    if (!token) return;
    setBusy(true);
    try {
      const res = await api.upload<{ url: string }>(
        "/admin/blog/media",
        (() => {
          const f = new FormData();
          f.append("image", file);
          return f;
        })(),
        token,
      );
      const full = assetUrl(res.url);
      setMediaUrl(full);
      try {
        await navigator.clipboard.writeText(`![image](${full})`);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!postId || !token) return;
    await api.del(`/admin/blog/${postId}`, token).catch(() => {});
    router.push(`/${locale}/admin/blog`);
  }

  if (postId && loading) {
    return (
      <Container className="py-20 text-center">
        <Spinner className="size-6" />
      </Container>
    );
  }

  const coverUrl = data?.post.hasCover ? `${assetUrl(`/blog-cover/${postId}`)}?v=${reload}` : null;

  return (
    <Container className="max-w-3xl space-y-6 py-8">
      <Link href={`/${locale}/admin/blog`} className="text-sm text-muted hover:text-foreground">
        ← {t.title}
      </Link>

      <form onSubmit={save} className="space-y-4">
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-muted">{t.postTitle}</label>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">{t.slug}</label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                required
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">{t.excerpt}</label>
            <Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">{t.content}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              required
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-muted">{t.contentHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted">{t.status}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED")}
                className={selectClass}
              >
                <option value="DRAFT">{t.draft}</option>
                <option value="PUBLISHED">{t.published}</option>
              </select>
            </div>
          </div>
          {msg && <p className="text-sm text-muted">{msg}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : postId ? t.save : t.create}
            </Button>
            {postId && (
              <Button type="button" variant="outline" onClick={remove} disabled={busy}>
                {t.delete}
              </Button>
            )}
          </div>
        </Card>
      </form>

      {/* Media — only after the post exists */}
      {postId ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-2">
            <h2 className="font-semibold">{t.cover}</h2>
            <div className="aspect-[16/9] overflow-hidden rounded-lg border border-border bg-surface">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm"
            />
            <Button size="sm" variant="outline" onClick={uploadCover} disabled={!coverFile || busy}>
              {data?.post.hasCover ? t.changeCover : t.uploadCover}
            </Button>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-semibold">{t.uploadMedia}</h2>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadMedia(f);
              }}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:text-white"
            />
            {mediaUrl && (
              <>
                <p className="text-sm text-success">{t.mediaCopied}</p>
                <code
                  dir="ltr"
                  className="block overflow-x-auto rounded bg-surface px-2 py-1 text-xs"
                >
                  ![image]({mediaUrl})
                </code>
              </>
            )}
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted">{t.saveFirst}</p>
      )}
    </Container>
  );
}
