import api from "@/lib/api";

// Auditoria/aplicacao de consolidacao LID sao operacoes administrativas pesadas
// (self-joins na tabela Contacts + migracao de FKs em lote). O timeout global do
// axios (30s) e curto demais para tenants grandes e estoura antes do backend
// terminar. Damos uma janela ampla so para estas chamadas.
const LID_CONSOLIDATION_TIMEOUT = 300000; // 5 min

export type MatchKind =
  | "cross_collision"
  | "nine_digit_variant"
  | "pushname"
  | "profilePic"
  | "pushname_and_profilePic";

export interface LidPair {
  small_id: number;
  big_id: number;
  tenantId: number;
  small_number: string | null;
  small_lid: string | null;
  small_name: string | null;
  small_isLid: boolean;
  big_number: string | null;
  big_lid: string | null;
  big_name: string | null;
  big_isLid: boolean;
  matchKind?: MatchKind;
}

export interface PairDecision {
  primaryId: number;
  duplicateId: number;
  reason: string;
  skip?: string;
}

export interface AuditedPair {
  pair: LidPair;
  decision: PairDecision;
  conflictReason: string | null;
  ticketsToMove: number;
  messagesToMove: number;
  primaryName: string | null;
  primaryNumber: string | null;
  primaryLid: string | null;
  duplicateName: string | null;
  duplicateNumber: string | null;
  duplicateLid: string | null;
  matchKind: MatchKind;
  confidence: "high" | "medium";
}

export interface AuditDebug {
  profile?: string;
  rawUserTenantId?: unknown;
  rawUserTenantIdType?: string;
  allTenantsRequested?: boolean;
  effectiveTenantFilter?: number | null;
  pairsReturned?: number;
  globalCrossPairsCount?: number;
  byTenant?: Array<{ tenantId: number; count: number }>;
  breakdownByMatchKind?: Record<MatchKind, number>;
}

export interface AuditResponse {
  scope: string;
  totalPairs: number;
  pairs: AuditedPair[];
  debug?: AuditDebug;
}

export interface ApplyResult {
  status: "consolidated" | "skipped" | "error";
  detail: string;
  pair: LidPair;
  decision: PairDecision;
  ticketsMoved?: number;
  messagesMoved?: number;
}

export interface ApplyResponse {
  scope: string;
  total: number;
  consolidated: number;
  skipped: number;
  errors: number;
  results: ApplyResult[];
}

export interface ManualApplyResponse {
  status: "consolidated" | "skipped" | "error";
  detail: string;
  primaryId: number;
  duplicateId: number;
  ticketsMoved?: number;
  messagesMoved?: number;
}

export const lidConsolidationAudit = async (params: {
  allTenants?: boolean;
  limit?: number;
}): Promise<AuditResponse> => {
  const search: Record<string, string> = {};
  if (params.allTenants) search.allTenants = "true";
  if (params.limit) search.limit = String(params.limit);
  const { data } = await api.get<AuditResponse>("/lidConsolidation/audit", {
    params: search,
    timeout: LID_CONSOLIDATION_TIMEOUT,
  });
  return data;
};

export const lidConsolidationApply = async (params: {
  allTenants?: boolean;
  limit?: number;
  pairIds?: [number, number];
  matchKinds?: MatchKind[];
}): Promise<ApplyResponse> => {
  const { data } = await api.post<ApplyResponse>("/lidConsolidation/apply", params, {
    timeout: LID_CONSOLIDATION_TIMEOUT,
  });
  return data;
};

export const lidConsolidationApplyManual = async (params: {
  primaryId: number;
  duplicateId: number;
}): Promise<ManualApplyResponse> => {
  const { data } = await api.post<ManualApplyResponse>("/lidConsolidation/applyManual", params, {
    timeout: LID_CONSOLIDATION_TIMEOUT,
  });
  return data;
};

// ---------------------------------------------------------------------------
// Mesclagem em massa (CSV) — POST /lidConsolidation/bulkMerge
// ---------------------------------------------------------------------------

export interface BulkMergePairInput {
  primaryId: number;
  duplicateId: number;
}

export interface BulkMergeLineResult {
  index: number;
  primaryId: number;
  duplicateId: number;
  status: "consolidated" | "skipped" | "error";
  code?: string;
  detail?: string;
}

export interface BulkMergeSummary {
  total: number;
  consolidated: number;
  skipped: number;
  errors: number;
}

