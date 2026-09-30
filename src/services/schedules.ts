import api from "@/lib/api";

export interface ScheduleMessage {
  id: number | string;
  contactId?: number;
  contact?: { id: number; name: string; number: string };
  body: string;
  mediaType?: string;
  mediaUrl?: string;
  dataJson?: string | null;
  scheduleDate: string;
  status: string;
  ticketId?: number;
  tenantId?: number;
  ticket?: {
    id: number;
    whatsapp?: { id: number; name?: string; type?: string };
  };
  scheduleOpenTicket?: boolean;
  scheduleQueueId?: number | null;
  scheduleUserId?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ScheduleListResponse {
  messages: ScheduleMessage[];
  total: number;
  page: number;
  totalPages: number;
}

export async function fetchSchedules(page = 1, searchParam?: string) {
  const { data } = await api.get<ScheduleListResponse>("/scheduleMessages/", {
    params: { page, ...(searchParam ? { searchParam } : {}) },
  });
  const messages = data?.messages ?? [];
  return {
    messages,
    total: data?.total ?? messages.length,
    page: data?.page ?? page,
    totalPages: Math.max(1, data?.totalPages ?? 1),
  };
}

/** Non-WABA channels: POST /messagesSchedule/ */
export async function createScheduleMessage(payload: FormData | Record<string, unknown>) {
  return api.post("/messagesSchedule/", payload, {
    headers: payload instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
  });
}

/** WABA template schedule: POST /wabametaTemplateTextSchedule */
export async function createWabaTemplateSchedule(payload: Record<string, unknown>) {
  return api.post("/wabametaTemplateTextSchedule", payload);
}

/** Gupshup template schedule: POST /gupshupSendTemplateTextSchedule */
export async function createGupshupTemplateSchedule(payload: Record<string, unknown>) {
  return api.post("/gupshupSendTemplateTextSchedule", payload);
}

/** Dialog360 template schedule: POST /dialog360/sendTemplateTextSchedule */
export async function createDialog360TemplateSchedule(payload: Record<string, unknown>) {
  return api.post("/dialog360/sendTemplateTextSchedule", payload);
}
