// Janela de citação da UAzapi.
//
// A UAzapi guarda as mensagens num banco próprio por 7 dias e precisa da mensagem
// original para montar a citação da resposta. Fora da janela ela envia a resposta
// sem a citação (e responde 200 mesmo assim): o atendimento avisa antes do envio e
// a bolha não mostra uma citação que o cliente não vai ver.
//
// Espelho de `backend/src/services/WbotUazapiServices/helpers/UazapiQuoteZPRO.ts`
// (mesma janela, mesma data de referência: a criação da mensagem citada, ou o
// horário do agendamento quando ela foi agendada) — mudar um exige o outro.

export const UAZAPI_QUOTE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface QuotedLike {
  createdAt?: unknown;
  scheduleDate?: unknown;
  messageId?: unknown;
}

function toTime(value: unknown): number {
  if (value === null || value === undefined || value === "") return NaN;
  return value instanceof Date ? value.getTime() : new Date(value as string | number).getTime();
}

// Data ilegível ou ausente nunca conta como vencida: na dúvida, a citação fica.
export function isUazapiQuoteStale(quoted: QuotedLike | null | undefined, nowMs: number = Date.now()): boolean {
  if (!quoted) return false;
  const created = toTime(quoted.createdAt);
  const scheduled = toTime(quoted.scheduleDate);
  const at = !Number.isFinite(created) ? scheduled : Number.isFinite(scheduled) ? Math.max(created, scheduled) : created;
  if (!Number.isFinite(at)) return false;
  return nowMs - at > UAZAPI_QUOTE_WINDOW_MS;
}

// Id de mensagem do WhatsApp; o `owner:ID` gravado pelo recebimento vale pelo ID
// (mesma regra de `normalizeUazapiReplyId` no backend).
export function isUazapiReplyIdShape(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const owned = /^[^:\s]+:([A-Za-z0-9]{6,128})$/.exec(value);
  return /^[A-Za-z0-9]{6,128}$/.test(owned ? owned[1] : value);
}

// A resposta com esta citação pode chegar ao celular do cliente sem ela: citada
// fora da janela, ou sem id de mensagem do WhatsApp (bolha ainda não confirmada,
// mensagem de outro canal). Serve só à bolha provisória: se o servidor gravar a
// citação mesmo assim, a mensagem real a traz de volta.
export function uazapiQuoteWillBeDropped(quoted: QuotedLike | null | undefined): boolean {
  if (!quoted) return false;
  if (!isUazapiReplyIdShape(quoted.messageId)) return true;
  return isUazapiQuoteStale(quoted);
}
