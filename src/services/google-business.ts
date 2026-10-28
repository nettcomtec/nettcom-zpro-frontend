import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { getBackendErrorCode } from "@/lib/backend-error-code";

// Chamadas automáticas (carga da aba, número do sino, marcar vistas): nunca abrem
// aviso global de plano nem de permissão.
const SILENT_REQUEST = { ...BACKGROUND_REQUEST, skipNoPermissionToast: true } as const;

/**
 * Perfil da Empresa no Google (avaliações) — contrato com o backend
 * (docs/PLANO_AVALIACAO_GOOGLE_PERFIL_EMPRESA.md §5.9).
 *
 * Backend antigo não tem as rotas: 404 sem código `ERR_` = recurso ausente → a tela
 * esconde a aba e a seção do sino. Plano sem "Avaliações/NPS" responde 402 → idem.
 */

export type GoogleBusinessApiState = "ok" | "not_approved" | "api_disabled" | "quota" | "error";
export type GoogleBusinessAuthExpiredReason = "revoked" | "app_changed" | "decrypt" | null;
export type GoogleReviewReplyState = "PENDING" | "REJECTED" | "APPROVED" | null;

export interface GoogleBusinessLocationDTO {
  id: number;
  title: string | null;
  address: string | null;
  isActive: boolean;
  newReviewUri: string | null;
  mapsUri: string | null;
  averageRating: number | null;
  totalReviewCount: number | null;
  lastSyncAt: string | null;
  /** Código do último erro da ficha (ex.: "not_found", "not_verified", "suspended"). */
  lastError: string | null;
  historyImported: boolean;
}

export interface GoogleBusinessAlertDTO {
  enabled: boolean;
  /** 1 a 5 estrelas. */
  maxStars: number;
  /** 1 a 720 horas. */
  hours: number;
}

export interface GoogleBusinessPartialReadDTO {
  /** Contas do Google que não responderam na última leitura das fichas (> 0). */
  failedAccounts: number;
  /** Código da 1ª falha (status HTTP ou código de rede). */
  code: string | null;
  at: string | null;
}

export interface GoogleBusinessConnectionDTO {
  accountEmail: string | null;
  connectedAt: string;
  authExpired: boolean;
  authExpiredReason: GoogleBusinessAuthExpiredReason;
  apiState: GoogleBusinessApiState;
  apiStateAt: string | null;
  lastSyncAt: string | null;
  lastManualSyncAt: string | null;
  alert: GoogleBusinessAlertDTO;
  locations: GoogleBusinessLocationDTO[];
  /** Última leitura das fichas com UMA conta do Google sem responder; `null` = completa; ausente = backend antigo. */
  partialRead?: GoogleBusinessPartialReadDTO | null;
}

export interface GoogleBusinessStatus {
  available: true;
  /** Há App Google com o serviço "Perfil da Empresa" ligado para esta empresa. */
  appConfigured: boolean;
  /** Código do motivo quando `appConfigured` é false (ERR_NO_GOOGLE_APP_CONFIGURED, ERR_PLATFORM_GOOGLE_APP_DISABLED). */
  appError: string | null;
  /** O usuário pode conectar, desconectar, escolher fichas e mudar o alerta (D18). */
  canManage: boolean;
  connection: GoogleBusinessConnectionDTO | null;
}

export interface GoogleBusinessBadge {
  newCount: number;
  alertCount: number;
}

export interface GoogleReviewReplyDTO {
  comment: string;
  updateTime: string | null;
  state: GoogleReviewReplyState;
  policyViolation: string | null;
  repliedByName: string | null;
}

export interface GoogleReviewDTO {
  id: number;
  locationId: number;
  locationTitle: string | null;
  reviewerName: string | null;
  reviewerPhotoUrl: string | null;
  isAnonymous: boolean;
  /** 1 a 5 (0 = sem nota informada pelo Google). */
  starRating: number;
  comment: string | null;
  createTime: string | null;
  updateTime: string | null;
  reply: GoogleReviewReplyDTO | null;
  isHistory: boolean;
  /** Nova = ninguém viu na aba ainda (e não é do histórico importado). */
  isNew: boolean;
}

export interface GoogleReviewListFilters {
  locationId?: number;
  /** Ex.: [1, 2]. */
  stars?: number[];
  unanswered?: boolean;
  /** AAAA-MM-DD */
  from?: string;
  /** AAAA-MM-DD */
  to?: string;
  page?: number;
}

export interface GoogleReviewListResponse {
  reviews: GoogleReviewDTO[];
  count: number;
  hasMore: boolean;
}

export interface GoogleReviewSummary {
  locations: Array<{ id: number; title: string | null; averageRating: number | null; totalReviewCount: number | null }>;
  starCounts: Record<"1" | "2" | "3" | "4" | "5", number>;
  unansweredCount: number;
  /** Tempo médio de resposta em horas (respondidas no período); null sem dados. */
  avgResponseHours: number | null;
  /** Últimos 12 meses: média e quantidade por mês (AAAA-MM). */
  monthly: Array<{ month: string; average: number | null; count: number }>;
}

