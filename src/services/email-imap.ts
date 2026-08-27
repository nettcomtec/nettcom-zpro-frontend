import api from "@/lib/api";

export interface ImapSmtpPayload {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  imap: {
    host: string;
    port: number;
    tls: boolean;
    user?: string;
    pass?: string;
    mailbox?: string;
    keepalive?: boolean;
    checkInterval?: number;
  };
  provider?: "imap-smtp";
  from?: string;
  replyTo?: string;
  rejectUnauthorized?: boolean;
}

export interface TestResult {
  success: boolean;
  message?: string;
  error?: string;
  durationMs?: number;
}

export interface AutodetectResult {
  provider: string;
  smtp: { host: string; port: number; secure: boolean };
  imap: { host: string; port: number; tls: boolean };
  confidence: "high" | "medium" | "low";
  notes?: string;
}

export async function saveImapConfig(whatsappId: number, payload: ImapSmtpPayload) {
  return api.post(`/wbot-imap/${whatsappId}/config`, { smtpConfig: payload });
}

export async function getImapConfig(whatsappId: number) {
  return api.get(`/wbot-imap/${whatsappId}/config`);
}

export async function testSmtp(whatsappId: number) {
  return api.post<{ success: boolean; data: TestResult }>(`/wbot-imap/${whatsappId}/test-smtp`);
}

export async function testImap(whatsappId: number) {
  return api.post<{ success: boolean; data: TestResult }>(`/wbot-imap/${whatsappId}/test-imap`);
}

export async function testAll(whatsappId: number) {
  return api.post<{
    success: boolean;
    data: { smtp: TestResult; imap: TestResult };
  }>(`/wbot-imap/${whatsappId}/test-all`);
}

export async function autodetect(whatsappId: number, email: string) {
  return api.post<{ success: boolean; data: AutodetectResult }>(
    `/wbot-imap/${whatsappId}/autodetect`,
    { email }
  );
}

export async function saveSignature(whatsappId: number, html: string) {
  return api.put(`/wbot-imap/${whatsappId}/signature`, { html });
}
