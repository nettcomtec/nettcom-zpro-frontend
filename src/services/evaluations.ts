import api from "@/lib/api";

export interface TicketEvaluation {
  id: number;
  ticketId: number;
  evaluation: number;
  /** 'native' = nota do cliente. 'external' = link externo enviado (sem retorno). */
  type?: string;
  /** URL externa efetivamente enviada (com variáveis resolvidas). */
  externalUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Agente fotografado no momento da avaliação (TicketEvaluation.userId) — fonte canônica, igual ao relatório NPS. */
  user?: { id: number; name: string };
  ticket?: {
    id: number;
    contact?: { id: number; name: string; number: string };
    user?: { id: number; name: string };
  };
}

export interface EvaluationsResponse {
  data: TicketEvaluation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EvaluationFilters {
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  evaluation?: number;
}

export interface RatingItem {
  rating: number;
  label: string;
  message: string;
}

export interface EvaluationConfig {
  id: number;
  rating: RatingItem[];
  ratingStore: string;
  ratingStoreError: string;
  ratingStoreAttemp: string;
  ratingStoreTime: string;
  ratingStoreUse: string;
  ratingPrivacy: string;
  ratingMaxScore: number;
  ratingPromoterMin?: number;
  ratingDetractorMax?: number;
  /** 'native' = nota nativa (escala). 'link' = link externo. Default 'native'. */
  ratingMode?: string;
  /** URL externa (modo 'link'); aceita variáveis {protocolo} {ticketId} {contato} {numero} {atendente}. */
  ratingExternalUrl?: string;
  /**
   * Comportamento do chat DEPOIS que a pesquisa de satisfação é enviada (ao Resolver).
   * 'ask' (padrão) = pergunta ao atendente (modal atual); 'closeOnResolve' = fecha na hora;
   * 'waitClientReply' = mantém aberto até o cliente responder; 'timer' = mantém aberto e fecha
   * sozinho após ratingCloseTimerMinutes sem resposta.
   */
  ratingCloseBehavior?: string;
  /** Minutos de tolerância do modo 'timer' antes do fechamento automático. */
  ratingCloseTimerMinutes?: number;
}

export interface NpsSummary {
  total: number;
  csatAvg: number;
  promoters: number;
  neutrals: number;
  detractors: number;
  promoterPct: number;
  neutralPct: number;
  detractorPct: number;
  nps: number;
}

export interface NpsDistributionItem {
  score: number;
  count: number;
  pct: number;
}

export interface NpsTrendItem {
  period: string;
  total: number;
  promoters: number;
  neutrals: number;
  detractors: number;
  promoterPct: number;
  neutralPct: number;
  detractorPct: number;
  nps: number;
}

export interface NpsGroupItem {
  id: number | null;
  name: string;
  type?: string;
  total: number;
  csatAvg: number;
  promoters: number;
  neutrals: number;
  detractors: number;
  promoterPct: number;
  detractorPct: number;
  nps: number;
}

export interface NpsReport {
  cutoffs: { promoterMin: number; detractorMax: number; maxScore: number; granularity: string };
  summary: NpsSummary;
  distribution: NpsDistributionItem[];
  trend: NpsTrendItem[];
  byAgent: NpsGroupItem[];
  byQueue: NpsGroupItem[];
  byChannel: NpsGroupItem[];
  responseRate: { closed: number; answered: number; rate: number };
}

export async function fetchEvaluations(filters: EvaluationFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  // Checagem explícita: 0 é nota legítima da escala e a checagem falsy a descartava
  if (filters.evaluation !== undefined) params.set("evaluation", String(filters.evaluation));
  return api.get<EvaluationsResponse>(`/ticketEvaluations?${params.toString()}`);
}

export async function deleteEvaluation(id: number) {
  return api.delete(`/ticketEvaluations/${id}`);
}

export async function fetchNpsReport(filters: { startDate?: string; endDate?: string; granularity?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.granularity) params.set("granularity", filters.granularity);
  const qs = params.toString();
  return api.get<NpsReport>(`/ticketEvaluations/report${qs ? `?${qs}` : ""}`);
}

export async function fetchEvaluationConfig() {
  return api.get<EvaluationConfig[]>("/tenants/rating/");
}

export async function updateRatings(data: RatingItem[]) {
  return api.put("/tenants/rating/", data);
}

export async function updateTenantRatingData(tenantId: number, data: Record<string, unknown>) {
  return api.put(`/tenantsRatingData/${tenantId}`, data);
}

export async function createEvaluation(payload: { evaluation: string; attempts: number; ticketId: number; type?: string; externalUrl?: string }) {
  return api.post("/ticketEvaluations", payload);
}

/**
 * Resolve variáveis no template de URL externa de avaliação.
 * Sintaxe padrão da plataforma (pupa/mustache): chave DUPLA — {{protocolo}} {{ticketId}}
 * {{contato}} {{numero}} {{atendente}} (espaços internos tolerados). Valores URL-encoded.
 * {{protocolo}} usa o protocolo do ticket se existir; senão cai pro ticketId.
 */
export function resolveExternalRatingUrl(
  template: string,
  ctx: { ticketId?: number | string; protocol?: string | null; contactName?: string | null; contactNumber?: string | null; agentName?: string | null }
): string {
  const enc = (v: unknown) => encodeURIComponent(String(v ?? "").trim());
  const ticketId = ctx.ticketId != null ? String(ctx.ticketId) : "";
  const protocolo = (ctx.protocol && String(ctx.protocol).trim()) || ticketId;
  return String(template || "")
    .replace(/\{\{\s*protocolo\s*\}\}/gi, enc(protocolo))
    .replace(/\{\{\s*ticketId\s*\}\}/gi, enc(ticketId))
    .replace(/\{\{\s*contato\s*\}\}/gi, enc(ctx.contactName))
    .replace(/\{\{\s*numero\s*\}\}/gi, enc(ctx.contactNumber))
    .replace(/\{\{\s*atendente\s*\}\}/gi, enc(ctx.agentName));
}

export async function fetchEvaluationLogs(ticketId: number) {
  return api.get(`/ticketEvaluations/${ticketId}/logs`);
}

/** Atualiza o registro de avaliação pelo ticketId (equivalente ao AlterarAvaliacao do front legado) */
export async function updateEvaluationByTicket(ticketId: number, data: { attempts?: number; evaluation?: string }) {
  return api.put(`/ticketEvaluations/${ticketId}`, { ...data, id: ticketId, ticketId });
}
