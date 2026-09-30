import { z } from "zod";

/**
 * Editor visual de e-mail — modelo, validação e render (PLANO_EMAIL_EDITOR_VISUAL §5 Passo 0.1).
 *
 * REGRA DE OURO: o render emite SÓ os estilos/atributos que o sanitizador de e-mail do
 * backend preserva (backend/src/middleware/sanitizeEmailMiddlewareZPRO.ts). Mudar um lado
 * exige mudar o outro e rodar o script de paridade do plano (§9) — senão o e-mail salvo
 * perde formatação em silêncio.
 *
 * Sem i18n aqui: textos (modelos prontos, blocos novos) entram por parâmetro.
 */

export const EMAIL_DESIGN_VERSION = 1;
export const MAX_BLOCKS = 100;
/** Orçamentos em BYTES UTF-8 — abaixo do fieldSize de 1 MiB do multer/busboy do backend */
export const MAX_DESIGN_BYTES = 900 * 1024;
export const MAX_HTML_BYTES = 900 * 1024;
export const MAX_DESIGN_FILE_BYTES = MAX_DESIGN_BYTES + 4 * 1024;
/** Acima de ~102 KB o Gmail corta o e-mail ("Mensagem cortada") e esconde o descadastro */
export const GMAIL_CLIP_WARN_BYTES = 90 * 1024;
export const MOBILE_PREVIEW_WIDTH = 375;
export const EMAIL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const EMAIL_GIF_MAX_BYTES = 3 * 1024 * 1024;

export const EMAIL_BLOCK_TYPES = ["heading", "text", "image", "button", "divider", "spacer"] as const;
export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number];

export const EMAIL_FONT_KEYS = ["arial", "helvetica", "georgia", "verdana", "tahoma", "trebuchet"] as const;
export type EmailFontKey = (typeof EMAIL_FONT_KEYS)[number];

/** Pilhas sem aspas (nomes com espaço são identificadores válidos em CSS) — evita entidades no style */
export const EMAIL_FONT_STACKS: Record<EmailFontKey, string> = {
  arial: "Arial,Helvetica,sans-serif",
  helvetica: "Helvetica,Arial,sans-serif",
  georgia: "Georgia,Times New Roman,serif",
  verdana: "Verdana,Geneva,sans-serif",
  tahoma: "Tahoma,Geneva,sans-serif",
  trebuchet: "Trebuchet MS,Helvetica,sans-serif"
};

/** Espelho do que o render emite — o teste garante que nada fora disto sai no HTML */
export const EMAIL_RENDER_STYLE_ALLOWLIST = [
  "margin",
  "padding",
  "font-family",
  "font-size",
  "line-height",
  "color",
  "font-weight",
  "font-style",
  "text-align",
  "overflow-wrap",
  "display",
  "width",
  "max-width",
  "height",
  "border",
  "border-radius",
  "background-color",
  "text-decoration",
  "table-layout"
] as const;

