import api from "@/lib/api";

export interface Team {
  id: number;
  group: string;
  isActive: boolean;
  userId?: number;
  tenantId?: number;
  createdAt?: string;
  updatedAt?: string;
  name?: string;
  profilePicture?: string;
  usersCount?: number;
  users?: { id: number; name: string; profile?: string }[];
}

export async function fetchTeams() {
  const { data } = await api.get<Team[]>("/group-message");
  const list = Array.isArray(data) ? data : [];
  return { data: list.map((t) => ({ ...t, name: t.group || t.name })) };
}

export async function createTeam(payload: { name: string; isActive?: boolean }) {
  return api.post("/group-message", {
    group: payload.name,
    isActive: payload.isActive ?? true,
  });
}

export async function updateTeam(teamId: number, payload: { name?: string; isActive?: boolean }) {
  return api.put(`/group-message/${teamId}`, {
    group: payload.name,
    isActive: payload.isActive,
  });
}

export async function deleteTeam(teamId: number) {
  return api.delete(`/group-message/${teamId}`);
}

export async function fetchTeamMembers(teamId: number) {
  return api.get(`/group-message/${teamId}`);
}

export async function addTeamMember(userId: number, groupId: number) {
  return api.post("/group-message/user", { userId, groupId });
}

export async function removeTeamMember(userId: number, groupId: number) {
  return api.delete(`/group-message/user/${userId}/${groupId}`);
}

export async function uploadGroupProfilePicture(groupId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return api.post(`/group-message/${groupId}/profile-picture`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}
