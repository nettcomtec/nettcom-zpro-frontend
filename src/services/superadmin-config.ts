import api from "@/lib/api";

export async function fetchSuperadminConfigs() {
  return api.get("/superadmin-config");
}

export async function updateSuperadminConfig(key: string, value: string) {
  return api.put(`/superadmin-config/${key}`, { value });
}
