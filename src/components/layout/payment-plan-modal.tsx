"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CreditCard, Calendar, RefreshCw, CheckCircle2, Loader2, AlertTriangle, Clock, Users, Wifi, Info,
  ExternalLink, Link2, PauseCircle, HelpCircle,
} from "lucide-react";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { toast } from "sonner";
import {
  changePlanV2,
  createSubscriptionAuthorizationLink,
  fetchPlanChangeQuoteV2,
  fetchSubscriptionV2,
  type PlanChangeCharge,
  type PlanChangeQuote,
  type SubscriptionV2Extras,
} from "@/services/tenants";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { isAttentionPaymentStatus, isPaidPayment, isZeroValuePayment, normalizePaymentStatus } from "@/lib/tenant-billing";
import type { Plan } from "@/services/plans";

export interface AsaasSubscription {
  id: string;
  status: string;
  value: number;
  nextDueDate: string;
  description: string;
  billingType: string;
  cycle: string;
  planId?: number;
  /** Status cru do gateway (Stripe: `trialing` = em teste grátis). */
  gatewayStatus?: string;
  /** Fim do teste grátis (Stripe `trialing`), ISO. */
  trialEnd?: string | null;
  /** Link de autorização da assinatura do Mercado Pago que ainda aguarda o cliente (aditivo). */
  authorizeUrl?: string | null;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  description: string;
  bankSlipUrl?: string;
  /** `plan_change` = fatura avulsa da diferença de troca de plano. */
  kind?: string | null;
}

interface PaymentPlanModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subscription: AsaasSubscription | null;
  payments: AsaasPayment[];
  availablePlans: Plan[];
  onPlanChanged: () => void;
  /** Plano da empresa no banco (`currentPlanId` de /tenantsSubscriptionV2). */
  currentPlanId?: number | null;
  /** Gateway efetivo da empresa (`gateway` de /tenantsSubscriptionV2), só para mensagens. */
  gateway?: string | null;
  /**
   * Campos aditivos de /tenantsSubscriptionV2 (PLANO_COBRANCA_MERCADOPAGO_PAGARME §5.3.6).
   * Ausente = o modal lê sozinho, e só para Mercado Pago/Pagar.me (os outros gateways não
   * pagam consulta nenhuma a mais).
   */
  extras?: SubscriptionV2Extras | null;
}

/** Gateways com assinatura que o cliente autoriza (MP) ou paga por boleto (Pagar.me) e pode ser gerada de novo. */
const RECREATE_GATEWAYS = new Set(["mercadopago", "pagarme"]);

// Rota de gerar o link inexistente (backend antigo, 404 sem código): o botão some até a
// página recarregar — o modal remonta a cada abertura e voltaria a oferecer o botão.
let authorizationLinkRouteMissing = false;

function pickSubscriptionExtras(data: unknown): SubscriptionV2Extras {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const flag = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  return {
    subscriptionMissing: flag(d.subscriptionMissing),
    canRecreate: flag(d.canRecreate),
    subscriptionPaused: flag(d.subscriptionPaused),
    gatewayTrialSupported: flag(d.gatewayTrialSupported),
  };
}

/** Algum campo novo veio: o backend conhece a cobrança nova do Mercado Pago/Pagar.me. */
function hasSubscriptionExtras(extras?: SubscriptionV2Extras | null): boolean {
  return !!extras && (
    typeof extras.subscriptionMissing === "boolean" ||
    typeof extras.canRecreate === "boolean" ||
    typeof extras.subscriptionPaused === "boolean" ||
    typeof extras.gatewayTrialSupported === "boolean"
  );
}

