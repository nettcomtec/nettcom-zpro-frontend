import api from "@/lib/api";

export async function fetchTenants(page = 1, limit = 50) {
  return api.get("/tenants", { params: { page, limit } });
}

export async function fetchTenantById(tenantId: number) {
  return api.get(`/tenants/${tenantId}`);
}

export async function fetchTenantByAsaas(tenantId: number) {
  return api.get(`/tenantsAsaas/${tenantId}`);
}

export async function fetchTenantSubscription() {
  return api.get("/tenantsSubscription");
}

export async function changeTenantPlan(planId: number) {
  return api.post("/tenantsChangePlan", { planId });
}

export async function updateTenantAsaas(tenantId: number, data: Record<string, unknown>) {
  return api.put(`/tenantsAsaas/${tenantId}`, data);
}

export async function fetchTenantA2F(tenantId: number) {
  return api.get(`/tenantsA2F/${tenantId}`);
}

export async function updateTenantA2F(tenantId: number, data: Record<string, unknown>) {
  return api.put(`/tenantsA2F/${tenantId}`, data);
}

export async function createTenant(data: Record<string, unknown>) {
  return api.post("/tenants", data);
}

/**
 * Politica de criacao de empresa desta licenca. `singleTenant: true` = a licenca
 * cobre apenas a empresa principal (so o tenant 1 consegue logar), entao criar
 * outra e bloqueado no servidor.
 *
 * Rota ADITIVA: backend antigo responde 404 — o chamador trata como `false` e a
 * tela segue exatamente como era antes.
 */
export async function fetchTenantLicensePolicy() {
  return api.get<{ singleTenant: boolean }>("/tenantsLicensePolicy");
}

export async function updateTenant(tenantId: number, data: Record<string, unknown>) {
  return api.put(`/tenantsUpdate/${tenantId}`, data);
}

export async function updateTenantPostmanLink(tenantId: number, postmanLink: string) {
  return api.put(`/tenantsPostmanLink/${tenantId}`, { postmanLink });
}

export async function deleteTenant(tenantId: number) {
  return api.delete(`/tenants/${tenantId}`);
}

export async function acceptTermsForTenant(tenantId: number) {
  return api.put(`/tenantsAcceptTerms/${tenantId}`, { id: tenantId, acceptTerms: true });
}

export async function fetchTenantsAcceptTermsList() {
  return api.get<Array<{ tenantId: number; acceptTerms: boolean | number }>>(
    "/tenantsAcceptTermsList",
  );
}

export async function fetchTenantMetrics(tenantId: number) {
  return api.post("/tenantsMetrics", { tenantId });
}

export async function calculateTenantFilesSize(tenantId: number) {
  return api.post("/custom/sizeTenant", tenantId);
}

export async function cleanTenantFiles(tenantId: number) {
  return api.post("/custom/cleanTenant", tenantId);
}

export async function cleanTenantFilesByFilter(
  tenantId: number,
  filters: { olderThanDays?: number; minSizeMB?: number }
) {
  return api.post("/custom/cleanTenantByFilter", { tenantId, ...filters });
}

export interface Holiday {
  date: string;
  description: string;
  active: boolean;
}

export async function fetchBusinessHours() {
  return api.get("/tenants/business-hours/");
}

export async function updateBusinessHours(data: unknown) {
  return api.put("/tenants/business-hours/", data);
}

export async function updateMessageBusinessHours(data: { messageBusinessHours: string }) {
  return api.put("/tenants/message-business-hours/", data);
}

export async function updateHolidays(data: { holidays: Holiday[] }) {
  return api.put("/tenants/holidays/", data);
}

