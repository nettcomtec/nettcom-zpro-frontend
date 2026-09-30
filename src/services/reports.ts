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

// Relatórios de relacionamento (PLANO_CRM_CONTATO D21). Mesmo corte de período da
// produtividade diária: startDate/endDate no dia local + tzOffset. Backend sem as
// rotas responde 404 — as telas mostram o estado de erro.
export interface CrmReportParams {
  startDate: string;
  endDate: string;
  userId?: number;
}

function crmReportParams(params: CrmReportParams) {
  return { ...params, tzOffset: -new Date().getTimezoneOffset() };
}

export interface RelationshipByTypeRow {
  userId: number | null;
  userName: string | null;
  typeId: number;
  typeName: string | null;
  count: number;
}

export interface RelationshipByTypeTotal {
  typeId: number;
  typeName: string | null;
  count: number;
}

export interface RelationshipByTypeReport {
  rows: RelationshipByTypeRow[];
  totalsByType: RelationshipByTypeTotal[];
  total: number;
}

export async function fetchRelationshipByTypeReport(
  params: CrmReportParams
): Promise<{ data: RelationshipByTypeReport }> {
  return api.get("/statistics-relationship-by-type", { params: crmReportParams(params) });
}

export interface TasksByUserRow {
  userId: number | null;
  userName: string | null;
  pending: number;
  completed: number;
  overdue: number;
  total: number;
}

export interface TasksByUserReport {
  rows: TasksByUserRow[];
}

export async function fetchTasksByUserReport(
  params: CrmReportParams
): Promise<{ data: TasksByUserReport }> {
  return api.get("/statistics-tasks-by-user", { params: crmReportParams(params) });
}

export interface FunnelByUserRow {
  userId: number | null;
  userName: string | null;
  won: number;
  lost: number;
  wonValue: number;
  lostValue: number;
  conversion: number | null;
}

export interface FunnelByUserReport {
  rows: FunnelByUserRow[];
  /** Oportunidades fechadas sem data de fechamento — ficam fora do período. */
  withoutCloseDate: number;
}

export async function fetchFunnelByUserReport(
  params: CrmReportParams
): Promise<{ data: FunnelByUserReport }> {
  return api.get("/statistics-funnel-by-user", { params: crmReportParams(params) });
}

export interface ActionsUntilSaleRow {
  typeId: number;
  typeName: string | null;
  total: number;
  average: number;
}

export interface ActionsUntilSaleReport {
  /** Oportunidades ganhas no período. */
  opportunities: number;
  rows: ActionsUntilSaleRow[];
}

export async function fetchActionsUntilSaleReport(
  params: CrmReportParams
): Promise<{ data: ActionsUntilSaleReport }> {
  return api.get("/statistics-actions-until-sale", { params: crmReportParams(params) });
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
