import api from "@/lib/api";

export interface TicketAction {
  id: number;
  name: string;
  description?: string;
  hoursWithoutResponse: number;
  actionType: "message" | "media" | "add_tag" | "add_wallet" | "flow" | "waba_template";
  actionContent?: string;
  tagId?: number;
  walletId?: number;
  whatsappId?: number;
  active: boolean;
  startedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketActionListResponse {
  data: TicketAction[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function fetchTicketActions(params?: {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: "ASC" | "DESC";
  whatsappId?: number;
  actionType?: string;
  active?: boolean;
  searchTerm?: string;
}) {
  const res = await api.get("/ticket-actions", { params });
  const data = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  return {
    data: Array.isArray(data) ? data : [],
    pagination: res.data?.pagination,
  };
}

export async function fetchTicketAction(id: number) {
  const res = await api.get(`/ticket-actions/${id}`);
  return res.data;
}

export async function createTicketAction(data: Partial<TicketAction>) {
  const res = await api.post("/ticket-actions", data);
  return res.data;
}

export async function updateTicketAction(id: number, data: Partial<TicketAction>) {
  const res = await api.put(`/ticket-actions/${id}`, data);
  return res.data;
}

export async function deleteTicketAction(id: number) {
  await api.delete(`/ticket-actions/${id}`);
}

export async function toggleTicketAction(id: number) {
  const res = await api.put(`/ticket-actions/${id}/toggle-active`);
  return res.data;
}
