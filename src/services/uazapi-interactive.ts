import api from "@/lib/api";

export type UazapiMenuType = "button" | "list" | "poll";

export interface UazapiMenuPayload {
  type: UazapiMenuType;
  text: string;
  choices: string[];
  footerText?: string;
  listButton?: string;
  selectableCount?: number;
  imageButton?: string;
  replyid?: string;
}

export interface UazapiCarouselCard {
  text: string;
  image?: string;
  video?: string;
  document?: string;
  filename?: string;
  buttons: { id?: string; text: string; type?: "REPLY" | "URL" | "CALL" | "COPY" | "PIX" }[];
}

export interface UazapiCarouselPayload {
  text: string;
  carousel: UazapiCarouselCard[];
  replyid?: string;
}

export type UazapiPixType = "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP";

export interface UazapiPixButtonPayload {
  pixType: UazapiPixType;
  pixKey: string;
  pixName?: string;
  bodyText?: string;
}

export interface UazapiRequestPaymentPayload {
  amount: number;
  title?: string;
  text?: string;
  footer?: string;
  itemName?: string;
  invoiceNumber?: string;
  pixKey?: string;
  pixType?: UazapiPixType;
  pixName?: string;
  paymentLink?: string;
  fileUrl?: string;
  fileName?: string;
  boletoCode?: string;
}

export interface UazapiStatusPayload {
  whatsappId: number;
  type: "text" | "image" | "video" | "audio";
  text?: string;
  file?: string;
  thumbnail?: string;
  mimetype?: string;
  background_color?: number;
  font?: number;
}

export function sendUazapiMenu(ticketId: number, data: UazapiMenuPayload) {
  return api.post(`/uazapi-menu/${ticketId}`, data);
}

export function sendUazapiCarousel(ticketId: number, data: UazapiCarouselPayload) {
  return api.post(`/uazapi-carousel/${ticketId}`, data);
}

export function sendUazapiLocationButton(ticketId: number, data: { text: string; replyid?: string }) {
  return api.post(`/uazapi-location-button/${ticketId}`, data);
}

export function sendUazapiPixButton(ticketId: number, data: UazapiPixButtonPayload) {
  return api.post(`/uazapi-pix-button/${ticketId}`, data);
}

export function sendUazapiRequestPayment(ticketId: number, data: UazapiRequestPaymentPayload) {
  return api.post(`/uazapi-request-payment/${ticketId}`, data);
}

export function sendUazapiStatus(data: UazapiStatusPayload) {
  return api.post(`/uazapi-status`, data);
}

export function pinUazapiMessage(data: { whatsappId: number; messageId: string; pin: boolean; duration?: 1 | 7 | 30 }) {
  return api.post(`/uazapi-pin`, data);
}

export function requestUazapiHistorySync(sessionId: number, data: { number: string; limit?: number }) {
  return api.post(`/uazapi-history-sync/${sessionId}`, data);
}

export function findUazapiChat(data: { whatsappId: number; query: string; type?: "all" | "individual" | "group"; limit?: number }) {
  return api.post(`/uazapi-chat-find`, data);
}

export function uazapiContactAgenda(data: { whatsappId: number; action: "add" | "remove"; number: string; name?: string }) {
  return api.post(`/uazapi-contact-agenda`, data);
}

export function listUazapiLabels(whatsappId: number) {
  return api.get(`/uazapi-labels`, { params: { whatsappId } });
}

export function setUazapiChatLabels(data: { whatsappId: number; number: string; labelIds: string[] }) {
  return api.post(`/uazapi-chat-labels`, data);
}
