import type { TicketFilterSnapshot } from "@/stores/ticket-filter-store";

// Forma minima do ticket que o helper precisa avaliar. Aceita tanto Ticket do
// store quanto payloads crus de socket (que podem nao trazer queue/whatsapp aninhados).
export interface MatchesFilterTicket {
  id?: number;
  status?: string;
  unreadMessages?: number;
  createdAt?: string;
  user?: { id?: number } | null;
  queue?: { id?: number } | null;
  queueId?: number | null;
  whatsapp?: { id?: number } | null;
  whatsappId?: number | null;
  tags?: { id?: number }[];
  contact?: { kanban?: number | string } | null;
}

export interface MatchesFilterUser {
  userId?: number;
  profile?: string;
}

export interface MatchesFilterConfig {
  isAdminLike: boolean;
  notViewAssignedTickets: boolean;
}

// Espelha o pipeline de baseFilteredTickets em atendimento/page.tsx (linhas 3722-3842).
// Usado pelos hooks de socket para decidir se um ticket recebido deve entrar no store.
// Mantem a escapatoria do "ticket proprio fora da fila" para preservar comportamento
// historico (usuario dono do ticket continua vendo o proprio ticket mesmo filtrando
// por outra fila).
export function matchesActiveFilter(
  ticket: MatchesFilterTicket,
  filter: TicketFilterSnapshot,
  user: MatchesFilterUser,
  config: MatchesFilterConfig,
): boolean {
  if (!filter.active) return true;

  if (filter.selectedWhatsappIds.length > 0) {
    const wid = ticket.whatsapp?.id ?? ticket.whatsappId ?? null;
    if (wid == null || !filter.selectedWhatsappIds.includes(wid)) return false;
  }

  if (filter.selectedQueueIds.length > 0) {
    const qid = ticket.queue?.id ?? ticket.queueId ?? null;
    const matchesQueue = qid != null && filter.selectedQueueIds.includes(qid);
    // Escapatoria: nao-admin com NotViewAssignedTickets desligado ve o proprio ticket
    // mesmo fora da fila filtrada (espelha o OR userId do REST). Mantem comportamento
    // historico — usuario dono nao "perde" o ticket ao ativar um filtro de outra fila.
    const matchesSelf =
      !config.isAdminLike &&
      !config.notViewAssignedTickets &&
      user.userId != null &&
      ticket.user?.id === user.userId;
    if (!matchesQueue && !matchesSelf) return false;
  }

  if (filter.selectedUserIds.length > 0) {
    const userIdSet = new Set(
      filter.selectedUserIds.map(Number).filter(Number.isFinite),
    );
    if (ticket.user?.id == null || !userIdSet.has(ticket.user.id)) return false;
  }

  if (filter.selectedTagIds.length > 0) {
    const tagIdSet = new Set(
      filter.selectedTagIds.map(Number).filter(Number.isFinite),
    );
    const tags = ticket.tags ?? [];
    if (!tags.some((tg) => tg.id != null && tagIdSet.has(tg.id))) return false;
  }

  if (filter.selectedKanbanIds.length > 0) {
    const kanbanIdSet = new Set(
      filter.selectedKanbanIds.map(Number).filter(Number.isFinite),
    );
    const k = ticket.contact?.kanban;
    const n = typeof k === "number" ? k : k != null ? Number(k) : NaN;
    if (!Number.isFinite(n) || !kanbanIdSet.has(n)) return false;
  }

  if (filter.withUnreadMessages && (ticket.unreadMessages ?? 0) <= 0) {
    return false;
  }

  if (filter.dateFrom || filter.dateTo) {
    const fromMs = filter.dateFrom ? new Date(filter.dateFrom).getTime() : -Infinity;
    const toMs = filter.dateTo ? new Date(`${filter.dateTo}T23:59:59`).getTime() : Infinity;
    const created = ticket.createdAt ? new Date(ticket.createdAt).getTime() : NaN;
    // Espelha lenidade do REST: ticket sem data passa
    if (Number.isFinite(created) && (created < fromMs || created > toMs)) return false;
  }

  return true;
}
