import api from "@/lib/api";

export interface WaVoipCall {
  id: string | number;
  caller?: string;
  receiver?: string;
  from?: string;
  to?: string;
  direction?: string;
  duration?: number;
  status: string;
  created_date?: string;
  createdAt?: string;
  whatsapp_call_id?: string;
}

export interface WaVoipDevice {
  id: string;
  id_user?: string;
  name: string;
  phone?: string;
  token?: string;
  status: string;
}

export async function loginAndFetchCalls(payload: { email: string; password: string }) {
  return api.post<{ result: WaVoipCall[] }>("/auth/login-and-fetch-calls", payload);
}

export async function fetchCalls() {
  const { data } = await api.post<{ result: WaVoipCall[] } | WaVoipCall[]>("/fetch-calls");
  if (Array.isArray(data)) return data;
  return (data as { result?: WaVoipCall[] }).result || [];
}

export async function fetchDevices() {
  const { data } = await api.post<{ result: WaVoipDevice[] } | WaVoipDevice[]>("/fetch-devices");
  if (Array.isArray(data)) return data;
  return (data as { result?: WaVoipDevice[] }).result || [];
}

export async function fetchCallsByToken(token: string) {
  return api.get<{ result?: WaVoipCall[] } | WaVoipCall[]>(`/calls/${token}`);
}

export async function resetWavoip() {
  return api.post("/reset-wavoip");
}

export interface WavoipCallPayload {
  direction: "incoming" | "outgoing";
  phone: string;
  deviceToken?: string;
  inboxName?: string;
  callStatus?: string;
  tenantId?: number;
  userId?: number;
  ticketId?: number;
  wavoipCallId?: string;
}

export interface WavoipCallUpdatePayload {
  callStatus?: string;
  callDuration?: number;
}

export async function createWavoipCall(data: WavoipCallPayload) {
  return api.post("/wavoip-calls", data);
}

export async function updateWavoipCall(id: number | string, data: WavoipCallUpdatePayload) {
  return api.put(`/wavoip-calls/${id}`, data);
}

export interface WavoipCallRecord {
  id: number | string;
  direction?: "incoming" | "outgoing";
  phone?: string;
  callStatus?: string;
  callDuration?: number | null;
  createdAt?: string;
  user?: { id: number; name: string };
}

export interface WavoipCallListResponse {
  data: WavoipCallRecord[];
  count?: number;
}

export async function createCallNote(data: {
  notes: string;
  noteType: string;
  fromMe: boolean;
  ticketId?: number;
  contactPhone?: string;
  wavoipCallId?: string;
}) {
  return api.post("/ticketNotes/", data);
}

export async function fetchWavoipCallsByTicket(
  ticketId: number,
  params: { limit?: number; orderDirection?: string } = {}
) {
  return api.get<WavoipCallListResponse | WavoipCallRecord[]>("/wavoip-calls", {
    params: { ticketId, ...params },
  });
}
