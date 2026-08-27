"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Star } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { formatDuration } from "@/services/dashboard";
import type { RawUserDetail } from "@/services/dashboard";
import { useTranslations } from "next-intl";

function AnimatedNumber({ value, delay = 0, decimals = 0, enabled }: { value: number; delay?: number; decimals?: number; enabled: boolean }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const duration = 800;
    const delayMs = delay * 50;
    const startTime = performance.now() + delayMs;
    let raf: number;
    const step = (now: number) => {
      if (now < startTime) { raf = requestAnimationFrame(step); return; }
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = value * eased;
      setDisplay(decimals > 0 ? parseFloat(current.toFixed(decimals)) : Math.round(current));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [enabled, value, delay, decimals]);
  return <>{decimals > 0 ? display.toFixed(decimals) : display}</>;
}

interface PerformanceTableProps {
  title: string;
  users: RawUserDetail[];
}

// {hours, minutes, seconds} → minutos totais (fração inclui segundos), ou null
// quando a métrica não existe.
function toMinutes(d?: { hours?: number; minutes?: number; seconds?: number } | null): number | null {
  if (!d) return null;
  return (d.hours ?? 0) * 60 + (d.minutes ?? 0) + (d.seconds ?? 0) / 60;
}

function minutesToHMS(min: number): { hours: number; minutes: number; seconds: number } {
  const totalSec = Math.round(min * 60);
  return {
    hours: Math.floor(totalSec / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

export function PerformanceTable({ title, users }: PerformanceTableProps) {
  const t = useTranslations("performanceTable");
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  // Linhas decoradas para ordenação por qualquer coluna. Sem chave inicial:
  // a ordem recebida (default atual) é preservada até o primeiro clique.
  // Durações/avaliação nulas ordenam como 0, espelhando o que a célula exibe.
  const sortableRows = useMemo(
    () =>
      users.map((user) => ({
        user,
        nome: user.name ?? null,
        pendentes: Number(user.qtd_pendentes ?? 0),
        emAtendimento: Number(user.qtd_em_atendimento ?? 0),
        resolvidos: Number(user.qtd_resolvidos ?? 0),
        total: Number(user.qtd_por_usuario ?? 0),
        avaliacao: Math.round(Number(user.media_avaliacao ?? 0) * 10),
        tme: toMinutes(user.tme) ?? 0,
        tma: toMinutes(user.tma) ?? 0,
        tpr: toMinutes(user.tpr) ?? 0,
        tte: toMinutes(user.tte) ?? 0,
      })),
    [users]
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(sortableRows);

  // Rodapé: SOMA para contagens; MÉDIA para avaliação e TME/TMA/TPR/TTE
  // (nunca soma de duração), sobre os usuários que possuem a métrica.
  // Number(): a API pode entregar contagens como string (COUNT bigint no
  // driver pg) — sem coerção o += concatena em vez de somar.
  const totals = useMemo(() => {
    let pendentes = 0;
    let emAtendimento = 0;
    let resolvidos = 0;
    let total = 0;
    const rating: number[] = [];
    const tme: number[] = [];
    const tma: number[] = [];
    const tpr: number[] = [];
    const tte: number[] = [];
    users.forEach((u) => {
      pendentes += Number(u.qtd_pendentes ?? 0);
      emAtendimento += Number(u.qtd_em_atendimento ?? 0);
      resolvidos += Number(u.qtd_resolvidos ?? 0);
      total += Number(u.qtd_por_usuario ?? 0);
      if (u.media_avaliacao != null) rating.push(Number(u.media_avaliacao));
      const vTme = toMinutes(u.tme);
      const vTma = toMinutes(u.tma);
      const vTpr = toMinutes(u.tpr);
      const vTte = toMinutes(u.tte);
      if (vTme !== null) tme.push(vTme);
      if (vTma !== null) tma.push(vTma);
      if (vTpr !== null) tpr.push(vTpr);
      if (vTte !== null) tte.push(vTte);
    });
    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    return {
      pendentes,
      emAtendimento,
      resolvidos,
      total,
      ratingAvg: avg(rating),
      tmeAvg: avg(tme),
      tmaAvg: avg(tma),
      tprAvg: avg(tpr),
      tteAvg: avg(tte),
    };
  }, [users]);

  return (
    <Card ref={ref}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {users.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            {t("noData")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="nome" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colUser")}</SortableTableHead>
                <SortableTableHead sortKey="pendentes" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colPending")}</SortableTableHead>
                <SortableTableHead sortKey="emAtendimento" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colAttending")}</SortableTableHead>
                <SortableTableHead sortKey="resolvidos" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colResolved")}</SortableTableHead>
                <SortableTableHead sortKey="total" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colTotal")}</SortableTableHead>
                <SortableTableHead sortKey="avaliacao" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colRating")}</SortableTableHead>
                <SortableTableHead sortKey="tme" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colTME")}</SortableTableHead>
                <SortableTableHead sortKey="tma" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colTMA")}</SortableTableHead>
                <SortableTableHead sortKey="tpr" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colTPR")}</SortableTableHead>
                <SortableTableHead sortKey="tte" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colTTE")}</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map(({ user }, idx) => (
                <TableRow key={idx} className="odd:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px]">{getInitials(user.name ?? "")}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{user.name || t("noName")}</p>
                        {user.email && <p className="text-[10px] text-muted-foreground">{user.email}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="warning" className="text-[10px] tabular-nums">
                      <AnimatedNumber value={user.qtd_pendentes ?? 0} delay={idx} enabled={inView} />
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="info" className="text-[10px] tabular-nums">
                      <AnimatedNumber value={user.qtd_em_atendimento ?? 0} delay={idx} enabled={inView} />
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="success" className="text-[10px] tabular-nums">
                      <AnimatedNumber value={user.qtd_resolvidos ?? 0} delay={idx} enabled={inView} />
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-semibold tabular-nums">
                      <AnimatedNumber value={user.qtd_por_usuario ?? 0} delay={idx} enabled={inView} />
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm tabular-nums">
                        <AnimatedNumber value={Number(user.media_avaliacao ?? 0)} delay={idx} decimals={1} enabled={inView} />
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{formatDuration(user.tme)}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{formatDuration(user.tma)}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{formatDuration(user.tpr)}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{formatDuration(user.tte)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold bg-muted/40">
                <TableCell className="text-sm">{t("footerTotals")}</TableCell>
                <TableCell className="text-center tabular-nums">{totals.pendentes}</TableCell>
                <TableCell className="text-center tabular-nums">{totals.emAtendimento}</TableCell>
                <TableCell className="text-center tabular-nums">{totals.resolvidos}</TableCell>
                <TableCell className="text-center tabular-nums">{totals.total}</TableCell>
                <TableCell className="text-center tabular-nums">
                  <span className="block text-[10px] font-normal text-muted-foreground">{t("footerAvg")}</span>
                  {totals.ratingAvg !== null ? totals.ratingAvg.toFixed(1) : "—"}
                </TableCell>
                <TableCell className="text-center text-sm">
                  <span className="block text-[10px] font-normal text-muted-foreground">{t("footerAvg")}</span>
                  {totals.tmeAvg !== null ? formatDuration(minutesToHMS(totals.tmeAvg)) : "—"}
                </TableCell>
                <TableCell className="text-center text-sm">
                  <span className="block text-[10px] font-normal text-muted-foreground">{t("footerAvg")}</span>
                  {totals.tmaAvg !== null ? formatDuration(minutesToHMS(totals.tmaAvg)) : "—"}
                </TableCell>
                <TableCell className="text-center text-sm">
                  <span className="block text-[10px] font-normal text-muted-foreground">{t("footerAvg")}</span>
                  {totals.tprAvg !== null ? formatDuration(minutesToHMS(totals.tprAvg)) : "—"}
                </TableCell>
                <TableCell className="text-center text-sm">
                  <span className="block text-[10px] font-normal text-muted-foreground">{t("footerAvg")}</span>
                  {totals.tteAvg !== null ? formatDuration(minutesToHMS(totals.tteAvg)) : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
