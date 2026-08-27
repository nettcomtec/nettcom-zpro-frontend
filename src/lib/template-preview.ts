/**
 * Extrai um preview legivel para `ticket.lastMessage` quando o body foi salvo
 * como JSON ou em formatos especiais usados pelos componentes de
 * `components/atendimento/message-bubble.tsx`.
 *
 * Cobre:
 * - Cobrança (template ORDER_DETAILS)      → "Cobrança • R$ …" (branch ANTES do fluxo normal)
 * - WABA template em array de componentes  → texto do BODY (fallback HEADER)
 * - WABA template em objeto `{ components | template.components }`
 * - Templates Messenger/Instagram com prefixo textual: `GenericTemplate:`,
 *   `ButtonTemplate:`, `MediaTemplate:`, `Receipt:`, `CustomerFeedback:`,
 *   `Carousel:`, `QR:`
 * - JSON generico (interactive/list/button/order/cta/product/poll) → tenta
 *   chaves textuais comuns (`text`, `body`, `title`, ...), elements/items
 * - vCard (`BEGIN:VCARD`) → valor do `FN:`
 * - templateBaileys (markers `[QuickReply]`, `[Botões]`, etc.) → texto sem markers
 * - System placeholders (`Media download limited by the WhatsApp server`)
 *
 * Quando nenhum padrao casa, devolve `raw` inalterado.
 */

import { extractOrderDetails, formatMetaAmount, isOrderDetailsTemplate } from "./order-details";

type AnyComp = {
  type?: string;
  format?: string;
  text?: string;
  parameters?: Array<{ type?: string; text?: string }>;
  buttons?: Array<{ type?: string; text?: string; sub_type?: string }>;
};

type TranslateFn = (key: string) => string;

const TEMPLATE_PREFIXES = [
  "GenericTemplate:",
  "ButtonTemplate:",
  "MediaTemplate:",
  "Receipt:",
  "CustomerFeedback:",
  "Carousel:",
  "QR:",
];

const TEMPLATE_BAILEYS_MARKERS = [
  "[QuickReply]",
  "[Botões]",
  "[Botoes]",
  "[Link]",
  "[Ligar]",
  "[FlowButton]",
  "[CopyCode]",
  "[Catalog]",
];

const TEXT_BEARING_KEYS = ["text", "body", "message", "caption", "title", "label", "name"];

const safeParseJson = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/**
 * Cobrança (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F3.4.
 * Chave i18n do namespace `atendimentoChatExtra`; o literal só entra quando o
 * caller não passa `t` (rotas que ainda chamam o preview sem tradutor).
 */
const CHARGE_LABEL_KEY = "chargePreview";
const CHARGE_LABEL_FALLBACK = "Cobrança";

const getChargeLabel = (t?: TranslateFn): string => {
  if (!t) return CHARGE_LABEL_FALLBACK;
  try {
    const label = t(CHARGE_LABEL_KEY);
    // next-intl devolve `namespace.chave` quando a chave não existe no locale.
    if (!label || label === CHARGE_LABEL_KEY || label.endsWith(`.${CHARGE_LABEL_KEY}`)) {
      return CHARGE_LABEL_FALLBACK;
    }
    return label;
  } catch {
    return CHARGE_LABEL_FALLBACK;
  }
};

/**
 * Detecta cobrança no array de components e devolve "Cobrança • R$ …".
 * Duas formas chegam em `lastMessage`: a definição do template (BUTTONS com
 * botão `ORDER_DETAILS`, sem valores) e o array já montado para envio (botão
 * `sub_type: order_details` com o `order_details` completo) — só a segunda tem
 * total. Sem cobrança devolve null e o fluxo normal segue intocado (D0).
 */
const extractChargePreview = (arr: AnyComp[], t?: TranslateFn): string | null => {
  const details = extractOrderDetails(arr);
  if (!details && !isOrderDetailsTemplate({ components: arr })) return null;
  const label = getChargeLabel(t);
  // `total_amount` vem no formato da Meta ({ value, offset }) — o offset é do
  // payload, nunca presumido aqui.
  const total = details ? formatMetaAmount(details.total_amount, details.currency || "BRL") : "";
  return total ? `${label} • ${total}` : label;
};

