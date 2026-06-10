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
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type SiteSettings = Partial<Record<SettingKey, string>>;
