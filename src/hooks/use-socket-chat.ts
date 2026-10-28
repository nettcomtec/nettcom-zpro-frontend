"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useBrandingStore } from "@/stores/branding-store";
import { fetchAllUsers } from "@/services/users";
import { fetchPrivateGroups, markAsRead, fetchChatUnreadTotal, fetchChatUnreadTotalStrict } from "@/services/private-chat";
import { usePageAccess } from "@/hooks/use-page-access";
import { INTERNAL_CHAT_PATH, internalChatHref, isInternalChatPath } from "@/lib/internal-chat-link";
import { internalChatMessagePreview } from "@/components/layout/internal-chat-unread-list";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { getNotificationSoundUrl } from "@/lib/branding-urls";
import { safeJsonParse } from "@/lib/safe-json-parse";
import { playNotificationSound } from "@/lib/notification-audio";

/** Conversa no aviso fixo agrupado (chave `u:<remetente>` ou `g:<equipe>`). */
type FixedItem = {
  type: "private" | "group";
  peerId: number;
  kind: "dm" | "mention";
  /** Nome da conversa: o colega (direta) ou a equipe (menção). */
  name: string;
  senderName: string;
  text: string;
  /** Mensagem mostrada: exclusão tira o item, edição troca o texto. */
  lastMessageId: number | null;
  at: number;
};

const FIXED_TOAST_ID_PREFIX = "internal-chat-fixed-";
const RECONCILE_MIN_INTERVAL_MS = 30000;
// Reconexão depois de reinício do backend: todos os clientes voltam juntos; espalha a conferência.
const RECONNECT_RECONCILE_JITTER_MS = 20000;
// Aba oculta por mais que isto (celular congela a página em segundo plano): confere ao voltar.
const HIDDEN_RECONCILE_AFTER_MS = 5 * 60 * 1000;
// Equipe criada depois da pré-carga: recarrega a lista de equipes no máximo uma vez neste prazo.
const GROUPS_RELOAD_MIN_INTERVAL_MS = 5 * 60 * 1000;
// O aviso fixo não some sozinho: mensagem longa não pode cobrir a tela do celular.
const FIXED_TEXT_MAX_CHARS = 160;

function clampFixedText(text: string): string {
  const chars = Array.from(text);
  return chars.length > FIXED_TEXT_MAX_CHARS ? `${chars.slice(0, FIXED_TEXT_MAX_CHARS).join("").trimEnd()}…` : text;
}

