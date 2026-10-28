"use client";

import { formatDate, formatCurrencyBRL } from "@/lib/format";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CreditCard, ExternalLink, Check, Users, Plug, Loader2, AlertTriangle, Info, RefreshCw,
  Link2, PauseCircle, HelpCircle,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import {
  fetchPaymentsV2,
  fetchSubscriptionV2,
  changePlanV2,
  createSubscriptionAuthorizationLink,
  fetchPlanChangeQuoteV2,
  refreshPaymentStatusV2,
  type PlanChangeCharge,
  type PlanChangeQuote,
  type SubscriptionV2Extras,
} from "@/services/tenants";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { isZeroValuePayment, normalizePaymentStatus } from "@/lib/tenant-billing";
import { cn, isValidHttpUrl } from "@/lib/utils";

interface Payment {
  id: string;
  status: string;
  dueDate?: string;
  value?: number;
  paymentUrl?: string;
  gateway: string;
  /** `plan_change` = fatura avulsa da diferença de troca de plano. */
  kind?: string | null;
}

interface Plan {
  id: number;
  name: string;
  value: number | string;
  connections: number | string;
  users: number | string;
  trial?: boolean | "enabled" | "disabled";
  trialPeriod?: number;
}

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  paid: "success", received: "success", confirmed: "success", active: "success",
  received_in_cash: "success", dunning_received: "success", approved: "success", overpaid: "success",
  overdue: "destructive", cancelled: "secondary", canceled: "secondary", refunded: "secondary",
  pending: "warning", authorized: "warning",
  // Mercado Pago/Pagar.me (D8): recusada, paga a menos, estornada, assinatura cancelada.
  failed: "destructive", underpaid: "destructive", chargeback: "destructive", subscription_canceled: "destructive",
};

// Status do gateway no idioma da tela (molde da tela de pagamento em atraso). Status fora
// da lista segue com o texto do gateway.
const STATUS_LABEL_KEYS: Record<string, string> = {
  paid: "statusPaid",
  approved: "statusPaid",
  overpaid: "statusPaid",
  pending: "statusPending",
  overdue: "statusOverdue",
  confirmed: "statusConfirmed",
  received: "statusReceived",
  received_in_cash: "statusReceived",
  dunning_received: "statusReceived",
  refunded: "statusRefunded",
  cancelled: "statusCancelled",
  canceled: "statusCancelled",
  failed: "statusFailed",
  underpaid: "statusUnderpaid",
  chargeback: "statusChargeback",
  subscription_canceled: "statusSubscriptionCanceled",
};

const GATEWAY_LABEL: Record<string, string> = {
  asaas: "Asaas",
  stripe: "Stripe",
  pagarme: "Pagar.me",
  mercadopago: "Mercado Pago",
};

// Teste grátis do plano: vale o que o servidor diz (`gatewayTrialSupported`); backend sem o
// campo = só Stripe e Asaas, como antes (D3/D8).
const TRIAL_GATEWAYS = new Set(["stripe", "asaas"]);

/** Gateways com assinatura que o cliente autoriza (MP) ou paga por boleto (Pagar.me) e pode ser gerada de novo. */
const RECREATE_GATEWAYS = new Set(["mercadopago", "pagarme"]);

// Volta do gateway (`?gatewayReturn=1`): a empresa bloqueada é levada à tela de pagamento
// em atraso SEM o parâmetro, então esta tela deixa a marca para aquela conferir na hora.
// Mesmo nome e prazo em configuracoesPagamentoAtrasado/page.tsx.
const GATEWAY_RETURN_MARK_KEY = "zproGatewayReturnAt";

function hasGatewayReturnParam(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("gatewayReturn") === "1";
  } catch {
    return false;
  }
}

function markGatewayReturn(): void {
  try {
    window.sessionStorage.setItem(GATEWAY_RETURN_MARK_KEY, String(Date.now()));
  } catch {
    /* sem sessionStorage (aba privada, bloqueio): só a releitura desta tela vale */
  }
}

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
            <HelpCircle className="h-4 w-4" />
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

/**
 * Prévia da troca (PLANO_COBRANCA_PLANOS_GATEWAY D1/D2/D9/D10/D14). `legacy` = backend
 * sem a rota de prévia (404): o diálogo mostra o texto de antes e troca sem mandar valor.
 */
