import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
  [key: string]: unknown;
}

export interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
  [key: string]: unknown;
}

export interface WABATemplate {
  id?: string;
  name: string;
  language: string;
  status?: string;
  category: string;
  components?: TemplateComponent[];
  [key: string]: unknown;
}

export interface AppWaba {
  id: string | number;
  name: string;
  appId?: string;
  apiVersion?: string;
  configId?: string;
  [key: string]: unknown;
}

export interface PhoneRegistrationData {
  phoneNumberId: string;
  wabaId: string;
  wabaVersion: string;
  wabaToken: string;
  pin?: string;
  [key: string]: unknown;
}

export interface WebhookData {
  callbackUrl: string;
  verifyToken: string;
  [key: string]: unknown;
}

export interface SIPData {
  hostname: string;
  port: string | number;
  [key: string]: unknown;
}

export interface ProfileData {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: string[];
  [key: string]: unknown;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(tokenApi: string) {
  return api.get(`/wabametaTemplate/${tokenApi}`);
}

export async function listTemplatesByWhatsappId(whatsappId: number) {
  return api.get(`/waba/templates/${whatsappId}`);
}

export async function createTemplate(data: Record<string, unknown>) {
  return api.post("/wabametaTemplateCreate", data);
}

export async function editTemplate(data: Record<string, unknown>) {
  return api.put("/wabametaTemplateEdit", data);
}

export async function deleteTemplate(data: Record<string, unknown>) {
  return api.delete("/wabametaTemplateDelete", { data });
}

// ─── Phone Management ─────────────────────────────────────────────────────────

export async function verifyPhone(data: Record<string, unknown>) {
  return api.post("/wabametaVerifyPhone", data);
}

export async function verifyBms(data: Record<string, unknown>) {
  return api.post("/wabametaVerifyBms", data);
}

export async function registerPhone(data: Record<string, unknown>) {
  return api.post("/wabametaRegisterPhone", data);
}

export async function getPhoneById(data: Record<string, unknown>) {
  return api.post("/wabametaGetPhoneById", data);
}

export async function requestVerificationCode(data: Record<string, unknown>) {
  return api.post("/wabametaRequestVerificationCode", data);
}

export async function verifyCode(data: Record<string, unknown>) {
  return api.post("/wabametaVerifyCode", data);
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export async function overrideCallbackUrl(data: Record<string, unknown>) {
  return api.post("/wabametaOverrideCallbackUrl", data);
}

export async function overrideCallbackCoexUrl(data: Record<string, unknown>) {
  return api.post("/wabametaOverrideCallbackCoexUrl", data);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(data: Record<string, unknown>) {
  return api.post("/wabametaGetProfile", data);
}

export async function updateProfile(data: Record<string, unknown>) {
  return api.post("/wabametaUpdateProfile", data);
}

// ─── SIP ──────────────────────────────────────────────────────────────────────

export async function configureSIP(data: Record<string, unknown>) {
  return api.post("/wabametaConfigureSIP", data);
}

export async function enableWabaWebRTCCalling(data: Record<string, unknown>) {
  return api.post("/wabametaEnableWebRTCCalling", data);
}

// ─── WABA Data & Analytics ────────────────────────────────────────────────────

export async function getWABAData(data: Record<string, unknown>) {
  return api.post("/wabametaGetWABAData", data);
}

export async function getWABAAnalytics(data: Record<string, unknown>) {
  return api.post("/wabametaGetWABAAnalytics", data);
}

export async function getWABATemplateAnalytics(data: Record<string, unknown>) {
  return api.post("/wabametaGetWABATemplateAnalytics", data);
}

export async function getWABALimitsInfo() {
  return api.get("/wabametaGetWABALimitsInfo");
}

/** Contagem local de mensagens enviadas (fromMe) do canal para estimativa de custo (novo modelo por mensagem da Meta). */
export async function getWABASentMessagesCost(data: { whatsappId: number; startDate: string; endDate: string }) {
  return api.post("/wabametaGetSentMessagesCost", data);
}

export async function getWABAPhoneNumbers(data: Record<string, unknown>) {
  return api.post("/wabametaGetWABAPhoneNumbers", data);
}

// ─── Embedded Signup ──────────────────────────────────────────────────────────

export async function exchangeEmbeddedSignupCode(data: Record<string, unknown>) {
  return api.post("/wabametaExchangeEmbeddedSignupCode", data);
}

// Coexistência: pede sync do histórico/contatos do WhatsApp Business App
// (dados chegam via webhooks history/smb_app_state_sync). Meta só aceita o
// request em até 24h após o onboarding.
export async function requestSmbAppDataSync(data: { whatsappId: number; syncType: "history" | "smb_app_state_sync" | "media_reupload" }) {
  return api.post("/wabametaSmbAppDataSync", data);
}

// ─── App WABA (for Facebook login) ────────────────────────────────────────────

export async function listActiveAppWabas() {
  return api.get<AppWaba[]>("/app-waba-tenantActive");
}

// ─── Whatsapp creation (for creating WABA channels) ───────────────────────────

export async function createWhatsapp(data: Record<string, unknown>) {
  return api.post("/whatsapp", data);
}

// ─── Channel info ──────────────────────────────────────────────────────────────

export async function getInstagramChannelInfo(whatsappId: number) {
  return api.get(`/instagramMetaChannelInfo/${whatsappId}`);
}

export async function getFacebookChannelInfo(whatsappId: number) {
  return api.get(`/facebookMetaChannelInfo/${whatsappId}`);
}
