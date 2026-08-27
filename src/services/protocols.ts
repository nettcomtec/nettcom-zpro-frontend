import api from "@/lib/api";

export interface Protocol {
  id: number;
  protocol: string;
  ticketId: number;
  contactId?: number;
  contactName?: string;
  contactNumber?: string;
  contactProfilePicUrl?: string;
  userName?: string;
  status?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FetchProtocolsResult {
  ticketProtocols: Protocol[];
  count: number;
  hasMore: boolean;
}

export async function fetchProtocols(params?: {
  searchParam?: string;
  pageNumber?: string;
  startDate?: string;
  endDate?: string;
}): Promise<FetchProtocolsResult> {
  const query = new URLSearchParams();
  if (params?.searchParam) query.set("searchParam", params.searchParam);
  if (params?.pageNumber) query.set("pageNumber", params.pageNumber);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  const qs = query.toString();
  const { data } = await api.get<
    { ticketProtocols?: Protocol[]; count?: number; hasMore?: boolean } | Protocol[]
  >(`/ticketProtocols/${qs ? `?${qs}` : ""}`);
  if (Array.isArray(data)) {
    return { ticketProtocols: data, count: data.length, hasMore: false };
  }
  return {
    ticketProtocols: (data as any).ticketProtocols || [],
    count: (data as any).count || 0,
    hasMore: (data as any).hasMore || false,
  };
}

export async function createProtocol(payload: { protocol: string; ticketId: number }) {
  return api.post<Protocol>("/ticketProtocols/", payload);
}

export async function updateProtocol(id: number, payload: Partial<Protocol>) {
  return api.put<Protocol>(`/ticketProtocols/${id}`, payload);
}

export async function deleteProtocol(id: number) {
  return api.delete(`/ticketProtocols/${id}`);
}

export async function fetchProtocolLogs(ticketId: number) {
  return api.get(`/ticketProtocols/${ticketId}/logs`);
}
