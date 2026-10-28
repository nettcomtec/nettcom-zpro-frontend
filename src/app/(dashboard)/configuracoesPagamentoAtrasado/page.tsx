"use client";

import { formatDate as formatDateIntl } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CreditCard, ExternalLink, RefreshCw, Link2, Loader2, PauseCircle, HelpCircle } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import {
  createSubscriptionAuthorizationLink,
  fetchPaymentsV2,
  fetchSubscriptionV2,
  refreshPaymentStatusV2,
} from "@/services/tenants";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { isValidHttpUrl } from "@/lib/utils";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

// Shape normalizado de /tenantsPaymentsV2 (qualquer gateway: asaas/stripe/
// pagarme/mercadopago) — a rota está na allowlist do 402, então funciona
// mesmo com o tenant bloqueado (fetchTenantById/fetchTenantByAsaas não estão).
interface NormalizedPayment {
  id: string;
  status: string;
  dueDate?: string;
  value?: number;
  paymentUrl?: string;
  gateway: string;
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  paid: "statusPaid",
  pending: "statusPending",
  overdue: "statusOverdue",
  confirmed: "statusConfirmed",
  received: "statusReceived",
  received_in_cash: "statusReceived",
  dunning_received: "statusReceived",
  refunded: "statusRefunded",
  cancelled: "statusCancelled",
  // Mercado Pago/Pagar.me (D8): recusada, paga a menos, estornada, assinatura cancelada.
  failed: "statusFailed",
  underpaid: "statusUnderpaid",
  chargeback: "statusChargeback",
  subscription_canceled: "statusSubscriptionCanceled",
};

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  paid: "success",
  received: "success",
  received_in_cash: "success",
  dunning_received: "success",
  confirmed: "success",
  overdue: "destructive",
  pending: "warning",
  refunded: "secondary",
  cancelled: "secondary",
  failed: "destructive",
  underpaid: "destructive",
  chargeback: "destructive",
  subscription_canceled: "destructive",
};

/** Gateways com assinatura que o cliente autoriza (MP) ou paga por boleto (Pagar.me) e pode ser gerada de novo. */
const RECREATE_GATEWAYS = new Set(["mercadopago", "pagarme"]);

// Códigos da rota de gerar o link → chaves de configPagamentosPage (as mesmas da tela de Pagamentos).
const SUBSCRIPTION_LINK_ERROR_KEYS: Record<string, string> = {
  ERR_NO_PERMISSION_PLAN_CHANGE: "errPlanChangePermission",
  ERR_PLAN_CHANGE_IN_PROGRESS: "errPlanChangeInProgress",
  ERR_PLAN_CHANGE_GATEWAY_REJECTED: "errPlanChangeGatewayRejected",
  ERR_PLAN_CHANGE_GATEWAY_UNAVAILABLE: "errPlanChangeGatewayUnavailable",
  ERR_PLAN_CHANGE_GATEWAY_DATA: "errPlanChangeGatewayData",
  ERR_PAYMENT_RETURN_URL_MISSING: "errPaymentReturnUrlMissing",
  ERR_SUBSCRIPTION_ALREADY_ACTIVE: "errSubscriptionAlreadyActive",
  ERR_SUBSCRIPTION_PAUSED: "errSubscriptionPaused",
  ERR_PLAN_BELOW_GATEWAY_MINIMUM: "errPlanBelowGatewayMinimum",
  ERR_GATEWAY_NOT_SUPPORTED: "errGatewayNotSupported",
};

const GATEWAY_LABEL: Record<string, string> = {
  asaas: "Asaas",
  stripe: "Stripe",
  pagarme: "Pagar.me",
  mercadopago: "Mercado Pago",
};

// Marca deixada pela tela de Pagamentos na volta do gateway (`?gatewayReturn=1`): a empresa
// bloqueada chega aqui SEM o parâmetro. Mesmo nome em configuracoes/pagamentos/page.tsx;
// vale 5 minutos.
const GATEWAY_RETURN_MARK_KEY = "zproGatewayReturnAt";
const GATEWAY_RETURN_MARK_TTL_MS = 5 * 60 * 1000;

