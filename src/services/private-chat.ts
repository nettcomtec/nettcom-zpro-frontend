import api from "@/lib/api";

export interface PrivateMessage {
  id: number;
  text: string;
  senderId: number;
  receiverId: number;
  groupId?: number | null;
  read: boolean;
  timestamp: number;
  createdAt: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaName?: string;
  react?: string | null;
  reactFromMe?: string | null;
  sender?: { id: number; name: string };
  receiver?: { id: number; name: string };
  quotedMsgId?: number | null;
  quotedMsg?: PrivateMessage | null;
}

export interface SendMessagePayload {
  text: string;
  receiverId: number;
  timestamp: number;
  isGroup?: boolean;
  quotedMsgId?: number | null;
}

/**
 * `untilMessageId` (só com a página 1): o servidor devolve as páginas até a dessa mensagem e
 * responde `pageNumber` + `target` (`found` | `tooOld` | `notFound`). Backend antigo ignora.
 */
export async function fetchPrivateMessages(userId: number, isGroup = false, pageNumber?: number, untilMessageId?: number) {
  return api.get(`/chat-privado/msg/${userId}`, {
    params: {
      isGroup,
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(untilMessageId !== undefined && pageNumber === 1 ? { untilMessageId } : {}),
    },
  });
}

export interface PrivateChatSearchResult {
  id: number;
  /** Trecho em volta da palavra encontrada (a mensagem pode ser longa). */
  text: string;
  mediaType: string | null;
  createdAt: string;
  timestamp: number | null;
  senderId: number | null;
  senderName: string | null;
  conversation: { isGroup: boolean; id: number; name: string; profilePicture: string | null };
}

/** Busca por palavras nas conversas do usuário e nas equipes de que ele é membro. */
export async function searchPrivateMessages(
  params: { q: string; contactId?: number; isGroup?: boolean; beforeId?: number; limit?: number },
  signal?: AbortSignal
) {
  return api.get<{ results: PrivateChatSearchResult[]; hasMore: boolean }>("/chat-privado/search", {
    params: {
      q: params.q,
      ...(params.contactId !== undefined ? { contactId: params.contactId, isGroup: !!params.isGroup } : {}),
      ...(params.beforeId !== undefined ? { beforeId: params.beforeId } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    },
    signal,
  });
}

export async function sendPrivateMessage(data: FormData | SendMessagePayload) {
  const isFormData = data instanceof FormData;
  return api.post("/chat-privado/msg", data, isFormData ? {
    headers: { "Content-Type": "multipart/form-data" },
  } : {});
}

export async function markAsRead(contactId: number, isGroup = false) {
  return api.put(`/chat-privado/msg/${contactId}/read`, { isGroup });
}

export async function markAllAsRead() {
  return api.put("/chat-privado/msgMarcarTodasLidas");
}

export async function editPrivateMessage(messageId: number, text: string) {
  return api.put(`/chat-privado/msg/${messageId}`, { text });
}

export async function deletePrivateMessage(messageId: number) {
  return api.delete(`/chat-privado/msg/${messageId}`);
}

export async function addReaction(messageId: number, emoji: string) {
  return api.put(`/chat-privado/msg/${messageId}/reaction`, { emoji });
}

export async function removeReaction(messageId: number) {
  return api.delete(`/chat-privado/msg/${messageId}/reaction`);
}

export async function fetchUnreadCounts() {
  return api.get("/chat-privado/msgs/mensagens");
}

export async function fetchUnreadGroupCounts() {
  return api.get("/chat-privado/groups/mensagens");
}

/** Total de não lidas (conversas + equipes), no mesmo formato lido pelo sino e pela tela. */
export async function fetchChatUnreadTotal(): Promise<number> {
  const [privateRes, groupRes] = await Promise.all([
    fetchUnreadCounts(),
    fetchUnreadGroupCounts().catch(() => ({ data: { count: 0 } })),
  ]);
  const privateCount = Number((privateRes.data as { count?: number })?.count) || 0;
  const g = groupRes.data as { count?: number | { count?: number } };
  const groupCount = Number(g?.count && typeof g.count === "object" ? g.count?.count : g?.count) || 0;
  return privateCount + groupCount;
}

/**
 * Mesmo total, mas falha se QUALQUER parte falhar. Para decisões que apagam algo (ex.: tirar o
 * aviso fixo quando o total dá 0): a versão acima conta como 0 a parte de equipes que falhou.
 */
export async function fetchChatUnreadTotalStrict(): Promise<number> {
  const [privateRes, groupRes] = await Promise.all([fetchUnreadCounts(), fetchUnreadGroupCounts()]);
  const privateCount = Number((privateRes.data as { count?: number })?.count) || 0;
  const g = groupRes.data as { count?: number | { count?: number } };
  const groupCount = Number(g?.count && typeof g.count === "object" ? g.count?.count : g?.count) || 0;
  return privateCount + groupCount;
}

export interface UnreadPreviewItem {
  type: "private" | "group";
  peerId: number;
  name: string;
  avatarUrl: string | null;
  unreadCount: number;
  lastMessage: {
    text: string;
    mediaType: string | null;
    createdAt: string;
  };
}

export async function fetchUnreadPreview(limit = 5) {
  return api.get<{ items: UnreadPreviewItem[] }>("/chat-privado/unread-preview", { params: { limit } });
}

export async function fetchOnlineUsers() {
  return api.get("/users/chat-privado");
}

export async function fetchPrivateGroups(userId: number) {
  return api.get(`/users/grupo-privado/${userId}`);
}

export async function fetchGroupMembers(groupId: number) {
  return api.get(`/group-message/${groupId}`);
}

// ── Auditoria (espiar) do chat privado — somente leitura (admin/supervisor) ──
export interface AuditUser {
  id: number;
  name: string;
  email?: string;
  profile?: string;
  isOnline?: boolean;
  profilePicture?: string;
}

export interface AuditConversation {
  id: number;
  name: string;
  email?: string;
  profilePicture?: string;
  isOnline?: boolean;
  lastText?: string | null;
  lastTimestamp?: number | null;
  lastMediaType?: string | null;
  lastSenderId?: number | null;
}

export interface AuditGroup {
  id: number;
  name: string;
  profilePicture?: string;
  lastText?: string | null;
  lastTimestamp?: number | null;
  lastSenderId?: number | null;
  memberCount?: number;
}

export async function fetchAuditUsers() {
  return api.get<{ users: AuditUser[] }>("/chat-privado/audit/users");
}

export async function fetchAuditConversations(userId: number) {
  return api.get<{ conversations: AuditConversation[] }>(`/chat-privado/audit/conversations/${userId}`);
}

export async function fetchAuditGroups() {
  return api.get<{ groups: AuditGroup[] }>("/chat-privado/audit/groups");
}

export async function fetchAuditMessages(params: {
  userA?: number;
  userB?: number;
  groupId?: number;
  pageNumber?: number;
}) {
  return api.get("/chat-privado/audit/messages", { params });
}
