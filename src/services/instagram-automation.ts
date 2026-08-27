import api from "@/lib/api";

export interface InstagramAutomation {
  id: number;
  tenantId: number;
  whatsappId: number;
  name: string;
  isActive: boolean;
  triggerType: "comment" | "live_comment" | "story_mention" | "story_reply" | "dm_media_share";
  mediaIds: string[];
  keywords: string[];
  keywordMatch: "contains" | "equals" | "startsWith" | "regex";
  excludeKeywords: string[];
  replyPublicEnabled: boolean;
  replyPublicTexts: string[];
  replyDmEnabled: boolean;
  replyDmText: string | null;
  replyDmMediaUrl: string | null;
  chatFlowId: number | null;
  oncePerContactHours: number;
  scheduleEnabled: boolean;
  scheduleWindows: { weekdays: number[]; startTime: string; endTime: string }[];
  followUpEnabled: boolean;
  followUpMinutes: number;
  followUpText: string | null;
  priority: number;
  triggerCount?: number;
  whatsapp?: { id: number; name: string; type: string };
}

export interface InstagramAutomationLog {
  id: number;
  automationId: number;
  contactIgsid: string;
  commentId: string | null;
  mediaId: string | null;
  triggerType: string;
  triggerText: string | null;
  actionsTaken: { replyPublic?: string; replyDm?: string; replyDmMedia?: string; chatFlowId?: number; errors?: string[] };
  followUpStatus: string | null;
  createdAt: string;
  automation?: { id: number; name: string; triggerType: string };
}

export async function listInstagramAutomations(whatsappId?: number) {
  return api.get<InstagramAutomation[]>("/instagramAutomations", {
    params: whatsappId ? { whatsappId } : undefined,
  });
}

export async function createInstagramAutomation(data: Partial<InstagramAutomation>) {
  return api.post<InstagramAutomation>("/instagramAutomations", data);
}

export async function updateInstagramAutomation(id: number, data: Partial<InstagramAutomation>) {
  return api.put<InstagramAutomation>(`/instagramAutomations/${id}`, data);
}

export async function toggleInstagramAutomation(id: number) {
  return api.put<InstagramAutomation>(`/instagramAutomations/${id}/toggle`);
}

export async function deleteInstagramAutomation(id: number) {
  return api.delete(`/instagramAutomations/${id}`);
}

export async function listInstagramAutomationLogs(id: number | "all", limit = 100) {
  return api.get<InstagramAutomationLog[]>(`/instagramAutomations/${id}/logs`, {
    params: { limit },
  });
}

export interface InstagramDiagnosticCheck {
  key: string;
  ok: boolean;
  skipped?: boolean;
  detail?: string;
}

export async function diagnoseInstagramAutomationChannel(whatsappId: number) {
  return api.get<{ checks: InstagramDiagnosticCheck[] }>(
    `/instagramAutomations/diagnostic/${whatsappId}`
  );
}

/** Popup OAuth de revalidação do webhook IG — mesma UX do /sessoes (backend não toca o bmToken) */
export async function getInstagramWebhookSetupAuthUrl(whatsappId: number) {
  return api.get<{ authUrl?: string }>(
    `/instagramMetaOverrideCallbackUrl/auth-url?whatsappId=${whatsappId}`
  );
}
