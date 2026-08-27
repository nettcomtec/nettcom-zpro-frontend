import api from "@/lib/api";

export interface StorageConfig {
  id: number;
  tenantId: number | null;
  isGlobal: boolean;
  isActive: boolean;
  provider: "s3";
  endpoint: string | null;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicUrlBase: string | null;
  keepLocalCopy: boolean;
  autoDeleteEnabled: boolean;
  autoDeleteDays: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchStorageConfigs() {
  return api.get<StorageConfig[]>("/storage-configs");
}

export async function createStorageConfig(data: Partial<StorageConfig>) {
  return api.post<StorageConfig>("/storage-configs", data);
}

export async function updateStorageConfig(id: number, data: Partial<StorageConfig>) {
  return api.put<StorageConfig>(`/storage-configs/${id}`, data);
}

export async function deleteStorageConfig(id: number) {
  return api.delete(`/storage-configs/${id}`);
}

export async function testStorageConnection(id: number) {
  return api.post<{ ok: boolean; error?: string }>(`/storage-configs/${id}/test`);
}

export async function migrateToStorage(configId: number) {
  return api.post("/storage-configs/migrate", { configId });
}

export async function repairStorage(configId: number) {
  return api.post("/storage-configs/repair", { configId });
}