export interface BulkMergeResponse {
  results: BulkMergeLineResult[];
  summary: BulkMergeSummary;
}

// O backend aceita no maximo 200 pares por request; mandamos blocos de 100
// sequenciais para manter cada request curta e permitir progresso no front.
const BULK_MERGE_CHUNK_SIZE = 100;

export const lidConsolidationBulkMerge = async (
  pairs: BulkMergePairInput[],
  params?: {
    allTenants?: boolean;
    /** Chamado apos cada chunk com (processados, total) para barra de progresso. */
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<BulkMergeResponse> => {
  const aggregated: BulkMergeResponse = {
    results: [],
    summary: { total: pairs.length, consolidated: 0, skipped: 0, errors: 0 },
  };

  for (let offset = 0; offset < pairs.length; offset += BULK_MERGE_CHUNK_SIZE) {
    const chunk = pairs.slice(offset, offset + BULK_MERGE_CHUNK_SIZE);
    try {
      const { data } = await api.post<BulkMergeResponse>(
        "/lidConsolidation/bulkMerge",
        { pairs: chunk, ...(params?.allTenants ? { allTenants: true } : {}) },
        { timeout: LID_CONSOLIDATION_TIMEOUT }
      );
      aggregated.results.push(
        ...(data.results || []).map((r) => ({ ...r, index: offset + r.index }))
      );
      aggregated.summary.consolidated += data.summary?.consolidated ?? 0;
      aggregated.summary.skipped += data.summary?.skipped ?? 0;
      aggregated.summary.errors += data.summary?.errors ?? 0;
      params?.onProgress?.(offset + chunk.length, pairs.length);
    } catch (err: any) {
      // Falha da REQUISICAO inteira (rede/timeout/5xx) — nao derruba o lote nem
      // insiste contra backend fora do ar: marca o chunk atual e os pares
      // restantes como erro por linha e encerra, devolvendo o agregado parcial.
      const code: string = err?.response?.data?.error || "ERR_BULK_REQUEST_FAILED";
      const detail: string = err?.response?.data?.detail || err?.message || "";
      const remaining = pairs.slice(offset);
      remaining.forEach((p, i) => {
        aggregated.results.push({
          index: offset + i,
          primaryId: p.primaryId,
          duplicateId: p.duplicateId,
          status: "error",
          code,
          detail,
        });
      });
      aggregated.summary.errors += remaining.length;
      params?.onProgress?.(pairs.length, pairs.length);
      break;
    }
  }

  return aggregated;
};

// ---------------------------------------------------------------------------
// Reversao (unmerge) — GET /lidConsolidation/mergeLogs + POST /lidConsolidation/unmerge
// ---------------------------------------------------------------------------

export interface MergeLogItem {
  id: number;
  tenantId: number;
  primaryId: number;
  duplicateId: number;
  /** MatchKind heuristico ou origem literal (ex.: "manual"). */
  matchKind: MatchKind | "manual" | (string & {});
  /** false = merge sem trilha suficiente para reverter (botao desabilitado). */
  unmergeable: boolean;
  revertedAt: string | null;
  createdAt: string;
  primaryName: string | null;
  primaryNumber: string | null;
  duplicateName: string | null;
  duplicateNumber: string | null;
}

export interface MergeLogsResponse {
  logs: MergeLogItem[];
}

export const lidConsolidationMergeLogs = async (params?: {
  limit?: number;
  activeOnly?: boolean;
  allTenants?: boolean;
}): Promise<MergeLogsResponse> => {
  const search: Record<string, string> = {};
  if (params?.limit) search.limit = String(params.limit);
  if (params?.activeOnly !== undefined) search.activeOnly = String(params.activeOnly);
  if (params?.allTenants) search.allTenants = "true";
  const { data } = await api.get<MergeLogsResponse>("/lidConsolidation/mergeLogs", {
    params: search,
    timeout: LID_CONSOLIDATION_TIMEOUT,
  });
  return data;
};

export interface UnmergeResponse {
  status: "reverted";
  mergeLogId: number;
  primaryId: number;
  duplicateId: number;
}

export const lidConsolidationUnmerge = async (input: {
  duplicateId?: number;
  mergeLogId?: number;
}): Promise<UnmergeResponse> => {
  const { data } = await api.post<UnmergeResponse>("/lidConsolidation/unmerge", input, {
    timeout: LID_CONSOLIDATION_TIMEOUT,
  });
  return data;
};
