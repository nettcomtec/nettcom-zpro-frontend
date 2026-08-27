"use client";

import { formatDate as formatDateIntl } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
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
import { CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { fetchPaymentsV2, refreshPaymentStatusV2 } from "@/services/tenants";
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
};

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
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [pagamentos, setPagamentos] = useState<NormalizedPayment[]>([]);

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
  const handleRevalidate = useCallback(async () => {
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
        toast.warning(t("refreshStillBlocked"));
        await load();
      }
    } catch {
      toast.error(t("refreshError"));
    } finally {
      setRevalidating(false);
    }
  }, [t, router, load, setBillingState, setPaymentOverdue, setBillingDaysInfo]);

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

      <div className="flex justify-end">
        <Button
          onClick={handleRevalidate}
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
