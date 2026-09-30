import { create } from "zustand";
import { resolveQueueMeta } from "@/lib/queue-cache";
import { useWhatsappStore } from "@/stores/whatsapp-store";

export type MediaType =
  | "chat" | "extendedTextMessage" | "conversation"
  | "image" | "imageMessage" | "media"
  | "audio" | "audioMessage"
  | "video" | "videoMessage"
  | "sticker"
  | "document" | "documentMessage" | "documentWithCaptionMessage"
  | "vcard" | "contactMessage" | "contactsArrayMessage"
  | "location" | "locationMessage" | "liveLocationMessage"
  | "button" | "list" | "reply_buttons" | "interactive"
  | "notes" | "callNotes" | "transcription" | "transfer"
  | "cta_url" | "templates" | "templateMessage"
  | string;

export interface QuotedMessage {
  id: string;
  body: string;
  mediaType?: MediaType;
  mediaUrl?: string;
  fromMe: boolean;
  contact?: { name: string };
}

export interface Message {
  id: string;
  /** Stable React key — set to idFront on optimistic, preserved through replaceMessage */
  stableKey?: string;
  /** WhatsApp/channel message ID (e.g. "3EB0...") — distinct from DB id */
  messageId?: string;
  /** DB ticket ID this message belongs to */
  ticketId?: number;
  body: string;
  read: boolean;
  ack?: number;
  /** Detalhe do status "failed" do webhook WABA/BSP (ack=-1) — exibido no tooltip do ack */
  statusError?: { code?: number | string; title?: string; details?: string } | null;
  /** Progresso de upload (0-100) da mídia otimista (id front-*) — barra na bolha durante o envio */
  uploadProgress?: number;
  mediaUrl?: string;
  /** URL pública do storage externo (S3/R2). Quando presente, deve ser preferida ao mediaUrl
   *  para evitar 404 em deployments com keepLocalCopy=false. */
  storageUrl?: string;
  storageKey?: string;
  mediaName?: string;
  mediaType?: MediaType;
  createdAt: string;
  fromMe: boolean;
  isDeleted?: boolean;
  isEdited?: boolean;
  /** Mensagem encaminhada (ex.: WABA context.forwarded) — exibe badge "Encaminhada" na bolha */
  isForwarded?: boolean;
  /** Transporte real da mensagem no modo híbrido: 'linked_baileys' = enviada roteada pela
   *  conexão vinculada (sem cobrança por mensagem da Meta) — exibe selo na bolha. */
  sentVia?: string | null;
  /** Origem do envio gravada pelo backend. 'API'/'externalApi' = disparo da API externa
   *  (ou envio automatico que usa a mesma marca) — o chat mostra "Sistema" como autor. */
  sendType?: string | null;
  /** Resposta ao seu status WABA (context.from sem context.id) — exibe badge "Resposta ao seu status" na bolha */
  isStatusReply?: boolean;
  edition?: string;
  isDelayed?: boolean;
  scheduleDate?: string | null;
  status?: string;
  quotedMsg?: QuotedMessage | null;
  contact?: { id: number; name: string; number?: string; profilePicUrl?: string };
  user?: { id: number; name: string; profilePicture?: string };
  reaction?: string;
  reactionFromMe?: string;
  isStarred?: boolean;
  isPinned?: boolean;
  pinnedAt?: string | null;
  pinnedExpiry?: string | null;
  albumId?: string;
  isAlbum?: boolean;
  vcardList?: { name: string; number: string }[];
  latitude?: number;
  longitude?: number;
  fileName?: string;
  queue?: { id: number; queue: string };
  dataJson?: string;
  translatedBody?: string | null;
  translatedLang?: string | null;
  /** Canal de origem da mensagem (whatsapp/baileys/youtube/...) — usado em
   *  flags visuais especificas por canal (ex.: badge YouTube reply). */
  channel?: string;
  /** Metadata de email recebido (canal webmail/email) — usado para preservar
   *  thread em respostas via SMTP (subject, In-Reply-To, References). */
  emailMetadata?: {
    subject?: string;
    /** Corpo digitado no envio (canal webmail/email) — renderizado no bubble do e-mail enviado. */
    text?: string;
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
    cid?: Record<string, string>;
  } | null;
  /** Mensagem original de campanha injetada quando o contato responde
   *  (showOriginalOnReply) — exibe badge "Mensagem de campanha" na bolha. */
  campaignMeta?: {
    campaignId?: number;
    campaignName?: string;
    sentAt?: string;
  } | null;
}

