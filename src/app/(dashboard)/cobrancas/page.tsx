"use client";

// Cobranças (template ORDER_DETAILS) — visão consolidada do tenant.
//
// Dentro do ticket a cobrança só responde "esta conversa pagou?". Esta página
// responde "quanto tenho a receber?": lista tudo que foi enviado, soma o que
// está pendente e o que já entrou, e concentra a baixa manual.
//
// Não existe webhook de pagamento no Brasil: a cobrança só sai de `pending` por
// ação humana (baixa manual) ou pelo job de expiração — daí a nota fixa no topo.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Receipt, RefreshCw, Search, CheckCircle2, XCircle, Clock,
  ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { toast } from "sonner";
import api, { BACKGROUND_REQUEST } from "@/lib/api";
import {
  markPaymentAsPaid, cancelPayment,
  type WhatsappPayment, type WhatsappPaymentStatus,
} from "@/services/whatsapp-payments";
import { formatCentsBRL } from "@/lib/order-details";
import { formatDateTime } from "@/lib/format";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

const PAGE_SIZE = 20;
// Teto do endpoint (`MAX_LIMIT` no controller). Os cards somam o que couber
// nesse recorte e avisam quando há mais — melhor um total honesto e barato do
// que varrer a tabela inteira a cada abertura da tela.
const TOTALS_LIMIT = 100;

// A listagem devolve o canal junto (include `whatsapp`), campo que o tipo do
// service ainda não declara — extensão local até ele acompanhar.
type PaymentRow = WhatsappPayment & {
  whatsapp?: { id: number; name?: string | null; type?: string | null } | null;
};

interface ListResponse {
  payments?: PaymentRow[];
  data?: PaymentRow[];
  count?: number;
  hasMore?: boolean;
}

interface PaymentsPage {
  rows: PaymentRow[];
  count: number;
  hasMore: boolean;
}

/**
 * Leitura paginada da listagem.
 *
 * O `listWhatsappPayments` do service ainda não repassa `page`/`limit`/
 * `referenceId` e descarta o `count` do envelope — sem esses três não há
 * paginação nem total confiável. Quando o service expuser o contrato completo,
 * trocar esta função por ele (as mutações já vêm de lá).
 *
 * BACKGROUND_REQUEST: chamada de tela (mount), então um 402 de plano não deve
 * virar toast — o usuário não pediu nada.
 */
async function fetchPaymentsPage(params: Record<string, string>): Promise<PaymentsPage> {
  const res = await api.get<ListResponse | PaymentRow[]>("/whatsapp-payments", {
    params,
    ...BACKGROUND_REQUEST,
  });
  const body = res?.data;
  if (Array.isArray(body)) return { rows: body, count: body.length, hasMore: false };
  const rows = body?.payments || body?.data || [];
  return { rows, count: Number(body?.count ?? rows.length), hasMore: !!body?.hasMore };
}

/**
 * 402 (fora do plano) e 404 (backend antigo, sem a rota) não são falha de
 * operação: a tela mostra vazio em silêncio em vez de assustar com um toast.
 */
function isSilentError(err: unknown): boolean {
  const status = Number(
    (err as { status?: number })?.status ||
    (err as { response?: { status?: number } })?.response?.status ||
    0
  );
  return status === 402 || status === 404;
}

function errorCodeOf(err: unknown): string {
  return String(
    (err as { data?: { error?: string } })?.data?.error ||
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
    ""
  );
}

const STATUS_FILTERS: WhatsappPaymentStatus[] = [
  "pending", "paid", "canceled", "expired", "failed",
];

const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "statusPending",
  paid: "statusPaid",
  canceled: "statusCanceled",
  expired: "statusExpired",
  failed: "statusFailed",
};

const STATUS_VARIANTS: Record<string, "success-soft" | "warning-soft" | "destructive-soft" | "secondary" | "outline"> = {
  creating: "secondary",
  pending: "warning-soft",
  paid: "success-soft",
  canceled: "outline",
  expired: "secondary",
  failed: "destructive-soft",
};

const PAYMENT_KIND_KEYS: Record<string, string> = {
  pix: "paymentPix",
  link: "paymentLink",
  boleto: "paymentBoleto",
  card: "paymentCard",
};

// Recusas de transição (409) têm texto próprio; o resto mostra o código para o
// suporte em vez de sumir num "erro" genérico. Mesmo mapa da ficha no ticket.
const SETTLE_ERROR_KEYS: Record<string, string> = {
  ERR_PAYMENT_INVALID_TRANSITION: "errorInvalidTransition",
  ERR_ORDER_STATUS_INVALID_TRANSITION: "errorInvalidTransition",
  ERR_ORDER_PAYMENT_ALREADY_PAID: "errorInvalidTransition",
  ERR_ORDER_PAYMENT_CANCELED: "errorInvalidTransition",
  ERR_ORDER_PAYMENT_NOT_SENT: "errorInvalidTransition",
};

