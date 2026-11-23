import type { Locale } from "./i18n";

const kinds = ["email", "writing", "code", "research", "image", "general"] as const;
type PromptKind = (typeof kinds)[number];
export type PromptSelection = PromptKind | "auto";

type Template = { label: string; example: string; role: string; guidance: string; output: string };

const templates: Record<Locale, Record<PromptKind, Template>> = {
  fa: {
    email: {
      label: "ایمیل و پیام",
      example: "یه ایمیل بنویس که جلسهٔ چهارشنبه رو عقب بندازم",
      role: "نویسندهٔ مکاتبات متناسب با مخاطب و موقعیت",
      guidance:
        "هدف پیام را زود روشن کن و اقدام بعدی مخاطب را مشخص بنویس. لحن خواسته‌شده را رعایت کن. زمان، نام یا دلیلی را که نداده‌ام اختراع نکن.",
      output: "یک متن آمادهٔ ارسال. اگر ایمیل خواسته‌ام، موضوع ایمیل را هم بنویس.",
    },
    writing: {
      label: "تولید محتوا",
      example: "برای معرفی یک دورهٔ فتوشاپ کپشن اینستاگرام بنویس",
      role: "ویراستار و نویسندهٔ محتوا برای مخاطب و کانال انتشار مشخص",
      guidance:
        "متن را با جزئیات واقعی و یک شروع مرتبط بنویس. محدودیت‌های لحن، طول و کانال انتشار را رعایت کن. آمار، نظر مشتری یا وعدهٔ تأییدنشده نساز.",
      output: "متن آمادهٔ انتشار در قالب خواسته‌شده، با دعوت به اقدام فقط اگر با هدف متن جور است.",
    },
    code: {
      label: "کدنویسی و رفع باگ",
      example: "تابع TypeScript من گاهی نتیجهٔ خالی می‌دهد. کمک کن علتش را پیدا کنم",
      role: "توسعه‌دهندهٔ نرم‌افزار با تمرکز بر درستی و نگه‌داری",
      guidance:
        "زبان، محیط اجرا و رفتار فعلی را از اطلاعات موجود بگیر. اگر لاگ یا نمونهٔ ورودی برای تشخیص لازم است آن را بخواه. تغییر را تا حد لازم محدود کن و حالت‌های مرزی را در نظر بگیر.",
      output: "راه‌حل یا کد قابل اجرا، توضیح کوتاه تصمیم و نمونهٔ آزمون موفق و حالت خطا یا مرزی.",
    },
    research: {
      label: "تحقیق و مقایسه",
      example: "سه ابزار طراحی مناسب تیم کوچک را از نظر قیمت و همکاری مقایسه کن",
      role: "پژوهشگر و تحلیلگر با تمرکز بر شواهد قابل بررسی",
      guidance:
        "از معیارهای خواسته‌شده استفاده کن. اگر گزینه‌ها را خودت انتخاب می‌کنی، معیار انتخاب را روشن کن. برای داده‌های متغیر تاریخ و منبع بده و نبود داده را مشخص کن.",
      output:
        "جدول مقایسه وقتی چند گزینه وجود دارد، جمع‌بندی متناسب با نیاز و منابع قابل بررسی. منبع یا عدد نساز.",
    },
    image: {
      label: "ساخت تصویر",
      example: "پرامپت ساخت تصویر یک کافهٔ کوچک در شب بارانی برای کاور مقاله",
      role: "کارگردان هنری و نویسندهٔ پرامپت تصویر",
      guidance:
        "سوژه، محیط، ترکیب‌بندی، نور و سبک را بر اساس توضیح من مشخص کن. کاربرد تصویر را در کادربندی لحاظ کن و ویژگی‌های مشخص‌شده را حفظ کن.",
      output:
        "یک پرامپت تصویری منسجم و آمادهٔ کپی. نسبت تصویر یا محدودیت بصری را فقط وقتی اضافه کن که از کاربرد یا درخواست روشن باشد.",
    },
    general: {
      label: "عمومی",
      example: "برای یادگیری اکسل با سه ساعت وقت در هفته برنامه بده",
      role: "دستیار متخصص در موضوع درخواست",
      guidance:
        "محدودیت‌ها و جزئیات داده‌شده را رعایت کن. اگر اطلاعات ضروری کم است، سؤال مشخص بپرس. هر فرضی را که پاسخ را عوض می‌کند صریح بگو.",
      output: "پاسخ مستقیم به درخواست، با قالب خواسته‌شده یا قالبی که به انجام کار کمک کند.",
    },
  },
  en: {
    email: {
      label: "Email and messages",
      example: "Write an email to postpone Wednesday’s meeting",
      role: "Correspondence writer who adapts to the recipient and situation",
      guidance:
        "State the purpose early and make the recipient’s next step clear. Match the requested tone. Do not invent names, times, or reasons.",
      output: "A message ready to send. Include a subject line if the request is for an email.",
    },
    writing: {
      label: "Content writing",
      example: "Write an Instagram caption for a Photoshop course",
      role: "Content writer and editor for the intended audience and channel",
      guidance:
        "Start with a relevant opening and use concrete details from the brief. Follow the requested tone and length. Do not invent numbers, endorsements, or claims.",
      output:
        "Publication-ready copy in the requested format, with a call to action where it serves the goal.",
    },
    code: {
      label: "Coding and debugging",
      example: "Help me debug a TypeScript function that sometimes returns an empty result",
      role: "Software developer focused on correctness and maintainability",
      guidance:
        "Use the supplied language, runtime, and current behavior. Ask for the missing logs or sample input when necessary. Keep the change scoped and account for edge cases.",
      output:
        "A working fix or implementation, a short explanation, and tests covering success and an error or edge case.",
    },
    research: {
      label: "Research and comparison",
      example: "Compare three design tools for a small team by price and collaboration",
      role: "Researcher and analyst focused on verifiable evidence",
      guidance:
        "Use the requested criteria and explain how you chose any options. Give sources and dates for changing facts, and mark missing or uncertain evidence.",
      output:
        "A comparison table when there are several options, a recommendation tied to the stated needs, and verifiable sources. Do not invent figures or citations.",
    },
    image: {
      label: "Image generation",
      example: "Create an image prompt for a small café on a rainy night as an article cover",
      role: "Art director and image-prompt writer",
      guidance:
        "Specify the subject, setting, composition, lighting, and style from the brief. Preserve stated visual details and frame the scene for the intended use.",
      output:
        "One coherent image prompt ready to copy. Include an aspect ratio or visual exclusions only when the brief supports them.",
    },
    general: {
      label: "General",
      example: "Make a plan for learning Excel with three hours a week",
      role: "Subject-matter assistant for the task described",
      guidance:
        "Follow the supplied constraints. Ask a specific question if essential information is missing. State assumptions that would change the answer.",
      output: "A direct answer in the requested format or a format that helps complete the task.",
    },
  },
};

