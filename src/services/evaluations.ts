import api from "@/lib/api";

export interface TicketEvaluation {
  id: number;
  ticketId: number;
  /**
   * Gravada como TEXTO no backend: a nota ("5"), a pergunta enviada (pesquisa pendente
   * ou sem resposta) ou "external". Consumo numérico só por parser.
   */
  evaluation: number | string;
  /** Tentativas de leitura da nota: < 2 = aguardando resposta. */
  attempts?: number;
  userId?: number | null;
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
    /** Campos aditivos do backend novo (ausentes no antigo). */
    protocol?: string | null;
    createdAt?: string;
    channel?: string | null;
    queue?: { id: number; queue: string } | null;
    whatsapp?: { id: number; name: string; type?: string } | null;
    contact?: {
      id: number;
      name: string;
      number: string;
      username?: string | null;
      bsuid?: string | null;
    };
    user?: { id: number; name: string };
  };
}

export interface EvaluationsResponse {
  data: TicketEvaluation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /**
   * Eco do filtro por agente aplicado pelo servidor (null = sem filtro). A chave sai
   * SEMPRE no servidor novo; ausente = servidor antigo, que ignora o `userId`.
   */
  userFilter?: number | null;
}

export interface EvaluationFilters {
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  evaluation?: number;
  /** Agente gravado na avaliação. */
  userId?: number;
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
  /**
   * Pergunta da pesquisa (vai ao cliente, no envio automático e no manual).
   * null/"" = pergunta padrão no idioma da empresa. Chave AUSENTE no GET = backend
   * antigo: a tela esconde o campo e o save não manda a chave (ausente = não mexe).
   */
  ratingQuestion?: string | null;
  /**
   * Pedido de avaliação no Google anexado à resposta da nota (qualquer nota).
   * Chave AUSENTE no GET = backend antigo ou banco sem a coluna: a tela esconde o card
   * e o save não manda as 3 chaves.
   */
  ratingGoogleReview?: "enabled" | "disabled";
  /** Link de avaliação do Google (https). Também vale como {{linkAvaliacaoGoogle}}. */
  ratingGoogleReviewUrl?: string | null;
  /** Texto do pedido; null/"" = texto padrão no idioma da empresa. */
  ratingGoogleReviewText?: string | null;
}

/** Limites do pedido de avaliação no Google (iguais aos do backend). */
export const GOOGLE_REVIEW_URL_MAX = 1000;
export const GOOGLE_REVIEW_TEXT_MAX = 500;

/** Mesma regra do backend: https com host, sem espaço, aspas, sinais de tag, chaves nem barra invertida. */
export function isValidGoogleReviewUrl(value: string): boolean {
  const url = (value || "").trim();
  if (!url || url.length > GOOGLE_REVIEW_URL_MAX) return false;
  if (/[\s"'<>{}\\]/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !!parsed.hostname;
  } catch {
    return false;
  }
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

export async function fetchEvaluations(
  filters: EvaluationFilters = {},
  opts: { signal?: AbortSignal } = {}
) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  // Checagem explícita: 0 é nota legítima da escala e a checagem falsy a descartava
  if (filters.evaluation !== undefined) params.set("evaluation", String(filters.evaluation));
  if (filters.userId !== undefined) params.set("userId", String(filters.userId));
  return api.get<EvaluationsResponse>(`/ticketEvaluations?${params.toString()}`, {
    signal: opts.signal,
  });
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

/**
 * `data.ratingQuestion`: "" volta à pergunta padrão da Região; ausente = não mexe.
 * `ratingGoogleReview*`: só mandar quando o GET trouxe a chave; ausentes = não mexe.
 */
export async function updateTenantRatingData(
  tenantId: number,
  data: Record<string, unknown> & {
    ratingQuestion?: string | null;
    ratingGoogleReview?: "enabled" | "disabled";
    ratingGoogleReviewUrl?: string | null;
    ratingGoogleReviewText?: string | null;
  }
) {
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
