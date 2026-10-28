/**
 * Critérios de cobrança da empresa no front (PLANO_COBRANCA_PLANOS_GATEWAY).
 *
 * Ponto único para "a empresa tem cobrança provisionada?" e "a assinatura já teve um
 * pagamento de verdade?". Até aqui cada tela tinha o seu critério: o hub de Configurações
 * só via o Asaas (`asaas === "enabled"`) e escondia Pagamentos de quem cobra pela Stripe,
 * e o menu do usuário tinha dois critérios diferentes no mesmo componente.
 *
 * Espelho do backend `helpers/PaymentRecordKindZPRO.ts` (pago = status pago E valor não
 * zero explícito; a avulsa de troca de plano não conta como pagamento da assinatura) —
 * mudar um exige o outro. Módulo puro: sem React.
 */

type TenantBillingFields = Record<string, unknown> | null | undefined;

export interface BillingPaymentLike {
  status?: string | null;
  value?: number | string | null;
  kind?: string | null;
}

const PAID_STATUSES = new Set([
  "RECEIVED",
  "RECEIVED_IN_CASH",
  "CONFIRMED",
  "DUNNING_RECEIVED",
  "PAID",
  "OVERPAID",
  "APPROVED",
  "PAID_OUT",
]);

/**
 * Status de cobrança que pedem atenção (PLANO_COBRANCA_MERCADOPAGO_PAGARME, D8): recusada,
 * paga a menos, estornada e assinatura cancelada no gateway. Contam como atraso pela data
 * de vencimento, como uma pendente. Espelho de `PAYMENT_ATTENTION_STATUSES` do backend.
 */
export const PAYMENT_ATTENTION_STATUSES: readonly string[] = Object.freeze([
  "FAILED",
  "UNDERPAID",
  "CHARGEBACK",
  "SUBSCRIPTION_CANCELED",
]);

export function isAttentionPaymentStatus(status: unknown): boolean {
  return PAYMENT_ATTENTION_STATUSES.includes(normalizePaymentStatus(status));
}

/** Status do gateway em maiúsculas (Pagar.me e Mercado Pago chegam em minúsculas). */
export function normalizePaymentStatus(status: unknown): string {
  return String(status ?? "").toUpperCase();
}

/** Zero explícito (fatura de R$ 0 do teste grátis). Valor ausente não é zero. */
export function isZeroValuePayment(p: BillingPaymentLike | null | undefined): boolean {
  const v = p?.value;
  if (typeof v === "number") return v === 0;
  if (typeof v === "string" && v.trim() !== "") return Number(v) === 0;
  return false;
}

export function isPaidPayment(p: BillingPaymentLike | null | undefined): boolean {
  return !!p && PAID_STATUSES.has(normalizePaymentStatus(p.status)) && !isZeroValuePayment(p);
}

/** Já existe pagamento de verdade da assinatura (fora o R$ 0 do teste e a avulsa de troca). */
export function hasConfirmedSubscriptionPayment(
  payments: BillingPaymentLike[] | null | undefined
): boolean {
  return (payments ?? []).some((p) => isPaidPayment(p) && p.kind !== "plan_change");
}

/**
 * Empresa com cobrança provisionada no gateway. Usa o veredito do backend
 * (`billingProvisioned`, mesmo critério do job de bloqueio) quando vier; sem ele
 * (backend antigo), exige o cliente criado no gateway — nunca a flag `asaas` sozinha.
 */
export function isTenantBillingProvisioned(td: TenantBillingFields): boolean {
  if (!td) return false;
  if (typeof td.billingProvisioned === "boolean") return td.billingProvisioned;
  const gw = typeof td.paymentGateway === "string" && td.paymentGateway ? td.paymentGateway : "asaas";
  if (gw === "asaas") return td.asaas === "enabled" && !!td.asaasCustomerId;
  return !!td[`${gw}CustomerId`];
}