const intentRules: readonly [PromptKind, RegExp][] = [
  [
    "code",
    /کدنویسی|باگ|دیباگ|برنامه[‌ ]نویسی|خطای کد|\b(?:debug|typescript|javascript|python|sql|refactor|bug)\b/i,
  ],
  [
    "image",
    /(?:ساخت|تولید|طراحی)\s*(?:یک\s*)?(?:تصویر|پوستر|لوگو)|پرامپت\s*(?:تصویر|عکس)|\b(?:image prompt|generate (?:an? )?image|text.to.image|image generation)\b/i,
  ],
  [
    "email",
    /ایمیل|رایانامه|نامه[‌ ]ی? رسمی|پیام (?:رسمی|اداری)|\b(?:e-?mail|cover letter|formal message)\b/i,
  ],
  [
    "research",
    /مقایسه|پژوهش|تحقیق|ارزیابی گزینه|\b(?:compare|comparison|research|evaluate|trade-?offs)\b/i,
  ],
  [
    "writing",
    /کپشن|مقاله|وبلاگ|تولید محتوا|بازنویسی|متن تبلیغ|\b(?:caption|blog|headline|rewrite|copywriting|product description)\b/i,
  ],
];

export function promptOptions(locale: Locale) {
  return kinds.map((kind) => ({ kind, label: templates[locale][kind].label }));
}

export function promptExample(locale: Locale, selection: PromptSelection) {
  return templates[locale][selection === "auto" ? "email" : selection].example;
}

export function buildPrompt(
  request: string,
  context: string,
  selection: PromptSelection,
  locale: Locale,
) {
  const goal = request.trim();
  if (!goal) return null;

  const normalized = goal.replace(/ي/g, "ی").replace(/ك/g, "ک");
  const kind =
    selection === "auto"
      ? (intentRules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "general")
      : selection;
  const template = templates[locale][kind];
  const labels =
    locale === "fa"
      ? {
          role: "نقش",
          goal: "درخواست",
          context: "جزئیات",
          guidance: "راهنمای انجام",
          output: "خروجی مورد انتظار",
        }
      : {
          role: "Role",
          goal: "Request",
          context: "Context",
          guidance: "Approach",
          output: "Expected output",
        };
  const entries = [
    { label: labels.role, value: template.role },
    { label: labels.goal, value: goal },
    ...(context.trim() ? [{ label: labels.context, value: context.trim() }] : []),
    { label: labels.guidance, value: template.guidance },
    { label: labels.output, value: template.output },
  ];
  return { kind, label: template.label, entries };
}
