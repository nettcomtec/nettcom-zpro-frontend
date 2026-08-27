import api from "@/lib/api";

export interface ConversionCredential {
  id: number;
  platform: "meta" | "google";
  name: string;
  platformId: string;
  platformSecret: string;
  isActive: boolean;
  createdAt?: string;
  rules?: ConversionRule[];
}

export type ConversionStatus = "pending" | "sent" | "failed" | "no_rule" | "skipped";

export interface AdReferralLog {
  id: number;
  tenantId: number;
  contactId: number | null;
  ticketId: number | null;
  whatsappId: number | null;
  channel: "waba" | "instagram" | "messenger";
  adId: string | null;
  ctwaClid: string | null;
  adSourceType: string | null;
  adSourceUrl: string | null;
  adHeadline: string | null;
  adRef: string | null;
  eventId: string;
  conversionStatus: ConversionStatus | string;
  conversionStatusCode: number | null;
  conversionEventName: string | null;
  conversionFbtraceId: string | null;
  conversionResponse: string | null;
  conversionError: string | null;
  conversionAttemptedAt: string | null;
  createdAt: string;
  contact?: { id: number; name: string; number: string; email: string } | null;
  ticket?: { id: number; status: string } | null;
  whatsapp?: { id: number; name: string; type: string } | null;
}

export interface AdReferralReportResponse {
  total: number;
  page: number;
  pageSize: number;
  data: AdReferralLog[];
}

export interface ConversionRule {
  id: number;
  credentialId: number;
  trigger: "campanha_enviada" | "bulk_enviado" | "waba_template_enviado" | "conversa_iniciada_anuncio";
  eventName: string;
  conversionValue: number | null;
  currency: string;
  isActive: boolean;
  credential?: ConversionCredential;
  createdAt?: string;
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export async function listConversionCredentials(): Promise<ConversionCredential[]> {
  const res = await api.get<ConversionCredential[]>("/conversion/credentials");
  return res.data;
}

export async function createConversionCredential(
  data: Omit<ConversionCredential, "id" | "createdAt" | "rules">
): Promise<ConversionCredential> {
  const res = await api.post<ConversionCredential>("/conversion/credentials", data);
  return res.data;
}

export async function updateConversionCredential(
  id: number,
  data: Partial<Omit<ConversionCredential, "id" | "createdAt" | "rules">>
): Promise<ConversionCredential> {
  const res = await api.put<ConversionCredential>(`/conversion/credentials/${id}`, data);
  return res.data;
}

export async function deleteConversionCredential(id: number): Promise<void> {
  await api.delete(`/conversion/credentials/${id}`);
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export async function listConversionRules(): Promise<ConversionRule[]> {
  const res = await api.get<ConversionRule[]>("/conversion/rules");
  return res.data;
}

export async function createConversionRule(
  data: Omit<ConversionRule, "id" | "createdAt" | "credential">
): Promise<ConversionRule> {
  const res = await api.post<ConversionRule>("/conversion/rules", data);
  return res.data;
}

export async function updateConversionRule(
  id: number,
  data: Partial<Omit<ConversionRule, "id" | "createdAt" | "credential">>
): Promise<ConversionRule> {
  const res = await api.put<ConversionRule>(`/conversion/rules/${id}`, data);
  return res.data;
}

export async function deleteConversionRule(id: number): Promise<void> {
  await api.delete(`/conversion/rules/${id}`);
}

// ─── Ad Referral Report ───────────────────────────────────────────────────────

export async function listAdReferralReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  channel?: string;
  whatsappId?: number;
  adId?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdReferralReportResponse> {
  const res = await api.get<AdReferralReportResponse>("/ad-referral/report", { params });
  return res.data;
}

export async function retryAdReferralConversion(id: number): Promise<AdReferralLog> {
  const res = await api.post<AdReferralLog>(`/ad-referral/${id}/retry`);
  return res.data;
}

export interface BulkRetryResult {
  total: number;
  sent: number;
  failed: number;
  noRule: number;
  skipped: number;
  errors: number;
}

export async function retryBulkAdReferralConversion(params: {
  statuses?: string[];
  channel?: string;
  whatsappId?: number;
  max?: number;
} = {}): Promise<BulkRetryResult> {
  const res = await api.post<BulkRetryResult>("/ad-referral/retry-bulk", params);
  return res.data;
}
