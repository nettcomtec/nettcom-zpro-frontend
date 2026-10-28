import { type Locale } from "@/i18n/config";
import { getUiLocale, isUiLocale } from "@/lib/ui-locale";

// Mapeia o código curto do i18n para uma tag BCP47 completa, para que o Intl
// aplique convenções regionais consistentes (pt → pt-BR, en → en-US etc.).
const LOCALE_TO_BCP47: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  ar: "ar",
  de: "de-DE",
  it: "it-IT",
  fr: "fr-FR",
  zh: "zh-CN",
  ja: "ja-JP",
  ru: "ru-RU",
  hi: "hi-IN",
  id: "id-ID",
  tr: "tr-TR",
};

// Idioma da TELA pelo leitor único (lib/ui-locale: escolha explícita → dica da
// Região → pt; no servidor, pt). Fallback pt-BR.
export function getActiveLocale(): string {
  return LOCALE_TO_BCP47[getUiLocale()] ?? "pt-BR";
}

// Mesma tabela para um código já lido (ex.: o `lang` do <html>, "pt" ou "pt-BR").
// Código desconhecido = pt-BR.
export function bcp47ForLocale(locale: string | null | undefined): string {
  const lang = String(locale ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return isUiLocale(lang) ? LOCALE_TO_BCP47[lang] : "pt-BR";
}

type DateInput = Date | string | number;

function toDate(d: DateInput): Date {
  return d instanceof Date ? d : new Date(d);
}

export function formatDate(d: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  return toDate(d).toLocaleDateString(getActiveLocale(), opts);
}

export function formatDateTime(d: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  return toDate(d).toLocaleString(getActiveLocale(), opts);
}

export function formatTime(d: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  return toDate(d).toLocaleTimeString(getActiveLocale(), opts);
}

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return Number(n).toLocaleString(getActiveLocale(), opts);
}

// Moeda permanece BRL — apenas o locale de exibição acompanha o idioma.
// formatCurrencyBRL/formatCentsBRL são dinheiro DA PLATAFORMA (créditos de IA, planos,
// faturas): ficam em BRL mesmo com a Região da empresa em outra moeda. Valor de
// negócio da empresa usa formatMoney (lib/region.ts / hooks/use-region.ts).
export function formatCurrencyBRL(n: number, opts?: Intl.NumberFormatOptions): string {
  return Number(n).toLocaleString(getActiveLocale(), {
    style: "currency",
    currency: "BRL",
    ...opts,
  });
}

// Créditos de IA trafegam em CENTAVOS. `precise` é para o consumo por chamada, que
// custa fração de centavo: com 2 casas toda linha apareceria como R$ 0,00.
export function formatCentsBRL(cents: number, opts?: { precise?: boolean }): string {
  const value = (Number(cents) || 0) / 100;
  return formatCurrencyBRL(
    value,
    opts?.precise ? { minimumFractionDigits: 2, maximumFractionDigits: 6 } : undefined
  );
}
