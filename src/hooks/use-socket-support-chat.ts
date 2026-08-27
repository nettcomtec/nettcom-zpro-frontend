"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getSocket, ensureConnectedFromStorage } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useSupportChatStore } from "@/stores/support-chat-store";
import { useBrandingStore } from "@/stores/branding-store";
import { fetchSupportUsers, type SupportMessage } from "@/services/support-chat";
import { getNotificationSoundUrl } from "@/lib/branding-urls";
import { safeJsonParse } from "@/lib/safe-json-parse";
import { playNotificationSound } from "@/lib/notification-audio";
import { toast } from "sonner";

export function useSocketSupportChat() {
  const t = useTranslations("supportChatAdmin");
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const {
    addMessage,
    incrementUnread,
    addAdminMessage,
    incrementUserUnread,
    updateUserUnread,
    setActiveConversation,
    setUserLastMessage,
  } = useSupportChatStore();
  const soundTimestamps = useBrandingStore((s) => s.soundTimestamps);
  const soundTimestampsRef = useRef(soundTimestamps);
  soundTimestampsRef.current = soundTimestamps;

  const tenantId = user?.tenantId;
  const userId = user?.userId;
  const isSuperadmin = user?.profile === "superadmin";

  const playIcqSound = useCallback(() => {
    const recording = safeJsonParse(localStorage.getItem("recording"), false);
    if (recording) return;
    // "Notificações sonoras" (/configuracoes/geral) vale para TODO alerta sonoro.
    // Semântica invertida legada: "enabled" = som LIGADO.
    // Fail-open: o superadmin opera fora do escopo de tenant e não carrega esse setting,
    // e tenants sem a linha no banco também não podem emudecer sozinhos — silencia
    // apenas quando o valor existe e está desligado.
    const soundPref = useAuthStore.getState().getConfigValue("notificationSilenced");
    if (soundPref != null && soundPref !== "enabled") return;
    playNotificationSound(getNotificationSoundUrl("support", soundTimestampsRef.current.support || undefined));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!isSuperadmin && (!tenantId || !userId)) return;

    ensureConnectedFromStorage();
    const socket = getSocket();

    // Tenant user side: per-user channel — only receives their own conversation
    const handleTenantMessage = (data: { action: string; data: SupportMessage }) => {
      if (data.action !== "create") return;
      addMessage(data.data);
      if (data.data.fromSuperadmin) {
        incrementUnread();
        playIcqSound();
      }
    };

    // Superadmin side: receives messages from any user
    const handleAdminMessage = (
      data: { action: string; data: SupportMessage & { tenantId: number; conversationUserId: number } }
    ) => {
      if (data.action !== "create") return;
      const { activeConversation } = useSupportChatStore.getState();
      const msgTenantId = Number(data.data.tenantId);
      const msgUserId = Number(
        data.data.conversationUserId ?? data.data.senderId
      );

      // Add to messages if currently viewing this conversation
      if (
        activeConversation &&
        Number(activeConversation.tenantId) === msgTenantId &&
        Number(activeConversation.userId) === msgUserId
      ) {
        addAdminMessage(data.data);
      }

      // Update last message preview
      setUserLastMessage(msgTenantId, msgUserId, data.data.text ?? null, data.data.mediaType ?? null, data.data.fromSuperadmin);

      // Always bump unread for that user unless we're viewing their conversation
      if (!data.data.fromSuperadmin) {
        playIcqSound();

        // Toast notification for superadmin
        const senderName = data.data.sender?.name || "";
        const msgText = data.data.text || t("toastNewMessage");
        const toastTitle = senderName ? `${senderName}: ${msgText}` : msgText;
        toast.info(toastTitle, {
          duration: 6000,
          action: {
            label: t("toastViewConversation"),
            onClick: () => {
              useSupportChatStore.getState().setActiveConversation({ tenantId: msgTenantId, userId: msgUserId });
              router.push("/suporte-chat");
            },
          },
        });

        const { supportUsers } = useSupportChatStore.getState();
        const isKnown = supportUsers.some(
          (u) => Number(u.tenantId) === msgTenantId && Number(u.userId) === msgUserId
        );

        if (!isKnown) {
          fetchSupportUsers()
            .then(({ data: d }) => useSupportChatStore.getState().setSupportUsers(d.users || []))
            .catch(() => {});
        } else if (
          !(
            activeConversation &&
            Number(activeConversation.tenantId) === msgTenantId &&
            Number(activeConversation.userId) === msgUserId
          )
        ) {
          incrementUserUnread(msgTenantId, msgUserId);
        }
      }
    };

    const handleAdminRead = (payload: {
      action: string;
      data: { tenantId: number; userId: number };
    }) => {
      if (payload.action !== "read" || !payload.data) return;
      updateUserUnread(Number(payload.data.tenantId), Number(payload.data.userId), 0);
    };

    if (!isSuperadmin && tenantId != null && userId != null) {
      socket.on(`${tenantId}:${userId}:support-chat-message`, handleTenantMessage);
    }

    if (isSuperadmin) {
      socket.on("superadmin:support-chat-message", handleAdminMessage);
      socket.on("superadmin:support-chat-read", handleAdminRead);
    }

    return () => {
      if (!isSuperadmin && tenantId != null && userId != null) {
        socket.off(`${tenantId}:${userId}:support-chat-message`, handleTenantMessage);
      }
      if (isSuperadmin) {
        socket.off("superadmin:support-chat-message", handleAdminMessage);
        socket.off("superadmin:support-chat-read", handleAdminRead);
      }
    };
  }, [
    isAuthenticated,
    tenantId,
    userId,
    isSuperadmin,
    addMessage,
    incrementUnread,
    addAdminMessage,
    incrementUserUnread,
    updateUserUnread,
    setActiveConversation,
    setUserLastMessage,
    playIcqSound,
    router,
    t,
  ]);
}
