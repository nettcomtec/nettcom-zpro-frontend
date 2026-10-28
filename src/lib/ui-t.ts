import { createTranslator } from "next-intl";

/**
 * Tradução da TELA para código sem hook (libs chamadas de várias telas: PDF da
 * conversa, erros de envio em massa, prévia de template…). Lê as mensagens que o
 * `LocaleProvider` já carregou para o idioma da tela — nenhum request novo.
 *
 * Nunca lança: antes das mensagens carregarem (render no servidor, testes) ou com a
 * chave ausente, devolve o texto de reserva (o português de antes) ou a própria chave.
 * Não serve para texto que vai ao CLIENTE (esse sai do catálogo da Região).
 */

type Values = Record<string, string | number | Date>;

let active: { locale: string; messages: Record<string, unknown> } | null = null;
let translator: ((key: string, values?: Values) => string) | null = null;

/** Chamado pelo LocaleProvider quando as mensagens do idioma da tela chegam. */
export function setActiveUiMessages(locale: string, messages: Record<string, unknown>): void {
  active = { locale, messages };
  translator = null;
}

function hasMessage(key: string): boolean {
  if (!active) return false;
  let cur: unknown = active.messages;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string";
}

/** A chave existe no idioma da tela carregado? */
export function hasUiMessage(key: string): boolean {
  return hasMessage(key);
}

/**
 * Texto da tela no idioma ativo. `fallback` é o português de antes (com `{x}`
 * interpolado pelos mesmos `values`); sem fallback, devolve a chave.
 */
export function uiT(key: string, values?: Values, fallback?: string): string {
  const reserve = (): string => {
    if (fallback === undefined) return key;
    if (!values) return fallback;
    return fallback.replace(/\{(\w+)\}/g, (m, name) =>
      values[name] === undefined || values[name] === null ? m : String(values[name])
    );
  };
  if (!active || !hasMessage(key)) return reserve();
  try {
    if (!translator) {
      const t = createTranslator({
        locale: active.locale,
        messages: active.messages as never,
        onError: () => undefined,
      }) as unknown as (k: string, v?: Values) => string;
      translator = t;
    }
    const out = translator(key, values);
    return typeof out === "string" && out && out !== key ? out : reserve();
  } catch {
    return reserve();
  }
}