export const EMAIL_RENDER_ATTRIBUTE_ALLOWLIST: Record<string, readonly string[]> = {
  table: ["role", "width", "cellpadding", "cellspacing", "border", "bgcolor", "align", "dir", "style"],
  tbody: [],
  tr: [],
  td: ["align", "valign", "width", "bgcolor", "style"],
  img: ["src", "alt", "width", "style"],
  a: ["href", "target", "style"],
  span: ["style"],
  h2: ["style"],
  p: ["style"],
  div: ["style"],
  br: []
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const NO_SPACE_OR_CONTROL = /^[^\s\u0000-\u001f\u007f]*$/;
const HREF_SCHEME = /^(?:https?:\/\/|mailto:|tel:)/i;
const SRC_SCHEME = /^https?:\/\//i;
const TOKEN_RE = /\{\{\s*\w+\s*\}\}/g;

const color = z.string().regex(HEX_COLOR);
const blockId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const align = z.enum(["left", "center", "right"]);
const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Link: vazio (pendência) ou esquema LITERAL — token no início deixaria o dado do contato definir o esquema */
const hrefField = z
  .string()
  .max(2048)
  .refine(v => v === "" || (HREF_SCHEME.test(v) && NO_SPACE_OR_CONTROL.test(v)));
const srcField = z
  .string()
  .max(2048)
  .refine(v => v === "" || (SRC_SCHEME.test(v) && NO_SPACE_OR_CONTROL.test(v)));

const blockBase = {
  id: blockId,
  backgroundColor: color,
  padding: int(0, 80)
};

const textStyle = {
  align,
  color,
  fontSize: int(10, 64),
  bold: z.boolean(),
  italic: z.boolean()
};

const headingBlockSchema = z
  .object({ type: z.literal("heading"), ...blockBase, ...textStyle, text: z.string().max(500) })
  .strict();
const textBlockSchema = z
  .object({ type: z.literal("text"), ...blockBase, ...textStyle, text: z.string().max(5000) })
  .strict();
const imageBlockSchema = z
  .object({
    type: z.literal("image"),
    ...blockBase,
    src: srcField,
    alt: z.string().max(300),
    widthPercent: int(10, 100),
    align
  })
  .strict();
const buttonBlockSchema = z
  .object({
    type: z.literal("button"),
    ...blockBase,
    text: z.string().max(200),
    href: hrefField,
    align,
    textColor: color,
    buttonColor: color,
    fontSize: int(10, 64),
    bold: z.boolean(),
    italic: z.boolean(),
    radius: int(0, 40)
  })
  .strict();
const dividerBlockSchema = z
  .object({ type: z.literal("divider"), ...blockBase, color, thickness: int(1, 20) })
  .strict();
const spacerBlockSchema = z
  .object({ type: z.literal("spacer"), ...blockBase, height: int(4, 160) })
  .strict();

const blockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  textBlockSchema,
  imageBlockSchema,
  buttonBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema
]);

const settingsSchema = z
  .object({
    backgroundColor: color,
    contentWidth: int(320, 700),
    direction: z.enum(["ltr", "rtl"]),
    fontFamily: z.enum(EMAIL_FONT_KEYS)
  })
  .strict();

export const emailDesignSchema = z
  .object({
    version: z.literal(EMAIL_DESIGN_VERSION),
    settings: settingsSchema,
    blocks: z.array(blockSchema).max(MAX_BLOCKS)
  })
  .strict()
  .superRefine((design, ctx) => {
    const ids = new Set<string>();
    for (const block of design.blocks) {
      if (ids.has(block.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate block id" });
        return;
      }
      ids.add(block.id);
    }
  });

export type EmailHeadingBlock = z.infer<typeof headingBlockSchema>;
export type EmailTextBlock = z.infer<typeof textBlockSchema>;
export type EmailImageBlock = z.infer<typeof imageBlockSchema>;
export type EmailButtonBlock = z.infer<typeof buttonBlockSchema>;
export type EmailDividerBlock = z.infer<typeof dividerBlockSchema>;
export type EmailSpacerBlock = z.infer<typeof spacerBlockSchema>;
export type EmailBlock = z.infer<typeof blockSchema>;
export type EmailDesignSettings = z.infer<typeof settingsSchema>;
export type EmailDesign = z.infer<typeof emailDesignSchema>;
export type EmailAlign = z.infer<typeof align>;

export type EmailBlockIssue = "text" | "imageSrc" | "href";

/** Textos dos blocos novos e dos modelos prontos (resolvidos pelo componente via i18n) */
export interface EmailBlockTexts {
  heading: string;
  text: string;
  button: string;
}

// ── Utilitários ─────────────────────────────────────────────────────────────

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(String(value ?? "")).length;
}

export function getDesignBytes(design: EmailDesign): number {
  return utf8Bytes(JSON.stringify(design));
}

export function newBlockId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `b${random.slice(0, 20)}`;
}

/** Valida sem lançar: design vindo do backend (objeto JSONB), do rascunho ou de arquivo */
export function parseEmailDesign(input: unknown): EmailDesign | null {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const parsed = emailDesignSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Design de versão futura do editor — o front atual não pode reescrevê-lo */
export function isNewerDesign(input: unknown): boolean {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  const version = (value as { version?: unknown } | null)?.version;
  return typeof version === "number" && version > EMAIL_DESIGN_VERSION;
}

export function isValidEmailHref(value: string): boolean {
  const href = String(value || "").trim();
  if (!href || href.length > 2048 || !NO_SPACE_OR_CONTROL.test(href) || !HREF_SCHEME.test(href)) {
    return false;
  }
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href.replace(TOKEN_RE, "x"));
      return !!url.hostname && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  return href.slice(href.indexOf(":") + 1).length > 0;
}

