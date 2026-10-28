import type { jsPDF } from "jspdf";
import { bcp47ForLocale } from "@/lib/format";

/**
 * Fonte Unicode dos PDFs montados no navegador (conversa exportada e relatório de
 * campanha). A helvetica embutida no jsPDF só desenha Latin-1 mais a pontuação do
 * WinAnsi; com a tela em russo, turco, japonês ou chinês o PDF baixa, NA HORA de ser
 * gerado, uma Noto Sans reduzida servida pelo próprio front (`public/fonts/pdf/`,
 * gerada por `extra/pdf-fonts/gerar-fontes-pdf.mjs`; nenhum terceiro). Os demais
 * idiomas não baixam nada: pt/en/es/de/fr/it/id cabem na helvetica, e árabe e hindi
 * continuam no português (o jsPDF não faz a junção das letras dessas escritas).
 *
 * Qualquer falha (rede, 404, resposta que não é fonte — o middleware devolve o HTML
 * do login para quem está sem o cookie —, fonte que o jsPDF não aceita) devolve null,
 * e quem chama segue com a helvetica, exatamente como antes.
 *
 * A cobertura sai do cmap do PRÓPRIO arquivo baixado (a mesma subtabela formato 4 que
 * o jsPDF usa para achar o glifo), nunca de um `.json` servido pelo front: o `.json` não
 * entra na lista de estáticos do middleware e, numa aba aberta há mais de 24 h (o cookie
 * `zpro_auth` vence), viria o HTML do login. O gerador grava a mesma leitura em
 * `extra/pdf-fonts/coverage/` só para conferência. O `?v=` do endereço também tira o arquivo da regra de fontes
 * do service worker (cache de 4 entradas dividido com as fontes da própria tela).
 */

export type PdfFontKind = "latin-cyr" | "ja" | "zh";

export interface PdfUnicodeFont {
  /** Família registrada no documento: `doc.setFont(family, "normal" | "bold")`. */
  family: string;
  /** Há arquivo negrito registrado; sem ele, "bold" tem de usar "normal" (senão o jsPDF cai na Times). */
  hasBold: boolean;
  /** Todo caractere do texto tem glifo na fonte ("\n" conta como desenhável: o jsPDF quebra a linha). */
  canRender: (text: string) => boolean;
}

// Trocou os arquivos de public/fonts/pdf? Suba a versão: o endereço muda e nem o
// navegador nem o service worker servem a fonte antiga.
export const PDF_FONT_ASSET_VERSION = "1";
const FONT_BASE_PATH = "/fonts/pdf/";
const FETCH_TIMEOUT_MS = 30000;

type FontFileStyle = "normal" | "bold";
interface FontFileSpec {
  file: string;
  style: FontFileStyle;
}

const FONT_KINDS: Record<PdfFontKind, { family: string; files: FontFileSpec[] }> = {
  "latin-cyr": {
    family: "NotoSans",
    files: [
      { file: "NotoSans-Regular.ttf", style: "normal" },
      { file: "NotoSans-Bold.ttf", style: "bold" },
    ],
  },
  // Japonês e chinês só na versão regular (arquivos de ~1 MB cada).
  ja: { family: "NotoSansJP", files: [{ file: "NotoSansJP-Regular.ttf", style: "normal" }] },
  zh: { family: "NotoSansSC", files: [{ file: "NotoSansSC-Regular.ttf", style: "normal" }] },
};

/** Idioma da tela → fonte que o PDF precisa baixar; null = a helvetica de sempre. */
export function pdfFontKindForLocale(locale: string | null | undefined): PdfFontKind | null {
  const lang = String(locale ?? "").trim().toLowerCase().split(/[-_]/)[0];
  if (lang === "ru" || lang === "tr") return "latin-cyr";
  if (lang === "ja") return "ja";
  if (lang === "zh") return "zh";
  return null;
}

