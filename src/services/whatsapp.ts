import api from "@/lib/api";

export interface WhatsappPhone {
  pushname?: string;
  name?: string;
  phone?: string;
}

export type BaileysLib = "fork" | "v7" | "infiniteapi";
export type BaileysAuthStore = "files" | "sqlite";

export interface Whatsapp {
  id: number;
  name: string;
  status: string;
  number: string;
  battery: string;
  /** Canal: 'waba' | 'instagram' | 'messenger' | 'baileys' | 'whatsapp' | 'dialog360' | 'gupshup' | ... */
  type: string;
  isDefault: boolean;
  plugged: boolean;
  updatedAt: string;
  createdAt: string;
  qrcode?: string;
  wppPass?: string;
  wppUser?: string;
  profilePic?: string;
  phone?: WhatsappPhone;

  chatFlowId?: number | null;
  queueId?: number | null;
  userId?: number | null;
  queueIdImportMessages?: number | null;
  isActive?: boolean;
  // Preenchido quando o backend auto-desativou o canal (circuit breaker de boot:
  // N falhas seguidas de conexao). Null = Contingencia desligada manualmente.
  autoDisabledAt?: string | null;
  tenantId?: number;
  wabaCallQueueId?: number | null;

  // WABA hibrido (PLANO_WABA_HIBRIDO_PINGPONG F1):
  // 'disabled' | 'two_numbers' | 'coexistence'. Default backend = 'disabled'.
  hybridMode?: string;
  // Canal de transporte vinculado (obrigatorio em coexistence; type baileys).
  linkedChannelId?: number | null;
  // Coexistencia: botoes/listas seguem nativos pela API oficial (nao degradam
  // para menu numerado no canal vinculado). Default backend = false.
  hybridNativeInteractive?: boolean;
  // Mercado Livre: trata reclamacoes (claims) e pedidos (orders_v2) alem de
  // mensagens e perguntas. Default backend = false.
  mlEventsEnabled?: boolean;
  // Instagram: comentario em post/reels abre atendimento. Default backend = true;
  // false = canal so com DM (automacoes de comentario seguem rodando).
  igCommentsCreateTickets?: boolean;

  tokenAPI?: string;
  wabaId?: string;
  baileysLib?: BaileysLib;
  baileysAuthStore?: BaileysAuthStore;
  bmToken?: string;
  wabaVersion?: string;
  appId?: string;
  tokenTelegram?: string;
  fbPageId?: string;

  // Channel Activation Ticket (CAT) — WABA/IG/Messenger/Evolution/Zapi/Uazapi/Meow
  activationTicket?: string | null;
  activationTicketExpiresAt?: string | null;
  activationTicketPid?: string | null;
  // Motivo da falha persistente no boot run ("proxy_unreachable" | "license_invalid" | "no_pid")
  activationTicketError?: string | null;

  // Origem do canal Meta: "own_app" (AppWaba proprio, override -> backend) ou
  // "zdg_oauth" (via embedded signup, override -> proxy). NULL = legacy.
  webhookOrigin?: "own_app" | "zdg_oauth" | null;
  // Quando true: origem foi trocada para zdg_oauth mas o registro no proxy
  // ou o override Meta ainda nao foi confirmado. O guard continua exigindo CAT.
  webhookNeedsRevalidation?: boolean;
  fbObject?: { name?: string };
  rescueWindow?: string;
  rescueWindowMessage?: string;
  queuePositionEnabled?: string;
  queuePositionMessage?: string;
  queuePositionAvgMinutes?: number | null;

  // Baileys import
  importMessages?: boolean;
  importOldMessagesGroups?: boolean;
  closedTicketsPostImported?: boolean;
  importStartDate?: string;
  importStartTime?: string;
  importEndDate?: string;
  importEndTime?: string;
  messageQueue?: number | null;

  // WebMail SMTP/IMAP config
  smtpConfig?: {
    host?: string;
    port?: number;
    secure?: boolean;
    from?: string;
    replyTo?: string;
    auth?: { user?: string; pass?: string };
    imap?: { host?: string; port?: number; tls?: boolean };
    oauth2?: { client_id?: string; client_secret?: string; redirect_uri?: string; access_token?: string };
    [key: string]: unknown;
  };

