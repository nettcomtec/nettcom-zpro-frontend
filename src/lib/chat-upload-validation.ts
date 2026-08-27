import { checkFileForChannel, getRestrictedChannel } from "./channel-file-limits";

export const CHAT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/"];

const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "application/json",
  "application/xml",
  "text/plain",
  "text/csv",
  "text/xml",
  "text/rtf",
  "text/markdown",
]);

const BLOCKED_EXTENSIONS = new Set<string>([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".msp",
  ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh",
  ".jar", ".sh", ".app", ".dmg", ".pkg", ".deb", ".rpm",
  ".dll", ".sys", ".reg", ".lnk", ".chm",
]);

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export function isChatMimeAllowed(file: File): boolean {
  const ext = getExtension(file.name || "");
  if (BLOCKED_EXTENSIONS.has(ext)) return false;

  const mt = (file.type || "").toLowerCase();
  if (ALLOWED_MIME_PREFIXES.some((p) => mt.startsWith(p))) return true;
  if (ALLOWED_MIME_TYPES.has(mt)) return true;

  // Some browsers leave file.type empty for known doc/archive extensions —
  // accept by extension as a fallback.
  const FALLBACK_EXTENSIONS = new Set<string>([
    ".pdf", ".zip", ".rar", ".7z", ".tar", ".gz", ".tgz",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp", ".rtf", ".csv", ".txt", ".md",
    ".json", ".xml",
  ]);
  if (FALLBACK_EXTENSIONS.has(ext)) return true;

  return false;
}

export type ChatFileValidationError = "size" | "type";

export function validateChatFile(file: File): ChatFileValidationError | null {
  if (file.size > CHAT_MAX_FILE_SIZE) return "size";
  if (!isChatMimeAllowed(file)) return "type";
  return null;
}

export function formatMaxFileSize(): string {
  return `${Math.floor(CHAT_MAX_FILE_SIZE / (1024 * 1024))}MB`;
}

// ──────────────────────────────────────────────────────────────────────────
// Politica unica de staging de arquivo no chat (colar / arrastar / seletor).
// Funcao pura: nao depende de React, e testavel isoladamente.
// ──────────────────────────────────────────────────────────────────────────

// Maximo de arquivos por colagem. Deliberadamente baixo: handleSend dispara
// os uploads em paralelo (files.forEach sem await), entao um cap alto embaralha
// a ordem no destinatario e aumenta a chance de colisao do nome de disco, que
// so e unico pelo timestamp em milissegundos.
export const PASTE_MAX_FILES = 5;

// Canais que so publicam texto: o job de envio manda message.body (= nome do
// arquivo) como comentario. Anexar ali vazaria o nome do arquivo em publico e
// ainda marcaria a mensagem como entregue.
const TEXT_ONLY_CHANNELS = new Set(["linkedin", "olx", "youtube", "tiktok"]);

// Canais que aceitam midia mas nao documento (o menu de clipe ja esconde
// "Enviar documento" neles via supportsAttachmentWithCaption).
function isNoDocumentChannel(ch: string): boolean {
  return ch.includes("hub") || ch === "instagram";
}

function isMediaFile(file: File): boolean {
  const prefix = (file.type || "").split("/")[0];
  return prefix === "image" || prefix === "video" || prefix === "audio";
}

export function isTextOnlyChatChannel(channelType?: string | null): boolean {
  return TEXT_ONLY_CHANNELS.has((channelType || "").toLowerCase());
}

export type ChatFileRejectionReason =
  | "cap"           // estourou o maximo de arquivos
  | "channelNoFile" // canal text-only: nao aceita arquivo nenhum
  | "type"          // extensao bloqueada / mime nao permitido
  | "channelNoDoc"  // canal aceita midia, mas nao documento
  | "channelType"   // canal restrito nao suporta esse formato
  | "channelSize"   // canal restrito: excede o limite do canal
  | "size";         // teto generico

export interface ChatFileRejection {
  file: File;
  reason: ChatFileRejectionReason;
  maxSizeMB?: string;
  fileSizeMB?: string;
}

export interface ChatUploadPolicy {
  channelType?: string | null;
  maxFiles: number;
  maxBytes: number;
  /** Quantos arquivos ja estao staged (contam para o cap). */
  currentCount: number;
}

export interface ChatFileFilterResult {
  accepted: File[];
  rejected: ChatFileRejection[];
}

/**
 * Decide quais arquivos podem ser staged para envio no chat.
 *
 * Ordem dos gates e proposital: o mais barato e o mais grave primeiro, para
 * que a mensagem de erro que chega ao operador seja a mais especifica.
 *
 * checkFileForChannel e chamado SEMPRE (nao so em WABA-like): ele ja devolve
 * null para canal nao restrito, e chamar so sob isWabaLike deixava Messenger
 * escapar dos proprios 25MB da tabela dele.
 */
