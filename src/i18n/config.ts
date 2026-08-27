export const locales = ["pt", "en", "es", "ar", "de", "it", "fr", "zh", "ja", "ru", "hi", "id", "tr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt";
export const fallbackLocale: Locale = "pt";

export const localeNames: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
  ar: "العربية",
  de: "Deutsch",
  it: "Italiano",
  fr: "Français",
  zh: "中文",
  ja: "日本語",
  ru: "Русский",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
  tr: "Türkçe",
};
