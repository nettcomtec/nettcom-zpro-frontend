import api from "@/lib/api";

export interface Reason {
  id: number;
  name: string;
  color?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchReasons() {
  return api.get<{ reasons: Reason[] } | Reason[]>("/reasons");
}

export async function createReason(data: { name: string; color?: string }) {
  return api.post("/reasons", data);
}

export async function updateReason(id: number, data: { name?: string; color?: string; isActive?: boolean }) {
  return api.put(`/reasons/${id}`, data);
}

export async function deleteReason(id: number) {
  return api.delete(`/reasons/${id}`);
}
