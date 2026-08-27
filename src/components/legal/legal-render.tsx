import React from "react";
import { legalHref, type LegalCtx } from "./legal-common";

/*
 * Renderer dos documentos legais a partir de strings com marcação mínima
 * (markdown-mini), para que o conteúdo nos 13 idiomas seja dado puro em
 * legal-strings/<lang>.ts:
 *   - **negrito**
 *   - [rótulo](https://...)  → link externo (nova aba)
 *   - [rótulo](/rota)        → link interno (preserva ?lang=)
 *   - [rótulo](#ancora)      → âncora na própria página
 *   - {appName} {host} {baseUrl} → placeholders do contexto
 */

export type LegalBlock = { p: string } | { list: string[] };

export interface LegalDocStrings {
  title: string;
  updated: string;
  metaDescription: string;
  intro: string;
  sections: { id?: string; title: string; blocks: LegalBlock[] }[];
  footer: string;
}

export interface LegalStrings {
  privacy: LegalDocStrings;
  terms: LegalDocStrings;
}

function fill(text: string, ctx: LegalCtx): string {
  return text
    .replaceAll("{appName}", ctx.appName)
    .replaceAll("{host}", ctx.host)
    .replaceAll("{baseUrl}", ctx.baseUrl);
}

const INLINE_RE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, ctx: LegalCtx): React.ReactNode {
  const parts = fill(text, ctx).split(INLINE_RE);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) {
      const [, label, href] = m;
      if (href.startsWith("http")) {
        return (
          <a key={i} href={href} className="underline" rel="noreferrer" target="_blank">
            {label}
          </a>
        );
      }
      return (
        <a key={i} href={href.startsWith("/") ? legalHref(href, ctx.lang) : href} className="underline">
          {label}
        </a>
      );
    }
    return part;
  });
}

function renderBlock(block: LegalBlock, ctx: LegalCtx, key: number): React.ReactNode {
  if ("list" in block) {
    return (
      <ul key={key} className="list-disc ps-5 space-y-1">
        {block.list.map((item, i) => (
          <li key={i}>{renderInline(item, ctx)}</li>
        ))}
      </ul>
    );
  }
  return <p key={key}>{renderInline(block.p, ctx)}</p>;
}

export function LegalDocBody({ doc, ctx }: { doc: LegalDocStrings; ctx: LegalCtx }) {
  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">{renderInline(doc.intro, ctx)}</p>
      {doc.sections.map((section, si) => (
        <section key={si} id={section.id} className="scroll-mt-24">
          <h2 className="text-xl font-semibold mt-8 mb-3">{renderInline(section.title, ctx)}</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {section.blocks.map((block, bi) => renderBlock(block, ctx, bi))}
          </div>
        </section>
      ))}
    </>
  );
}

export function LegalDocFooter({ doc, ctx }: { doc: LegalDocStrings; ctx: LegalCtx }) {
  return <p>{renderInline(doc.footer, ctx)}</p>;
}
