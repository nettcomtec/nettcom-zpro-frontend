"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Calendar, RefreshCw, CheckCircle2, Loader2, AlertTriangle, Clock, Users, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { changeTenantPlan } from "@/services/tenants";
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
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  description: string;
  bankSlipUrl?: string;
}

interface PaymentPlanModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subscription: AsaasSubscription | null;
  payments: AsaasPayment[];
  availablePlans: Plan[];
  onPlanChanged: () => void;
}

const BILLING_TYPE_LABEL: Record<string, string> = {
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
  PIX: "PIX",
  UNDEFINED: "—",
};

const CYCLE_LABEL: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  SEMIANNUALLY: "Semestral",
  YEARLY: "Anual",
};

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

export function PaymentPlanModal({
  open, onOpenChange, subscription, payments, availablePlans, onPlanChanged,
}: PaymentPlanModalProps) {
  const t = useTranslations("paymentPlanModal");
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [changing, setChanging] = useState(false);

  const latestPayment = payments?.[0] ?? null;

  const paymentStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      PENDING:  { label: t("statusPending"),  variant: "outline" },
      RECEIVED: { label: t("statusReceived"), variant: "default" },
      OVERDUE:  { label: t("statusOverdue"),  variant: "destructive" },
    };
    const s = map[status] ?? { label: status, variant: "secondary" };
    return <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>;
  };

  const subscriptionStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      ACTIVE:   { label: t("subActive"),   className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
      INACTIVE: { label: t("subInactive"), className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
      EXPIRED:  { label: t("subExpired"),  className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
    };
    const s = map[status] ?? { label: status, className: "bg-secondary text-secondary-foreground" };
    return <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", s.className)}>{s.label}</span>;
  };

  const handleChangePlan = async () => {
    if (!confirmPlan) return;
    setChanging(true);
    try {
      await changeTenantPlan(confirmPlan.id);
      toast.success(t("planChangedSuccess", { name: confirmPlan.name }));
      setConfirmPlan(null);
      onPlanChanged();
      onOpenChange(false);
    } catch {
      toast.error(t("planChangedError"));
    } finally {
      setChanging(false);
    }
  };

  // Match current plan by planId (metadata do gateway, quando presente) ou por
  // valor + descrição (nome do plano) como fallback legado
  const isCurrentPlan = (plan: Plan) =>
    (subscription?.planId != null && Number(subscription.planId) === plan.id) ||
    (subscription?.value === plan.value && subscription?.description === plan.name);

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
                <span>{formatCurrency(subscription.value)} / {CYCLE_LABEL[subscription.cycle] ?? subscription.cycle}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{t("nextDue")}: {formatDate(subscription.nextDueDate)}</span>
              </div>
              <div className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                <span>{BILLING_TYPE_LABEL[subscription.billingType] ?? subscription.billingType}</span>
              </div>
              {latestPayment && (
                <div className="flex items-center gap-1.5">
                  {latestPayment.status === "RECEIVED"
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    : latestPayment.status === "OVERDUE"
                    ? <AlertTriangle className="h-3 w-3 text-red-500" />
                    : <Clock className="h-3 w-3 text-yellow-500" />}
                  <span>{t("lastPayment")}: {paymentStatusBadge(latestPayment.status)}</span>
                </div>
              )}
            </div>
            {latestPayment?.bankSlipUrl && latestPayment.status !== "RECEIVED" && (
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
                          onClick={() => setConfirmPlan(confirmPlan?.id === plan.id ? null : plan)}
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

        {/* Confirm footer */}
        {confirmPlan && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <p className="text-xs text-muted-foreground flex-1">
              {t("confirmChange", { name: confirmPlan.name, value: formatCurrency(confirmPlan.value) })}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmPlan(null)} disabled={changing}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={handleChangePlan} disabled={changing}>
                {changing && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                {t("confirm")}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
