import api from "@/lib/api";
import { z } from "zod";
import { logger } from "@/lib/logger";
// WABA: o texto do atendente que esperava para juntar sai antes de mudar o atendimento
// (encerrar, transferir, fluxo, canal, agente de IA). Sem texto esperando, resolve na hora.
import { flushPendingWabaText } from "@/lib/waba-agent-grouping";

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

/** Atendimento trazido de outro servidor (migração de empresa) achado pelo número antigo. */
export interface LegacyTicketMatch {
  ticketId: number;
  oldId: string;
  legacyProtocol: string | null;
  migratedAt: string;
  status: string | null;
  contactName: string | null;
}

/**
 * Busca pelo número ou protocolo que o atendimento tinha no servidor anterior (aviso
 * acima da lista do atendimento). O servidor só devolve o que o usuário pode abrir.
 * Backend sem a rota (404), erro ou resposta fora do formato = [] em silêncio.
 */
export async function lookupLegacyTickets(term: string): Promise<LegacyTicketMatch[]> {
  try {
    const { data } = await api.get("/tickets-legacy-lookup", {
      params: { term },
      skipFeatureToast: true,
    });
    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[])
      .filter((item) => item && Number(item.ticketId) > 0 && item.oldId != null)
      .map((item) => ({
        ticketId: Number(item.ticketId),
        oldId: String(item.oldId),
        legacyProtocol: item.legacyProtocol ? String(item.legacyProtocol) : null,
        migratedAt: String(item.migratedAt ?? ""),
        status: item.status ? String(item.status) : null,
        contactName: item.contactName ? String(item.contactName) : null,
      }));
  } catch {
    return [];
  }
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
  /** true = o usuário não abre este irmão: o servidor omitiu atendente e fila (mostrar "outro atendente"). */
  ownerHidden?: boolean;
  /** false = o usuário não abre este irmão (com ou sem atendente): sem "Abrir" nem "Assumir". */
  accessible?: boolean;
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
  await flushPendingWabaText(ticketId);
  return api.put(`/tickets/${ticketId}`, data);
}

/**
 * Fechamento em que o atendimento foi encerrado mas a mensagem de despedida do canal
 * não saiu (o provedor recusou ou estava fora): o backend responde 200 com
 * `farewellError` aditivo. Backend anterior não manda o campo.
 */
export function farewellFailed(res: unknown): boolean {
  const data = (res as { data?: { farewellError?: unknown } } | null)?.data;
  return typeof data?.farewellError === "string" && data.farewellError.length > 0;
}

/**
 * Botão "Desligar agente de IA": solta o agente deste atendimento e grava a nota
 * (`note`, no idioma da tela). `released: false` = o agente já tinha saído.
 * Backend anterior à rota (404 sem código de erro): desliga a IA do atendimento
 * pelo PUT de sempre — o agente só responde com ela ligada (sem nota nesse caso).
 */
export async function releaseTicketAiAgent(
  ticketId: number,
  note?: string
): Promise<{ released: boolean }> {
  await flushPendingWabaText(ticketId);
  try {
    const { data } = await api.post(`/tickets/${ticketId}/ai-agent/release`, { note });
    return { released: data?.released === true };
  } catch (err) {
    const e = err as { status?: number; response?: { status?: number }; data?: unknown };
    const status = e?.status ?? e?.response?.status;
    const code = (e?.data as { error?: unknown } | undefined)?.error;
    const isRouteMissing = status === 404 && !(typeof code === "string" && code.startsWith("ERR_"));
    if (!isRouteMissing) throw err;
    await updateTicket(ticketId, { chatgptStatus: false });
    return { released: true };
  }
}

/**
 * Pausar/Retomar o agente de IA SÓ neste atendimento (PUT de sempre com `botStopped`).
 * O backend novo responde o ticket com os campos aditivos `botStopped` e
 * `aiAgentPaused`:
 * - `aiAgentPaused: true`  → `ok` (a pausa/retomada mexeu no agente);
 * - `aiAgentPaused: false` → `noEffect` (gravou só o `botStopped`: o agente já tinha
 *   saído/calado por outro caminho, ou não há marca de pausa para retomar);
 * - chave AUSENTE → backend antigo, que só para o fluxo: na pausa o `botStopped` é
 *   desfeito (melhor esforço) para não deixar o atendimento marcado sem efeito no
 *   agente, e volta `needsUpdate`.
 * `botStopped` = valor que ficou gravado (o da resposta quando vem, senão o pedido).
 * Erro HTTP é relançado como veio do interceptor (403 de acesso: `handleTicketAccessDenied`).
 */
export async function setTicketAiAgentPaused(
  ticketId: number,
  paused: boolean
): Promise<{ status: "ok" | "needsUpdate" | "noEffect"; botStopped?: boolean }> {
  const { data } = await updateTicket(ticketId, { botStopped: paused });
  const body = (data ?? {}) as { aiAgentPaused?: unknown; botStopped?: unknown };
  const botStopped = typeof body.botStopped === "boolean" ? body.botStopped : paused;
  if (body.aiAgentPaused === true) return { status: "ok", botStopped };
  if (body.aiAgentPaused === false) return { status: "noEffect", botStopped };
  if (!paused) return { status: "needsUpdate", botStopped: false };
  try {
    await updateTicket(ticketId, { botStopped: false });
    return { status: "needsUpdate", botStopped: false };
  } catch {
    return { status: "needsUpdate", botStopped: true };
  }
}

export async function updateTicketForce(ticketId: number, status: string, userId: number) {
  await flushPendingWabaText(ticketId);
  return api.put(`/ticketsForce/${ticketId}`, { status, userId });
}

export async function transferTicketChannel(ticketId: number, data: { channel: string; whatsappId: number }) {
  await flushPendingWabaText(ticketId);
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
  await flushPendingWabaText(ticketId);
  return api.put(`/ticketsChatBot/${ticketId}`, { chatFlowId });
}

export async function transferToChannel(ticketId: number, data: { channel: string; whatsappId: number }) {
  await flushPendingWabaText(ticketId);
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