export async function updateTenantEvolution(
  tenantId: number,
  data: { evoHost?: string; evoToken?: string; evoInjectorUrl?: string; evoInjectorSecret?: string }
) {
  return api.put(`/tenantsEvolutionHost/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantEvolutionGo(
  tenantId: number,
  data: { evoGoHost?: string; evoGoToken?: string; evoGoInjectorUrl?: string; evoGoInjectorSecret?: string }
) {
  return api.put(`/tenantsEvolutionGoHost/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantWuzapi(tenantId: number, data: { wuzapiHost?: string; wuzapiToken?: string }) {
  return api.put(`/tenantsWuzapiHost/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantUazapi(tenantId: number, data: { uazapiHost?: string; uazapiToken?: string }) {
  return api.put(`/tenantsUazapiHost/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantZapi(tenantId: number, data: { zapiHost?: string; zapiToken?: string }) {
  return api.put(`/tenantsZapiHost/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantDialog360Partner(
  tenantId: number,
  data: { dialog360PartnerId?: string; dialog360PartnerApiKey?: string; dialog360PlatformSecret?: string }
) {
  return api.put(`/tenantsDialog360Partner/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantGupshupPartner(
  tenantId: number,
  data: { gupshupPartnerEmail?: string; gupshupPartnerPassword?: string; gupshupSolutionId?: string; gupshupAppId?: string }
) {
  return api.put(`/tenantsGupshupPartner/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantHubToken(tenantId: number, data: { hubToken?: string }) {
  return api.put(`/tenantsHubToken/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantSMSToken(tenantId: number, data: { smsToken?: string }) {
  return api.put(`/tenantsSMSToken/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantConectaSMSToken(tenantId: number, data: { conectaSmsToken?: string }) {
  return api.put(`/tenantsConectaSMSToken/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantLivsonSMSToken(tenantId: number, data: { livsonSmsToken?: string }) {
  return api.put(`/tenantsLivsonSMSToken/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantGroqCloud(tenantId: number, data: { groqCloud?: string; groqCloudApiKey?: string; groqCloudLanguage?: string; groqCloudModel?: string }) {
  return api.put(`/tenantsGroqCloud/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantAiDefaultLanguage(tenantId: number, aiDefaultLanguage: string) {
  return api.put(`/tenantsAiDefaultLanguage/${tenantId}`, { id: tenantId, aiDefaultLanguage });
}

export async function updateTenantVapiToken(tenantId: number, data: { vapiToken?: string }) {
  return api.put(`/tenantsVapiToken/${tenantId}`, { id: tenantId, ...data });
}

export async function updateTenantWebsocketToken(tenantId: number, websocketToken: string) {
  return api.put(`/tenantsWebsocketToken/${tenantId}`, { id: tenantId, websocketToken });
}

export async function updateTenantMetaToken(tenantId: number, metaToken: string) {
  return api.put(`/tenantsMetaUpdate/${tenantId}`, { metaToken });
}

export async function updateTenantAsaasToken(token: string) {
  return api.put("/tenantsUpdateAsaasToken", { token });
}

export interface OAuthBulkData {
  oauthEnabled?: boolean;
  oauthProxyUrl?: string;
  instagramWebhookProxyUrl?: string;
  instagramWebhookProxySecret?: string;
  messengerWebhookProxyUrl?: string;
  messengerWebhookProxySecret?: string;
}

export async function updateOAuthBulk(data: OAuthBulkData) {
  return api.put("/tenantsUpdateOAuthBulk", data);
}

export async function fetchSubscriptionV2() {
  return api.get("/tenantsSubscriptionV2");
}

export async function fetchPaymentsV2() {
  return api.get("/tenantsPaymentsV2");
}

// Forca o backend a reconsultar o gateway e recomputar tenant.paymentStatus na
// hora (sem esperar webhook/job de 6h). Util depois que o cliente paga.
export async function refreshPaymentStatusV2() {
  return api.post("/tenantsRefreshPaymentStatus");
}

export async function changePlanV2(planId: number) {
  return api.post("/tenantsChangePlanV2", { planId });
}

export interface PaymentGatewayConfig {
  tenantId: number;
  paymentGateway?: string;
  asaasToken?: string;
  stripeToken?: string;
  pagarmeToken?: string;
  mercadopagoToken?: string;
}

export async function updatePaymentGatewayConfig(data: PaymentGatewayConfig) {
  return api.put("/tenantsPaymentGatewayConfig", data);
}

export interface MigrateGatewayResult {
  gateway: string;
  migrated: number;
  skipped: number;
  failed: number;
  results: Array<{ tenantId: number; name: string; ok: boolean; skipped?: string; customerId?: string; error?: string }>;
}

// Migra tenants para o gateway global: cria o cliente no gateway (Stripe/Mercado
// Pago) e solta o provisionamento Asaas. tenantIds = específicos; all = todos.
export async function migrateTenantsToGlobalGateway(data: { tenantIds?: number[]; all?: boolean }) {
  return api.post<MigrateGatewayResult>("/tenantsMigrateToGlobalGateway", data);
}

export interface PaymentGatewayGlobalConfig {
  gateway?: string;
  asaasToken?: string;
  stripeToken?: string;
  pagarmeToken?: string;
  mercadopagoToken?: string;
  asaasWebhookToken?: string;
  stripeWebhookSecret?: string;
  pagarmeWebhookBasic?: string;
  mercadopagoWebhookSecret?: string;
  /** Dias até o vencimento da 1ª cobrança no signup/troca de plano (0 = hoje). */
  firstChargeDueDays?: number;
  /** Quando true, novos cadastros só acessam após confirmação do 1º pagamento. */
  requirePaymentBeforeAccess?: boolean;
}

export async function fetchPaymentGatewayGlobalConfig() {
  return api.get("/tenantsPaymentGatewayGlobalConfig");
}

export async function updatePaymentGatewayGlobalConfig(data: PaymentGatewayGlobalConfig) {
  return api.put("/tenantsPaymentGatewayGlobalConfig", data);
}

// ── Tenant branding ─────────────────────────────────────────────────────────

export async function fetchTenantBranding(tenantId: number) {
  return api.get(`/custom/tenant/${tenantId}/branding`);
}

export async function uploadTenantLogo(tenantId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/custom/tenant/${tenantId}/uploadLogo`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function uploadTenantLogoDark(tenantId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/custom/tenant/${tenantId}/uploadLogoDark`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function uploadTenantFavicon(tenantId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/custom/tenant/${tenantId}/uploadFavicon`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function deleteTenantLogoApi(tenantId: number) {
  return api.delete(`/custom/tenant/${tenantId}/deleteLogo`);
}

export async function deleteTenantLogoDarkApi(tenantId: number) {
  return api.delete(`/custom/tenant/${tenantId}/deleteLogoDark`);
}

export async function deleteTenantFaviconApi(tenantId: number) {
  return api.delete(`/custom/tenant/${tenantId}/deleteFavicon`);
}

export async function updateTenantCustomAppName(tenantId: number, name: string) {
  return api.put(`/custom/tenant/${tenantId}/appName`, { name });
}
