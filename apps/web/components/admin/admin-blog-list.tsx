"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { QueryError } from "@/components/query-error";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AdminBlogPost } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import styles from "./admin.module.css";
import blog from "./admin-blog.module.css";

export function AdminBlogList({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.blog;
  const fa = locale === "fa";
  const base = `/${locale}/admin/blog`;
  const { data, loading, error, refetch } = useApi<{ posts: AdminBlogPost[] }>(
    token ? "/admin/blog" : null,
    token ?? undefined,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | AdminBlogPost["status"]>("ALL");
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .toLocaleLowerCase(locale)
      .trim();
  const term = normalize(query);
  const posts = data?.posts.filter(
    (post) =>
      (filter === "ALL" || post.status === filter) &&
      normalize(`${post.title} ${post.slug}`).includes(term),
  );
  const number = new Intl.NumberFormat(locale);
  const tabs = [
    { id: "ALL", label: dict.common.all },
    { id: "DRAFT", label: t.draft },
    { id: "PUBLISHED", label: t.published },
  ] as const;

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <h1>{fa ? "مدیریت مقاله‌ها" : "Articles"}</h1>
        <Link href={base + "/new"} className={styles.primaryLink}>
          <span aria-hidden="true">+</span>
          {t.new}
        </Link>
      </header>
      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.filterTabs} role="group" aria-label={t.status}>
            {tabs.map(({ id, label }) => (
              <button
                type="button"
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
                {data && (
                  <span>
                    {number.format(
                      data.posts.filter((post) => id === "ALL" || post.status === id).length,
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
          <label className={styles.filterField}>
            <span>{fa ? "جست‌وجوی مقاله" : "Find an article"}</span>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={fa ? "عنوان یا نشانی مقاله" : "Title or slug"}
            />
          </label>
        </div>
        {loading ? (
          <div className="py-5" role="status">
            <Spinner />
            <span className="sr-only">{dict.common.loading}</span>
          </div>
        ) : error ? (
          <QueryError message={dict.common.somethingWrong} onRetry={refetch} />
        ) : !posts?.length ? (
          <p className={styles.empty}>
            {data?.posts.length
              ? fa
                ? "مقاله‌ای با این فیلتر پیدا نشد."
                : "No matching articles."
              : t.none}
          </p>
        ) : (
          <ul className={styles.orderList}>
            {posts.map((post) => {
              const published = post.status === "PUBLISHED";
              const date = published && post.publishedAt ? post.publishedAt : post.createdAt;
              return (
                <li key={post.id} className={blog.articleRow}>
                  <div>
                    <Link className={blog.articleTitle} href={base + "/" + post.id} dir="auto">
                      {post.title}
                    </Link>
                    <small>
                      <bdi>/{post.slug}</bdi>
                    </small>
                  </div>
                  <span className={styles.statusPill} data-tone={published ? "paid" : "neutral"}>
                    <span aria-hidden="true" />
                    {published ? t.published : t.draft}
                  </span>
                  <time dateTime={date}>{formatDate(date, locale)}</time>
                  <Link
                    className={styles.inlineLink}
                    href={base + "/" + post.id}
                    aria-label={`${dict.admin.manage} ${post.title}`}
                  >
                    {fa ? "ویرایش" : "Edit"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
