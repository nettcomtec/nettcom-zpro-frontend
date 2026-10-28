import api from "@/lib/api";
import type { SipConnectivityResponse } from "@/lib/sip-diagnostics";

export interface Queue {
  id: number;
  name: string;
  color: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  profile: string;
  phone?: string;
  status?: string;
  isOnline?: boolean;
  lastLogin?: string | null;
  inactive?: boolean;
  restrictedUser?: boolean | string;
  blockWavoip?: boolean;
  menuPermissions?: Record<string, boolean>;
  queues?: Queue[];
  whatsapps?: { id: number; name?: string }[];
  password?: string;
  whatsappAllowed?: number[];
  profilePicture?: string;
  [key: string]: unknown;
}

export async function fetchUsers(page = 1, limit = 100) {
  return api.get("/users", { params: { page, limit } });
}

export async function fetchAllUsers(): Promise<{ data: { users: User[]; count: number } }> {
  const all: User[] = [];
  let pageNumber = 1;
  let count = 0;
  const MAX_PAGES = 50;
  while (pageNumber <= MAX_PAGES) {
    const { data } = await api.get<{ users: User[]; count: number; hasMore: boolean }>(
      "/users",
      { params: { pageNumber } }
    );
    const batch = data?.users || [];
    all.push(...batch);
    count = data?.count ?? all.length;
    if (!data?.hasMore || batch.length === 0) break;
    pageNumber += 1;
  }
  return { data: { users: all, count } };
}

export async function fetchUser(userId: number) {
  return api.get(`/users/${userId}`);
}

export async function createUser(data: Partial<User>) {
  return api.post("/users", data);
}

export async function updateUser(userId: number, data: Partial<User>) {
  return api.put(`/users/${userId}`, data);
}

export async function deleteUser(userId: number) {
  return api.delete(`/users/${userId}`);
}

export async function inactivateUser(userId: number) {
  return api.put(`/users/${userId}/inactivate`);
}

export async function reactivateUser(userId: number) {
  return api.put(`/users/${userId}/reactivate`);
}

export async function updateUserConfigs(userId: number, configs: Record<string, unknown>) {
  return api.put(`/users/${userId}/configs`, configs);
}

// Marca o tour de boas-vindas como visto no servidor (best-effort, chamador dá
// catch silencioso). skipNoPermissionToast: backend antigo sem "tourDone" na
// allowlist de User.configs responde 403 ERR_NO_PERMISSION — sem a flag, o
// toast global "sem permissão" apareceria do nada no login.
export async function persistTourDone(userId: number) {
  return api.put(`/users/${userId}/configs`, { tourDone: "v1" }, { skipNoPermissionToast: true });
}

// Som das notificações só do próprio usuário (botão de som do topo). skipNoPermissionToast:
// backend antigo sem a chave na allowlist de User.configs responde 403 — quem chama mostra
// o próprio aviso e volta a escolha.
export async function persistNotificationSoundMute(userId: number, mode: "none" | "groups" | "all") {
  return api.put(`/users/${userId}/configs`, { notificationSoundMute: mode }, { skipNoPermissionToast: true });
}

// Troca da própria senha (exige senha atual; backend limpa mustChangePassword)
export async function changeOwnPassword(data: { currentPassword: string; newPassword: string }) {
  return api.put("/users/change-password", data);
}

// Reenvio do convite de definição de senha (modo invite do tenant)
export async function resendUserInvite(userId: number) {
  return api.post(`/users/${userId}/resend-invite`);
}

// "Testar conexão" da Config SIP. Falha da chamada (backend antigo sem a rota, rede)
// devolve null: o teste mostra o motivo genérico em vez de quebrar.
export async function checkSipConnectivity(input: {
  server: string;
  port: number;
  transport: "wss" | "ws";
  origin: string;
}): Promise<SipConnectivityResponse | null> {
  try {
    const { data } = await api.post<SipConnectivityResponse>("/users/sip-diagnostics/connectivity", input);
    return data && typeof data.code === "string" ? data : null;
  } catch {
    return null;
  }
}

export async function resolveSipHost(host: string): Promise<string[] | null> {
  try {
    const { data } = await api.post<{ ok: boolean; addresses?: string[] }>("/users/sip-diagnostics/resolve", { host });
    return data?.ok && Array.isArray(data.addresses) ? data.addresses : null;
  } catch {
    return null;
  }
}

export async function updateUserIsOnline(userId: number, isOnline: boolean) {
  return api.put(`/usersIsOnline/${userId}`, { isOnline });
}

export async function uploadUserProfilePicture(userId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return api.post(`/users/${userId}/profile-picture`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}
