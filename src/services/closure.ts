import api from "@/lib/api";

export interface Reason {
  id: number;
  name: string;
  isActive: boolean;
  tenantId?: number;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchReasons() {
  const { data } = await api.get<Reason[]>("/reasons");
  return Array.isArray(data) ? data : [];
}

export async function createReason(payload: { name: string; isActive?: boolean }) {
  return api.post<Reason>("/reasons", payload);
}

export async function updateReason(id: number, payload: Partial<Reason>) {
  return api.put<Reason>(`/reasons/${id}`, payload);
}

export async function deleteReason(id: number) {
  return api.delete(`/reasons/${id}`);
}
