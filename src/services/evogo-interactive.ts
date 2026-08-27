import api from "@/lib/api";

export type EvoGoMenuType = "button" | "list" | "poll";

export interface EvoGoMenuPayload {
  type: EvoGoMenuType;
  text: string;
  choices: string[];
  footerText?: string;
  listButton?: string;
  selectableCount?: number;
  imageButton?: string;
  replyid?: string;
}

export interface EvoGoCarouselCard {
  text: string;
  image?: string;
  video?: string;
  document?: string;
  filename?: string;
  buttons: { id?: string; text: string; type?: "REPLY" | "URL" | "CALL" | "COPY" }[];
}

export interface EvoGoCarouselPayload {
  text: string;
  carousel: EvoGoCarouselCard[];
  replyid?: string;
}

export function sendEvoGoMenu(ticketId: number, data: EvoGoMenuPayload) {
  return api.post(`/evogo-menu/${ticketId}`, data);
}

export function sendEvoGoCarousel(ticketId: number, data: EvoGoCarouselPayload) {
  return api.post(`/evogo-carousel/${ticketId}`, data);
}

export function pinEvoGoMessage(data: { whatsappId: number; messageId: string; pin: boolean; duration?: 1 | 7 | 30 }) {
  return api.post(`/evogo-pin`, data);
}

export function listEvoGoLabels(whatsappId: number) {
  return api.get(`/evogo-labels`, { params: { whatsappId } });
}

export function setEvoGoChatLabels(data: { whatsappId: number; number: string; labelIds: string[] }) {
  return api.post(`/evogo-chat-labels`, data);
}
