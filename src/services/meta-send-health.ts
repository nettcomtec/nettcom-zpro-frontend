import api from "@/lib/api";

// Alerta de canal WABA sem forma de pagamento / bloqueado para envio
// (docs/PLANO_ALERTA_PAGAMENTO_WABA.md).

/** payment = a Meta recusou mensagem por pagamento (131042) na WABA do canal;
 *  blocked = health_status BLOCKED no número, na WABA ou no portfólio;
 *  limited = health_status LIMITED (só informativo: card e painel). */
export type MetaSendHealthKind = "payment" | "blocked" | "limited";

export type MetaSendHealthEntity = "PHONE_NUMBER" | "WABA" | "BUSINESS";

export interface MetaSendHealthDetail {
  entity: MetaSendHealthEntity | string;
  status: string;
  code?: number | null;
  description?: string | null;
  solution?: string | null;
  info?: string[] | null;
}

/**
 * Linha do GET /meta/send-health. Só vêm canais com alerta.
 * Quem não pode resolver recebe só `whatsappId`, `phoneNumberId` e `kind`;
 * os demais campos chegam apenas para admin, superadmin e custom com sessions_manage.
 */
export interface MetaSendHealthRow {
  whatsappId: number;
  phoneNumberId: string;
  kind: MetaSendHealthKind;
  whatsappName?: string | null;
  wabaId?: string | null;
  healthDetails?: MetaSendHealthDetail[] | null;
  healthCheckedAt?: string | null;
  paymentIssueAt?: string | null;
  paymentIssueLastAt?: string | null;
}

export async function getMetaSendHealth() {
  return api.get<MetaSendHealthRow[]>("/meta/send-health");
}

/** Resposta do "Já resolvi" (backend com a conferência na Meta; 204 sem corpo quando desligado). */
export interface MetaPaymentResolvedResult {
  /** true = a Meta ainda acusa falha de pagamento e o aviso fica; null = não deu para consultar. */
  stillPaymentIssue?: boolean | null;
}

/** "Já resolvi": encerra o alerta de pagamento da WABA do canal e confere na Meta antes de responder. */
export async function markMetaPaymentResolved(whatsappId: number) {
  return api.post<MetaPaymentResolvedResult | "">(`/meta/send-health/${whatsappId}/payment-resolved`);
}
