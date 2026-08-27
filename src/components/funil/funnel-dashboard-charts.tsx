"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { PieChartCard } from "@/components/charts/pie-chart-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";

export interface ChartOpportunity {
  status?: string;
  value?: number;
  stageId?: number;
  pipelineId?: number;
  createdAt?: string;
}

export interface ChartStage {
  id: number;
  name: string;
}

interface Props {
  opportunities: ChartOpportunity[];
  stages: ChartStage[];
}

export function FunnelDashboardCharts({ opportunities, stages }: Props) {
  const t = useTranslations("funilDashboardPage");

  const byStatus = useMemo(() => {
    const counts = { open: 0, won: 0, lost: 0 } as Record<string, number>;
    for (const o of opportunities) {
      const s = (o.status ?? "open").toLowerCase();
      if (s === "won" || s === "ganha") counts.won++;
      else if (s === "lost" || s === "perdida") counts.lost++;
      else counts.open++;
    }
    return [
      { name: t("chartOpen"), value: counts.open },
      { name: t("chartWon"), value: counts.won },
      { name: t("chartLost"), value: counts.lost },
    ];
  }, [opportunities, t]);

  const byStage = useMemo(() => {
    const stageMap = new Map(stages.map((s) => [s.id, s.name]));
    const counts = new Map<number, number>();
    for (const o of opportunities) {
      if (o.stageId == null) continue;
      counts.set(o.stageId, (counts.get(o.stageId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, value]) => ({ name: stageMap.get(id) ?? `#${id}`, value }))
      .sort((a, b) => b.value - a.value);
  }, [opportunities, stages]);

  const byMonth = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of opportunities) {
      if (!o.createdAt) continue;
      const d = new Date(o.createdAt);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([k, v]) => ({ name: k, value: v }));
  }, [opportunities]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PieChartCard title={t("chartByStatusTitle")} data={byStatus} donut />
      <BarChartCard title={t("chartByStageTitle")} data={byStage} />
      {byMonth.length > 0 ? (
        <div className="md:col-span-2">
          <BarChartCard title={t("chartByMonthTitle")} data={byMonth} />
        </div>
      ) : null}
    </div>
  );
}
