import api from "@/lib/api";

// Assinatura / licença
export async function fetchTenantLicense() {
  return api.get("/tenants");
}
export async function fetchTenantLicenseDetails(email: string) {
  return api.get(`/tenantsLs?tenantEmail=${encodeURIComponent(email)}`);
}
export async function updateTenantEmail(data: { tenantEmail: string }) {
  return api.put("/tenantsEmail", data);
}
export async function updateTenantDomain(data: { domains: string[] }) {
  return api.post("/tenantsDomain", data);
}
export async function refreshTenantLicense() {
  return api.post("/tenantsRefreshLicenseData");
}
export async function checkVersion() {
  return api.get("/check-version/");
}

// Sessões por tenant
export async function fetchWhatsappsByTenant() {
  return api.get("/whatsappTenantsAll/");
}
export async function createWhatsappTenant(data: Record<string, unknown>) {
  return api.post("/whatsappTenants", data);
}
export async function updateWhatsappTenant(id: number, data: Record<string, unknown>) {
  return api.put(`/whatsappTenants/${id}`, data);
}
export async function deleteWhatsappTenant(id: number) {
  return api.delete(`/whatsappTenants/${id}`);
}
export async function showWhatsappTenantSession(id: number) {
  return api.get(`/whatsappTenantsSession/${id}`);
}
export async function connectWhatsappTenantSession(id: number) {
  return api.post(`/whatsappTenantsSession/${id}`);
}
export async function requestQrCodeTenant(id: number) {
  return api.put(`/whatsappTenantsSession/${id}`);
}
export async function disconnectWhatsappTenantSession(id: number) {
  return api.delete(`/whatsappTenantsSession/${id}`);
}

export async function revalidateWhatsappTenantSession(id: number) {
  return api.post(`/whatsappTenantsSession/${id}/revalidate`);
}

export async function getTenantBaileysCredsStatus(id: number) {
  return api.get(`/whatsappTenantsSession/${id}/baileys-creds-status`);
}

// ─── Ações de canal cross-tenant (página /sessoestenants) ───
// Todas passam pelo middleware resolveChannelTenant no backend, que personifica
// o tenant DONO do canal. Reusa os mesmos handlers de /sessoes.
const WTA = "/whatsappTenants/actions";

export async function setDefaultWhatsappTenant(whatsappId: number) {
  return api.post(`${WTA}/set-default`, { whatsappId });
}
export async function closeAllOpenTenant(whatsappId: number) {
  return api.post(`${WTA}/close-open`, { whatsappId });
}
export async function closeAllPendingTenant(whatsappId: number) {
  return api.post(`${WTA}/close-pending`, { whatsappId });
}
export async function transferChannelTenant(data: {
  whatsappId: number;
  newWhatsappId: number;
  channel: string;
  newChannel: string;
}) {
  return api.put(`${WTA}/transfer-channel`, data);
}
export async function updateWebhookOriginTenant(whatsappId: number, origin: "own_app" | "zdg_oauth") {
  return api.put<{
    success: boolean;
    whatsappId: number;
    webhookOrigin: "own_app" | "zdg_oauth";
    needsRevalidation: boolean;
    reason: string;
    detail?: string;
  }>(`${WTA}/${whatsappId}/webhook-origin`, { origin });
}
export async function refreshActivationTicketTenant(whatsappId: number) {
  return api.post<{
    success: boolean;
    activationTicketExpiresAt?: string | null;
    activationTicketPid?: string | null;
  }>(`${WTA}/${whatsappId}/refresh-activation-ticket`);
}
export async function getMetaWebhookAuthUrlTenant(
  whatsappId: number,
  kind: "waba" | "instagram" | "messenger"
) {
  if (kind === "waba") {
    return api.get<{ authUrl?: string }>(`${WTA}/waba-auth-url`, {
      params: { whatsappId, mode: "primary" },
    });
  }
  const path = kind === "instagram" ? "instagram-auth-url" : "messenger-auth-url";
  return api.get<{ authUrl?: string }>(`${WTA}/${path}`, { params: { whatsappId } });
}
export async function revalidateProviderWebhookTenant(
  whatsappId: number,
  provider: "evo" | "evogo" | "meow" | "zapi" | "uazapi" | "hub",
  channel: Record<string, unknown>
) {
  const path = provider === "hub" ? "hub-setagain" : `${provider}-setwebhook`;
  return api.post(`${WTA}/${whatsappId}/${path}`, channel);
}
export async function getWidgetTenant(whatsappId: number, enableMenuButtons?: boolean) {
  return api.get(`${WTA}/${whatsappId}/widget`, {
    responseType: "blob",
    params: enableMenuButtons ? { menuButtons: "1" } : undefined,
  });
}

