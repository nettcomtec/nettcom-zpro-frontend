import api from "@/lib/api";

export interface InternalNotification {
  id: number;
  message: string;
  isRead: boolean;
  createdAt: string;
  updatedAt?: string;
  userId?: number;
  receiverId?: number;
  tenantId?: number;
  /** Remetente da mensagem interna; ao clicar abre essa conversa no chat-privado */
  senderId?: number;
  groupId?: number;
  /** Origem: null/undefined = manual/sistema, "chatflow" = chatbot (nó Notificar Equipe) */
  source?: string | null;
  user?: { id: number; name: string; email: string };
}

export async function fetchInternalNotifications(userId: number) {
  return api.get<InternalNotification[]>("/notifications", { params: { userId } });
}

export async function fetchAllNotifications(params?: {
  pageNumber?: number;
  searchParam?: string;
}) {
  return api.get<{ notifications: InternalNotification[]; count: number; hasMore: boolean }>(
    "/notifications",
    { params }
  );
}

export async function createNotification(data: {
  message: string;
  userIds?: number[];
}) {
  return api.post("/notifications", data);
}

export async function updateNotification(
  id: number,
  data: Partial<Pick<InternalNotification, "message" | "isRead">> & { userId?: number }
) {
  return api.put(`/notifications/${id}`, data);
}

export async function markNotificationAsRead(id: number, userId: number) {
  return api.put(`/notifications/${id}`, { isRead: true, userId });
}

export async function deleteNotification(id: number) {
  return api.delete(`/notifications/${id}`);
}

export async function deleteAllNotifications() {
  return api.delete("/notifications");
}

export async function markAllInternalAsRead(userId: number) {
  return api.put("/notifications/mark-all-read", { userId });
}
