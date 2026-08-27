// Quebra um texto em trechos comuns e links clicaveis (http/https, www. e e-mail).
//
// Usado onde o corpo e exibido como texto puro e NAO pode passar pelo markdown
// do WhatsApp (formatWhatsApp) — caso das notas do atendimento, que carregam
// codigos em que "*", "_" e "~" fazem parte do conteudo (PIX copia-e-cola,
// linha digitavel de boleto). Por isso tambem nao existe deteccao de dominio
// "solto" (ex.: site.com.br): o payload do PIX embute dominios e viraria link.
export type LinkifyPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const LINK_RE =
  /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/gi;

// Pontuacao que encosta no fim da URL sem fazer parte dela ("veja https://x.com.").
function trimTrailingPunctuation(raw: string): string {
  let url = raw;
  while (url.length > 1 && /[.,;:!?'")\]}>]$/.test(url)) {
    if (url.endsWith(")")) {
      const opens = (url.match(/\(/g) ?? []).length;
      const closes = (url.match(/\)/g) ?? []).length;
      if (opens >= closes) break; // ")" fecha um "(" da propria URL
    }
    url = url.slice(0, -1);
  }
  return url;
}

export function linkifyParts(text: string | null | undefined): LinkifyPart[] {
  const parts: LinkifyPart[] = [];
  if (!text) return parts;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;

  while ((match = LINK_RE.exec(text)) !== null) {
    const value = trimTrailingPunctuation(match[0]);
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const isUrl = /^(https?:\/\/|www\.)/i.test(value);
    parts.push({
      type: "link",
      value,
      href: isUrl
        ? (/^www\./i.test(value) ? `https://${value}` : value)
        : `mailto:${value}`,
    });
    lastIndex = match.index + value.length;
    // A pontuacao removida volta para o fluxo de texto na proxima varredura.
    LINK_RE.lastIndex = lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}
