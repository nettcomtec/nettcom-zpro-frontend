import api from "@/lib/api";

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
