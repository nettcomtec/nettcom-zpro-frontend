"use client";

import { create } from "zustand";
import type { SupportMessage, SupportUser } from "@/services/support-chat";

export interface ActiveConversation {
  tenantId: number;
  userId: number;
}

interface SupportChatState {
  // Tenant user side
  messages: SupportMessage[];
  unreadCount: number;
  // Superadmin side
  supportUsers: SupportUser[];
  activeConversation: ActiveConversation | null;
  adminMessages: SupportMessage[];
  adminTotalUnread: number;

  setMessages: (messages: SupportMessage[]) => void;
  addMessage: (message: SupportMessage) => void;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;

  setSupportUsers: (users: SupportUser[]) => void;
  updateUserUnread: (tenantId: number, userId: number, count: number) => void;
  incrementUserUnread: (tenantId: number, userId: number) => void;
  setUserLastMessage: (tenantId: number, userId: number, text: string | null, mediaType: string | null, fromSuperadmin: boolean) => void;
  setActiveConversation: (conv: ActiveConversation | null) => void;
  setAdminMessages: (messages: SupportMessage[]) => void;
  addAdminMessage: (message: SupportMessage) => void;

  reset: () => void;
}

function calcAdminTotal(users: SupportUser[]): number {
  return users.reduce((sum, u) => sum + u.unreadCount, 0);
}

export const useSupportChatStore = create<SupportChatState>((set, get) => ({
  messages: [],
  unreadCount: 0,
  supportUsers: [],
  activeConversation: null,
  adminMessages: [],
  adminTotalUnread: 0,

  setMessages: (messages) => set({ messages }),

  addMessage: (message) => {
    const existing = get().messages.find((m) => m.id === message.id);
    if (existing) return;
    set((state) => ({ messages: [...state.messages, message] }));
  },

  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),

  setSupportUsers: (users) => set({ supportUsers: users, adminTotalUnread: calcAdminTotal(users) }),

  updateUserUnread: (tenantId, userId, count) =>
    set((state) => {
      const updated = state.supportUsers.map((u) =>
        u.tenantId === tenantId && u.userId === userId ? { ...u, unreadCount: count } : u
      );
      return { supportUsers: updated, adminTotalUnread: calcAdminTotal(updated) };
    }),

  incrementUserUnread: (tenantId, userId) =>
    set((state) => {
      const exists = state.supportUsers.some((u) => u.tenantId === tenantId && u.userId === userId);
      const updated = exists
        ? state.supportUsers.map((u) =>
            u.tenantId === tenantId && u.userId === userId
              ? { ...u, unreadCount: u.unreadCount + 1 }
              : u
          )
        : state.supportUsers; // new user will appear on next reload
      return { supportUsers: updated, adminTotalUnread: calcAdminTotal(updated) };
    }),

  setUserLastMessage: (tenantId, userId, text, mediaType, fromSuperadmin) =>
    set((state) => {
      const updated = state.supportUsers.map((u) =>
        u.tenantId === tenantId && u.userId === userId
          ? { ...u, lastMessageText: text, lastMessageMediaType: mediaType, lastMessageFromSuperadmin: fromSuperadmin, lastMessageAt: new Date().toISOString() }
          : u
      );
      return { supportUsers: updated };
    }),

  setActiveConversation: (conv) => set({ activeConversation: conv }),

  setAdminMessages: (messages) => set({ adminMessages: messages }),

  addAdminMessage: (message) => {
    const existing = get().adminMessages.find((m) => m.id === message.id);
    if (existing) return;
    set((state) => ({ adminMessages: [...state.adminMessages, message] }));
  },

  reset: () =>
    set({
      messages: [],
      unreadCount: 0,
      supportUsers: [],
      activeConversation: null,
      adminMessages: [],
      adminTotalUnread: 0,
    }),
}));