export interface Contact {
  id: number;
  name: string;
  number: string;
  // @username (recurso WhatsApp 2026) + campos LID p/ fallback de exibição (item F)
  username?: string;
  pushname?: string;
  lid?: string;
  isLid?: boolean;
  // Identificador WABA de contato sem telefone (username privado)
  bsuid?: string | null;
  instagramPK?: string | number;
  messengerId?: string | number;
  email?: string;
  profilePicUrl?: string;
  cpf?: string;
  birthday?: string;
  birthdayDate?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  cep?: string;
  logradouro?: string;
  numeroEndereco?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  extraInfo?: { name: string; value: string }[];
  tags?: { id: number; name: string; color: string }[];
  wallets?: { id: number; name: string }[];
  blocked?: boolean;
  chatbotBlocked?: boolean;
  kanban?: number;
}

export interface Ticket {
  id: number;
  status: string;
  lastMessage: string;
  unreadMessages: number;
  isGroup: boolean;
  channel?: string;
  chatbot?: boolean;
  /** Agente de IA armado no ticket (efetivo só com chatgptStatus ligado — ver lib/ticket-automations) */
  aiAgentId?: number | null;
  autoClose?: boolean;
  typebotStatus?: string;
  dialogflowStatus?: string;
  chatgptStatus?: string;
  n8nStatus?: string;
  difyStatus?: string;
  lmStatus?: string;
  grokStatus?: string;
  geminiStatus?: string;
  deepseekStatus?: string;
  qwenStatus?: string;
  claudeStatus?: string;
  ollamaStatus?: string;
  contact: Contact;
  queue?: { id: number; name: string; color: string };
  user?: { id: number; name: string };
  whatsapp?: { id: number; name: string; type?: string; sendEvaluation?: string; tokenAPI?: string; chatgptApiKey?: string; chatgptModel?: string; pixDefaultKey?: string; pixDefaultType?: string; pixDefaultName?: string; pixDefaultMessage?: string };
  tags?: { id: number; name?: string; tag?: string; color?: string }[];
  kanban?: number | string;
  wallet?: { id?: number; name?: string } | string;
  reasons?: number | null;
  createdAt: string;
  updatedAt: string;
  lastMessageReceived?: string | number;
  lastMessageAt?: string | number;
  lastMessageType?: string;
  answered?: boolean;
  /** true quando ha uma pesquisa de satisfacao pendente (aguardando a nota do cliente). Derivado no backend. */
  pendingEvaluation?: boolean;
  isPaused?: boolean;
  lastPauseAt?: number | null;
  pauseReason?: string | null;
  /** Quando o ticket foi criado a partir de import de historico (WABA coex). null = ticket comum */
  imported?: string | Date | null;
  /** Análise de sentimento por IA (auto ou manual). Persistido no banco. */
  sentiment?: "positive" | "neutral" | "negative" | "frustrated" | null;
  sentimentSummary?: string | null;
  sentimentAnalyzedAt?: string | null;
  scheduledMessages?: Array<{
    id: number;
    body: string;
    scheduleDate: string;
    status: string;
    isDeleted?: boolean;
    mediaName?: string;
    mediaUrl?: string;
    mediaType?: string;
    createdAt: string;
  }>;
}

