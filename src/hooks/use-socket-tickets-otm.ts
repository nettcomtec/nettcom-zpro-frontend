"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useTicketStore, type Ticket } from "@/stores/ticket-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useBrandingStore } from "@/stores/branding-store";
import { fetchTickets } from "@/services/tickets";
import { normalizeTickets, normalizeTicket } from "@/lib/normalize-ticket";
import { getNotificationSoundUrl, getPwaIconUrl } from "@/lib/branding-urls";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { safeJsonParse } from "@/lib/safe-json-parse";
import { playNotificationSound } from "@/lib/notification-audio";
import { canUserSeeTicket, isTicketInBotFlow, type TicketVisibilityData } from "@/lib/can-user-see-ticket";
import { useTicketFilterStore } from "@/stores/ticket-filter-store";
import { matchesActiveFilter, type MatchesFilterTicket } from "@/lib/matches-active-filter";
import { getTicketLastMessagePreview } from "@/lib/template-preview";
import {
  ensurePendingTicketNotification,
  pickTicketVisibilityPatch,
  syncTicketNotificationVisibility,
} from "@/lib/ticket-notification-visibility";

function passesActiveUiFilterOtm(ticket: MatchesFilterTicket): boolean {
  const filter = useTicketFilterStore.getState();
  if (!filter.active) return true;
  const auth = useAuthStore.getState();
  const profile = auth.user?.profile;
  const isAdminLike = profile === "admin" || profile === "superadmin";
  const notViewAssignedTickets = auth.getConfigValue("NotViewAssignedTickets") === "enabled";
  return matchesActiveFilter(
    ticket,
    filter,
    { userId: auth.user?.userId, profile },
    { isAdminLike, notViewAssignedTickets },
  );
}

function buildVisibilityConfigOtm() {
  const store = useAuthStore.getState();
  return {
    supervisorAdmin: store.supervisorAdmin,
    notViewAssignedTickets: store.getConfigValue("NotViewAssignedTickets") === "enabled",
    notViewTicketsChatBot: store.getConfigValue("NotViewTicketsChatBot") === "enabled",
    showGroupsForAll: store.getConfigValue("showGroupsForAll") !== "disabled",
    nullTickets: store.getConfigValue("nullTickets"),
    inboundByQueueOnly: store.getConfigValue("inboundByQueueOnly"),
    supervisorChannelScoped: store.getConfigValue("supervisorChannelScoped"),
  };
}

// O model Ticket do backend NÃO tem coluna `chatbot` — o que existe lá é `chatFlowId`.
// Quem converte um no outro é o front, em normalize-ticket.ts:134
// (`chatbot: !!(t.chatFlowId ?? t.chatbot)`), e é esse booleano que a lista de
// /atendimento usa para esconder ticket de bot quando NotViewTicketsChatBot está ligado.
// Como os handlers de socket entregam o payload CRU para canUserSeeTicket, `ticket.chatbot`
// chegava sempre undefined e a regra virava letra morta: o sino/som avisava de mensagens
// de bot que a lista escondia. Derivamos APENAS este campo (normalizar o objeto inteiro
// tem custo e efeitos colaterais).
function deriveChatbotFlagOtm(ticket: unknown): boolean {
  const tk = (ticket ?? {}) as Record<string, unknown>;
  return !!(tk.chatFlowId ?? tk.chatbot);
}

// chat:create sem ticket aninhado: todos os campos de visibilidade viram null/undefined e
// canUserSeeTicket devolve true (a regra padrão libera ticket com userId == null) — ou seja,
// notificação + som para o tenant inteiro. Nos gates de AVISO tratamos isso como "não pode
// ver" (fail-closed). Varredura dos ~235 sítios de chat:create do backend: o padrão dominante
// (CreateMessageServiceZPRO) emite o Ticket completo; os payloads sem ticket aninhado são de
// emissores fromMe: true (que nem entram no bloco de notificação) mais dois emits duplicados
// de Nuvemshop/WooCommerce em remoção — não há vítima legítima conhecida.
function hasNestedTicketOtm(ticket: unknown): boolean {
  return !!ticket && typeof ticket === "object";
}

// Extrai os campos de visibilidade do ticket aninhado em chat:create. O backend
// (CreateMessageService) emite o Ticket completo na associação, mas o payload é
// tipado de forma frouxa aqui — daí os casts. Fonte única para o filtro ticketsRain,
// o gate de som/notificação e o gate do sininho.
function ticketVisibilityFromChatPayloadOtm(
  ticket: unknown,
  fallbackId?: number | null,
): TicketVisibilityData {
  const tk = (ticket ?? {}) as Record<string, unknown>;
  return {
    id: (tk.id as number | undefined) ?? fallbackId ?? undefined,
    userId: (tk.userId as number | null | undefined) ?? null,
    userIdArray: (tk.userIdArray as number[] | null | undefined) ?? null,
    // `shared` anda em par com `userIdArray`: o reconhecimento de convite exige os DOIS
    // (paridade com CanUserAccessTicketServiceZPRO:92 e com o sharedCondition da lista REST,
    // `t."shared" = true AND t."userIdArray" @> [userId]`). Como este objeto é montado campo
    // a campo, sem copiar `shared` aqui TODO ticket de chat:create chegaria ao gate com
    // shared === undefined e o convite legítimo viraria inválido — o usuário convidado
    // pararia de receber sino e som do ticket compartilhado.
    shared: (tk.shared as boolean | null | undefined) ?? null,
    whatsappId: (tk.whatsappId as number | null | undefined) ?? null,
    queueId: (tk.queueId as number | null | undefined) ?? null,
    queue: (tk.queue as { id?: number | null } | null | undefined) ?? null,
    isGroup: tk.isGroup as boolean | undefined,
    groupUserIdArray: (tk.groupUserIdArray as number[] | null | undefined) ?? null,
    chatbot: deriveChatbotFlagOtm(tk),
    chatFlowId: (tk.chatFlowId as number | null | undefined) ?? null,
    contact: tk.contact as TicketVisibilityData["contact"],
  };
}

// --- Cache e deduplicação no nível de módulo (compartilhado entre re-renders) ---
// Keyed by "userId:tenantId" so different users/tenants never share cached data
const _otmCacheMap = new Map<string, { data: { tickets: unknown[] }; timestamp: number }>();
const _otmPendingMap = new Map<string, Promise<void>>();

const OTM_DEBOUNCE_DELAY = 1500; // ms — maior que o padrão (500ms)
const OTM_CACHE_TTL = 2000; // ms — cache válido por 2s

/**
 * Hook otimizado de socket para tickets.
 * Ativado apenas quando `socketModelNovo === "optimized"` no localStorage.
 * Principais melhorias vs. padrão:
 *  - Debounce de 1500ms (vs 500ms)
 *  - Cache com TTL de 2s para evitar re-fetches desnecessários
 *  - Deduplicação: se uma requisição já está em voo, não inicia outra
 */
