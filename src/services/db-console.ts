import api from "@/lib/api";
import { encryptPassword } from "@/lib/encryption";
import type {
  DbConsoleApiError,
  DbConsoleBrowseRequest,
  DbConsoleBrowseResponse,
  DbConsoleExportRequest,
  DbConsoleHistoryResponse,
  DbConsoleLogKind,
  DbConsoleQueryResponse,
  DbConsoleRowChange,
  DbConsoleRowDetail,
  DbConsoleStatus,
  DbConsoleTableInfo,
  DbConsoleTableSummary
} from "@/types/db-console";

// Contrato da tela "Banco de dados" (docs/PLANO_TELA_BANCO_DADOS_SUPERADMIN.md).
//
// Três cuidados que não são detalhe:
// - o corpo vai em base64: o sanitizador do backend apaga trechos `<...>` e
//   corromperia um SELECT com `<` ou `>`;
// - o token de console fica SÓ em memória (nunca localStorage/sessionStorage);
// - `lib/api` rejeita com o RESPONSE, não com o erro: status é `err.status`.

const TIMEOUT_MS = 40_000;

let consoleToken: string | null = null;
let onLocked: (() => void) | null = null;

export function setDbConsoleLockedHandler(handler: (() => void) | null): void {
  onLocked = handler;
}

export function clearDbConsoleToken(): void {
  consoleToken = null;
}

export function hasDbConsoleToken(): boolean {
  return !!consoleToken;
}

/* ------------------------------------------------------------------ erro */

export function isDbConsoleApiError(err: unknown): err is DbConsoleApiError {
  return !!err && typeof err === "object" && typeof (err as DbConsoleApiError).code === "string";
}

function statusOf(err: any): number {
  return Number(err?.status ?? err?.response?.status ?? 0);
}

function bodyOf(err: any): any {
  return err?.data ?? err?.response?.data ?? null;
}

/** backend sem as rotas (versão antiga) responde 404/405/501. */
function isBackendMissing(err: any): boolean {
  const status = statusOf(err);
  return status === 404 || status === 405 || status === 501;
}

function normalizeError(err: any): DbConsoleApiError {
  const body = bodyOf(err);
  const code = typeof body?.error === "string" ? body.error : "";
  const normalized: DbConsoleApiError = {
    status: statusOf(err),
    code: code || (isBackendMissing(err) ? "ERR_DB_CONSOLE_UNSUPPORTED" : "ERR_DB_CONSOLE_INTERNAL"),
    message: typeof body?.message === "string" ? body.message : undefined,
    details: body?.details && typeof body.details === "object" ? body.details : undefined
  };
  // 423 = bloqueada: a página volta ao pedido de senha sem perder o estado das abas.
  if (normalized.code === "ERR_DB_CONSOLE_LOCKED" || normalized.code === "ERR_DB_CONSOLE_RELOGIN") {
    consoleToken = null;
    if (onLocked) onLocked();
  }
  return normalized;
}

/* ------------------------------------------------------------------ transporte */

