import api, { BACKGROUND_REQUEST } from "@/lib/api";

export interface BulkDispatch {
  id: number;
  status: string;
  totalContacts?: number;
  sentCount?: number;
  failedCount?: number;
  pendingMessages?: number;
  failedMessages?: number;
  sentMessages?: number;
  totalMessages?: number;
  message?: string;
  mediaUrl?: string;
  mediaDescription?: string;
  voiceUrl?: string;
  templateName?: string;
  templateLanguage?: string;
  minDelay?: number;
  maxDelay?: number;
  whatsappId?: number;
  dispatchType?: string;
  metadata?: {
    variables?: string[];
    contacts?: string[];
    sentContacts?: { contact: string; timestamp: string }[];
    [key: string]: unknown;
  };
  errors?: { contact: string; error: string; timestamp: string; code?: string; status?: number }[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  cancellationReason?: string | null;
  userId?: number | null;
  user?: { id: number; name: string } | null;
  whatsapp?: { id: number; name: string; type: string } | null;
}

export interface WabaTemplate {
  id: string;
  name: string;
  language: string;
  status?: string;
  category?: string;
  parameter_format?: string;
  components?: WabaTemplateComponent[];
}

export interface WabaTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  example?: { body_text?: string[][]; header_url?: string[]; body_text_named_params?: { param_name: string }[] };
}

/** Canais que suportam envio de texto simples (exclui WABA para uso em massa texto) */
export const BULK_TEXT_CHANNEL_TYPES = ["whatsapp", "baileys", "meow", "evo", "evogo", "zapi", "uazapi", "zapo"];

/** Canais WABA para template */
export const BULK_WABA_CHANNEL_TYPE = "waba";

// H6 — chave de idempotência gerada UMA vez por disparo e enviada no BODY
// (campo `idempotencyKey`), NÃO em header custom: o CORS do backend tem
// `allowedHeaders` em allowlist explícita — um header novo derrubaria o
// preflight e quebraria o disparo em massa (inclusive contra backend antigo).
// No body: backend novo lê e deduplica via jobKey (claim NX cross-worker);
// backend antigo ignora o campo extra (degradação graciosa = comportamento
// atual). Se o axios re-tentar o MESMO request, o body já carrega a mesma key
// — não regerar por retry.
const withIdempotencyKey = (data: FormData): FormData => {
  if (!data.has("idempotencyKey")) {
    data.append("idempotencyKey", crypto.randomUUID());
  }
  return data;
};

