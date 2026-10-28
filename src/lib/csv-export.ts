import { countryLocale } from "@/lib/region";

/**
 * Peças genéricas de exportação montada no navegador (CSV e células de data do
 * Excel). Sem React e sem download: quem baixa/compartilha é `lib/download-file.ts`.
 *
 * O quadro do funil e as respostas de formulário têm cópias próprias destas regras;
 * esta é a versão compartilhada para os exports novos.
 */

/**
 * Separador do CSV pela Região: onde o decimal do país é vírgula (Brasil) o Excel
 * espera ";" e, com ",", abre o arquivo inteiro na coluna A; nos demais, ",".
 */
export function csvDelimiterForCountry(country?: string | null): string {
  try {
    const decimal = new Intl.NumberFormat(countryLocale(country))
      .formatToParts(1.5)
      .find((p) => p.type === "decimal")?.value;
    return decimal === "," ? ";" : ",";
  } catch {
    return ";";
  }
}

// Célula que começa com = + - @ (ou tab/retorno) seria lida como fórmula pela
// planilha: ganha um apóstrofo na frente (recomendação OWASP).
const FORMULA_START = /^[=+\-@\t\r]/;

// Só valor de telefone/protocolo (dígitos e sinais) vira `="…"`.
const DIGITS_VALUE = /^[+\d][\d\s().+-]*$/;

const quote = (text: string): string => `"${text.replace(/"/g, '""')}"`;

/** Um registro por linha: quebra de linha dentro do valor vira " | " e as linhas vazias somem. */
function toSingleLine(raw: string): string {
  if (!/[\r\n]/.test(raw)) return raw;
  return raw
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" | ");
}

/**
 * Célula de CSV pronta (com aspas). Número de verdade (tipo number) sai como está;
 * todo texto passa para uma linha só e, DEPOIS disso, pela proteção de fórmula.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number") return quote(Number.isFinite(value) ? String(value) : "");
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  let text = toSingleLine(raw);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return quote(text);
}

/**
 * Telefone, protocolo e outros números longos: `="…"` obriga o Excel a tratar como
 * texto (sem 5,5E+11 nem dígitos perdidos). É o ÚNICO caminho que produz `="…"`, e só
 * para valor de dígitos; qualquer outro valor cai em `csvCell`.
 */
export function csvDigitsCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  if (!DIGITS_VALUE.test(text)) return csvCell(value);
  return quote(`="${text}"`);
}

/** Junta células já prontas: BOM (acentos no Excel) + linhas separadas por CRLF. */
export function buildCsv(rows: string[][], delimiter: string): string {
  return "\uFEFF" + rows.map((row) => row.join(delimiter)).join("\r\n");
}

/**
 * Número de série do Excel para uma data no horário LOCAL (o que a tela mostra).
 * Nunca passar `Date` à SheetJS: a 0.18.5 desconta o deslocamento histórico do fuso
 * em 1899 e erra a hora (São Paulo: 14:30 vira 14:29).
 */
export function excelSerialFromLocalDate(date: Date): number {
  const utc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  );
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

const FALLBACK_EXCEL_DATETIME = "yyyy-mm-dd hh:mm";
const BIDI_MARKS = /[\u200E\u200F\u061C]/g;

/**
 * Formato de célula do Excel com data e hora na ordem do idioma da tela
 * (`dd/mm/yyyy hh:mm`, `mm/dd/yyyy hh:mm`, `dd.mm.yyyy hh:mm`, `yyyy/mm/dd hh:mm`…).
 * Separador desconhecido ou ordem que não dá para montar = `yyyy-mm-dd hh:mm`.
 */
export function excelDateTimeFormat(locale?: string | null): string {
  try {
    const parts = new Intl.DateTimeFormat(locale || undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      numberingSystem: "latn",
    }).formatToParts(new Date(2026, 9, 20, 12, 0, 0));
    const tokens: string[] = [];
    const separators: string[] = [];
    let pending: string | null = null;
    for (const part of parts) {
      if (part.type === "literal") {
        if (tokens.length > 0) pending = (pending ?? "") + part.value;
        continue;
      }
      const token = part.type === "day" ? "dd" : part.type === "month" ? "mm" : part.type === "year" ? "yyyy" : null;
      if (!token) return FALLBACK_EXCEL_DATETIME;
      if (tokens.length > 0) {
        // Só separadores que o formato do Excel entende como texto fixo.
        const sep = (pending ?? "").replace(BIDI_MARKS, "").replace(/[^\/.\- ]/g, "");
        const trimmed = sep.trim() || (sep.length > 0 ? " " : "");
        if (!trimmed) return FALLBACK_EXCEL_DATETIME;
        separators.push(trimmed);
      }
      tokens.push(token);
      pending = null;
    }
    if (tokens.length !== 3 || new Set(tokens).size !== 3) return FALLBACK_EXCEL_DATETIME;
    return `${tokens[0]}${separators[0]}${tokens[1]}${separators[1]}${tokens[2]} hh:mm`;
  } catch {
    return FALLBACK_EXCEL_DATETIME;
  }
}

/**
 * Data e hora em TEXTO para o CSV, no formato do idioma da tela: data e hora
 * separadas por espaço (sem vírgula, que confundiria o separador), dígitos latinos e
 * sem as marcas de direção do árabe.
 */
export function csvDateTimeText(date: Date, locale?: string | null): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const loc = locale || undefined;
  try {
    const day = new Intl.DateTimeFormat(loc, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      numberingSystem: "latn",
    }).format(date);
    const time = new Intl.DateTimeFormat(loc, {
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: "latn",
    }).format(date);
    return `${day} ${time}`.replace(BIDI_MARKS, "").replace(/\s+/g, " ").trim();
  } catch {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

/**
 * Pedaço de nome de arquivo: mantém letras de qualquer idioma (cirílico, japonês,
 * devanágari…), tira só o acento das letras latinas, os caracteres proibidos no
 * Windows/macOS e os de controle, e troca espaço por "_". Vazio = "export".
 */
export function sanitizeFileNamePart(text: unknown): string {
  const raw = text === null || text === undefined ? "" : String(text);
  const cleaned = raw
    .normalize("NFD")
    // Só o acento que está sobre letra latina: o breve do "й" e o trema do "ё"
    // (mesma faixa de combinação) ficam.
    .replace(/([A-Za-z])[\u0300-\u036f]+/g, "$1")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "");
  return cleaned || "export";
}
