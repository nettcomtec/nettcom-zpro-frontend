// Anúncio de origem na conversa — docs/PLANO_ANUNCIO_ORIGEM_CONVERSA.md.
// Espelho de backend/src/helpers/MetaAdReferralZPRO.ts (formato de `dataJson.adReferral`
// e hosts da imagem): mudar um exige o outro.

export type AdReferralKind = "ad" | "link";

export interface AdReferralView {
  kind: AdReferralKind;
  source: string | null;
  adId: string | null;
  adTitle: string | null;
  ref: string | null;
  photoUrl: string | null;
  videoUrl: string | null;
}

/** Selo do atendimento (lista, abertura e aviso `ticket:adReferral`). */
export interface TicketAdReferral {
  adId?: string | null;
  adTitle?: string | null;
  channel?: string | null;
}

// Imagem só da CDN da Meta (casamento por rótulo), como no backend.
const META_CDN_HOSTS = ["fbcdn.net", "cdninstagram.com", "fbsbx.com"];
const URL_MAX = 2048;

export function safeMetaCdnUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  return META_CDN_HOSTS.some((base) => host === base || host.endsWith(`.${base}`)) ? raw : null;
}

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
};

// A bolha chama em toda mensagem: atalho barato antes do JSON.parse.
function parseDataJsonObject(dataJson: unknown): Record<string, unknown> | null {
  if (!dataJson) return null;
  if (typeof dataJson === "object") {
    return Array.isArray(dataJson) ? null : (dataJson as Record<string, unknown>);
  }
  if (typeof dataJson !== "string") return null;
  const text = dataJson.trim();
  if (!text.startsWith("{") || !text.includes("\"adReferral\"")) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Anúncio gravado na mensagem recebida. Só a chave `adReferral` — nunca `referral` cru (a
 * sincronização de histórico do WhatsApp grava a mensagem crua da Meta no `dataJson`) e
 * nunca campos na raiz.
 */
export function readAdReferral(dataJson: unknown): AdReferralView | null {
  const raw = parseDataJsonObject(dataJson)?.adReferral;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "ad") {
    const adId = typeof r.adId === "string" && /^\d{1,32}$/.test(r.adId) ? r.adId : null;
    return {
      kind: "ad",
      source: cleanText(r.source, 80),
      adId,
      adTitle: cleanText(r.adTitle, 255),
      ref: cleanText(r.ref, 255),
      photoUrl: safeMetaCdnUrl(r.photoUrl),
      videoUrl: safeMetaCdnUrl(r.videoUrl),
    };
  }
  if (r.kind === "link") {
    const ref = cleanText(r.ref, 255);
    if (!ref) return null;
    return { kind: "link", source: cleanText(r.source, 80), adId: null, adTitle: null, ref, photoUrl: null, videoUrl: null };
  }
  return null;
}

// Aviso `ticket:adReferral` chega uma vez só, no registro. Atendimento que entra na lista
// DEPOIS (sai do robô para a fila, filtro que passa a casar) vem do socket sem o selo: o
// aviso fica guardado aqui por 30 min (o 1º de cada atendimento, como o selo) e é aplicado
// na inserção. A recarga da lista traz o selo de qualquer jeito.
const PENDING_TICKET_AD_TTL_MS = 30 * 60 * 1000;
const PENDING_TICKET_AD_MAX = 500;
const pendingTicketAdReferrals = new Map<number, { value: TicketAdReferral; at: number }>();

export function rememberTicketAdReferral(ticketId: number, value: TicketAdReferral): void {
  if (!Number.isInteger(ticketId) || ticketId <= 0 || !value) return;
  const now = Date.now();
  const current = pendingTicketAdReferrals.get(ticketId);
  if (current && now - current.at < PENDING_TICKET_AD_TTL_MS) return;
  if (pendingTicketAdReferrals.size >= PENDING_TICKET_AD_MAX) {
    pendingTicketAdReferrals.forEach((entry, id) => {
      if (now - entry.at >= PENDING_TICKET_AD_TTL_MS) pendingTicketAdReferrals.delete(id);
    });
    if (pendingTicketAdReferrals.size >= PENDING_TICKET_AD_MAX) {
      const oldest = pendingTicketAdReferrals.keys().next().value;
      if (oldest !== undefined) pendingTicketAdReferrals.delete(oldest);
    }
  }
  pendingTicketAdReferrals.set(ticketId, { value, at: now });
}

/** Atendimento inserido pelo socket sem selo recebe o aviso guardado (se houver e ainda valer). */
export function withPendingAdReferral<T extends { id?: unknown; adReferral?: TicketAdReferral | null }>(ticket: T): T {
  if (!ticket || ticket.adReferral) return ticket;
  const id = Number(ticket.id);
  const hit = Number.isInteger(id) ? pendingTicketAdReferrals.get(id) : undefined;
  if (!hit) return ticket;
  if (Date.now() - hit.at >= PENDING_TICKET_AD_TTL_MS) {
    pendingTicketAdReferrals.delete(id);
    return ticket;
  }
  return { ...ticket, adReferral: hit.value };
}

/**
 * Quem substitui o atendimento inteiro (recarga da lista, abertura, refresh) mantém o selo
 * que já havia quando o novo objeto não traz a chave — o selo pode ter vindo pelo aviso de
 * tempo real antes de o servidor que respondeu a lista saber dele.
 */
export function keepAdReferral<T extends { adReferral?: TicketAdReferral | null }>(
  prev: T | null | undefined,
  next: T
): T {
  if (!prev || !next) return next;
  if (Object.prototype.hasOwnProperty.call(next, "adReferral")) return next;
  if (!prev.adReferral) return next;
  return { ...next, adReferral: prev.adReferral };
}