const extractFromComponents = (arr: AnyComp[], t?: TranslateFn): string | null => {
  const charge = extractChargePreview(arr, t);
  if (charge) return charge;
  const findType = (type: string) =>
    arr.find((c) => c && typeof c.type === "string" && c.type.toUpperCase() === type);
  const body = findType("BODY");
  if (body?.text && typeof body.text === "string" && body.text.length > 0) return body.text;
  const header = findType("HEADER");
  if (header) {
    const headerText = header.text || header.parameters?.[0]?.text;
    if (typeof headerText === "string" && headerText.length > 0) return headerText;
  }
  return null;
};

const extractFromObject = (obj: any, t?: TranslateFn): string | null => {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj.components)) {
    const fromComps = extractFromComponents(obj.components, t);
    if (fromComps) return fromComps;
  }
  if (Array.isArray(obj?.template?.components)) {
    const fromComps = extractFromComponents(obj.template.components, t);
    if (fromComps) return fromComps;
  }

  for (const k of TEXT_BEARING_KEYS) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  if (obj.template && typeof obj.template === "object") {
    for (const k of TEXT_BEARING_KEYS) {
      const v = obj.template[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }

  const elements =
    obj.elements || obj?.template?.elements || obj?.attachment?.payload?.elements;
  if (Array.isArray(elements) && elements.length > 0) {
    const titles = elements
      .map((e: any) => (typeof e?.title === "string" ? e.title : ""))
      .filter(Boolean);
    if (titles.length) return titles.join(", ");
  }

  if (Array.isArray(obj.items) && obj.items.length > 0) {
    const first = obj.items[0];
    if (first && typeof first === "object") {
      const name = first.name || first.title || first.product_name;
      if (typeof name === "string" && name.length > 0) {
        return obj.items.length > 1 ? `${name} (+${obj.items.length - 1})` : name;
      }
    }
  }

  return null;
};

const stripTemplateBaileysMarkers = (s: string): string => {
  let out = s;
  for (const marker of TEMPLATE_BAILEYS_MARKERS) {
    const idx = out.indexOf(marker);
    if (idx >= 0) out = out.substring(0, idx);
  }
  return out.trim() || s;
};

/**
 * `t` (opcional, namespace `atendimentoChatExtra`) só é consultado no branch de
 * cobrança; sem ele o preview é exatamente o de sempre.
 */
export const getTicketLastMessagePreview = (
  raw: string | null | undefined,
  t?: TranslateFn
): string => {
  if (!raw) return "";
  if (typeof raw !== "string") return String(raw);

  if (raw.includes("Media download limited by the WhatsApp server")) return "";

  for (const prefix of TEMPLATE_PREFIXES) {
    if (raw.startsWith(prefix)) {
      const rest = raw.substring(prefix.length).trim();
      const pipeIdx = rest.indexOf(" | ");
      const head = (pipeIdx >= 0 ? rest.substring(0, pipeIdx) : rest).trim();
      if (head.startsWith("{") || head.startsWith("[")) {
        const parsed = safeParseJson(head);
        if (Array.isArray(parsed)) {
          const fromComps = extractFromComponents(parsed, t);
          if (fromComps) return fromComps;
        } else {
          const fromObj = extractFromObject(parsed, t);
          if (fromObj) return fromObj;
        }
      }
      return head || rest || prefix.replace(":", "");
    }
  }

  if (raw.includes("BEGIN:VCARD")) {
    const fnMatch = raw.match(/FN:([^\r\n]+)/);
    if (fnMatch && fnMatch[1].trim()) return fnMatch[1].trim();
    return raw;
  }

  if (raw.startsWith("[LIST]") || raw.startsWith("[BUTTON]")) {
    const lines = raw.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const stripped = lines[i].replace(/^\*(.+)\*$/, "$1").trim();
      if (stripped) return stripped;
    }
    return raw.startsWith("[LIST]") ? "Lista" : "Botão";
  }

  if (TEMPLATE_BAILEYS_MARKERS.some((m) => raw.includes(m))) {
    return stripTemplateBaileysMarkers(raw);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = safeParseJson(trimmed);
    if (parsed !== undefined) {
      if (Array.isArray(parsed)) {
        const fromComps = extractFromComponents(parsed, t);
        if (fromComps) return fromComps;
      } else {
        const fromObj = extractFromObject(parsed, t);
        if (fromObj) return fromObj;
      }
    }
  }

  return raw;
};

