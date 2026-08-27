import api from "@/lib/api";

// Extras REST do canal Zapo (labels / agenda / status / pin / history-sync).
// Espelho de uazapi-interactive.ts — mesmas assinaturas, endpoints zapo.
// Interativos core (botões/lista/pix/cta/menu/poll) do Zapo NÃO passam por aqui:
// vão pelo caminho genérico /messagesInteractive/* (services/messages.ts) com
// channel: "zapo". Carrossel / botão de localização / cobrança / chat-find são
// N/A no Zapo (F0 pendente ou sem equivalente) — sem função aqui de propósito.

export interface ZapoStatusPayload {
  whatsappId: number;
  type: "text" | "image" | "video" | "audio";
  text?: string;
  file?: string;
  thumbnail?: string;
  mimetype?: string;
  background_color?: number;
  font?: number;
}

export function sendZapoStatus(data: ZapoStatusPayload) {
  return api.post(`/zapo-status`, data);
}

export function pinZapoMessage(data: { whatsappId: number; messageId: string; pin: boolean; duration?: 1 | 7 | 30 }) {
  return api.post(`/zapo-pin`, data);
}

export function requestZapoHistorySync(sessionId: number, data: { number: string; limit?: number }) {
  return api.post(`/zapo-history-sync/${sessionId}`, data);
}

export function zapoContactAgenda(data: { whatsappId: number; action: "add" | "remove"; number: string; name?: string }) {
  return api.post(`/zapo-contact-agenda`, data);
}

export function listZapoLabels(whatsappId: number) {
  return api.get(`/zapo-labels`, { params: { whatsappId } });
}

export function setZapoChatLabels(data: { whatsappId: number; number: string; labelIds: string[] }) {
  return api.post(`/zapo-chat-labels`, data);
}
