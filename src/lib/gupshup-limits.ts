// Limites de midia Gupshup (V3 Passthrough espelha limites Meta Cloud API).
// Mantemos numeros explicitos em vez de importar do helper WABA — segue regra
// W1-D: nao reaproveitar arquivos compartilhados/WABA.

export const GUPSHUP_MEDIA_MAX_BYTES = {
  image: 5 * 1024 * 1024,        // 5 MB
  video: 16 * 1024 * 1024,       // 16 MB
  audio: 16 * 1024 * 1024,       // 16 MB
  document: 100 * 1024 * 1024,   // 100 MB
  sticker: 100 * 1024,           // 100 KB (estatica) / animada 500 KB tratada a parte
  stickerAnimated: 500 * 1024,
} as const

export type GupshupMediaKind = keyof typeof GUPSHUP_MEDIA_MAX_BYTES

export const GUPSHUP_ALLOWED_MIME: Record<GupshupMediaKind, readonly string[]> = {
  image: ["image/jpeg", "image/png"],
  video: ["video/mp4", "video/3gpp"],
  audio: [
    "audio/aac",
    "audio/mp4",
    "audio/mpeg",
    "audio/amr",
    "audio/ogg",
    "audio/opus",
  ],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ],
  sticker: ["image/webp"],
  stickerAnimated: ["image/webp"],
}

export interface GupshupMediaCheckResult {
  ok: boolean
  reason?: "size" | "mime" | "kind_unknown"
  maxBytes?: number
  allowedMime?: readonly string[]
}

export function detectGupshupMediaKind(
  mime: string | null | undefined,
): GupshupMediaKind | null {
  const m = (mime || "").toLowerCase()
  if (!m) return null
  if (m === "image/webp") return "sticker"
  if (m.startsWith("image/")) return "image"
  if (m.startsWith("video/")) return "video"
  if (m.startsWith("audio/")) return "audio"
  return "document"
}

export function checkGupshupMedia(params: {
  mime?: string | null
  sizeBytes: number
}): GupshupMediaCheckResult {
  const kind = detectGupshupMediaKind(params.mime)
  if (!kind) return { ok: false, reason: "kind_unknown" }
  const maxBytes = GUPSHUP_MEDIA_MAX_BYTES[kind]
  const allowedMime = GUPSHUP_ALLOWED_MIME[kind]
  const mimeOk = allowedMime.some(
    (m) => m.toLowerCase() === (params.mime || "").toLowerCase(),
  )
  if (!mimeOk) return { ok: false, reason: "mime", maxBytes, allowedMime }
  if (params.sizeBytes > maxBytes)
    return { ok: false, reason: "size", maxBytes, allowedMime }
  return { ok: true, maxBytes, allowedMime }
}
