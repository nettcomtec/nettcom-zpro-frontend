// Dialog360 file type/size limits — passthrough Meta Cloud API.
// Valores espelham os limites oficiais do WhatsApp Cloud API, mas o arquivo
// é independente do equivalente WABA para preservar isolamento de stack.

export const DIALOG360_LIMITS: Record<string, number> = {
  "audio/aac": 16 * 1024 * 1024,
  "audio/amr": 16 * 1024 * 1024,
  "audio/mpeg": 16 * 1024 * 1024,
  "audio/mp4": 16 * 1024 * 1024,
  "audio/ogg": 16 * 1024 * 1024,
  "text/plain": 100 * 1024 * 1024,
  "application/vnd.ms-excel": 100 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 100 * 1024 * 1024,
  "application/msword": 100 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 100 * 1024 * 1024,
  "application/vnd.ms-powerpoint": 100 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": 100 * 1024 * 1024,
  "application/pdf": 100 * 1024 * 1024,
  "image/jpeg": 5 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
  "image/webp": 500 * 1024,
  "video/3gpp": 16 * 1024 * 1024,
  "video/mp4": 16 * 1024 * 1024,
  // .mov de iPhone (PWA) — backend converte para .mp4 antes de enviar ao 360dialog.
  "video/quicktime": 16 * 1024 * 1024,
}

export const DIALOG360_EXT_TO_MIME: Record<string, string> = {
  aac: "audio/aac",
  amr: "audio/amr",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  "3gp": "video/3gpp",
  mp4: "video/mp4",
  mov: "video/quicktime",
}

export type Dialog360FileError =
  | { reason: "type" }
  | { reason: "size"; maxSizeMB: string; fileSizeMB: string }

export function checkFileDialog360(file: File): Dialog360FileError | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const mimeType = file.type || DIALOG360_EXT_TO_MIME[ext] || ""
  const maxSize = DIALOG360_LIMITS[mimeType]
  if (!maxSize) return { reason: "type" }
  if (file.size > maxSize) {
    return {
      reason: "size",
      maxSizeMB: (maxSize / (1024 * 1024)).toFixed(1),
      fileSizeMB: (file.size / (1024 * 1024)).toFixed(1),
    }
  }
  return null
}
