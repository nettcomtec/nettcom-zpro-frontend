import api from "@/lib/api";

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
  errors?: { contact: string; error: string; timestamp: string }[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
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

/** Comtele */
export async function sendBulkSms(data: SmsBulkPayload) {
  return api.post("/bulkSms", data);
}

/** ConectaStartup */
export async function sendBulkSmsConecta(data: SmsBulkPayload) {
  return api.post("/bulkSmsConecta", data);
}

/** BHI / Livson */
export async function sendBulkSmsLivson(data: SmsBulkPayload) {
  return api.post("/bulkSmsLivson", data);
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