type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; quote: PlanChangeQuote; changed: boolean }
  | { status: "legacy" }
  | { status: "error"; message: string };

function isTrialPlan(p: Plan): boolean {
  return p.trial === true || p.trial === "enabled";
}

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

export default function PagamentosPage() {
  const t = useTranslations("configPagamentosPage");
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const canViewPayments = useAuthStore((s) => s.canViewPayments);
  const allowed = canViewPayments();

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsError, setPaymentsError] = useState(false);
  const [gateway, setGateway] = useState<string>("asaas");

  const [plansLoading, setPlansLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("");
  const [currentPlanId, setCurrentPlanId] = useState<number | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [changing, setChanging] = useState(false);
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "idle" });
  // Resposta de prévia de um plano que já não está no diálogo é descartada.
  const quoteReq = useRef(0);

  // Assinatura no Mercado Pago/Pagar.me (PLANO_COBRANCA_MERCADOPAGO_PAGARME §5.8): campos
  // aditivos de /tenantsSubscriptionV2. Backend antigo não manda e a tela fica como antes.
  const router = useRouter();
  const pathname = usePathname();
  const [subExtras, setSubExtras] = useState<SubscriptionV2Extras>({});
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  // Rota de gerar o link inexistente (backend antigo, 404 sem código): o botão some.
  const [linkRouteMissing, setLinkRouteMissing] = useState(false);
  const [gatewayReturnChecking, setGatewayReturnChecking] = useState(false);
  const gatewayReturnHandledRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadSubscription = useCallback(() => {
    setPlansLoading(true);
    fetchSubscriptionV2()
      .then(({ data }) => {
        setPlans(data?.availablePlans ?? []);
        setSubscriptionStatus(normalizePaymentStatus(data?.subscription?.status));
        // Plano da empresa no banco; backend anterior não manda → planId do gateway.
        const current = Number(data?.currentPlanId ?? data?.subscription?.planId);
        setCurrentPlanId(Number.isInteger(current) && current > 0 ? current : null);
        if (data?.gateway) setGateway(data.gateway);
        setSubExtras(pickSubscriptionExtras(data));
        const url = data?.subscription?.authorizeUrl;
        setAuthorizeUrl(typeof url === "string" && isValidHttpUrl(url) ? url.trim() : null);
      })
      .catch(() => { toast.error(t("planLoadError")); })
      .finally(() => setPlansLoading(false));
  }, [t]);

  const loadPayments = useCallback(() => {
    setLoading(true);
    fetchPaymentsV2()
      .then(({ data }) => {
        setPayments(data?.payments ?? []);
        setPaymentsError(false);
        setGateway(data?.gateway ?? "asaas");
      })
      .catch(() => {
        // Falha ao consultar não é "nenhum pagamento": avisa e mostra o aviso no lugar da lista.
        setPaymentsError(true);
        toast.error(t("paymentsLoadError"));
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    if (!user?.tenantId || !allowed) { setLoading(false); setPlansLoading(false); return; }
    // Volta do gateway (`?gatewayReturn=1`, D17/M2): o aviso de assinatura do Mercado Pago
    // pode nunca chegar, então a tela pede a releitura UMA vez, limpa o parâmetro (um F5
    // não repete) e só depois carrega — senão mostraria o estado de antes da autorização.
    if (!gatewayReturnHandledRef.current && hasGatewayReturnParam()) {
      gatewayReturnHandledRef.current = true;
      markGatewayReturn();
      try {
        const params = new URLSearchParams(window.location.search);
        params.delete("gatewayReturn");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      } catch { /* parâmetro fica na URL: só repetiria a releitura */ }
      setGatewayReturnChecking(true);
      refreshPaymentStatusV2()
        .catch(() => { /* a leitura abaixo mostra o que o servidor tem */ })
        .finally(() => {
          // A marca fica (vence em 5 min): se a empresa estiver bloqueada, o painel a leva à
          // tela de pagamento em atraso — às vezes só depois desta releitura — e lá ela confere
          // de novo uma vez. Desmontada, não há tela para atualizar.
          if (!mountedRef.current) return;
          setGatewayReturnChecking(false);
          loadPayments();
          loadSubscription();
        });
      return;
    }
    loadPayments();
    loadSubscription();
    // router/pathname ficam fora: a releitura da volta roda uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, allowed, loadPayments, loadSubscription]);

  // Vencimento só com a data ("AAAA-MM-DD") é lido no fuso local: `new Date` o lê como
  // meia-noite UTC e, no Brasil, a tela mostrava o dia anterior.
  const fmt = (d?: string) => {
    if (!d) return "—";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
    return Number.isNaN(date.getTime()) ? d : formatDate(date);
  };
  const fmtVal = (v?: number) => v != null && Number.isFinite(Number(v)) ? formatCurrencyBRL(Number(v)) : "—";
  const gatewayLabel = GATEWAY_LABEL[gateway] ?? gateway;
  const trialAvailable =
    typeof subExtras.gatewayTrialSupported === "boolean"
      ? subExtras.gatewayTrialSupported
      : TRIAL_GATEWAYS.has(gateway);

  // Mercado Pago/Pagar.me: autorizar a assinatura, gerar a cobrança de novo, selo de pausada.
  // Gerar exige o administrador (o servidor recusa os demais, como na troca de plano).
  const canManageSubscription = user?.profile === "admin" || user?.profile === "superadmin";
  const recreateGateway = RECREATE_GATEWAYS.has(gateway);
  const subscriptionPaused = recreateGateway && subExtras.subscriptionPaused === true;
  const authorizeLink = recreateGateway ? authorizeUrl : null;
  const showRecreate =
    recreateGateway &&
    canManageSubscription &&
    subExtras.canRecreate === true &&
    !subscriptionPaused &&
    !authorizeLink &&
    !linkRouteMissing;
  const showGatewayBlock = recreateGateway && (!!authorizeLink || showRecreate || subscriptionPaused);

  const planValueLabel = (p: Plan) => {
    const v = Number(p.value) || 0;
    return v > 0 ? `${formatCurrencyBRL(v)}${t("planPerMonth")}` : t("planFree");
  };

  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
    ],
  };

  const planChangeErrorMessage = (err: unknown): string => {
    const code = getBackendErrorCode(err);
    if (code === "ERR_TENANT_GATEWAY_CUSTOMER_NOT_CONFIGURED") {
      return t("planGatewayNotConfigured", { gateway: gatewayLabel });
    }
    const key = PLAN_CHANGE_ERROR_KEYS[code];
    return key ? t(key) : t("planChangeError");
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
    const amount = formatCurrencyBRL(quoteDisplayAmount(quote, plan));
    if (quote.mode === "unsupported") return t("planQuoteUnsupported");
    if (quote.mode === "new_subscription") return t("planQuoteNewSubscription", { amount });
    if (quote.direction === "down") return t("planQuoteDowngrade", { amount });
    if (quote.mode === "difference") {
      return t("planQuoteDifference", { amount, days: Math.max(0, finiteOr(quote.remainingDays, 0)) });
    }
    if (quote.mode === "update_first_charge") return t("planQuoteFirstCharge", { amount });
    return t("planQuoteNoCharge");
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

  const openConfirm = (plan: Plan) => {
    setConfirmPlan(plan);
    loadQuote(plan);
  };

  const closeConfirm = () => {
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
      ? t("authorizeSubscriptionHint")
      : isDifference
      ? t("planChangeChargeCreated", { amount: formatCurrencyBRL(amount) })
      : t("planChangeInvoiceReady", { amount: formatCurrencyBRL(amount) });
    toast.info(message, {
      duration: 20000,
      ...(url && isValidHttpUrl(url)
        ? {
            action: {
              label: isAuthorize
                ? t("authorizeSubscription")
                : isDifference ? t("planChangePayDifference") : t("planChangePayInvoice"),
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
      toast.info(t("createSubscriptionLinkReady"), {
        duration: 20000,
        ...(validUrl
          ? {
              action: {
                label: isAuthorize ? t("authorizeSubscription") : t("planChangePayInvoice"),
                onClick: () => { window.open(validUrl, "_blank", "noopener,noreferrer"); },
              },
            }
          : {}),
      });
      loadSubscription();
      loadPayments();
    } catch (err: unknown) {
      const code = getBackendErrorCode(err);
      // Backend sem a rota (404 sem código): o botão some nesta tela.
      if (errorStatus(err) === 404 && !code) {
        setLinkRouteMissing(true);
        toast.error(t("createSubscriptionLinkError"));
        return;
      }
      const key = PLAN_CHANGE_ERROR_KEYS[code];
      toast.error(key ? t(key) : t("createSubscriptionLinkError"));
      // A assinatura mudou no gateway desde a leitura: relê para a tela mostrar o estado real.
      if (code === "ERR_SUBSCRIPTION_ALREADY_ACTIVE" || code === "ERR_SUBSCRIPTION_PAUSED") {
        loadSubscription();
        loadPayments();
      }
    } finally {
      setCreatingLink(false);
    }
  };

  const canConfirm = quoteState.status === "ready" || quoteState.status === "legacy";

  const handleConfirmChange = async () => {
    if (!confirmPlan || !canConfirm) return;
    const plan = confirmPlan;
    // Manda o valor/modo mostrados: se mudaram no servidor, ele recusa (409) sem trocar.
    const quote = quoteState.status === "ready" ? quoteState.quote : null;
    setChanging(true);
    try {
      const { data } = await changePlanV2(plan.id, quote);
      toast.success(t("planChangeSuccess"));
      notifyCharge(data?.charge);
      closeConfirm();
      loadSubscription();
      loadPayments();
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

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <EmptyState icon={CreditCard} title={t("emptyTitle")} description={t("emptyDesc")} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={pageHelp} />

      {/* Volta do gateway: a releitura do pagamento ainda está em andamento. */}
      {gatewayReturnChecking && (
        <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
          <span>{t("gatewayReturnChecking")}</span>
        </div>
      )}

      {/* Plano e assinatura */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{t("planTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("planDesc")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Só assinatura ATIVA: cancelada/expirada no gateway não ganha o selo. */}
              {subscriptionStatus === "ACTIVE" && !subscriptionPaused && <Badge variant="success">{t("planActiveSub")}</Badge>}
              {/* Mercado Pago: assinatura criada que o cliente ainda não autorizou. */}
              {subscriptionStatus === "INACTIVE" && authorizeLink && (
                <Badge variant="warning-soft">{t("subscriptionAwaitingAuthorization")}</Badge>
              )}
              {subscriptionPaused && (
                <Badge variant="warning-soft" className="gap-1">
                  <PauseCircle className="h-3 w-3" />
                  {t("subscriptionPausedBadge")}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{t("gatewayLabel")}</span>
              <Badge variant="secondary">{gatewayLabel}</Badge>
            </div>
          </div>

          {/* Mercado Pago/Pagar.me: autorizar a assinatura ou gerar a cobrança de novo.
              Backend antigo não manda os campos e o bloco não aparece. */}
          {!plansLoading && showGatewayBlock && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2">
                <p className="text-xs leading-snug text-muted-foreground">
                  {subscriptionPaused
                    ? t("subscriptionPausedHint")
                    : authorizeLink
                    ? t("authorizeSubscriptionHint")
                    : t("createSubscriptionLinkHint", { gateway: gatewayLabel })}
                </p>
                <GatewayBillingTip text={t("gatewayBillingHowItWorks", { gateway: gatewayLabel })} />
              </div>
              {authorizeLink ? (
                <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
                  <a href={authorizeLink} target="_blank" rel="noopener noreferrer">
                    <CreditCard className="h-4 w-4" />
                    {t("authorizeSubscription")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              ) : showRecreate ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full shrink-0 sm:w-auto"
                  onClick={handleCreateLink}
                  disabled={creatingLink || changing}
                >
                  {creatingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  {gateway === "pagarme" ? t("createSubscriptionBoleto") : t("createSubscriptionLink")}
                </Button>
              ) : null}
            </div>
          )}

          {plansLoading ? (
            <Skeleton className="h-[140px]" />
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("planEmpty")}</p>
          ) : (
            <TooltipProvider delayDuration={150}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {plans.map((p) => {
                  const isCurrent = currentPlanId != null && p.id === currentPlanId;
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-lg border p-3 flex flex-col gap-2",
                        isCurrent && "border-primary bg-primary/5"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{p.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isCurrent && <Badge variant="info-soft">{t("planCurrent")}</Badge>}
                          {trialAvailable && isTrialPlan(p) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="inline-flex" aria-label={t("planTrialGatewayNote")}>
                                  <Badge variant="warning" className="gap-1">
                                    {t("planTrial")}
                                    <Info className="h-3 w-3" />
                                  </Badge>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[240px] text-xs leading-snug">
                                {t("planTrialGatewayNote")}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      <span className="text-lg font-semibold">{planValueLabel(p)}</span>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Plug className="h-3 w-3" /> {p.connections} {t("planConnections")}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {p.users} {t("planUsers")}
                        </span>
                      </div>
                      {isAdmin && !isCurrent && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1 w-full"
                          onClick={() => openConfirm(p)}
                        >
                          {t("planSelectBtn")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* Histórico de pagamentos */}
      {loading ? (
        <Skeleton className="h-[400px]" />
      ) : paymentsError ? (
        <EmptyState icon={AlertTriangle} title={t("paymentsLoadError")}>
          <Button size="sm" variant="outline" onClick={loadPayments}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("paymentsRetry")}
          </Button>
        </EmptyState>
      ) : payments.length === 0 ? (
        <EmptyState icon={CreditCard} title={t("emptyTitle")} description={t("emptyDesc")} />
      ) : (
        <Card>
          <div className="flex items-center gap-2 px-4 pt-4">
            <span className="text-sm text-muted-foreground">{t("gatewayLabel")}</span>
            <Badge variant="secondary">{gatewayLabel}</Badge>
          </div>
          <CardContent className="p-0 overflow-x-auto mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colId")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colDueDate")}</TableHead>
                  <TableHead>{t("colValue")}</TableHead>
                  <TableHead>{t("colLink")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const statusKey = String(p.status ?? "").toLowerCase();
                  // Fatura de R$ 0 (teste grátis) não é pagamento: rótulo próprio, sem "Pago".
                  const freeTrial = isZeroValuePayment(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id}</TableCell>
                      <TableCell>
                        {freeTrial ? (
                          <Badge variant="secondary">{t("paymentFreeTrial")}</Badge>
                        ) : (
                          <Badge variant={STATUS_VARIANT[statusKey] ?? "secondary"}>
                            {STATUS_LABEL_KEYS[statusKey] ? t(STATUS_LABEL_KEYS[statusKey]) : p.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{fmt(p.dueDate)}</TableCell>
                      <TableCell>{fmtVal(p.value)}</TableCell>
                      <TableCell>
                        {p.paymentUrl && isValidHttpUrl(p.paymentUrl) ? (
                          <a href={p.paymentUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline text-sm">
                            {t("paymentLink")} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Confirmação de troca de plano */}
      <Dialog open={!!confirmPlan} onOpenChange={(o) => { if (!o && !changing) closeConfirm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("planConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {confirmPlan && t("planConfirmDesc", {
                plan: confirmPlan.name,
                value: planValueLabel(confirmPlan),
                gateway: gatewayLabel,
              })}
            </DialogDescription>
          </DialogHeader>

          {/* O que a troca cobra, calculado pelo servidor antes de confirmar */}
          {confirmPlan && quoteState.status !== "idle" && quoteState.status !== "legacy" && (
            <div className="space-y-2">
              {quoteState.status === "ready" && quoteState.changed && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                  <span>
                    {t("planQuoteChanged", {
                      amount: formatCurrencyBRL(quoteDisplayAmount(quoteState.quote, confirmPlan)),
                    })}
                  </span>
                </div>
              )}
              {quoteState.status === "loading" ? (
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("planQuoteLoading")}
                </p>
              ) : quoteState.status === "error" ? (
                <p className="text-sm text-destructive">{quoteState.message}</p>
              ) : quoteState.status === "ready" ? (
                <p className="text-sm font-medium">{quoteText(quoteState.quote, confirmPlan)}</p>
              ) : null}
              {quoteState.status === "ready" &&
                !["unsupported", "new_subscription"].includes(quoteState.quote.mode) && (
                  <p className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{t("planChangeRulesNote")}</span>
                  </p>
                )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeConfirm} disabled={changing}>
              {t("planCancelBtn")}
            </Button>
            {quoteState.status === "error" ? (
              <Button variant="outline" onClick={() => confirmPlan && loadQuote(confirmPlan)} disabled={changing}>
                <RefreshCw className="h-4 w-4" />
                {t("planQuoteRetry")}
              </Button>
            ) : (
              <Button onClick={handleConfirmChange} disabled={changing || !canConfirm}>
                {changing && <Loader2 className="h-4 w-4 animate-spin" />}
                {!changing && <Check className="h-4 w-4" />}
                {t("planConfirmBtn")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
