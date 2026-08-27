import api from "@/lib/api";

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

export interface ContactsReportCampaignParams {
  startDate?: string;
  endDate?: string;
  tags?: number[] | string[];
  wallets?: number[] | string[];
  ddds?: string[];
  searchParam?: string;
}

export async function fetchContactsReportCampaign(params: ContactsReportCampaignParams) {
  // Serialize arrays as repeated params without brackets: tags=1&tags=2 (Express expects this)
  return api.get("/contacts-report-campaign", {
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