// Explicação da cobrança no gateway. O tooltip do Radix não abre por toque (fecha no
// clique), então o clique abre e tocar fora fecha: sem isso, no celular a explicação
// nunca apareceria.
function GatewayBillingTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={text}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="inline-flex shrink-0 items-center text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          collisionPadding={16}
          className="max-w-[18rem] whitespace-normal leading-relaxed"
          onPointerDownOutside={(e) => {
            if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Prévia da troca (PLANO_COBRANCA_PLANOS_GATEWAY D1/D2/D9/D10/D14). `legacy` = backend
 * sem a rota de prévia (404): a tela mostra o texto de antes e troca sem mandar valor.
 */
type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; quote: PlanChangeQuote; changed: boolean }
  | { status: "legacy" }
  | { status: "error"; message: string };

const PLAN_CHANGE_ERROR_KEYS: Record<string, string> = {
  ERR_NO_PERMISSION_PLAN_CHANGE: "errPlanChangePermission",
  ERR_PLAN_CHANGE_IN_PROGRESS: "errPlanChangeInProgress",
  ERR_PLAN_CHANGE_GATEWAY_REJECTED: "errPlanChangeGatewayRejected",
  ERR_PLAN_CHANGE_GATEWAY_UNAVAILABLE: "errPlanChangeGatewayUnavailable",
  ERR_PLAN_CHANGE_GATEWAY_DATA: "errPlanChangeGatewayData",
  ERR_PLAN_NOT_AVAILABLE: "errPlanNotAvailable",
  ERR_PLAN_NOT_FOUND: "errPlanNotAvailable",
  ERR_INVALID_PLAN_ID: "errPlanNotAvailable",
  // Cobrança do Mercado Pago/Pagar.me (troca e "Gerar link/boleto da assinatura").
  ERR_PAYMENT_RETURN_URL_MISSING: "errPaymentReturnUrlMissing",
  ERR_SUBSCRIPTION_ALREADY_ACTIVE: "errSubscriptionAlreadyActive",
  ERR_SUBSCRIPTION_PAUSED: "errSubscriptionPaused",
  ERR_PLAN_BELOW_GATEWAY_MINIMUM: "errPlanBelowGatewayMinimum",
  ERR_GATEWAY_NOT_SUPPORTED: "errGatewayNotSupported",
};

function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
}

function quoteFromError(err: unknown): PlanChangeQuote | null {
  const e = err as { data?: { quote?: unknown }; response?: { data?: { quote?: unknown } } } | null;
  const q = (e?.data?.quote ?? e?.response?.data?.quote) as PlanChangeQuote | undefined;
  return q && typeof q === "object" && typeof q.mode === "string" ? q : null;
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Rótulos no idioma da tela: paymentPlanModal.billingType.<TIPO> e paymentPlanModal.cycle.<CICLO>.
const TRANSLATED_BILLING_TYPES = ["BOLETO", "CREDIT_CARD"];
const BILLING_TYPE_LABEL: Record<string, string> = {
  PIX: "PIX",
  UNDEFINED: "—",
};

const CYCLES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUALLY", "YEARLY"];

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return dateStr;
  }
}

function formatCurrency(value?: number): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const GATEWAY_LABEL: Record<string, string> = {
  asaas: "Asaas",
  stripe: "Stripe",
  pagarme: "Pagar.me",
  mercadopago: "Mercado Pago",
};

