import Papa from "papaparse";

export type BulkLine = {
  lineNumber: number;
  raw: string;
  number: string;
  vars: string[];
};

export type BulkInvalidLine = {
  lineNumber: number;
  raw: string;
  reason: "empty" | "no_number" | "wrong_var_count" | "missing_vars";
  expected?: number;
  got?: number;
};

export type BulkParseResult = {
  valid: BulkLine[];
  invalid: BulkInvalidLine[];
};

const MIN_DIGITS = 10;
const MAX_DIGITS = 15;

export function extractDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isProbablePhoneNumber(
  raw: string,
  minDigits: number = MIN_DIGITS,
  maxDigits: number = MAX_DIGITS,
): boolean {
  const digits = extractDigits(raw);
  return digits.length >= minDigits && digits.length <= maxDigits;
}

function isProbableNumber(raw: string): boolean {
  return isProbablePhoneNumber(raw);
}

export type BulkDelimiter = "," | ";" | "\t" | "|" | " " | "-";

/**
 * Divisores elegíveis para auto-detecção: nunca aparecem dentro de um número
 * de telefone formatado. Espaço e hífen ficam de fora de propósito
 * (+55 48 99999-9999 seria fatiado) — só entram por escolha manual do usuário.
 * A ordem do array é o desempate de prioridade.
 */
const AUTO_DELIMITERS: BulkDelimiter[] = ["\t", ";", ",", "|"];

/**
 * Detecta o divisor mais provável entre os 4 seguros, pontuando pela
 * consistência da contagem de colunas nas primeiras linhas (o guess nativo do
 * papaparse é score global sem prioridade e falha em arquivos de coluna única).
 * Fallback: vírgula.
 */
export function detectBulkDelimiter(text: string): BulkDelimiter {
  const sample = (text || "")
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim())
    .slice(0, 30);
  if (sample.length === 0) return ",";

  let best: BulkDelimiter = ",";
  let bestScore = 0;
  for (const d of AUTO_DELIMITERS) {
    const counts = sample.map((line) => {
      const parsed = Papa.parse<string[]>(line, {
        delimiter: d,
        quoteChar: '"',
        escapeChar: '"',
      });
      return (parsed.data[0] || []).length;
    });
    const freq = new Map<number, number>();
    counts.forEach((c) => freq.set(c, (freq.get(c) || 0) + 1));
    let modal = 1;
    let modalFreq = 0;
    freq.forEach((f, c) => {
      if (f > modalFreq || (f === modalFreq && c > modal)) {
        modal = c;
        modalFreq = f;
      }
    });
    // Divisor que não divide nada (1 coluna) não conta como detectado
    if (modal < 2) continue;
    const consistency = modalFreq / counts.length;
    const score = consistency * 100 + modal;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Parseia o texto completo em linhas de campos com o divisor informado
 * (quote-aware via papaparse; BOM e CRLF tratados pela lib).
 * Campos vazios no meio da linha são PRESERVADOS (posição de variável),
 * exceto nos divisores espaço/hífen, onde separadores consecutivos geram
 * campos vazios sem significado e são descartados.
 */
export function parseDelimitedRows(text: string, delimiter: BulkDelimiter): string[][] {
  const result = Papa.parse<string[]>(text || "", {
    delimiter,
    quoteChar: '"',
    escapeChar: '"',
    skipEmptyLines: "greedy",
  });
  const rows = (result.data || []).map((fields) =>
    (fields || []).map((f) => (f ?? "").trim()),
  );
  if (delimiter === " " || delimiter === "-") {
    return rows.map((r) => r.filter((f) => f !== "")).filter((r) => r.length > 0);
  }
  return rows.filter((r) => r.some((f) => f !== ""));
}

/**
 * Serializa linhas no formato canônico das telas de disparo: CSV com vírgula,
 * quebra \n e aspas apenas quando o valor exige (Papa.unparse).
 */
export function toCanonicalCsv(rows: string[][]): string {
  return Papa.unparse(rows, { delimiter: ",", newline: "\n" });
}

/**
 * Parseia texto multilinha (textarea) como CSV robusto usando papaparse.
 * - Respeita aspas duplas como escape para vírgulas internas
 * - Ignora linhas em branco
 * - `expectedVarCount`: exige exatamente N variáveis além do número
 * - `minVarCount`: exige pelo menos N variáveis (extras toleradas) — use em templates livres
 * - Linhas cujo primeiro campo não se parece com um número de telefone (10 a 15 dígitos)
 *   viram `invalid` com razão "no_number"
 */
export function parseBulkCsv(
  text: string,
  opts?: { expectedVarCount?: number; minVarCount?: number },
): BulkParseResult {
  const valid: BulkLine[] = [];
  const invalid: BulkInvalidLine[] = [];

  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    delimiter: ",",
    quoteChar: '"',
    escapeChar: '"',
  });

  const rows = result.data || [];
  rows.forEach((fields, idx) => {
    const lineNumber = idx + 1;
    const raw = (fields || []).join(",");
    const trimmed = (fields || []).map((f) => (f ?? "").trim());
    if (trimmed.length === 0 || trimmed.every((f) => !f)) {
      return;
    }

    const first = trimmed[0] ?? "";
    if (!isProbableNumber(first)) {
      invalid.push({ lineNumber, raw, reason: "no_number" });
      return;
    }

    const number = first.replace(/\D/g, "");
    const vars = trimmed.slice(1);

    if (opts?.expectedVarCount != null && vars.length !== opts.expectedVarCount) {
      invalid.push({
        lineNumber,
        raw,
        reason: "wrong_var_count",
        expected: opts.expectedVarCount,
        got: vars.length,
      });
      return;
    }

    if (opts?.minVarCount != null && vars.length < opts.minVarCount) {
      invalid.push({
        lineNumber,
        raw,
        reason: "missing_vars",
        expected: opts.minVarCount,
        got: vars.length,
      });
      return;
    }

    valid.push({ lineNumber, raw, number, vars });
  });

  return { valid, invalid };
}