export default function CobrancasPage() {
  const t = useTranslations("cobrancasPage");
  const tOrder = useTranslations("orderDetails");
  const tCommon = useTranslations("common");
  const allowed = usePageAccess("cobrancas", { adminSuperOnly: true });

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filtros: `reference` é o que está digitado, `appliedReference` é o que já
  // foi para o backend (busca exata por Nº da cobrança, então só no Enter/botão).
  const [status, setStatus] = useState<"all" | WhatsappPaymentStatus>("all");
  const [reference, setReference] = useState("");
  const [appliedReference, setAppliedReference] = useState("");

  const [totals, setTotals] = useState({
    pendingAmount: 0,
    pendingCount: 0,
    paidAmount: 0,
    paidCount: 0,
    partial: false,
  });

  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<{ payment: PaymentRow; kind: "paid" | "cancel" } | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const result = await fetchPaymentsPage({
        page: String(targetPage),
        limit: String(PAGE_SIZE),
        ...(status !== "all" ? { status } : {}),
        ...(appliedReference ? { referenceId: appliedReference } : {}),
      });
      setRows(result.rows);
      setCount(result.count);
    } catch (err) {
      setRows([]);
      setCount(0);
      if (!isSilentError(err)) toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [status, appliedReference, t]);

  // Os cards ignoram os filtros de propósito: "quanto tenho a receber" é do
  // negócio inteiro, não do recorte que está na tela.
  const loadTotals = useCallback(async () => {
    try {
      const [pending, paid] = await Promise.all([
        fetchPaymentsPage({ status: "pending", limit: String(TOTALS_LIMIT) }),
        fetchPaymentsPage({ status: "paid", limit: String(TOTALS_LIMIT) }),
      ]);
      const sum = (list: PaymentRow[]) =>
        list.reduce((acc, p) => acc + Number(p.totalAmount || 0), 0);
      setTotals({
        pendingAmount: sum(pending.rows),
        pendingCount: pending.count,
        paidAmount: sum(paid.rows),
        paidCount: paid.count,
        partial: pending.hasMore || paid.hasMore,
      });
    } catch {
      // Silencioso: a tabela continua valendo mesmo sem os cards.
    }
  }, []);

  // `load` muda de identidade quando um filtro muda — o efeito volta para a
  // primeira página junto, que é o comportamento esperado ao filtrar.
  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

  const applySearch = () => {
    setAppliedReference(reference.trim());
  };

  const refreshAll = () => {
    load(page);
    loadTotals();
  };

  const handlePageChange = (next: number) => {
    setPage(next);
    load(next);
  };

  const runSettle = async () => {
    if (!confirming) return;
    const { payment, kind } = confirming;
    setBusyId(payment.id);
    try {
      const updated = kind === "paid"
        ? await markPaymentAsPaid(payment.id)
        : await cancelPayment(payment.id);
      if (updated) {
        setRows((prev) => prev.map((r) => (r.id === payment.id ? { ...r, ...updated } : r)));
      }
      toast.success(kind === "paid" ? tOrder("markedAsPaid") : tOrder("chargeCanceled"));
      loadTotals();
      // Com filtro de situação ativo a linha atualizada deixa de pertencer ao
      // recorte — recarrega para a lista não mentir.
      if (status !== "all") load(page);
    } catch (err) {
      // O interceptor do api.ts rejeita com a RESPOSTA, então o código chega em
      // `data.error`. 403 ERR_NO_PERMISSION já dispara o aviso global.
      const httpStatus = (err as { status?: number })?.status;
      const code = errorCodeOf(err);
      if (httpStatus === 403 && code === "ERR_NO_PERMISSION") return;
      const mapped = SETTLE_ERROR_KEYS[code];
      if (mapped) toast.error(tOrder(mapped));
      else toast.error(code ? `${tOrder("errorSettleFailed")}: ${code}` : tOrder("errorSettleFailed"));
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  const statusLabel = (value: string) => {
    const key = STATUS_LABEL_KEYS[value];
    return key ? tOrder(key) : t("statusCreating");
  };

  const paymentKindLabel = (value?: string | null) => {
    const key = value ? PAYMENT_KIND_KEYS[value] : null;
    return key ? tOrder(key) : "—";
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasFilters = status !== "all" || !!appliedReference;
  const currency = useMemo(() => rows.find((r) => r.currency)?.currency || "BRL", [rows]);

  if (!allowed) return <AccessDenied />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          ],
        }}
      >
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("refresh")}
        </Button>
      </PageHeader>

      {/* Totais — o motivo de a tela existir */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-full bg-warning/15 p-2.5 shrink-0">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("totalPending")}</p>
              <p className="text-xl font-bold tabular-nums truncate">
                {formatCentsBRL(totals.pendingAmount, currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pendingCount", { count: totals.pendingCount })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-full bg-success/15 p-2.5 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("totalPaid")}</p>
              <p className="text-xl font-bold tabular-nums truncate">
                {formatCentsBRL(totals.paidAmount, currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("paidCount", { count: totals.paidCount })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-px" />
        <p>
          {tOrder("noteManualSettlement")}
          {totals.partial && <span className="block mt-1">{t("totalsPartial")}</span>}
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("filterStatus")}</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as "all" | WhatsappPaymentStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("filterAll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")}</SelectItem>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cob-ref">{tOrder("chargeNumber")}</Label>
              <Input
                id="cob-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                placeholder={t("searchPlaceholder")}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={applySearch} className="flex-1 sm:flex-none">
                <Search className="mr-2 h-4 w-4" />
                {t("search")}
              </Button>
              {hasFilters && (
                <Button
                  variant="ghost"
                  onClick={() => { setStatus("all"); setReference(""); setAppliedReference(""); }}
                >
                  {t("clearFilters")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasFilters ? t("emptyFilteredTitle") : t("emptyTitle")}
          description={hasFilters ? t("emptyFilteredDescription") : t("emptyDescription")}
        />
      ) : (
        <Card>
          {/* Tabela larga rola dentro do card; a página nunca rola na horizontal */}
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{tOrder("chargeNumber")}</TableHead>
                  <TableHead>{t("colContact")}</TableHead>
                  <TableHead>{t("colChannel")}</TableHead>
                  <TableHead className="text-right">{tOrder("total")}</TableHead>
                  <TableHead>{tOrder("paymentLabel")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colDate")}</TableHead>
                  <TableHead className="text-right">{tCommon("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const isPending = p.status === "pending";
                  const busy = busyId === p.id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.referenceId}</TableCell>
                      <TableCell>
                        <span className="block font-medium truncate max-w-[180px]">
                          {p.contact?.name || "—"}
                        </span>
                        {(p.contact?.number || p.sentTo) && (
                          <span className="block text-xs text-muted-foreground font-mono">
                            {p.contact?.number || p.sentTo}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.whatsapp?.name || (p.whatsappId ? `#${p.whatsappId}` : "—")}
                      </TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">
                        {formatCentsBRL(p.totalAmount, p.currency || "BRL")}
                      </TableCell>
                      <TableCell className="text-sm">{paymentKindLabel(p.paymentKind)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[p.status] || "secondary"}>
                          {statusLabel(p.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {p.createdAt ? formatDateTime(p.createdAt) : "—"}
                        {p.status === "paid" && p.paidAt && (
                          <span className="block text-xs">
                            {t("paidAtLabel", { date: formatDateTime(p.paidAt) })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {isPending ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              title={tOrder("markAsPaid")}
                              aria-label={tOrder("markAsPaid")}
                              onClick={() => setConfirming({ payment: p, kind: "paid" })}
                            >
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              title={tOrder("cancelCharge")}
                              aria-label={tOrder("cancelCharge")}
                              onClick={() => setConfirming({ payment: p, kind: "cancel" })}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Paginação */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {count} {count !== 1 ? t("records") : t("record")}
                {totalPages > 1 && ` — ${t("page")} ${page} ${t("of")} ${totalPages}`}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  title={t("prevPage")}
                  aria-label={t("prevPage")}
                  onClick={() => handlePageChange(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  title={t("nextPage")}
                  aria-label={t("nextPage")}
                  onClick={() => handlePageChange(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmação da baixa / cancelamento */}
      <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.kind === "cancel" ? tOrder("confirmCancelTitle") : tOrder("confirmPaidTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.kind === "cancel"
                ? tOrder("confirmCancelDescription")
                : tOrder("confirmPaidDescription")}
              {confirming && (
                <span className="mt-2 block font-medium text-foreground">
                  {tOrder("chargeNumber")}: {confirming.payment.referenceId} —{" "}
                  {formatCentsBRL(confirming.payment.totalAmount, confirming.payment.currency || "BRL")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: confirming?.kind === "cancel" ? "destructive" : "default" })}
              onClick={runSettle}
            >
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