export function useSocketTicketsOtm() {
  const t = useTranslations("useSocketTickets");
  const { user, isAuthenticated } = useAuthStore();
  const setTickets = useTicketStore((s) => s.setTickets);
  const updateTicket = useTicketStore((s) => s.updateTicket);
  const addTicket = useTicketStore((s) => s.addTicket);
  const removeTicket = useTicketStore((s) => s.removeTicket);
  const addTicketMessage = useTicketStore((s) => s.addMessage);
  const replaceMessage = useTicketStore((s) => s.replaceMessage);
  const signalTicketListRefresh = useTicketStore((s) => s.signalTicketListRefresh);
  const signalCurrentTicketRefresh = useTicketStore((s) => s.signalCurrentTicketRefresh);
  const { addNotification } = useNotificationStore();
  const socketModelOptimized = useBrandingStore((s) => s.socketModelOptimized);
  const soundTimestamps = useBrandingStore((s) => s.soundTimestamps);
  const soundTimestampsRef = useRef(soundTimestamps);
  soundTimestampsRef.current = soundTimestamps;
  const tenantId = user?.tenantId;
  const userId = user?.userId;
  const profile = user?.profile;
  const initialized = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentMsgIds = useRef<Set<string>>(new Set());

  const debouncedRefreshTickets = useCallback(async () => {
    const now = Date.now();
    const cacheKey = `${userId}:${tenantId}`;

    const _otmCache = _otmCacheMap.get(cacheKey) ?? null;
    const _otmPendingPromise = _otmPendingMap.get(cacheKey) ?? null;

    // Cache hit: dados frescos disponíveis — aplica direto ao store
    if (_otmCache && (now - _otmCache.timestamp) < OTM_CACHE_TTL) {
      const raw = _otmCache.data.tickets || [];
      const freshTickets = normalizeTickets(raw as Record<string, unknown>[]);
      const freshIds = new Set(freshTickets.map((tk: { id: number }) => tk.id));
      const currentTickets = useTicketStore.getState().tickets;
      const preserved = currentTickets.filter((tk) => !freshIds.has(tk.id));
      setTickets([...freshTickets, ...preserved]);
      return;
    }

    // Deduplicação: se já há uma requisição pendente, não inicia outra
    if (_otmPendingPromise) {
      return _otmPendingPromise;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const contactLabel = t("contactFallback");
    const newMsgLabel = t("newMessageFallback");

    const promise = new Promise<void>((resolve) => {
      debounceTimer.current = setTimeout(async () => {
        try {
          const { data } = await fetchTickets({
            searchParam: "",
            pageNumber: 1,
            status: ["open", "pending"],
          });

          // Atualiza cache
          _otmCacheMap.set(cacheKey, { data: data as { tickets: unknown[] }, timestamp: Date.now() });
          _otmPendingMap.delete(cacheKey);

          const raw = data?.tickets || [];
          const freshTickets = normalizeTickets(raw as Record<string, unknown>[]);

          const freshIds = new Set(freshTickets.map((tk: { id: number }) => tk.id));
          const currentTickets = useTicketStore.getState().tickets;
          const preserved = currentTickets.filter((tk) => !freshIds.has(tk.id));
          setTickets([...freshTickets, ...preserved]);

          const currentUserOtm = useAuthStore.getState().user;
          const visibilityConfigOtm = buildVisibilityConfigOtm();
          const isVisibleForUserOtm = (tk: TicketVisibilityData) =>
            canUserSeeTicket(tk, currentUserOtm, visibilityConfigOtm);

          const openTickets = freshTickets.filter((tk: TicketVisibilityData & { status: string; unreadMessages: number }) => {
            if (tk.status !== "open" || (tk.unreadMessages ?? 0) <= 0) return false;
            return isVisibleForUserOtm(tk);
          });
          const pendingTickets = freshTickets.filter((tk: TicketVisibilityData & { status: string }) =>
            tk.status === "pending" && isVisibleForUserOtm(tk)
          );
          const allTicketNotifications = [
            ...openTickets,
            ...pendingTickets.filter((tk: { id: number }) => !openTickets.some((o: { id: number }) => o.id === tk.id)),
          ];

          const { notifications: prevNotifications, setNotifications } = useNotificationStore.getState();
          const readIds = new Set(prevNotifications.filter((n) => n.read).map((n) => n.id));
          setNotifications(
            allTicketNotifications.map((tk: { id: number; contact?: { name?: string }; lastMessage?: string; updatedAt: string; unreadMessages?: number }) => ({
              id: tk.id,
              message: `${tk.contact?.name || contactLabel}: ${getTicketLastMessagePreview(tk.lastMessage) || newMsgLabel}`,
              read: readIds.has(tk.id) || (tk.unreadMessages ?? 0) === 0,
              createdAt: tk.updatedAt ?? new Date().toISOString(),
              ticketId: tk.id,
            }))
          );
        } catch {
          _otmPendingMap.delete(cacheKey);
          // silenciar erros de timeout
        } finally {
          resolve();
        }
      }, OTM_DEBOUNCE_DELAY);
    });

    _otmPendingMap.set(cacheKey, promise);
    return promise;
  }, [userId, profile, setTickets, t]);

  useEffect(() => {
    // Só ativa se o modo otimizado estiver habilitado
    if (!socketModelOptimized) return;
    if (!isAuthenticated || !tenantId || profile === 'superadmin' || initialized.current) return;

    const socket = getSocket();
    initialized.current = true;

    const handleTicketList = (data: { type: string; payload: Record<string, unknown> }) => {
      if (data.type === "chat:ack" || data.type === "chat:delete" || data.type === "chat:update") {
        const payload = data.payload as {
          id?: string | number;
          messageId?: string;
          ack?: number;
          statusError?: { code?: number | string; title?: string; details?: string } | null;
          status?: string;
          isDeleted?: boolean;
          reaction?: string;
          reactionFromMe?: string;
          edition?: string;
          ticketId?: number;
          isStarred?: boolean;
          isPinned?: boolean;
          body?: string;
          dataJson?: string;
          mediaType?: string;
          sentVia?: string | null;
          ticketLastMessage?: string;
        };
        const currentTicket = useTicketStore.getState().currentTicket;
        const msgTicketId = payload.ticketId;
        const isForCurrentTicket = !msgTicketId || (currentTicket && msgTicketId === currentTicket.id);

        // Edicao de mensagem: o backend so manda ticketLastMessage quando a mensagem
        // editada era a ULTIMA do atendimento e o preview ja foi corrigido no banco.
        // Fica FORA do bloco do ticket aberto — edicao em atendimento que nao esta na
        // tela tambem precisa corrigir o card da lista. Patch magro de proposito: sem
        // updatedAt, senao cada edicao jogaria o atendimento pro topo da lista.
        if (
          data.type === "chat:update" &&
          payload.edition != null &&
          typeof payload.ticketLastMessage === "string"
        ) {
          const editedTicketId = Number(payload.ticketId);
          if (Number.isFinite(editedTicketId) && editedTicketId > 0) {
            updateTicket({ id: editedTicketId, lastMessage: payload.ticketLastMessage });
          }
        }

        if (isForCurrentTicket) {
          const { messages, setMessages } = useTicketStore.getState();
          const msgId = String(payload.id ?? payload.messageId ?? "");

          if (data.type === "chat:ack" && msgId) {
            const updated = messages.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    ack: payload.ack ?? m.ack,
                    ...(payload.statusError !== undefined ? { statusError: payload.statusError } : {}),
                    // Híbrido: selo "roteada" aparece ao vivo (linked_pending -> linked_baileys).
                    ...(payload.sentVia !== undefined ? { sentVia: payload.sentVia } : {}),
                  }
                : m
            );
            setMessages(updated);
          } else if (data.type === "chat:delete" && msgId) {
            const target = messages.find((m) => m.id === msgId);
            const noteTypes = ["notes", "callNotes", "transcription"];
            if (target && noteTypes.includes(target.mediaType ?? "")) {
              setMessages(messages.filter((m) => m.id !== msgId));
            } else {
              const updated = messages.map((m) =>
                m.id === msgId ? { ...m, isDeleted: true } : m
              );
              setMessages(updated);
            }
          } else if (data.type === "chat:update" && msgId) {
            const updated = messages.map((m) => {
              if (m.id !== msgId) return m;
              const patch: Partial<typeof m> = {};
              if (payload.body != null) patch.body = payload.body;
              if (payload.dataJson != null) (patch as { dataJson?: string }).dataJson = payload.dataJson;
              if (payload.reaction !== undefined) patch.reaction = payload.reaction;
              if (payload.reactionFromMe !== undefined) patch.reactionFromMe = payload.reactionFromMe;
              if (payload.edition != null) { patch.edition = payload.edition; patch.isEdited = true; }
              if (payload.isStarred !== undefined) patch.isStarred = payload.isStarred as boolean;
              if (payload.isPinned !== undefined) patch.isPinned = payload.isPinned as boolean;
              if (payload.isDeleted !== undefined) patch.isDeleted = payload.isDeleted as boolean;
              if (payload.sentVia !== undefined) (patch as { sentVia?: string | null }).sentVia = payload.sentVia;
              return { ...m, ...patch };
            });
            setMessages(updated);
          }
        }
        return;
      }

      if (data.type === "ticket:channelTransferred") {
        // Transferência de canal em massa (TransferChannelTicketsJob) muda
        // whatsappId/channel/userId/status de muitos tickets de uma vez —
        // recarrega a lista para refletir sem F5.
        const transferPayloadOtm = data.payload as
          | { whatsappId?: number | string; newWhatsappId?: number | string }
          | undefined;
        const currentTicketTransferOtm = useTicketStore.getState().currentTicket;
        if (currentTicketTransferOtm) {
          const currentWhatsappIdOtm =
            currentTicketTransferOtm.whatsapp?.id
            ?? (currentTicketTransferOtm as unknown as { whatsappId?: number | string }).whatsappId;
          const oldWhatsappIdOtm = transferPayloadOtm?.whatsappId;
          // O heal do job tambem mexe em tickets que JA estavam no canal de
          // destino (userId/status) — refetch quando o aberto casa com qualquer
          // um dos dois canais envolvidos.
          const newWhatsappIdOtm = transferPayloadOtm?.newWhatsappId;
          if (
            oldWhatsappIdOtm == null ||
            currentWhatsappIdOtm == null ||
            String(currentWhatsappIdOtm) === String(oldWhatsappIdOtm) ||
            (newWhatsappIdOtm != null && String(currentWhatsappIdOtm) === String(newWhatsappIdOtm))
          ) {
            signalCurrentTicketRefresh();
          }
        }
        signalTicketListRefresh();
        return;
      }

      if (data.type === "ticket:delete") {
        const tkDelete = data.payload as { id?: number };
        if (tkDelete?.id != null) {
          removeTicket(tkDelete.id);
          // Atendimento removido: a entrada do sino desse ticket sai junto.
          useNotificationStore.getState().removeTicketNotification(tkDelete.id);
        }
        return;
      }

      if (data.type === "ticket:update" || data.type === "ticket:create") {
        // Sino: mantém o retrato de visibilidade da entrada deste ticket e a REVOGA quando o
        // usuário deixa de poder vê-lo (aceito/transferido para outro atendente, fila alheia).
        // Fica ANTES do filtro ticketsRain, que descarta justamente o evento do ticket que o
        // usuário não pode ver — o caso que precisa limpar o sino.
        if (data.type === "ticket:update") {
          syncTicketNotificationVisibility(data.payload);
          // Devolvido à fila / transferido para fila: volta ao sino de quem pode ver (o evento
          // `notification:new` do backend só toca som). Usa o estado ANTERIOR do store, por isso
          // roda antes de o evento ser aplicado.
          ensurePendingTicketNotification(data.payload, {
            contactFallback: t("contactFallback"),
            newMessageFallback: t("newMessageFallback"),
          });
        }
        const ticketsRainEnabled = safeJsonParse(localStorage.getItem("ticketsRain"), null) === "enabled";
        // O backend emite payload: ticket diretamente (não aninhado em { ticket: ... })
        if (ticketsRainEnabled) {
          const tkRain = data.payload as TicketVisibilityData & { id?: number };
          // Espelha a regra REST (canUserSeeTicket): inclui tickets de fila do usuário com userId=null,
          // shared, wallets, grupo. Sem isso, transferência para fila sem usuário só aparece após F5.
          const currentUserRain = useAuthStore.getState().user;
          // payload CRU do socket: deriva `chatbot` de chatFlowId (ver deriveChatbotFlagOtm)
          const canSeeRain = canUserSeeTicket(
            { ...tkRain, chatbot: deriveChatbotFlagOtm(tkRain) },
            currentUserRain,
            buildVisibilityConfigOtm(),
          );
          if (!canSeeRain) {
            // Para ticket:update de tickets JÁ no store: permitir o update para que a cadeia
            // de memos re-filtre corretamente (ticket pode ter sido redirecionado para outra fila/usuário).
            // Sem isso, o ticket fica com dados antigos no store até F5.
            const isExistingUpdate = data.type === "ticket:update" && tkRain.id != null
              && useTicketStore.getState().tickets.some((t) => t.id === tkRain.id);
            if (!isExistingUpdate) {
              return;
            }
          }
        }

        // ticket:create: insere diretamente no store sem full refresh para evitar flash de skeleton
        if (data.type === "ticket:create") {
          const tkCreate = data.payload as Record<string, unknown> & { id?: number; status?: string };
          if (tkCreate?.id != null) {
            // Gate de filtro de UI: ticket fora do filtro ativo nao entra no store.
            const tkNormalized = normalizeTicket(tkCreate);
            if (passesActiveUiFilterOtm(tkNormalized as MatchesFilterTicket)) {
              addTicket(tkNormalized);
            }
            // Sync notification badge: add entry for new pending ticket (aplicando filtros de visibilidade)
            if (tkCreate.status === "pending") {
              const currentUserOtm = useAuthStore.getState().user;
              // payload CRU do socket: deriva `chatbot` de chatFlowId (ver deriveChatbotFlagOtm).
              // Este gate cobre badge + popup + som do ticket novo (no hook padrão são dois gates).
              const canSeeOtm = canUserSeeTicket(
                { ...(tkCreate as TicketVisibilityData), chatbot: deriveChatbotFlagOtm(tkCreate) },
                currentUserOtm,
                buildVisibilityConfigOtm(),
              );
              if (canSeeOtm) {
                const contactName = (tkCreate as { contact?: { name?: string } }).contact?.name || t("contactFallback");
                const { notifications: prevNotifs } = useNotificationStore.getState();
                if (!prevNotifs.some((n) => n.ticketId === tkCreate.id)) {
                  addNotification({
                    id: tkCreate.id!,
                    message: `${contactName}: ${t("newMessageFallback")}`,
                    read: false,
                    createdAt: (tkCreate as { createdAt?: string }).createdAt ?? new Date().toISOString(),
                    ticketId: tkCreate.id!,
                    visibility: pickTicketVisibilityPatch(tkCreate),
                  });
                }
                // Popup nativo do navegador para ticket novo em "pendentes" (paridade com chat:create
                // e com o hook padrão). No modo otimizado o ticket:create só criava o badge — o popup
                // do SO (Web Notification) nunca disparava. A tag compartilhada colapsa popups simultâneos.
                const notificationSilenced = useAuthStore.getState().getConfigValue("notificationSilenced") === "enabled";
                // notifyOnlyHumanTickets (flag tenant): não alertar se o ticket já entra no chatbot
                // (chatFlowId setado, sem fila/atendente). Só quando cair em pendentes para humano.
                const suppressBotNotif =
                  useAuthStore.getState().getConfigValue("notifyOnlyHumanTickets") === "enabled" &&
                  isTicketInBotFlow(tkCreate as { chatFlowId?: number | null; queueId?: number | null; userId?: number | null });
                if (!suppressBotNotif && notificationSilenced && typeof Notification !== "undefined" && Notification.permission === "granted") {
                  new Notification(`${t("notificationContactLabel")}: ${contactName}`, {
                    body: t("newMessageFallback"),
                    icon: getPwaIconUrl("icon-192x192.png"),
                    tag: "zpro-notification",
                  });
                }
              }
            }
          } else {
            if (process.env.NEXT_PUBLIC_DEBUG === "true") {
              console.debug("[socket:ticketList][otm] signalTicketListRefresh", {
                motivo: "ticket:create sem id no payload",
                evento: data.type,
                payload: data.payload,
              });
            }
            signalTicketListRefresh();
          }
          return;
        }

        // ticket:update: o payload É o ticket diretamente
        const tkPayload = data.payload as (Record<string, unknown> & { id?: number; status?: string; unreadMessages?: number }) | undefined;
        if (tkPayload?.id != null) {
          const existing = useTicketStore.getState().tickets.find((t) => t.id === tkPayload.id);
          if (existing) {
            // Atualiza in-store em qualquer caso; filteredTickets (client-side) reposiciona o ticket na aba certa
            // Normaliza o payload (ex: queue.queue → queue.name) para garantir que campos como a badge de fila
            // sejam corretamente mapeados para a interface do store.
            // Normaliza unreadMessages explicitamente: se o backend zerou (ticket aberto/lido), remove o bubble
            const normalized = normalizeTicket(tkPayload as Record<string, unknown>);
            const patch = {
              ...normalized,
              unreadMessages: Number(tkPayload.unreadMessages ?? existing.unreadMessages ?? 0),
            };
            updateTicket(patch);
            // Sync notification badge: backend zeroed unreadMessages → mark notification as read
            if (tkPayload.unreadMessages !== undefined && Number(tkPayload.unreadMessages) === 0) {
              useNotificationStore.getState().markAsRead(tkPayload.id!);
            }
            // Se o user perdeu visibilidade (ex.: convite revogado, transferência), fechar a conversa aberta.
            // Sem isto, ticket some da lista mas o painel direito continua exibindo o chat.
            const currentUserVis = useAuthStore.getState().user;
            const mergedTicketVis = { ...existing, ...(tkPayload as TicketVisibilityData) };
            const canSeeNow = canUserSeeTicket(
              mergedTicketVis,
              currentUserVis,
              buildVisibilityConfigOtm(),
            );
            // ── Aviso na TRANSIÇÃO p/ pendente na fila (paridade c/ ticket:create) ──
            // ticket:create só avisa na criação; aqui cobrimos bot→fila / transferência /
            // redirecionamento: avisa quando o ticket PASSA a ser "notificável"
            // (pendente + visível + fora do bot). Mesma flag notifyOnlyHumanTickets do create.
            {
              const notifyOnlyHuman =
                useAuthStore.getState().getConfigValue("notifyOnlyHumanTickets") === "enabled";
              const botView = (tk: Record<string, unknown>) => ({
                chatFlowId: (tk.chatFlowId as number | null | undefined) ?? null,
                queueId: (tk.queueId as number | null | undefined) ?? ((tk.queue as { id?: number } | undefined)?.id ?? null),
                userId: (tk.userId as number | null | undefined) ?? ((tk.user as { id?: number } | undefined)?.id ?? null),
              });
              const beforeNotifiable =
                (existing as { status?: string }).status === "pending" &&
                canUserSeeTicket(existing as unknown as TicketVisibilityData, currentUserVis, buildVisibilityConfigOtm()) &&
                !(notifyOnlyHuman && isTicketInBotFlow(botView(existing as unknown as Record<string, unknown>)));
              const afterNotifiable =
                (mergedTicketVis as { status?: string }).status === "pending" &&
                canSeeNow &&
                !(notifyOnlyHuman && isTicketInBotFlow(botView(mergedTicketVis as unknown as Record<string, unknown>)));
              if (afterNotifiable && !beforeNotifiable) {
                const soundEnabled = useAuthStore.getState().getConfigValue("notificationSilenced") === "enabled";
                const contactName = (mergedTicketVis as { contact?: { name?: string } }).contact?.name || t("contactFallback");
                const { notifications: prevNotifs } = useNotificationStore.getState();
                if (!prevNotifs.some((n) => n.ticketId === tkPayload.id)) {
                  addNotification({
                    id: tkPayload.id!,
                    message: `${contactName}: ${t("newMessageFallback")}`,
                    read: false,
                    createdAt: new Date().toISOString(),
                    ticketId: tkPayload.id!,
                  });
                }
                if (soundEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
                  new Notification(`${t("notificationContactLabel")}: ${contactName}`, {
                    body: t("newMessageFallback"),
                    icon: getPwaIconUrl("icon-192x192.png"),
                    tag: "zpro-notification",
                  });
                }
                const recording = safeJsonParse(localStorage.getItem("recording"), false);
                if (soundEnabled && !recording) {
                  playNotificationSound(getNotificationSoundUrl("ticket", soundTimestampsRef.current.ticket || undefined));
                }
              }
            }
            if (!canSeeNow) {
              // Escapatória "ticket próprio": não expulsar o dono do ticket aberto.
              // Regras como whatsappAllowed (canal fora da lista do user) ou wallets
              // derrubam canUserSeeTicket mesmo quando o ticket continua atribuído ao
              // próprio usuário que está respondendo — sem isto, a tela fecha a cada
              // envio. Transferência real (userId vira outro user) continua fechando.
              const ownerId =
                (mergedTicketVis as { userId?: number | null }).userId
                ?? (mergedTicketVis as { user?: { id?: number } }).user?.id
                ?? null;
              const isOwnTicket =
                currentUserVis?.userId != null && ownerId === currentUserVis.userId;
              if (!isOwnTicket) {
                const currentTicketNow = useTicketStore.getState().currentTicket;
                if (currentTicketNow?.id === tkPayload.id) {
                  useTicketStore.getState().setCurrentTicket(null);
                }
                // Compartilhamento (convite) revogado: se o user via o ticket SOMENTE
                // por estar no userIdArray e foi removido dele, remove da lista em tempo
                // real (antes só sumia após F5). Gate estrito na transição de share
                // (estava no array → saiu) para NÃO colidir com os falsos-negativos de
                // canUserSeeTicket por whatsappAllowed/wallets citados acima — esses não
                // alteram userIdArray, então nunca disparam remoção indevida.
                const myShareId = currentUserVis?.userId;
                const prevSharedArr = (existing as unknown as { userIdArray?: number[] }).userIdArray;
                const nextSharedArr = (mergedTicketVis as unknown as { userIdArray?: number[] }).userIdArray;
                const wasSharedWithMe =
                  myShareId != null && Array.isArray(prevSharedArr) && prevSharedArr.includes(myShareId);
                const isSharedWithMeNow =
                  myShareId != null && Array.isArray(nextSharedArr) && nextSharedArr.includes(myShareId);
                if (wasSharedWithMe && !isSharedWithMeNow) {
                  removeTicket(tkPayload.id!);
                }
              }
            }
            return;
          }
          // Ticket não está no store — ticket:create pode não ter chegado.
          // Usa o payload do ticket:update (contém ticket completo) para inserir diretamente.
          // Gate de filtro de UI: ticket fora do filtro ativo nao entra no store.
          const tkNormalizedUpd = normalizeTicket(tkPayload as Record<string, unknown>);
          // currentTicket fora da lista NUNCA pode ser barrado pelo gate de
          // filtro: o merge/bump de transferencia de canal mora no addTicket.
          if (
            passesActiveUiFilterOtm(tkNormalizedUpd as MatchesFilterTicket) ||
            useTicketStore.getState().currentTicket?.id === tkNormalizedUpd.id
          ) {
            addTicket(tkNormalizedUpd);
          }
          return;
        }
        if (process.env.NEXT_PUBLIC_DEBUG === "true") {
          console.debug("[socket:ticketList][otm] signalTicketListRefresh", {
            motivo: "ticket:update sem id no payload",
            evento: data.type,
            payload: data.payload,
          });
        }
        signalTicketListRefresh();
        return;
      }

      if (data.type === "chat:create") {
        if (!data.payload) return;
        const payload = data.payload as {
          body?: string;
          dataJson?: string;
          ticketId?: number;
          fromMe?: boolean;
          id?: string | number;
          idFront?: string;
          messageId?: string;
          mediaUrl?: string;
          storageUrl?: string;
          mediaType?: string;
          fileName?: string;
          quotedMsg?: unknown;
          scheduleDate?: string | null;
          status?: string;
          ack?: number;
          isForwarded?: boolean;
          isStatusReply?: boolean;
          sendType?: string | null;
          user?: { id: number; name: string; profilePicture?: string };
          contact?: { id: number; name: string; number?: string; profilePicUrl?: string };
          ticket?: { id?: number; contact?: { name?: string }; userId?: number; userIdArray?: number[] };
          emailMetadata?: {
            subject?: string;
            messageId?: string;
            inReplyTo?: string;
            references?: string[];
            cid?: Record<string, string>;
          } | null;
        };

        // ticketsRain — filtro de socket: ignora mensagens de tickets que o usuário não pode ver.
 // O gate portado do front legado (socketInitial.js:457-463) comparava apenas `ticket.userId === eu`,
        // o que descartava TODO ticket pendente (userId null) para quem não é admin: som, popup do
        // SO, prévia do card e até a renderização em tempo real da mensagem. Como o badge de não
        // lidas vem por ticket:update (que já usa canUserSeeTicket), o contador subia com o alerta
        // sonoro mudo. Agora os dois eventos usam o mesmo gate — que cobre pendente sem dono, fila
        // do usuário, shared, wallet e grupo. A conversa aberta na tela nunca é filtrada.
        const ticketsRainEnabledChat = safeJsonParse(localStorage.getItem("ticketsRain"), null) === "enabled";
        const messageTicketId = payload.ticketId ?? payload.ticket?.id;
        if (ticketsRainEnabledChat && payload.ticket) {
          const openTicketId = useTicketStore.getState().currentTicket?.id;
          const isForOpenTicket =
            openTicketId != null && messageTicketId != null && messageTicketId === openTicketId;
          if (!isForOpenTicket) {
            const canSeeRainChat = canUserSeeTicket(
              ticketVisibilityFromChatPayloadOtm(payload.ticket, messageTicketId),
              useAuthStore.getState().user,
              buildVisibilityConfigOtm(),
            );
            if (!canSeeRainChat) {
              // O filtro de socket descarta a mensagem, mas a entrada que o sino ainda tiver
              // desse atendimento precisa sair (ver lib/ticket-notification-visibility.ts).
              syncTicketNotificationVisibility(payload.ticket);
              return;
            }
          }
        }
        const currentTicket = useTicketStore.getState().currentTicket;
        const isForCurrentTicket = currentTicket && messageTicketId != null && messageTicketId === currentTicket.id;

        if (isForCurrentTicket) {
          const realId = String(payload.id ?? "");
          const realMessage = {
            id: realId || String(Date.now()),
            body: String(payload.body || ""),
            dataJson: payload.dataJson,
            read: payload.fromMe ? true : false,
            createdAt: new Date().toISOString(),
            fromMe: payload.fromMe ?? false,
            messageId: payload.messageId,
            mediaUrl: payload.mediaUrl,
            storageUrl: payload.storageUrl,
            mediaType: payload.mediaType as import("@/stores/ticket-store").MediaType | undefined,
            fileName: payload.fileName,
            quotedMsg: payload.quotedMsg as import("@/stores/ticket-store").QuotedMessage | null | undefined,
            scheduleDate: payload.scheduleDate ?? null,
            status: payload.status,
            ack: payload.ack,
            isForwarded: payload.isForwarded ?? false,
            isStatusReply: payload.isStatusReply ?? false,
            sendType: payload.sendType,
            user: payload.user,
            contact: payload.contact,
            emailMetadata: payload.emailMetadata ?? undefined,
          };

          if (realId && recentMsgIds.current.has(realId)) {
            // já processado — ignora duplicata
          } else {
            if (realId) {
              recentMsgIds.current.add(realId);
              setTimeout(() => recentMsgIds.current.delete(realId), 15000);
            }

            // CreateMessageSystemService no backend forca mediaType="chat" no
            // primeiro emit, fazendo midia "piscar" entre chat:create e
            // chat:update. Preserva optimistic.mediaType quando o realMessage
            // chega com tipo generico.
            const GENERIC_MEDIA_TYPES_OTM = ["chat", "extendedTextMessage", "conversation"];
            const realIsGeneric = !realMessage.mediaType || GENERIC_MEDIA_TYPES_OTM.includes(String(realMessage.mediaType));

            if (payload.idFront) {
              const optimistic = useTicketStore.getState().messages.find((m) => m.id === payload.idFront);
              const optHasMedia = optimistic?.mediaType && !GENERIC_MEDIA_TYPES_OTM.includes(String(optimistic.mediaType));
              const merged = {
                ...realMessage,
                mediaUrl: realMessage.mediaUrl || optimistic?.mediaUrl,
                mediaType: (realIsGeneric && optHasMedia) ? optimistic!.mediaType : (realMessage.mediaType || optimistic?.mediaType),
                fileName: realMessage.fileName || optimistic?.fileName,
                quotedMsg: realMessage.quotedMsg || optimistic?.quotedMsg,
                dataJson: realMessage.dataJson || optimistic?.dataJson,
                ack: Math.max(realMessage.ack ?? 0, optimistic?.ack ?? 0) || undefined,
              };
              replaceMessage(payload.idFront as string, merged);
            } else if (payload.fromMe) {
              // Bolhas falhadas (ack -1) ficam FORA do pool do matcher fallback:
              // eco de outra mensagem não pode "curar" bolha que falhou. O branch
              // por idFront acima segue reconciliando ack -1 (eco tardio legítimo).
              const currentMsgs = useTicketStore.getState().messages;
              const pendingOptimistics = currentMsgs.filter((m) => m.id.startsWith("front-") && m.fromMe && m.ack !== -1);
              const byBody = pendingOptimistics.find((m) => m.body === realMessage.body && !!m.body);
              const byMedia = !byBody && realMessage.mediaType
                ? pendingOptimistics.find((m) => !!m.mediaUrl)
                : undefined;
              const optimistic = byBody ?? byMedia ?? pendingOptimistics[0];
              if (optimistic) {
                const optHasMedia = optimistic.mediaType && !GENERIC_MEDIA_TYPES_OTM.includes(String(optimistic.mediaType));
                const merged = {
                  ...realMessage,
                  mediaUrl: realMessage.mediaUrl || optimistic.mediaUrl,
                  mediaType: (realIsGeneric && optHasMedia) ? optimistic.mediaType : (realMessage.mediaType || optimistic.mediaType),
                  fileName: realMessage.fileName || optimistic.fileName,
                  quotedMsg: realMessage.quotedMsg || optimistic.quotedMsg,
                  dataJson: realMessage.dataJson || optimistic.dataJson,
                  ack: Math.max(realMessage.ack ?? 0, optimistic.ack ?? 0) || undefined,
                };
                replaceMessage(optimistic.id, merged);
              } else {
                addTicketMessage(realMessage);
              }
            } else {
              addTicketMessage(realMessage);
            }
          }
        }

        // Alinhado ao WhatsApp Web: silencia som/notif do ticket aberto APENAS quando a janela
        // tem foco (usuário está de fato olhando a conversa). Se o ticket está aberto mas a janela
        // perdeu o foco (outra aba, outro app, minimizada), o alerta volta a tocar — você não está
        // vendo a mensagem chegar. document.hasFocus() cobre "navegador visível atrás de outro app"
        // melhor que visibilityState. Para tickets que NÃO são o atual, toca normalmente como antes.
        const isWindowFocusedOtm =
          typeof document !== "undefined" && typeof document.hasFocus === "function" && document.hasFocus();
        const suppressSoundForActiveChatOtm = isForCurrentTicket && isWindowFocusedOtm;
        if (!payload.fromMe && !suppressSoundForActiveChatOtm && messageTicketId != null) {
          // Gate de visibilidade: o som/notif sistema só toca quando o usuário pode ver o ticket
          // (respeita fila, whatsappAllowed, NotViewTicketsChatBot, DirectTicketsToWallets, etc.).
          // Antes, o gate era apenas `userId === me || !userId`, o que deixava o som tocar
          // para tickets ainda no chatbot ou em filas alheias.
          // Fail-closed: payload sem ticket aninhado não permite avaliar visibilidade e
          // canUserSeeTicket devolveria true para o tenant inteiro (ver hasNestedTicketOtm).
          const ticketForSoundOtm = ticketVisibilityFromChatPayloadOtm(payload.ticket, messageTicketId);
          const currentUserForSoundOtm = useAuthStore.getState().user;
          const canSeeForSoundOtm =
            hasNestedTicketOtm(payload.ticket) &&
            canUserSeeTicket(ticketForSoundOtm, currentUserForSoundOtm, buildVisibilityConfigOtm());
          if (canSeeForSoundOtm) {
 // notificationSilenced — front legado: "enabled" = som LIGADO (nome enganoso); toca quando === "enabled"
            const notificationSilenced = useAuthStore.getState().getConfigValue("notificationSilenced") === "enabled";
            // notifyOnlyHumanTickets (flag tenant): não alertar enquanto o ticket está no chatbot
            // (chatFlowId setado, sem fila/atendente). Só quando cair em pendentes para humano.
            const suppressBotNotif =
              useAuthStore.getState().getConfigValue("notifyOnlyHumanTickets") === "enabled" &&
              isTicketInBotFlow(payload.ticket as { chatFlowId?: number | null; queueId?: number | null; userId?: number | null });
            if (!suppressBotNotif && notificationSilenced && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(`${t("notificationContactLabel")}: ${payload.ticket?.contact?.name || payload.contact?.name || ""}`, {
                body: `${t("notificationMessageLabel")}: ${payload.body || ""}`,
                icon: getPwaIconUrl("icon-192x192.png"),
                tag: "zpro-notification",
              });
            }
            if (!suppressBotNotif && notificationSilenced) {
              const recording = safeJsonParse(localStorage.getItem("recording"), false);
              if (!recording) {
                playNotificationSound(getNotificationSoundUrl("ticket", soundTimestampsRef.current.ticket || undefined));
              }
            }
          }
        }

        // Para chat:create de mensagens fromMe que NÃO são do ticket atual: pular bump do ticket
        // na lista. Mensagem do colega não é "nova mensagem" pro observador — quando bump corre,
        // re-flutua o ticket pro topo (e o ticket:update posterior zera unread → some o bullet),
        // gerando entradas "aleatórias" que atrapalham filtros ativos.
        if (payload.fromMe && !isForCurrentTicket) {
          return;
        }
        if (messageTicketId != null) {
          // Gate de filtro de UI: ticket fora do filtro atualiza lastMessage mas
          // NAO bumpa updatedAt — evita re-flutuar pro topo da lista filtrada.
          const existingForBump = useTicketStore.getState().tickets.find((t) => t.id === messageTicketId);
          const bumpsUpdatedAt = !existingForBump || passesActiveUiFilterOtm(existingForBump as MatchesFilterTicket);
          const lastMessagePatch: Partial<Ticket> & { id: number } = {
            id: messageTicketId,
            lastMessage: String(payload.body || ""),
            lastMessageType: payload.mediaType || "",
          };
          if (bumpsUpdatedAt) {
            lastMessagePatch.updatedAt = new Date().toISOString();
          }
          updateTicket(lastMessagePatch);
        }
        if (!isForCurrentTicket) {
          // Total ABSOLUTO do backend quando o ticket aninhado do chat:create o
          // traz (pos-incremento): evita dupla contagem com o ticket:update
          // absoluto que canais como baileys emitem ANTES do chat:create
          // (absoluto 1 + incremento local = 2 ate o F5). O +1 fica como
          // fallback de defesa para payloads sem o total (emitters fora do
          // CreateMessageService central).
          const nestedUnreadOtm = (payload.ticket as { unreadMessages?: unknown } | undefined)?.unreadMessages;
          const absoluteUnreadOtm =
            typeof nestedUnreadOtm === "number"
              ? nestedUnreadOtm
              : typeof nestedUnreadOtm === "string" && nestedUnreadOtm.trim() !== ""
                ? Number(nestedUnreadOtm)
                : NaN;
          const existingTicket = useTicketStore.getState().tickets.find((t) => t.id === messageTicketId);
          if (existingTicket) {
            updateTicket({
              id: messageTicketId!,
              unreadMessages: Number.isFinite(absoluteUnreadOtm)
                ? absoluteUnreadOtm
                : (existingTicket.unreadMessages ?? 0) + 1,
            });
          } else {
            setTimeout(() => {
              const tk = useTicketStore.getState().tickets.find((t) => t.id === messageTicketId);
              if (tk) {
                updateTicket({
                  id: messageTicketId!,
                  unreadMessages: Number.isFinite(absoluteUnreadOtm)
                    ? absoluteUnreadOtm
                    : (tk.unreadMessages ?? 0) + 1,
                });
              } else {
                // Gate de filtro de UI: se o ticket está ausente do store porque o
                // filtro ativo o barrou (insert bloqueado em ticket:create/update),
                // NÃO sinalizar — o refetch usa os mesmos filtros no servidor e não
                // o traria de volta; sinalizar aqui só resetava/refazia a lista em
                // loop a cada mensagem inbound de ticket fora do filtro. Payload sem
                // ticket aninhado não permite avaliar: mantém o sinal (fail-open)
                // pra não perder refresh legítimo.
                if (
                  payload.ticket &&
                  !passesActiveUiFilterOtm(
                    normalizeTicket(payload.ticket as Record<string, unknown>) as MatchesFilterTicket,
                  )
                ) {
                  return;
                }
                if (process.env.NEXT_PUBLIC_DEBUG === "true") {
                  console.debug("[socket:ticketList][otm] signalTicketListRefresh", {
                    motivo: "chat:create — ticket não encontrado no store após 300ms",
                    evento: data.type,
                    ticketId: messageTicketId,
                    payload: data.payload,
                  });
                }
                signalTicketListRefresh();
              }
            }, 300);
          }
        }
        // Sync notification badge: add/update entry for new unread message (aplicando filtros de visibilidade)
        if (!payload.fromMe && !isForCurrentTicket && messageTicketId != null) {
          // Fail-closed: payload sem ticket aninhado não permite avaliar visibilidade e
          // canUserSeeTicket devolveria true para o tenant inteiro (ver hasNestedTicketOtm).
          const ticketForCheck = ticketVisibilityFromChatPayloadOtm(payload.ticket, messageTicketId);
          const currentUserOtm = useAuthStore.getState().user;
          const canSeeOtm =
            hasNestedTicketOtm(payload.ticket) &&
            canUserSeeTicket(ticketForCheck, currentUserOtm, buildVisibilityConfigOtm());
          if (canSeeOtm) {
            const contactName = payload.ticket?.contact?.name || t("contactFallback");
            const msgBody = payload.body || t("newMessageFallback");
            const { notifications: prevNotifs, setNotifications } = useNotificationStore.getState();
            const existingNotif = prevNotifs.find((n) => n.ticketId === messageTicketId);
            // Retrato de visibilidade da entrada (ver lib/ticket-notification-visibility.ts): o
            // ticket aninhado do chat:create é a linha completa, então atualiza o que já havia.
            const visibilityPatchOtm = pickTicketVisibilityPatch(payload.ticket);
            if (existingNotif) {
              setNotifications(prevNotifs.map((n) =>
                n.ticketId === messageTicketId
                  ? {
                      ...n,
                      read: false,
                      message: `${contactName}: ${msgBody}`,
                      createdAt: new Date().toISOString(),
                      visibility: { ...(n.visibility ?? {}), ...visibilityPatchOtm },
                    }
                  : n
              ));
            } else {
              addNotification({
                id: messageTicketId,
                message: `${contactName}: ${msgBody}`,
                read: false,
                createdAt: new Date().toISOString(),
                ticketId: messageTicketId,
                visibility: visibilityPatchOtm,
              });
            }
          } else if (hasNestedTicketOtm(payload.ticket)) {
            // Mensagem de atendimento que o usuário NÃO pode ver e que ainda tem entrada no sino
            // (ticket:update perdido em queda de conexão): o ticket aninhado é a linha completa,
            // então serve para revogar a entrada agora.
            syncTicketNotificationVisibility(payload.ticket);
          }
        }
        return;
      }

      if (data.type === "notification:new") {
 // Front legado — toca áudio ao receber novo atendimento pendente
        // notificationSilenced === "enabled" significa som LIGADO (nome enganoso, mantido por compatibilidade)
        // Nota: não adicionamos ao notification store aqui pois ticket:create/chat:create
        // já atualizam o badge com o ID correto do ticket, evitando entradas fantasmas.
        // Gate de visibilidade: EmitTicketNotificationService envia o ticket completo no payload.
        const tkNotifOtm = data.payload as (Record<string, unknown> & { id?: number }) | undefined;
        const currentUserNotifOtm = useAuthStore.getState().user;
        // payload CRU do socket: deriva `chatbot` de chatFlowId (ver deriveChatbotFlagOtm)
        const canSeeNotifOtm = tkNotifOtm?.id != null
          ? canUserSeeTicket(
              { ...(tkNotifOtm as TicketVisibilityData), chatbot: deriveChatbotFlagOtm(tkNotifOtm) },
              currentUserNotifOtm,
              buildVisibilityConfigOtm(),
            )
          : false;
        if (canSeeNotifOtm) {
          const notificationSilenced = useAuthStore.getState().getConfigValue("notificationSilenced") === "enabled";
          const recording = safeJsonParse(localStorage.getItem("recording"), false);
          if (notificationSilenced && !recording) {
            playNotificationSound(getNotificationSoundUrl("ticket", soundTimestampsRef.current.ticket || undefined));
          }
        }
        return;
      }

      if (data.type === "notification:status") {
        const payload = data.payload as { message?: string; msg?: { ticket?: { userId?: number; userIdArray?: number[] } } };
        const ticketUserId = payload.msg?.ticket?.userId;
        const userIdArray = payload.msg?.ticket?.userIdArray;
        if (ticketUserId === userId || (userIdArray && userIdArray.includes(userId!))) {
          toast.warning(String(payload.message || t("statusUpdate")));
        }
      }
    };

    const handleContactList = (data: { type: string; payload: unknown }) => {
      if (data.type !== "contact:update") return;
      // Espelho do hook padrao: etiqueta alterada no contato (UI, API externa
      // /addTag|/updatetag|/removeTag, acoes de fluxo/pipeline) so chegava como
      // contact:update, entao a tag so aparecia no card/cabecalho quando a PROXIMA
      // mensagem trazia um ticket:update "gordo" — ate la, so com F5. Aplica as tags
      // nos tickets do contato ja no store, sem refetch (cobre backend antigo).
      // A foto vem no mesmo evento: o backend busca a imagem do contato fora do
      // caminho de recebimento (e no aviso de troca de foto do WhatsApp), entao
      // sem aplicar profilePicUrl aqui o avatar novo so aparecia com F5.
      const contact = data.payload as
        | {
            id?: number;
            profilePicUrl?: string | null;
            tags?: { id: number; tag?: string; name?: string; color?: string }[];
          }
        | undefined;
      if (contact?.id == null) return;
      const tags = Array.isArray(contact.tags)
        ? contact.tags
            .filter((tg, i, arr) => tg?.id != null && arr.findIndex((x) => x?.id === tg.id) === i)
            .map((tg) => ({
              id: Number(tg.id),
              tag: tg.tag ?? tg.name ?? "",
              name: tg.name ?? tg.tag ?? "",
              // Sem cor o chip do cabecalho ficaria transparente (texto branco no
              // branco): cai no neutro usado nas demais badges.
              color: tg.color || "#666",
            }))
        : undefined;
      const profilePicUrl =
        typeof contact.profilePicUrl === "string" && contact.profilePicUrl.startsWith("http")
          ? contact.profilePicUrl
          : undefined;
      if (!tags && !profilePicUrl) return;
      const state = useTicketStore.getState();
      const affected = state.tickets.filter((tk) => tk.contact?.id === contact.id).map((tk) => tk.id);
      if (state.currentTicket?.contact?.id === contact.id && !affected.includes(state.currentTicket.id)) {
        affected.push(state.currentTicket.id);
      }
      affected.forEach((ticketId) => {
        const tk = state.tickets.find((x) => x.id === ticketId) ?? state.currentTicket;
        updateTicket({
          id: ticketId,
          ...(tags ? { tags } : {}),
          ...(tk?.contact
            ? {
                contact: {
                  ...tk.contact,
                  ...(tags ? { tags } : {}),
                  ...(profilePicUrl ? { profilePicUrl } : {}),
                },
              }
            : {}),
        });
      });
    };

    socket.off(`${tenantId}:ticketList`);
    socket.on(`${tenantId}:ticketList`, handleTicketList);
    socket.off(`${tenantId}:contactList`);
    socket.on(`${tenantId}:contactList`, handleContactList);

    // Resync ao reconectar: invalida cache OTM (TTL 2s esconderia o refetch) e
    // sinaliza refresh autoritativo na página de atendimento.
    // Só dispara refresh completo se a queda durou > 10s — blips curtos são cobertos
    // pelo replay interno do Socket.IO e não devem causar piscar na lista.
    let disconnectedAt: number | null = null;
    const RECONNECT_DOWNTIME_THRESHOLD_MS = 10_000;
    const onReconnectAttempt = () => {
      if (disconnectedAt === null) disconnectedAt = Date.now();
    };
    const onReconnect = () => {
      const downtime = disconnectedAt ? Date.now() - disconnectedAt : 0;
      disconnectedAt = null;
      if (downtime > 0 && downtime < RECONNECT_DOWNTIME_THRESHOLD_MS) return;
      const ck = `${userId}:${tenantId}`;
      _otmCacheMap.delete(ck);
      _otmPendingMap.delete(ck);
      signalTicketListRefresh();
    };
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect", onReconnect);

    return () => {
      socket.off(`${tenantId}:ticketList`, handleTicketList);
      socket.off(`${tenantId}:contactList`, handleContactList);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect", onReconnect);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      // Limpa cache e pending ao desmontar
      const ck = `${userId}:${tenantId}`;
      _otmCacheMap.delete(ck);
      _otmPendingMap.delete(ck);
      initialized.current = false;
    };
  }, [isAuthenticated, tenantId, userId, profile, socketModelOptimized, debouncedRefreshTickets, addTicketMessage, addNotification, signalTicketListRefresh, signalCurrentTicketRefresh, updateTicket]);
}
