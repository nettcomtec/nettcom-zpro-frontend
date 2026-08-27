import { create } from "zustand";

export interface Notification {
  id: number;
  message: string;
  read: boolean;
  createdAt: string;
  /** Quando preenchido, ao clicar navega para /atendimento?ticketId= */
  ticketId?: number;
  /** true = ticket de grupo; redireciona para /atendimento?ticketId=&tab=groups */
  ticketIsGroup?: boolean;
  ticket?: unknown;
  contact?: unknown;
  /** Para notificação interna: ao clicar abre conversa no chat-privado (userId do remetente) */
  internalContactId?: number;
  /** true = conversa de grupo no chat interno; usar internalGroupId na URL */
  internalIsGroup?: boolean;
  /** ID do grupo (chat interno); ao clicar abre /chat-privado?groupId= */
  internalGroupId?: number;
  /** Origem da notificação interna: "chatflow" = nó Notificar Equipe do chatbot */
  source?: string | null;
}

interface NotificationState {
  notifications: Notification[];
  /** Notificações internas do sistema (API /notifications) */
  internalNotifications: Notification[];
  unreadCount: number;

  setNotifications: (notifications: Notification[]) => void;
  setInternalNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  addInternalNotification: (notification: Notification) => void;
  markAsRead: (id: number) => void;
  markInternalAsRead: (id: number) => void;
  markAllAsRead: () => void;
  /** Marcar apenas notificações de atendimentos (tickets) como lidas */
  markAllTicketAsRead: () => void;
  removeNotification: (id: number) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  internalNotifications: [],
  unreadCount: 0,

  setNotifications: (notifications) =>
    set((state) => {
      const ticketUnread = notifications.filter((n) => !n.read).length;
      const internalUnread = state.internalNotifications.filter((n) => !n.read).length;
      return {
        notifications,
        unreadCount: ticketUnread + internalUnread,
      };
    }),

  setInternalNotifications: (internalNotifications) =>
    set((state) => {
      const ticketUnread = state.notifications.filter((n) => !n.read).length;
      const internalUnread = internalNotifications.filter((n) => !n.read).length;
      return {
        internalNotifications,
        unreadCount: ticketUnread + internalUnread,
      };
    }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.read ? 0 : 1),
    })),

  addInternalNotification: (notification) =>
    set((state) => {
      if (state.internalNotifications.some((n) => n.id === notification.id)) return state;
      return {
        internalNotifications: [notification, ...state.internalNotifications],
        unreadCount: state.unreadCount + (notification.read ? 0 : 1),
      };
    }),

  markAsRead: (id) =>
    set((state) => {
      const inTickets = state.notifications.some((n) => n.id === id && !n.read);
      const inInternal = state.internalNotifications.some((n) => n.id === id && !n.read);
      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        internalNotifications: state.internalNotifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - (inTickets || inInternal ? 1 : 0)),
      };
    }),

  markInternalAsRead: (id) =>
    set((state) => {
      const n = state.internalNotifications.find((x) => x.id === id);
      if (!n || n.read) return state;
      return {
        internalNotifications: state.internalNotifications.map((x) =>
          x.id === id ? { ...x, read: true } : x
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      };
    }),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      internalNotifications: state.internalNotifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  markAllTicketAsRead: () =>
    set((state) => {
      const internalUnread = state.internalNotifications.filter((n) => !n.read).length;
      return {
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: internalUnread,
      };
    }),

  removeNotification: (id) =>
    set((state) => {
      const n = state.notifications.find((x) => x.id === id);
      return {
        notifications: state.notifications.filter((x) => x.id !== id),
        unreadCount: n && !n.read ? state.unreadCount - 1 : state.unreadCount,
      };
    }),

  clearAll: () => set({ notifications: [], internalNotifications: [], unreadCount: 0 }),
}));
