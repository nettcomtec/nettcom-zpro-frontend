import api, { BACKGROUND_REQUEST } from "@/lib/api";

// PLANO_CRM_CONTATO — Fase 1. Rotas aditivas: backend antigo responde 404 sem
// `code` (o front trata como "recurso indisponível nesta versão").

export interface ContactCrmRating {
  /** 1..5; null quando há menos de 2 oportunidades fechadas */
  stars: number | null;
  /** 0..1; null quando há menos de 2 oportunidades fechadas */
  conversion: number | null;
  closedCount: number;
}

export interface ContactCrmOpportunities {
  /** true quando a privacidade do funil limita os números às oportunidades do usuário */
  scopedToOwn: boolean;
  created: number;
  open: number;
  won: number;
  lost: number;
  openValue: number;
  wonValue: number;
  lostValue: number;
  rating: ContactCrmRating;
}

export interface ContactCrmSummary {
  contactId: number;
  tickets: { total: number; openNow: number };
  /** ISO; null quando o contato nunca teve ticket */
  firstContactAt: string | null;
  tags: { id: number; tag: string; color: string | null }[];
  wallets: { id: number; name: string }[];
  /** Ausente quando o plano do tenant não tem funil */
  opportunities?: ContactCrmOpportunities;
  /** Recursos que o backend serve (ausente no backend da Fase 1 → abas novas ocultas) */
  features?: { timeline?: boolean; calls?: boolean; relationship?: boolean };
}

export type ContactCrmErrorCode = "ERR_CONTACT_NOT_FOUND" | "ERR_CONTACT_CRM_NO_ACCESS";

export type ContactCrmLoadState =
  | { status: "ok"; data: ContactCrmSummary }
  | { status: "noAccess" }
  | { status: "notFound" }
  | { status: "unavailable" }
  | { status: "error" };

export async function fetchContactCrmSummary(
  contactId: number,
  options?: { ticketId?: number | null; background?: boolean }
) {
  return api.get<ContactCrmSummary>(`/contact-crm/${contactId}/summary`, {
    params: options?.ticketId ? { ticketId: options.ticketId } : undefined,
    ...(options?.background ? BACKGROUND_REQUEST : {})
  });
}

// ---------------------------------------------------------------------------
// Fase 2 — Timeline do contato. GET /contact-crm/:contactId/timeline
// Contrato espelhado em backend/src/services/ContactEventServices/ContactEventTypesZPRO.ts
// (tipos de evento e `data`) e ListContactTimelineServiceZPRO (fontes e grupos).
// ---------------------------------------------------------------------------

export type ContactTimelineSource = "event" | "log" | "system" | "note" | "campaign" | "call" | "relationship" | "task";

/** Grupos do filtro. tickets = logs de atendimento, avaliação/protocolo/agendada, IA e reabertura;
 * funnel = opportunity_*; contact = etiquetas, raia, carteira e cadastro. */
export type ContactTimelineGroup = "tickets" | "funnel" | "contact" | "campaigns" | "notes" | "calls" | "relationship";

export type ContactEventActorSource = "ui" | "api" | "bot" | "ai" | "automation" | "campaign" | "inbound";

export interface ContactTimelineItem {
  /** Único na resposta: `${source}:${id}` */
  key: string;
  source: ContactTimelineSource;
  /**
   * event: tipo de ContactEvent (opportunity_created, tag_added, …);
   * log: tipo do LogTicket (create, open, pending, closed, transfered, receivedTransfer,
   *      userDefine, queue, channelDefine, chatBot, autoClose);
   * system: evaluation | protocol | scheduleSent; note: "note"; campaign: "campaign"; call: "call"
   */
  type: string;
  /** ISO */
  at: string;
  ticketId: number | null;
  user: { id: number; name: string } | null;
  /** Só em source=event */
  actorSource?: ContactEventActorSource | null;
  /**
   * event: `data` do evento (ver ContactEventTypesZPRO);
   * log: { queueName?: string | null };
   * note: { text: string } (até 280 caracteres);
   * campaign: { campaignId: number; campaignName: string | null; ack: number | null };
   * call: { direction?: string | null; status?: string | null; duration?: number | null };
   * system: {}
   * relationship (Fase 3): { typeName: string | null; typeColor: string | null; description: string (até 280); attachmentsCount: number }
   * task (Fase 3, type task_created | task_completed): { name: string; status: string | null; limitDate: string | null }
   */
  data: Record<string, unknown> | null;
}

export interface ContactTimelineResponse {
  items: ContactTimelineItem[];
  /** null = fim */
  nextCursor: string | null;
}

export type ContactTimelineLoadState =
  | { status: "ok"; data: ContactTimelineResponse }
  | { status: "noAccess" }
  | { status: "notFound" }
  | { status: "unavailable" }
  | { status: "error" };

export async function fetchContactTimeline(
  contactId: number,
  options?: { cursor?: string | null; limit?: number; groups?: ContactTimelineGroup[]; ticketId?: number | null; background?: boolean }
) {
  const params: Record<string, string | number> = {};
  if (options?.cursor) params.cursor = options.cursor;
  if (options?.limit) params.limit = options.limit;
  if (options?.groups && options.groups.length > 0) params.groups = options.groups.join(",");
  if (options?.ticketId) params.ticketId = options.ticketId;
  return api.get<ContactTimelineResponse>(`/contact-crm/${contactId}/timeline`, {
    params,
    ...(options?.background ? BACKGROUND_REQUEST : {})
  });
}

export async function loadContactTimeline(
  contactId: number,
  options?: { cursor?: string | null; limit?: number; groups?: ContactTimelineGroup[]; ticketId?: number | null; background?: boolean }
): Promise<ContactTimelineLoadState> {
  try {
    const { data } = await fetchContactTimeline(contactId, options);
    return { status: "ok", data };
  } catch (err: unknown) {
    return { status: toLoadErrorStatus(err) };
  }
}

function toLoadErrorStatus(err: unknown): "noAccess" | "notFound" | "unavailable" | "error" {
  const e = err as { status?: number; data?: { code?: string; error?: string }; response?: { status?: number; data?: { code?: string; error?: string } } };
  const status = e?.status ?? e?.response?.status;
  const body = e?.data ?? e?.response?.data;
  const code = body?.code ?? body?.error;
  if (status === 403) return "noAccess";
  if (status === 404) return code === "ERR_CONTACT_NOT_FOUND" ? "notFound" : "unavailable";
  return "error";
}

/**
 * Traduz a resposta em estado de tela. O interceptor de `lib/api.ts` rejeita com o
 * `error.response` (ou o próprio erro), então status e corpo são lidos dos dois jeitos.
 */
export async function loadContactCrmSummary(
  contactId: number,
  options?: { ticketId?: number | null; background?: boolean }
): Promise<ContactCrmLoadState> {
  try {
    const { data } = await fetchContactCrmSummary(contactId, options);
    return { status: "ok", data };
  } catch (err: unknown) {
    const e = err as { status?: number; data?: { code?: string; error?: string }; response?: { status?: number; data?: { code?: string; error?: string } } };
    const status = e?.status ?? e?.response?.status;
    const body = e?.data ?? e?.response?.data;
    const code = body?.code ?? body?.error;
    if (status === 403) return { status: "noAccess" };
    if (status === 404) {
      return code === "ERR_CONTACT_NOT_FOUND" ? { status: "notFound" } : { status: "unavailable" };
    }
    return { status: "error" };
  }
}
