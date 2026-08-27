import api, { BACKGROUND_REQUEST } from "@/lib/api";

// Cobrancas do template ORDER_DETAILS ("Detalhes do pedido").
// docs/PLANO_TEMPLATE_ORDER_DETAILS.md — F4 (baixa manual).
//
// Nao existe webhook de pagamento no Brasil: o WhatsApp apenas copia o codigo e
// o cliente paga no app do banco. A cobranca so sai de `pending` por acao humana
// (baixa manual) ou pelo job de expiracao — nunca sozinha.

export type WhatsappPaymentStatus =
  | "creating"
  | "pending"
  | "paid"
  | "canceled"
  | "expired"
  | "failed";

export type WhatsappPaymentKind = "pix" | "link" | "boleto";

export interface WhatsappPayment {
  id: number;
  /** Opaco e curto; e o "Nº da cobranca" que o cliente ve na ficha. */
  referenceId: string;
  status: WhatsappPaymentStatus;
  /** CENTAVOS (offset 100), como a Meta exige. */
  totalAmount: number;
  currency?: string;
  paymentKind?: WhatsappPaymentKind;
  templateName?: string | null;
  /** wa_id aceito pela Meta (ela normaliza o 9o digito), nao o numero digitado. */
  sentTo?: string | null;
  messageId?: string | null;
  idFront?: string | null;
  pixKey?: string | null;
  merchantName?: string | null;
  pixCodeTail?: string | null;
  paidAt?: string | null;
  expiresAt?: string | null;
  statusError?: string | null;
  tenantId?: number;
  whatsappId?: number;
  ticketId?: number | null;
  contactId?: number | null;
  userId?: number | null;
  user?: { id: number; name: string } | null;
  contact?: { id: number; name: string; number?: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsappPaymentFilters {
  ticketId?: number;
  status?: WhatsappPaymentStatus;
}

type ListResponse =
  | WhatsappPayment[]
  | { payments?: WhatsappPayment[]; data?: WhatsappPayment[] };

/**
 * Lista as cobrancas do tenant. Aceita array puro ou envelope ({payments}/{data})
 * para nao depender do formato exato da resposta.
 *
 * Chamada de tela (mount), entao BACKGROUND_REQUEST: um 402 de plano aqui nao
 * deve virar toast — o usuario nao pediu nada.
 */
export async function listWhatsappPayments(
  filters: WhatsappPaymentFilters = {}
): Promise<WhatsappPayment[]> {
  const params: Record<string, string> = {};
  if (filters.ticketId) params.ticketId = String(filters.ticketId);
  if (filters.status) params.status = filters.status;
  const res = await api.get<ListResponse>("/whatsapp-payments", {
    params,
    ...BACKGROUND_REQUEST,
  });
  const body = res?.data;
  if (Array.isArray(body)) return body;
  return body?.payments || body?.data || [];
}

/** Baixa manual: o cliente recebe a confirmacao no WhatsApp (order_status). */
export async function markPaymentAsPaid(id: number): Promise<WhatsappPayment | null> {
  const res = await api.put<WhatsappPayment>(`/whatsapp-payments/${id}/paid`, {});
  return res?.data ?? null;
}

/** Cancelamento: so vale antes da captura (transicao invalida = erro 2046 na Meta). */
export async function cancelPayment(id: number): Promise<WhatsappPayment | null> {
  const res = await api.put<WhatsappPayment>(`/whatsapp-payments/${id}/cancel`, {});
  return res?.data ?? null;
}
