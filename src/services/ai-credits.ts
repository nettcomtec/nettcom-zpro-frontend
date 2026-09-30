import api, { BACKGROUND_REQUEST } from "@/lib/api";

// Créditos de IA (lado do tenant). Os tipos espelham
// backend/src/services/AiCreditServices/AiPlatformSentinelZPRO.ts — mudar um exige o outro.
// Todo valor monetário chega em CENTAVOS; `chargedCents` de consumo pode ter até 4
// casas decimais (uma chamada de IA custa fração de centavo).

// Gravado no lugar da chave de IA para dizer "use a IA da plataforma". Não é segredo.
export const AI_PLATFORM_KEY_SENTINEL = "builtin-platform-ai";
export const isPlatformKey = (value: unknown): boolean => value === AI_PLATFORM_KEY_SENTINEL;

// Chamadas AUTOMÁTICAS (faixa do topo, seletores): nunca mostram toast de plano nem de
// permissão. O gate `isAiCreditsEnabled()` vem ANTES de qualquer request deste arquivo —
// tenant sem o recurso não paga nenhuma chamada.
const SILENT = { ...BACKGROUND_REQUEST, skipNoPermissionToast: true } as const;

export type AiPlatformModelKind = "chat" | "transcription" | "speech";
export type AiPlatformSaleMode = "free" | "packages";
export type AiTopupGateway = "asaas" | "stripe";
export type AiTopupStatus = "pending" | "credited" | "expired" | "canceled" | "disputed" | "reversed";
export type AiUsageSource =
  | "agent"
  | "agent_summary"
  | "kb_embedding"
  | "kb_query"
  | "chatgpt"
  | "copilot"
  | "transcription"
  | "speech"
  | "vision";

export interface AiPublicModelPrice {
  modelId: string;
  name: string;
  kind: AiPlatformModelKind;
  vision: boolean;
  inputPriceCentsPer1M: number;
  outputPriceCentsPer1M: number;
  perMinutePriceCents?: number;
  perMillionCharsPriceCents?: number;
}

export interface AiCreditsModelsResponse {
  defaultModelId: string | null;
  models: AiPublicModelPrice[];
}

export interface AiPlatformPackage {
  id: string;
  label: string;
  priceCents: number;
  creditCents: number;
}

export interface AiTopupView {
  id: string;
  gateway: AiTopupGateway;
  status: AiTopupStatus;
  priceCents: number;
  creditCents: number;
  paymentUrl: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface AiCreditsStatusResponse {
  enabled: boolean;
  balanceCents: number;
  lowBalanceCents: number;
  lowBalanceCustomCents: number | null;
  negativeFloorCents: number;
  saleMode: AiPlatformSaleMode;
  minTopupCents: number;
  packages: AiPlatformPackage[];
  topupAvailable: boolean;
  pendingTopup: AiTopupView | null;
}

export type AiCreditTransactionType =
  | "topup"
  | "manual_credit"
  | "manual_debit"
  | "reversal"
  | "dispute"
  | "dispute_won";

export interface AiCreditTransactionView {
  id: string;
  type: AiCreditTransactionType;
  amountCents: number;
  balanceAfterCents: number;
  description: string | null;
  createdAt: string;
}

export interface AiCreditStatementResponse {
  items: AiCreditTransactionView[];
  nextCursor: string | null;
}

export interface AiCreditUsageDailyView {
  day: string;
  source: AiUsageSource;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  chargedCents: number;
}

export interface AiCreditUsageResponse {
  items: AiCreditUsageDailyView[];
  totalChargedCents: number;
}

export interface AiCreditUsageEventView {
  id: string;
  createdAt: string;
  source: AiUsageSource;
  model: string;
  inputTokens: number;
  outputTokens: number;
  chargedCents: number;
}

export interface AiCreditUsageEventsResponse {
  items: AiCreditUsageEventView[];
  nextCursor: string | null;
}

export interface AiTopupCreated {
  id: string;
  gateway: AiTopupGateway;
  status: AiTopupStatus;
  priceCents: number;
  creditCents: number;
  paymentUrl: string | null;
}

export interface AiTopupRefreshResponse {
  id: string;
  status: AiTopupStatus;
  balanceCents: number;
}

export interface AiCreditsAlertsResponse {
  lowBalanceCents: number;
  lowBalanceCustomCents: number | null;
}

export interface CreateAiTopupPayload {
  amountCents?: number;
  packageId?: string;
  document?: string;
  email?: string;
}

// `silent: true` = chamada automática (faixa, seletor). Sem ele, é ação do usuário na
// página e o erro aparece normalmente.
export function fetchAiCreditsStatus(opts?: { silent?: boolean }) {
  return api.get<AiCreditsStatusResponse>("/ai-credits/status", opts?.silent ? SILENT : undefined);
}

// Usada pelos seletores "Chave própria / IA da plataforma": só exige o recurso ligado,
// não a permissão de gestão.
export function fetchAiCreditsModels() {
  return api.get<AiCreditsModelsResponse>("/ai-credits/models", SILENT);
}

export function fetchAiCreditsStatement(cursor?: string | null) {
  return api.get<AiCreditStatementResponse>("/ai-credits/statement", {
    params: cursor ? { cursor } : undefined
  });
}

export function fetchAiCreditsUsage(params: { from: string; to: string }) {
  return api.get<AiCreditUsageResponse>("/ai-credits/usage", { params });
}

export function fetchAiCreditsUsageEvents(params: { from: string; to: string; cursor?: string | null }) {
  const { cursor, ...range } = params;
  return api.get<AiCreditUsageEventsResponse>("/ai-credits/usage/events", {
    params: cursor ? { ...range, cursor } : range
  });
}

export function createAiTopup(payload: CreateAiTopupPayload) {
  return api.post<AiTopupCreated>("/ai-credits/topups", payload);
}

export function refreshAiTopup(id: string) {
  return api.post<AiTopupRefreshResponse>(`/ai-credits/topups/${id}/refresh`);
}

export function updateAiCreditsAlerts(lowBalanceCents: number | null) {
  return api.put<AiCreditsAlertsResponse>("/ai-credits/alerts", { lowBalanceCents });
}
