"use client";

import { formatDate } from "@/lib/format";
import React, { useState, useEffect, useCallback } from "react";
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
import { CreditCard, ExternalLink, Check, Users, Plug, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { fetchPaymentsV2, fetchSubscriptionV2, changePlanV2 } from "@/services/tenants";

interface Payment {
  id: string;
  status: string;
  dueDate?: string;
  value?: number;
  paymentUrl?: string;
  gateway: string;
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
  overdue: "destructive", cancelled: "secondary", refunded: "secondary",
  pending: "warning", authorized: "warning",
};

const GATEWAY_LABEL: Record<string, string> = {
  asaas: "Asaas",
  stripe: "Stripe",
  pagarme: "Pagar.me",
  mercadopago: "Mercado Pago",
};

function isTrialPlan(p: Plan): boolean {
  return p.trial === true || p.trial === "enabled";
}

export default function PagamentosPage() {
  const t = useTranslations("configPagamentosPage");
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const canViewPayments = useAuthStore((s) => s.canViewPayments);
  const allowed = canViewPayments();

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [gateway, setGateway] = useState<string>("asaas");

  const [plansLoading, setPlansLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [changing, setChanging] = useState(false);

  const loadSubscription = useCallback(() => {
    setPlansLoading(true);
    fetchSubscriptionV2()
      .then(({ data }) => {
        setPlans(data?.availablePlans ?? []);
        setHasSubscription(!!data?.subscription);
        if (data?.gateway) setGateway(data.gateway);
      })
      .catch(() => { toast.error(t("planLoadError")); })
      .finally(() => setPlansLoading(false));
  }, [t]);

  useEffect(() => {
    if (!user?.tenantId || !allowed) { setLoading(false); setPlansLoading(false); return; }
    fetchPaymentsV2()
      .then(({ data }) => {
        setPayments(data?.payments ?? []);
        setGateway(data?.gateway ?? "asaas");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadSubscription();
  }, [user?.tenantId, allowed, loadSubscription]);

  const fmt = (d?: string) => d ? formatDate(new Date(d)) : "—";
  const fmtVal = (v?: number) => v != null ? `R$ ${v.toFixed(2)}` : "—";
  const gatewayLabel = GATEWAY_LABEL[gateway] ?? gateway;

  const planValueLabel = (p: Plan) => {
    const v = Number(p.value) || 0;
    return v > 0 ? `R$ ${v.toFixed(2)}${t("planPerMonth")}` : t("planFree");
  };

  const handleConfirmChange = async () => {
    if (!confirmPlan) return;
    setChanging(true);
    try {
      await changePlanV2(confirmPlan.id);
      toast.success(t("planChangeSuccess"));
      setConfirmPlan(null);
      loadSubscription();
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "ERR_TENANT_GATEWAY_CUSTOMER_NOT_CONFIGURED") {
        toast.error(t("planGatewayNotConfigured", { gateway: gatewayLabel }));
      } else {
        toast.error(t("planChangeError"));
      }
    } finally {
      setChanging(false);
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} />
        <EmptyState icon={CreditCard} title={t("emptyTitle")} description={t("emptyDesc")} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />

      {/* Plano e assinatura */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{t("planTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("planDesc")}</p>
            </div>
            <div className="flex items-center gap-2">
              {hasSubscription && <Badge variant="success">{t("planActiveSub")}</Badge>}
              <span className="text-xs text-muted-foreground">{t("gatewayLabel")}</span>
              <Badge variant="secondary">{gatewayLabel}</Badge>
            </div>
          </div>

          {plansLoading ? (
            <Skeleton className="h-[140px]" />
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("planEmpty")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {plans.map((p) => (
                <div key={p.id} className="rounded-lg border p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{p.name}</span>
                    {isTrialPlan(p) && <Badge variant="warning">{t("planTrial")}</Badge>}
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
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 w-full"
                      onClick={() => setConfirmPlan(p)}
                    >
                      {t("planSelectBtn")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de pagamentos */}
      {loading ? (
        <Skeleton className="h-[400px]" />
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
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status?.toLowerCase()] ?? "secondary"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmt(p.dueDate)}</TableCell>
                    <TableCell>{fmtVal(p.value)}</TableCell>
                    <TableCell>
                      {p.paymentUrl ? (
                        <a href={p.paymentUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline text-sm">
                          {t("paymentLink")} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Confirmação de troca de plano */}
      <Dialog open={!!confirmPlan} onOpenChange={(o) => { if (!o && !changing) setConfirmPlan(null); }}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPlan(null)} disabled={changing}>
              {t("planCancelBtn")}
            </Button>
            <Button onClick={handleConfirmChange} disabled={changing}>
              {changing && <Loader2 className="h-4 w-4 animate-spin" />}
              {!changing && <Check className="h-4 w-4" />}
              {t("planConfirmBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