// Tenant API tokens
export async function fetchTenantApis() {
  return api.get("/tenantApi/");
}
export async function createTenantApi() {
  return api.post("/tenantApi/");
}
export async function updateTenantApi(id: number) {
  return api.put(`/tenantApi/${id}`);
}
export async function renewTenantApiToken(id: number) {
  return api.post(`/tenantApi/${id}/renew-token`);
}
export async function deleteTenantApi(id: number) {
  return api.delete(`/tenantApi/${id}`);
}

// App WABA
export async function fetchAppWabas() {
  return api.get("/app-waba");
}
export async function createAppWaba(data: Record<string, unknown>) {
  return api.post("/app-waba", data);
}
export async function bulkCreateAppWaba(data: Record<string, unknown>) {
  return api.post("/app-waba-bulk", data);
}
export async function updateAppWaba(id: number, data: Record<string, unknown>) {
  return api.put(`/app-waba/${id}`, data);
}
export async function deleteAppWaba(id: number) {
  return api.delete(`/app-waba/${id}`);
}

// App Mercado Livre
export async function fetchAppMercadoLivres() {
  return api.get("/app-mercadolivre");
}
export async function createAppMercadoLivre(data: Record<string, unknown>) {
  return api.post("/app-mercadolivre", data);
}
export async function updateAppMercadoLivre(id: number, data: Record<string, unknown>) {
  return api.put(`/app-mercadolivre/${id}`, data);
}
export async function deleteAppMercadoLivre(id: number) {
  return api.delete(`/app-mercadolivre/${id}`);
}

// App LinkedIn
export async function fetchAppLinkedIns() {
  return api.get("/app-linkedin");
}
export async function createAppLinkedIn(data: Record<string, unknown>) {
  return api.post("/app-linkedin", data);
}
export async function updateAppLinkedIn(id: number, data: Record<string, unknown>) {
  return api.put(`/app-linkedin/${id}`, data);
}
export async function deleteAppLinkedIn(id: number) {
  return api.delete(`/app-linkedin/${id}`);
}

// App OLX
export async function fetchAppOLXs() {
  return api.get("/app-olx");
}
export async function createAppOLX(data: Record<string, unknown>) {
  return api.post("/app-olx", data);
}
export async function updateAppOLX(id: number, data: Record<string, unknown>) {
  return api.put(`/app-olx/${id}`, data);
}
export async function deleteAppOLX(id: number) {
  return api.delete(`/app-olx/${id}`);
}

// App YouTube
export async function fetchAppYouTubes() {
  return api.get("/app-youtube");
}
export async function createAppYouTube(data: Record<string, unknown>) {
  return api.post("/app-youtube", data);
}
export async function updateAppYouTube(id: number, data: Record<string, unknown>) {
  return api.put(`/app-youtube/${id}`, data);
}
export async function deleteAppYouTube(id: number) {
  return api.delete(`/app-youtube/${id}`);
}

