// Comentário do Instagram no atendimento. Espelho de
// `backend/src/helpers/InstagramCommentMessageZPRO.ts` (mudar um exige o outro).

const COMMENT_BODY_PREFIXES = ["💬 Comentário em", "↩️ Resposta a comentário em"];

// Resposta no Direct a partir do comentário: a Meta aceita 1 por comentário, em até 7 dias.
export const INSTAGRAM_COMMENT_DM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const INSTAGRAM_COMMENT_REPLY_MAX = 2200;
export const INSTAGRAM_DM_TEXT_MAX = 1000;

export type InstagramCommentReplyKind = "public" | "private";

interface CommentLike {
  id?: string;
  messageId?: string;
  body?: string | null;
  dataJson?: string | null;
  fromMe?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
}

const parseJson = (raw: unknown): Record<string, unknown> | null => {
  if (typeof raw !== "string" || !raw.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export function isInstagramCommentMessage(msg: CommentLike | null | undefined): boolean {
  if (!msg || msg.fromMe) return false;
  if (parseJson(msg.dataJson)?.igComment) return true;
  const body = typeof msg.body === "string" ? msg.body : "";
  return COMMENT_BODY_PREFIXES.some((prefix) => body.startsWith(prefix));
}

/**
 * Comentário em post patrocinado: `igComment.adId`/`adTitle`, gravados no fim do objeto
 * só quando preenchidos (espelho de `buildInstagramCommentDataJson` do backend).
 */
export function readInstagramCommentAd(
  dataJson: string | null | undefined
): { adId: string | null; adTitle: string | null } | null {
  const comment = parseJson(dataJson)?.igComment as Record<string, unknown> | undefined;
  if (!comment || typeof comment !== "object") return null;
  const adId = typeof comment.adId === "string" && /^\d{1,32}$/.test(comment.adId) ? comment.adId : null;
  const adTitle = typeof comment.adTitle === "string" && comment.adTitle.trim() ? comment.adTitle.trim().slice(0, 255) : null;
  if (!adId && !adTitle) return null;
  return { adId, adTitle };
}

/** Marca da resposta enviada pelo atendimento (ou eco da própria conta) — selo da bolha. */
export function readInstagramCommentReply(
  dataJson: string | null | undefined
): { kind: InstagramCommentReplyKind; commentId: string } | null {
  const reply = parseJson(dataJson)?.igCommentReply as Record<string, unknown> | undefined;
  if (!reply || (reply.kind !== "public" && reply.kind !== "private")) return null;
  return { kind: reply.kind, commentId: String(reply.commentId ?? "") };
}

/** Texto do comentário: do "💬 " depois da 1ª linha até o fim (pode ter várias linhas). */
export function instagramCommentText(body: string | null | undefined): string {
  const lines = String(body || "").split("\n");
  const start = lines.findIndex((line, i) => i > 0 && line.startsWith("💬"));
  if (start < 0) return String(body || "");
  return lines.slice(start).join("\n").replace(/^💬\s*/, "").trim() || String(body || "");
}

/** Link do post na 2ª linha ("🔗 https://…"), quando o webhook conseguiu buscá-lo. */
export function instagramCommentPermalink(body: string | null | undefined): string | null {
  const line = String(body || "")
    .split("\n")
    .find((l) => l.startsWith("🔗 "));
  const url = line?.slice(2).trim() || "";
  return /^https:\/\/(www\.)?instagram\.com\//.test(url) ? url : null;
}

/** Já existe Direct enviado para este comentário entre as mensagens carregadas. */
export function hasPrivateReplyFor(messages: CommentLike[], commentId: string | undefined): boolean {
  if (!commentId) return false;
  return messages.some((m) => {
    if (!m.fromMe) return false;
    const reply = readInstagramCommentReply(m.dataJson);
    return reply?.kind === "private" && reply.commentId === commentId;
  });
}

export function isInstagramCommentDmExpired(msg: CommentLike, now = Date.now()): boolean {
  const created = msg.createdAt ? new Date(msg.createdAt).getTime() : NaN;
  return Number.isFinite(created) && now - created > INSTAGRAM_COMMENT_DM_WINDOW_MS;
}
