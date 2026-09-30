// Contrato HTTP da tela "Banco de dados" do superadmin.
// Espelho de backend/src/services/DbConsoleServices/DbConsoleTypesZPRO.ts — mudou um, muda o outro.
//
// Transporte: toda rota (menos status e unlock) é POST com corpo
//   { consoleToken: string, payloadB64: string }   // payloadB64 = base64(JSON UTF-8) do request
// e responde { consoleToken: string, ...dados } (o token vem renovado a cada resposta).
// Erros: { error: "ERR_DB_CONSOLE_*", message?: string, details?: {...} } — ler data.error ?? data.message.

export type DbConsoleUnavailableReason =
  | "unsupported" // só no front: backend sem as rotas (404/405/501)
  | "relogin" // só no front: sessão anterior à marca de chave mestra
  | "disabled"
  | "migration_pending"
  | "no_role_privilege"
  | "auth_failed_maybe_pooler"
  | "connect_failed";

export interface DbConsoleStatus {
  enabled: boolean;
  available: boolean;
  reason?: DbConsoleUnavailableReason;
  viaMasterKey: boolean;
}

export interface DbConsoleIssuedToken {
  consoleToken: string;
  expiresAt: number;
  hardExpiresAt: number;
}

export interface DbConsoleTableSummary {
  name: string;
  estimatedRows: number | null;
  sizeBytes: number | null;
  readOnly: boolean;
  hasProtectedColumns: boolean;
  isKeyValue: boolean;
  isLarge: boolean;
}

export interface DbConsoleColumnInfo {
  name: string;
  type: string;
  castType: string;
  nullable: boolean;
  hasDefault: boolean;
  generated: boolean;
  isIdentity: boolean;
  enumValues: string[] | null;
  readable: boolean;
  editable: boolean;
  protected: boolean;
  mediated: boolean;
}

export interface DbConsoleTableInfo {
  name: string;
  readOnly: boolean;
  isKeyValue: boolean;
  isLarge: boolean;
  identity: string[] | null;
  columns: DbConsoleColumnInfo[];
  sortableColumns: string[];
}

export type DbConsoleBrowseOp =
  | "eq"
  | "ne"
  | "contains"
  | "starts"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "isnull"
  | "notnull";

export interface DbConsoleBrowseFilter {
  column: string;
  op: DbConsoleBrowseOp;
  value?: string | null;
}

export interface DbConsoleBrowseSort {
  column: string;
  dir: "asc" | "desc";
}

export interface DbConsoleBrowseRequest {
  table: string;
  filters?: DbConsoleBrowseFilter[];
  sort?: DbConsoleBrowseSort | null;
  pageSize?: number;
  offset?: number;
  after?: Record<string, string> | null;
}

export interface DbConsoleResultColumn {
  name: string;
  type: string;
}

export interface DbConsoleResultSet {
  columns: DbConsoleResultColumn[];
  rows: (string | null)[][];
  truncatedCells: [number, number][];
}

export interface DbConsoleBrowseResponse extends DbConsoleResultSet {
  table: string;
  identities: Record<string, string>[];
  protectedColumns: string[];
  maskedCells: [number, number][];
  hasMore: boolean;
  nextOffset: number | null;
  nextAfter: Record<string, string> | null;
  warnings: string[];
}

export interface DbConsoleRowCell {
  column: string;
  value: string | null;
  md5: string | null;
  tooLarge: boolean;
  masked: boolean;
  editable: boolean;
}

export interface DbConsoleRowDetail {
  table: string;
  identity: Record<string, string>;
  cells: DbConsoleRowCell[];
}

export interface DbConsoleRowChange {
  column: string;
  value: string | null;
  isNull: boolean;
  prevMd5: string | null;
}

export interface DbConsoleQueryResponse extends DbConsoleResultSet {
  kind: "select" | "explain" | "show";
  rowCount: number;
  hasMore: boolean;
  durationMs: number;
}

export interface DbConsoleExportRequest {
  source: "query" | "browse";
  sql?: string;
  table?: string;
  filters?: DbConsoleBrowseFilter[];
  sort?: DbConsoleBrowseSort | null;
}

export type DbConsoleLogKind =
  | "unlock"
  | "unlock_failed"
  | "provision"
  | "query"
  | "browse"
  | "count"
  | "row"
  | "row_update"
  | "export"
  | "terminal";

export type DbConsoleLogStatus =
  | "started"
  | "ok"
  | "error"
  | "denied"
  | "timeout"
  | "conflict"
  | "too_large";

export interface DbConsoleHistoryEntry {
  id: number;
  kind: DbConsoleLogKind;
  status: DbConsoleLogStatus;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  viaMasterKey: boolean;
  ip: string | null;
  targetTable: string | null;
  targetPk: Record<string, string> | null;
  statement: string | null;
  changes: Record<string, { before: string | null; after: string | null }> | null;
  rowCount: number | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface DbConsoleHistoryResponse {
  logs: DbConsoleHistoryEntry[];
  total: number;
  authors: { userId: number; userName: string | null }[];
}

/** Erro normalizado pelo service do front. */
export interface DbConsoleApiError {
  status: number;
  code: string;
  message?: string;
  details?: Record<string, unknown>;
}