export type GoogleBusinessLoad<T> =
  | { state: "ok"; data: T }
  | { state: "unavailable" }
  | { state: "error"; code: string };

const statusOf = (err: unknown): number | undefined => {
  const e = err as { status?: number; response?: { status?: number } };
  return e?.status ?? e?.response?.status;
};

/** 404 sem código ERR_ (rota ausente), 402 (plano) ou 405/501 = recurso indisponível. */
export function isGoogleBusinessUnavailable(err: unknown): boolean {
  const status = statusOf(err);
  const code = getBackendErrorCode(err);
  if (status === 402 || status === 405 || status === 501) return true;
  return status === 404 && !code.startsWith("ERR_");
}

async function load<T>(fn: () => Promise<{ data: T }>): Promise<GoogleBusinessLoad<T>> {
  try {
    const res = await fn();
    return { state: "ok", data: res.data };
  } catch (err) {
    if (isGoogleBusinessUnavailable(err)) return { state: "unavailable" };
    return { state: "error", code: getBackendErrorCode(err) };
  }
}

export function loadGoogleBusinessStatus(options?: { background?: boolean }) {
  return load<GoogleBusinessStatus>(() =>
    api.get("/google-business/status", options?.background ? SILENT_REQUEST : undefined)
  );
}

export function loadGoogleBusinessBadge() {
  return load<GoogleBusinessBadge>(() => api.get("/google-business/badge", SILENT_REQUEST));
}

export async function requestGoogleBusinessAuthUrl() {
  return api.post<{ authUrl: string }>("/google-business/auth/url", {});
}

/** Nome da empresa do state, sem gastá-lo (confirmação da página de retorno, A6). */
export async function previewGoogleBusinessAuth(state: string) {
  return api.post<{ tenantName: string | null }>("/google-business/auth/preview", { state });
}

export async function completeGoogleBusinessAuth(payload: { code: string; state: string }) {
  return api.post<{ ok: true; accountEmail: string | null; locationsCount: number }>(
    "/google-business/auth/callback",
    payload
  );
}

export async function syncGoogleBusinessNow() {
  return api.post<{ ok: true }>("/google-business/sync", {});
}

export async function setGoogleBusinessActiveLocations(activeLocationIds: number[]) {
  return api.put<GoogleBusinessStatus>("/google-business/locations", { activeLocationIds });
}

export async function useGoogleBusinessLocationReviewLink(locationId: number) {
  return api.post<{ ratingGoogleReviewUrl: string }>(`/google-business/locations/${locationId}/use-review-link`, {});
}

export async function updateGoogleBusinessAlert(alert: GoogleBusinessAlertDTO) {
  return api.put<{ alert: GoogleBusinessAlertDTO }>("/google-business/alert", alert);
}

export async function disconnectGoogleBusiness() {
  return api.delete<{ ok: true }>("/google-business/connection");
}

export async function fetchGoogleReviews(filters: GoogleReviewListFilters = {}) {
  const params: Record<string, string> = {};
  if (filters.locationId) params.locationId = String(filters.locationId);
  if (filters.stars?.length) params.stars = filters.stars.join(",");
  if (filters.unanswered) params.unanswered = "true";
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.page) params.page = String(filters.page);
  return api.get<GoogleReviewListResponse>("/google-reviews", { params });
}

export async function fetchGoogleReviewSummary(filters: Pick<GoogleReviewListFilters, "locationId" | "from" | "to"> = {}) {
  const params: Record<string, string> = {};
  if (filters.locationId) params.locationId = String(filters.locationId);
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  return api.get<GoogleReviewSummary>("/google-reviews/summary", { params });
}

export async function markGoogleReviewsViewed() {
  return api.put<{ ok: true }>("/google-reviews/viewed", {}, SILENT_REQUEST);
}

/** 409 ERR_GOOGLE_REVIEW_REPLY_CHANGED traz `review` (versão atual) no corpo. */
export async function replyGoogleReview(id: number, comment: string, expectedReplyUpdateTime: string | null) {
  return api.put<GoogleReviewDTO>(`/google-reviews/${id}/reply`, { comment, expectedReplyUpdateTime });
}

export async function deleteGoogleReviewReply(id: number, expectedReplyUpdateTime: string | null) {
  return api.delete<GoogleReviewDTO>(`/google-reviews/${id}/reply`, {
    params: expectedReplyUpdateTime ? { expectedReplyUpdateTime } : {}
  });
}

export async function suggestGoogleReviewReply(id: number) {
  return api.post<{ suggestion: string }>(`/google-reviews/${id}/suggest-reply`, {});
}

/** Teto da resposta no Google: 4096 BYTES em UTF-8 (acento conta 2, emoji 4). */
export const GOOGLE_REVIEW_REPLY_MAX_BYTES = 4096;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text || "").length;
}
