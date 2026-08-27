"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";

export interface StatsOpportunity {
  status?: string;
  value?: number;
  responsibleId?: number | null;
}

interface Props {
  opportunities: StatsOpportunity[];
  paginationTotal?: number;
}

export function KanbanStatsChips({ opportunities, paginationTotal }: Props) {
  const t = useTranslations("funilKanbanPage");

  const stats = useMemo(() => {
    const list = opportunities || [];
    const abertas = list.filter((o) => (o.status ?? "open").toLowerCase() === "open").length;
    const emAndamento = list.filter(
      (o) => (o.status ?? "open").toLowerCase() === "open" && o.responsibleId,
    ).length;
    const valorTotal = list.reduce((s, o) => s + (Number(o.value) || 0), 0);
    return {
      abertas,
      emAndamento,
      valorTotalFormatado: valorTotal.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    };
  }, [opportunities]);

  const total = paginationTotal ?? opportunities.length;
  // Com paginação ativa, os chips abaixo (abertas/andamento/valor) refletem só a
  // página carregada — sinaliza "nesta página" p/ não parecer total global.
  // O chip "Oportunidades" já usa o total global (paginationTotal) e fica sem nota.
  const isPartialPage = paginationTotal != null && paginationTotal > (opportunities?.length ?? 0);
  const pageNote = isPartialPage ? (
    <span className="ml-1 font-normal opacity-70">({t("statOnThisPage")})</span>
  ) : null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full border bg-muted/50 px-3 py-1 font-medium">
        {t("statOpportunities")} {total}
      </span>
      <span className="rounded-full border bg-muted/50 px-3 py-1 font-medium">
        {t("statOpen")} {stats.abertas}
        {pageNote}
      </span>
      <span className="rounded-full border bg-muted/50 px-3 py-1 font-medium">
        {t("statInProgress")} {stats.emAndamento}
        {pageNote}
      </span>
      <span className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-semibold text-primary">
        {t("statTotalValue")} R$ {stats.valorTotalFormatado}
        {pageNote}
      </span>
    </div>
  );
}