// ─── download (1 por sessão) ─────────────────────────────────────────────────
interface LoadedFontFile {
  vfsName: string;
  base64: string;
  /** Mapa de bits do plano básico (U+0000–U+FFFF): 1 = o cmap tem glifo. */
  coverage: Uint8Array;
}

// Só o sucesso fica guardado: falha (rede, aba sem cookie, deploy pela metade) tenta
// de novo na próxima exportação.
const loaded = new Map<string, Promise<LoadedFontFile | null>>();

function isTrueType(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const sig = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return sig === 0x00010000 || sig === 0x74727565; // 00 01 00 00 ou "true"
}

// Mesma leitura do jsPDF (TTFFont/CmapTable): 1ª subtabela formato 4 de plataforma
// (3,1) ou (0,*); caractere → glifo, e glifo 0 (.notdef) não conta.
function readCmapCoverage(bytes: Uint8Array): Uint8Array | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => dv.getUint16(at);
  const u32 = (at: number) => dv.getUint32(at);
  const numTables = u16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (u32(rec) === 0x636d6170) cmap = u32(rec + 8); // "cmap"
  }
  if (cmap < 0) return null;
  const subtables = u16(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = u16(rec);
    const encoding = u16(rec + 2);
    const sub = cmap + u32(rec + 4);
    if (u16(sub) !== 4 || !((platform === 3 && encoding === 1) || platform === 0)) continue;
    const subEnd = sub + u16(sub + 2);
    const segCount = u16(sub + 6) / 2;
    const ends = sub + 14;
    const starts = ends + segCount * 2 + 2;
    const deltas = starts + segCount * 2;
    const rangeOffsets = deltas + segCount * 2;
    const bitmap = new Uint8Array(8192);
    let any = false;
    for (let s = 0; s < segCount; s++) {
      const end = u16(ends + s * 2);
      const start = u16(starts + s * 2);
      const delta = u16(deltas + s * 2);
      const ro = u16(rangeOffsets + s * 2);
      for (let c = start; c <= end; c++) {
        let glyph: number;
        if (ro === 0) {
          glyph = (c + delta) & 0xffff;
        } else {
          const at = rangeOffsets + s * 2 + ro + (c - start) * 2;
          glyph = at + 2 <= subEnd ? u16(at) : 0;
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) {
          bitmap[c >> 3] |= 1 << (c & 7);
          any = true;
        }
      }
    }
    return any ? bitmap : null;
  }
  return null;
}

// Base64 em blocos: String.fromCharCode com o arquivo inteiro estoura a pilha.
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return btoa(parts.join(""));
}

