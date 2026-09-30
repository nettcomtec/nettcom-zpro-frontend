import api from "@/lib/api";
import type { EmailDesign } from "@/lib/email-design";

/**
 * Leitura de erro de API: `lib/api.ts` rejeita com `error.response || error`, então
 * status/corpo ficam na RAIZ na maioria dos casos (e em `response` só no erro cru).
 */
export function readApiError(err: unknown): { status?: number; code?: string } {
  const e = err as {
    status?: number;
    data?: { error?: string; message?: string };
    response?: { status?: number; data?: { error?: string; message?: string } };
  } | null;
  const status = e?.status ?? e?.response?.status;
  const data = e?.data ?? e?.response?.data;
  return { status, code: data?.error || data?.message };
}

export interface EmailTemplateAttachment {
  key: string;
  filename: string;
  contentType?: string;
  size?: number;
}

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  html?: string;
  text?: string | null;
  attachments?: EmailTemplateAttachment[] | null;
  isActive: boolean;
  userId?: number | null;
  /** 1 = feito no editor visual; ausente em backend antigo (PLANO_EMAIL_EDITOR_VISUAL) */
  editorVersion?: number | null;
  /** Projeto do editor visual (só no Show); a CHAVE presente indica backend novo */
  designJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailBlacklistEntry {
  id: number;
  email: string;
  reason?: string | null;
  contactId?: number | null;
  contact?: { id: number; name: string } | null;
  user?: { id: number; name: string } | null;
  sourceCampaign?: { id: number; name: string } | null;
  createdAt: string;
}

export interface EmailTemplatePayload {
  name: string;
  subject: string;
  html: string;
  text?: string;
  keepAttachmentKeys?: string[];
  files?: File[];
  /**
   * Projeto do editor visual: objeto = grava; `null` = desliga os blocos (limpa);
   * `undefined` = não envia (backend limpa só se o HTML mudar de fato).
   */
  designJson?: EmailDesign | null;
}

const buildTemplateFormData = (payload: EmailTemplatePayload): FormData => {
  const fd = new FormData();
  fd.append("name", payload.name);
  fd.append("subject", payload.subject);
  fd.append("html", payload.html);
  if (payload.text !== undefined) fd.append("text", payload.text);
  if (payload.keepAttachmentKeys !== undefined) {
    fd.append("keepAttachmentKeys", JSON.stringify(payload.keepAttachmentKeys));
  }
  // JSON como string (PLANO_EMAIL_MASSA D13: FormData transforma objeto em "[object Object]")
  if (payload.designJson !== undefined) {
    fd.append("designJson", payload.designJson ? JSON.stringify(payload.designJson) : "");
  }
  (payload.files || []).forEach(f => fd.append("medias", f));
  return fd;
};

export interface EmailEditorCapabilities {
  /** Backend guarda o projeto visual (colunas presentes) */
  design: boolean;
  /** Base pública das imagens de e-mail (null = servidor mal configurado) */
  assetBaseUrl: string | null;
}

let capabilitiesRequest: Promise<EmailEditorCapabilities | null> | null = null;

/**
 * Capacidades do editor visual. Cache de sessão SÓ de sucesso e de 404 (backend
 * antigo → null → só editor clássico). Qualquer outro erro (503, timeout, 401)
 * devolve null SEM cache — a próxima chamada tenta de novo.
 */
export function fetchEmailEditorCapabilities(): Promise<EmailEditorCapabilities | null> {
  if (capabilitiesRequest) return capabilitiesRequest;
  const request = api
    .get("/email-editor/capabilities")
    .then(({ data }) => ({
      design: data?.design === true,
      assetBaseUrl: typeof data?.assetBaseUrl === "string" && data.assetBaseUrl ? data.assetBaseUrl : null
    }))
    .catch((err: unknown) => {
      if (readApiError(err).status !== 404) capabilitiesRequest = null;
      return null;
    });
  capabilitiesRequest = request;
  return request;
}

/** Imagem de e-mail: vira cópia própria no servidor e volta com o link público permanente */
export async function uploadEmailAsset(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/email-assets/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000
  });
  return { url: String(data?.url || "") };
}

export async function fetchEmailTemplates(params?: {
  searchParam?: string;
  pageNumber?: number;
  limit?: number;
}): Promise<{ records: EmailTemplate[]; count: number; hasMore: boolean }> {
  const { data } = await api.get("/email-templates", { params });
  return data;
}

export async function fetchEmailTemplate(id: number): Promise<EmailTemplate> {
  const { data } = await api.get(`/email-templates/${id}`);
  return data;
}

export async function createEmailTemplate(payload: EmailTemplatePayload): Promise<EmailTemplate> {
  const { data } = await api.post("/email-templates", buildTemplateFormData(payload), {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}

export async function updateEmailTemplate(
  id: number,
  payload: EmailTemplatePayload
): Promise<EmailTemplate> {
  const { data } = await api.put(`/email-templates/${id}`, buildTemplateFormData(payload), {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}

export async function deleteEmailTemplate(id: number): Promise<void> {
  await api.delete(`/email-templates/${id}`);
}

export async function testSendEmailTemplate(
  id: number,
  params: { whatsappId: number; to: string; allowOptOutOverride?: boolean }
): Promise<{ success: boolean; accepted: string[] }> {
  const { data } = await api.post(`/email-templates/${id}/test`, params);
  return data;
}

export async function fetchEmailBlacklist(params?: {
  searchParam?: string;
  pageNumber?: number;
  limit?: number;
}): Promise<{ records: EmailBlacklistEntry[]; count: number; hasMore: boolean }> {
  const { data } = await api.get("/email-blacklist", { params });
  return data;
}

export async function addEmailBlacklist(email: string): Promise<EmailBlacklistEntry> {
  const { data } = await api.post("/email-blacklist", { email });
  return data;
}

export async function removeEmailBlacklist(id: number): Promise<void> {
  await api.delete(`/email-blacklist/${id}`);
}

export async function importEmailBlacklist(
  emails: string[]
): Promise<{ added: number; skippedExisting: number; skippedInvalid: number }> {
  const { data } = await api.post("/email-blacklist/import", { emails });
  return data;
}

export async function exportEmailBlacklist(): Promise<{
  records: { email: string; reason: string | null; createdAt: string }[];
}> {
  const { data } = await api.get("/email-blacklist/export");
  return data;
}

export interface BulkEmailPayload {
  recipients: string[];
  subject: string;
  html: string;
  unsubscribeFooterEnabled: boolean;
  minDelay: number;
  maxDelay: number;
  files?: File[];
}

export async function sendBulkEmail(
  whatsappId: number,
  payload: BulkEmailPayload
): Promise<{ bulkDispatchId: number; total: number; skippedByBlacklist: string[]; skippedInvalid: string[] }> {
  const fd = new FormData();
  fd.append("recipients", JSON.stringify(payload.recipients));
  fd.append("subject", payload.subject);
  fd.append("html", payload.html);
  fd.append("unsubscribeFooterEnabled", String(payload.unsubscribeFooterEnabled));
  fd.append("minDelay", String(payload.minDelay));
  fd.append("maxDelay", String(payload.maxDelay));
  (payload.files || []).forEach(f => fd.append("medias", f));
  const { data } = await api.post(`/bulk-email/${whatsappId}`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000
  });
  return data;
}

export async function checkEmailBlacklist(
  emails: string[]
): Promise<{ blocked: string[]; entries: { email: string; reason: string | null; createdAt: string }[] }> {
  const { data } = await api.post("/email-blacklist/check", { emails });
  return data;
}
