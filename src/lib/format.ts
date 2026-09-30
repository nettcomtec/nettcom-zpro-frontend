import { defaultLocale, locales, type Locale } from "@/i18n/config";

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

// Mesmo mecanismo de leitura do locale ativo usado em lib/backend-offline-toast.ts:
// localStorage("language") validado contra a lista de locales; fallback pt-BR.
export function getActiveLocale(): string {
  let active: Locale = defaultLocale;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("language") as Locale | null;
      if (stored && (locales as readonly string[]).includes(stored)) active = stored;
    } catch {
      // noop — segue no fallback
    }
  }
  return LOCALE_TO_BCP47[active] ?? "pt-BR";
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

// Moeda permanece BRL (valor de negócio) — apenas o locale de exibição acompanha o idioma.
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
