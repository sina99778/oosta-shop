import { z } from "zod";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #0ea5e9");
const shortText = z.string().trim().min(1).max(300);

// null OR "" clears the override. The empty-string form exists for the AI agent:
// its tool schema declares plain strings, so a schema-faithful model cannot emit
// null but can always emit "".
const clearable = <T extends z.ZodType<string>>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable());

// The complete set of editable site settings. Every key is optional in a PATCH;
// sending null (or "") clears the override (the built-in default takes effect
// again). Theme colors override the CSS variables in globals.css; *Dark variants
// fall back to the light value when unset.
const httpUrl = z
  .string()
  .trim()
  .max(300)
  .regex(/^https?:\/\/\S+$/, "Must be an http(s) URL");
const longText = z.string().trim().min(1).max(600);
const handleOrUrl = z.string().trim().min(1).max(150); // @handle or full URL

export const settingsPatchSchema = z
  .object({
    themePrimary: clearable(hexColor),
    themePrimaryDark: clearable(hexColor),
    themeAccent: clearable(hexColor),
    themeAccentDark: clearable(hexColor),
    heroTitleEn: clearable(shortText),
    heroTitleFa: clearable(shortText),
    heroSubtitleEn: clearable(shortText),
    heroSubtitleFa: clearable(shortText),
    announcementEn: clearable(shortText),
    announcementFa: clearable(shortText),
    footerAboutEn: clearable(longText),
    footerAboutFa: clearable(longText),
    contactEmail: clearable(
      z
        .string()
        .trim()
        .max(150)
        .regex(/^\S+@\S+\.\S+$/, "Invalid email"),
    ),
    contactPhone: clearable(
      z
        .string()
        .trim()
        .max(30)
        .regex(/^[+\d][\d\s()-]{4,}$/, "Invalid phone"),
    ),
    contactTelegram: clearable(handleOrUrl),
    contactInstagram: clearable(handleOrUrl),
    // The link target of the Enamad trust badge (https://trustseal.enamad.ir/?id=…).
    enamadLink: clearable(httpUrl),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No settings to update");

export const SETTING_KEYS = [
  "themePrimary",
  "themePrimaryDark",
  "themeAccent",
  "themeAccentDark",
  "heroTitleEn",
  "heroTitleFa",
  "heroSubtitleEn",
  "heroSubtitleFa",
  "announcementEn",
  "announcementFa",
  "footerAboutEn",
  "footerAboutFa",
  "contactEmail",
  "contactPhone",
  "contactTelegram",
  "contactInstagram",
  "enamadLink",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type SiteSettings = Partial<Record<SettingKey, string>>;
