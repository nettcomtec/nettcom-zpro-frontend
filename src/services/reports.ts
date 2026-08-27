import api from "@/lib/api";

// Contacts report - used by all contact-based reports
// Params: startDate, endDate, tags[], ddds[], kanban[], wallets[]
export async function fetchReportContacts(params: Record<string, unknown>) {
  return api.get("/contacts-report", { params });
}

// Tickets/atendimentos report
// Params: startDate, endDate, status[], queues[], channel[], reasons[], whatsappId[], userId, valueMin, valueMax
// supervisorQueuesFilter=true → backend restricts to supervisor's queues when profile=super
export async function fetchReportTickets(params: Record<string, unknown>) {
  return api.get("/tickets-report", { params: { ...params, supervisorQueuesFilter: true } });
}

// Statistics per users (resumo atendimentos usuários)
// Params: startDate, endDate
// supervisorQueuesFilter=true → backend restricts to supervisor's queues when profile=super
export async function fetchReportUserStats(params: Record<string, unknown>) {
  return api.get("/statistics-per-users", { params: { ...params, supervisorQueuesFilter: true } });
}

// Produtividade diária — recorta o período pela data da INTERAÇÃO (mensagem
// manual do operador / fechamento), não pela data de criação do ticket como os
// demais relatórios. tzOffset = minutos a somar ao UTC para o corte do "dia".
export interface DailyProductivityDayRow {
  day: string;
  userId: number;
  name: string | null;
  email: string | null;
  attended: number;
  started: number;
  resolved: number;
  messages: number;
}

export interface DailyProductivityUserRow {
  userId: number;
  name: string | null;
  email: string | null;
  attended: number;
  started: number;
  resolved: number;
  messages: number;
  activeDays: number;
}

export interface DailyProductivityReport {
  range: { start: string; end: string; tzOffset: number };
  byDay: DailyProductivityDayRow[];
  byUser: DailyProductivityUserRow[];
  totals: {
    attended: number;
    started: number;
    resolved: number;
    messages: number;
    users: number;
  };
}

export async function fetchDailyProductivity(params: {
  startDate: string;
  endDate: string;
  userId?: number;
}): Promise<{ data: DailyProductivityReport }> {
  return api.get("/statistics-daily-productivity", {
    params: {
      ...params,
      tzOffset: -new Date().getTimezoneOffset(),
      supervisorQueuesFilter: true,
    },
  });
}

// Legacy aliases kept for backward compatibility
export async function fetchReportContactsByTags(params: Record<string, unknown>) {
  return fetchReportContacts(params);
}

export async function fetchReportContactsByState(params: Record<string, unknown>) {
  return fetchReportContacts(params);
}

export async function fetchReportContactsByKanban(params: Record<string, unknown>) {
  return fetchReportContacts(params);
}

export async function fetchReportContactsByWallet(params: Record<string, unknown>) {
  return fetchReportContacts(params);
}

export async function fetchReportTicketsByParams(params: Record<string, unknown>) {
  return fetchReportTickets(params);
}