interface TicketState {
  tickets: Ticket[];
  currentTicket: Ticket | null;
  messages: Message[];
  hasMore: boolean;
  ticketListRefreshSignal: number;
  signalTicketListRefresh: () => void;
  currentTicketRefreshSignal: number;
  signalCurrentTicketRefresh: () => void;
  loading: boolean;

  setTickets: (tickets: Ticket[]) => void;
  addTicket: (ticket: Ticket) => void;
  updateTicket: (ticket: Partial<Ticket> & { id: number }) => void;
  removeTicket: (id: number) => void;
  setCurrentTicket: (ticket: Ticket | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  replaceMessage: (oldId: string, message: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  setHasMore: (hasMore: boolean) => void;
  setLoading: (loading: boolean) => void;
  resetTickets: () => void;
}

/**
 * Preserva a identidade do contato em merges de socket. Emits "magros" de
 * ticket:update/ticket:create mandam o ticket sem recarregar a associacao Contact,
 * e o normalizeTicket transforma os campos ausentes em "" (string vazia). Sem esta
 * defensiva, o spread `{ ...existing, ...incoming }` zera contact.number no ticket
 * ABERTO — o numero some do cabecalho e o envio WABA aborta com "wabaDataUnavailable"
 * ate o atendente re-selecionar o ticket (que re-hidrata via ShowTicketService).
 * Espelha a preservacao de whatsapp/user/queue: mantem os campos de identidade/exibicao
 * do contato existente quando o patch nao os traz, mas deixa um patch com dados reais
 * (emit recarregado via ShowTicketService) sobrescrever normalmente.
 */
// Transferencia de canal detectada com patch sem objeto whatsapp (o backend
// omite whatsapp nos ticket:update): resolve o canal novo pelo whatsapp-store
// (hidratado por REST) para nao perder badge/sendEvaluation nos tickets da
// lista; fallback = stub so com id (filtros/dedup continuam corretos).
function resolveWhatsappForTransfer(
  incomingWhatsappId: number | string | null | undefined,
  patchWhatsapp: Ticket["whatsapp"] | null | undefined
): Ticket["whatsapp"] | undefined {
  if (patchWhatsapp && typeof patchWhatsapp === "object") return patchWhatsapp;
  if (incomingWhatsappId == null) return undefined;
  const known = useWhatsappStore
    .getState()
    .whatsapps.find((w) => String(w.id) === String(incomingWhatsappId));
  if (known) {
    // Slim obrigatorio: a row do whatsapp-store vem do REST completo
    // (session/qrcode/tokens) e ticket.whatsapp e serializado de volta em
    // envios (FormData de midia) — segredos nunca entram no ticket.
    const k = known as unknown as Record<string, unknown>;
    return {
      id: k.id,
      name: (k.name as string) ?? "",
      type: k.type,
      status: k.status,
      sendEvaluation: k.sendEvaluation,
      hybridMode: k.hybridMode,
      linkedChannelId: k.linkedChannelId,
    } as unknown as Ticket["whatsapp"];
  }
  return { id: Number(incomingWhatsappId), name: "" } as unknown as Ticket["whatsapp"];
}

function mergeContactIdentity(incoming: Contact, existing: Contact | undefined): Contact {
  if (!existing) return incoming;
  return {
    ...incoming,
    number: incoming.number || existing.number,
    name: incoming.name && incoming.name !== "Sem nome" ? incoming.name : existing.name,
    email: incoming.email || existing.email,
    profilePicUrl: incoming.profilePicUrl || existing.profilePicUrl,
    instagramPK: incoming.instagramPK ?? existing.instagramPK,
    messengerId: incoming.messengerId ?? existing.messengerId,
    // Etiquetas: patch magro chega sem a chave (normalizeTicket a omite quando o
    // payload nao traz nem ticket.tags nem contact.tags) — preserva as ja
    // carregadas. Array vazio de um payload gordo continua limpando de verdade.
    tags: incoming.tags ?? existing.tags,
  };
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  currentTicket: null,
  messages: [],
  hasMore: true,
  loading: false,
  ticketListRefreshSignal: 0,
  signalTicketListRefresh: () => set((s) => ({ ticketListRefreshSignal: s.ticketListRefreshSignal + 1 })),
  currentTicketRefreshSignal: 0,
  signalCurrentTicketRefresh: () => set((s) => ({ currentTicketRefreshSignal: s.currentTicketRefreshSignal + 1 })),

  setTickets: (tickets) => set({ tickets: tickets.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i) }),

  addTicket: (ticket) =>
    set((state) => {
      const exists = state.tickets.find((t) => t.id === ticket.id);
      // Quando ja existe: mesma defensiva de updateTicket — emits "magros" do backend
      // (sem reload de queue/user/whatsapp) nao podem apagar associacoes carregadas via REST.
      const mergeDefensive = (existingTicket: Ticket): Ticket => {
        const merged: Ticket = { ...existingTicket, ...ticket };
        // Espelho da deteccao escalar do updateTicket: payload magro com
        // queueId/userId novos nao pode preservar fila/atendente antigos.
        const tkRawAdd = ticket as Partial<Ticket> & { queueId?: number | null; userId?: number | null };
        const incomingQueueIdAdd = tkRawAdd.queueId === undefined ? undefined : (tkRawAdd.queueId ?? null);
        const existingQueueIdAdd = existingTicket.queue?.id ?? null;
        const queueTransferDetectedAdd = incomingQueueIdAdd !== undefined && incomingQueueIdAdd !== existingQueueIdAdd;
        if (queueTransferDetectedAdd) {
          if (ticket.queue && ticket.queue.id === incomingQueueIdAdd) {
            merged.queue = ticket.queue;
          } else if (incomingQueueIdAdd === null) {
            merged.queue = undefined;
          } else {
            const meta = resolveQueueMeta(incomingQueueIdAdd);
            merged.queue = { id: incomingQueueIdAdd, name: meta?.name ?? "", color: meta?.color || "#666" };
          }
        } else if ((ticket.queue === undefined || ticket.queue === null) && existingTicket.queue) {
          merged.queue = existingTicket.queue;
        } else if (ticket.queue && existingTicket.queue && existingTicket.queue.id === ticket.queue.id) {
          merged.queue = {
            ...ticket.queue,
            name: ticket.queue.name || existingTicket.queue.name,
            color: (!ticket.queue.color || ticket.queue.color === "#666") ? existingTicket.queue.color : ticket.queue.color,
          };
        }
        const incomingUserIdAdd = tkRawAdd.userId === undefined ? undefined : (tkRawAdd.userId ?? null);
        const existingUserIdAdd = existingTicket.user?.id ?? null;
        const userTransferDetectedAdd = incomingUserIdAdd !== undefined && incomingUserIdAdd !== existingUserIdAdd;
        if (userTransferDetectedAdd) {
          if (ticket.user && ticket.user.id === incomingUserIdAdd) {
            merged.user = ticket.user;
          } else if (incomingUserIdAdd === null) {
            merged.user = undefined;
          } else {
            merged.user = { id: incomingUserIdAdd, name: "" };
          }
        } else if ((ticket.user === undefined || ticket.user === null) && existingTicket.user) {
          merged.user = existingTicket.user;
        }
        const incomingWhatsappId = (ticket as Partial<Ticket> & { whatsappId?: number | null }).whatsappId;
        const existingWhatsappRefId =
          existingTicket.whatsapp?.id ?? (existingTicket as { whatsappId?: number | null }).whatsappId;
        const whatsappTransferDetected =
          incomingWhatsappId != null &&
          existingWhatsappRefId != null &&
          String(incomingWhatsappId) !== String(existingWhatsappRefId);

        if (whatsappTransferDetected) {
          merged.whatsapp = resolveWhatsappForTransfer(incomingWhatsappId, ticket.whatsapp);
        } else if ((ticket.whatsapp === undefined || ticket.whatsapp === null) && existingTicket.whatsapp) {
          merged.whatsapp = existingTicket.whatsapp;
        } else if (
          ticket.whatsapp &&
          existingTicket.whatsapp &&
          (ticket.whatsapp.id == null || String(ticket.whatsapp.id) === String(existingTicket.whatsapp.id))
        ) {
          merged.whatsapp = { ...existingTicket.whatsapp, ...ticket.whatsapp };
        }
        // Mesma defensiva de mergeContactIdentity (vide updateTicket): patch magro
        // nao pode zerar number/identidade do contato no ticket aberto.
        if (ticket.contact) {
          merged.contact = mergeContactIdentity(ticket.contact, existingTicket.contact);
        }
        // Espelho da defensiva de etiquetas do updateTicket.
        if (ticket.tags === undefined && existingTicket.tags) {
          merged.tags = existingTicket.tags;
        }
        return merged;
      };
      // currentTicket sempre via mergeDefensive (mesmo quando o ticket nao esta
      // na lista): o payload de socket agora e magro (sem whatsapp completo) e
      // substituir cru apagaria tokenAPI/associacoes hidratadas do ticket aberto.
      const newCurrent = state.currentTicket?.id === ticket.id
        ? mergeDefensive(state.currentTicket)
        : state.currentTicket;
      // Lista e currentTicket nao podem divergir para o MESMO id: quando o
      // ticket nao existe na lista mas e o aberto, insere a versao merged.
      // Insert de ticket NOVO: ticket:update chega sem `whatsapp` (sanitizador do
      // backend deleta a associacao) e nao ha objeto hidratado a preservar —
      // resolve o canal pelo whatsapp-store via whatsappId para o card nascer com
      // o nome do canal (sem isso, o nome so aparecia apos F5).
      const insertTicket = !ticket.whatsapp
        ? {
            ...ticket,
            whatsapp: resolveWhatsappForTransfer(
              (ticket as Partial<Ticket> & { whatsappId?: number | null }).whatsappId,
              ticket.whatsapp
            ),
          }
        : ticket;
      const tickets = exists
        ? state.tickets.map((t) => (t.id === ticket.id ? mergeDefensive(t) : t))
        : [newCurrent && newCurrent.id === ticket.id ? newCurrent : insertTicket, ...state.tickets];
      // Espelho do bump de updateTicket: transferencia de canal no ticket aberto
      // chegando por addTicket tambem dispara re-hidratacao REST.
      const curAdd = state.currentTicket;
      const addIncomingWhatsappId = (ticket as Partial<Ticket> & { whatsappId?: number | null }).whatsappId;
      const addCurWhatsappRefId =
        curAdd?.whatsapp?.id ?? (curAdd as unknown as { whatsappId?: number | null } | null)?.whatsappId;
      const addChannelChanged =
        curAdd?.id === ticket.id &&
        addIncomingWhatsappId != null &&
        addCurWhatsappRefId != null &&
        String(addIncomingWhatsappId) !== String(addCurWhatsappRefId);
      return {
        tickets,
        currentTicket: newCurrent,
        ...(addChannelChanged
          ? { currentTicketRefreshSignal: state.currentTicketRefreshSignal + 1 }
          : {}),
      };
    }),

  updateTicket: (ticket) =>
    set((state) => {
      const merge = (existing: Ticket): Ticket => {
        const merged = { ...existing, ...ticket };
        // Defensiva: emits de ticket:update no fluxo de mensagem do backend mandam
        // o ticket sem reload das associacoes (queue/user/whatsapp). Quando o spread
        // sobrescreve com `undefined`, a badge da fila some, o atendente "desaparece"
        // e o canal some — voltando so com F5. Preserva os existentes quando o patch
        // nao traz a associacao; se o backend quer limpar de verdade, deve mandar null
        // explicitamente (tratado em ramos separados abaixo).
        //
        // Detecta transferencia via scalar queueId/userId: emit magro pode nao trazer
        // o objeto queue/user mas trazer o id raw. Se incoming.queueId difere do
        // existing.queue.id, e uma transferencia — NAO preserva o queue antigo, senao
        // o filtro de fila no /atendimento continua incluindo o ticket transferido ate F5.
        const tkRaw = ticket as Partial<Ticket> & { queueId?: number | null; userId?: number | null };
        const incomingQueueId = tkRaw.queueId === undefined ? undefined : (tkRaw.queueId ?? null);
        const existingQueueId = existing.queue?.id ?? null;
        const queueTransferDetected = incomingQueueId !== undefined && incomingQueueId !== existingQueueId;

        if (queueTransferDetected) {
          if (ticket.queue && ticket.queue.id === incomingQueueId) {
            merged.queue = ticket.queue;
          } else if (incomingQueueId === null) {
            merged.queue = undefined;
          } else {
            // queueId mudou mas o patch nao trouxe o objeto: resolve nome/cor pelo
            // cache de filas (lib/queue-cache) para a badge nao sumir; stub vazio so
            // se a fila for desconhecida ao front. O stub mantem o id para o filtro.
            const meta = resolveQueueMeta(incomingQueueId);
            merged.queue = { id: incomingQueueId, name: meta?.name ?? "", color: meta?.color || "#666" };
          }
        } else if ((ticket.queue === undefined || ticket.queue === null) && existing.queue) {
          merged.queue = existing.queue;
        } else if (ticket.queue && existing.queue && existing.queue.id === ticket.queue.id) {
          // Mesma queue: se patch trouxe dados incompletos (sem nome ou com cor default
          // "#666"), preserva nome/cor do existente. Caso tipico: socket emit "magro"
          // gera queue {id, name:"", color:"#666"}, que apagaria a badge se sobrescrito.
          merged.queue = {
            ...ticket.queue,
            name: ticket.queue.name || existing.queue.name,
            color: (!ticket.queue.color || ticket.queue.color === "#666") ? existing.queue.color : ticket.queue.color,
          };
        }

        const incomingUserId = tkRaw.userId === undefined ? undefined : (tkRaw.userId ?? null);
        const existingUserId = existing.user?.id ?? null;
        const userTransferDetected = incomingUserId !== undefined && incomingUserId !== existingUserId;

        if (userTransferDetected) {
          if (ticket.user && ticket.user.id === incomingUserId) {
            merged.user = ticket.user;
          } else if (incomingUserId === null) {
            merged.user = undefined;
          } else {
            merged.user = { id: incomingUserId, name: "" };
          }
        } else if ((ticket.user === undefined || ticket.user === null) && existing.user) {
          merged.user = existing.user;
        }

        // Detecta transferencia de canal via scalar whatsappId (o backend omite o
        // objeto whatsapp nos ticket:update): se o id mudou, NAO preserva o objeto
        // do canal antigo — senao tokenAPI/badge ficam do canal errado ate F5.
        const incomingWhatsappId = (tkRaw as { whatsappId?: number | null }).whatsappId;
        const existingWhatsappRefId =
          existing.whatsapp?.id ?? (existing as { whatsappId?: number | null }).whatsappId;
        const whatsappTransferDetected =
          incomingWhatsappId != null &&
          existingWhatsappRefId != null &&
          String(incomingWhatsappId) !== String(existingWhatsappRefId);

        if (whatsappTransferDetected) {
          merged.whatsapp = resolveWhatsappForTransfer(incomingWhatsappId, ticket.whatsapp);
        } else if ((ticket.whatsapp === undefined || ticket.whatsapp === null) && existing.whatsapp) {
          merged.whatsapp = existing.whatsapp;
        } else if (
          ticket.whatsapp &&
          existing.whatsapp &&
          (ticket.whatsapp.id == null || String(ticket.whatsapp.id) === String(existing.whatsapp.id))
        ) {
          merged.whatsapp = { ...existing.whatsapp, ...ticket.whatsapp };
        }
        // Preserva identidade do contato (number/name/email/foto/ids) quando o patch
        // vier "magro" — vide mergeContactIdentity. Critico p/ WABA: sem o number,
        // o cabecalho perde o numero e o envio aborta ate re-selecionar o ticket.
        if (ticket.contact) {
          merged.contact = mergeContactIdentity(ticket.contact, existing.contact);
        }
        // Etiquetas: patch sem a chave `tags` (emit magro, ou patch parcial de
        // lastMessage/unread do chat:create) nao pode apagar as etiquetas ja
        // carregadas — o chip sumia do card e o ticket caia do filtro de
        // etiqueta ate o F5. Array vazio explicito continua limpando.
        if (ticket.tags === undefined && existing.tags) {
          merged.tags = existing.tags;
        }
        return merged;
      };
      // Transferencia de canal no ticket aberto: dispara re-hidratacao REST (o
      // payload de socket nao traz tokenAPI do canal novo por desenho).
      const cur = state.currentTicket;
      const curIncomingWhatsappId = (ticket as Partial<Ticket> & { whatsappId?: number | null }).whatsappId;
      const curWhatsappRefId = cur?.whatsapp?.id ?? (cur as unknown as { whatsappId?: number | null } | null)?.whatsappId;
      const currentChannelChanged =
        cur?.id === ticket.id &&
        curIncomingWhatsappId != null &&
        curWhatsappRefId != null &&
        String(curIncomingWhatsappId) !== String(curWhatsappRefId);
      return {
        tickets: state.tickets.map((t) => t.id === ticket.id ? merge(t) : t),
        currentTicket: state.currentTicket?.id === ticket.id ? merge(state.currentTicket) : state.currentTicket,
        ...(currentChannelChanged
          ? { currentTicketRefreshSignal: state.currentTicketRefreshSignal + 1 }
          : {}),
      };
    }),

  removeTicket: (id) =>
    set((state) => ({
      tickets: state.tickets.filter((t) => t.id !== id),
      currentTicket: state.currentTicket?.id === id ? null : state.currentTicket,
    })),

  setCurrentTicket: (ticket) => set({ currentTicket: ticket }),
  setMessages: (messages) => set({ messages: messages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i) }),