// App Google (Phase 16 — unified app for Gmail + Calendar + YouTube)
export async function fetchAppGoogles() {
  return api.get("/app-google");
}
export async function createAppGoogle(data: Record<string, unknown>) {
  return api.post("/app-google", data);
}
export async function updateAppGoogle(id: number, data: Record<string, unknown>) {
  return api.put(`/app-google/${id}`, data);
}
export async function deleteAppGoogle(id: number) {
  return api.delete(`/app-google/${id}`);
}

// App TikTok
export async function fetchAppTikToks() {
  return api.get("/app-tiktok");
}
export async function createAppTikTok(data: Record<string, unknown>) {
  return api.post("/app-tiktok", data);
}
export async function updateAppTikTok(id: number, data: Record<string, unknown>) {
  return api.put(`/app-tiktok/${id}`, data);
}
export async function deleteAppTikTok(id: number) {
  return api.delete(`/app-tiktok/${id}`);
}

// App RocketChat
export async function fetchAppRocketChats() {
  return api.get("/app-rocketchat");
}
export async function createAppRocketChat(data: Record<string, unknown>) {
  return api.post("/app-rocketchat", data);
}
export async function updateAppRocketChat(id: number, data: Record<string, unknown>) {
  return api.put(`/app-rocketchat/${id}`, data);
}
export async function deleteAppRocketChat(id: number) {
  return api.delete(`/app-rocketchat/${id}`);
}
// `data` = valores ainda não salvos do formulário; campo vazio testa o valor salvo.
export async function validateAppRocketChat(id: number, data?: Record<string, unknown>) {
  return api.post(`/app-rocketchat/${id}/validate`, data ?? {});
}
export async function updateTenantRocketChatEnabled(tenantId: number, data: { rocketChatEnabled: string }) {
  return api.put(`/tenantsRocketChatEnabled/${tenantId}`, data);
}

// App WooCommerce
export async function fetchAppWooCommerces() {
  return api.get("/app-woocommerce");
}
export async function createAppWooCommerce(data: Record<string, unknown>) {
  return api.post("/app-woocommerce", data);
}
export async function updateAppWooCommerce(id: number, data: Record<string, unknown>) {
  return api.put(`/app-woocommerce/${id}`, data);
}
export async function deleteAppWooCommerce(id: number) {
  return api.delete(`/app-woocommerce/${id}`);
}
export async function validateWooCommerceConnection(id: number) {
  return api.post(`/app-woocommerce/${id}/validate`);
}
export async function registerWooCommerceWebhooks(id: number) {
  return api.post(`/app-woocommerce/${id}/register-webhooks`);
}

// App Nuvemshop
export async function fetchAppNuvemshops() {
  return api.get("/app-nuvemshop");
}
export async function createAppNuvemshop(data: Record<string, unknown>) {
  return api.post("/app-nuvemshop", data);
}
export async function updateAppNuvemshop(id: number, data: Record<string, unknown>) {
  return api.put(`/app-nuvemshop/${id}`, data);
}
export async function deleteAppNuvemshop(id: number) {
  return api.delete(`/app-nuvemshop/${id}`);
}
export async function validateNuvemshopConnection(id: number) {
  return api.post(`/app-nuvemshop/${id}/validate`);
}
export async function registerNuvemshopWebhooks(id: number) {
  return api.post(`/app-nuvemshop/${id}/register-webhooks`);
}
export async function syncNuvemshopProducts(id: number) {
  return api.post(`/app-nuvemshop/${id}/sync-products`);
}

// Provedores globais
export async function fetchGlobalProviders() {
  return api.get("/globalProviderConfig");
}
export async function createGlobalProvider(data: Record<string, unknown>) {
  return api.post("/globalProviderConfig", data);
}
export async function updateGlobalProvider(id: number, data: Record<string, unknown>) {
  return api.put(`/globalProviderConfig/${id}`, data);
}
export async function deleteGlobalProvider(id: number) {
  return api.delete(`/globalProviderConfig/${id}`);
}
export async function addTenantToGlobalProvider(id: number, tenantId: number) {
  return api.post(`/globalProviderConfig/${id}/tenants`, { tenantId });
}
export async function removeTenantFromGlobalProvider(id: number, tenantId: number) {
  return api.delete(`/globalProviderConfig/${id}/tenants`, { data: { tenantId } });
}
export async function fetchAllTenants() {
  return api.get("/tenants/");
}