function toB64Json(payload: unknown): string {
  const json = JSON.stringify(payload ?? {});
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function post<T>(op: string, payload: unknown): Promise<T> {
  if (!consoleToken) {
    const locked: DbConsoleApiError = { status: 423, code: "ERR_DB_CONSOLE_LOCKED" };
    if (onLocked) onLocked();
    throw locked;
  }
  try {
    const res = await api.post(
      `/db-console/${op}`,
      { consoleToken, payloadB64: toB64Json(payload) },
      { timeout: TIMEOUT_MS }
    );
    if (typeof res.data?.consoleToken === "string") consoleToken = res.data.consoleToken;
    return res.data as T;
  } catch (err) {
    throw normalizeError(err);
  }
}

/* ------------------------------------------------------------------ rotas */

export async function getDbConsoleStatus(): Promise<DbConsoleStatus> {
  try {
    const res = await api.get("/db-console/status", { timeout: TIMEOUT_MS });
    return res.data as DbConsoleStatus;
  } catch (err: any) {
    if (isBackendMissing(err)) {
      return { enabled: false, available: false, reason: "unsupported", viaMasterKey: false };
    }
    const normalized = normalizeError(err);
    if (normalized.code === "ERR_DB_CONSOLE_DISABLED") {
      return { enabled: false, available: false, reason: "disabled", viaMasterKey: false };
    }
    throw normalized;
  }
}

export async function unlockDbConsole(secret: string, viaMasterKey: boolean): Promise<void> {
  try {
    const password = await encryptPassword(secret);
    const res = await api.post(
      "/db-console/unlock",
      { password, ...(viaMasterKey ? { masterkey: true } : {}) },
      { timeout: TIMEOUT_MS }
    );
    consoleToken = typeof res.data?.consoleToken === "string" ? res.data.consoleToken : null;
    if (!consoleToken) throw { status: 500, code: "ERR_DB_CONSOLE_INTERNAL" } as DbConsoleApiError;
  } catch (err) {
    if (isDbConsoleApiError(err)) throw err;
    throw normalizeError(err);
  }
}

export async function fetchDbConsoleTables(): Promise<DbConsoleTableSummary[]> {
  const data = await post<{ tables: DbConsoleTableSummary[] }>("tables", {});
  return Array.isArray(data.tables) ? data.tables : [];
}

export async function fetchDbConsoleTableInfo(table: string): Promise<DbConsoleTableInfo> {
  const data = await post<{ table: DbConsoleTableInfo }>("table-info", { table });
  return data.table;
}

export async function browseDbConsole(req: DbConsoleBrowseRequest): Promise<DbConsoleBrowseResponse> {
  const data = await post<{ result: DbConsoleBrowseResponse }>("browse", req);
  return data.result;
}

export async function countDbConsole(req: DbConsoleBrowseRequest): Promise<number> {
  const data = await post<{ count: number }>("count", { table: req.table, filters: req.filters });
  return Number(data.count) || 0;
}

export async function fetchDbConsoleRow(
  table: string,
  identity: Record<string, string>
): Promise<DbConsoleRowDetail> {
  const data = await post<{ row: DbConsoleRowDetail }>("row", { table, identity });
  return data.row;
}

export async function runDbConsoleQuery(sql: string): Promise<DbConsoleQueryResponse> {
  const data = await post<{ result: DbConsoleQueryResponse }>("query", { sql });
  return data.result;
}

export async function updateDbConsoleRow(
  table: string,
  identity: Record<string, string>,
  changes: DbConsoleRowChange[]
): Promise<DbConsoleRowDetail> {
  const data = await post<{ row: DbConsoleRowDetail }>("row-update", { table, identity, changes });
  return data.row;
}

export async function fetchDbConsoleHistory(req: {
  page?: number;
  pageSize?: number;
  userId?: number | null;
  kind?: DbConsoleLogKind | null;
}): Promise<DbConsoleHistoryResponse> {
  return post<DbConsoleHistoryResponse>("history", req);
}

/** o export é um arquivo: timeout 0 (o default de 30 s do axios abortaria exportação longa). */
export async function exportDbConsoleCsv(req: DbConsoleExportRequest): Promise<{ blob: Blob; filename: string }> {
  if (!consoleToken) {
    if (onLocked) onLocked();
    throw { status: 423, code: "ERR_DB_CONSOLE_LOCKED" } as DbConsoleApiError;
  }
  try {
    const res = await api.post(
      "/db-console/export",
      { consoleToken, payloadB64: toB64Json(req) },
      { responseType: "blob", timeout: 0 }
    );
    const blob = res.data as Blob;
    // erro depois do POST vem como JSON no lugar do CSV.
    if (blob && blob.type && blob.type.includes("application/json")) {
      const text = await blob.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      throw normalizeError({ status: res.status, data: parsed });
    }
    const disposition = String(res.headers?.["content-disposition"] || "");
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    return { blob, filename: match ? match[1] : "consulta.csv" };
  } catch (err) {
    if (isDbConsoleApiError(err)) throw err;
    const body = bodyOf(err);
    if (body instanceof Blob) {
      const text = await body.text();
      try {
        throw normalizeError({ status: statusOf(err), data: JSON.parse(text) });
      } catch (parsed) {
        if (isDbConsoleApiError(parsed)) throw parsed;
      }
    }
    throw normalizeError(err);
  }
}
