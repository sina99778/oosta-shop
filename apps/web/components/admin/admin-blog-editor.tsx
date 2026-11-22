"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError, assetUrl } from "@/lib/api";
import { QueryError } from "@/components/query-error";
import { Markdown } from "@/components/markdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { AdminBlogPostDetail } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./admin.module.css";
import blog from "./admin-blog.module.css";

const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-$/, "");

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
  const { data, loading, error, refetch } = useApi<{ post: AdminBlogPostDetail }>(
    postId && token ? `/admin/blog/${postId}` : null,
    token ?? undefined,
  );
  if (postId && (loading || data?.post.id !== postId))
    return (
      <div className={styles.dashboard}>
        <Link href={`/${locale}/admin/blog`} className={styles.inlineLink}>
          {dict.admin.blog.title}
        </Link>
        <section className={styles.panel}>
          {error ? (
            <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
          ) : (
            <div role="status">
              <Spinner />
              <span className="sr-only">{dict.common.loading}</span>
            </div>
          )}
        </section>
      </div>
    );
  return (
    <Editor key={postId ?? "new"} locale={locale} dict={dict} token={token} post={data?.post} />
  );
}

function Editor({
  locale,
  dict,
  token,
  post,
}: {
  locale: Locale;
  dict: Dictionary;
  token: string | null;
  post?: AdminBlogPostDetail;
}) {
  const fa = locale === "fa";
  const t = dict.admin.blog;
  const router = useRouter();
  const base = `/${locale}/admin/blog`;
  const endpoint = post ? `/admin/blog/${post.id}` : "/admin/blog";
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!post);
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [coverAlt, setCoverAlt] = useState(post?.coverAlt ?? "");
  const [tag, setTag] = useState(post?.tag ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [status, setStatus] = useState<AdminBlogPostDetail["status"]>(post?.status ?? "DRAFT");
  const [storedPublicSlug, setStoredPublicSlug] = useState(
    post?.status === "PUBLISHED" ? post.slug : "",
  );
  const [coverVersion, setCoverVersion] = useState(post?.hasCover ? 0 : null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "alert" | "status"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lock = useRef(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const number = new Intl.NumberFormat(locale);

  async function run(action: (auth: string) => Promise<void>) {
    if (!token || lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await action(token);
    } catch (error) {
      setNotice({
        type: "alert",
        text: error instanceof ApiError ? error.message : dict.common.somethingWrong,
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      setNotice({
        type: "alert",
        text: fa ? "عنوان و متن مقاله را وارد کن." : "Enter a title and article text.",
      });
      return;
    }
    const payload = {
      title,
      slug,
      excerpt: excerpt.trim() || null,
      coverAlt: coverAlt.trim() || null,
      tag: tag.trim() || null,
      content,
      status,
    };
    void run(async (auth) => {
      if (post) {
        const result = await api.patch<{ post: AdminBlogPostDetail }>(endpoint, payload, auth);
        setStoredPublicSlug(result.post.status === "PUBLISHED" ? result.post.slug : "");
        setNotice({ type: "status", text: t.saved });
      } else {
        const result = await api.post<{ id: string }>(endpoint, payload, auth);
        router.replace(base + "/" + result.id);
      }
    });
  }

  function upload(file: File, cover: boolean) {
    if (!post) return;
    if (!imageTypes.includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      setNotice({
        type: "alert",
        text: fa
          ? "تصویر JPG، PNG، WebP یا GIF با حجم حداکثر ۵ مگابایت انتخاب کن."
          : "Choose a JPG, PNG, WebP or GIF image up to 5 MB.",
      });
      return;
    }
    void run(async (auth) => {
      const form = new FormData();
      form.append("image", file);
      if (cover) {
        await api.upload(endpoint + "/cover", form, auth);
        setCoverVersion(Date.now());
        setCoverFile(null);
        if (coverInput.current) coverInput.current.value = "";
        setNotice({ type: "status", text: fa ? "تصویر جلد ذخیره شد." : "Cover image saved." });
      } else {
        const result = await api.upload<{ url: string }>("/admin/blog/media", form, auth);
        const url = assetUrl(result.url);
        setContent((text) =>
          text
            ? text.trimEnd() + "\n\n" + `![${fa ? "تصویر مقاله" : "Article image"}](${url})\n`
            : `![${fa ? "تصویر مقاله" : "Article image"}](${url})\n`,
        );
        setPreview(false);
        setNotice({
          type: "status",
          text: fa
            ? "تصویر به انتهای متن اضافه شد. برای ثبت تغییرات، مقاله را ذخیره کن."
            : "Image added to the end of the article. Save the article to keep it.",
        });
      }
    });
  }

  function format(prefix: string, suffix = "") {
    const field = editor.current;
    if (!field) return;
    const from = field.selectionStart;
    const to = field.selectionEnd;
    const current = field.value;
    const selected = current.slice(from, to);
    const addition = prefix + selected + suffix;
    if (current.length + prefix.length + suffix.length > 100000) return;
    setContent(current.slice(0, from) + addition + current.slice(to));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(from + prefix.length, to + prefix.length);
    });
  }

  const cover =
    post && coverVersion !== null ? assetUrl(`/blog-cover/${post.id}?v=${coverVersion}`) : null;
  const accept = imageTypes.join(",");
  const count = content.trim() ? content.trim().split(/\s+/u).length : 0;

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <div>
          <Link href={base} className={styles.inlineLink}>
            {fa ? "مقاله‌ها" : "Articles"}
          </Link>
          <h1>{post ? (fa ? "ویرایش مقاله" : "Edit article") : t.new}</h1>
        </div>
        {storedPublicSlug && (
          <Link
            className={styles.storeLink}
            href={`/${locale}/blog/${storedPublicSlug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {fa ? "مشاهده مقاله" : "View article"} <span aria-hidden="true">↗</span>
          </Link>
        )}
      </header>

      <form onSubmit={save} className={blog.editorGrid}>
        <section className={styles.panel}>
          <div className={blog.fields}>
            <label>
              <span>{t.postTitle}</span>
              <Input
                value={title}
                required
                maxLength={200}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </label>
            <label>
              <span>{t.excerpt}</span>
              <textarea
                value={excerpt}
                maxLength={500}
                rows={2}
                onChange={(e) => setExcerpt(e.target.value)}
              />
            </label>
            <label>
              <span>
                {fa ? "برچسب موضوع (مثلاً مقایسه یا راهنمای خرید)" : "Topic tag (e.g. Comparison)"}
              </span>
              <input
                value={tag}
                maxLength={40}
                list="journal-tags"
                onChange={(e) => setTag(e.target.value)}
              />
              <datalist id="journal-tags">
                {(fa
                  ? ["مقایسه", "راهنمای خرید", "پرامپت", "آموزش", "امنیت"]
                  : ["Comparison", "Buying guide", "Prompts", "Tutorial", "Security"]
                ).map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <label>
              <span>{t.coverAlt}</span>
              <input
                value={coverAlt}
                maxLength={200}
                placeholder={t.coverAltHint}
                onChange={(e) => setCoverAlt(e.target.value)}
              />
            </label>
          </div>
          <div className={blog.editorBar}>
            <h2>{t.content}</h2>
            <div
              role="group"
              aria-label={fa ? "حالت نمایش مقاله" : "Article view"}
              className={styles.filterTabs}
            >
              <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
                {fa ? "نوشتن" : "Write"}
              </button>
              <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
                {fa ? "پیش‌نمایش" : "Preview"}
              </button>
            </div>
          </div>
          {!preview && (
            <div
              className={blog.formatBar}
              aria-label={fa ? "قالب متن" : "Text formatting"}
              role="group"
            >
              <button type="button" onClick={() => format("**", "**")}>
                {fa ? "پررنگ" : "Bold"}
              </button>
              <button type="button" onClick={() => format("\n## ")}>
                {fa ? "تیتر" : "Heading"}
              </button>
              <button type="button" onClick={() => format("\n- ")}>
                {fa ? "فهرست" : "List"}
              </button>
            </div>
          )}
          <textarea
            ref={editor}
            className={blog.body}
            aria-label={t.content}
            hidden={preview}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={100000}
            rows={18}
          />
          {preview && (
            <div className={blog.preview}>
              {content.trim() ? (
                <Markdown text={content} preview />
              ) : (
                <p>
                  {fa
                    ? "متن مقاله را بنویس تا اینجا نمایش داده شود."
                    : "Write something to see it here."}
                </p>
              )}
            </div>
          )}
          <p className={blog.wordCount}>
            {number.format(count)} {fa ? "واژه" : "words"}
          </p>
        </section>

        <aside className={blog.editorRail}>
          <section className={styles.panel}>
            <h2>{fa ? "انتشار" : "Publishing"}</h2>
            <div className={blog.fields}>
              <label>
                <span>{t.slug}</span>
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                  required
                  maxLength={120}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  dir="ltr"
                />
                <small>
                  {fa
                    ? "حروف کوچک انگلیسی، عدد و خط تیره"
                    : "Lowercase English letters, numbers and hyphens"}
                </small>
              </label>
              <label>
                <span>{t.status}</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AdminBlogPostDetail["status"])}
                >
                  <option value="DRAFT">{t.draft}</option>
                  <option value="PUBLISHED">{t.published}</option>
                </select>
              </label>
            </div>
            <button type="submit" className={`${styles.primaryLink} ${blog.save}`} disabled={busy}>
              {busy ? (
                <Spinner />
              ) : status === "DRAFT" ? (
                fa ? (
                  "ذخیره پیش‌نویس"
                ) : (
                  "Save draft"
                )
              ) : storedPublicSlug ? (
                t.save
              ) : fa ? (
                "انتشار مقاله"
              ) : (
                "Publish article"
              )}
            </button>
            {notice && (
              <p role={notice.type} className={blog.notice}>
                {notice.text}
              </p>
            )}
          </section>

          <section className={styles.panel}>
            <h2>{t.cover}</h2>
            {post ? (
              <>
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className={blog.cover} />
                )}
                <label className={blog.fileField}>
                  <span>{cover ? t.changeCover : t.uploadCover}</span>
                  <input
                    ref={coverInput}
                    type="file"
                    accept={accept}
                    disabled={busy}
                    onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <Button
                  variant="outline"
                  type="button"
                  disabled={!coverFile || busy}
                  onClick={() => {
                    if (coverFile) upload(coverFile, true);
                  }}
                >
                  {fa ? "ذخیره تصویر جلد" : "Save cover image"}
                </Button>
                <label className={blog.fileField}>
                  <span>{fa ? "درج تصویر در متن" : "Insert image in article"}</span>
                  <input
                    type="file"
                    accept={accept}
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload(file, false);
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            ) : (
              <p className={styles.empty}>{t.saveFirst}</p>
            )}
          </section>

          {post && (
            <section className={styles.panel}>
              {confirmDelete ? (
                <>
                  <p className={blog.notice}>
                    {fa ? "این مقاله برای همیشه حذف شود؟" : "Delete this article permanently?"}
                  </p>
                  <div className={blog.formatBar}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async (auth) => {
                          await api.del(endpoint, auth);
                          router.replace(base);
                        })
                      }
                    >
                      {t.delete}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                      {fa ? "انصراف" : "Cancel"}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className={blog.deleteButton}
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  {t.delete}
                </button>
              )}
            </section>
          )}
        </aside>
      </form>
    </div>
  );
}
