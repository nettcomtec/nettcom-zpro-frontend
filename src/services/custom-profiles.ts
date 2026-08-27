import api from "@/lib/api";
import type { ICustomPermissions } from "@/types/custom-permissions";

export interface CustomProfileItem {
  id: number;
  tenantId: number;
  name: string;
  description: string | null;
  customPermissions: ICustomPermissions;
  menuPermissions: Record<string, boolean>;
  usersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomProfileInput {
  name: string;
  description?: string | null;
  customPermissions?: Partial<ICustomPermissions>;
  menuPermissions?: Record<string, boolean>;
}

export async function fetchCustomProfiles() {
  const { data } = await api.get<CustomProfileItem[]>("/custom-profiles");
  return Array.isArray(data) ? data : [];
}

export async function fetchCustomProfile(id: number) {
  const { data } = await api.get<CustomProfileItem>(`/custom-profiles/${id}`);
  return data;
}

export async function createCustomProfile(payload: CustomProfileInput) {
  return api.post<CustomProfileItem>("/custom-profiles", payload);
}

export async function updateCustomProfile(id: number, payload: Partial<CustomProfileInput>) {
  return api.put<CustomProfileItem>(`/custom-profiles/${id}`, payload);
}

export async function deleteCustomProfile(id: number) {
  return api.delete(`/custom-profiles/${id}`);
}