export function filterIncomingChatFiles(
  incoming: File[],
  policy: ChatUploadPolicy,
): ChatFileFilterResult {
  const ch = (policy.channelType || "").toLowerCase();
  const textOnly = isTextOnlyChatChannel(ch);
  const noDoc = isNoDocumentChannel(ch);
  const restricted = getRestrictedChannel(ch);

  const accepted: File[] = [];
  const rejected: ChatFileRejection[] = [];

  for (const file of incoming) {
    if (policy.currentCount + accepted.length >= policy.maxFiles) {
      rejected.push({ file, reason: "cap" });
      continue;
    }
    if (textOnly) {
      rejected.push({ file, reason: "channelNoFile" });
      continue;
    }
    if (!isChatMimeAllowed(file)) {
      rejected.push({ file, reason: "type" });
      continue;
    }
    if (noDoc && !isMediaFile(file)) {
      rejected.push({ file, reason: "channelNoDoc" });
      continue;
    }
    const channelErr = checkFileForChannel(ch, file);
    if (channelErr) {
      rejected.push(
        channelErr.reason === "size"
          ? {
              file,
              reason: "channelSize",
              maxSizeMB: channelErr.maxSizeMB,
              fileSizeMB: channelErr.fileSizeMB,
            }
          : { file, reason: "channelType" },
      );
      continue;
    }
    // Canal restrito ja teve o tamanho julgado pela tabela do proprio canal.
    if (!restricted && file.size > policy.maxBytes) {
      rejected.push({ file, reason: "size" });
      continue;
    }
    accepted.push(file);
  }

  return { accepted, rejected };
}

// Multer acrescenta "_" + 17 digitos ao nome; sobra folga para o limite de
// 255 bytes do filesystem mesmo com acento contando multi-byte no original.
const MAX_UPLOAD_BASENAME = 120;

/**
 * Normaliza o nome antes do upload.
 *
 * O strip anterior (`[^\w.-]`) APAGAVA acento em vez de transliterar, porque
 * \w e [A-Za-z0-9_]: "Cotação Final.pdf" virava "Cotao_Final.pdf". Pior, um
 * nome 100% nao-ASCII ("报价单.pdf") sobrava so como ".pdf" — e o multer gerava
 * ".pdf_<timestamp>", um dotfile que o express.static recusa com 403
 * (dotfiles: 'deny') e que o handler de PDF nao reconhece.
 *
 * Agora: decompoe em NFD e remove os diacriticos (acento vira a letra base),
 * e garante que sempre sobre um basename antes da extensao.
 */
export function normalizeUploadFilename(name: string): string {
  const deaccented = (name || "").normalize("NFD").replace(/\p{M}/gu, "");
  const cleaned = deaccented.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
  const dot = cleaned.lastIndexOf(".");
  const base = dot > 0 ? cleaned.slice(0, dot) : dot === 0 ? "" : cleaned;
  const ext = dot >= 0 ? cleaned.slice(dot) : "";
  const safeBase = (base.replace(/^\.+/, "") || "arquivo").slice(0, MAX_UPLOAD_BASENAME);
  return `${safeBase}${ext}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Clipboard
// ──────────────────────────────────────────────────────────────────────────

// Nome literal que o Blink da ao bitmap sintetizado do clipboard (print de
// tela, imagem copiada de site, celula do Excel). Arquivo copiado do
// gerenciador de arquivos chega com o nome real e NAO deve ser renomeado.
export const SYNTHETIC_CLIPBOARD_IMAGE_NAME = "image.png";

export function isSyntheticClipboardBitmap(file: File): boolean {
  return !file.name || file.name === SYNTHETIC_CLIPBOARD_IMAGE_NAME;
}

const VIDEO_MIME_TO_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
};

/**
 * Da nome a um arquivo colado.
 *
 * Devolve o MESMO File quando o nome ja e bom — recriar via new File([f], ...)
 * refaz o Blob e, num PDF grande, e um pico de heap desnecessario.
 */
export function namePastedFile(file: File, now: number): File {
  if (!isSyntheticClipboardBitmap(file)) return file;
  const type = (file.type || "").toLowerCase();
  const isVideo = type.startsWith("video/");
  const ext = isVideo ? (VIDEO_MIME_TO_EXT[type] ?? ".mp4") : ".png";
  const prefix = isVideo ? "pasted-video" : "pasted-image";
  return new File([file], `${prefix}-${now}${ext}`, { type: file.type });
}

/**
 * Excel/Word no Windows publicam CF_DIB junto com o texto, e o Blink expoe esse
 * bitmap como item de arquivo (no macOS um `else if` evita isso, por isso o bug
 * nao reproduz em Mac). Sem este guard, copiar um intervalo do Excel anexa um
 * print e engole o texto.
 *
 * Regra: so `text/plain` decide. "Copiar imagem" de uma pagina web publica o
 * bitmap MAIS um `text/html` com o `<img src=...>`
 * (SystemClipboard::WriteImageWithTag) e, de proposito, NENHUM `text/plain` —
 * contar o `text/html` como texto matava o Ctrl+V de qualquer imagem copiada do
 * navegador (inclusive a do proprio ticket): nao anexava e, sem `text/plain`,
 * tambem nao colava nada no campo. Excel/Word sempre publicam CF_TEXT, entao o
 * guard acima continua valendo.
 */
export function shouldDeferPasteToText(types: readonly string[], files: File[]): boolean {
  if (files.length === 0) return true;
  const hasText = types.includes("text/plain");
  return hasText && files.every(isSyntheticClipboardBitmap);
}