export type FilenameMediaKind = "image" | "video" | "audio" | "document" | "file";

const FILENAME_KIND_BY_EXT: Record<string, FilenameMediaKind> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", bmp: "image",
  mp4: "video", "3gp": "video", mov: "video", avi: "video", mkv: "video", webm: "video",
  mp3: "audio", ogg: "audio", opus: "audio", m4a: "audio", aac: "audio", wav: "audio", amr: "audio",
  pdf: "document", doc: "document", docx: "document", xls: "document", xlsx: "document",
  ppt: "document", pptx: "document", csv: "document", txt: "document",
  zip: "file", rar: "file", "7z": "file", ofx: "file", cdr: "file", was: "file",
};

/**
 * Detecta body que é apenas um nome/caminho de arquivo de mídia — vários canais gravam
 * o filename como `lastMessage` em envios de mídia sem legenda (massa, API, chatbot).
 * Não casa URLs nem frases com espaço; token único terminado em extensão conhecida.
 */
export const getFilenameMediaKind = (raw: string | null | undefined): FilenameMediaKind | null => {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s.length > 180 || /\s/.test(s) || s.includes("://")) return null;
  const m = s.match(/\.([A-Za-z0-9]{1,5})$/);
  if (!m) return null;
  return FILENAME_KIND_BY_EXT[m[1].toLowerCase()] || null;
};

const FILENAME_KIND_LABEL_KEY: Record<FilenameMediaKind, string> = {
  image: "mediaImage",
  video: "mediaVideo",
  audio: "mediaAudio",
  document: "mediaDocument",
  file: "mediaFile",
};

/**
 * Rótulo para bodies SINTÉTICOS que o backend grava em `lastMessage` (filename
 * de mídia, literal "media" da massa, marcador de download limitado). O `t`
 * precisa resolver as chaves do namespace i18n `atendimentoChatExtra`.
 * Retorna "" para tokens internos que devem ser mascarados (s1r2) e null
 * quando o body não é sintético (caller segue com o preview normal).
 */
export const getSyntheticBodyLabel = (
  raw: string | null | undefined,
  t: (key: string) => string
): string | null => {
  if (!raw) return null;
  if (/^s\d+r\d+$/.test(raw)) return "";
  if (raw === "media" || raw.includes("Media download limited by the WhatsApp server")) {
    return t("mediaFile");
  }
  const kind = getFilenameMediaKind(raw);
  if (kind) return t(FILENAME_KIND_LABEL_KEY[kind]);
  return null;
};

export const getMediaTypeFallbackLabel = (
  mediaType: string | undefined,
  t: (key: string) => string
): string | null => {
  if (!mediaType) return null;
  const mt = mediaType.toLowerCase();
  if (mt.includes("image") || mt === "media") return t("mediaImage");
  if (mt.includes("video")) return t("mediaVideo");
  if (mt.includes("audio")) return t("mediaAudio");
  if (mt.includes("document") || mt === "application") return t("mediaDocument");
  if (mt === "sticker") return t("mediaSticker");
  if (mt.includes("vcard") || mt.includes("contact")) return t("mediaContact");
  if (mt.includes("location")) return t("mediaLocation");
  if (mt === "chat" || mt === "conversation" || mt === "extendedtextmessage" || mt === "notes") return null;
  if (mt === "listresponsemessage") return null;
  return t("mediaFile");
};

/**
 * Preview da última mensagem para listas de tickets: mascara tokens internos,
 * converte bodies sintéticos em rótulos de mídia e só então cai nos fallbacks
 * (rótulo por lastMessageType → `noMessages`). O `t` precisa resolver as
 * chaves do namespace `atendimentoChatExtra`.
 */
export const getTicketListPreview = (
  lastMessage: string | null | undefined,
  lastMessageType: string | undefined,
  t: (key: string) => string
): string => {
  const synthetic = getSyntheticBodyLabel(lastMessage, t);
  if (synthetic) return synthetic;
  if (synthetic === "") return getMediaTypeFallbackLabel(lastMessageType, t) || t("noMessages");
  return (
    getTicketLastMessagePreview(lastMessage, t) ||
    getMediaTypeFallbackLabel(lastMessageType, t) ||
    t("noMessages")
  );
};