export function PaymentPlanModal({
  open, onOpenChange, subscription, payments, availablePlans, onPlanChanged, currentPlanId, gateway, extras,
}: PaymentPlanModalProps) {
  const t = useTranslations("paymentPlanModal");
  // Textos da prévia e dos erros da troca: os mesmos da tela /configuracoes/pagamentos.
  const tq = useTranslations("configPagamentosPage");
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [changing, setChanging] = useState(false);
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "idle" });
  // Resposta de prévia de um plano que já não está selecionado é descartada.
  const quoteReq = useRef(0);

  // ── Assinatura no Mercado Pago/Pagar.me (PLANO_COBRANCA_MERCADOPAGO_PAGARME §5.8) ──
  // Sem `extras` do chamador, o modal lê a assinatura uma vez ao abrir — só para esses
  // dois gateways. Backend antigo não manda os campos novos e nada aparece.
  const gw = String(gateway ?? "");
  const recreateGateway = RECREATE_GATEWAYS.has(gw);
  const [fetchedExtras, setFetchedExtras] = useState<SubscriptionV2Extras | null>(null);
  const [fetchedAuthorizeUrl, setFetchedAuthorizeUrl] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkRouteMissing, setLinkRouteMissing] = useState(authorizationLinkRouteMissing);
  const extrasReq = useRef(0);
  const selfLoadExtras = extras === undefined;

  const reloadExtras = () => {
    if (!recreateGateway || !selfLoadExtras) return;
    const req = ++extrasReq.current;
    fetchSubscriptionV2()
      .then(({ data }) => {
        if (req !== extrasReq.current) return;
        setFetchedExtras(pickSubscriptionExtras(data));
        const url = (data as { subscription?: { authorizeUrl?: unknown } | null } | null)?.subscription?.authorizeUrl;
        setFetchedAuthorizeUrl(typeof url === "string" ? url : null);
      })
      .catch(() => { /* sem os campos novos: o modal fica como antes */ });
  };

  useEffect(() => {
    if (!open) return;
    reloadExtras();
    return () => { extrasReq.current++; };
    // Lê ao abrir (o modal remonta a cada abertura); a releitura depois de gerar o link é manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recreateGateway, selfLoadExtras]);

  const effectiveExtras = selfLoadExtras ? fetchedExtras : extras;
  // A leitura feita agora vence a do menu (o cliente pode ter autorizado em outra aba).
  const authorizeUrlRaw = selfLoadExtras && fetchedExtras ? fetchedAuthorizeUrl : subscription?.authorizeUrl;
  const authorizeUrl = recreateGateway && authorizeUrlRaw && isValidHttpUrl(authorizeUrlRaw) ? authorizeUrlRaw.trim() : null;
  const extrasKnown = recreateGateway && hasSubscriptionExtras(effectiveExtras);
  const subscriptionPaused = extrasKnown && effectiveExtras?.subscriptionPaused === true;
  const showRecreate =
    extrasKnown &&
    effectiveExtras?.canRecreate === true &&
    !subscriptionPaused &&
    !authorizeUrl &&
    !linkRouteMissing;
  const showGatewayBlock = recreateGateway && (!!authorizeUrl || showRecreate || subscriptionPaused);
  const gatewayName = GATEWAY_LABEL[gw] ?? gw;

  // Fatura de R$ 0 (teste grátis) não é "último pagamento".
  const latestPayment = (payments ?? []).find((p) => !isZeroValuePayment(p)) ?? null;
  const latestStatus = latestPayment
    ? (isPaidPayment(latestPayment) ? "RECEIVED" : normalizePaymentStatus(latestPayment.status))
    : "";

  const billingTypeLabel = (type: string): string =>
    TRANSLATED_BILLING_TYPES.includes(type) ? t(`billingType.${type}`) : BILLING_TYPE_LABEL[type] ?? type;
  const cycleLabel = (cycle: string): string => (CYCLES.includes(cycle) ? t(`cycle.${cycle}`) : cycle);

  const paymentStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      PENDING:  { label: t("statusPending"),  variant: "outline" },
      RECEIVED: { label: t("statusReceived"), variant: "default" },
      OVERDUE:  { label: t("statusOverdue"),  variant: "destructive" },
      // Mercado Pago/Pagar.me (D8): recusada, paga a menos, estornada, assinatura cancelada.
      FAILED:                { label: t("statusFailed"),               variant: "destructive" },
      UNDERPAID:             { label: t("statusUnderpaid"),            variant: "destructive" },
      CHARGEBACK:            { label: t("statusChargeback"),           variant: "destructive" },
      SUBSCRIPTION_CANCELED: { label: t("statusSubscriptionCanceled"), variant: "destructive" },
    };
    const s = map[status] ?? { label: status, variant: "secondary" };
    return <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>;
  };

  const planChangeErrorMessage = (err: unknown): string => {
    const code = getBackendErrorCode(err);
    if (code === "ERR_TENANT_GATEWAY_CUSTOMER_NOT_CONFIGURED") {
      const gw = String((quoteState.status === "ready" ? quoteState.quote.gateway : null) ?? gateway ?? "");
      return tq("planGatewayNotConfigured", { gateway: GATEWAY_LABEL[gw] ?? (gw || "—") });
    }
    const key = PLAN_CHANGE_ERROR_KEYS[code];
    return key ? tq(key) : t("planChangedError");
  };

  /** Valor que a troca cobra (ou o valor novo, na descida/1ª cobrança) — o que a tela mostra. */
  const quoteDisplayAmount = (quote: PlanChangeQuote, plan: Plan): number => {
    const planValue = finiteOr(plan.value, 0);
    if (quote.mode === "update_first_charge") return finiteOr(quote.newValue, planValue);
    if (quote.mode === "new_subscription") {
      const amount = finiteOr(quote.amount, 0);
      return amount > 0 ? amount : finiteOr(quote.newValue, planValue);
    }
    if (quote.direction === "down") return finiteOr(quote.newValue, planValue);
    return finiteOr(quote.amount, 0);
  };

  const quoteText = (quote: PlanChangeQuote, plan: Plan): string => {
    const amount = formatCurrency(quoteDisplayAmount(quote, plan));
    if (quote.mode === "unsupported") return tq("planQuoteUnsupported");
    if (quote.mode === "new_subscription") return tq("planQuoteNewSubscription", { amount });
    if (quote.direction === "down") return tq("planQuoteDowngrade", { amount });
    if (quote.mode === "difference") {
      return tq("planQuoteDifference", { amount, days: Math.max(0, finiteOr(quote.remainingDays, 0)) });
    }
    if (quote.mode === "update_first_charge") return tq("planQuoteFirstCharge", { amount });
    return tq("planQuoteNoCharge");
  };

  const loadQuote = (plan: Plan, changed = false) => {
    const req = ++quoteReq.current;
    setQuoteState({ status: "loading" });
    fetchPlanChangeQuoteV2(plan.id)
      .then(({ data }) => {
        if (req !== quoteReq.current) return;
        const quote = data as PlanChangeQuote | undefined;
        if (quote && typeof quote === "object" && typeof quote.mode === "string") {
          setQuoteState({ status: "ready", quote, changed });
        } else {
          setQuoteState({ status: "legacy" });
        }
      })
      .catch((err: unknown) => {
        if (req !== quoteReq.current) return;
        // Backend sem a prévia (404 SEM código): troca como antes, com o texto de antes. 404
        // com código (plano/empresa não encontrados) é erro da prévia nova, não backend antigo.
        if (errorStatus(err) === 404 && !getBackendErrorCode(err)) {
          setQuoteState({ status: "legacy" });
          return;
        }
        setQuoteState({ status: "error", message: planChangeErrorMessage(err) });
      });
  };

  const togglePlan = (plan: Plan) => {
    if (confirmPlan?.id === plan.id) {
      quoteReq.current++;
      setConfirmPlan(null);
      setQuoteState({ status: "idle" });
      return;
    }
    setConfirmPlan(plan);
    loadQuote(plan);
  };

  const cancelConfirm = () => {
    quoteReq.current++;
    setConfirmPlan(null);
    setQuoteState({ status: "idle" });
  };

  /** Fatura gerada pela troca: avisa com o atalho para pagar (link do gateway, nova aba). */
  const notifyCharge = (charge?: PlanChangeCharge | null) => {
    if (!charge) return;
    const amount = finiteOr(charge.amount, 0);
    if (amount <= 0 || !["difference", "update_first_charge", "new_subscription"].includes(charge.mode)) return;
    const url = charge.paymentUrl;
    const isDifference = charge.mode === "difference";
    // Mercado Pago: o link é a autorização da assinatura (cadastrar a forma de pagamento),
    // não uma fatura para pagar.
    const isAuthorize = charge.paymentAction === "authorize";
    // Sem link, a 1ª cobrança ainda não existe (teste grátis, ou Asaas que ainda não gerou):
    // "fatura disponível" mandaria o cliente procurar algo que não está lá.
    if (!isDifference && !(url && isValidHttpUrl(url))) return;
    const message = isAuthorize && url && isValidHttpUrl(url)
      ? tq("authorizeSubscriptionHint")
      : isDifference
      ? tq("planChangeChargeCreated", { amount: formatCurrency(amount) })
      : tq("planChangeInvoiceReady", { amount: formatCurrency(amount) });
    toast.info(message, {
      duration: 20000,
      ...(url && isValidHttpUrl(url)
        ? {
            action: {
              label: isAuthorize
                ? tq("authorizeSubscription")
                : isDifference ? tq("planChangePayDifference") : tq("planChangePayInvoice"),
              onClick: () => { window.open(url, "_blank", "noopener,noreferrer"); },
            },
          }
        : {}),
    });
  };

  /**
   * "Gerar link da assinatura" (Mercado Pago) / "Gerar boleto da assinatura" (Pagar.me):
   * a empresa sem assinatura ativa no gateway gera a cobrança de novo (D7/D20). O link abre
   * em nova aba; se o navegador barrar a aba, o aviso traz o atalho.
   */
  const handleCreateLink = async () => {
    if (creatingLink) return;
    setCreatingLink(true);
    try {
      const { data } = await createSubscriptionAuthorizationLink();
      const url = typeof data?.paymentUrl === "string" ? data.paymentUrl.trim() : "";
      const isAuthorize = data?.paymentAction === "authorize";
      const validUrl = url && isValidHttpUrl(url) ? url : null;
      if (validUrl) window.open(validUrl, "_blank", "noopener,noreferrer");
      toast.info(tq("createSubscriptionLinkReady"), {
        duration: 20000,
        ...(validUrl
          ? {
              action: {
                label: isAuthorize ? tq("authorizeSubscription") : tq("planChangePayInvoice"),
                onClick: () => { window.open(validUrl, "_blank", "noopener,noreferrer"); },
              },
            }
          : {}),
      });
      onPlanChanged();
      reloadExtras();
    } catch (err: unknown) {
      const code = getBackendErrorCode(err);
      // Backend sem a rota (404 sem código): o botão some até a página recarregar.
      if (errorStatus(err) === 404 && !code) {
        authorizationLinkRouteMissing = true;
        setLinkRouteMissing(true);
        toast.error(tq("createSubscriptionLinkError"));
        return;
      }
      const key = PLAN_CHANGE_ERROR_KEYS[code];
      toast.error(key ? tq(key) : tq("createSubscriptionLinkError"));
      // A assinatura mudou no gateway desde a leitura: relê para a tela mostrar o estado real.
      if (code === "ERR_SUBSCRIPTION_ALREADY_ACTIVE" || code === "ERR_SUBSCRIPTION_PAUSED") {
        onPlanChanged();
        reloadExtras();
      }
    } finally {
      setCreatingLink(false);
    }
  };

  const subscriptionStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      ACTIVE:   { label: t("subActive"),   className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
      INACTIVE: { label: t("subInactive"), className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
      EXPIRED:  { label: t("subExpired"),  className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
    };
    // Mercado Pago: assinatura criada que o cliente ainda não autorizou (`pending` → INACTIVE + link).
    const s = normalizePaymentStatus(status) === "INACTIVE" && authorizeUrl
      ? { label: t("statusAwaitingAuthorization"), className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" }
      : map[status] ?? { label: status, className: "bg-secondary text-secondary-foreground" };
    return <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", s.className)}>{s.label}</span>;
  };

  const canConfirm = quoteState.status === "ready" || quoteState.status === "legacy";

  const handleChangePlan = async () => {
    if (!confirmPlan || !canConfirm) return;
    const plan = confirmPlan;
    // Manda o valor/modo mostrados: se mudaram no servidor, ele recusa (409) sem trocar.
    const quote = quoteState.status === "ready" ? quoteState.quote : null;
    setChanging(true);
    try {
      const { data } = await changePlanV2(plan.id, quote);
      toast.success(t("planChangedSuccess", { name: plan.name }));
      notifyCharge(data?.charge);
      cancelConfirm();
      onPlanChanged();
      onOpenChange(false);
    } catch (err: unknown) {
      if (getBackendErrorCode(err) === "ERR_PLAN_CHANGE_QUOTE_CHANGED") {
        const fresh = quoteFromError(err);
        if (fresh) {
          quoteReq.current++;
          setQuoteState({ status: "ready", quote: fresh, changed: true });
        } else {
          loadQuote(plan, true);
        }
        return;
      }
      toast.error(planChangeErrorMessage(err));
    } finally {
      setChanging(false);
    }
  };

  // Plano atual: o da empresa no banco (`currentPlanId`) quando vier; sem ele, o planId
  // do metadata do gateway ou valor + nome (fallback legado).
  const isCurrentPlan = (plan: Plan) =>
    currentPlanId != null
      ? Number(currentPlanId) === plan.id
      : (subscription?.planId != null && Number(subscription.planId) === plan.id) ||
        (Number(subscription?.value) === Number(plan.value) && subscription?.description === plan.name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* Current subscription */}
        {subscription ? (
          <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{subscription.description || t("currentPlan")}</span>
              {subscriptionStatusBadge(subscription.status)}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                <span>{formatCurrency(subscription.value)} / {cycleLabel(subscription.cycle)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{t("nextDue")}: {formatDate(subscription.nextDueDate)}</span>
              </div>
              <div className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                <span>{billingTypeLabel(subscription.billingType)}</span>
              </div>
              {latestPayment && (
                <div className="flex items-center gap-1.5">
                  {latestStatus === "RECEIVED"
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    : latestStatus === "OVERDUE" || isAttentionPaymentStatus(latestStatus)
                    ? <AlertTriangle className="h-3 w-3 text-red-500" />
                    : <Clock className="h-3 w-3 text-yellow-500" />}
                  <span>{t("lastPayment")}: {paymentStatusBadge(latestStatus)}</span>
                </div>
              )}
            </div>
            {/* O link da autorização (Mercado Pago) ganha botão próprio abaixo: aqui não vira "Ver boleto". */}
            {latestPayment?.bankSlipUrl && isValidHttpUrl(latestPayment.bankSlipUrl) && latestStatus !== "RECEIVED" &&
              latestPayment.bankSlipUrl.trim() !== authorizeUrl && (
              <a
                href={latestPayment.bankSlipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline underline-offset-2"
              >
                {t("viewBankSlip")}
              </a>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-4">{t("noSubscription")}</div>
        )}

        {/* Mercado Pago/Pagar.me: autorizar a assinatura, gerar a cobrança de novo ou o
            aviso de assinatura pausada. Backend antigo não manda nada e o bloco não aparece. */}
        {showGatewayBlock && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {subscriptionPaused && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <PauseCircle className="h-3 w-3" />
                  {tq("subscriptionPausedBadge")}
                </span>
              )}
              {authorizeUrl ? (
                <Button asChild size="sm">
                  <a href={authorizeUrl} target="_blank" rel="noopener noreferrer">
                    <CreditCard className="mr-2 h-3.5 w-3.5" />
                    {tq("authorizeSubscription")}
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </a>
                </Button>
              ) : showRecreate ? (
                <Button size="sm" variant="outline" onClick={handleCreateLink} disabled={creatingLink || changing}>
                  {creatingLink ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-2 h-3.5 w-3.5" />}
                  {gw === "pagarme" ? tq("createSubscriptionBoleto") : tq("createSubscriptionLink")}
                </Button>
              ) : null}
              <GatewayBillingTip text={tq("gatewayBillingHowItWorks", { gateway: gatewayName })} />
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {subscriptionPaused
                ? tq("subscriptionPausedHint")
                : authorizeUrl
                ? tq("authorizeSubscriptionHint")
                : tq("createSubscriptionLinkHint", { gateway: gatewayName })}
            </p>
          </div>
        )}

        {/* Available plans */}
        {availablePlans.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t("availablePlans")}</p>
              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {availablePlans.map((plan) => {
                  const isCurrent = isCurrentPlan(plan);
                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-3",
                        isCurrent && "border-primary bg-primary/5",
                        confirmPlan?.id === plan.id && !isCurrent && "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                      )}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{plan.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {t("currentPlanBadge")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>{formatCurrency(plan.value)}</span>
                          <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{plan.users} {t("users")}</span>
                          <span className="flex items-center gap-0.5"><Wifi className="h-3 w-3" />{plan.connections} {t("connections")}</span>
                        </div>
                      </div>
                      {!isCurrent && (
                        <Button
                          size="sm"
                          variant={confirmPlan?.id === plan.id ? "default" : "outline"}
                          className="ml-3 shrink-0"
                          disabled={changing}
                          onClick={() => togglePlan(plan)}
                        >
                          {confirmPlan?.id === plan.id ? t("selected") : t("select")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Confirm footer: o que a troca cobra, calculado pelo servidor antes de confirmar */}
        {confirmPlan && (
          <div className="space-y-2 border-t pt-3">
            {quoteState.status === "ready" && quoteState.changed && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                <span>
                  {tq("planQuoteChanged", {
                    amount: formatCurrency(quoteDisplayAmount(quoteState.quote, confirmPlan)),
                  })}
                </span>
              </div>
            )}
            <p className={cn("text-xs", quoteState.status === "error" ? "text-destructive" : "text-muted-foreground")}>
              {quoteState.status === "loading" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {tq("planQuoteLoading")}
                </span>
              ) : quoteState.status === "ready" ? (
                quoteText(quoteState.quote, confirmPlan)
              ) : quoteState.status === "error" ? (
                quoteState.message
              ) : (
                t("confirmChange", { name: confirmPlan.name, value: formatCurrency(Number(confirmPlan.value)) })
              )}
            </p>
            {quoteState.status === "ready" &&
              !["unsupported", "new_subscription"].includes(quoteState.quote.mode) && (
                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <Info className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{tq("planChangeRulesNote")}</span>
                </p>
              )}
            <DialogFooter className="flex-row justify-end gap-2 sm:space-x-0">
              <Button variant="outline" size="sm" onClick={cancelConfirm} disabled={changing}>
                {t("cancel")}
              </Button>
              {quoteState.status === "error" ? (
                <Button size="sm" variant="outline" onClick={() => loadQuote(confirmPlan)} disabled={changing}>
                  <RefreshCw className="mr-2 h-3 w-3" />
                  {tq("planQuoteRetry")}
                </Button>
              ) : (
                <Button size="sm" onClick={handleChangePlan} disabled={changing || !canConfirm}>
                  {changing && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  {t("confirm")}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