// Notificações admin
export async function fetchAllNotifications(params?: Record<string, unknown>) {
  return api.get("/notifications", { params });
}
export async function createNotification(data: { message: string }) {
  return api.post("/notifications", data);
}
export async function updateNotification(id: number, data: { message: string }) {
  return api.put(`/notifications/${id}`, data);
}
export async function deleteNotification(id: number) {
  return api.delete(`/notifications/${id}`);
}
export async function deleteAllNotifications() {
  return api.delete("/notifications");
}

// Tenants env/pk
export async function fetchTenantsEv() {
  return api.get("/tenantsEv/");
}
export async function fetchTenantsPk() {
  return api.get("/tenantsPk/");
}

// Bull queues
export async function fetchQueues() {
  return api.get("/bullqueues");
}
export async function restartQueue() {
  return api.post("/bullqueues/restart-process");
}
export async function reprocessQueue(queueName: string) {
  return api.post(`/bullqueues/${queueName}/reprocess`);
}

// Backup
// O backup roda por minutos no servidor (dump do banco + zip da pasta do tenant). Hoje a
// rota responde 202 e o trabalho segue em background, mas backend antigo só responde no
// fim: com o timeout global de 30s o axios abortava e a tela acusava "erro ao iniciar
// backup" num backup que estava indo bem.
const BACKUP_REQUEST_TIMEOUT = 600000;

export async function backupAllTenants() {
  return api.post("/backup/all", undefined, { timeout: BACKUP_REQUEST_TIMEOUT });
}
// Rota aditiva: backend antigo responde 404 e a tela só não mostra o aviso de andamento.
export async function fetchRunningBackups() {
  return api.get("/backup/running");
}
export async function fetchBackupStatistics() {
  return api.get("/statistics");
}
export async function fetchBackupResults() {
  return api.get("/results");
}

// Monitor
export async function fetchSystemMetrics() {
  return api.get("/metrics");
}

// Bull-Board (painel de filas Redis). Disponível só quando REDIS_MODE on +
// BULL_BOARD_USER/PASS definidos no backend. Retorna a URL completa (base da
// API + path) p/ abrir o painel server-rendered em nova aba (basic-auth própria).
export async function getBullBoardStatus(): Promise<{ enabled: boolean; url: string }> {
  const { data } = await api.get("/bull-board-status");
  const base = (api.defaults.baseURL as string) || "";
  return {
    enabled: !!data?.enabled,
    url: `${base}${data?.path || "/admin/queues"}`,
  };
}

// Pagamentos Asaas (todos tenants)
export async function fetchTenantsAsaas() {
  return api.get("/tenantsAsaas/");
}

// Pagamentos multi-gateway (todos tenants) — V2
export async function fetchTenantsAllPaymentsV2() {
  return api.get("/tenantsAllPaymentsV2");
}

