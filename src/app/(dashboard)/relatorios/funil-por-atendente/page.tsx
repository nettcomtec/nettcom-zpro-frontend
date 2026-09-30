"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePresets } from "@/components/ui/date-range-presets";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableFooter, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortable } from "@/hooks/use-sortable";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/layout/access-denied";
import type { PageHelpProps } from "@/components/layout/page-help";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
import { useAuthStore } from "@/stores/auth-store";
import { printReportTable } from "@/lib/print-report";
import { formatCurrencyBRL, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, sub } from "date-fns";
import {
  AlertCircle, AlertTriangle, Download, FileText, Lock, Printer, RefreshCw, TrendingUp,
} from "lucide-react";
import {
  fetchFunnelByUserReport,
  type FunnelByUserReport,
} from "@/services/reports";
import { fetchAllUsers, type User } from "@/services/users";

const ALL_USERS = "all";

type LoadStatus = "idle" | "loading" | "ok" | "error" | "unavailable";

// Nome de aba do XLSX: até 31 caracteres e sem \ / ? * [ ] :
function sheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

// Conversão chega como fração (ganhas ÷ fechadas, 0..1 — mesma convenção do resumo do
// contato). Valor acima de 1 só pode ser porcentagem: normaliza para não exibir 6.670%.
function toFraction(conversion: number | null | undefined): number | null {
  if (conversion == null) return null;
  const n = Number(conversion);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

function fmtConversion(fraction: number | null): string {
  if (fraction == null) return "—";
  return formatNumber(fraction, { style: "percent", maximumFractionDigits: 1 });
}

export default function RelatorioFunilPorAtendentePage() {
  const t = useTranslations("relationshipReports");
  const tProd = useTranslations("produtividadeDiariaPage");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  const featureOn = useAuthStore((s) => s.hasFeature("funnelKanban"));
  const { isLiveMode } = useLiveMode();

  const [dateStart, setDateStart] = useState(format(sub(new Date(), { days: 30 }), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [userId, setUserId] = useState<string>(ALL_USERS);
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<FunnelByUserReport | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  // Descarta resposta atrasada quando um atalho de período dispara outra busca.
  const requestRef = useRef(0);

  const load = useCallback(
    async (s: string = dateStart, e: string = dateEnd, u: string = userId) => {
      if (!s || !e) {
        toast.error(tProd("toastSelectDates"));
        return;
      }
      const requestId = ++requestRef.current;
      setStatus("loading");
      try {
        const res = await fetchFunnelByUserReport({
          startDate: s,
          endDate: e,
          userId: u !== ALL_USERS ? Number(u) : undefined,
        });
        if (requestId !== requestRef.current) return;
        setData(res.data);
        setStatus("ok");
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setData(null);
        // 404 = backend sem estes relatórios; 402 = fora do plano: mesma tela de indisponível.
        const httpStatus = (err as { status?: number; response?: { status?: number } } | null);
        const code = httpStatus?.status ?? httpStatus?.response?.status;
        setStatus(code === 404 || code === 402 ? "unavailable" : "error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateStart, dateEnd, userId]
  );

  useEffect(() => {
    if (!allowed || !featureOn) return;
    load();
    fetchAllUsers()
      .then((res) => setUsers((res.data?.users || []).filter((u: User) => u.profile !== "superadmin")))
      .catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, featureOn]);

  const userOptions = useMemo(
    () => [
      { value: ALL_USERS, label: tProd("optionTodos") },
      ...users.map((u) => ({ value: String(u.id), label: u.name || u.email })),
    ],
    [users, tProd]
  );

  const rows = useMemo(
    () =>
      (data?.rows || []).map((r) => ({
        key: String(r.userId ?? "none"),
        atendente: r.userId == null ? t("common.noUser") : r.userName || `#${r.userId}`,
        ganhas: Number(r.won || 0),
        perdidas: Number(r.lost || 0),
        valorGanho: Number(r.wonValue || 0),
        valorPerdido: Number(r.lostValue || 0),
        // null ordena por último no useSortable (sem oportunidade fechada).
        conversao: toFraction(r.conversion),
      })),
    [data, t]
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(rows, "valorGanho", "desc");

  const totals = useMemo(() => {
    const acc = rows.reduce(
      (sum, r) => ({
        ganhas: sum.ganhas + r.ganhas,
        perdidas: sum.perdidas + r.perdidas,
        valorGanho: sum.valorGanho + r.valorGanho,
        valorPerdido: sum.valorPerdido + r.valorPerdido,
      }),
      { ganhas: 0, perdidas: 0, valorGanho: 0, valorPerdido: 0 }
    );
    const closed = acc.ganhas + acc.perdidas;
    return { ...acc, conversao: closed > 0 ? acc.ganhas / closed : null };
  }, [rows]);

  const withoutCloseDate = Number(data?.withoutCloseDate || 0);
  const hasData = status === "ok" && rows.length > 0;

  const headers = [
    t("common.user"), t("funnelByUser.colWon"), t("funnelByUser.colLost"),
    t("funnelByUser.colWonValue"), t("funnelByUser.colLostValue"), t("funnelByUser.colConversion"),
  ];
  const matrix = () => [
    ...sortedData.map((r) => [
      r.atendente, formatNumber(r.ganhas), formatNumber(r.perdidas),
      formatCurrencyBRL(r.valorGanho), formatCurrencyBRL(r.valorPerdido), fmtConversion(r.conversao),
    ]),
    [
      t("common.total"), formatNumber(totals.ganhas), formatNumber(totals.perdidas),
      formatCurrencyBRL(totals.valorGanho), formatCurrencyBRL(totals.valorPerdido), fmtConversion(totals.conversao),
    ],
  ];

  const handleExportXlsx = async () => {
    if (!hasData) return;
    try {
      const mod = await import("xlsx");
      const XLSX = mod.default ?? mod;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          headers,
          ...sortedData.map((r) => [
            r.atendente, r.ganhas, r.perdidas, r.valorGanho, r.valorPerdido, fmtConversion(r.conversao),
          ]),
          [
            t("common.total"), totals.ganhas, totals.perdidas, totals.valorGanho, totals.valorPerdido,
            fmtConversion(totals.conversao),
          ],
        ]),
        sheetName(t("funnelByUser.title"))
      );
      XLSX.writeFile(wb, `Funil-por-Atendente-${dateStart}_${dateEnd}.xlsx`);
      toast.success(tProd("toastExportSuccess"));
    } catch {
      toast.error(tProd("toastExportError"));
    }
  };

  const handleExportCsv = () => {
    if (!hasData) return;
    const csv = [headers, ...matrix()]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Funil-por-Atendente-${dateStart}_${dateEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tProd("toastExportSuccess"));
  };

  const handlePrint = () => {
    if (!hasData) return;
    if (!printReportTable({ title: t("funnelByUser.title"), headers, rows: matrix() })) {
      toast.error(tProd("toastExportError"));
    }
  };

  if (!allowed) return <AccessDenied />;

  const pageHelp: PageHelpProps = {
    description: t("funnelByUser.helpDesc"),
    sections: [{ title: t("funnelByUser.helpS0T"), items: [t("funnelByUser.helpS0I0")] }],
  };
  const header = (
    <PageHeader title={t("funnelByUser.title")} description={t("funnelByUser.description")} help={pageHelp} />
  );

  if (!featureOn || status === "unavailable") {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState icon={Lock} title={t("common.featureUnavailable")} />
      </div>
    );
  }

  const loading = status === "loading" || status === "idle";

  const kpis = [
    { key: "ganhas", label: t("funnelByUser.colWon"), value: formatNumber(totals.ganhas), blur: false },
    { key: "perdidas", label: t("funnelByUser.colLost"), value: formatNumber(totals.perdidas), blur: false },
    { key: "valorGanho", label: t("funnelByUser.colWonValue"), value: formatCurrencyBRL(totals.valorGanho), blur: true },
    { key: "conversao", label: t("funnelByUser.colConversion"), value: fmtConversion(totals.conversao), blur: false },
  ];

  return (
    <div className="space-y-6">
      {header}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid w-full gap-2 sm:w-auto">
              <Label className="text-xs">{t("common.startDate")}</Label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="grid w-full gap-2 sm:w-auto">
              <Label className="text-xs">{t("common.endDate")}</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="grid w-full gap-2 sm:w-auto">
              <Label className="text-xs">{t("common.user")}</Label>
              <SearchableSelect
                options={userOptions}
                value={userId}
                onValueChange={(v) => setUserId(v || ALL_USERS)}
                placeholder={tProd("optionTodos")}
                triggerClassName="w-full sm:w-56"
              />
            </div>
            <DateRangePresets
              onSelect={(s, e) => {
                setDateStart(s);
                setDateEnd(e);
                load(s, e, userId);
              }}
            />
            <Button onClick={() => load()} disabled={status === "loading"}>
              <RefreshCw className={status === "loading" ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
              {t("common.apply")}
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!hasData}>
              <Printer className="mr-2 h-4 w-4" />
              {t("common.print")}
            </Button>
            <Button variant="outline" onClick={handleExportXlsx} disabled={!hasData}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.exportXlsx")}
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={!hasData}>
              <FileText className="mr-2 h-4 w-4" />
              {t("common.exportCsv")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {status === "ok" && withoutCloseDate > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("funnelByUser.withoutCloseDateNote", { count: withoutCloseDate })}</p>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-[320px] w-full" />
      ) : status === "error" ? (
        <EmptyState icon={AlertCircle} title={t("common.loadError")}>
          <Button variant="outline" onClick={() => load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("common.retry")}
          </Button>
        </EmptyState>
      ) : !hasData ? (
        <EmptyState icon={TrendingUp} title={t("common.noData")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.key}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p
                    className={cn(
                      "mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl",
                      k.blur && isLiveMode && "live-blur-text"
                    )}
                  >
                    {k.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[560px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <SortableTableHead sortKey="atendente" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("common.user")}</SortableTableHead>
                      <SortableTableHead sortKey="ganhas" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("funnelByUser.colWon")}</SortableTableHead>
                      <SortableTableHead sortKey="perdidas" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("funnelByUser.colLost")}</SortableTableHead>
                      <SortableTableHead sortKey="valorGanho" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right [&>button]:justify-end">{t("funnelByUser.colWonValue")}</SortableTableHead>
                      <SortableTableHead sortKey="valorPerdido" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right [&>button]:justify-end">{t("funnelByUser.colLostValue")}</SortableTableHead>
                      <SortableTableHead sortKey="conversao" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("funnelByUser.colConversion")}</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((r) => (
                      <TableRow key={r.key} className="odd:bg-muted/30">
                        <TableCell className={cn("font-medium", isLiveMode && "live-blur-text")}>{r.atendente}</TableCell>
                        <TableCell className="text-center tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(r.ganhas)}</TableCell>
                        <TableCell className="text-center tabular-nums text-destructive">{formatNumber(r.perdidas)}</TableCell>
                        <TableCell className={cn("whitespace-nowrap text-right font-semibold tabular-nums", isLiveMode && "live-blur-text")}>
                          {formatCurrencyBRL(r.valorGanho)}
                        </TableCell>
                        <TableCell className={cn("whitespace-nowrap text-right tabular-nums text-muted-foreground", isLiveMode && "live-blur-text")}>
                          {formatCurrencyBRL(r.valorPerdido)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{fmtConversion(r.conversao)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>{t("common.total")}</TableCell>
                      <TableCell className="text-center tabular-nums">{formatNumber(totals.ganhas)}</TableCell>
                      <TableCell className="text-center tabular-nums">{formatNumber(totals.perdidas)}</TableCell>
                      <TableCell className={cn("whitespace-nowrap text-right tabular-nums", isLiveMode && "live-blur-text")}>
                        {formatCurrencyBRL(totals.valorGanho)}
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap text-right tabular-nums", isLiveMode && "live-blur-text")}>
                        {formatCurrencyBRL(totals.valorPerdido)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{fmtConversion(totals.conversao)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
