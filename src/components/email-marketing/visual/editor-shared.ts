import { useCallback, useRef, useSyncExternalStore } from "react";
import DOMPurify from "dompurify";
import { useTranslations } from "next-intl";
import {
  Heading,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  MoveVertical,
  Type,
  type LucideIcon,
} from "lucide-react";
import { readApiError } from "@/services/email-marketing";
import {
  EMAIL_GIF_MAX_BYTES,
  EMAIL_IMAGE_MAX_BYTES,
  type EmailBlock,
  type EmailBlockType,
} from "@/lib/email-design";

/** Editor visual de e-mail — utilitários internos (PLANO_EMAIL_EDITOR_VISUAL §5 Passo 3) */

export const HISTORY_LIMIT = 50;
/** Digitação/arraste de cor no mesmo campo dentro desta janela vira UM passo de desfazer */
export const HISTORY_GROUP_MS = 750;
export const CANVAS_DROP_ID = "email-canvas-drop";
export const PALETTE_DRAG_PREFIX = "email-palette:";
/** Mesmo corte do `lg` do Tailwind: abaixo dele o editor empilha e as propriedades vão para o Sheet */
export const DESKTOP_QUERY = "(min-width: 1024px)";
export const EMAIL_IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

export type PaletteDragData = {
  from: "palette";
  type: EmailBlockType;
};

export const BLOCK_ICONS: Record<EmailBlockType, LucideIcon> = {
  heading: Heading,
  text: Type,
  image: ImageIcon,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
};

/** Nome do bloco — imagem e divisor reaproveitam as chaves do editor clássico */
export function useBlockLabel(): (type: EmailBlockType) => string {
  const t = useTranslations("emailVisualEditor");
  const tm = useTranslations("emailMarketingPage");
  return useCallback(
    (type: EmailBlockType) => {
      switch (type) {
        case "heading":
          return t("blockHeading");
        case "text":
          return t("blockText");
        case "image":
          return tm("editorImage");
        case "button":
          return t("blockButton");
        case "divider":
          return tm("editorHr");
        default:
          return t("blockSpacer");
      }
    },
    [t, tm]
  );
}

/** Trecho curto do bloco para o nome acessível do cartão no canvas */
export function blockExcerpt(block: EmailBlock): string {
  let raw = "";
  if (block.type === "heading" || block.type === "text" || block.type === "button") raw = block.text;
  else if (block.type === "image") raw = block.alt;
  return raw.replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Ref sempre com o valor mais recente — callbacks estáveis sem fechar sobre valor velho */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

const noopSubscribe = () => () => {};

/** false no servidor e na hidratação, true no navegador — evita HTML divergente na hidratação */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query);
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
      }
      mql.addListener?.(onChange);
      return () => mql.removeListener?.(onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false
  );
}

/**
 * DOMPurify só funciona com DOM: no servidor `sanitize` nem existe. Sem DOM não injeta
 * nada (string vazia) — o conteúdo aparece no navegador, depois da hidratação.
 */
export function sanitizeEmailMarkup(html: string): string {
  if (typeof window === "undefined" || typeof DOMPurify?.sanitize !== "function") return "";
  return DOMPurify.sanitize(String(html || ""));
}

export function scheduleFrame(callback: () => void): void {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => callback());
  } else {
    setTimeout(callback, 0);
  }
}

/** Atalhos do editor (desfazer/refazer) não roubam o desfazer nativo dos campos de texto */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}

/** Clique num toast (fora da janela) não pode fechar o editor nem descartar o trabalho */
export function isToastTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("[data-sonner-toaster], [data-sonner-toast]");
}

export function insertAtSelection(
  current: string,
  start: number | null | undefined,
  end: number | null | undefined,
  token: string
): { value: string; caret: number } {
  const length = current.length;
  const from = start == null ? length : Math.max(0, Math.min(start, length));
  const to = end == null ? from : Math.max(from, Math.min(end, length));
  return { value: current.slice(0, from) + token + current.slice(to), caret: from + token.length };
}

/** Nome do arquivo exportado: título do e-mail sem acento/símbolo (nunca marca) */
export function designFileSlug(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[^ -~]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function downloadTextFile(fileName: string, text: string, type = "application/json"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function isGifFile(type?: string | null, name?: string | null): boolean {
  return /^image\/gif$/i.test(String(type || "").trim()) || /\.gif$/i.test(String(name || "").trim());
}

/** Pré-checagem do navegador; quem decide o formato de verdade é o servidor (pelos bytes) */
export function isAcceptedImageType(type?: string | null, name?: string | null): boolean {
  const mime = String(type || "").trim();
  if (mime) return /^image\/(?:png|jpeg|gif|webp)$/i.test(mime);
  return /\.(?:png|jpe?g|gif|webp)$/i.test(String(name || "").trim());
}

export function imageTooLarge(size: number, gif: boolean): boolean {
  return size > EMAIL_IMAGE_MAX_BYTES || (gif && size > EMAIL_GIF_MAX_BYTES);
}

/**
 * Chave i18n (namespace emailVisualEditor) do erro de envio de imagem. Códigos
 * específicos primeiro: a cota também responde 413, e não é "imagem grande demais".
 */
export function imageErrorKey(err: unknown): string {
  const { status, code } = readApiError(err);
  if (code === "ERR_EMAIL_ASSET_TYPE") return "imageErrorType";
  if (code === "ERR_EMAIL_ASSET_ANIMATED_WEBP") return "imageErrorAnimatedWebp";
  if (code === "ERR_EMAIL_ASSET_QUOTA") return "imageErrorQuota";
  if (code === "ERR_EMAIL_ASSET_DISK" || code === "ERR_EMAIL_ASSET_BASE_URL") return "imageErrorServer";
  if (code === "ERR_EMAIL_ASSET_BUSY" || status === 429) return "imageErrorRate";
  if (code === "ERR_EMAIL_ASSET_TOO_LARGE" || code === "LIMIT_FILE_SIZE" || status === 413) return "imageErrorSize";
  return "imageErrorGeneric";
}
