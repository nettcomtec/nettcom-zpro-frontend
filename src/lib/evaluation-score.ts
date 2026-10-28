// Espelho de backend/src/helpers/ParseEvaluationScoreZPRO.ts — mudar um exige o outro.
//
// Só vale como nota a resposta que É o número: "5", " 5 ", "5.", "5!", "5 ⭐", "5️⃣".
// Exceção: a linha do menu copiada ("5 - Excelente"), com separador logo depois do
// número e nenhum outro dígito no resto. Devolve a nota (0..maxScore) ou null.

const KEYCAP_TEN = "\u{1F51F}";
const KEYCAP_MARKS = /[️⃣]/g;

export function parseEvaluationScore(body: unknown, maxScore: unknown): number | null {
  if (typeof body !== "string" && typeof body !== "number") return null;

  const text = String(body).split(KEYCAP_TEN).join("10").replace(KEYCAP_MARKS, "").trim();

  const match = /^(\d{1,3})([\s\S]*)$/.exec(text);
  if (!match) return null;

  const rest = match[2].trim();
  const onlySymbols = !/[\p{L}\p{N}]/u.test(rest);
  const menuLineCopy = /^[-–—:)]/.test(rest) && !/\p{N}/u.test(rest);
  if (rest && !onlySymbols && !menuLineCopy) return null;

  const rawMax = typeof maxScore === "number" ? maxScore : parseInt(String(maxScore ?? ""), 10);
  const max = Number.isFinite(rawMax) ? rawMax : 5;
  const score = parseInt(match[1], 10);
  return score >= 0 && score <= max ? score : null;
}

/**
 * Nota do cliente chegando num atendimento FECHADO. Com a pesquisa pendente, o backend
 * grava a resposta no próprio atendimento fechado, sem reabrir ("Fechar a conversa na
 * hora"). Não há nada a fazer nele e o sino exibiria a nota, então sino, som e aviso do
 * navegador ficam quietos. Texto que não é a nota continua avisando: é o cliente
 * escrevendo outra coisa em vez de avaliar.
 */
export function isClosedTicketRatingReply(
  payload: { fromMe?: boolean; body?: unknown; ticket?: unknown },
  maxScore: unknown,
): boolean {
  if (payload.fromMe) return false;
  const status = (payload.ticket as { status?: unknown } | null | undefined)?.status;
  if (status !== "closed") return false;
  return parseEvaluationScore(payload.body, maxScore) !== null;
}
