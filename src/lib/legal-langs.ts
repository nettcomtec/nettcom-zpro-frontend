/*
 * Idiomas disponíveis para os documentos legais públicos
 * (/politica-de-privacidade e /termos-de-uso, query ?lang=).
 * Client-safe: importado tanto pelas páginas server quanto pelos geradores
 * de link em /app-waba (superadmin) e /configuracoes/meta (admin).
 * Espelha os 13 locales da UI (src/i18n/locales).
 */

export const LEGAL_LANGS = [
  { code: "pt", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ru", label: "Русский" },
  { code: "tr", label: "Türkçe" },
] as const;

export type LegalLang = (typeof LEGAL_LANGS)[number]["code"];

export function isLegalLang(v: unknown): v is LegalLang {
  return typeof v === "string" && LEGAL_LANGS.some((l) => l.code === v);
}
