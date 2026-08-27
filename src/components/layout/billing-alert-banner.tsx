"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { AlertTriangle, Clock, CreditCard, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function BillingAlertBanner() {
  const t = useTranslations("billingAlertBanner");
  const { billingState, billingDaysInfo, canViewPayments } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);

  // LGPD: usuários comuns não podem ver dados de pagamento do contratante
  if (!canViewPayments()) return null;

  if (dismissed || billingState === 'ok') {
    return null;
  }

  const { daysBeforeDue, daysOverdue, daysUntilBlock, bankSlipUrl } = billingDaysInfo;

  const config = {
    approaching: {
      bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
      text: "text-blue-800 dark:text-blue-200",
      icon: <Clock className="h-4 w-4 shrink-0" />,
      message: t("approaching", { days: daysBeforeDue ?? 0 }),
    },
    due_today: {
      bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
      text: "text-amber-800 dark:text-amber-200",
      icon: <CreditCard className="h-4 w-4 shrink-0" />,
      message: t("dueToday"),
    },
    overdue_warning: {
      bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
      text: "text-red-800 dark:text-red-200",
      icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
      message: daysUntilBlock !== undefined
        ? t("overdueWarningWithBlock", { daysOverdue: daysOverdue ?? 0, daysUntilBlock })
        : t("overdueWarning", { daysOverdue: daysOverdue ?? 0 }),
    },
    blocked: {
      bg: "bg-red-100 dark:bg-red-950/60 border-red-400 dark:border-red-700",
      text: "text-red-900 dark:text-red-100 font-semibold",
      icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
      message: t("blocked", { daysOverdue: daysOverdue ?? 0 }),
    },
  } as const;

  const c = config[billingState as keyof typeof config];
  if (!c) return null;

  return (
    <div className={cn("border-b px-4 py-2 flex items-center gap-3 text-sm", c.bg, c.text)}>
      {c.icon}
      <span className="flex-1">{c.message}</span>
      {bankSlipUrl && (
        <a
          href={bankSlipUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("flex items-center gap-1 font-medium underline underline-offset-2 hover:opacity-80", c.text)}
        >
          {t("payNow")}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {billingState === 'approaching' && (
        <button
          onClick={() => setDismissed(true)}
          className={cn("ml-1 hover:opacity-70 transition-opacity", c.text)}
          aria-label={t("dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