// Conferência automática da empresa do Mercado Pago (volta do cadastro pela tela de login).
const MP_AUTO_CHECK_KEY = "zproMpAutoCheckAt";
const MP_AUTO_CHECK_TTL_MS = 10 * 60 * 1000;

/** Volta do gateway: o parâmetro na URL ou a marca recente. Consome a marca. */
function consumeGatewayReturn(): boolean {
  if (typeof window === "undefined") return false;
  let fromUrl = false;
  try {
    fromUrl = new URLSearchParams(window.location.search).get("gatewayReturn") === "1";
  } catch {
    fromUrl = false;
  }
  let fromMark = false;
  try {
    const at = Number(window.sessionStorage.getItem(GATEWAY_RETURN_MARK_KEY));
    fromMark = Number.isFinite(at) && at > 0 && Date.now() - at >= 0 && Date.now() - at < GATEWAY_RETURN_MARK_TTL_MS;
    window.sessionStorage.removeItem(GATEWAY_RETURN_MARK_KEY);
  } catch {
    fromMark = false;
  }
  return fromUrl || fromMark;
}

function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
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

const PAID_STATUSES = new Set([
  "RECEIVED", "RECEIVED_IN_CASH", "CONFIRMED", "DUNNING_RECEIVED",
  "PAID", "OVERPAID", "APPROVED", "PAID_OUT",
]);

const CANCELED_STATUSES = new Set([
  "CANCELED", "CANCELLED", "REFUNDED", "CHARGED_BACK",
  "VOIDED", "UNCOLLECTIBLE", "DELETED",
]);

