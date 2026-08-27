import api from "@/lib/api";

export interface CallLog {
  id: number;
  originNumber: string;
  destinationNumber: string;
  phoneNumber?: string;
  callStatus: string;
  callDuration: string | number | null;
  createdAt: string;
  userId?: number;
  user?: { id: number; name: string };
}

export interface CallLogFilters {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: string;
  userId?: number | string;
  originNumber?: string;
  destinationNumber?: string;
  callStatus?: string;
  startDate?: string;
  endDate?: string;
}

export interface CallLogResponse {
  data: CallLog[];
  count: number;
  hasMore?: boolean;
}

export interface CreateCallLogPayload {
  userId: number;
  tenantId: number;
  phoneNumber: string;
  originNumber: string;
  destinationNumber: string;
  callDuration?: number | null;
  callStatus: string;
}

export async function createCallLog(data: CreateCallLogPayload) {
  return api.post("/call-logs", data);
}

export async function fetchCallLogs(filters: CallLogFilters = {}) {
  return api.get<CallLogResponse | CallLog[]>("/call-logs", { params: filters });
}

export async function fetchCallLog(id: number) {
  return api.get<CallLog>(`/call-logs/${id}`);
}

export async function deleteCallLog(id: number) {
  return api.delete(`/call-logs/${id}`);
}
