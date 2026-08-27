"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useBrandingStore } from "@/stores/branding-store";
import { fetchAllUsers } from "@/services/users";
import { fetchPrivateGroups } from "@/services/private-chat";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { getNotificationSoundUrl } from "@/lib/branding-urls";
import { safeJsonParse } from "@/lib/safe-json-parse";
import { playNotificationSound } from "@/lib/notification-audio";

export function useSocketChat() {
  const t = useTranslations("useSocketChat");
  const { user, isAuthenticated } = useAuthStore();
  const { addMessage, setUnreadCount, setUsers, setGroups, addMentionGroup, incrementSocketUnread, incrementUnreadCount } = useChatStore();
  const soundTimestamps = useBrandingStore((s) => s.soundTimestamps);
  const soundTimestampsRef = useRef(soundTimestamps);
  soundTimestampsRef.current = soundTimestamps;
  const tenantId = user?.tenantId;
  const userId = user?.userId;
  const initialized = useRef(false);

  const playInternalChatSound = useCallback(() => {
    const recording = safeJsonParse(localStorage.getItem("recording"), false);
    if (recording) return;
    // "Notificações sonoras" (/configuracoes/geral) vale para TODO alerta sonoro, não só
    // o de ticket. Semântica invertida legada: "enabled" = som LIGADO.
    // Fail-open (diferente dos hooks de ticket, que exigem "enabled"): aqui o som nunca
    // dependeu do setting, então chave ausente do store precisa continuar tocando —
    // silenciar só quando o admin desligou de fato.
    const soundPref = useAuthStore.getState().getConfigValue("notificationSilenced");
    if (soundPref != null && soundPref !== "enabled") return;
    playNotificationSound(getNotificationSoundUrl("chat", soundTimestampsRef.current.chat || undefined));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !tenantId || user?.profile === 'superadmin' || initialized.current) return;

    const socket = getSocket();
    initialized.current = true;

    // Pré-carrega grupos para que notificações de menção possam exibir o nome do grupo
    // mesmo antes do usuário abrir /chat-privado
    if (userId) {
      fetchPrivateGroups(userId)
        .then((res) => {
          const list = Array.isArray(res.data) ? res.data : (res.data as { groups?: import("@/stores/chat-store").ChatGroup[] })?.groups || [];
          setGroups(list);
        })
        .catch(() => { /* silenciar */ });
    }

    const handlePrivateMessage = (data: { action: string; data: { receiverId?: number; groupId?: number | null; memberIds?: number[]; senderId: number; text?: string; id?: number; timestamp?: number; mediaType?: string; mediaUrl?: string; mediaName?: string; sender?: { id: number; name: string }; quotedMsgId?: number | null; quotedMsg?: import("@/stores/chat-store").PrivateMessage | null } }) => {
      // Gate de membership: em mensagem de grupo, só processa se o usuário for membro.
      // Se memberIds não vier (backend antigo), mantém o comportamento anterior por compat.
      const isGroupMsg = data.data.groupId != null;
      const isGroupMemberOk = !Array.isArray(data.data.memberIds) || data.data.memberIds.includes(userId as number);
      const targetsMe = isGroupMsg ? isGroupMemberOk : data.data.receiverId === userId;
      if (!(targetsMe && data.action === "update")) return;

      // Só adiciona à lista de mensagens se pertencer à conversa aberta
      const active = useChatStore.getState().activeConversation;
      const isGroup = data.data.groupId != null;
      const belongsToActive = active
        ? isGroup
          ? active.isGroup && active.id === data.data.groupId
          : !active.isGroup && (data.data.senderId === active.id || data.data.receiverId === active.id)
        : false;

      if (belongsToActive) {
        addMessage({
          id: data.data.id || Date.now(),
          text: data.data.text || "",
          senderId: data.data.senderId,
          receiverId: data.data.receiverId,
          groupId: data.data.groupId ?? undefined,
          read: false,
          timestamp: data.data.timestamp || Date.now(),
          mediaType: data.data.mediaType,
          mediaUrl: data.data.mediaUrl,
          mediaName: data.data.mediaName,
          sender: data.data.sender,
          quotedMsgId: data.data.quotedMsgId ?? null,
          quotedMsg: data.data.quotedMsg ?? null,
        });
      }

      if (data.data.senderId !== userId) {
        playInternalChatSound();

        // Increment real-time unread counter for the sender (or group)
        const isGroup = data.data.groupId != null;
        if (!belongsToActive) {
          incrementSocketUnread(isGroup ? data.data.groupId! : data.data.senderId);
          // Incrementa também o total agregado em tempo real, espelhando o badge do
          // sino/aba. O backend conta MENSAGENS não lidas (+1 por mensagem); o REST
          // (mount / ao abrir o sino) reconcilia eventuais discrepâncias.
          incrementUnreadCount();
        }

        // Update sidebar last-message preview for the sender
        const store = useChatStore.getState();
        const msgText = data.data.text || (data.data.mediaType ? "📎" : "");
        const msgTs = data.data.timestamp || Date.now();
        if (!isGroup) {
          store.setUsers(
            (store.users as import("@/stores/chat-store").ChatUser[]).map((u) =>
              u.id === data.data.senderId
                ? { ...u, text: msgText, timestamp: msgTs, senderId: data.data.senderId }
                : u
            )
          );
        }
      }

      // Detectar menção ao usuário atual em mensagem de grupo
      if (isGroup && data.data.senderId !== userId) {
        const userName = user?.username || "";
        const text = data.data.text || "";
        if (userName && text.includes(`@${userName}`)) {
          if (!belongsToActive) {
            addMentionGroup(data.data.groupId!);
          }
          const groupName = useChatStore.getState().groups.find((g) => g.id === data.data.groupId)?.name;
          const title = groupName ? `${t("privateChatLabel")} · ${groupName}` : t("privateChatLabel");
          setTimeout(() => {
            toast.info(title, {
              description: `📢 ${data.data.sender?.name || t("defaultSender")} ${t("mentionedYou")}`,
              duration: 5000,
            });
          }, 800);
        }
      }
    };

    const handleUnreadPrivate = (data: { action: string; data: { senderId: number } }) => {
      if (data.data.senderId === userId && data.action === "update") {
        const currentCount = useChatStore.getState().unreadCount;
        setUnreadCount(Math.max(0, currentCount - 1));
      }
    };

    const handlePrivateNotification = (data: { action: string; data: { receiverId?: number; groupId?: number | null; memberIds?: number[]; senderId?: number; text?: string; sender?: { name?: string } } }) => {
      // O evento msg-private-msg-notificacao é compartilhado com as notificações do
      // sininho (manual/funil/chatbot), que não têm senderId. Só mensagem real de
      // chat privado (PrivateMessageController) deve tocar som/toast aqui.
      if (data.data.senderId == null) return;
      // Gate de membership: em grupo, só notifica membros. Nunca notifica o próprio remetente.
      const isGroupMsg = data.data.groupId != null;
      const isGroupMemberOk = !Array.isArray(data.data.memberIds) || data.data.memberIds.includes(userId as number);
      const isFromMe = data.data.senderId === userId;
      const targetsMe = (isGroupMsg ? isGroupMemberOk : data.data.receiverId === userId) && !isFromMe;
      if (targetsMe && data.action === "update") {
        playInternalChatSound();
        toast.info(t("privateChatLabel"), {
          description: `${data.data.sender?.name || t("defaultSender")}: ${data.data.text || t("newMessage")}`,
        });
      }
    };

    const handleVerifyOnline = () => {
      socket.emit(`${tenantId}:userVerified`, user);
    };

    const handleUserOnline = (data: { action: string; data: { userId: number; status?: string } }) => {
      if (data.action === "update" && data.data.userId !== userId) {
        // update user online status in chat store
      }
    };

    const handleUpdateStatusUser = async () => {
      try {
        const { data } = await fetchAllUsers();
        const users = data?.users || [];
        setUsers(users.filter((u: { profile?: string }) => u.profile !== "superadmin").map((u: { id: number; name: string; status?: string }) => ({
          id: u.id,
          name: u.name,
          status: u.status,
        })));
      } catch {
        // silenciar
      }
    };

    // Vue: MainLayout.vue:1690 — SET_USERS_APP atualiza lista de usuários online no chat
    const handleUpdateOnlineBubbles = (data: { id: number; name: string; status?: string }[]) => {
      if (!Array.isArray(data)) return;
      setUsers(data.filter((u) => u.id).map((u) => ({ id: u.id, name: u.name, status: u.status })));
    };

    socket.on(`${tenantId}:msg-private-msg`, handlePrivateMessage);
    socket.on(`${tenantId}:unread-msg-private-msg`, handleUnreadPrivate);
    socket.on(`${tenantId}:msg-private-msg-notificacao`, handlePrivateNotification);
    socket.on("verifyOnlineUsers", handleVerifyOnline);
    socket.on(`${tenantId}:user-online`, handleUserOnline);
    socket.on(`${tenantId}:updateStatusUser`, handleUpdateStatusUser);
    socket.on(`${tenantId}:chat:updateOnlineBubbles`, handleUpdateOnlineBubbles);

    return () => {
      socket.off(`${tenantId}:msg-private-msg`, handlePrivateMessage);
      socket.off(`${tenantId}:unread-msg-private-msg`, handleUnreadPrivate);
      socket.off(`${tenantId}:msg-private-msg-notificacao`, handlePrivateNotification);
      socket.off("verifyOnlineUsers", handleVerifyOnline);
      socket.off(`${tenantId}:user-online`, handleUserOnline);
      socket.off(`${tenantId}:updateStatusUser`, handleUpdateStatusUser);
      socket.off(`${tenantId}:chat:updateOnlineBubbles`, handleUpdateOnlineBubbles);
      initialized.current = false;
    };
  }, [isAuthenticated, tenantId, userId, user, addMessage, setUnreadCount, setUsers, setGroups, addMentionGroup, incrementSocketUnread, incrementUnreadCount]);
}