export async function sendBulkFast(data: FormData) {
  return api.post("/bulk", withIdempotencyKey(data), {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export async function sendBulkClose(data: FormData) {
  return api.post("/bulkClose", withIdempotencyKey(data), {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export async function sendBulkCloseJson(data: Record<string, unknown>) {
  return api.post("/bulkClose", { idempotencyKey: crypto.randomUUID(), ...data });
}

export async function sendBulkVariable(data: FormData) {
  return api.post("/bulkVariable", withIdempotencyKey(data), {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export async function sendBulkVariableJson(data: Record<string, unknown>) {
  return api.post("/bulkVariable", { idempotencyKey: crypto.randomUUID(), ...data });
}

export async function listDispatches(params?: {
  status?: string;
  dispatchType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: string;
}) {
  return api.get<{ rows: BulkDispatch[]; count: number } | BulkDispatch[]>("/bulk-dispatch", { params });
}

export async function createDispatch(data: Record<string, unknown>) {
  return api.post("/bulk-dispatch", data);
}

export async function showDispatch(id: number) {
  return api.get<BulkDispatch>(`/bulk-dispatch/${id}`);
}

export async function updateDispatch(id: number, data: Record<string, unknown>) {
  return api.put(`/bulk-dispatch/${id}`, data);
}

/** Destinatário do disparo com o status que o provedor confirmou depois do aceite */
export interface BulkDispatchReportRecipient {
  number: string;
  sentAt: string | null;
  messageId: string | null;
  accepted: boolean;
  dispatchError: string | null;
  providerStatus: "sent" | "delivered" | "read" | "failed" | null;
  providerError: unknown;
  /** "wamid" = casamento exato; "phone" = deduzido pelo número (disparo antigo) */
  matchedBy: "wamid" | "phone" | null;
}

export interface BulkDispatchReport {
  id: number;
  status: string;
  dispatchType: string;
  templateName: string | null;
  totalMessages: number;
  accepted: number;
  dispatchFailed: number;
  awaitingConfirmation: number;
  confirmedSent: number;
  confirmedDelivered: number;
  confirmedRead: number;
  confirmedFailed: number;
  hasApproximateMatch: boolean;
  recipients: BulkDispatchReportRecipient[];
}

/** Relatório por destinatário: número + status confirmado pelo provedor */
export async function getBulkDispatchReport(id: number) {
  return api.get<BulkDispatchReport>(`/bulk-dispatch/${id}/report`);
}

/** Fecha a conta do dispatch para eventos que só o front enxerga (ex.: falha de
 *  setup de contato/ticket nas telas de template). Best-effort. */
export async function incrementDispatch(
  id: number,
  data: { success: boolean; contact?: string; error?: { contact: string; error: string; timestamp: string | Date } }
) {
  return api.patch(`/bulk-dispatch/${id}/increment`, data);
}

// ── Pré-check v3 de conversa ativa (flag crossChannelTicketCheck) ────────────
// Usado pelas telas /massa/template e /massa/template-variavel ANTES de criar
// contato/ticket: número com ticket open/pending (qualquer canal) é pulado.
// Com bulkDispatchId presente, o backend registra o pulo no relatório
// (motivo "active_conversation") e o resumo ao dono sai na conclusão.
export interface BulkFilterRecipientsResponse {
  kept: string[];
  skipped: number;
  skippedNumbers: string[];
}

export async function filterBulkRecipients(data: {
  numbers: string[];
  bulkDispatchId?: number;
  dispatchLabel?: string;
}) {
  return api.post<BulkFilterRecipientsResponse>("/bulkFilterRecipients", data);
}

export async function fetchWabaTemplates(whatsappId: number) {
  return api.get<WabaTemplate[]>(`/waba/templates/${whatsappId}`);
}

// ── SMS endpoints ──────────────────────────────────────────────────────────

export interface SmsBulkPayload {
  arrayNumbers: string[];
  message: string;
  min: number;
  max: number;
  importContact?: boolean;
}

/**
 * Resposta do envio em massa. Backend anterior a 2026-09-25 devolve só `message`
 * (Conecta/BHI) ou `summary` sem `notAttempted` (Comtele).
 */
export interface SmsBulkResult {
  message?: string;
  summary?: { total: number; success: number; errors: number; notAttempted?: number };
  aborted?: boolean;
  code?: string;
  errors?: { phoneNumber: string; error: string; status?: number; code?: string }[];
}

// O servidor responde só depois do último número, esperando o intervalo entre
// cada um: o teto padrão de 30 s cortava listas a partir de ~3 números.
const BULK_SMS_REQUEST = { timeout: 0 };

/** Comtele */
export async function sendBulkSms(data: SmsBulkPayload) {
  return api.post<SmsBulkResult>("/bulkSms", data, BULK_SMS_REQUEST);
}

/** ConectaStartup */
export async function sendBulkSmsConecta(data: SmsBulkPayload) {
  return api.post<SmsBulkResult>("/bulkSmsConecta", data, BULK_SMS_REQUEST);
}

/** BHI / Livson */
export async function sendBulkSmsLivson(data: SmsBulkPayload) {
  return api.post<SmsBulkResult>("/bulkSmsLivson", data, BULK_SMS_REQUEST);
}

// ── SMS em massa em SEGUNDO PLANO (docs/PLANO_SMS_MASSA_SEGUNDO_PLANO.md §5.1) ──
// O servidor responde na hora (202) e envia sozinho; a tela acompanha por consulta.
// Backend antigo não tem estas rotas (404 sem código) → a tela usa as funções
// síncronas acima, exatamente como antes.

export type SmsBulkProvider = "comtele" | "conecta" | "livson";

export interface SmsBulkDispatchStartPayload {
  provider: SmsBulkProvider;
  arrayNumbers: string[];
  message: string;
  minDelay: number;
  maxDelay: number;
}

export interface SmsBulkDispatchStartResult {
  bulkDispatchId: number;
  total: number;
  removedDuplicates: number;
}

/** Retorno enxuto (sem a lista de números): usado no acompanhamento. */
export interface SmsBulkDispatchLean {
  id: number;
  userId: number | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  totalMessages: number;
  sentMessages: number;
  failedMessages: number;
  pendingMessages: number;
  startedAt: string | null;
  completedAt: string | null;
  /** `user`, `ERR_SMS_INVALID_KEY`, `ERR_SMS_PROVIDER_REJECTED`, `ERR_SMS_BULK_INTERRUPTED` */
  cancellationReason: string | null;
  errors?: { contact: string; error: string; timestamp: string; code?: string; status?: number }[];
}

/** Disparo ainda rodando no servidor. */
export const isSmsBulkDispatchActive = (d: Pick<SmsBulkDispatchLean, "status"> | null | undefined) =>
  !!d && (d.status === "pending" || d.status === "processing");

/**
 * Código de erro da resposta. O interceptor rejeita com o `response` do axios
 * (`err.data`); AppError 409 chega como `{message: <código>}`, os demais como
 * `{error: <código>}`.
 */
export function readBulkSmsErrorCode(err: unknown): string | undefined {
  const e = err as {
    data?: { error?: unknown; message?: unknown };
    response?: { data?: { error?: unknown; message?: unknown } };
  } | null;
  const data = e?.data ?? e?.response?.data;
  const code = data?.error ?? data?.message;
  return typeof code === "string" ? code : undefined;
}

export function readBulkSmsErrorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
}

/** Corpo extra do erro (ex.: `bulkDispatchId` do 409 "já em andamento"). */
export function readBulkSmsErrorData(err: unknown): Record<string, unknown> | undefined {
  const e = err as { data?: unknown; response?: { data?: unknown } } | null;
  const data = e?.data ?? e?.response?.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
}

/** 404 sem código `ERR_*` = rota inexistente (backend anterior a esta entrega). */
export function isLegacyBackend404(err: unknown): boolean {
  if (readBulkSmsErrorStatus(err) !== 404) return false;
  const code = readBulkSmsErrorCode(err);
  return !code || !code.startsWith("ERR_");
}

/** Códigos que mandam a tela para o envio síncrono de antes. */
export const SMS_BULK_FALLBACK_CODES = [
  "ERR_SMS_BULK_BACKGROUND_DISABLED",
  "ERR_SMS_BULK_BACKGROUND_UNAVAILABLE",
];

export async function startBulkSmsDispatch(data: SmsBulkDispatchStartPayload) {
  return api.post<SmsBulkDispatchStartResult>("/bulkSmsDispatch", data);
}

export async function fetchActiveBulkSmsDispatch() {
  return api.get<{ dispatch: SmsBulkDispatchLean | null }>("/bulkSmsDispatch/active", BACKGROUND_REQUEST);
}

export async function fetchBulkSmsDispatch(id: number, opts?: { withErrors?: boolean }) {
  return api.get<SmsBulkDispatchLean>(`/bulkSmsDispatch/${id}`, {
    ...BACKGROUND_REQUEST,
    params: opts?.withErrors ? { withErrors: 1 } : undefined,
  });
}

export async function cancelBulkSmsDispatch(id: number) {
  return api.post<{ id: number; status: string }>(`/bulkSmsDispatch/${id}/cancel`);
}

export async function sendWabaTemplate(data: {
  whatsappId: number;
  contactId?: number;
  ticketId?: number;
  templateId: string;
  templateName: string;
  language: string;
  components?: Record<string, unknown>[];
}) {
  return api.post("/waba/send-template", data);
}
