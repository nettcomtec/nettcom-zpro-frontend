import api from "@/lib/api";

// ─── Raw API shapes ───────────────────────────────────────────────────────────

export interface RawTicketsTimes {
  qtd_total_atendimentos?: number | null;
  qtd_demanda_ativa?: number | null;
  qtd_demanda_receptiva?: number | null;
  new_contacts?: number | null;
  tma?: DurationParts | null;
  tme?: DurationParts | null;
  tpr?: DurationParts | null;
  tte?: DurationParts | null;
}

// Intervalo do Postgres parseado pelo driver (campos ausentes = 0). Backends
// antigos emitem só hours/minutes; os novos incluem seconds.
export interface DurationParts {
  hours?: number;
  minutes?: number;
  seconds?: number;
}

// All chart endpoints return arrays of { label, qtd }
// (o endpoint de motivos devolve a coluna como `name` em vez de `label`)
export interface RawStat {
  label?: string;
  name?: string;
  qtd?: number | string;
}

// Cross-tab motivos × fila: cada linha = um par (fila, motivo) com a contagem
export interface RawReasonByQueue {
  queue?: string;
  reason?: string;
  qtd?: number | string;
}

// Status endpoint returns { status, qtd }
export interface RawStatusStat {
  status?: string;
  qtd?: number | string;
}

// Per-user detail
export interface RawUserDetail {
  name?: string | null;
  email?: string | null;
  qtd_pendentes?: number | null;
  qtd_em_atendimento?: number | null;
  qtd_resolvidos?: number | null;
  qtd_por_usuario?: number | null;
  media_avaliacao?: number | null;
  tma?: DurationParts | null;
  tme?: DurationParts | null;
  tpr?: DurationParts | null;
  tte?: DurationParts | null;
}

// Evolution channels: { dt_referencia, label, qtd }
export interface RawEvolutionChannel {
  dt_referencia?: string;
  label?: string;
  qtd?: number | string;
}

// ─── Normalised shapes used by components ──────────────────────────────────

export interface DashboardStats {
  totalTickets?: number;
  activeTickets?: number;
  receptiveTickets?: number;
  newContacts?: number;
  tma?: string;
  tme?: string;
  tpr?: string;
  tte?: string;
}

export interface ChartItem {
  label: string;
  qtd: number;
}

export interface EvolutionItem {
  label: string;
  qtd: number;
}

export interface EvolutionChannelItem {
  dt_referencia: string;
  label: string;
  qtd: number;
}

export interface UserDetail {
  name: string;
  email: string;
  pending: number;
  open: number;
  closed: number;
  total: number;
  avgRating: number;
  tma: string;
  tme: string;
  tpr: string;
  tte: string;
}

export interface DashboardDateRange {
  startDate: string;
  endDate: string;
  isGroup?: string | boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayRange(): DashboardDateRange {
  const now = new Date();
  return { startDate: formatDate(now), endDate: formatDate(now), isGroup: false };
}

function ensureIsGroup(range: DashboardDateRange): DashboardDateRange {
  return { ...range, isGroup: range.isGroup ?? false };
}

export function formatDuration(d?: DurationParts | null): string {
  if (!d) return "0min";
  const h = d.hours ?? 0;
  const m = d.minutes ?? 0;
  const s = Math.round(d.seconds ?? 0);
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  // Abaixo de 1h os segundos importam: média rápida deixava de aparecer como
  // "0min" mesmo com a equipe respondendo (indicadores TPR/TTE).
  if (m > 0) return s > 0 ? `${m}min ${s}s` : `${m}min`;
  if (s > 0) return `${s}s`;
  return "0min";
}

export function normaliseQtd(v?: number | string | null): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchDashboardStats(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawTicketsTimes[]>("/statistics-tickets-times", { params });
}

export async function fetchDashboardTicketsQueues(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawStat[]>("/statistics-tickets-queue", { params });
}

export async function fetchDashboardTicketsUsers(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawStat[]>("/statistics-tickets-user", { params });
}

export async function fetchDashboardTicketsStatus(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawStatusStat[]>("/statistics-tickets-status", { params });
}

export async function fetchDashboardTicketsChannels(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawStat[]>("/statistics-tickets-channels", { params });
}

export async function fetchDashboardEvolutionByPeriod(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawStat[]>("/statistics-tickets-evolution-by-period", { params });
}

export async function fetchDashboardEvolutionChannels(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawEvolutionChannel[]>("/statistics-tickets-evolution-channels", { params });
}

export async function fetchDashboardEvolutionChannelsName(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawStat[]>("/statistics-tickets-evolution-channels-name", { params });
}

export async function fetchDashboardPerformance(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawUserDetail[]>("/statistics-tickets-per-users-detail", { params });
}

export async function fetchDashboardReasons(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawStat[]>("/statistics-tickets-reasons", { params });
}

export async function fetchDashboardReasonsByQueue(range?: DashboardDateRange) {
  const params = ensureIsGroup(range || todayRange());
  return api.get<RawReasonByQueue[]>("/statistics-tickets-reasons-by-queue", { params });
}

// ─── Legacy aliases kept for backward compatibility ───────────────────────────
export const fetchDashboardEvolution = fetchDashboardEvolutionByPeriod;
export const fetchDashboardQueuesReport = () => api.get("/dash-tickets-queues");
export const fetchStatisticsPerUsers = () => api.get("/statistics-per-users");

// ─── Legacy types kept for backward compatibility ─────────────────────────────
export type QueueStat = ChartItem;
export type UserStat = ChartItem;
export type StatusStat = RawStatusStat;
export type ChannelStat = RawStat;
export type EvolutionPoint = EvolutionItem;