async function fetchFontFile(spec: FontFileSpec): Promise<LoadedFontFile | null> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(`${FONT_BASE_PATH}${spec.file}?v=${PDF_FONT_ASSET_VERSION}`, {
      credentials: "same-origin",
      signal: ctrl?.signal,
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!isTrueType(bytes)) return null;
    const coverage = readCmapCoverage(bytes);
    if (!coverage) return null;
    return { vfsName: spec.file, base64: toBase64(bytes), coverage };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function loadFontFile(spec: FontFileSpec): Promise<LoadedFontFile | null> {
  const cached = loaded.get(spec.file);
  if (cached) return cached;
  const pending = fetchFontFile(spec).then((file) => {
    if (!file) loaded.delete(spec.file);
    return file;
  });
  loaded.set(spec.file, pending);
  return pending;
}

// ─── registro no documento ───────────────────────────────────────────────────
// O jsPDF engole a exceção do parser da fonte (PubSub) e registra a família mesmo
// assim; o texto estouraria depois. Confere se ela chegou inteira.
function registerFontFile(doc: jsPDF, family: string, file: LoadedFontFile, style: FontFileStyle): boolean {
  try {
    doc.addFileToVFS(file.vfsName, file.base64);
    doc.addFont(file.vfsName, family, style);
    // getFont(nome, estilo) existe em tempo de execução; os tipos só declaram getFont().
    const entry = (
      doc as unknown as {
        getFont(name: string, style: string): { fontName?: string; metadata?: { characterToGlyph?: (code: number) => number } } | undefined;
      }
    ).getFont(family, style);
    return (
      !!entry &&
      entry.fontName === family &&
      typeof entry.metadata?.characterToGlyph === "function" &&
      entry.metadata.characterToGlyph(0x41) > 0
    );
  } catch {
    return false;
  }
}

function hasCoverage(bitmap: Uint8Array, code: number): boolean {
  return (bitmap[code >> 3] & (1 << (code & 7))) !== 0;
}

/**
 * Baixa (1 vez por sessão) e registra no `doc` a fonte do idioma. Devolve null em
 * qualquer falha, ou para idioma sem fonte própria — quem chama segue com a helvetica.
 */
export async function ensurePdfUnicodeFont(doc: jsPDF, kind: PdfFontKind | null): Promise<PdfUnicodeFont | null> {
  if (!kind) return null;
  const spec = FONT_KINDS[kind];
  if (!spec) return null;
  try {
    const files = await Promise.all(spec.files.map(async (f) => ({ style: f.style, file: await loadFontFile(f) })));
    const regular = files.find((f) => f.style === "normal")?.file ?? null;
    const bold = files.find((f) => f.style === "bold")?.file ?? null;
    if (!regular) return null;
    const previous = doc.getFont();
    if (!registerFontFile(doc, spec.family, regular, "normal")) return null;
    let hasBold = false;
    let boldCoverage: Uint8Array | null = null;
    if (bold && registerFontFile(doc, spec.family, bold, "bold")) {
      hasBold = true;
      boldCoverage = bold.coverage;
    }
    // O registro não troca a fonte ativa do documento.
    try {
      doc.setFont(previous.fontName, previous.fontStyle);
    } catch {
      /* quem chama define a fonte antes de escrever */
    }
    const regularCoverage = regular.coverage;
    const canRender = (text: string): boolean => {
      // Por unidade UTF-16, como o jsPDF mapeia: surrogate nunca tem glifo. "\n" o
      // jsPDF quebra em linhas; "\r" sozinho não (splitTextToSize só corta em \r?\n).
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code === 10) continue;
        if (!hasCoverage(regularCoverage, code)) return false;
        if (boldCoverage && !hasCoverage(boldCoverage, code)) return false;
      }
      return true;
    };
    return { family: spec.family, hasBold, canRender };
  } catch {
    return null;
  }
}

/**
 * Deixa o texto só com o que a fonte desenha: tab vira espaço, "\r" vira quebra de
 * linha, controle some, letra acentuada sem glifo vira a letra base (Š → S) e o resto
 * vira `replacement` — o "?" que a helvetica já usava. Espera texto em NFC.
 *
 * Obrigatório em todo texto que não passou por `canRender`: com fonte Identity-H, o
 * jsPDF CORTA a linha no primeiro caractere sem glifo (pdfEscape16 para no glifo 0).
 */
export function fitTextToPdfFont(font: PdfUnicodeFont, text: string, replacement = "?"): string {
  let out = "";
  for (const ch of text.replace(/\r\n?/g, "\n")) {
    if (ch === "\t") {
      out += " ";
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code !== 10 && (code < 0x20 || (code >= 0x7f && code < 0xa0))) continue;
    if (font.canRender(ch)) {
      out += ch;
      continue;
    }
    const decomposed = ch.normalize("NFD");
    if (decomposed !== ch && font.canRender(decomposed[0])) {
      // Base + só os diacríticos que a fonte tiver.
      out += Array.from(decomposed).filter((part) => font.canRender(part)).join("");
      continue;
    }
    out += replacement;
  }
  return out;
}

// ─── datas ───────────────────────────────────────────────────────────────────
type PdfDateInput = Date | string | number;

