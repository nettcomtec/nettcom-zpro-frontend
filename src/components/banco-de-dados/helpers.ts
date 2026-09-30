import type { useTranslations } from "next-intl";
import { formatNumber } from "@/lib/format";
import { isDbConsoleApiError } from "@/services/db-console";

export type Translate = ReturnType<typeof useTranslations>;

// Espelho dos tetos do servidor (DbConsolePolicyZPRO.LIMITS) — só para texto e seletores.
export const GRID_PAGE_SIZES = [50, 100, 200] as const;
export const HISTORY_PAGE_SIZES = [25, 50, 100] as const;
export const QUERY_MAX_ROWS = 500;
export const EXPORT_MAX_ROWS = 50000;
/** O resultado da consulta (até 500 linhas) é paginado no navegador para a grade não pesar. */
export const QUERY_RESULT_PAGE_ROWS = 100;
export const QUERY_DRAFT_STORAGE_KEY = "dbConsole.queryDraft";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${formatNumber(value, { maximumFractionDigits: digits })} ${units[unit]}`;
}

/** JSON formatado para LEITURA quando o texto é objeto/lista válidos; senão `null`. */
export function prettyJson(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object") return null;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

/**
 * Formatar para EDIÇÃO só quando a ida e volta é exata: número com 16+ dígitos
 * perderia precisão no JSON.parse e seria regravado errado sem ninguém perceber.
 */
export function prettyJsonForEdit(raw: string): string | null {
  if (/\d{16,}/.test(raw)) return null;
  return prettyJson(raw);
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function buildCellSet(cells: [number, number][] | undefined | null): Set<string> {
  const set = new Set<string>();
  if (Array.isArray(cells)) {
    for (const cell of cells) {
      if (Array.isArray(cell) && cell.length >= 2) set.add(cellKey(cell[0], cell[1]));
    }
  }
  return set;
}

/** Texto para o operador a partir do erro normalizado do service. */
export function describeDbConsoleError(err: unknown, t: Translate, fallback: string): string {
  if (!isDbConsoleApiError(err)) return fallback;
  const detail = err.message && err.message !== err.code ? err.message : "";
  const withDetail = (text: string) => (detail ? `${text} ${detail}` : text);
  switch (err.code) {
    case "ERR_DB_CONSOLE_LOCKED":
      return t("sessionExpired");
    case "ERR_DB_CONSOLE_RELOGIN":
      return t("relogin");
    case "ERR_DB_CONSOLE_TIMEOUT":
      return t("errTimeout");
    case "ERR_DB_CONSOLE_TOO_LARGE":
      return t("errTooLarge");
    case "ERR_DB_CONSOLE_BUSY":
      return t("errBusy");
    case "ERR_DB_CONSOLE_READ_ONLY":
      return t("errReadOnly");
    case "ERR_DB_CONSOLE_PROTECTED":
      return t("errProtected");
    case "ERR_DB_CONSOLE_SQL":
      return withDetail(t("errSql"));
    case "ERR_DB_CONSOLE_INVALID_VALUE":
      return withDetail(t("errInvalidValue"));
    case "ERR_DB_CONSOLE_NOT_EDITABLE":
      return t("errNotEditable");
    case "ERR_DB_CONSOLE_SECRET_KEY":
      return t("errSecretKey");
    case "ERR_DB_CONSOLE_ROW_CHANGED":
    case "ERR_DB_CONSOLE_ROW_NOT_FOUND":
      return t("errRowChanged");
    default:
      return detail ? `${fallback} (${detail})` : `${fallback} (${err.code})`;
  }
}
