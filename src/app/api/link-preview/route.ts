import type { IncomingMessage } from "http";
import { NextRequest, NextResponse } from "next/server";
import { fetchGuarded, parseDownloadUrl } from "../_lib/outbound-guard";

export const runtime = "nodejs";

const TIMEOUT_MS = 5000;
const BODY_TIMEOUT_MS = 10_000;
// Teto de leitura do HTML: o YouTube manda 1,4 MB e as tags og ficam perto dos 700 KB.
const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Lê o corpo até o teto ou o prazo e fecha a conexão. Uma concatenação só, no fim.
function readLimited(res: IncomingMessage, deadline: number): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      res.destroy();
      resolve(Buffer.concat(chunks, Math.min(size, MAX_HTML_BYTES)).toString("utf8"));
    };
    const timer = setTimeout(finish, Math.max(0, deadline - Date.now()));
    res.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= MAX_HTML_BYTES) finish();
    });
    res.on("end", finish);
    res.on("error", finish);
  });
}

const MAX_TAG_CHARS = 16 * 1024;

// Varreduras lineares (indexOf, sempre para a frente): regex de tag/atributo sobre
// HTML hostil é quadrática e travava o servidor do front.
function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let i = 0;
  while (i < tag.length) {
    while (i < tag.length && !/[a-zA-Z:_-]/.test(tag[i])) i++;
    const nameStart = i;
    while (i < tag.length && /[a-zA-Z:_-]/.test(tag[i])) i++;
    const name = tag.slice(nameStart, i).toLowerCase();
    while (i < tag.length && /\s/.test(tag[i])) i++;
    if (tag[i] !== "=") continue;
    i++;
    while (i < tag.length && /\s/.test(tag[i])) i++;
    const quote = tag[i];
    if (quote !== '"' && quote !== "'") continue;
    const close = tag.indexOf(quote, i + 1);
    if (close === -1) break;
    if (name) attrs[name] = tag.slice(i + 1, close);
    i = close + 1;
  }
  return attrs;
}

// Minúsculas só em A-Z: o toLowerCase() comum muda o tamanho do texto ("İ" vira 2
// caracteres) e as posições achadas aqui deixariam de valer no HTML original.
function asciiLower(html: string): string {
  return html.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

function parseMetaTags(html: string): Array<Record<string, string>> {
  const lower = asciiLower(html);
  const tags: Array<Record<string, string>> = [];
  let pos = 0;
  for (;;) {
    const start = lower.indexOf("<meta", pos);
    if (start === -1) break;
    // Fim da tag pulando o que está entre aspas ("Home > Produtos" não fecha a tag),
    // até o teto: cada caractere é visitado uma vez.
    const limit = Math.min(html.length, start + MAX_TAG_CHARS);
    let j = start + 5;
    let quote = 0;
    let found = false;
    for (; j < limit; j++) {
      const c = html.charCodeAt(j);
      if (quote) {
        if (c === quote) quote = 0;
      } else if (c === 34 || c === 39) {
        quote = c;
      } else if (c === 62) {
        found = true;
        break;
      }
    }
    pos = found ? j + 1 : j;
    if (found) tags.push(parseAttributes(html.slice(start + 5, j)));
  }
  return tags;
}

const MAX_TITLE_CANDIDATES = 20;

function extractTitle(html: string): string {
  const lower = asciiLower(html);
  let pos = 0;
  // Como a regex antiga, pula <title> vazio ou com tag dentro (o de um SVG antes do head).
  for (let n = 0; n < MAX_TITLE_CANDIDATES; n++) {
    const start = lower.indexOf("<title", pos);
    if (start === -1) return "";
    const open = lower.indexOf(">", start);
    if (open === -1) return "";
    const close = lower.indexOf("</title", open);
    if (close === -1) return "";
    const text = html.slice(open + 1, close);
    if (text && !text.includes("<") && open - start <= MAX_TAG_CHARS) return text;
    pos = open + 1;
  }
  return "";
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let res: IncomingMessage | null = null;
  try {
    const target = parseDownloadUrl(url);
    if (!target) throw new Error("invalid url");
    res = await fetchGuarded(
      target,
      {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
        // Marca de acesso de prévia (a do Safari): quem a reconhece não conta visita.
        // "Purpose: prefetch" fica de fora: há site que recusa pré-carregamento.
        "X-Purpose": "preview",
      },
      TIMEOUT_MS,
    );

    const contentType = String(res.headers["content-type"] || "");
    if (!contentType.includes("text/html")) {
      res.destroy();
      return NextResponse.json({ url, title: new URL(url).hostname });
    }

    const html = await readLimited(res, Date.now() + BODY_TIMEOUT_MS);
    const metas = parseMetaTags(html);

    const get = (prop: string): string => {
      const og = metas.find((a) => (a.property || "").toLowerCase() === `og:${prop}` && a.content);
      if (og) return og.content;
      const named = metas.find((a) => (a.name || "").toLowerCase() === prop && a.content);
      return named?.content || "";
    };

    const rawTitle = get("title") || extractTitle(html).trim() || "";
    const ERROR_PAGE = /^(404|403|500|502|503|page not found|not found|access denied|forbidden|error)\b/i;
    const title = rawTitle && !ERROR_PAGE.test(rawTitle) ? rawTitle : new URL(url).hostname;
    const description = get("description");
    const image = ERROR_PAGE.test(rawTitle) ? "" : get("image");

    // Make image URL absolute
    let imageUrl = image;
    if (imageUrl && !imageUrl.startsWith("http")) {
      const base = new URL(url);
      imageUrl = imageUrl.startsWith("/")
        ? `${base.protocol}//${base.host}${imageUrl}`
        : `${base.protocol}//${base.host}/${imageUrl}`;
    }

    return NextResponse.json({
      url,
      title: title.substring(0, 200),
      description: description.substring(0, 300),
      image: imageUrl,
      hostname: new URL(url).hostname,
    });
  } catch {
    res?.destroy();
    return NextResponse.json({ url, hostname: (() => { try { return new URL(url).hostname; } catch { return url; } })() });
  }
}
