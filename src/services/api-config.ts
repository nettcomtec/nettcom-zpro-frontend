import api from "@/lib/api";

export interface ApiConfig {
  id: number;
  name: string;
  sessionId: number;
  apiTokenPrefix?: string | null;
  authToken?: string;
  urlServiceStatus?: string;
  urlMessageStatus?: string;
  isActive: boolean;
  tenantId?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiConfigWithToken extends ApiConfig {
  plainToken: string;
}

export async function fetchApiConfigs() {
  return api.get<{ apis: ApiConfig[] }>("/api-config/");
}

export async function createApiConfig(data: Record<string, unknown>) {
  return api.post<ApiConfigWithToken>("/api-config/", data);
}

export async function updateApiConfig(id: number, data: Record<string, unknown>) {
  return api.put<ApiConfig>(`/api-config/${id}/`, data);
}

export async function renewApiToken(id: number) {
  return api.put<ApiConfigWithToken>(`/api-config/renew-token/${id}/`);
}

export async function deleteApiConfig(id: number) {
  return api.delete(`/api-config/${id}/`);
}
