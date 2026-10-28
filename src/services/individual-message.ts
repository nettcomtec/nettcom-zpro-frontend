import api from "@/lib/api";

/**
 * Canais em que os diálogos de iniciar conversa (Nova Conversa, conversa avulsa do
 * /atendimento, Funil) mandam a 1ª mensagem pelo `POST /individual`. Os oficiais
 * (waba, gupshup, dialog360) só criam o atendimento ali e enviam o template depois.
 */
export const AVULSA_MESSAGE_CHANNEL_TYPES: readonly string[] = [
  "whatsapp",
  "baileys",
  "zapo",
  "meow",
  "evo",
  "evogo",
  "uazapi",
  "zapi",
  "waba",
  "gupshup",
  "dialog360",
];

/** Canais de e-mail dos mesmos diálogos (envio por `POST /wbot-email/send/:id`). */
export const AVULSA_EMAIL_CHANNEL_TYPES: readonly string[] = ["email", "webmail"];

export interface IndividualMessagePayload {
  whatsappId: number;
  whatsappType?: string;
  number?: string;
  /** BSUID do destinatário (usuarios WABA sem numero de telefone exposto). */
  bsuid?: string;
  message?: string;
  /** Status que o ticket deve assumir apos a primeira mensagem.
   * - "open" (default): atribui ao operador atual
   * - "pending": deixa pending na fila, sem atribuir */
  desiredStatus?: "open" | "pending";
  /** Fila (opcional) escolhida no dialog — segmenta o ticket avulso. */
  queueId?: number;
}

export async function sendIndividualMessage(data: IndividualMessagePayload) {
  return api.post("/individual", data);
}
