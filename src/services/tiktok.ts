import api from "@/lib/api";

export interface TikTokVideo {
  id: string;
  title?: string;
  cover_image_url?: string;
  create_time?: number;
  view_count?: number;
  comment_count?: number;
  share_count?: number;
  like_count?: number;
}

export interface TikTokBusinessReplyContext {
  commentId: string;
  advertiserId: string;
  adId: string;
  tiktokItemId: string;
  identityId: string;
  identityType: string;
  commentType: string;
}

export interface TikTokComment {
  id: string;
  text: string;
  create_time: number;
  like_count?: number;
  reply_count?: number;
  owner?: {
    display_name?: string;
    open_id?: string;
  };
  // Modo B (API for Business): contexto p/ responder ao comentario do anuncio.
  replyContext?: TikTokBusinessReplyContext;
}

export async function listTikTokVideos(whatsappId: number) {
  return api.get(`/tt-videos/${whatsappId}`);
}

export async function getTikTokComments(videoId: string, whatsappId: number) {
  return api.get(`/tt-comments/${videoId}`, { params: { whatsappId } });
}

export async function getTikTokLink(ticketId: number) {
  return api.get(`/tt-link/${ticketId}`);
}

// F2 — credenciais manuais da TikTok API for Business (Modo B) por conexao.
export async function getTikTokBusinessCredentials(whatsappId: number) {
  return api.get(`/tt-business-credentials/${whatsappId}`);
}

export async function setTikTokBusinessCredentials(
  whatsappId: number,
  payload: { mode: string; advertiserId?: string; accessToken?: string; refreshToken?: string }
) {
  return api.put(`/tt-business-credentials/${whatsappId}`, payload);
}

// F2-OAuth — gera a URL de autorizacao OAuth da TikTok API for Business (popup).
export async function getTikTokBusinessAuthUrl(whatsappId: number) {
  return api.get(`/tt-business-oauth/auth-url/${whatsappId}`);
}

// F3 — responde direto a um comentario de anuncio (Modo B).
export async function replyTikTokComment(
  whatsappId: number,
  replyContext: TikTokBusinessReplyContext,
  text: string
) {
  return api.post(`/tt-comment-reply`, { whatsappId, replyContext, text });
}
