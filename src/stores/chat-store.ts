import { create } from "zustand";

export interface PrivateMessage {
  id: number;
  text: string;
  senderId: number;
  receiverId?: number;
  groupId?: number | null;
  read: boolean;
  timestamp: number;
  createdAt?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaName?: string;
  react?: string | null;
  reactFromMe?: string | null;
  sender?: { id: number; name: string; profilePicture?: string };
  receiver?: { id: number; name: string };
  quotedMsgId?: number | null;
  quotedMsg?: PrivateMessage | null;
}

/**
 * Ordem da conversa = id (sequência do banco = ordem em que o servidor recebeu).
 * Nunca `timestamp`: ele vem do relógio do PC de quem enviou, e relógios divergentes
 * invertem mensagens próximas ao recarregar a tela.
 */
export function comparePrivateMessages(a: PrivateMessage, b: PrivateMessage) {
  return Number(a.id) - Number(b.id);
}

/** Instante exibido: `createdAt` (servidor); `timestamp` do remetente só quando ele não veio (socket de backend antigo). */
export function getPrivateMessageTime(msg: PrivateMessage): number {
  if (msg.createdAt) {
    const fromServer = new Date(msg.createdAt).getTime();
    if (!isNaN(fromServer)) return fromServer;
  }
  const raw = msg.timestamp as number | string | undefined;
  if (!raw) return 0;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return isNaN(parsed) ? new Date(raw).getTime() || 0 : parsed;
  }
  return raw;
}

export interface ChatGroup {
  id: number;
  name: string;
  count?: number;
  text?: string;
  timestamp?: number;
  senderId?: number;
  members?: number[];
  profilePicture?: string;
}

export interface ChatUser {
  id: number;
  name: string;
  email?: string;
  status?: string;
  isOnline?: boolean;
  count?: number;
  text?: string;
  timestamp?: number;
  senderId?: number;
  read?: boolean;
  profilePicture?: string;
}

interface ChatState {
  messages: PrivateMessage[];
  groups: ChatGroup[];
  users: ChatUser[];
  unreadCount: number;
  unreadGroupCount: number;
  /** IDs de grupos com menção não lida para o usuário atual */
  mentionGroupIds: number[];
  /** Conversa atualmente aberta (para filtrar mensagens do socket) */
  activeConversation: { id: number; isGroup: boolean } | null;

  setMessages: (messages: PrivateMessage[]) => void;
  addMessage: (message: PrivateMessage) => void;
  updateMessage: (id: number, updates: Partial<PrivateMessage>) => void;
  removeMessage: (id: number) => void;
  setGroups: (groups: ChatGroup[]) => void;
  setUsers: (users: ChatUser[]) => void;
  markAsRead: (senderId: number) => void;
  setUnreadCount: (count: number) => void;
  /** Incremento atômico do total de não lidos (mensagem nova via socket, tempo real) */
  incrementUnreadCount: () => void;
  setUnreadGroupCount: (count: number) => void;
  addMentionGroup: (groupId: number) => void;
  clearMentionGroup: (groupId: number) => void;
  setActiveConversation: (conv: { id: number; isGroup: boolean } | null) => void;
  /** Unread counts updated in real-time by socket events (by senderId for DMs, groupId for groups) */
  socketUnreadByUser: Record<number, number>;
  incrementSocketUnread: (id: number) => void;
  clearSocketUnread: (id: number) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  groups: [],
  users: [],
  unreadCount: 0,
  unreadGroupCount: 0,
  mentionGroupIds: [],
  activeConversation: null,
  socketUnreadByUser: {},

  setMessages: (messages) => {
    const seen = new Set<number>();
    const deduped = messages.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    const sorted = deduped.sort(comparePrivateMessages);
    set({ messages: sorted });
  },

  addMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) return state;
      // Mesma ordem do setMessages: a resposta do próprio envio e o socket de outro
      // usuário podem chegar trocados, e a tela ao vivo tem de bater com a recarregada.
      const idx = state.messages.findIndex((m) => comparePrivateMessages(m, message) > 0);
      if (idx === -1) return { messages: [...state.messages, message] };
      const next = [...state.messages];
      next.splice(idx, 0, message);
      return { messages: next };
    }),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),

  setGroups: (groups) => set({ groups }),
  setUsers: (users) => set({ users }),

  markAsRead: (senderId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.senderId === senderId ? { ...m, read: true } : m
      ),
    })),

  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnreadCount: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  setUnreadGroupCount: (count) => set({ unreadGroupCount: count }),

  addMentionGroup: (groupId) =>
    set((state) => ({
      mentionGroupIds: state.mentionGroupIds.includes(groupId)
        ? state.mentionGroupIds
        : [...state.mentionGroupIds, groupId],
    })),

  clearMentionGroup: (groupId) =>
    set((state) => ({
      mentionGroupIds: state.mentionGroupIds.filter((id) => id !== groupId),
    })),

  setActiveConversation: (conv) => set({ activeConversation: conv }),

  incrementSocketUnread: (id) =>
    set((state) => ({
      socketUnreadByUser: {
        ...state.socketUnreadByUser,
        [id]: (state.socketUnreadByUser[id] ?? 0) + 1,
      },
    })),

  clearSocketUnread: (id) =>
    set((state) => {
      const next = { ...state.socketUnreadByUser };
      delete next[id];
      return { socketUnreadByUser: next };
    }),

  reset: () => set({ messages: [], groups: [], users: [], unreadCount: 0, unreadGroupCount: 0, mentionGroupIds: [], activeConversation: null, socketUnreadByUser: {} }),
}));