  // ChatGPT
  chatgptApiKey?: string;
  chatgptOrganizationId?: string;
  chatgptBaseUrl?: string;
  chatgptOff?: string;
  chatgptPrompt?: string;
  assistantId?: string;
  chatgptModel?: string;
  chatgptVoiceModel?: string;
  chatgptVoice?: string;

  // Typebot
  typebotUrl?: string;
  typebotName?: string;
  typebotRestart?: string;
  typebotOff?: string;
  typebotUnknowMessage?: string;
  typebotButtonChoiceMessage?: string;
  isButton?: string;

  // Dify
  difyKey?: string;
  difyUrl?: string;
  difyType?: string;
  difyRestart?: string;
  difyOff?: string;

  // N8N
  n8nUrl?: string;

  // Webhook por canal
  channelWebhook?: string;
  channelWebhookUrl?: string;
  channelWebhookMessage?: string;

  // PIX defaults
  pixDefaultKey?: string;
  pixDefaultType?: string;
  pixDefaultName?: string;
  pixDefaultMessage?: string;

  // Ollama
  ollamaUrl?: string;
  ollamaModel?: string;
  ollamaPrompt?: string;
  ollamaOff?: string;

  // LM Studio
  lmUrl?: string;
  lmModel?: string;
  lmPrompt?: string;
  lmOff?: string;

  // Grok
  grokUrl?: string;
  grokModel?: string;
  grokPrompt?: string;
  grokOff?: string;

  // Gemini
  geminiUrl?: string;
  geminiModel?: string;
  geminiPrompt?: string;
  geminiOff?: string;

  // DeepSeek
  deepseekUrl?: string;
  deepseekModel?: string;
  deepseekPrompt?: string;
  deepseekOff?: string;

  // Qwen
  qwenUrl?: string;
  qwenModel?: string;
  qwenPrompt?: string;
  qwenOff?: string;

  // Claude
  claudeUrl?: string;
  claudeModel?: string;
  claudePrompt?: string;
  claudeOff?: string;

  // Dialogflow
  dialogflowProjectId?: string;
  dialogflowLanguage?: string;
  dialogflowOff?: string;
  dialogflowJsonFilename?: string;
  dialogflowJson?: string;

  // Features
  farewellMessage?: string;
  farewellMediaUrls?: string[];
  farewellTemplate?: unknown;
  inactivityConfig?: unknown;
  sendEvaluation?: string;
  transcribeAudio?: string;
  transcribeAudioJson?: string;
  selfDistribute?: string;
  destroyMessage?: string;
  birthdayDate?: string;
  birthdayDateMessage?: string;
  birthdayDateFileName?: string;
  birthdayDateHour?: string;
  birthdayDateTemplate?: string;
  ignoreBussinesHours?: string;
  disableExternalIntegration?: string;
  waitProcessExternalInteraction?: string;
  webPush?: string;
  closeKeyWord?: string;
  wavoipToken?: string;

  // Auto-reassign
  autoReassign?: string;
  autoReassignStatus?: string;
  autoReassignMethod?: string;
  autoReassignIntervalMinutes?: number;

  // Proxy
  proxyUrl?: string;
  proxyUser?: string;
  proxyPass?: string;
}

// ─── fetchWhatsapps dedup/coalescing (2F.5) ──────────────────────────────
// ~50 componentes chamam fetchWhatsapps quase juntos ao montar -> dezenas de
// GET /whatsapp identicos em paralelo (thundering herd, pior sob cluster).
// Coalescemos por chave: (a) promise IN-FLIGHT compartilhada -> chamadas
// concorrentes recebem a MESMA promise; (b) cache de resultado com TTL curto
// -> chamadas dentro da janela recebem o ultimo AxiosResponse resolvido.
// Em erro NAO cacheamos e limpamos a in-flight (deixa re-tentar).
// Estado em variaveis de modulo: a funcao so roda no client (SSR nao chama).
type WhatsappsResponse = Awaited<ReturnType<typeof api.get<Whatsapp[]>>>;

const WHATSAPPS_CACHE_TTL_MS = 1500;

interface WhatsappsCacheEntry {
  response: WhatsappsResponse;
  at: number;
}

const whatsappsInFlight = new Map<string, Promise<WhatsappsResponse>>();
const whatsappsCache = new Map<string, WhatsappsCacheEntry>();

// Higiene multi-tenant: chamado no logout (clearAuth do auth-store) para que um
// login seguinte na mesma aba, dentro do TTL, nao veja canais do usuario anterior.
export function clearWhatsappsCache(): void {
  whatsappsCache.clear();
  whatsappsInFlight.clear();
}

