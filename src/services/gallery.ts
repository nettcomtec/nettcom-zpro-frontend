import { AxiosError } from "axios";
import api from "@/lib/api";

export interface GalleryItem {
  id: number;
  name: string;
  type: string;
  url: string;
  /** URL de thumbnail otimizado (~240px webp). Pode estar ausente para nao-imagens ou cache nao gerado. */
  thumbUrl?: string | null;
  size?: number;
  createdAt: string;
  updatedAt: string;
}

interface RawGalleryItem {
  id: number;
  fileName?: string;
  originalName?: string;
  name?: string;
  filePath?: string;
  fileType?: string;
  type?: string;
  mimeType?: string;
  description?: string;
  fileSize?: number;
  size?: number;
  mediaUrl?: string;
  url?: string;
  thumbUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Maps the backend ENUM category to a generic MIME prefix for filtering fallback */
const FILETYPE_ENUM_TO_MIME: Record<string, string> = {
  image: "image/unknown",
  video: "video/unknown",
  audio: "audio/unknown",
  pdf: "application/pdf",
  document: "application/octet-stream",
  archive: "application/zip",
  other: "application/octet-stream",
};

function normalizeGalleryItem(raw: RawGalleryItem): GalleryItem {
  // Prefer the real MIME type; fall back to mapping the ENUM category to a MIME-like string
  const mimeType =
    raw.mimeType ||
    raw.type ||
    (raw.fileType ? FILETYPE_ENUM_TO_MIME[raw.fileType] : undefined) ||
    "application/octet-stream";

  return {
    id: raw.id,
    name: raw.originalName || raw.fileName || raw.name || "Arquivo",
    type: mimeType,
    url: raw.mediaUrl || raw.url || raw.filePath || "",
    thumbUrl: raw.thumbUrl ?? null,
    size: raw.fileSize || raw.size,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Retorna URL leve para preview (thumbnail webp) com fallback para o original. */
export function getGalleryPreviewUrl(item: { url: string; thumbUrl?: string | null }): string {
  return item.thumbUrl || item.url;
}

/**
 * Obtém os bytes de um item da galeria para reenvio (chat / figurinha / nota interna).
 * 1) Fast path: baixa direto da URL pública (S3/CDN) quando o browser tem acesso —
 *    evita proxiar os bytes pelo backend.
 * 2) Fallback: rota backend `/gallery/:id/download`, que resolve o storage server-side
 *    (S3 privado ou arquivo local) sem depender de CORS nem de bucket público — cobre o
 *    caso keepLocalCopy=false, em que a cópia local é apagada após o upload.
 * `fetch().blob()` cross-origin exige CORS no bucket; por isso tratamos tanto erro de
 * rede/CORS quanto resposta `!ok` (404/403) como falha e caímos no fallback.
 */
export async function fetchGalleryBlob(item: GalleryItem): Promise<Blob> {
  if (item.url) {
    try {
      const res = await fetch(item.url);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) return blob;
      }
    } catch {
      /* indisponível / bloqueado por CORS → cai no fallback do backend */
    }
  }
  const { data } = await api.get(`/gallery/${item.id}/download`, { responseType: "blob" });
  return data as Blob;
}

export async function fetchGallery(params?: {
  pageNumber?: number;
  searchParam?: string;
  fileType?: string;
}) {
  const { data } = await api.get("/gallery", { params });
  const raw: RawGalleryItem[] = data?.galleries || data?.gallery || (Array.isArray(data) ? data : []);
  return {
    data: raw.map(normalizeGalleryItem),
    count: data?.count ?? raw.length,
    hasMore: data?.hasMore ?? false,
  };
}

export interface GalleryUsage {
  usedBytes: number;
  count: number;
  /** Quota efetiva em MB. 0 = ilimitado. */
  quotaMB: number;
  /** null = ilimitado. */
  quotaBytes: number | null;
}

export async function fetchGalleryUsage(): Promise<GalleryUsage> {
  const { data } = await api.get("/gallery/usage");
  return {
    usedBytes: Number(data?.usedBytes || 0),
    count: Number(data?.count || 0),
    quotaMB: Number(data?.quotaMB || 0),
    quotaBytes: data?.quotaBytes != null ? Number(data.quotaBytes) : null,
  };
}

export async function fetchGalleryItem(id: number) {
  return api.get(`/gallery/${id}`);
}

export async function uploadGalleryFile(file: File) {
  const formData = new FormData();
  formData.append("files", file);
  return api.post("/gallery", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export interface UploadProgress {
  index: number;
  total: number;
  file: File;
  ok: boolean;
}

export type UploadFailureCode =
  | "too_large"
  | "unsupported"
  | "unauthorized"
  | "quota"
  | "server_error"
  | "timeout"
  | "network"
  | "unknown";

export interface UploadFailure {
  file: File;
  status?: number;
  code: UploadFailureCode;
}

function extractUploadFailureReason(err: unknown): { status?: number; code: UploadFailureCode } {
  // lib/api.ts rejeita com `error.response || error`: com resposta HTTP, status e corpo
  // chegam na RAIZ (o objeto É a resposta); só o AxiosError cru (sem resposta) traz
  // `response` vazio + `code`/`message`. Ler só `ax.response` dava sempre "unknown".
  type UploadErrorBody = { error?: string; message?: string };
  const ax = err as
    | (AxiosError<UploadErrorBody> & { status?: number; data?: UploadErrorBody })
    | undefined;
  const status = ax?.status ?? ax?.response?.status;
  if (status) {
    const body = ax?.data ?? ax?.response?.data;
    const backendCode = (body && typeof body === "object" ? body.error || body.message : "") || "";
    if (backendCode === "ERR_GALLERY_QUOTA_EXCEEDED") return { status, code: "quota" };
    if (status === 413 || backendCode === "FILE_TOO_LARGE") return { status, code: "too_large" };
    if (status === 415 || backendCode === "CHAT_FILE_TYPE_NOT_ALLOWED") return { status, code: "unsupported" };
    if (status === 401 || status === 403) return { status, code: "unauthorized" };
    if (status >= 500) return { status, code: "server_error" };
    return { status, code: "unknown" };
  }
  if (ax?.code === "ECONNABORTED") return { code: "timeout" };
  // Sem response — request bloqueada por proxy/CORS. No dev tunnel/CF isso
  // costuma ser 413 do proxy, então tratamos como "arquivo muito grande".
  if (ax?.message === "Network Error") return { code: "too_large" };
  return { code: "network" };
}

export async function uploadGalleryFiles(
  files: File[],
  onProgress?: (p: UploadProgress) => void,
) {
  let success = 0;
  const failed: UploadFailure[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      await uploadGalleryFile(file);
      success++;
      onProgress?.({ index: i + 1, total: files.length, file, ok: true });
    } catch (err) {
      const { status, code } = extractUploadFailureReason(err);
      failed.push({ file, status, code });
      onProgress?.({ index: i + 1, total: files.length, file, ok: false });
    }
  }
  return { success, failed };
}

export async function deleteGalleryItem(id: number) {
  return api.delete(`/gallery/${id}`);
}
