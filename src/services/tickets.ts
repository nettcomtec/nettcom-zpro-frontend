import api from "@/lib/api";
import { z } from "zod";
import { logger } from "@/lib/logger";

export interface TicketFilters {
  searchParam?: string;
  pageNumber?: number;
  status?: string[];
  showAll?: boolean;
  count?: number | null;
  queuesIds?: number[];
  whatsappIds?: number[];
  selectedUser?: number[];
  withUnreadMessages?: boolean;
  isNotAssignedUser?: boolean;
  includeNotQueueDefined?: boolean;
  date?: string;
  tagIds?: number[];
  kanbanIds?: number[];
  includeClosed?: boolean;
  /** true = ASC (mais antigos primeiro); padrão DESC */
  orderAsc?: boolean;
  /** Filtrar apenas tickets pausados */
  isPaused?: string;
  /** Supervisor vê apenas tickets das suas filas (departamento) */
  supervisorViewDept?: string;
  /** Filtrar por período: data início (YYYY-MM-DD) */
  dateFrom?: string;
  /** Filtrar por período: data fim (YYYY-MM-DD) */
  dateTo?: string;
}

const DEFAULT_FILTERS: TicketFilters = {
  searchParam: "",
  pageNumber: 1,
  status: ["open", "pending"],
  showAll: false,
  count: null,
  queuesIds: [],
  whatsappIds: [],
  selectedUser: [],
  withUnreadMessages: false,
  isNotAssignedUser: false,
  includeNotQueueDefined: true,
};

export const ticketListResponseSchema = z.object({
  tickets: z.array(z.record(z.unknown())),
  hasMore: z.boolean(),
  count: z.number().optional(),
});

export async function fetchTickets(filters?: Partial<TicketFilters>) {
  const params = { ...DEFAULT_FILTERS, ...filters };
  const response = await api.get("/tickets-frontnovo", { params });
  if (process.env.NODE_ENV !== "production") {
    const parsed = ticketListResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      logger.warn("[tickets] fetchTickets response schema mismatch:", parsed.error.flatten());
    }
  }
  return response;
}

export async function fetchTicket(ticketId: number) {
  return api.get(`/tickets/${ticketId}`);
}

/** Item enviado ao check batelado de irmãos (aba Pendentes / Fechados / pré-check). */
export interface CrossChannelSiblingItem {
  ticketId: number;
  number: string;
  whatsappId: number;
}

/** Ticket "irmão" open/pending do mesmo contato (outro canal ou o mesmo). */
export interface CrossChannelSibling {
  ticketId: number;
  status: string;
  whatsappId: number | null;
  whatsappName: string | null;
  ownerId: number | null;
  ownerName: string | null;
  queueName: string | null;
  contactName?: string | null;
  /** true = irmão no MESMO canal do ticket consultado (duplicata direta). */
  sameChannel?: boolean;
}

/**
 * Consulta batelada dos irmãos open/pending do mesmo contato.
 * - Irmãos em OUTROS canais: gated pela flag do tenant crossChannelTicketCheck
 *   (desligada → backend devolve `{ siblings: {} }` para esse escopo).
 * - `includeSameChannel`: inclui também o irmão no MESMO canal (duplicata direta,
 *   ex.: reabrir fechado com outro atendimento aberto no mesmo canal). Não é
 *   gated pela flag.
 */
export async function fetchCrossChannelSiblings(
  items: CrossChannelSiblingItem[],
  opts?: { includeSameChannel?: boolean }
) {
  return api.post<{ siblings: Record<number, CrossChannelSibling[]> }>(
    "/ticketscross-channel-siblings",
    { items, ...(opts?.includeSameChannel ? { includeSameChannel: true } : {}) }
  );
}

export async function fetchTicketLogs(ticketId: number) {
  return api.get(`/tickets/${ticketId}/logs`);
}

export async function updateTicket(ticketId: number, data: Record<string, unknown>) {
  return api.put(`/tickets/${ticketId}`, data);
}

export async function updateTicketForce(ticketId: number, status: string, userId: number) {
  return api.put(`/ticketsForce/${ticketId}`, { status, userId });
}

export async function transferTicketChannel(ticketId: number, data: { channel: string; whatsappId: number }) {
  return api.put(`/ticketsChannelId/${ticketId}`, data);
}

export async function transferAllTicketsChannel(data: {
  whatsappId: number;
  newWhatsappId: number;
  channel: string;
  newChannel: string;
  tenantId: number;
  processAll?: boolean;
  limit?: number;
  offset?: number;
}) {
  return api.put(`/ticketsChannel`, data);
}

export async function deleteTicket(ticketId: number) {
  return api.delete(`/tickets/${ticketId}`);
}

export async function createTicket(data: Record<string, unknown>) {
  return api.post("/tickets", data);
}

export async function pauseTicket(ticketId: number, pauseReason?: string) {
  return api.post(`/ticketsPause/${ticketId}/pause`, { pauseReason });
}

export async function replyTicketViaChannel(
  ticketId: number,
  data: { targetWhatsappId: number; body?: string }
) {
  return api.post(`/tickets/${ticketId}/reply-via-channel`, data);
}

export async function linkTicketParent(childTicketId: number, parentTicketId: number) {
  return api.post(`/tickets/${childTicketId}/link-parent`, { parentTicketId });
}

export async function resumeTicket(ticketId: number) {
  return api.post(`/ticketsPause/${ticketId}/pause/end`);
}

export async function transferToChatbot(ticketId: number, chatFlowId: number) {
  return api.put(`/ticketsChatBot/${ticketId}`, { chatFlowId });
}

export async function transferToChannel(ticketId: number, data: { channel: string; whatsappId: number }) {
  return api.put(`/ticketsChannelId/${ticketId}`, data);
}

export async function fetchTicketShared(ticketId: number) {
  return api.get(`/ticket-shareds/ticket/${ticketId}`);
}

export async function createTicketShared(data: Record<string, unknown>) {
  return api.post("/ticket-shared", data);
}

export async function updateTicketShared(id: number, data: Record<string, unknown>) {
  return api.put(`/ticket-shared/${id}`, data);
}

export async function deleteTicketShared(id: number) {
  return api.delete(`/ticket-shared/${id}`);
}

export async function updateUserStatus(userId: number, isOnline: boolean) {
  return api.put(`/users/${userId}`, { isOnline });
}

/** Marca todas as mensagens de tickets como lidas (front legado: AtualizarTodasMensagensNaoLidas) */
export async function updateAllUnreadMessages() {
  return api.put("/ticketsUpdateAllUnreadMessages");
}

/** Convites: tickets compartilhados com o usuário atual */
export async function fetchTicketSharedByUser() {
  return api.get("/ticket-shared-user/user");
}
