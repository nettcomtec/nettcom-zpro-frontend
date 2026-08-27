import api from "@/lib/api";

export async function fetchSettings(signal?: AbortSignal, page = 1, limit = 100) {
  return api.get("/settings", { params: { page, limit }, signal });
}

export async function updateSetting(key: string, value: unknown) {
  return api.put(`/settings/${key}`, { key, value });
}

export async function fetchPublicColors() {
  return api.get("/publicSystemColors");
}

export async function fetchPublicColorsDark() {
  return api.get("/publicSystemColorsDark");
}

export async function fetchTerms() {
  return api.get("/tenantsTerms");
}
