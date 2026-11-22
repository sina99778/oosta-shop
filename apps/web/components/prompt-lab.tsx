"use client";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import styles from "./home.module.css";

// The lab never calls a model: it shows, in the browser, how naming a role, a goal,
// a tone and an output format turns a vague request into a clearer prompt.
const copy = {
  fa: {
    eyebrow: "تمرین، نه فقط تئوری",
    title: ["پرامپتت را بنویس،", "نسخهٔ بهترش را ببین"],
    body: "آزمایشگاه پرامپت اوستا نشان می‌دهد چطور با مشخص‌کردن نقش، هدف، لحن و قالب خروجی، جواب دقیق‌تری از هر دستیار هوش مصنوعی بگیری.",
    bar: "آزمایشگاه پرامپت",
    yours: "پرامپت تو",
    better: "↓ نسخهٔ بهتر",
    example: "یه ایمیل بنویس که جلسه رو عقب بندازم",
    role: "نقش:",
    goal: "هدف:",
    tone: "لحن:",
    output: "خروجی:",
    roleText: "دستیار باتجربه و دقیق برای همین کار",
    toneText: "روشن، مؤدبانه و کوتاه",
    outputText:
      "پاسخ ساختارمند، حداکثر ۱۵۰ کلمه؛ اگر اطلاعات کافی نیست، اول سؤال‌های لازم را بپرس.",
    hint: "خروجی را با نیاز واقعی‌ات بسنج.",
    copy: "کپی نسخهٔ بهتر",
    copied: "کپی شد ✓",
    copiedStatus: "پرامپت بهتر در کلیپ‌بورد کپی شد.",
    manual: "متن انتخاب شد؛ آن را به‌صورت دستی کپی کن.",
    empty: "اول درخواستت را بنویس.",
  },
  en: {
    eyebrow: "Practice, not just theory",
    title: ["Write your prompt,", "see a sharper version"],
    body: "Oosta’s prompt lab shows how naming a role, a goal, a tone and an output format gets a more precise answer from any AI assistant.",
    bar: "Prompt lab",
    yours: "Your prompt",
    better: "↓ Sharper version",
    example: "Write an email to postpone a meeting",
    role: "Role:",
    goal: "Goal:",
    tone: "Tone:",
    output: "Output:",
    roleText: "An experienced, careful assistant for this exact task",
    toneText: "Clear, polite and brief",
    outputText:
      "A structured answer under 150 words; ask the questions you need first if details are missing.",
    hint: "Check the output against what you really need.",
    copy: "Copy sharper prompt",
    copied: "Copied ✓",
    copiedStatus: "Sharper prompt copied to clipboard.",
    manual: "Text selected. Copy it manually.",
    empty: "Write your request first.",
  },
} as const;

export function PromptLab({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [request, setRequest] = useState<string>(t.example);
  const [status, setStatus] = useState<"idle" | "copied" | "manual" | "empty">("idle");
  const outputRef = useRef<HTMLDListElement>(null);
  const goal = request.trim().replace(/\s+/g, " ").slice(0, 400);
  const lines = useMemo(
    () =>
      [
        [t.role, t.roleText],
        [t.goal, goal],
        [t.tone, t.toneText],
        [t.output, t.outputText],
      ] as const,
    [goal, t],
  );

  async function copyPrompt() {
    if (!goal) {
      setStatus("empty");
      return;
    }
    const text = lines.map(([label, value]) => `${label} ${value}`).join("\n");
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
      }
      setStatus("manual");
    }
  }

  return (
    <section
      className={`${styles.wrap} ${styles.lab}`}
      id="prompt-lab"
      aria-labelledby="prompt-title"
    >
      <div className={styles.labMock}>
        <div className={styles.labBar}>
          <span>{t.bar}</span>
          <i aria-hidden="true">
            <b />
          </i>
        </div>
        <label htmlFor="lab-request">{t.yours}</label>
        <textarea
          id="lab-request"
          rows={2}
          maxLength={400}
          dir="auto"
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
            setStatus("idle");
          }}
        />
        <span className={styles.labArrow} aria-hidden="true">
          {t.better}
        </span>
        <dl ref={outputRef} className={styles.labOut} aria-live="polite">
          {lines.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd dir="auto">{value || "…"}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.labActions}>
          <small>{t.hint}</small>
          <Button type="button" onClick={copyPrompt}>
            {status === "copied" ? t.copied : t.copy}
          </Button>
        </div>
        <p role="status" className="sr-only">
          {status === "copied"
            ? t.copiedStatus
            : status === "manual"
              ? t.manual
              : status === "empty"
                ? t.empty
                : ""}
        </p>
      </div>
      <div className={styles.labCopy}>
        <span className={styles.eyebrow}>{t.eyebrow}</span>
        <h2 id="prompt-title">
          {t.title[0]}
          <br />
          {t.title[1]}
        </h2>
        <p>{t.body}</p>
        <Button
          type="button"
          size="lg"
          onClick={() => document.getElementById("lab-request")?.focus()}
        >
          {locale === "fa" ? "امتحان کن" : "Try it"}
        </Button>
      </div>
    </section>
  );
}
