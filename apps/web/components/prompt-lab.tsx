"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { buildPrompt, promptExample, promptOptions, type PromptSelection } from "@/lib/prompt-lab";
import styles from "./home.module.css";

const copy = {
  fa: {
    title: "پرامپتت را دقیق‌تر بنویس",
    body: "درخواستت را بنویس و برای ایمیل، کدنویسی، تحقیق یا ساخت تصویر یک پرامپت آمادهٔ کپی بگیر.",
    private: "پردازش متن در همین مرورگر انجام می‌شود.",
    request: "چی می‌خواهی انجام بدهی؟",
    kind: "نوع کار",
    auto: "تشخیص خودکار",
    context: "جزئیات بیشتر (اختیاری)",
    contextHint: "مثلاً مخاطب، لحن، ابزار یا محدودیت",
    example: "گذاشتن نمونه",
    output: "پرامپت آماده",
    empty: "درخواستت را بنویس یا یک نمونه بگذار تا پرامپت اینجا ساخته شود.",
    copy: "کپی پرامپت",
    copied: "پرامپت کپی شد.",
    manual: "متن انتخاب شد؛ می‌توانی آن را دستی کپی کنی.",
  },
  en: {
    title: "Write a more precise prompt",
    body: "Describe your task and get a prompt you can copy for writing, coding, research, or image generation.",
    private: "Your text is processed in this browser.",
    request: "What do you want to do?",
    kind: "Task type",
    auto: "Detect automatically",
    context: "More detail (optional)",
    contextHint: "Audience, tone, tools, or constraints",
    example: "Use an example",
    output: "Your prompt",
    empty: "Write a request or use an example to build a prompt here.",
    copy: "Copy prompt",
    copied: "Prompt copied.",
    manual: "The text is selected. You can copy it manually.",
  },
} as const;

export function PromptLab({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [request, setRequest] = useState("");
  const [context, setContext] = useState("");
  const [selection, setSelection] = useState<PromptSelection>("auto");
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const outputRef = useRef<HTMLDListElement>(null);
  const example = promptExample(locale, selection);
  const prompt = buildPrompt(request, context, selection, locale);

  async function copyPrompt() {
    if (!prompt) return;
    const text = prompt.entries
      .map(({ label, value }) => `${label}:${value.includes("\n") ? "\n" : " "}${value}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      const selection = window.getSelection();
      if (outputRef.current && selection) {
        const range = document.createRange();
        range.selectNodeContents(outputRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
        setStatus("manual");
      }
    }
  }

  return (
    <section
      className={`${styles.wrap} ${styles.lab}`}
      id="prompt-lab"
      aria-labelledby="prompt-title"
    >
      <div className={styles.labCopy}>
        <h2 id="prompt-title">{t.title}</h2>
        <p>{t.body}</p>
        <small>{t.private}</small>
      </div>
      <div className={styles.labMock}>
        <div className={styles.labBar}>
          <label htmlFor="lab-request">{t.request}</label>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => {
              setRequest(example);
              setStatus("idle");
              document.getElementById("lab-request")?.focus();
            }}
          >
            {t.example}
          </Button>
        </div>
        <textarea
          id="lab-request"
          rows={3}
          maxLength={1200}
          dir="auto"
          placeholder={example}
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
            setStatus("idle");
          }}
        />
        <div className={styles.labOptions}>
          <label>
            {t.kind}
            <select
              id="lab-kind"
              value={selection}
              onChange={(event) => {
                setSelection(event.target.value as PromptSelection);
                setStatus("idle");
              }}
            >
              <option value="auto">{t.auto}</option>
              {promptOptions(locale).map(({ kind, label }) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.context}
            <input
              value={context}
              maxLength={300}
              dir="auto"
              placeholder={t.contextHint}
              onChange={(event) => {
                setContext(event.target.value);
                setStatus("idle");
              }}
            />
          </label>
        </div>
        <div className={styles.labActions}>
          <div>
            <h3>{t.output}</h3>
            {prompt && selection === "auto" && (
              <small className={styles.labNotice}>{prompt.label}</small>
            )}
          </div>
          <Button type="button" onClick={copyPrompt} disabled={!prompt}>
            {t.copy}
          </Button>
        </div>
        {prompt ? (
          <dl ref={outputRef} className={styles.labOut}>
            {prompt.entries.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd dir="auto">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={styles.labEmpty}>{t.empty}</p>
        )}
        <p role="status" className={styles.labNotice}>
          {status === "copied" ? t.copied : status === "manual" ? t.manual : ""}
        </p>
      </div>
    </section>
  );
}
