import api from "@/lib/api";

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

// Troca da própria senha (exige senha atual; backend limpa mustChangePassword)
export async function changeOwnPassword(data: { currentPassword: string; newPassword: string }) {
  return api.put("/users/change-password", data);
}

// Reenvio do convite de definição de senha (modo invite do tenant)
export async function resendUserInvite(userId: number) {
  return api.post(`/users/${userId}/resend-invite`);
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
