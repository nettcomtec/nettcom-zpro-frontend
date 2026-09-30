// PLANO_ACEITE_TERMOS_REVENDA §5.5 — tipos, limites e regras compartilhadas dos
// termos do revendedor. PARIDADE com o backend
// (backend/src/services/ResellerTermsServices/ResellerTermsContentZPRO.ts):
// limites, protocolos de link e regra de contagem de caracteres têm de ser iguais.

export interface TermsDocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TermsDocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TermsDocNode[];
  text?: string;
  marks?: TermsDocMark[];
}

export interface TermsSection {
  id: string;
  title: string;
  doc: TermsDocNode;
}

export const TERMS_MAX_SECTIONS = 8;
export const TERMS_MAX_CHARS = 200000;
export const TERMS_MAX_TITLE = 120;
export const TERMS_MAX_HREF = 2048;

const LINK_PROTOCOLS = ["http:", "https:", "mailto:"];

export function isSafeTermsHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  const value = href.trim();
  if (!value || value.length > TERMS_MAX_HREF) return false;
  try {
    return LINK_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Mesma regra do backend: texto + títulos + hrefs de link (em unidades UTF-16).
export function countTermsChars(sections: TermsSection[]): number {
  let total = 0;
  const walk = (node: TermsDocNode | undefined): void => {
    if (!node) return;
    if (node.type === "text" && typeof node.text === "string") {
      total += node.text.length;
      for (const mark of node.marks || []) {
        if (mark.type === "link" && typeof mark.attrs?.href === "string") {
          total += String(mark.attrs.href).trim().length;
        }
      }
    }
    for (const child of node.content || []) walk(child);
  };
  for (const section of sections) {
    total += (section.title || "").trim().length;
    walk(section.doc);
  }
  return total;
}

export function newSectionId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function emptyTermsDoc(): TermsDocNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

// Classes tipográficas do editor e do renderer: o literal mora em
// components/terms/terms-doc-prose.ts porque o tailwind.config.ts não varre src/lib/.
export { TERMS_DOC_PROSE } from "@/components/terms/terms-doc-prose";