// Customizar
export async function uploadLogo(formData: FormData) {
  return api.post("/custom/uploadLogo", formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}
export async function uploadLogoDark(formData: FormData) {
  return api.post("/custom/uploadLogoDark", formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}
export async function uploadFavicon(formData: FormData) {
  return api.post("/custom/uploadIcon", formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}
export async function updateAppName(name: string) {
  return api.post("/custom/updateName", { name });
}
// Atualiza nome no frontendNovo (manifest.json + layout.tsx) e no front legado
export async function updateAppNameNovo(name: string) {
  return api.post("/custom/updateNameNovo", { name });
}

// Branding frontendNovo – fazem upload para frontendNovo/public/ e espelham no frontend legado
export async function uploadLogoNovo(formData: FormData) {
  return api.post("/custom/uploadLogoNovo", formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}
export async function uploadLogoDarkNovo(formData: FormData) {
  return api.post("/custom/uploadLogoDarkNovo", formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}
export async function uploadFaviconNovo(formData: FormData) {
  return api.post("/custom/uploadIconNovo", formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}
export async function uploadPwaIconNovo(formData: FormData) {
  return api.post("/custom/uploadPwaIconNovo", formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}

// Branding – retorna nome do app + URLs das imagens
export async function fetchBranding() {
  return api.get("/custom/branding");
}

// Branding público (sem auth) – para login page e dashboard
export async function fetchPublicBranding() {
  // frontendNovo usa o endpoint Novo (inclui fontFamily/Weights/Source + avatarShape).
 // /publicBranding (sem sufixo) é mantido sem alteração para o front legado.
  return api.get("/publicBrandingNovo");
}

// Cores do sistema – GET retorna paleta atual; POST salva para todos os tenants
export async function fetchSystemColors() {
  return api.get("/custom/colors");
}
export async function saveSystemColors(colors: Record<string, string>) {
  return api.post("/custom/colors", { colors });
}
// Paleta dark mode
export async function fetchSystemColorsDark() {
  return api.get("/custom/colorsDark");
}
export async function saveSystemColorsDark(colors: Record<string, string>) {
  return api.post("/custom/colorsDark", { colors });
}
// Socket model novo (frontendNovo)
// Endpoint público — sem auth — para não derrubar conexão de usuários não-superadmin
export async function fetchSocketModelNovo() {
  return api.get("/public/socketModelNovo");
}
export async function updateSocketModelNovo(isOptimized: boolean) {
  return api.post("/custom/updateSocketModelNovo", { isOptimized });
}

// Login variant novo (frontendNovo) — rota pública para a tela de login
export async function fetchLoginVariantNovoPublic() {
  return api.get("/publicLoginVariantNovo");
}
export async function fetchLoginVariantNovo() {
  return api.get("/custom/getLoginVariantNovo");
}
export async function updateLoginVariantNovo(variant: string, showSideText?: boolean) {
  return api.post("/custom/updateLoginVariantNovo", { variant, ...(showSideText !== undefined && { showSideText }) });
}
export async function updateLoginSideTextNovo(showSideText: boolean) {
  return api.post("/custom/updateLoginVariantNovo", { showSideText });
}
export async function updateLoginShowRegisterButtonNovo(showRegisterButton: boolean) {
  return api.post("/custom/updateLoginVariantNovo", { showRegisterButton });
}
export async function updateLoginShowMasterKeyButtonNovo(showMasterKeyButton: boolean) {
  return api.post("/custom/updateLoginVariantNovo", { showMasterKeyButton });
}
export async function uploadLoginSideBg(formData: FormData) {
  return api.post("/custom/uploadLoginSideBg", formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}
export async function deleteLoginSideBg() {
  return api.delete("/custom/deleteLoginSideBg");
}

// Signup variant novo — config de internacionalização da tela de signup
export type PaymentGateway = "asaas" | "stripe" | "pagarme" | "mercadopago";
export interface SignupVariantConfig {
  enabled: boolean;
  documentMode: "br" | "international" | "hidden";
  documentRequired: boolean;
  documentLabel: string;
  phoneFormat: "br" | "international";
  phoneRequired: boolean;
  defaultCountry: string;
  skipPaymentGateway: boolean;
  // Read-only — derivado de payment-config.json pelo backend (não persistido aqui).
  paymentGateway?: PaymentGateway;
}
export async function fetchSignupVariantNovoPublic() {
  return api.get<SignupVariantConfig>("/publicSignupVariantNovo");
}
export async function fetchSignupVariantNovo() {
  return api.get<SignupVariantConfig>("/custom/getSignupVariantNovo");
}
export async function updateSignupVariantNovo(updates: Partial<SignupVariantConfig>) {
  return api.post<SignupVariantConfig>("/custom/updateSignupVariantNovo", updates);
}

// Sons de notificação
export async function fetchNotificationSounds() {
  return api.get("/custom/notificationSounds");
}
export async function uploadNotificationSound(type: string, formData: FormData) {
  return api.post(`/custom/uploadNotificationSound/${type}`, formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
}
export async function deleteNotificationSound(type: string) {
  return api.delete(`/custom/deleteNotificationSound/${type}`);
}
export async function deleteLogoNovo() {
  return api.delete("/custom/deleteLogoNovo");
}
export async function deleteLogoDarkNovo() {
  return api.delete("/custom/deleteLogoDarkNovo");
}
export async function deleteFaviconNovo() {
  return api.delete("/custom/deleteFaviconNovo");
}

export async function triggerMigration() {
  return api.post("/custom/migrate");
}
export async function triggerClean() {
  return api.post("/custom/clean");
}
export async function updateTenantMasterKey(tenantId: number, data: Record<string, unknown>) {
  return api.put(`/tenantsMasterKey/${tenantId}`, data);
}
export async function updateTenantForceLogout(tenantId: number, data: Record<string, unknown>) {
  return api.put(`/tenantsForceLogout/${tenantId}`, data);
}

// Migração de tenants
export async function migrateTenant(data: Record<string, unknown>) {
  return api.post("/admin/migrate-tenant", data);
}
export async function listMigrations() {
  return api.get("/admin/migrations");
}
export async function getMigrationProgress(id: number) {
  return api.get(`/admin/migrations/${id}`);
}
export async function resumeMigration(id: number, data?: { dbPassword: string; sshPassword?: string; sshPrivateKey?: string }) {
  return api.post(`/admin/migrations/${id}/resume`, data || {});
}
export async function listMigrationLogs(id: number) {
  return api.get(`/admin/migrations/${id}/logs`);
}

// Backup por tenant
export async function backupTenant(tenantId: number) {
  return api.post(`/backup/tenant/${tenantId}`, undefined, { timeout: BACKUP_REQUEST_TIMEOUT });
}
export async function listAvailableBackups(tenantId?: number) {
  return tenantId ? api.get(`/backups/tenant/${tenantId}`) : api.get("/backups");
}
export async function getBackupConfigs(tenantId: number) {
  return api.get(`/config/tenant/${tenantId}`);
}
export async function getAllBackupConfigs() {
  return api.get("/config/all");
}
export async function configureBackupForTenant(tenantId: number, data: Record<string, unknown>) {
  return api.post(`/config/tenant/${tenantId}`, data);
}
export async function updateBackupConfig(tenantId: number, data: Record<string, unknown>) {
  return api.post(`/config/tenant/${tenantId}`, data);
}
export async function deleteBackupConfig(configId: number) {
  return api.delete(`/config/${configId}`);
}
export async function recreateBackupConfig(tenantId: number) {
  return api.post(`/config/tenant/${tenantId}/recreate`);
}
export async function cleanOldBackups(tenantId: number) {
  return api.post(`/cleanup/tenant/${tenantId}`);
}
export async function cleanAllBackups() {
  return api.post("/cleanup/all");
}
export async function restoreTenant(tenantId: number, backupPath: string) {
  return api.post(`/restore/tenant/${tenantId}`, { backupPath });
}
export async function downloadBackupFile(tenantId: number, backupPath: string) {
  return api.post(`/download/tenant/${tenantId}`, { backupPath }, { responseType: "blob", timeout: 0 });
}
export async function deleteBackupFile(tenantId: number, backupPath: string) {
  return api.delete(`/delete/tenant/${tenantId}`, { data: { backupPath } });
}
