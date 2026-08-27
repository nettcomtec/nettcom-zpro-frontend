import api from "@/lib/api";

export interface TenantVariable {
  id: number;
  key: string;
  value: string;
  description?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchTenantVariables() {
  return api.get<TenantVariable[]>("/tenant-variables");
}

export async function createTenantVariable(data: {
  key: string;
  value: string;
  description?: string;
}) {
  return api.post<TenantVariable>("/tenant-variables", data);
}

export async function updateTenantVariable(
  id: number,
  data: { key?: string; value?: string; description?: string; active?: boolean }
) {
  return api.put<TenantVariable>(`/tenant-variables/${id}`, data);
}

export async function deleteTenantVariable(id: number) {
  return api.delete(`/tenant-variables/${id}`);
}