export function isValidEmailImageSrc(value: string): boolean {
  const src = String(value || "").trim();
  if (!src || src.length > 2048 || !NO_SPACE_OR_CONTROL.test(src) || !SRC_SCHEME.test(src)) {
    return false;
  }
  try {
    const url = new URL(src.replace(TOKEN_RE, "x"));
    return !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Imagem sem https: só aviso (alguns clientes bloqueiam), nunca bloqueia */
export function isInsecureImage(src: string): boolean {
  return /^http:\/\//i.test(String(src || "").trim());
}

export function getBlockIssue(block: EmailBlock): EmailBlockIssue | null {
  switch (block.type) {
    case "heading":
    case "text":
      return block.text.trim() ? null : "text";
    case "button":
      if (!block.text.trim()) return "text";
      return isValidEmailHref(block.href) ? null : "href";
    case "image":
      return isValidEmailImageSrc(block.src) ? null : "imageSrc";
    default:
      return null;
  }
}

export function countDesignIssues(design: EmailDesign): number {
  return design.blocks.reduce((count, block) => (getBlockIssue(block) ? count + 1 : count), 0);
}

// ── Construção ──────────────────────────────────────────────────────────────

export function createEmptyDesign(direction: "ltr" | "rtl" = "ltr"): EmailDesign {
  return {
    version: EMAIL_DESIGN_VERSION,
    settings: {
      backgroundColor: "#f1f5f9",
      contentWidth: 600,
      direction,
      fontFamily: "arial"
    },
    blocks: []
  };
}

export function createBlock(type: EmailBlockType, texts?: Partial<EmailBlockTexts>): EmailBlock {
  const id = newBlockId();
  switch (type) {
    case "heading":
      return {
        type,
        id,
        backgroundColor: "#ffffff",
        padding: 20,
        text: texts?.heading ?? "",
        align: "center",
        color: "#111827",
        fontSize: 28,
        bold: true,
        italic: false
      };
    case "text":
      return {
        type,
        id,
        backgroundColor: "#ffffff",
        padding: 20,
        text: texts?.text ?? "",
        align: "left",
        color: "#374151",
        fontSize: 16,
        bold: false,
        italic: false
      };
    case "image":
      return {
        type,
        id,
        backgroundColor: "#ffffff",
        padding: 20,
        src: "",
        alt: "",
        widthPercent: 100,
        align: "center"
      };
    case "button":
      return {
        type,
        id,
        backgroundColor: "#ffffff",
        padding: 20,
        text: texts?.button ?? "",
        href: "",
        align: "center",
        textColor: "#ffffff",
        buttonColor: "#2563eb",
        fontSize: 16,
        bold: true,
        italic: false,
        radius: 6
      };
    case "divider":
      return { type, id, backgroundColor: "#ffffff", padding: 20, color: "#e5e7eb", thickness: 1 };
    case "spacer":
    default:
      return { type: "spacer", id, backgroundColor: "#ffffff", padding: 0, height: 24 };
  }
}

/** Insere após `index` (ou no fim); respeita MAX_BLOCKS */
export function insertBlock(design: EmailDesign, block: EmailBlock, index?: number): EmailDesign {
  if (design.blocks.length >= MAX_BLOCKS) return design;
  const blocks = [...design.blocks];
  const at = index === undefined || index < 0 || index > blocks.length ? blocks.length : index;
  blocks.splice(at, 0, block);
  return { ...design, blocks };
}

export function moveBlock(design: EmailDesign, from: number, to: number): EmailDesign {
  if (from === to || from < 0 || to < 0 || from >= design.blocks.length || to >= design.blocks.length) {
    return design;
  }
  const blocks = [...design.blocks];
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return { ...design, blocks };
}

export function duplicateBlock(design: EmailDesign, id: string): EmailDesign {
  const index = design.blocks.findIndex(b => b.id === id);
  if (index < 0 || design.blocks.length >= MAX_BLOCKS) return design;
  const copy = { ...design.blocks[index], id: newBlockId() } as EmailBlock;
  return insertBlock(design, copy, index + 1);
}

export function removeBlock(design: EmailDesign, id: string): EmailDesign {
  return { ...design, blocks: design.blocks.filter(b => b.id !== id) };
}

export function updateBlock(design: EmailDesign, id: string, patch: Partial<EmailBlock>): EmailDesign {
  return {
    ...design,
    blocks: design.blocks.map(b => (b.id === id ? ({ ...b, ...patch, id: b.id, type: b.type } as EmailBlock) : b))
  };
}

export type EmailStarterKind = "welcome" | "news";

export interface EmailStarterTexts {
  heading: string;
  text: string;
  button: string;
}

export function buildStarterDesign(
  kind: EmailStarterKind,
  texts: EmailStarterTexts,
  direction: "ltr" | "rtl" = "ltr"
): EmailDesign {
  const design = createEmptyDesign(direction);
  const heading = { ...createBlock("heading", { heading: texts.heading }), backgroundColor: "#eef2ff" } as EmailBlock;
  const text = createBlock("text", { text: texts.text });
  const button = createBlock("button", { button: texts.button });
  const blocks: EmailBlock[] =
    kind === "news" ? [heading, text, createBlock("divider"), button] : [heading, text, button];
  return { ...design, blocks };
}

// ── Render ──────────────────────────────────────────────────────────────────

export function escapeEmailText(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const textToHtml = (value: string): string => escapeEmailText(value).replace(/\r?\n/g, "<br>");

/** Valores já validados pelo schema (números, cores hex, enums, pilhas de fonte sem aspas) */
const css = (declarations: Array<[string, string | number]>): string =>
  declarations.map(([prop, value]) => `${prop}:${value}`).join(";");

export interface RenderBlockOptions {
  /** Canvas do editor: `<a>` vira `<span>` (nada clicável dentro do painel) */
  forCanvas?: boolean;
}

function renderBlockContent(block: EmailBlock, design: EmailDesign, options: RenderBlockOptions): string {
  const fontStack = EMAIL_FONT_STACKS[design.settings.fontFamily] || EMAIL_FONT_STACKS.arial;

  if (block.type === "heading" || block.type === "text") {
    const tag = block.type === "heading" ? "h2" : "p";
    const style = css([
      ["margin", "0"],
      ["font-family", fontStack],
      ["font-size", `${block.fontSize}px`],
      ["line-height", block.type === "heading" ? "1.3" : "1.6"],
      ["color", block.color],
      ["font-weight", block.bold ? "700" : "400"],
      ["font-style", block.italic ? "italic" : "normal"],
      ["text-align", block.align],
      ["overflow-wrap", "break-word"]
    ]);
    return `<${tag} style="${style}">${textToHtml(block.text)}</${tag}>`;
  }

  if (block.type === "image") {
    if (!isValidEmailImageSrc(block.src)) return "";
    const contentPx = Math.max(1, design.settings.contentWidth - block.padding * 2);
    const imagePx = Math.max(1, Math.round((contentPx * block.widthPercent) / 100));
    const margin = block.align === "center" ? "0 auto" : block.align === "right" ? "0 0 0 auto" : "0";
    const style = css([
      ["display", "block"],
      ["width", `${block.widthPercent}%`],
      ["max-width", `${imagePx}px`],
      ["height", "auto"],
      ["border", "0"],
      ["margin", margin]
    ]);
    return `<img src="${escapeEmailText(block.src.trim())}" alt="${escapeEmailText(block.alt)}" width="${imagePx}" style="${style}">`;
  }

  if (block.type === "button") {
    const linkStyle = css([
      ["display", "inline-block"],
      ["padding", "12px 24px"],
      ["font-family", fontStack],
      ["font-size", `${block.fontSize}px`],
      ["line-height", "1.2"],
      ["color", block.textColor],
      ["font-weight", block.bold ? "700" : "400"],
      ["font-style", block.italic ? "italic" : "normal"],
      ["text-decoration", "none"],
      ["border-radius", `${block.radius}px`],
      ["background-color", block.buttonColor]
    ]);
    const cellStyle = css([
      ["border-radius", `${block.radius}px`],
      ["background-color", block.buttonColor]
    ]);
    const label = textToHtml(block.text);
    // Link vazio (pendência) não emite href — o sanitizador removeria `href=""` e a paridade quebraria
    const href = block.href.trim();
    const hrefAttr = href ? ` href="${escapeEmailText(href)}"` : "";
    const inner = options.forCanvas
      ? `<span style="${linkStyle}">${label}</span>`
      : `<a${hrefAttr} target="_blank" style="${linkStyle}">${label}</a>`;
    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${block.align}">` +
      `<tbody><tr><td align="center" bgcolor="${block.buttonColor}" style="${cellStyle}">${inner}</td></tr></tbody></table>`
    );
  }

  if (block.type === "divider") {
    const style = css([
      ["height", `${block.thickness}px`],
      ["line-height", `${block.thickness}px`],
      ["font-size", "1px"],
      ["background-color", block.color]
    ]);
    return (
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
      `<tbody><tr><td bgcolor="${block.color}" style="${style}">&nbsp;</td></tr></tbody></table>`
    );
  }

  // spacer
  const spacer = block as EmailSpacerBlock;
  const style = css([
    ["height", `${spacer.height}px`],
    ["line-height", `${spacer.height}px`],
    ["font-size", "1px"]
  ]);
  return `<div style="${style}">&nbsp;</div>`;
}

function renderBlockRow(block: EmailBlock, design: EmailDesign, options: RenderBlockOptions): string {
  const cellAlign = "align" in block ? block.align : "left";
  const cellStyle = css([
    ["padding", `${block.padding}px`],
    ["background-color", block.backgroundColor]
  ]);
  return (
    `<tr><td align="${cellAlign}" bgcolor="${block.backgroundColor}" style="${cellStyle}">` +
    `${renderBlockContent(block, design, options)}</td></tr>`
  );
}

/** HTML de UM bloco (canvas do editor) — embrulhado numa tabela própria */
export function renderBlockHtml(block: EmailBlock, design: EmailDesign, options: RenderBlockOptions = {}): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tbody>${renderBlockRow(block, design, options)}</tbody></table>`
  );
}

/** HTML final do e-mail — o que vai para `html` do modelo/envio. Vazio quando não há blocos. */
export function renderEmailHtml(design: EmailDesign): string {
  if (!design.blocks.length) return "";
  const { backgroundColor, contentWidth, direction } = design.settings;
  const rows = design.blocks.map(block => renderBlockRow(block, design, {})).join("");
  // table-layout:fixed na externa: sem ele a célula cresce até caber a interna de {w}px e o
  // `max-width:100%` nunca encolhe no celular (rolagem lateral). O Outlook desktop, que
  // ignora max-width, segue com a largura fixa da interna.
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${backgroundColor}" dir="${direction}" style="${css([
      ["background-color", backgroundColor],
      ["table-layout", "fixed"]
    ])}">` +
    `<tbody><tr><td align="center" style="${css([["padding", "24px 8px"]])}">` +
    `<table role="presentation" width="${contentWidth}" cellpadding="0" cellspacing="0" border="0" align="center" style="${css([
      ["width", `${contentWidth}px`],
      ["max-width", "100%"]
    ])}">` +
    `<tbody>${rows}</tbody></table>` +
    `</td></tr></tbody></table>`
  );
}

// Host das imagens hospedadas pelo servidor: NÃO é reescrito no front. Só o backend sabe se
// uma imagem é desta instalação (assinatura válida) — projeto importado de outra instalação
// ficaria com imagem quebrada. A reescrita acontece no envio (RenderEmailForRecipientService).

// ── Arquivo de projeto (exportar/importar) ──────────────────────────────────

export const EMAIL_DESIGN_FILE_TYPE = "email-design";

export function serializeDesignFile(design: EmailDesign): string {
  return JSON.stringify({ type: EMAIL_DESIGN_FILE_TYPE, version: EMAIL_DESIGN_VERSION, design }, null, 2);
}

export function parseDesignFile(text: string): EmailDesign | null {
  if (typeof text !== "string" || utf8Bytes(text) > MAX_DESIGN_FILE_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.type !== EMAIL_DESIGN_FILE_TYPE) return null;
    return parseEmailDesign(parsed.design);
  } catch {
    return null;
  }
}