export function useSocketChat() {
  const t = useTranslations("useSocketChat");
  const tRef = useRef(t);
  tRef.current = t;
  const tMedia = useTranslations("atendimentoChatExtra");
  const tMediaRef = useRef(tMedia);
  tMediaRef.current = tMedia;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const { user, isAuthenticated } = useAuthStore();
  // Mesmo gate da página /chat-privado. Os handlers leem pela ref: o effect do socket não é
  // refeito quando o acesso muda.
  const canAccessChat = usePageAccess("chat-privado");
  const canAccessRef = useRef(canAccessChat);
  canAccessRef.current = canAccessChat;
  // Só as ações (estáveis), sem assinar o store: `useChatStore()` sem seletor re-renderizava o
  // layout do painel inteiro a cada mudança do chat (este hook é montado lá).
  const { addMessage, setUnreadCount, setUsers, setGroups, addMentionGroup, incrementSocketUnread, incrementUnreadCount } = useChatStore.getState();
  const soundTimestamps = useBrandingStore((s) => s.soundTimestamps);
  const soundTimestampsRef = useRef(soundTimestamps);
  soundTimestampsRef.current = soundTimestamps;
  const tenantId = user?.tenantId;
  const userId = user?.userId;
  const initialized = useRef(false);
  // Fora do effect: ele é refeito a cada renovação do usuário (30 s), e a leitura pendente
  // de aba em segundo plano não pode se perder nessa troca.
  const pendingAutoReadRef = useRef(new Map<string, { id: number; isGroup: boolean; seen: boolean }>());
  const reconcilePendingRef = useRef(false);
  const groupsPreloadedForRef = useRef<number | null>(null);
  const groupsReloadAtRef = useRef(0);
  // Queda do socket desde a última conferência e quando a aba ficou oculta.
  const socketDroppedRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);
  // Começa na montagem: o header já semeia o total no boot.
  const lastReconcileAtRef = useRef(Date.now());
  const reconcileTrailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Socket cuja 1ª conexão já passou: ela é o boot (o header já semeia); as seguintes são
  // reconexão.
  const connectedSocketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  // ── Aviso fixo agrupado (mensagem direta e menção, fora da página do Chat Privado) ──
  // Um aviso só para todas as conversas. O id muda a cada dispensa porque o sonner 1.7.4
  // cria por setTimeout e dispensa na hora: recriar o MESMO id logo depois de dispensado
  // se perde (a mescla mantém o `delete`).
  const fixedItemsRef = useRef(new Map<string, FixedItem>());
  const fixedGenRef = useRef(0);
  // Conta inclusões: a conferência com o servidor só limpa o aviso se nada chegou durante ela.
  const fixedUpsertSeqRef = useRef(0);

  const renderFixedToast = useCallback(() => {
    const tr = tRef.current;
    const gen = fixedGenRef.current;
    const id = `${FIXED_TOAST_ID_PREFIX}${gen}`;
    if (fixedItemsRef.current.size === 0) {
      // Sempre com id: `toast.dismiss()` sem id derrubaria os outros avisos fixos da tela.
      // Na fila (setTimeout 0): a criação do sonner também entra por setTimeout, e a dispensa
      // que chega antes dela se perderia (aviso "fantasma", sem item, que o X não tira).
      setTimeout(() => toast.dismiss(id), 0);
      fixedGenRef.current = gen + 1;
      return;
    }
    const items = Array.from(fixedItemsRef.current.values()).sort((a, b) => b.at - a.at);
    const latest = items[0];
    let title: string;
    if (items.length === 1) {
      title = latest.kind === "mention"
        ? tr("fixedTitleMention", { group: latest.name })
        : tr("fixedTitleOne", { name: latest.name });
    } else if (items.length === 2) {
      title = tr("fixedTitleTwo", { first: items[0].name, second: items[1].name });
    } else {
      title = tr("fixedTitleMany", { first: items[0].name, second: items[1].name, count: items.length - 2 });
    }
    const description = latest.kind === "mention"
      ? `${latest.senderName} ${tr("mentionedYou")}`
      : `${latest.senderName}: ${latest.text ? clampFixedText(latest.text) : tr("newMessage")}`;
    const href = items.length === 1
      ? internalChatHref({ type: latest.type, peerId: latest.peerId })
      : INTERNAL_CHAT_PATH;
    // O sonner fecha o aviso sozinho no X e na ação; aqui só se esquece o que ele mostrava,
    // e o próximo aviso nasce só com as mensagens novas. A ação NÃO chama `onDismiss` no 1.7.4.
    const forget = () => {
      if (fixedGenRef.current !== gen) return;
      fixedItemsRef.current.clear();
      fixedGenRef.current = gen + 1;
    };
    toast.info(title, {
      id,
      description,
      duration: Infinity,
      action: {
        label: items.length === 1 ? tr("openConversation") : tr("openChat"),
        onClick: () => {
          forget();
          routerRef.current.push(href);
        },
      },
      onDismiss: forget,
    });
  }, []);

  const upsertFixedItem = useCallback((key: string, item: FixedItem) => {
    fixedItemsRef.current.set(key, item);
    fixedUpsertSeqRef.current += 1;
    renderFixedToast();
  }, [renderFixedToast]);

  const removeFixedItem = useCallback((key: string) => {
    if (!fixedItemsRef.current.delete(key)) return;
    renderFixedToast();
  }, [renderFixedToast]);

  const clearFixedItems = useCallback(() => {
    if (fixedItemsRef.current.size === 0) return;
    fixedItemsRef.current.clear();
    renderFixedToast();
  }, [renderFixedToast]);

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
    // mesmo antes do usuário abrir /chat-privado (também no aviso rápido de quem não tem
    // acesso). Uma vez por usuário: este effect é refeito a cada renovação do usuário (30 s)
    // e a consulta tem uma subconsulta por equipe.
    if (userId && groupsPreloadedForRef.current !== userId) {
      const preloadFor = userId;
      groupsPreloadedForRef.current = preloadFor;
      fetchPrivateGroups(preloadFor)
        .then((res) => {
          if (groupsPreloadedForRef.current !== preloadFor) return;
          const list = Array.isArray(res.data) ? res.data : (res.data as { groups?: import("@/stores/chat-store").ChatGroup[] })?.groups || [];
          setGroups(list);
        })
        // Falhou: tenta de novo na próxima renovação.
        .catch(() => { if (groupsPreloadedForRef.current === preloadFor) groupsPreloadedForRef.current = null; });
    }

    // Resposta atrasada não regrava o total de quem perdeu o acesso ou saiu.
    const chatCountAllowed = () => canAccessRef.current && useAuthStore.getState().isAuthenticated;

    // Total do servidor + se veio inteiro: a versão comum conta como 0 a parte de equipes que
    // falhou, e "0" não pode apagar o aviso de uma menção que segue não lida.
    const fetchTotalForReconcile = () =>
      fetchChatUnreadTotalStrict()
        .then((total) => ({ total, complete: true }))
        .catch(() => fetchChatUnreadTotal().then((total) => ({ total, complete: false })));
    // Total do servidor no contador; nada não lido de verdade tira o aviso fixo (conversa já
    // lida em outro lugar). Mensagem que chegou durante a consulta pode ter ficado fora do
    // total: nesse caso o aviso fica.
    const applyServerTotal = (upsertSeq: number) =>
      fetchTotalForReconcile()
        .then(({ total, complete }) => {
          if (!chatCountAllowed()) return;
          setUnreadCount(total);
          if (complete && total === 0 && fixedUpsertSeqRef.current === upsertSeq) clearFixedItems();
          if (complete) socketDroppedRef.current = false;
        })
        .catch(() => { /* silenciar */ });

    // ── Leitura em tempo real ──
    // Leitura feita em outra aba/aparelho: o total vem do servidor, porque esta aba não sabe
    // quantas mensagens daquela conversa ela tinha contado.
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleUnreadReconcile = () => {
      // Sem acesso ao Chat Privado não há contador do chat.
      if (!canAccessRef.current) return;
      if (reconcileTimer) clearTimeout(reconcileTimer);
      reconcilePendingRef.current = true;
      const upsertSeq = fixedUpsertSeqRef.current;
      reconcileTimer = setTimeout(() => {
        reconcileTimer = null;
        reconcilePendingRef.current = false;
        applyServerTotal(upsertSeq);
      }, 500);
    };

    // Conferência com o servidor na reconexão do socket e na volta da aba: o PWA e o app
    // perdem o socket em segundo plano, e a mensagem (ou a leitura em outro aparelho) desse
    // intervalo não chega por evento. No máximo uma a cada 30 s; pedido dentro da janela
    // fica para o fim dela (a reconexão costuma vir logo depois da volta da aba e traz
    // justamente o que chegou com o socket fora). `minDelayMs` espalha a conferência da
    // reconexão (reinício do backend reconecta todo mundo junto).
    const runReconcileFromServer = () => {
      if (!canAccessRef.current) return;
      lastReconcileAtRef.current = Date.now();
      applyServerTotal(fixedUpsertSeqRef.current);
    };
    const reconcileFromServer = (minDelayMs = 0) => {
      if (!canAccessRef.current || reconcileTrailingRef.current) return;
      const wait = Math.max(lastReconcileAtRef.current + RECONCILE_MIN_INTERVAL_MS - Date.now(), minDelayMs);
      if (wait <= 0) { runReconcileFromServer(); return; }
      reconcileTrailingRef.current = setTimeout(() => {
        reconcileTrailingRef.current = null;
        runReconcileFromServer();
      }, wait);
    };

    // Mensagem que chega com a conversa aberta é marcada como lida para o remetente ver ✓✓
    // na hora, mas só com a aba visível. Chegou com a aba em segundo plano: fica pendente e
    // é marcada quando a aba volta, se a conversa ainda estiver aberta.
    const pendingAutoRead = pendingAutoReadRef.current;
    let autoReadTimer: ReturnType<typeof setTimeout> | null = null;
    const isTabVisible = () => document.visibilityState === "visible";
    const flushAutoRead = () => {
      if (autoReadTimer) { clearTimeout(autoReadTimer); autoReadTimer = null; }
      if (!isTabVisible() || pendingAutoRead.size === 0) return;
      const active = useChatStore.getState().activeConversation;
      let dropped = false;
      pendingAutoRead.forEach((conv) => {
        const stillOpen = !!active && active.id === conv.id && active.isGroup === conv.isGroup;
        if (conv.seen || stillOpen) markAsRead(conv.id, conv.isGroup).catch(() => { /* silenciar */ });
        else dropped = true;
      });
      pendingAutoRead.clear();
      // Saiu da conversa sem ver a mensagem: ela segue não lida e entra no total.
      if (dropped) scheduleUnreadReconcile();
    };
    const scheduleAutoRead = (id: number, isGroup: boolean) => {
      const key = `${isGroup ? "g" : "u"}:${id}`;
      const visible = isTabVisible();
      pendingAutoRead.set(key, { id, isGroup, seen: visible || !!pendingAutoRead.get(key)?.seen });
      if (visible && !autoReadTimer) autoReadTimer = setTimeout(flushAutoRead, 400);
    };
    // Conversa aberta com a aba visível: o item dela no aviso fixo já não serve.
    const dismissActiveConversationItem = () => {
      const active = useChatStore.getState().activeConversation;
      if (active) removeFixedItem(`${active.isGroup ? "g" : "u"}:${active.id}`);
    };
    // Ao voltar, espera um pouco antes de marcar: tocar numa notificação de OUTRA conversa
    // deixa a aba visível antes de a tela trocar, e a pendente da conversa anterior seria
    // marcada sem ter sido vista (o flush confere de novo a conversa aberta).
    const handleVisibilityChange = () => {
      if (!isTabVisible()) {
        if (hiddenAtRef.current == null) hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAtRef.current != null ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      dismissActiveConversationItem();
      // Só confere quando pode ter perdido algo: o socket caiu ou a aba ficou muito tempo
      // oculta (o celular congela a página). Alternar abas não custa consulta.
      if (socketDroppedRef.current || hiddenFor > HIDDEN_RECONCILE_AFTER_MS) reconcileFromServer();
      if (pendingAutoRead.size === 0) return;
      if (autoReadTimer) clearTimeout(autoReadTimer);
      autoReadTimer = setTimeout(flushAutoRead, 1000);
    };
    // Herdado da montagem anterior do effect.
    if (pendingAutoRead.size > 0 && isTabVisible()) autoReadTimer = setTimeout(flushAutoRead, 400);
    if (reconcilePendingRef.current) scheduleUnreadReconcile();

    // Abrir a conversa por qualquer caminho (lista da página, link, aviso) com a aba visível
    // tira o item dela do aviso fixo. zustand 5 com `create` puro: sem seletor no subscribe.
    const unsubscribeChatStore = useChatStore.subscribe((state, prev) => {
      if (state.activeConversation === prev.activeConversation) return;
      if (!state.activeConversation || !isTabVisible()) return;
      dismissActiveConversationItem();
    });

    // `@nome` só conta com fim de palavra depois dele: "@Anabela" não menciona "Ana".
    // Resíduo aceito: "@Ana Paula" ainda menciona "Ana" (o hook não tem a lista de membros).
    const mentionsMe = (text: string | undefined) => {
      const userName = user?.username || "";
      if (!userName || !text) return false;
      const needle = `@${userName}`;
      for (let idx = text.indexOf(needle); idx !== -1; idx = text.indexOf(needle, idx + 1)) {
        const nextCode = text.codePointAt(idx + needle.length);
        if (nextCode == null || !/[\p{L}\p{N}]/u.test(String.fromCodePoint(nextCode))) return true;
      }
      return false;
    };

    // Avisos rápidos (os de antes): mensagem comum e menção dentro do Chat Privado, e tudo
    // para quem não tem acesso a ele.
    // Texto da mensagem para o aviso: mídia vira o rótulo traduzido (o `text` dela é o nome
    // do arquivo, ex.: "audio-1729….webm").
    const messagePreview = (text: string | undefined, mediaType: string | undefined) =>
      internalChatMessagePreview(text, mediaType, (key) => tMediaRef.current(key));
    const showQuickToast = (senderName: string, text: string) => {
      toast.info(t("privateChatLabel"), {
        description: `${senderName}: ${text || t("newMessage")}`,
      });
    };
    // Equipe que não está na pré-carga (criada ou com o usuário incluído depois do login):
    // recarrega a lista, no máximo uma vez a cada 5 min. O aviso da vez sai sem o nome.
    const findGroupName = (groupId: number) => {
      const name = useChatStore.getState().groups.find((g) => Number(g.id) === groupId)?.name;
      if (!name && userId && Date.now() - groupsReloadAtRef.current > GROUPS_RELOAD_MIN_INTERVAL_MS) {
        groupsReloadAtRef.current = Date.now();
        fetchPrivateGroups(userId)
          .then((res) => {
            const list = Array.isArray(res.data) ? res.data : (res.data as { groups?: import("@/stores/chat-store").ChatGroup[] })?.groups || [];
            if (useAuthStore.getState().isAuthenticated) setGroups(list);
          })
          .catch(() => { /* silenciar */ });
      }
      return name;
    };
    const showMentionQuickToast = (groupId: number, senderName: string) => {
      const groupName = findGroupName(groupId);
      const title = groupName ? `${t("privateChatLabel")} · ${groupName}` : t("privateChatLabel");
      toast.info(title, {
        description: `${senderName} ${t("mentionedYou")}`,
        duration: 5000,
      });
    };

    // Todo som e aviso do chat saem daqui (o `receiverId` deste evento vem do banco).
    const handlePrivateMessage = (data: { action: string; data: { receiverId?: number; groupId?: number | null; memberIds?: number[]; senderId: number; text?: string; id?: number; timestamp?: number; createdAt?: string; mediaType?: string; mediaUrl?: string; mediaName?: string; sender?: { id: number; name: string }; quotedMsgId?: number | null; quotedMsg?: import("@/stores/chat-store").PrivateMessage | null } }) => {
      // Gate de membership: em mensagem de grupo, só processa se o usuário for membro.
      // Se memberIds não vier (backend antigo), mantém o comportamento anterior por compat.
      const isGroupMsg = data.data.groupId != null;
      const isGroupMemberOk = !Array.isArray(data.data.memberIds) || data.data.memberIds.includes(userId as number);
      const targetsMe = isGroupMsg ? isGroupMemberOk : data.data.receiverId === userId;
      if (!(targetsMe && data.action === "update")) return;

      const isGroup = data.data.groupId != null;
      const fromOther = data.data.senderId !== userId;
      const senderName = data.data.sender?.name || t("defaultSender");
      const mentioned = isGroup && fromOther && mentionsMe(data.data.text);
      const preview = messagePreview(data.data.text, data.data.mediaType);

      // Sem acesso ao Chat Privado: só o som e o aviso rápido de antes. Sem contador, sem
      // mexer na conversa e nunca o aviso fixo.
      if (!canAccessRef.current) {
        if (!fromOther) return;
        playInternalChatSound();
        if (mentioned) showMentionQuickToast(Number(data.data.groupId), senderName);
        else showQuickToast(senderName, preview);
        return;
      }

      // Só adiciona à lista de mensagens se pertencer à conversa aberta
      const active = useChatStore.getState().activeConversation;
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
          createdAt: data.data.createdAt,
          mediaType: data.data.mediaType,
          mediaUrl: data.data.mediaUrl,
          mediaName: data.data.mediaName,
          sender: data.data.sender,
          quotedMsgId: data.data.quotedMsgId ?? null,
          quotedMsg: data.data.quotedMsg ?? null,
        });
        if (fromOther) {
          scheduleAutoRead(isGroup ? data.data.groupId! : data.data.senderId, isGroup);
        }
      }

      if (!fromOther) return;
      playInternalChatSound();

      // Increment real-time unread counter for the sender (or group)
      if (!belongsToActive) {
        incrementSocketUnread(isGroup ? data.data.groupId! : data.data.senderId, isGroup);
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

      // Menção ao usuário atual em mensagem de grupo
      if (mentioned && !belongsToActive) addMentionGroup(data.data.groupId!);

      // ── Aviso ──
      // Conversa na tela com a aba visível: nenhum.
      if (belongsToActive && isTabVisible()) return;
      // Equipe sem menção: aviso rápido, em qualquer tela.
      if (isGroup && !mentioned) { showQuickToast(senderName, preview); return; }
      // Dentro do Chat Privado o aviso é o rápido; o fixo é para quem está em outra tela.
      // Menção sem o atraso de antes: ela não espera mais o aviso do outro evento.
      if (isInternalChatPath(pathnameRef.current)) {
        if (mentioned) showMentionQuickToast(Number(data.data.groupId), senderName);
        else showQuickToast(senderName, preview);
        return;
      }
      const lastMessageId = Number(data.data.id) || null;
      if (isGroup) {
        const groupId = Number(data.data.groupId);
        upsertFixedItem(`g:${groupId}`, {
          type: "group",
          peerId: groupId,
          kind: "mention",
          name: findGroupName(groupId) || t("privateChatLabel"),
          senderName,
          text: preview,
          lastMessageId,
          at: Date.now(),
        });
        return;
      }
      const senderId = Number(data.data.senderId);
      upsertFixedItem(`u:${senderId}`, {
        type: "private",
        peerId: senderId,
        kind: "dm",
        name: senderName,
        senderName,
        text: preview,
        lastMessageId,
        at: Date.now(),
      });
    };

    // Leitura: `readerId` (ou `receiverId`) leu as mensagens de `senderId` (o id da equipe,
    // quando `isGroup`). Até 2026-10-06 este handler descontava 1 do contador de QUEM
    // ENVIOU, que não tem relação com a leitura do outro.
    const handleUnreadPrivate = (evt: {
      action: string;
      data?: {
        receiverId?: number; senderId?: number; isGroup?: boolean | string; readerId?: number;
        upToId?: number | null; allRead?: boolean; authors?: { senderId: number; upToId: number }[];
      };
    }) => {
      const d = evt?.data;
      if (evt?.action !== "update" || !d) return;
      const store = useChatStore.getState();

      if (d.allRead) {
        // Backend anterior marcava a empresa inteira e não dizia quem leu: só reconcilia.
        if (d.readerId == null) { scheduleUnreadReconcile(); return; }
        const allReaderId = Number(d.readerId);
        if (allReaderId === userId) {
          store.clearAllSocketUnread();
          setUnreadCount(0);
          clearFixedItems();
          scheduleUnreadReconcile();
          return;
        }
        const mine = Array.isArray(d.authors) ? d.authors.find((a) => Number(a?.senderId) === userId) : undefined;
        if (mine) store.markSentMessagesRead(userId as number, allReaderId, Number(mine.upToId) || null);
        return;
      }

      const readerId = Number(d.readerId ?? d.receiverId);
      const peerId = Number(d.senderId);
      if (!readerId || !peerId) return;
      const isGroup = d.isGroup === true || d.isGroup === "true";

      if (readerId === userId) {
        // Eu li, nesta aba ou em outra aba/aparelho.
        store.clearSocketUnread(peerId, isGroup);
        if (isGroup) store.clearMentionGroup(peerId);
        removeFixedItem(`${isGroup ? "g" : "u"}:${peerId}`);
        const active = store.activeConversation;
        const openHere = !!active && active.id === peerId && active.isGroup === isGroup;
        if (!openHere) scheduleUnreadReconcile();
        return;
      }

      // O outro leu o que eu mandei: ✓ vira ✓✓ na conversa aberta.
      if (!isGroup && peerId === userId) {
        store.markSentMessagesRead(userId as number, readerId, d.upToId != null ? Number(d.upToId) : null);
      }
    };

    // Edição, exclusão e reação (de qualquer um dos lados) na conversa aberta. O evento vai
    // para a empresa inteira, mas o store só guarda a conversa aberta: casar pelo id basta.
    const findStoredMessage = (rawId: unknown) => {
      const id = Number(rawId);
      if (!id) return undefined;
      return useChatStore.getState().messages.find((m) => Number(m.id) === id);
    };
    // A mensagem mostrada no aviso fixo também é casada pelo id: editada, o texto troca;
    // apagada antes da leitura, o item sai — ou, se chegaram outras da mesma conversa por
    // aqui, fica com "Nova mensagem" (as outras seguem não lidas). O total é conferido.
    const syncFixedItemWithMessage = (rawId: unknown, editedText?: string) => {
      const id = Number(rawId);
      if (!id) return;
      fixedItemsRef.current.forEach((item, key) => {
        if (item.lastMessageId !== id) return;
        if (editedText === undefined) {
          const store = useChatStore.getState();
          const received = item.type === "group"
            ? store.socketUnreadByGroup[item.peerId] || 0
            : store.socketUnreadByUser[item.peerId] || 0;
          if (received > 1) {
            fixedItemsRef.current.set(key, { ...item, text: "", lastMessageId: null });
            renderFixedToast();
          } else {
            removeFixedItem(key);
          }
          scheduleUnreadReconcile();
          return;
        }
        if (item.text === editedText) return;
        fixedItemsRef.current.set(key, { ...item, text: editedText });
        renderFixedToast();
      });
    };
    const handlePrivateMessageEdit = (evt: { data?: { id?: number; text?: string } }) => {
      const editedText = evt?.data?.text;
      if (typeof editedText === "string") syncFixedItemWithMessage(evt?.data?.id, editedText);
      const msg = findStoredMessage(evt?.data?.id);
      if (!msg || typeof evt.data?.text !== "string" || evt.data.text === msg.text) return;
      useChatStore.getState().updateMessage(msg.id, { text: evt.data.text });
    };
    const handlePrivateMessageDelete = (evt: { data?: { id?: number } }) => {
      syncFixedItemWithMessage(evt?.data?.id);
      const msg = findStoredMessage(evt?.data?.id);
      if (msg) useChatStore.getState().removeMessage(msg.id);
    };
    const handlePrivateMessageReaction = (evt: { data?: { id?: number; react?: string | null; reactFromMe?: string | null } }) => {
      const msg = findStoredMessage(evt?.data?.id);
      if (!msg) return;
      useChatStore.getState().updateMessage(msg.id, {
        react: evt.data?.react ?? null,
        reactFromMe: evt.data?.reactFromMe ?? null,
      });
    };

    // Reconexão: o que chegou com o socket fora não veio por evento. Atraso sorteado: depois
    // de reiniciar o backend todos os clientes reconectam juntos.
    if (socket.connected) connectedSocketRef.current = socket;
    const handleSocketConnect = () => {
      if (connectedSocketRef.current !== socket) { connectedSocketRef.current = socket; return; }
      reconcileFromServer(Math.floor(Math.random() * RECONNECT_RECONCILE_JITTER_MS));
    };
    const handleSocketDisconnect = () => { socketDroppedRef.current = true; };

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

 // Front legado: front legado — SET_USERS_APP atualiza lista de usuários online no chat
    const handleUpdateOnlineBubbles = (data: { id: number; name: string; status?: string }[]) => {
      if (!Array.isArray(data)) return;
      setUsers(data.filter((u) => u.id).map((u) => ({ id: u.id, name: u.name, status: u.status })));
    };

    socket.on(`${tenantId}:msg-private-msg`, handlePrivateMessage);
    socket.on(`${tenantId}:unread-msg-private-msg`, handleUnreadPrivate);
    socket.on(`${tenantId}:msg-private-msg-update`, handlePrivateMessageEdit);
    socket.on(`${tenantId}:msg-private-msg-delete`, handlePrivateMessageDelete);
    socket.on(`${tenantId}:msg-private-msg-reaction`, handlePrivateMessageReaction);
    // `msg-private-msg-notificacao` não é mais ouvido aqui: o `receiverId` dele vem cru do
    // corpo (texto no envio por FormData, então a direta com arquivo ou áudio nunca avisava)
    // e, junto do `msg-private-msg`, o som e a menção saíam em dobro. O evento segue
    // servindo aos avisos do sistema, lidos por `use-notification-socket.ts`.
    socket.on("connect", handleSocketConnect);
    socket.on("disconnect", handleSocketDisconnect);
    socket.on("verifyOnlineUsers", handleVerifyOnline);
    socket.on(`${tenantId}:user-online`, handleUserOnline);
    socket.on(`${tenantId}:updateStatusUser`, handleUpdateStatusUser);
    socket.on(`${tenantId}:chat:updateOnlineBubbles`, handleUpdateOnlineBubbles);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      socket.off(`${tenantId}:msg-private-msg`, handlePrivateMessage);
      socket.off(`${tenantId}:unread-msg-private-msg`, handleUnreadPrivate);
      socket.off(`${tenantId}:msg-private-msg-update`, handlePrivateMessageEdit);
      socket.off(`${tenantId}:msg-private-msg-delete`, handlePrivateMessageDelete);
      socket.off(`${tenantId}:msg-private-msg-reaction`, handlePrivateMessageReaction);
      socket.off("connect", handleSocketConnect);
      socket.off("disconnect", handleSocketDisconnect);
      socket.off("verifyOnlineUsers", handleVerifyOnline);
      socket.off(`${tenantId}:user-online`, handleUserOnline);
      socket.off(`${tenantId}:updateStatusUser`, handleUpdateStatusUser);
      socket.off(`${tenantId}:chat:updateOnlineBubbles`, handleUpdateOnlineBubbles);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribeChatStore();
      if (autoReadTimer) clearTimeout(autoReadTimer);
      if (reconcileTimer) clearTimeout(reconcileTimer);
      // Pendências seguem para a próxima montagem (renovação do usuário); na saída, somem.
      if (!useAuthStore.getState().isAuthenticated) {
        pendingAutoRead.clear();
        reconcilePendingRef.current = false;
        if (reconcileTrailingRef.current) { clearTimeout(reconcileTrailingRef.current); reconcileTrailingRef.current = null; }
        groupsPreloadedForRef.current = null;
        groupsReloadAtRef.current = 0;
        socketDroppedRef.current = false;
        hiddenAtRef.current = null;
        // O Toaster mora no layout raiz: sem isto o aviso fixo seguiria na tela de login.
        clearFixedItems();
      }
      initialized.current = false;
    };
  }, [isAuthenticated, tenantId, userId, user, addMessage, setUnreadCount, setUsers, setGroups, addMentionGroup, incrementSocketUnread, incrementUnreadCount, upsertFixedItem, removeFixedItem, clearFixedItems, renderFixedToast]);

  // Perdeu o acesso ao Chat Privado no meio da sessão: o aviso fixo sai.
  useEffect(() => {
    if (!canAccessChat) clearFixedItems();
  }, [canAccessChat, clearFixedItems]);
}
