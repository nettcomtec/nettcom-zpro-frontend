import api from "@/lib/api";

export interface AuditLogUser {
  id: number;
  name: string;
  email: string;
}

export interface AuditLog {
  id: string;
  tenantId: number | null;
  userId: number | null;
  user?: AuditLogUser;
  action: string;
  entity: string;
  entityId: string | null;
  method: string;
  path: string;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  requestBody: unknown;
  createdAt: string;
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  userId?: number;
  action?: string;
  entity?: string;
  startDate?: string;
  endDate?: string;
  statusCode?: number;
  tenantId?: number;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  count: number;
  hasMore: boolean;
}

export async function fetchMyAuditLogs(page = 1, limit = 30) {
  return api.get<AuditLogResponse>(`/audit-logs/me?page=${page}&limit=${limit}`);
}

export async function fetchAuditLogs(filters: AuditLogFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });
  return api.get<AuditLogResponse>(`/audit-logs?${params.toString()}`);
}
