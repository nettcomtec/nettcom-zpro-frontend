"use client";

import { useCallback, useMemo } from "react";
import { useAuthStore } from "@/stores/auth-store";
import {
  FALLBACK_REGION,
  formatMoney as formatMoneyRaw,
  interpolateRegionText,
  type MoneyOptions,
  type RegionState,
} from "@/lib/region";
import { fetchRegionTexts } from "@/services/region";

/**
 * Região da empresa na tela: país, moeda e idioma dos textos ao cliente.
 *
 * Sem Região carregada (antes do boot ou backend antigo) = BR/BRL/pt e
 * `languageConfigured=false`: a tela se comporta exatamente como antes.
 *
 * `text(key, vars, ptFallback)`: texto que vai ao CLIENTE montado na tela. Usa o
 * catálogo do backend só quando a empresa (ou o padrão geral) define idioma; senão,
 * o `ptFallback` de hoje. `{x}` é interpolado; `{{x}}` fica literal.
 */

let textsInflight: Promise<void> | null = null;
// Falha lembrada por 60 s: quem chama a cada render (placeholder) não refaz o request.
let textsFailedAt = 0;
const TEXTS_RETRY_MS = 60_000;

/** Busca (uma vez por idioma, voo único) os textos ao cliente da empresa. */
export function ensureRegionTexts(): Promise<void> {
  const { region, regionTexts, setRegionTexts } = useAuthStore.getState();
  if (!region?.supported || !region.languageConfigured) return Promise.resolve();
  if (regionTexts && regionTexts.language === region.language) return Promise.resolve();
  if (textsInflight) return textsInflight;
  if (Date.now() - textsFailedAt < TEXTS_RETRY_MS) return Promise.resolve();
  textsInflight = fetchRegionTexts()
    .then(({ data }) => {
      if (data && data.texts && typeof data.texts === "object") {
        setRegionTexts({ language: data.language, texts: data.texts });
      }
      // Resposta sem textos ou em outro idioma conta como falha, senão cada chamada refaria o request.
      if (!data || !data.texts || typeof data.texts !== "object" || data.language !== region.language) {
        textsFailedAt = Date.now();
      }
    })
    .catch(() => {
      // Sem os textos, `text()` usa o fallback PT de hoje.
      textsFailedAt = Date.now();
    })
    .finally(() => {
      textsInflight = null;
    });
  return textsInflight;
}

/**
 * `text()` fora de componente (lib, factory de nó do fluxo): lê o store na hora.
 * Mesma regra do hook: texto da Região só com languageConfigured e textos carregados.
 */
export function getRegionText(
  key: string,
  vars?: Record<string, string | number | null | undefined>,
  ptFallback?: string
): string {
  const { region, regionTexts } = useAuthStore.getState();
  const r = region || FALLBACK_REGION;
  const fromRegion =
    r.languageConfigured && regionTexts && regionTexts.language === r.language ? regionTexts.texts[key] : undefined;
  return interpolateRegionText(fromRegion || ptFallback || "", vars);
}

/**
 * Os textos ao cliente já valem? true sem idioma configurado (o texto é o PT de hoje)
 * ou com os textos do idioma da empresa carregados.
 */
export function regionTextsReady(): boolean {
  const { region, regionTexts } = useAuthStore.getState();
  const r = region || FALLBACK_REGION;
  if (!r.languageConfigured) return true;
  return Boolean(regionTexts && regionTexts.language === r.language);
}

/** Região efetiva fora de componente (FALLBACK_REGION antes do boot / backend antigo). */
export function getRegionNow(): RegionState {
  return useAuthStore.getState().region || FALLBACK_REGION;
}

export interface UseRegionResult {
  country: string;
  currency: string;
  language: string;
  languageConfigured: boolean;
  /** Backend conhece a Região (senão as telas novas ficam ocultas). */
  supported: boolean;
  region: RegionState;
  /** Dinheiro no formato do país da empresa; moeda default = moeda da empresa. */
  formatMoney: (value: unknown, opts?: MoneyOptions) => string;
  text: (key: string, vars?: Record<string, string | number | null | undefined>, ptFallback?: string) => string;
  ensureTexts: () => Promise<void>;
}

export function useRegion(): UseRegionResult {
  const stored = useAuthStore((s) => s.region);
  const regionTexts = useAuthStore((s) => s.regionTexts);
  const region = stored || FALLBACK_REGION;

  const formatMoney = useCallback(
    (value: unknown, opts: MoneyOptions = {}) =>
      formatMoneyRaw(value, {
        ...opts,
        currency: opts.currency || region.currency,
        country: opts.country || region.country,
      }),
    [region.currency, region.country]
  );

  const text = useCallback(
    (key: string, vars?: Record<string, string | number | null | undefined>, ptFallback?: string) => {
      const fromRegion =
        region.languageConfigured && regionTexts && regionTexts.language === region.language
          ? regionTexts.texts[key]
          : undefined;
      const template = fromRegion || ptFallback || "";
      return interpolateRegionText(template, vars);
    },
    [region.languageConfigured, region.language, regionTexts]
  );

  return useMemo(
    () => ({
      country: region.country,
      currency: region.currency,
      language: region.language,
      languageConfigured: region.languageConfigured,
      supported: region.supported,
      region,
      formatMoney,
      text,
      ensureTexts: ensureRegionTexts,
    }),
    [region, formatMoney, text]
  );
}

export default useRegion;