export default function ConfiguracoesPagamentoAtrasadoPage() {
  const t = useTranslations("configPagamentoAtrasadoPage");
  const allowed = usePageAccess("configuracoes", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const router = useRouter();
  const { user, setBillingState, setPaymentOverdue, setBillingDaysInfo } = useAuthStore();
  // Textos da assinatura no gateway: os mesmos da tela de Pagamentos.
  const tp = useTranslations("configPagamentosPage");
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [pagamentos, setPagamentos] = useState<NormalizedPayment[]>([]);
  // Mercado Pago/Pagar.me (PLANO_COBRANCA_MERCADOPAGO_PAGARME §5.8): autorizar a
  // assinatura ou gerar a cobrança de novo daqui mesmo. Backend antigo não manda os campos.
  const [gateway, setGateway] = useState("");
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [canRecreate, setCanRecreate] = useState(false);
  const [subscriptionPaused, setSubscriptionPaused] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  // Rota de gerar o link inexistente (backend antigo, 404 sem código): o botão some.
  const [linkRouteMissing, setLinkRouteMissing] = useState(false);
  const [gatewayReturnChecking, setGatewayReturnChecking] = useState(false);
  const gatewayReturnHandledRef = useRef(false);
  // Já houve uma conferência automática nesta abertura (volta do gateway ou a do Mercado Pago).
  const autoRevalidatedRef = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Gateway-agnóstico: pagamentos normalizados do gateway efetivo do tenant.
      const res = await fetchPaymentsV2();
      const all: NormalizedPayment[] =
        (res.data as { payments?: NormalizedPayment[] })?.payments ?? [];
      const pending = all.filter(p => {
        const s = (p.status ?? "").toUpperCase();
        return !PAID_STATUSES.has(s) && !CANCELED_STATUSES.has(s);
      });
      setPagamentos(pending);
      const gw = String((res.data as { gateway?: unknown })?.gateway ?? "");
      setGateway(gw);
      // A assinatura só é lida para Mercado Pago/Pagar.me: os outros gateways não pagam
      // consulta nenhuma a mais.
      if (RECREATE_GATEWAYS.has(gw)) {
        try {
          const { data } = await fetchSubscriptionV2();
          const d = (data && typeof data === "object" ? data : {}) as {
            subscription?: { authorizeUrl?: unknown } | null;
            canRecreate?: unknown;
            subscriptionPaused?: unknown;
          };
          const url = d.subscription?.authorizeUrl;
          setAuthorizeUrl(typeof url === "string" && isValidHttpUrl(url) ? url.trim() : null);
          setCanRecreate(d.canRecreate === true);
          setSubscriptionPaused(d.subscriptionPaused === true);
        } catch {
          setAuthorizeUrl(null);
          setCanRecreate(false);
          setSubscriptionPaused(false);
        }
      } else {
        setAuthorizeUrl(null);
        setCanRecreate(false);
        setSubscriptionPaused(false);
      }
    } catch {
      // sem dados
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Força o backend a reconsultar o gateway e recomputar o paymentStatus agora.
  // Se o backend liberar (status != blocked), limpa o estado de bloqueio do front
  // e volta pro sistema; senão mantém a tela e recarrega a lista de pendências.
  // `auto` = conferência da volta do gateway: sem aviso quando segue bloqueada.
  const handleRevalidate = useCallback(async (opts?: { auto?: boolean }) => {
    const auto = opts?.auto === true;
    setRevalidating(true);
    try {
      const res = await refreshPaymentStatusV2();
      const status = (res.data as { paymentStatus?: string })?.paymentStatus;
      if (status && status !== "blocked") {
        setBillingState(status === "active" ? "ok" : "overdue_warning");
        setPaymentOverdue(false);
        setBillingDaysInfo({});
        toast.success(t("refreshSuccess"));
        router.replace("/home");
      } else {
        if (!auto) toast.warning(t("refreshStillBlocked"));
        await load();
      }
    } catch {
      if (!auto) toast.error(t("refreshError"));
    } finally {
      setRevalidating(false);
    }
  }, [t, router, load, setBillingState, setPaymentOverdue, setBillingDaysInfo]);

  // Volta do gateway (`?gatewayReturn=1` ou a marca da tela de Pagamentos, D17/M2): o
  // aviso de assinatura do Mercado Pago pode nunca chegar, então confere uma vez ao abrir.
  useEffect(() => {
    if (gatewayReturnHandledRef.current || !user) return;
    gatewayReturnHandledRef.current = true;
    if (!consumeGatewayReturn()) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("gatewayReturn")) {
        params.delete("gatewayReturn");
        const qs = params.toString();
        router.replace(qs ? `/configuracoesPagamentoAtrasado?${qs}` : "/configuracoesPagamentoAtrasado", { scroll: false });
      }
    } catch { /* parâmetro fica na URL: só repetiria a conferência */ }
    autoRevalidatedRef.current = true;
    setGatewayReturnChecking(true);
    void handleRevalidate({ auto: true }).finally(() => setGatewayReturnChecking(false));
  }, [user, router, handleRevalidate]);

  // Mercado Pago: quem autoriza no cadastro volta pela tela de login, sem parâmetro nem marca,
  // e o aviso de assinatura pode nunca chegar (M2). Confere uma vez ao abrir, no máximo a
  // cada 10 minutos por aba, para a empresa que já autorizou não esperar o job de 6 h.
  useEffect(() => {
    if (autoRevalidatedRef.current || gateway !== "mercadopago") return;
    autoRevalidatedRef.current = true;
    try {
      const last = Number(window.sessionStorage.getItem(MP_AUTO_CHECK_KEY));
      if (Number.isFinite(last) && last > 0 && Date.now() - last >= 0 && Date.now() - last < MP_AUTO_CHECK_TTL_MS) return;
      window.sessionStorage.setItem(MP_AUTO_CHECK_KEY, String(Date.now()));
    } catch {
      /* sem sessionStorage: confere uma vez nesta abertura */
    }
    setGatewayReturnChecking(true);
    void handleRevalidate({ auto: true }).finally(() => setGatewayReturnChecking(false));
  }, [gateway, handleRevalidate]);

  const canManageSubscription = user?.profile === "admin" || user?.profile === "superadmin";
  const recreateGateway = RECREATE_GATEWAYS.has(gateway);
  const gatewayLabel = GATEWAY_LABEL[gateway] ?? gateway;
  const authorizeLink = recreateGateway ? authorizeUrl : null;
  const showRecreate =
    recreateGateway && canManageSubscription && canRecreate && !subscriptionPaused && !authorizeLink && !linkRouteMissing;
  const showGatewayBlock = recreateGateway && (!!authorizeLink || showRecreate || subscriptionPaused);

  /**
   * "Gerar link da assinatura" (Mercado Pago) / "Gerar boleto da assinatura" (Pagar.me):
   * a rota é liberada para a empresa bloqueada e mantém o vencimento da dívida mais antiga
   * (nunca dá prazo novo). O link abre em nova aba; se o navegador barrar, o aviso traz o atalho.
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
      toast.info(tp("createSubscriptionLinkReady"), {
        duration: 20000,
        ...(validUrl
          ? {
              action: {
                label: isAuthorize ? tp("authorizeSubscription") : tp("planChangePayInvoice"),
                onClick: () => { window.open(validUrl, "_blank", "noopener,noreferrer"); },
              },
            }
          : {}),
      });
      await load();
    } catch (err: unknown) {
      const code = getBackendErrorCode(err);
      if (errorStatus(err) === 404 && !code) {
        setLinkRouteMissing(true);
        toast.error(tp("createSubscriptionLinkError"));
        return;
      }
      const key = SUBSCRIPTION_LINK_ERROR_KEYS[code];
      toast.error(key ? tp(key) : tp("createSubscriptionLinkError"));
      if (code === "ERR_SUBSCRIPTION_ALREADY_ACTIVE" || code === "ERR_SUBSCRIPTION_PAUSED") await load();
    } finally {
      setCreatingLink(false);
    }
  };

  const formatDate = (d?: string) =>
    d ? formatDateIntl(new Date(d)) : "—";

  const formatValue = (v?: number) =>
    v != null ? `R$ ${v.toFixed(2)}` : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />

      {/* Volta do gateway: a conferência do pagamento ainda está em andamento. */}
      {gatewayReturnChecking && (
        <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
          <span>{tp("gatewayReturnChecking")}</span>
        </div>
      )}

      {/* Mercado Pago/Pagar.me: autorizar a assinatura ou gerar a cobrança de novo.
          Backend antigo não manda os campos e o bloco não aparece. */}
      {showGatewayBlock && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              {subscriptionPaused && (
                <Badge variant="warning-soft" className="w-fit gap-1">
                  <PauseCircle className="h-3 w-3" />
                  {tp("subscriptionPausedBadge")}
                </Badge>
              )}
              <div className="flex items-start gap-2">
                <p className="text-sm text-muted-foreground">
                  {subscriptionPaused
                    ? tp("subscriptionPausedHint")
                    : authorizeLink
                    ? tp("authorizeSubscriptionHint")
                    : tp("createSubscriptionLinkHint", { gateway: gatewayLabel })}
                </p>
                <GatewayBillingTip text={tp("gatewayBillingHowItWorks", { gateway: gatewayLabel })} />
              </div>
            </div>
            {authorizeLink ? (
              <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
                <a href={authorizeLink} target="_blank" rel="noopener noreferrer">
                  <CreditCard className="h-4 w-4 mr-2" />
                  {tp("authorizeSubscription")}
                  <ExternalLink className="h-3 w-3 ml-2" />
                </a>
              </Button>
            ) : showRecreate ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full shrink-0 sm:w-auto"
                onClick={handleCreateLink}
                disabled={creatingLink || revalidating}
              >
                {creatingLink ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                {gateway === "pagarme" ? tp("createSubscriptionBoleto") : tp("createSubscriptionLink")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => { void handleRevalidate(); }}
          disabled={revalidating || loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${revalidating ? "animate-spin" : ""}`} />
          {revalidating ? t("refreshing") : t("refreshButton")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-[400px]" />
        </div>
      ) : pagamentos.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t("noPayments")}
          description={t("noPaymentsDesc")}
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
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
                {pagamentos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status?.toLowerCase()] ?? "secondary"}>
                        {STATUS_LABEL_KEYS[p.status?.toLowerCase()] ? t(STATUS_LABEL_KEYS[p.status.toLowerCase()] as any) : p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(p.dueDate)}</TableCell>
                    <TableCell>{formatValue(p.value)}</TableCell>
                    <TableCell>
                      {p.paymentUrl ? (
                        <a
                          href={p.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline text-sm"
                        >
                          {t("paymentLink")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
