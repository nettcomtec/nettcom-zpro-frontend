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
  /**
   * Até qual mensagem cada destinatário já leu o que eu mandei (`"<meu id>:<id dele>"`).
   * A leitura pode chegar antes da resposta do próprio envio (o servidor só responde
   * depois do web push), e a mensagem entraria com um ✓ para sempre.
   */
  sentReadUpTo: Record<string, number>;

  setMessages: (messages: PrivateMessage[]) => void;
  addMessage: (message: PrivateMessage) => void;
  updateMessage: (id: number, updates: Partial<PrivateMessage>) => void;
  removeMessage: (id: number) => void;
  setGroups: (groups: ChatGroup[]) => void;
  setUsers: (users: ChatUser[]) => void;
  markAsRead: (senderId: number) => void;
  /**
   * Leitura em tempo real: marca como lidas as mensagens que `myId` mandou a `readerId`
   * (só conversa 1 a 1). Com `upToId`, só até ela — a mensagem criada depois da leitura
   * continua com um ✓.
   */
  markSentMessagesRead: (myId: number, readerId: number, upToId?: number | null) => void;
  setUnreadCount: (count: number) => void;
  /** Incremento atômico do total de não lidos (mensagem nova via socket, tempo real) */
  incrementUnreadCount: () => void;
  setUnreadGroupCount: (count: number) => void;
  addMentionGroup: (groupId: number) => void;
  clearMentionGroup: (groupId: number) => void;
  setActiveConversation: (conv: { id: number; isGroup: boolean } | null) => void;
  /** Não lidas em tempo real por remetente (conversa 1 a 1) */
  socketUnreadByUser: Record<number, number>;
  /**
   * Não lidas em tempo real por equipe. Mapa separado de propósito: id de equipe e id de
   * usuário colidem, e no mesmo mapa a equipe 7 aparecia (e era zerada) no usuário 7.
   */
  socketUnreadByGroup: Record<number, number>;
  incrementSocketUnread: (id: number, isGroup?: boolean) => void;
  clearSocketUnread: (id: number, isGroup?: boolean) => void;
  /** "Marcar tudo como lido": zera os contadores de tempo real e os avisos de menção */
  clearAllSocketUnread: () => void;
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
  sentReadUpTo: {},
  socketUnreadByUser: {},
  socketUnreadByGroup: {},

  setMessages: (messages) =>
    set((state) => {
      const seen = new Set<number>();
      const deduped = messages.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      const sorted = deduped.sort(comparePrivateMessages);
      // Leitura que chegou enquanto a lista carregava: a resposta pode ser anterior a ela.
      const withReads = sorted.map((m) => {
        if (m.read || m.groupId != null) return m;
        const upTo = state.sentReadUpTo[`${m.senderId}:${m.receiverId}`];
        return upTo != null && Number(m.id) <= upTo ? { ...m, read: true } : m;
      });
      return { messages: withReads };
    }),

  addMessage: (incoming) =>
    set((state) => {
      if (state.messages.some((m) => m.id === incoming.id)) return state;
      const readUpTo = incoming.groupId == null && !incoming.read
        ? state.sentReadUpTo[`${incoming.senderId}:${incoming.receiverId}`]
        : undefined;
      const message = readUpTo != null && Number(incoming.id) <= readUpTo ? { ...incoming, read: true } : incoming;
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

  markSentMessagesRead: (myId, readerId, upToId) =>
    set((state) => {
      const key = `${myId}:${readerId}`;
      const sentReadUpTo = upToId != null && upToId > (state.sentReadUpTo[key] ?? 0)
        ? { ...state.sentReadUpTo, [key]: upToId }
        : state.sentReadUpTo;
      const hits = (m: PrivateMessage) =>
        !m.read &&
        m.groupId == null &&
        Number(m.senderId) === myId &&
        Number(m.receiverId) === readerId &&
        (upToId == null || Number(m.id) <= upToId);
      if (!state.messages.some(hits)) return sentReadUpTo === state.sentReadUpTo ? state : { sentReadUpTo };
      return { sentReadUpTo, messages: state.messages.map((m) => (hits(m) ? { ...m, read: true } : m)) };
    }),

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

  incrementSocketUnread: (id, isGroup = false) =>
    set((state) => {
      const key = isGroup ? "socketUnreadByGroup" : "socketUnreadByUser";
      const map = state[key];
      return { [key]: { ...map, [id]: (map[id] ?? 0) + 1 } } as Partial<ChatState>;
    }),

  clearSocketUnread: (id, isGroup = false) =>
    set((state) => {
      const key = isGroup ? "socketUnreadByGroup" : "socketUnreadByUser";
      if (state[key][id] == null) return state;
      const next = { ...state[key] };
      delete next[id];
      return { [key]: next } as Partial<ChatState>;
    }),

  clearAllSocketUnread: () => set({ socketUnreadByUser: {}, socketUnreadByGroup: {}, mentionGroupIds: [] }),

  reset: () => set({ messages: [], groups: [], users: [], unreadCount: 0, unreadGroupCount: 0, mentionGroupIds: [], activeConversation: null, sentReadUpTo: {}, socketUnreadByUser: {}, socketUnreadByGroup: {} }),
}));