/**
 * Lista os canais do tenant (GET /whatsapp).
 *
 * Assinatura publica preservada: retorna o AxiosResponse completo
 * (Promise<AxiosResponse<Whatsapp[]>>), como esperado pelos ~50 callers
 * (`{ data } = await ...`, `.then(res => res.data)`, `.catch(() => ({ data: [] }))`).
 *
 * @param force quando true, ignora cache/in-flight e dispara um GET novo
 *              (o resultado ainda popula o cache para os proximos). Default false.
 */
export async function fetchWhatsapps(force: boolean = false) {
  // Sem params relevantes hoje -> dedup global. A chave centraliza o ponto de
  // extensao caso fetchWhatsapps passe a receber filtros que mudem o resultado.
  const key = "/whatsapp";

  if (!force) {
    const cached = whatsappsCache.get(key);
    if (cached && Date.now() - cached.at < WHATSAPPS_CACHE_TTL_MS) {
      return cached.response;
    }

    const inflight = whatsappsInFlight.get(key);
    if (inflight) {
      return inflight;
    }
  }

  const request = api
    .get<Whatsapp[]>("/whatsapp")
    .then((response) => {
      whatsappsCache.set(key, { response, at: Date.now() });
      return response;
    })
    .finally(() => {
      // Limpa a in-flight ao resolver/rejeitar. Em erro nada foi cacheado
      // (o .then de cache nao roda), entao a proxima chamada re-tenta.
      whatsappsInFlight.delete(key);
    });

  whatsappsInFlight.set(key, request);
  return request;
}

export async function fetchWhatsapp(whatsappId: number) {
  return api.get<Whatsapp>(`/whatsapp/${whatsappId}`);
}

export async function createWhatsapp(data: Record<string, unknown>) {
  return api.post("/whatsapp", data);
}

export async function updateWhatsapp(whatsappId: number, data: Record<string, unknown> | FormData) {
  return api.put(`/whatsapp/${whatsappId}`, data);
}

export async function deleteWhatsapp(whatsappId: number) {
  return api.delete(`/whatsapp/${whatsappId}`);
}

export async function requestNewQrCode(whatsappId: number) {
  return api.put(`/whatsappsession/${whatsappId}`, { id: whatsappId, isQrcode: true });
}

export async function connectSession(whatsappId: number) {
  return api.post(`/whatsappsession/${whatsappId}`);
}

export async function disconnectSession(whatsappId: number) {
  return api.delete(`/whatsappsession/${whatsappId}`);
}

export async function revalidateSession(whatsappId: number) {
  return api.post(`/whatsappsession/${whatsappId}/revalidate`);
}

export async function getBaileysCredsStatus(whatsappId: number) {
  return api.get(`/whatsappsession/${whatsappId}/baileys-creds-status`);
}

export async function setDefaultWhatsapp(whatsappId: number, isDefault: boolean = true) {
  return api.post("/setDefault", { whatsappId, isDefault });
}

export async function resetBaileysConnection(whatsappId: number) {
  return api.post(`/whatsapp/${whatsappId}/reset-baileys`);
}

/**
 * Troca a lib Baileys do canal (admin/superadmin). Quando newLib='fork' e a
 * atual e 'v7', o backend executa DELETE preventivo das entradas v7-only em
 * BaileysSessions (lid-mapping*, device-list*, tctoken*) antes do UPDATE.
 * Procedimento equivalente em docs/RUNBOOK_BAILEYS_V7_ROLLBACK.md.
 */
export async function updateBaileysLib(whatsappId: number, baileysLib: BaileysLib) {
  return api.patch<Whatsapp>(`/whatsapp/${whatsappId}/baileys-lib`, { baileysLib });
}

/**
 * Troca o armazenamento do auth state Signal do canal (admin/superadmin).
 * 'sqlite' exige baileysLib='infiniteapi'. files -> sqlite migra o estado na
 * proxima conexao (sem novo QR); sqlite -> files copia creds de volta.
 */
export async function updateBaileysAuthStore(whatsappId: number, baileysAuthStore: BaileysAuthStore) {
  return api.patch<Whatsapp>(`/whatsapp/${whatsappId}/baileys-auth-store`, { baileysAuthStore });
}