/** Datas dos PDFs, sempre nos mesmos 3 formatos (são os que a sonda confere). */
export interface PdfDateFormatter {
  /** Tag usada no Intl; "pt-BR" quando o idioma da tela não cabe na fonte do PDF. */
  locale: string;
  /** "segunda-feira, 28 de setembro de 2026" (separador de dia da conversa). */
  longDate: (value: PdfDateInput) => string;
  /** "28/09/2026, 14:32:10" (o toLocaleString de sempre). */
  dateTime: (value: PdfDateInput) => string;
  /** "14:32" (horário da mensagem). */
  shortTime: (value: PdfDateInput) => string;
}

const PDF_LONG_DATE: Intl.DateTimeFormatOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
const PDF_SHORT_TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
// Nos outros idiomas a hora curta do próprio idioma: "1:04 PM" (en), "05:37" (ru/de), "5:37" (ja).
const PDF_SHORT_TIME_LOCAL: Intl.DateTimeFormatOptions = { timeStyle: "short" };

const toPdfDate = (value: PdfDateInput): Date => (value instanceof Date ? value : new Date(value));

// pt-BR cru, exatamente as chamadas de antes.
const PT_BR_PDF_DATES: PdfDateFormatter = {
  locale: "pt-BR",
  longDate: (v) => toPdfDate(v).toLocaleDateString("pt-BR", PDF_LONG_DATE),
  dateTime: (v) => toPdfDate(v).toLocaleString("pt-BR"),
  shortTime: (v) => toPdfDate(v).toLocaleTimeString("pt-BR", PDF_SHORT_TIME),
};

// Espaços especiais do Intl (o U+202F antes de "PM" no inglês, o U+00A0…) viram espaço
// comum e as marcas de direção somem: nenhuma das fontes do PDF desenha esses caracteres.
function normalizeIntlDate(text: string): string {
  return text
    .replace(/[    ]/g, " ")
    .replace(/[؜‎‏]/g, "")
    .normalize("NFC");
}

/**
 * Datas no idioma da tela, pela mesma regra dos rótulos: só quando TUDO o que os 3
 * formatos podem produzir (12 meses, 7 dias da semana, manhã e tarde) cabe na fonte do
 * PDF (`canDraw`); senão, o pt-BR de antes. Dígitos sempre latinos. Na prática: pt, en,
 * es, de, fr, it e id na helvetica, ru/tr/ja/zh com a Noto; árabe, hindi e a Noto que
 * não baixou ficam no pt-BR, como o resto do PDF.
 */
export function createPdfDateFormatter(
  uiLocale: string | null | undefined,
  canDraw: (text: string) => boolean,
): PdfDateFormatter {
  const tag = bcp47ForLocale(uiLocale);
  if (tag === "pt-BR") return PT_BR_PDF_DATES;
  try {
    if (Intl.DateTimeFormat.supportedLocalesOf([tag]).length === 0) return PT_BR_PDF_DATES;
    const intlTag = `${tag}-u-nu-latn`;
    const candidate: PdfDateFormatter = {
      locale: intlTag,
      longDate: (v) => normalizeIntlDate(toPdfDate(v).toLocaleDateString(intlTag, PDF_LONG_DATE)),
      dateTime: (v) => normalizeIntlDate(toPdfDate(v).toLocaleString(intlTag)),
      shortTime: (v) => normalizeIntlDate(toPdfDate(v).toLocaleTimeString(intlTag, PDF_SHORT_TIME_LOCAL)),
    };
    const samples: Date[] = [];
    for (let m = 0; m < 12; m++) samples.push(new Date(2026, m, 10 + m, 13, 5, 9));
    for (let d = 0; d < 7; d++) samples.push(new Date(2026, 5, 1 + d, 1, 5, 9));
    for (const s of samples) {
      if (!canDraw(candidate.longDate(s)) || !canDraw(candidate.dateTime(s)) || !canDraw(candidate.shortTime(s))) {
        return PT_BR_PDF_DATES;
      }
    }
    return candidate;
  } catch {
    return PT_BR_PDF_DATES;
  }
}
