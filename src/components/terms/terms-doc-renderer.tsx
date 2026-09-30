import React from "react";
import { cn } from "@/lib/utils";
import {
  TERMS_DOC_PROSE,
  isSafeTermsHref,
  type TermsDocMark,
  type TermsDocNode,
  type TermsSection,
} from "@/lib/terms-doc";

// PLANO_ACEITE_TERMOS_REVENDA §5.5 — desenha o JSON do TipTap como nós React.
// NUNCA usa innerHTML. Sem hooks e sem "use client": serve em qualquer página.
// Nó ou marca desconhecido → renderiza só os filhos/texto (defensivo; o backend
// já recusa). Estilo vem de TERMS_DOC_PROSE (o mesmo do editor).

const ORDERED_LIST_TYPES = new Set(["1", "a", "A", "i", "I"]);

function applyMarks(text: React.ReactNode, marks: TermsDocMark[] | undefined, key: string): React.ReactNode {
  let out = text;
  (marks || []).forEach((mark, index) => {
    const markKey = `${key}-m${index}`;
    switch (mark.type) {
      case "bold":
        out = <strong key={markKey}>{out}</strong>;
        break;
      case "italic":
        out = <em key={markKey}>{out}</em>;
        break;
      case "underline":
        out = <u key={markKey}>{out}</u>;
        break;
      case "strike":
        out = <s key={markKey}>{out}</s>;
        break;
      case "link": {
        const href = mark.attrs?.href;
        if (isSafeTermsHref(href)) {
          out = (
            <a key={markKey} href={href.trim()} target="_blank" rel="noopener noreferrer nofollow">
              {out}
            </a>
          );
        }
        break;
      }
      default:
        break;
    }
  });
  return out;
}

function renderChildren(node: TermsDocNode, key: string): React.ReactNode[] {
  return (node.content || []).map((child, index) => renderNode(child, `${key}-${index}`));
}

function renderNode(node: TermsDocNode, key: string): React.ReactNode {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "text":
      return (
        <React.Fragment key={key}>
          {applyMarks(typeof node.text === "string" ? node.text : "", node.marks, key)}
        </React.Fragment>
      );
    case "paragraph":
      return <p key={key}>{renderChildren(node, key)}</p>;
    case "heading": {
      const level = Number(node.attrs?.level);
      if (level === 1) return <h1 key={key}>{renderChildren(node, key)}</h1>;
      if (level === 2) return <h2 key={key}>{renderChildren(node, key)}</h2>;
      return <h3 key={key}>{renderChildren(node, key)}</h3>;
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node, key)}</ul>;
    case "orderedList": {
      const start = Number(node.attrs?.start);
      const rawType = node.attrs?.type;
      const listType =
        typeof rawType === "string" && ORDERED_LIST_TYPES.has(rawType)
          ? (rawType as "1" | "a" | "A" | "i" | "I")
          : undefined;
      return (
        <ol
          key={key}
          start={Number.isInteger(start) && start > 1 ? start : undefined}
          type={listType}
          style={listType && listType !== "1" ? { listStyleType: listStyleFor(listType) } : undefined}
        >
          {renderChildren(node, key)}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{renderChildren(node, key)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node, key)}</blockquote>;
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "doc":
      return <React.Fragment key={key}>{renderChildren(node, key)}</React.Fragment>;
    default:
      return <React.Fragment key={key}>{renderChildren(node, key)}</React.Fragment>;
  }
}

// O `list-decimal` do Tailwind sobrescreve o atributo `type` do <ol>.
function listStyleFor(type: "a" | "A" | "i" | "I"): string {
  if (type === "a") return "lower-alpha";
  if (type === "A") return "upper-alpha";
  if (type === "i") return "lower-roman";
  return "upper-roman";
}

interface TermsDocRendererProps {
  doc?: TermsDocNode | null;
  sections?: TermsSection[] | null;
  className?: string;
}

export function TermsDocRenderer({ doc, sections, className }: TermsDocRendererProps) {
  if (sections && sections.length) {
    return (
      <div className={cn(TERMS_DOC_PROSE, className)}>
        {sections.map((section, index) => (
          <section key={section.id || `s${index}`}>
            <h2>{section.title}</h2>
            {section.doc ? renderNode(section.doc, `s${index}`) : null}
          </section>
        ))}
      </div>
    );
  }
  return <div className={cn(TERMS_DOC_PROSE, className)}>{doc ? renderNode(doc, "d") : null}</div>;
}

export default TermsDocRenderer;