/**
 * PLANO_ZAPO §13 (F12) — migra um canal baileys para zapo SEM novo QR
 * (conversao do auth state via wa-store-migrate; mesma sessao/aparelho).
 * O backend valida pareamento/canais permitidos/licenca, derruba o baileys
 * sem logout e religa o canal ja como zapo. Admin/superadmin (custom via
 * permissao sessions_manage).
 */
export async function migrateBaileysToZapo(whatsappId: number) {
  // Timeout estendido: a migração é síncrona no backend (quiesce + conversão
  // do auth state + reconexão até o connection:open) e estoura fácil os 30s
  // default do client — o 200 só volta com o canal já CONNECTED como zapo.
  return api.post<{ id: number; type: string; status: string }>(
    `/zapo-migrate/${whatsappId}`,
    undefined,
    { timeout: 180000 }
  );
}

export async function removeProfilePicture(whatsappId: number) {
  return api.post(`/whatsappRemovePicture/${whatsappId}`);
}

/**
 * Self-heal da foto Meta (waba/instagram/messenger): a profile_picture_url da
 * Graph API expira em algumas horas. Em vez de apagar a foto quando a <img>
 * falha, re-buscamos uma URL nova no backend (que persiste + emite socket).
 */
export async function refreshMetaProfilePic(whatsappId: number) {
  return api.post<{ profilePic: string | null; refreshed: boolean }>(
    `/whatsappRefreshPicture/${whatsappId}`
  );
}

export async function closeAllOpenTickets(whatsappId: number) {
  return api.post("/closeAllOpen", { whatsappId });
}

export async function closeAllPendingTickets(whatsappId: number) {
  return api.post("/closeAllPending", { whatsappId });
}

// ─── Webhook re-registration helpers ─────────────────────

/** Hub: POST /hub-channel-setagain/ — reregisters webhook for a Hub channel */
export async function setHubWebhookAgain(data: Record<string, unknown>) {
  return api.post("/hub-channel-setagain/", data);
}

/** Evo: POST /evo-setwebhook/:wabaId — reregisters webhook for an Evolution channel */
export async function setEvoWebhookAgain(wabaId: string, data: Record<string, unknown>) {
  return api.post(`/evo-setwebhook/${wabaId}`, data);
}

/** Evolution Go: POST /evogo-setwebhook/:wabaId — reregisters webhook for an Evolution Go channel */
export async function setEvoGoWebhookAgain(wabaId: string, data: Record<string, unknown>) {
  return api.post(`/evogo-setwebhook/${wabaId}`, data);
}

/** Meow: POST /meow-setwebhook/:wabaId — reregisters webhook for a Meow channel */
export async function setMeowWebhookAgain(wabaId: string, data: Record<string, unknown>) {
  return api.post(`/meow-setwebhook/${wabaId}`, data);
}

/** Z-API: POST /zapi-setwebhook/:wabaId — reregisters webhook for a Z-API channel */
export async function setZapiWebhookAgain(wabaId: string, data: Record<string, unknown>) {
  return api.post(`/zapi-setwebhook/${wabaId}`, data);
}

/** UaZapi: POST /uazapi-setwebhook/:wabaId — reregisters webhook for a UaZapi channel */
export async function setUazapiWebhookAgain(wabaId: string, data: Record<string, unknown>) {
  return api.post(`/uazapi-setwebhook/${wabaId}`, data);
}

/** WABA: POST /wabametaOverrideCallbackUrl — reregisters main webhook for a WABA channel */
export async function setWabaWebhookAgain(data: Record<string, unknown>) {
  return api.post("/wabametaOverrideCallbackUrl", data);
}

/** WABA Coex: POST /wabametaOverrideCallbackCoexUrl — reregisters coex webhook for a WABA channel */
export async function setWabaCoexWebhookAgain(data: Record<string, unknown>) {
  return api.post("/wabametaOverrideCallbackCoexUrl", data);
}

/** Instagram: POST /instagramMetaOverrideCallbackUrl — reregisters webhook for an Instagram channel */
export async function setInstagramWebhookAgain(data: Record<string, unknown>) {
  return api.post("/instagramMetaOverrideCallbackUrl", data);
}

/** Messenger: POST /messengerMetaOverrideCallbackUrl — reregisters webhook for a Messenger channel */
export async function setMessengerWebhookAgain(data: Record<string, unknown>) {
  return api.post("/messengerMetaOverrideCallbackUrl", data);
}

