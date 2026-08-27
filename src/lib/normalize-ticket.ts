import type { Ticket } from "@/stores/ticket-store";
import { resolveQueueMeta } from "@/lib/queue-cache";

/**
 * Monta o objeto `queue` do ticket a partir do payload (REST ou socket).
 * Quando o emit vem "magro" (so `queueId`, sem o objeto `queue` ou sem nome),
 * completa nome/cor pelo cache global de filas (lib/queue-cache) — evita a badge
 * da fila sumir do painel apesar do queueId estar gravado no banco.
 */
function resolveTicketQueue(t: Record<string, unknown>): Ticket["queue"] {
  let id: number | undefined;
  let name = "";
  let color = "";

  if (t.queue && typeof t.queue === "object") {
    const q = t.queue as Record<string, unknown>;
    id = q.id as number;
    name = ((q.name ?? q.queue ?? "") as string) || "";
    color = ((q.color ?? "") as string) || "";
  } else if (t.queueId != null) {
    id = t.queueId as number;
    name = ((t.queueName ?? (typeof t.queue === "string" ? t.queue : "") ?? "") as string) || "";
    color = ((t.queueColor ?? "") as string) || "";
  }

  if (id == null) return undefined;

  if (!name || !color) {
    const cached = resolveQueueMeta(id);
    if (cached) {
      if (!name) name = cached.name;
      if (!color) color = cached.color;
    }
  }

  return { id, name, color: color || "#666" };
}

/** Evita usar email como URL de avatar (ex.: webmail retornando email em profilePicUrl). */
function sanitizeProfilePic(url: unknown): string {
  if (!url || url === "null" || url === "undefined") return "";
  const s = String(url).trim();
  if (!s) return "";
  if (s.includes("@") && !s.startsWith("http") && !s.startsWith("/")) return "";
  return s;
}

/** Normaliza extraInfo para sempre ser { name, value }[] independente do formato da API */
function normalizeExtraInfo(raw: unknown): { name: string; value: string }[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (item && typeof item === "object" && "name" in item) {
        return { name: String((item as Record<string, unknown>).name ?? ""), value: String((item as Record<string, unknown>).value ?? "") };
      }
      return { name: "", value: String(item) };
    });
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({ name: k, value: String(v ?? "") }));
  }
  return undefined;
}

