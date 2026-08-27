"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Clock, UserX, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { daysUntilClosing } from "@/lib/opportunity-date";

export interface AlertOpportunity {
  id: number;
  name: string;
  status?: string;
  closingForecast?: string | null;
  responsibleId?: number | null;
  updatedAt?: string | null;
}

type AlertKind = "closing" | "noOwner" | "inactive";

interface AlertItem {
  id: string;
  kind: AlertKind;
  opportunityId: number;
  title: string;
  body: string;
}

interface Props {
  opportunities: AlertOpportunity[];
  onOpen?: (id: number) => void;
}

const INACTIVE_DAYS_THRESHOLD = 7;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function OpportunityAlerts({ opportunities, onOpen }: Props) {
  const t = useTranslations("funilKanbanPage");
  const [expanded, setExpanded] = useState(false);

  const alerts = useMemo<AlertItem[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: AlertItem[] = [];

    for (const opp of opportunities || []) {
      const status = (opp.status ?? "open").toLowerCase();
      if (status !== "open") continue;

      // Vencendo em ≤ 2 dias
      if (opp.closingForecast) {
        const diff = daysUntilClosing(opp.closingForecast, today);
        if (diff !== null && diff >= 0 && diff <= 2) {
          const when =
            diff === 0
              ? t("alertClosingToday")
              : `${diff} ${diff === 1 ? t("alertDay") : t("alertDays")}`;
          out.push({
            id: `${opp.id}-closing`,
            kind: "closing",
            opportunityId: opp.id,
            title: t("alertClosingSoon"),
            body: `${opp.name} · ${when}`,
          });
        }
      }

      // Sem responsável
      if (opp.responsibleId == null) {
        out.push({
          id: `${opp.id}-noOwner`,
          kind: "noOwner",
          opportunityId: opp.id,
          title: t("alertNoOwner"),
          body: opp.name,
        });
      }

      // Inativa há mais de N dias
      if (opp.updatedAt) {
        const updated = new Date(opp.updatedAt);
        updated.setHours(0, 0, 0, 0);
        const diff = daysBetween(today, updated);
        if (diff >= INACTIVE_DAYS_THRESHOLD) {
          out.push({
            id: `${opp.id}-inactive`,
            kind: "inactive",
            opportunityId: opp.id,
            title: t("alertInactive"),
            body: `${opp.name} · ${diff} ${t("alertDays")}`,
          });
        }
      }
    }
    return out;
  }, [opportunities, t]);

  if (alerts.length === 0) return null;

  const visible = expanded ? alerts : alerts.slice(0, 3);

  const iconFor = (kind: AlertKind) => {
    if (kind === "closing") return <Clock className="h-3.5 w-3.5 text-amber-600" />;
    if (kind === "noOwner") return <UserX className="h-3.5 w-3.5 text-blue-600" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />;
  };

  return (
    <Card className="border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20">
      <CardContent className="py-3 px-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> {t("alertsTitle")} ({alerts.length})
          </p>
          {alerts.length > 3 ? (
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? (<><ChevronUp className="h-3 w-3 mr-1" />{t("alertsCollapse")}</>) : (<><ChevronDown className="h-3 w-3 mr-1" />{t("alertsExpand")}</>)}
            </Button>
          ) : null}
        </div>
        <ul className="space-y-1">
          {visible.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs">
              {iconFor(a.kind)}
              <span className="font-medium">{a.title}:</span>
              <span className="text-muted-foreground truncate flex-1">{a.body}</span>
              {onOpen ? (
                <Button type="button" size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => onOpen(a.opportunityId)}>
                  {t("alertsOpen")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
