import api from "@/lib/api";

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
  (payload.files || []).forEach(f => fd.append("medias", f));
  return fd;
};

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
