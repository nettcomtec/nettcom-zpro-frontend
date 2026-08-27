"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import type { InternalNotification } from "@/services/internal-notifications";

interface NotificationSocketPayload {
  action: string;
  data: {
    id: number;
    message: string;
    userId: number;
    receiverId?: number;
    isRead: boolean;
    source?: string | null;
    createdAt: string;
    updatedAt?: string;
    /** Presente apenas em mensagens reais de chat privado — ignoradas aqui */
    senderId?: number;
  };
}

interface UseNotificationSocketOptions {
  onNotification?: (notification: InternalNotification) => void;
}

export function useNotificationSocket({ onNotification }: UseNotificationSocketOptions = {}) {
  const { user, isAuthenticated } = useAuthStore();
  const tenantId = user?.tenantId;
  const userId = user?.userId;
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  useEffect(() => {
    if (!isAuthenticated || !tenantId || !userId) return;

    const socket = getSocket();
    if (!socket) return;

    const event = `${tenantId}:msg-private-msg-notificacao`;

    const handler = (payload: NotificationSocketPayload) => {
      if (payload.action !== "update") return;
      const d = payload.data;
      // Mensagens reais de chat privado (com senderId) são tratadas pelo use-socket-chat
      if (d.senderId != null) return;
      // Filtrar apenas notificações destinadas ao usuário atual
      if (d.userId !== userId && d.receiverId !== userId) return;

      const notification: InternalNotification = {
        id: d.id,
        message: d.message,
        userId: d.userId,
        receiverId: d.receiverId,
        isRead: d.isRead,
        source: d.source ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };

      onNotificationRef.current?.(notification);
    };

    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
    };
  }, [isAuthenticated, tenantId, userId]);
}
