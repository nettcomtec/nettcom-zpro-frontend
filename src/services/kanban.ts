import api, { BACKGROUND_REQUEST } from "@/lib/api";

export interface Kanban {
  id: number;
  name: string;
  tag?: string;
  color?: string;
  position?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface KanbanContact {
  id: number;
  name: string;
  number: string;
  profilePicUrl?: string | null;
  kanban?: number | null;
  wallet?: { id: number; name: string } | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  lastMessageFromMe?: boolean;
  isGroup?: boolean;
  // Status do ticket mais recente (filtro de status do kanban): "open" | "pending" | "closed" | null (sem ticket)
  lastTicketStatus?: string | null;
  pushname?: string | null;
  tags?: { tagid?: number; id?: number; tag: string; color: string }[];
  // Channel identity fields returned by /contactsKanban/
  instagramPK?: string | number | null;
  messengerId?: string | number | null;
  telegramId?: string | number | null;
  webchatId?: string | null;
  hubSms?: string | null;
  hubTelegram?: string | null;
  hubWhatsapp?: string | null;
  hubWidget?: string | null;
  hubWebchat?: string | null;
  hubEmail?: string | null;
  hubMercadolivre?: string | null;
  hubTiktok?: string | null;
  hubLikedin?: string | null;
  hubOlx?: string | null;
  hubIfood?: string | null;
  hubTwitter?: string | null;
  hubYoutube?: string | null;
}

export interface ContactsKanbanResponse {
  contacts: KanbanContact[];
  count: number;
  hasMore: boolean;
}

export async function fetchKanbans(options?: { background?: boolean }) {
  const res = await api.get<Kanban[] | { kanban: Kanban[] }>(
    "/kanban/",
    options?.background ? { ...BACKGROUND_REQUEST } : undefined
  );
  // Normalise: API may return array or { kanban: [...] }
  const raw = res.data as Kanban[] | { kanban: Kanban[] };
  const lanes: Kanban[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { kanban: Kanban[] }).kanban)
    ? (raw as { kanban: Kanban[] }).kanban
    : [];
  lanes.sort((a, b) => {
    const ap = a.position ?? Number.POSITIVE_INFINITY;
    const bp = b.position ?? Number.POSITIVE_INFINITY;
    return ap === bp ? a.id - b.id : ap - bp;
  });
  return { ...res, data: lanes };
}

export async function fetchContactsKanban(params: { searchParam?: string | null; pageNumber?: number; smartSearch?: boolean }) {
  const { smartSearch = true, ...rest } = params || {};
  return api.get<ContactsKanbanResponse>("/contactsKanban/", { params: { ...rest, smartSearch } });
}

// number é opcional: contatos de canais sem número (Instagram, Webchat, Telegram,
// Hub...) salvam o kanban sem enviar number — o backend pula a revalidação de sessão.
export async function updateContactKanban(contactId: number, data: { number?: string; kanban: number | null }) {
  return api.put(`/contacts/${contactId}`, data);
}

export async function createKanban(data: { name: string; color?: string; position?: number }) {
  return api.post("/kanban/", data);
}

export async function updateKanban(id: number, data: { name?: string; color?: string; position?: number; isActive?: boolean }) {
  return api.put(`/kanban/${id}`, data);
}

export async function deleteKanban(id: number) {
  return api.delete(`/kanban/${id}`);
}
