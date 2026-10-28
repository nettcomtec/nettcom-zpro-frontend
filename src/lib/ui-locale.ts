import { defaultLocale, locales, type Locale } from "@/i18n/config";

/**
 * Idioma da TELA (não o dos textos ao cliente). Leitor ÚNICO para todo o front:
 * provider do next-intl, formatadores de data/número, mensagens do interceptor.
 *
 * Precedência:
 *  1. `localStorage.language` — escolha explícita, gravada só pelo seletor de idioma;
 *  2. `localStorage.languageAuto` — dica da Região (padrão geral no /login, idioma da
 *     empresa no painel), gravada sem request no boot;
 *  3. pt.
 * Quem já escolheu um idioma nunca é mudado pela Região.
 */

const EXPLICIT_KEY = "language";
const AUTO_KEY = "languageAuto";
// Quem gravou a dica: "panel" (idioma da empresa) vence "login" (padrão geral).
const AUTO_SOURCE_KEY = "languageAutoSource";

export type LanguageAutoSource = "login" | "panel";
const RELOAD_GUARD_PREFIX = "zpro.languageAutoReload:";

export function isUiLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A pessoa escolheu um idioma no seletor (neste navegador)? */
export function hasExplicitLanguage(): boolean {
  return isUiLocale(readStorage(EXPLICIT_KEY));
}

export function getUiLocale(): Locale {
  const explicit = readStorage(EXPLICIT_KEY);
  if (isUiLocale(explicit)) return explicit;
  const auto = readStorage(AUTO_KEY);
  if (isUiLocale(auto)) return auto;
  return defaultLocale;
}

/**
 * Grava a dica de idioma vinda da Região. Devolve true quando isso MUDA o idioma
 * efetivo da tela (sem escolha explícita e idioma diferente do atual) — quem chama
 * decide recarregar, uma vez por sessão (consumeAutoReloadGuard).
 *
 * O /login ("login") não sobrescreve a dica do painel ("panel"): quem já entrou neste
 * navegador segue no idioma da própria empresa, sem recarregar o /login (a recarga
 * apagaria a senha sendo digitada) e sem uma 2ª recarga no painel logo depois.
 */
export function setLanguageAuto(lang: unknown, source: LanguageAutoSource = "panel"): boolean {
  if (!isUiLocale(lang) || typeof window === "undefined") return false;
  if (source === "login" && readStorage(AUTO_SOURCE_KEY) === "panel" && isUiLocale(readStorage(AUTO_KEY))) {
    return false;
  }
  const before = getUiLocale();
  try {
    window.localStorage.setItem(AUTO_KEY, lang);
    window.localStorage.setItem(AUTO_SOURCE_KEY, source);
  } catch {
    return false;
  }
  return !hasExplicitLanguage() && before !== lang;
}

/**
 * Apaga a dica de idioma da Região (empresa sem idioma configurado: a dica deixada por
 * outra empresa, ou por um idioma que a empresa removeu, não pode seguir valendo).
 * Devolve true quando isso MUDA o idioma efetivo da tela.
 */
export function clearLanguageAuto(): boolean {
  if (typeof window === "undefined") return false;
  const before = getUiLocale();
  try {
    if (readStorage(AUTO_KEY) === null) return false;
    window.localStorage.removeItem(AUTO_KEY);
    window.localStorage.removeItem(AUTO_SOURCE_KEY);
  } catch {
    return false;
  }
  return getUiLocale() !== before;
}

/**
 * Trava contra laço de recarga: devolve true só na 1ª vez por aba para a mesma chave
 * (sessionStorage). Sem sessionStorage disponível, nunca libera a recarga.
 */
export function consumeAutoReloadGuard(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const k = `${RELOAD_GUARD_PREFIX}${key}`;
    if (window.sessionStorage.getItem(k)) return false;
    window.sessionStorage.setItem(k, "1");
    return true;
  } catch {
    return false;
  }
}
