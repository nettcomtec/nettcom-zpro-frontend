// Limites oficiais Meta para envio de arquivo em WABA / Instagram / Messenger.
// dialog360 e gupshup compartilham WABA (são BSPs sobre a mesma API Meta).

export const WABA_LIMITS: Record<string, number> = {
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
  "video/quicktime": 16 * 1024 * 1024,
};

const WABA_EXT_TO_MIME: Record<string, string> = {
  aac: "audio/aac", amr: "audio/amr", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp",
  "3gp": "video/3gpp", mp4: "video/mp4", mov: "video/quicktime",
};

export const INSTAGRAM_LIMITS: Record<string, number> = {
  "image/jpeg": 8 * 1024 * 1024,
  "image/png": 8 * 1024 * 1024,
  "video/mp4": 25 * 1024 * 1024,
  "video/quicktime": 25 * 1024 * 1024,
  "audio/mpeg": 25 * 1024 * 1024,
  "audio/mp4": 25 * 1024 * 1024,
  "audio/aac": 25 * 1024 * 1024,
  "audio/ogg": 25 * 1024 * 1024,
  "audio/wav": 25 * 1024 * 1024,
};

const INSTAGRAM_EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  mp4: "video/mp4", mov: "video/quicktime",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac",
  ogg: "audio/ogg", wav: "audio/wav",
};

export const MESSENGER_LIMITS: Record<string, number> = {
  "image/jpeg": 25 * 1024 * 1024,
  "image/png": 25 * 1024 * 1024,
  "image/gif": 25 * 1024 * 1024,
  "image/webp": 25 * 1024 * 1024,
  "video/mp4": 25 * 1024 * 1024,
  "video/quicktime": 25 * 1024 * 1024,
  "audio/mpeg": 25 * 1024 * 1024,
  "audio/mp4": 25 * 1024 * 1024,
  "audio/ogg": 25 * 1024 * 1024,
  "audio/wav": 25 * 1024 * 1024,
  "application/pdf": 25 * 1024 * 1024,
  "application/msword": 25 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 25 * 1024 * 1024,
  "application/vnd.ms-excel": 25 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 25 * 1024 * 1024,
  "application/vnd.ms-powerpoint": 25 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": 25 * 1024 * 1024,
  "application/zip": 25 * 1024 * 1024,
};

const MESSENGER_EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime",
  mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

export type WabaFileError =
  | { reason: "type" }
  | { reason: "size"; maxSizeMB: string; fileSizeMB: string };

export type RestrictedChannel = "waba" | "instagram" | "messenger";

export function getRestrictedChannel(channelType?: string | null): RestrictedChannel | null {
  const ch = (channelType || "").toLowerCase();
  if (ch === "waba" || ch === "gupshup" || ch === "dialog360") return "waba";
  if (ch === "instagram") return "instagram";
  if (ch === "messenger") return "messenger";
  return null;
}

function checkAgainstTable(
  limits: Record<string, number>,
  extMap: Record<string, string>,
  name: string,
  type: string,
  size: number,
): WabaFileError | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = (type || extMap[ext] || "").toLowerCase();
  let maxSize = limits[mime];
  // Tolerante para itens da galeria que vêm com MIME genérico (ex.: "image/unknown")
  if (!maxSize) {
    if (mime.startsWith("image/")) maxSize = limits["image/jpeg"] ?? limits["image/png"];
    else if (mime.startsWith("video/")) maxSize = limits["video/mp4"];
    else if (mime.startsWith("audio/")) maxSize = limits["audio/mpeg"];
  }
  if (!maxSize) return { reason: "type" };
  if (size > maxSize) {
    return {
      reason: "size",
      maxSizeMB: (maxSize / (1024 * 1024)).toFixed(1),
      fileSizeMB: (size / (1024 * 1024)).toFixed(1),
    };
  }
  return null;
}

export function checkFileWaba(file: File): WabaFileError | null {
  return checkAgainstTable(WABA_LIMITS, WABA_EXT_TO_MIME, file.name, file.type, file.size);
}

export function checkFileForChannel(
  channelType: string | null | undefined,
  file: File,
): WabaFileError | null {
  const restricted = getRestrictedChannel(channelType);
  if (!restricted) return null;
  if (restricted === "waba") return checkAgainstTable(WABA_LIMITS, WABA_EXT_TO_MIME, file.name, file.type, file.size);
  if (restricted === "instagram") return checkAgainstTable(INSTAGRAM_LIMITS, INSTAGRAM_EXT_TO_MIME, file.name, file.type, file.size);
  return checkAgainstTable(MESSENGER_LIMITS, MESSENGER_EXT_TO_MIME, file.name, file.type, file.size);
}

export type GalleryFileMeta = { name: string; type?: string; size?: number };

export function checkGalleryItemForChannel(
  channelType: string | null | undefined,
  item: GalleryFileMeta,
): WabaFileError | null {
  const restricted = getRestrictedChannel(channelType);
  if (!restricted) return null;
  const size = item.size ?? 0;
  const type = item.type ?? "";
  if (restricted === "waba") return checkAgainstTable(WABA_LIMITS, WABA_EXT_TO_MIME, item.name, type, size);
  if (restricted === "instagram") return checkAgainstTable(INSTAGRAM_LIMITS, INSTAGRAM_EXT_TO_MIME, item.name, type, size);
  return checkAgainstTable(MESSENGER_LIMITS, MESSENGER_EXT_TO_MIME, item.name, type, size);
}
