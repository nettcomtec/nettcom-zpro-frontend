// Vencimento da URL de foto de perfil do WhatsApp (pps.whatsapp.net).
//
// A URL é assinada e vence: o parâmetro `oe` é o vencimento em segundos Unix,
// em hex (~10 dias depois da busca). Vencida, o CDN responde 403 e o avatar cai
// nas iniciais. Ao abrir a conversa de um atendimento Baileys/Zapo com a foto
// vencida (ou vencendo em menos de 2 dias), o atendimento pede ao backend que
// busque a foto de novo; a nova chega pelo `contact:update` do socket.
//
// Espelho de `backend/src/helpers/WhatsappProfilePicExpiryZPRO.ts` (mesmo host,
// mesmo `oe`, mesma margem) — mudar um exige o outro.

const WHATSAPP_CDN_URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*whatsapp\.net\//i;
const EXPIRY_PARAM_RE = /[?&]oe=([0-9a-f]{1,12})(?:[&#]|$)/i;

export const WHATSAPP_PIC_REFRESH_MARGIN_MS = 2 * 24 * 60 * 60 * 1000;

export function isWhatsappPicUrlStale(url: unknown, nowMs: number = Date.now()): boolean {
  if (typeof url !== "string" || !WHATSAPP_CDN_URL_RE.test(url)) return false;
  const match = EXPIRY_PARAM_RE.exec(url);
  if (!match) return false;
  const seconds = parseInt(match[1], 16);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  return seconds * 1000 - nowMs <= WHATSAPP_PIC_REFRESH_MARGIN_MS;
}

// Uma tentativa por contato enquanto a página estiver aberta: o backend já tem
// dedup e cooldown por contato, isto só evita o request a cada troca de conversa.
const requestedContactIds = new Set<number>();

export function claimContactPictureRefresh(contactId: number): boolean {
  if (requestedContactIds.has(contactId)) return false;
  requestedContactIds.add(contactId);
  return true;
}

// Canal fora, canal ocupado ou falha de rede: abrir a conversa de novo tenta
// outra vez (o backend responde esses casos sem consultar o WhatsApp).
export function releaseContactPictureRefresh(contactId: number): void {
  requestedContactIds.delete(contactId);
}

export function shouldRetryContactPictureRefresh(status: unknown): boolean {
  return status === "unavailable" || status === "busy";
}
