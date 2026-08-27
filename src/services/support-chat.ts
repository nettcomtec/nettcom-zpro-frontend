import api from "@/lib/api";

export interface SupportMessage {
  id: number;
  tenantId: number;
  senderId: number;
  conversationUserId: number;
  text: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  fromSuperadmin: boolean;
  read: boolean;
  timestamp: number;
  createdAt: string;
  sender?: { id: number; name: string; profilePicture?: string };
  quotedMsgId?: number | null;
  quotedMsg?: SupportMessage | null;
}

export interface SupportUser {
  userId: number;
  userName: string;
  tenantId: number;
  tenantName: string;
  tenantStatus: string;
  supportChatEnabled: string;
  profilePicture: string | null;
  unreadCount: number;
  lastMessageText: string | null;
  lastMessageMediaType: string | null;
  lastMessageFromSuperadmin: boolean | null;
  lastMessageAt: string | null;
}

// Tenant user
export async function fetchSupportMessages(params?: { limit?: number; offset?: number }) {
  return api.get("/support-chat/messages", { params });
}

export async function sendSupportMessage(data: FormData | { text: string; quotedMsgId?: number | null }) {
  if (data instanceof FormData) {
    return api.post("/support-chat/messages", data, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  return api.post("/support-chat/messages", data);
}

export async function markSupportMessagesRead() {
  return api.put("/support-chat/messages/read");
}

export async function fetchUnreadSupportCount() {
  return api.get("/support-chat/unread");
}

// Superadmin
export async function fetchSupportUsers() {
  return api.get("/admin/support-chat/users");
}

export async function fetchSupportMessagesAdmin(tenantId: number, userId: number, params?: { limit?: number; offset?: number }) {
  return api.get(`/admin/support-chat/${tenantId}/${userId}/messages`, { params });
}

export async function sendSupportMessageAdmin(tenantId: number, userId: number, data: FormData | { text: string; quotedMsgId?: number | null }) {
  if (data instanceof FormData) {
    return api.post(`/admin/support-chat/${tenantId}/${userId}/messages`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  return api.post(`/admin/support-chat/${tenantId}/${userId}/messages`, data);
}

export async function markSupportMessagesReadAdmin(tenantId: number, userId: number) {
  return api.put(`/admin/support-chat/${tenantId}/${userId}/read`);
}
