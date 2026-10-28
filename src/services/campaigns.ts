import api, { BACKGROUND_REQUEST } from "@/lib/api";

export async function fetchCampaigns(params?: { page?: number; limit?: number }) {
  return api.get("/campaigns", { params: params || { page: 1, limit: 15 } });
}

export async function fetchCampaign(campaignId: number) {
  return api.get(`/campaigns/${campaignId}`);
}

export async function createCampaign(data: Record<string, unknown> | FormData) {
  if (data instanceof FormData) {
    return api.post("/campaigns", data, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 300000,
    });
  }
  return api.post("/campaigns", data);
}

export async function updateCampaign(campaignId: number, data: Record<string, unknown> | FormData) {
  if (data instanceof FormData) {
    return api.put(`/campaigns/${campaignId}`, data, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 300000,
    });
  }
  return api.put(`/campaigns/${campaignId}`, data);
}

export async function deleteCampaign(campaignId: number) {
  return api.delete(`/campaigns/${campaignId}`);
}

export async function fetchCampaignContacts(campaignId: number) {
  return api.get(`/campaigns/contacts/${campaignId}`);
}

export async function addCampaignContacts(campaignId: number, contacts: { id: number; name: string }[]) {
  return api.post(`/campaigns/contacts/${campaignId}`, contacts);
}

export async function deleteCampaignContact(campaignId: number, contactId: number) {
  return api.delete(`/campaigns/contacts/${campaignId}/${contactId}`);
}

export async function deleteAllCampaignContacts(campaignId: number) {
  return api.delete(`/campaigns/deleteall/contacts/${campaignId}`);
}

export async function duplicateCampaign(campaignId: number) {
  return api.post(`/campaigns/${campaignId}/duplicate`);
}

export async function startCampaign(campaignId: number) {
  return api.post(`/campaigns/start/${campaignId}`);
}

export async function cancelCampaign(campaignId: number) {
  return api.post(`/campaigns/cancel/${campaignId}`);
}

export async function getCampaignReport(campaignId: number) {
  return api.get(`/campaigns/${campaignId}/report`);
}

/** Quem respondeu à campanha: só contato, hora e atendimento (o texto fica no atendimento). */
export interface CampaignRepliesResponse {
  campaignId: number;
  available: boolean;
  windowDays: number;
  /** Contatos conferidos (enviados, sem falha nem descadastro) */
  checked: number;
  count: number;
  reason?: "timeout" | "error" | "busy" | "no_channel";
  replies: Array<{ contactId: number; repliedAt: string; ticketId: number }>;
}

/** Leitura em segundo plano: backend anterior responde 404 e a tela segue sem a coluna. */
export async function getCampaignReplies(campaignId: number) {
  return api.get<CampaignRepliesResponse>(`/campaigns/${campaignId}/replies`, { ...BACKGROUND_REQUEST });
}

/** Resposta utilizável (`available`) indexada por contato, ou null. */
export function indexCampaignReplies(
  data: CampaignRepliesResponse | null | undefined
): { summary: CampaignRepliesResponse; byContact: Map<number, { repliedAt: string; ticketId: number }> } | null {
  if (!data || data.available !== true || !Array.isArray(data.replies)) return null;
  const byContact = new Map<number, { repliedAt: string; ticketId: number }>();
  for (const r of data.replies) {
    if (typeof r?.contactId === "number" && r.repliedAt) byContact.set(r.contactId, { repliedAt: r.repliedAt, ticketId: r.ticketId });
  }
  return { summary: data, byContact };
}

export interface ContactsReportCampaignParams {
  startDate?: string;
  endDate?: string;
  tags?: number[] | string[];
  wallets?: number[] | string[];
  ddds?: string[];
  searchParam?: string;
  // Filtro por endereço do cadastro (bairro e cidade por "contém", UF do cadastro). A UF vai
  // em CSV numa chave só ("SP,RJ"), nunca como array: o serializer abaixo repete a chave de
  // array e o qs do backend a transforma em objeto acima do arrayLimit. Nunca reaproveitar
  // `ddds`, que carrega a UF deduzida do DDD.
  addressBairro?: string;
  addressCidade?: string;
  addressUfs?: string;
}

// `addressFilter: true` = o backend aplicou addressBairro/addressCidade/addressUfs. Sem o eco,
// com filtro ativo, a tela aborta: backend antigo ignora os params e devolveria o público todo.
export interface ContactsReportCampaignResponse<C = Record<string, unknown>> {
  contacts: C[];
  addressFilter?: boolean;
}

export async function fetchContactsReportCampaign<C = Record<string, unknown>>(params: ContactsReportCampaignParams) {
  // Serialize arrays as repeated params without brackets: tags=1&tags=2 (Express expects this)
  return api.get<ContactsReportCampaignResponse<C>>("/contacts-report-campaign", {
    params,
    paramsSerializer: (p) => {
      const parts: string[] = [];
      Object.entries(p).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`));
        } else if (value !== undefined && value !== null && value !== "") {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        }
      });
      return parts.join("&");
    },
  });
}

export async function skipCampaignMessage(campaignId: number) {
  return api.post(`/campaigns-skip-message/${campaignId}`, { campaignId });
}

export async function pauseCampaign(campaignId: number) {
  return api.post(`/campaigns/pause/${campaignId}`);
}

export async function resumeCampaign(campaignId: number) {
  return api.post(`/campaigns/resume/${campaignId}`);
}

export async function forceFinishCampaign(campaignId: number) {
  return api.put(`/campaigns/contactsAck/${campaignId}`);
}
