import api from "@/lib/api";

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  // A Meta omite o media_url de publicação com material protegido (ex.: Reel com música)
  media_url?: string;
  // Capa do vídeo (só VIDEO)
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
}

export interface InstagramMediaPage {
  data?: InstagramMedia[];
  paging?: { next?: string };
}

export interface InstagramCommentReply {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  like_count?: number;
}

export interface InstagramComment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  like_count?: number;
  replies?: { data?: Array<{ id: string }> };
}

// Campos e tamanho da página vão explícitos: o backend anterior a esta versão não pedia a
// capa do vídeo por padrão. Com nextUrl (paging.next da Meta) o backend segue o link, que
// já carrega os mesmos campos e tamanho da 1ª página.
const MEDIA_FIELDS = "id,caption,timestamp,media_type,media_url,permalink,thumbnail_url";
const MEDIA_PAGE_SIZE = 50;

export async function listMedia(whatsappId: number, nextUrl?: string) {
  return api.get<InstagramMediaPage | InstagramMedia[]>(`/instagramMetaMedia/${whatsappId}`, {
    params: nextUrl ? { nextUrl } : { fields: MEDIA_FIELDS, limit: MEDIA_PAGE_SIZE },
  });
}

export function readInstagramMediaPage(raw: InstagramMediaPage | InstagramMedia[] | null | undefined) {
  if (Array.isArray(raw)) return { items: raw, next: null as string | null };
  return {
    items: Array.isArray(raw?.data) ? raw!.data! : [],
    next: (typeof raw?.paging?.next === "string" && raw.paging.next) || null,
  };
}

export async function getMediaComments(mediaId: string, whatsappId: number, nextUrl?: string) {
  return api.get<{ data: InstagramComment[]; paging?: { next?: string } }>(
    `/instagramMetaComments/${mediaId}`,
    { params: { whatsappId, ...(nextUrl ? { nextUrl } : {}) } }
  );
}

export async function getCommentReplies(commentId: string, whatsappId: number, nextUrl?: string) {
  return api.get<{ data: InstagramCommentReply[]; paging?: { next?: string } }>(
    `/instagramMetaCommentReplies/${commentId}`,
    { params: { whatsappId, ...(nextUrl ? { nextUrl } : {}) } }
  );
}

export async function replyComment(data: { commentId: string; message: string; whatsappId: number }) {
  return api.post("/instagramMetaReplyComment/", data);
}

export async function commentOnMedia(data: { mediaId: string; message: string; whatsappId: number }) {
  return api.post("/instagramMetaCommentOnMedia/", data);
}

export async function deleteComment(data: { commentId: string; whatsappId: number }) {
  return api.delete("/instagramMetaDeleteComment/", { data });
}

export async function getChannelInfo(whatsappId: number) {
  return api.get(`/instagramMetaChannelInfo/${whatsappId}`);
}

export interface PublishMediaResponse {
  mediaId: string;
  creationId: string;
  mediaType: "photo" | "reel" | "carousel";
}

export async function publishMedia(params: {
  whatsappId: number;
  mediaType: "photo" | "reel" | "carousel";
  caption?: string;
  shareToFeed?: boolean;
  files: File[];
  onUploadProgress?: (progressEvent: { loaded: number; total?: number }) => void;
}) {
  const form = new FormData();
  form.append("whatsappId", String(params.whatsappId));
  form.append("mediaType", params.mediaType);
  if (params.caption) form.append("caption", params.caption);
  if (params.shareToFeed === false) form.append("shareToFeed", "false");
  for (const f of params.files) form.append("medias", f);

  return api.post<PublishMediaResponse>("/instagramMetaPublish/", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: params.onUploadProgress,
  });
}

export async function editInstagramMedia(data: { mediaId: string; caption: string; whatsappId: number }) {
  return api.put<{ mediaId: string; success: boolean }>("/instagramMetaEditMedia/", data);
}

// Nota: Instagram Graph API NAO suporta deletar midias publicadas.
// Limitacao documentada pela Meta — `DELETE /{ig-media-id}` retorna code 100 subcode 33.
// Pra deletar, usuario precisa abrir no app Instagram (botao "Abrir no Instagram" na UI).
