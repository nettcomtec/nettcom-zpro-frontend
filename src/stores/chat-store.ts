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
    const sorted = deduped.sort((a, b) => {
      const ta = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tb = b.timestamp || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return ta - tb;
    });
    set({ messages: sorted });
  },

  addMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) return state;
      return { messages: [...state.messages, message] };
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
