// Juntar os textos do atendente no WhatsApp oficial (WABA) — funções puras.
// docs/PLANO_WABA_JUNTAR_MENSAGENS.md (Passo 6, D9–D13, D17).
//
// A tela segura o texto do atendente por alguns segundos e manda os textos seguidos
// numa mensagem só (a Meta cobra cada mensagem enviada). Aqui ficam as regras sem
// estado: separador, limites, assinatura repetida e o prazo da espera. O gerente com
// estado mora em `lib/waba-agent-grouping.ts`.
import { WABA_LIMITS } from "@/lib/waba-text-limits";

export const WABA_GROUP_SEPARATOR = "\n\n";
/** Texto de sessão do WhatsApp oficial (o servidor corta acima disso). */
export const WABA_TEXT_MAX = 4096;
/** Legenda de imagem/vídeo/documento. */
export const WABA_CAPTION_MAX = WABA_LIMITS.caption;
/** Faixa do campo "Juntar textos do atendente (segundos)" do canal. */
export const AGENT_GROUP_MIN_SECONDS = 2;
export const AGENT_GROUP_MAX_SECONDS = 15;
/** Teto da espera desde o 1º texto: cada texto novo reinicia a contagem, até aqui. */
export const AGENT_GROUP_MAX_WAIT_MS = 30_000;
/** Folga mínima até o fim da janela de 24 h para valer a pena esperar. */
export const AGENT_GROUP_WINDOW_MARGIN_MS = 10_000;

/** Valor do canal: 0 (desligado) ou de 2 a 15; qualquer outra coisa = 0. */
export function normalizeAgentSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isInteger(n)) return 0;
  return n >= AGENT_GROUP_MIN_SECONDS && n <= AGENT_GROUP_MAX_SECONDS ? n : 0;
}

// Assinatura dos canais da família WhatsApp (`lib/signature.ts` buildSignedBody):
// "*Nome*:\n " no começo do texto.
const SIGNATURE_PREFIX_RE = /^\*[^*\n]+\*:\n /;

/** Prefixo de assinatura do texto, ou "" quando não há. */
export function signaturePrefixOf(text: string): string {
  const m = SIGNATURE_PREFIX_RE.exec(text || "");
  return m ? m[0] : "";
}

/**
 * Tira de `next` o prefixo de assinatura quando é IGUAL ao de `first` (D12: a assinatura
 * aparece uma vez só, no começo da mensagem juntada). Assinatura diferente fica.
 */
export function stripRepeatedSignature(first: string, next: string): string {
  const prefix = signaturePrefixOf(first);
  if (!prefix) return next;
  return next.startsWith(prefix) ? next.slice(prefix.length) : next;
}

/** Texto final de um grupo: partes na ordem, separadas por linha em branco. */
export function joinGroupedText(parts: string[]): string {
  const filled = parts.filter((p) => typeof p === "string" && p.trim() !== "");
  if (filled.length === 0) return "";
  const [first, ...rest] = filled;
  return [first, ...rest.map((p) => stripRepeatedSignature(first, p))].join(WABA_GROUP_SEPARATOR);
}

/** O texto `next` cabe no grupo que já tem `parts`? */
export function fitsGroupedText(parts: string[], next: string, max: number = WABA_TEXT_MAX): boolean {
  return joinGroupedText([...parts, next]).length <= max;
}

/**
 * Legenda de 1 arquivo com o texto que esperava (D13). `null` = não cabe em 1.024 — o
 * texto sai antes, separado, e o arquivo vai com a legenda própria.
 */
export function mergeGroupedCaption(parts: string[], ownCaption: string, max: number = WABA_CAPTION_MAX): string | null {
  const text = joinGroupedText(parts);
  if (!text) return ownCaption;
  const own = (ownCaption || "").trim() ? stripRepeatedSignature(text, ownCaption) : "";
  const merged = own ? `${text}${WABA_GROUP_SEPARATOR}${own}` : text;
  return merged.length <= max ? merged : null;
}

/** Quanto falta para soltar o grupo: `seconds` a cada texto novo, até 30 s desde o 1º. */
export function nextFlushDelayMs(firstAt: number, now: number, seconds: number): number {
  const byText = Math.max(0, seconds) * 1000;
  const byCeiling = Math.max(0, firstAt + AGENT_GROUP_MAX_WAIT_MS - now);
  return Math.min(byText, byCeiling);
}

/**
 * O texto do atendente espera para juntar? Só no WABA com segundos > 0, fora do modo
 * híbrido (D17: lá o texto já sai sem custo pelo número vinculado), sem envio forçado
 * pelo vinculado e com folga até o fim da janela de 24 h (sem dado da janela = espera).
 */
export function shouldGroupAgentText(opts: {
  channel: string | null | undefined;
  agentSeconds: number;
  isHybrid: boolean;
  forceLinked?: boolean;
  windowRemainingMs?: number | null;
}): boolean {
  if (String(opts.channel || "").toLowerCase() !== "waba") return false;
  const seconds = normalizeAgentSeconds(opts.agentSeconds);
  if (seconds <= 0 || opts.isHybrid || opts.forceLinked) return false;
  if (typeof opts.windowRemainingMs === "number" && Number.isFinite(opts.windowRemainingMs)) {
    return opts.windowRemainingMs > seconds * 1000 + AGENT_GROUP_WINDOW_MARGIN_MS;
  }
  return true;
}
