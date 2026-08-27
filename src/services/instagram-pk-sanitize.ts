import api from "@/lib/api";

export interface AuditedCandidate {
  id: number;
  name: string;
  tenantId: number;
  dbPk: string;
  metaPk: string | null;
  divergent: boolean;
  reason?: string;
}

export interface SanitizeAuditDebug {
  profile?: string;
  effectiveTenantFilter?: number | null;
  totalCandidates?: number;
  divergent?: number;
  notFoundInMeta?: number;
}

export interface SanitizeAuditResponse {
  scope: string;
  total: number;
  audited: AuditedCandidate[];
  debug?: SanitizeAuditDebug;
}

export interface SanitizeApplyResponse {
  corrected: number;
  skipped: number;
  total: number;
}

export const sanitizeInstagramPkAudit = async (params: {
  allTenants?: boolean;
  limit?: number;
}): Promise<SanitizeAuditResponse> => {
  const search: Record<string, string> = {};
  if (params.allTenants) search.allTenants = "true";
  if (params.limit) search.limit = String(params.limit);
  const { data } = await api.get<SanitizeAuditResponse>("/sanitizeInstagramPk/audit", { params: search });
  return data;
};

export const sanitizeInstagramPkApply = async (params: {
  allTenants?: boolean;
  only?: number[];
}): Promise<SanitizeApplyResponse> => {
  const { data } = await api.post<SanitizeApplyResponse>("/sanitizeInstagramPk/apply", params);
  return data;
};

export const sanitizeInstagramPkApplyManual = async (params: {
  contactId: number;
  correctPk: string;
  allTenants?: boolean;
}): Promise<{ ok: true }> => {
  const { data } = await api.post<{ ok: true }>("/sanitizeInstagramPk/applyManual", params);
  return data;
};