/**
 * License check via proxy (serverside, fora do zpro).
 * GET /license-check — retorna 200 { ok: true } se licenca valida, 403 se invalida.
 * Cache de 12h gerenciado no backend por tenantId.
 */
export async function checkLicenseProxy() {
  return api.get("/license-check");
}

/**
 * Renova o Channel Activation Ticket do canal. Exibido como botao
 * "Renovar ativacao" na UI de /sessoes.
 */
export async function refreshActivationTicket(whatsappId: number) {
  return api.post<{
    success: boolean;
    activationTicketExpiresAt?: string | null;
    activationTicketPid?: string | null;
  }>(`/whatsapp/${whatsappId}/refresh-activation-ticket`);
}

/**
 * Passkey Linker (Abordagem B) — pede ao backend a linkUrl assinada do conector
 * (wa-link.html no oauth-proxy). O front gera o nonce e passa o proprio origin
 * (returnOrigin); a licenca e validada no proxy (Gate ①). POST /whatsapp/:id/wa-link-init.
 */
export async function waLinkInit(
  whatsappId: number,
  params: { returnOrigin: string; nonce: string }
) {
  return api.post<{ linkUrl: string }>(
    `/whatsapp/${whatsappId}/wa-link-init`,
    params
  );
}

/**
 * Passkey Linker — importa as creds extraidas pela extensao e conecta o canal
 * sem QR. POST /whatsapp/:id/import-web-session.
 */
export async function importWebSession(
  whatsappId: number,
  creds: Record<string, unknown>
) {
  return api.post<{ status: string }>(
    `/whatsapp/${whatsappId}/import-web-session`,
    { creds }
  );
}

export interface CATChannelSummary {
  id: number;
  name: string;
  type: string;
}

export interface CATStatusResponse {
  mode: "disabled" | "monitor" | "enforce";
  graceRemainingDays: number | null;
  channels: {
    total: number;
    withCat: number;
    withoutCat: number;
    expired: number;
    expiringSoon: number;
    withoutCatList?: CATChannelSummary[];
    expiredList?: CATChannelSummary[];
    expiringSoonList?: CATChannelSummary[];
  };
  needsAttention: number;
}

/**
 * Visao geral da saude do CAT para o tenant. Exibido como banner/badge
 * na pagina /sessoes quando ha canais problematicos ou estamos proximos
 * da transicao monitor -> enforce.
 */
export async function fetchCATStatus() {
  return api.get<CATStatusResponse>("/whatsapp/cat-status");
}

/**
 * Atualiza a origem de um canal Meta (waba/instagram/messenger):
 *   - own_app   -> override_callback_uri default = backend do zpro
 *   - zdg_oauth -> override_callback_uri default = proxy oauth.techprovider.com.br
 *
 * Admin deve revalidar webhook apos mudar para Meta receber o novo destino.
 */
export async function updateWebhookOrigin(whatsappId: number, origin: "own_app" | "zdg_oauth") {
  if (!whatsappId || !Number.isFinite(Number(whatsappId))) {
    throw new Error("updateWebhookOrigin: whatsappId invalido");
  }
  return api.put<{
    success: boolean;
    whatsappId: number;
    webhookOrigin: "own_app" | "zdg_oauth";
    needsRevalidation: boolean;
    reason: string;
    detail?: string;
  }>(`/whatsapp/${whatsappId}/webhook-origin`, { origin });
}

/**
 * Chamado apos o popup OAuth de revalidacao fechar com sucesso. Limpa a flag
 * webhookNeedsRevalidation no canal para que o guard do backend volte a confiar
 * em origem=zdg_oauth sem exigir CAT.
 */
export async function confirmWebhookRevalidation(whatsappId: number) {
  if (!whatsappId || !Number.isFinite(Number(whatsappId))) {
    throw new Error("confirmWebhookRevalidation: whatsappId invalido");
  }
  return api.post<{ success: boolean; whatsappId: number }>(
    `/whatsapp/${whatsappId}/confirm-webhook-revalidation`
  );
}

export interface WABATemplate {
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: unknown[];
  [key: string]: unknown;
}

export async function fetchWABATemplates(tokenApi: string): Promise<WABATemplate[]> {
  const { data } = await api.get(`/wabametaTemplate/${encodeURIComponent(tokenApi)}`);
  // API may return { data: [...] } or directly an array; filter only APPROVED templates
  const list: WABATemplate[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  return list.filter((t) => !t.status || t.status === "APPROVED");
}