  addMessage: (message) =>
    set((state) => {
      const exists = state.messages.find((m) => m.id === message.id);
      if (exists) {
        return {
          messages: state.messages.map((m) =>
            m.id === message.id ? { ...m, ...message } : m
          ),
        };
      }
      return { messages: [...state.messages, message] };
    }),

  replaceMessage: (oldId, message) =>
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === oldId);
      if (idx === -1) {
        const exists = state.messages.find((m) => m.id === message.id);
        if (exists) {
          return { messages: state.messages.map((m) => m.id === message.id ? { ...m, ...message } : m) };
        }
        return { messages: [...state.messages, message] };
      }
      const updated = [...state.messages];
      // Carry over stableKey so React key stays the same (no unmount/remount flicker).
      // stableKey vai DEPOIS do spread: a key antiga tem prioridade e nunca é
      // sobrescrita por um stableKey ausente/undefined no message recebido.
      updated[idx] = { ...message, stableKey: state.messages[idx].stableKey ?? message.stableKey ?? oldId };
      return { messages: updated };
    }),

  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) => m.id === id ? { ...m, ...patch } : m),
    })),

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),

  setHasMore: (hasMore) => set({ hasMore }),
  setLoading: (loading) => set({ loading }),

  resetTickets: () =>
    set({
      tickets: [],
      currentTicket: null,
      messages: [],
      hasMore: true,
      loading: false,
    }),
}));
