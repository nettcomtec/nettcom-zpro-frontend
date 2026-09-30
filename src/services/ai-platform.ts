import api, { BACKGROUND_REQUEST } from "@/lib/api";
import type {
  AiCreditStatementResponse,
  AiPlatformModelKind,
  AiPlatformPackage,
  AiPlatformSaleMode,
  AiTopupGateway
} from "@/services/ai-credits";

// IA da plataforma (lado do superadmin). Os tipos espelham
// backend/src/services/AiCreditServices/AiPlatformSentinelZPRO.ts — mudar um exige o outro.
// A chave do gateway é WRITE-ONLY: nunca volta do servidor, só `hasApiKey`.

export interface AiPlatformCatalogModel {
  modelId: string;
  name: string;
  provider: string;
  kind: AiPlatformModelKind;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  perMinuteUsd?: number;
  perMillionCharsUsd?: number;
  vision: boolean;
}

export interface AiPlatformMarkupTier {
  upToUsdPer1M: number | null;
  markupBp: number;
}

export interface AiPlatformProviderMarkup {
  provider: string;
  markupBp: number;
}

export interface AiPlatformModelMarkup {
  modelId: string;
  markupBp: number;
}

export interface AiOwnerPriceRow {
  modelId: string;
  name: string;
  kind: AiPlatformModelKind;
  wholesaleCentsPer1M: number;
  markupBp: number;
  customerCentsPer1M: number;
  keepCentsPer1M: number;
}

export interface AiPlatformSettings {
  enabled: boolean;
  baseUrl: string | null;
  hasApiKey: boolean;
  fxRateMicros: number;
  chargeEnabled: boolean;
  saleMode: AiPlatformSaleMode;
  minTopupCents: number;
  lowBalanceDefaultCents: number;
  negativeFloorCents: number;
  maxOutputTokens: number;
  markupTiers: AiPlatformMarkupTier[];
  providerMarkups: AiPlatformProviderMarkup[];
  modelMarkups: AiPlatformModelMarkup[];
  packages: AiPlatformPackage[];
  models: AiPlatformCatalogModel[];
  defaultModelId: string | null;
  transcriptionModelId: string | null;
  speechModelId: string | null;
  fallbackTopupGateway: AiTopupGateway | null;
  // Reflete a configuração SALVA (o cálculo mora no backend, num lugar só).
  pricePreview: AiOwnerPriceRow[];
}

// Tudo opcional: a tela manda só a aba que salvou. `apiKey` só vai quando o usuário
// digitou uma nova; trocar o host do gateway sem reenviá-la responde
// ERR_AI_PLATFORM_KEY_REQUIRED.
export type AiPlatformSettingsUpdate = Partial<
  Omit<AiPlatformSettings, "hasApiKey" | "pricePreview">
> & { apiKey?: string };

export interface AiPlatformTestResponse {
  ok: boolean;
  byok: boolean;
  model: string | null;
  latencyMs: number;
  voiceOk?: boolean;
  error?: string;
}

export interface AiPlatformSyncedModel extends AiPlatformCatalogModel {
  activatable: boolean;
  reason?: "router" | "alias" | "free" | "no_price" | "variable_price";
}

export interface AiPlatformSyncResponse {
  models: AiPlatformSyncedModel[];
  embeddingAvailable: boolean;
}

export type AiTenantBalanceState = "ok" | "low" | "zero" | "negative";

export interface AiTenantBalanceRow {
  tenantId: number;
  enabled: boolean;
  balanceCents: number;
  state: AiTenantBalanceState;
}

export interface AiTenantStatementResponse extends AiCreditStatementResponse {
  balanceCents: number;
  enabled: boolean;
  planAllows: boolean;
}

export function fetchAiPlatformSettings() {
  return api.get<AiPlatformSettings>("/ai-platform/settings");
}

export function updateAiPlatformSettings(payload: AiPlatformSettingsUpdate) {
  return api.put<AiPlatformSettings>("/ai-platform/settings", payload);
}

export function testAiPlatform(opts?: { voice?: boolean }) {
  return api.post<AiPlatformTestResponse>("/ai-platform/test", { voice: opts?.voice === true });
}

export function syncAiPlatformModels() {
  return api.post<AiPlatformSyncResponse>("/ai-platform/models/sync");
}

// Coluna "Créditos de IA" de /tenants: UMA chamada por carga da tela, muda. Backend sem
// a rota responde 404 e a coluna some — quem chama trata o erro.
export function fetchAiTenantsBalances() {
  return api.get<AiTenantBalanceRow[]>("/ai-platform/tenants-balances", {
    ...BACKGROUND_REQUEST,
    skipNoPermissionToast: true
  });
}

export function fetchAiTenantStatement(tenantId: number, cursor?: string | null) {
  return api.get<AiTenantStatementResponse>(`/ai-platform/tenants/${tenantId}/statement`, {
    params: cursor ? { cursor } : undefined
  });
}

// amountCents com SINAL: positivo credita, negativo debita.
export function adjustAiTenantBalance(tenantId: number, amountCents: number, description: string) {
  return api.post<{ balanceCents: number }>(`/ai-platform/tenants/${tenantId}/adjust`, {
    amountCents,
    description
  });
}

// Único caminho de escrita do interruptor — nunca vai junto no salvar do modal de /tenants.
export function setAiTenantEnabled(tenantId: number, enabled: boolean) {
  return api.put<{ enabled: boolean; planAllows: boolean }>(
    `/ai-platform/tenants/${tenantId}/enabled`,
    { enabled }
  );
}
