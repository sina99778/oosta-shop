"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import styles from "./storefront.module.css";
// Adapted from the study prompt in the owner's exported channel post 164.
const prompts = {
  fa: "متن مقاله را که در ادامه می‌فرستم، خلاصه کن. پرسش پژوهش، روش و یافته‌های اصلی را جدا بنویس. سپس ۱۰ سؤال مفهومی با پاسخ پیشنهادی بساز. هرجا اطلاعات کافی نیست، مشخص کن و چیزی از خودت اضافه نکن.",
  en: "Summarize the article I will provide. Separate the research question, method and main findings. Then create 10 conceptual questions with suggested answers. Flag missing information and do not invent details.",
};
export function PromptLab({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const textRef = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompts[locale]);
      setStatus("copied");
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
      setStatus("manual");
    }
  }
  return (
    <section className={styles.promptLab} id="prompt-lab" aria-labelledby="prompt-title">
      <div className={styles.promptIntro}>
        <span className={styles.eyebrow}>
          {fa ? "یک پرامپت، یک شروع" : "One prompt. One starting point."}
        </span>
        <h2 id="prompt-title">
          {fa ? (
            <>
              فقط نخوان.
              <br />
              امتحانش کن.
            </>
          ) : (
            <>
              Don’t just read.
              <br />
              Try it.
            </>
          )}
        </h2>
        <p>
          {fa
            ? "این بار یک مقاله را با سؤال‌های بهتر بخوان. پرامپت را کپی کن و همراه متن مقاله به ابزار دلخواهت بده."
            : "Read a paper with better questions. Copy this prompt and use it with your article in the tool of your choice."}
        </p>
      </div>
      <div className={styles.promptPaper}>
        <div className={styles.promptTop}>
          <span>{fa ? "پژوهش و یادگیری" : "Research & learning"}</span>
          <span dir="ltr">PROMPT / 001</span>
        </div>
        <label htmlFor="study-prompt" className={styles.promptLabel}>
          {fa ? "یک مقاله، چند زاویهٔ تازه" : "One paper, a few new perspectives"}
        </label>
        <textarea id="study-prompt" ref={textRef} readOnly value={prompts[locale]} rows={5} />
        <div className={styles.promptBottom}>
          <small>
            {fa ? "خروجی را با متن اصلی بررسی کن." : "Check the output against the original."}
          </small>
          <Button type="button" onClick={copy}>
            {status === "copied"
              ? fa
                ? "کپی شد ✓"
                : "Copied ✓"
              : fa
                ? "کپی پرامپت ⧉"
                : "Copy prompt ⧉"}
          </Button>
        </div>
        <p role="status" className={styles.copyStatus}>
          {status === "copied"
            ? fa
              ? "پرامپت در کلیپ‌بورد کپی شد."
              : "Prompt copied to clipboard."
            : status === "manual"
              ? fa
                ? "متن انتخاب شد؛ آن را به‌صورت دستی کپی کن."
                : "Text selected. Copy it manually."
              : ""}
        </p>
      </div>
    </section>
  );
}