export function normalizeTicket(raw: Record<string, unknown>): Ticket {
  const t = raw;
  const contact =
    t.contact && typeof t.contact === "object"
      ? (t.contact as Record<string, unknown>)
      : {};

  // Tags do ticket: deduplica por id para evitar duplicatas vindas da API.
  // Fallback p/ contact.tags: emits "magros" (ShowTicketService) nao trazem `tags`
  // no nivel do ticket — so em contact.tags. Sem o fallback, normalizeTicket geraria
  // tags:[] e o merge do store (updateTicket) zeraria as etiquetas, derrubando o
  // ticket do filtro de etiqueta ativo a cada ticket:update (responder / clicar no
  // bullet de nao-lido). A lista REST anexa ticket.tags = tags do contato, entao usar
  // contact.tags como fonte secundaria mantem a paridade.
  type RawTag = { id: number; name?: string; tag?: string; color?: string };
  const rawTicketTags = Array.isArray(t.tags) ? (t.tags as RawTag[]) : undefined;
  const rawContactTags = Array.isArray(contact.tags) ? (contact.tags as RawTag[]) : undefined;
  // Payload sem NENHUMA das duas fontes = emit magro: a chave `tags` e removida
  // no fim (vide hasTagSource) para o merge do store preservar as etiquetas ja
  // carregadas em vez de zera-las com [].
  const hasTagSource = rawTicketTags !== undefined || rawContactTags !== undefined;
  const rawTags = rawTicketTags ?? rawContactTags ?? [];
  const uniqueTags = rawTags.filter((tag, i, arr) => arr.findIndex((x) => x.id === tag.id) === i);

  const normalized = {
    ...t,
    tags: uniqueTags,
    status: (t.status as string) || "open",
    unreadMessages: Number(t.unreadMessages ?? t.unread ?? (t as { unread_messages?: number }).unread_messages ?? 0) || 0,
    contact: {
      id: (contact.id ?? t.contactId ?? 0) as number,
      name: (contact.name ?? t.name ?? "Sem nome") as string,
      number: (contact.number ?? t.number ?? "") as string,
      // @username + LID p/ fallback de exibição (item F). Da lista vêm com alias
      // (contactUsername/Pushname/Lid/IsLid); do ShowTicket vêm no contact nested.
      username: (contact.username ?? t.contactUsername ?? undefined) as string | undefined,
      pushname: (contact.pushname ?? t.contactPushname ?? undefined) as string | undefined,
      lid: (contact.lid ?? t.contactLid ?? undefined) as string | undefined,
      isLid: (contact.isLid ?? t.contactIsLid ?? undefined) as boolean | undefined,
      instagramPK: contact.instagramPK ?? undefined,
      messengerId: contact.messengerId ?? undefined,
      email: (contact.email ?? t.email ?? "") as string,
      profilePicUrl: sanitizeProfilePic(contact.profilePicUrl ?? t.profilePicUrl),
      cpf: (contact.cpf as string) || undefined,
      birthday: (contact.birthday as string) || undefined,
      birthdayDate: (contact.birthdayDate as string) || undefined,
      firstName: (contact.firstName as string) || undefined,
      lastName: (contact.lastName as string) || undefined,
      businessName: (contact.businessName as string) || undefined,
      tags: (contact.tags ?? t.tags ?? []) as {
        id: number;
        name: string;
        color: string;
      }[],
      wallets: (contact.wallets ?? []) as { id: number; name: string }[],
      extraInfo: normalizeExtraInfo(contact.extraInfo),
      blocked: contact.blocked as boolean | undefined,
      chatbotBlocked: contact.chatbotBlocked as boolean | undefined,
      kanban: (contact.kanban ?? t.kanban ?? undefined) as number | undefined,
    },
    queue: resolveTicketQueue(t),
    user:
      t.user && typeof t.user === "object"
        ? (t.user as Ticket["user"])
        : t.username
          ? { id: (t.userId ?? 0) as number, name: t.username as string }
          : undefined,
    whatsapp:
      t.whatsapp && typeof t.whatsapp === "object"
        ? (t.whatsapp as Ticket["whatsapp"])
        : undefined,
    // chatbot: backend retorna chatFlowId (number), frontend usa chatbot (boolean)
    chatbot: !!(t.chatFlowId ?? t.chatbot),
    // pendingEvaluation: coercao explicita p/ boolean (SQL EXISTS pode vir como 0/1).
    // So emite a chave quando o payload a traz: emit "magro" sem o campo nao pode
    // virar `false` e zerar o flag no merge `{ ...existing, ...incoming }` do store.
    ...(t.pendingEvaluation !== undefined
      ? { pendingEvaluation: Boolean(t.pendingEvaluation) }
      : {}),
    // status de integracoes: backend retorna boolean, frontend compara com "enabled"
    typebotStatus: (t.typebotStatus === true || t.typebotStatus === "enabled") ? "enabled" : undefined,
    dialogflowStatus: (t.dialogflowStatus === true || t.dialogflowStatus === "enabled") ? "enabled" : undefined,
    chatgptStatus: (t.chatgptStatus === true || t.chatgptStatus === "enabled") ? "enabled" : undefined,
    n8nStatus: (t.n8nStatus === true || t.n8nStatus === "enabled") ? "enabled" : undefined,
    difyStatus: (t.difyStatus === true || t.difyStatus === "enabled") ? "enabled" : undefined,
    lmStatus: (t.lmStatus === true || t.lmStatus === "enabled") ? "enabled" : undefined,
    grokStatus: (t.grokStatus === true || t.grokStatus === "enabled") ? "enabled" : undefined,
    geminiStatus: (t.geminiStatus === true || t.geminiStatus === "enabled") ? "enabled" : undefined,
    deepseekStatus: (t.deepseekStatus === true || t.deepseekStatus === "enabled") ? "enabled" : undefined,
    qwenStatus: (t.qwenStatus === true || t.qwenStatus === "enabled") ? "enabled" : undefined,
    claudeStatus: (t.claudeStatus === true || t.claudeStatus === "enabled") ? "enabled" : undefined,
    ollamaStatus: (t.ollamaStatus === true || t.ollamaStatus === "enabled") ? "enabled" : undefined,
  } as Ticket;

  // Emit magro (nem ticket.tags nem contact.tags): remove as chaves para que o
  // spread `{ ...existing, ...incoming }` do ticket-store NAO apague as
  // etiquetas — senao o chip some do card/cabecalho e o ticket cai do filtro de
  // etiqueta ativo a cada ticket:update, voltando so com F5.
  if (!hasTagSource) {
    delete (normalized as { tags?: unknown }).tags;
    delete (normalized.contact as { tags?: unknown }).tags;
  }

  return normalized;
}

export function normalizeTickets(raw: Record<string, unknown>[]): Ticket[] {
  return raw.map(normalizeTicket);
}
