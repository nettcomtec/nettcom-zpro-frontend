import { AxiosError } from "axios";
import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { uiT } from "@/lib/ui-t";
import { getBackendErrorCode } from "@/lib/backend-error-code";

export interface GalleryItem {
  id: number;
  name: string;
  type: string;
  url: string;
  /** URL de thumbnail otimizado (~240px webp). Pode estar ausente para nao-imagens ou cache nao gerado. */
  thumbUrl?: string | null;
  size?: number;
  /** Pasta do arquivo (null = "Sem pasta"). Ausente em backend sem pastas. */
  folderId?: number | null;
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
  folderId?: number | null;
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
    name: raw.originalName || raw.fileName || raw.name || uiT("gallery.fileFallback", undefined, "Arquivo"),
    type: mimeType,
    url: raw.mediaUrl || raw.url || raw.filePath || "",
    thumbUrl: raw.thumbUrl ?? null,
    size: raw.fileSize || raw.size,
    folderId: typeof raw.folderId === "number" ? raw.folderId : null,
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

/** Filtro de pasta: "all" (ou ausente) = todos; "none" = sem pasta; número = a pasta. */
export type GalleryFolderFilterValue = "all" | "none" | number;

export async function fetchGallery(params?: {
  pageNumber?: number;
  searchParam?: string;
  fileType?: string;
  /** Só vai na requisição quando definido ("all" = todos, como sem o parâmetro). */
  folderId?: GalleryFolderFilterValue;
}) {
  const { data } = await api.get("/gallery", { params });
  const raw: RawGalleryItem[] = data?.galleries || data?.gallery || (Array.isArray(data) ? data : []);
  const echo = data?.folderFilter;
  // Pasta pedida e resposta sem o eco = backend sem pastas (ex.: voltou de versão com a aba
  // aberta) devolveu TODOS os arquivos. Nunca mostrar isso sob o chip da pasta: vira o mesmo
  // erro de "pasta indisponível", que as telas já tratam voltando para "Todos".
  if (params?.folderId !== undefined && params.folderId !== "all" && echo === undefined) {
    throw { status: 409, data: { error: "ERR_GALLERY_FOLDERS_UNAVAILABLE" } };
  }
  return {
    data: raw.map(normalizeGalleryItem),
    count: data?.count ?? raw.length,
    hasMore: data?.hasMore ?? false,
    /** Eco do filtro de pasta entendido pelo backend; ausente = backend sem pastas. */
    folderFilter: (echo === "all" || echo === "none" || typeof echo === "number" ? echo : undefined) as
      | GalleryFolderFilterValue
      | undefined,
  };
}

// ─── Pastas (PLANO_GALERIA_PASTAS) ───────────────────────────────────────────

export interface GalleryFolder {
  id: number;
  name: string;
  /** Quantidade de arquivos da pasta (segue o filtro de tipo pedido). */
  count: number;
}

export interface GalleryFoldersState {
  /** false = backend sem pastas (antigo, sem a migration ou desligado): nenhuma UI de pasta. */
  available: boolean;
  folders: GalleryFolder[];
  unfiledCount: number;
  totalCount: number;
}

export const EMPTY_GALLERY_FOLDERS: GalleryFoldersState = {
  available: false,
  folders: [],
  unfiledCount: 0,
  totalCount: 0,
};

/** Códigos do backend que significam "a pasta não existe mais" (outra aba/usuário excluiu). */
export function isGalleryFolderMissingError(err: unknown): boolean {
  const code = getBackendErrorCode(err);
  return code === "ERR_GALLERY_FOLDER_NOT_FOUND" || code === "ERR_GALLERY_FOLDERS_UNAVAILABLE";
}

/**
 * Pastas da galeria com a contagem de arquivos (filtrada pelo tipo). Chamada automática ao
 * abrir a página/seletor: sem toast de "sem permissão" (a lista principal já avisa). NUNCA
 * lança: erro, 404 (backend antigo) ou `available: false` → sem pastas.
 */
export async function fetchGalleryFolders(
  params?: { fileType?: string },
): Promise<GalleryFoldersState & { transientError?: boolean }> {
  try {
    const { data } = await api.get("/gallery-folders", {
      params: params?.fileType ? { fileType: params.fileType } : undefined,
      ...BACKGROUND_REQUEST,
      skipNoPermissionToast: true,
    });
    if (!data || data.available !== true || !Array.isArray(data.folders)) return { ...EMPTY_GALLERY_FOLDERS };
    const folders: GalleryFolder[] = (data.folders as unknown[])
      .filter((f): f is GalleryFolder => !!f && typeof (f as GalleryFolder).id === "number")
      .map((f) => ({ id: f.id, name: String(f.name ?? ""), count: Number(f.count) || 0 }));
    return {
      available: true,
      folders,
      unfiledCount: Number(data.unfiledCount) || 0,
      totalCount: Number(data.totalCount) || 0,
    };
  } catch (err) {
    // 404 (backend sem pastas) e 401/403 (sem acesso) = sem pastas de verdade. Rede, prazo e 5xx
    // são passageiros: `transientError` deixa quem chamou manter o que já tinha na tela.
    const status = (err as { status?: number; response?: { status?: number } } | null)?.status
      ?? (err as { response?: { status?: number } } | null)?.response?.status;
    const definitive = status === 404 || status === 401 || status === 403;
    return { ...EMPTY_GALLERY_FOLDERS, transientError: !definitive };
  }
}

export async function createGalleryFolder(name: string): Promise<GalleryFolder> {
  const { data } = await api.post("/gallery-folders", { name });
  return { id: Number(data?.id), name: String(data?.name ?? name), count: Number(data?.count) || 0 };
}

export async function renameGalleryFolder(id: number, name: string): Promise<{ id: number; name: string }> {
  const { data } = await api.put(`/gallery-folders/${id}`, { name });
  return { id: Number(data?.id ?? id), name: String(data?.name ?? name) };
}

/** Exclui a pasta; os arquivos dela voltam para "Sem pasta" (nada é apagado). */
export async function deleteGalleryFolder(id: number): Promise<{ movedCount: number }> {
  const { data } = await api.delete(`/gallery-folders/${id}`);
  return { movedCount: Number(data?.movedCount) || 0 };
}

const MOVE_CHUNK = 500;

/** Move arquivos para a pasta (ou para "Sem pasta" com null). Fatia em partes de 500. */
export async function moveGalleryItems(ids: number[], folderId: number | null): Promise<{ moved: number }> {
  let moved = 0;
  for (let i = 0; i < ids.length; i += MOVE_CHUNK) {
    const chunk = ids.slice(i, i + MOVE_CHUNK);
    const { data } = await api.post("/gallery-folders/move", { galleryIds: chunk, folderId });
    moved += Number(data?.moved) || 0;
  }
  return { moved };
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

export interface GalleryUploadOptions {
  /** Pasta de destino; null/ausente = "Sem pasta". Só vai no form quando é número. */
  folderId?: number | null;
}

export async function uploadGalleryFile(file: File, opts?: GalleryUploadOptions) {
  const formData = new FormData();
  // Antes de "files": o multer só entrega ao destination os campos que chegam antes do arquivo.
  if (typeof opts?.folderId === "number") formData.append("folderId", String(opts.folderId));
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
  /** A pasta de destino não existe mais (excluída em outra aba/por outro usuário). */
  | "folder_missing"
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
    if (isGalleryFolderMissingError(err)) return { status, code: "folder_missing" };
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
  opts?: GalleryUploadOptions,
) {
  let success = 0;
  const failed: UploadFailure[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      await uploadGalleryFile(file, opts);
      success++;
      onProgress?.({ index: i + 1, total: files.length, file, ok: true });
    } catch (err) {
      const { status, code } = extractUploadFailureReason(err);
      failed.push({ file, status, code });
      onProgress?.({ index: i + 1, total: files.length, file, ok: false });
      // Pasta excluída no meio do lote: os próximos falhariam igual. Para aqui e marca os
      // restantes com o mesmo motivo (a tela recarrega as pastas e volta a "Todos").
      if (code === "folder_missing") {
        for (let j = i + 1; j < files.length; j++) {
          failed.push({ file: files[j], status, code });
          onProgress?.({ index: j + 1, total: files.length, file: files[j], ok: false });
        }
        break;
      }
    }
  }
  return { success, failed };
}

export async function deleteGalleryItem(id: number) {
  return api.delete(`/gallery/${id}`);
}
