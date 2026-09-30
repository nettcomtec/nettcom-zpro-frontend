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
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, sub } from "date-fns";
import {
  AlertCircle, Download, FileText, Info, ListChecks, Lock, Printer, RefreshCw,
} from "lucide-react";
import {
  fetchTasksByUserReport,
  type TasksByUserReport,
} from "@/services/reports";
import { fetchAllUsers, type User } from "@/services/users";

const ALL_USERS = "all";

type LoadStatus = "idle" | "loading" | "ok" | "error" | "unavailable";

// Nome de aba do XLSX: até 31 caracteres e sem \ / ? * [ ] :
function sheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

export default function RelatorioTarefasPorAtendentePage() {
  const t = useTranslations("relationshipReports");
  const tProd = useTranslations("produtividadeDiariaPage");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  const featureOn = useAuthStore((s) => s.hasFeature("tasks"));
  const { isLiveMode } = useLiveMode();

  const [dateStart, setDateStart] = useState(format(sub(new Date(), { days: 30 }), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [userId, setUserId] = useState<string>(ALL_USERS);
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<TasksByUserReport | null>(null);
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
        const res = await fetchTasksByUserReport({
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
        pendentes: Number(r.pending || 0),
        concluidas: Number(r.completed || 0),
        atrasadas: Number(r.overdue || 0),
        total: Number(r.total || 0),
      })),
    [data, t]
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(rows, "total", "desc");

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          pendentes: acc.pendentes + r.pendentes,
          concluidas: acc.concluidas + r.concluidas,
          atrasadas: acc.atrasadas + r.atrasadas,
          total: acc.total + r.total,
        }),
        { pendentes: 0, concluidas: 0, atrasadas: 0, total: 0 }
      ),
    [rows]
  );

  const hasData = status === "ok" && rows.length > 0;

  const headers = [
    t("common.user"), t("tasksByUser.colPending"), t("tasksByUser.colCompleted"),
    t("tasksByUser.colOverdue"), t("tasksByUser.colTotal"),
  ];
  const matrix = () => [
    ...sortedData.map((r) => [
      r.atendente, formatNumber(r.pendentes), formatNumber(r.concluidas),
      formatNumber(r.atrasadas), formatNumber(r.total),
    ]),
    [
      t("common.total"), formatNumber(totals.pendentes), formatNumber(totals.concluidas),
      formatNumber(totals.atrasadas), formatNumber(totals.total),
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
          ...sortedData.map((r) => [r.atendente, r.pendentes, r.concluidas, r.atrasadas, r.total]),
          [t("common.total"), totals.pendentes, totals.concluidas, totals.atrasadas, totals.total],
        ]),
        sheetName(t("tasksByUser.title"))
      );
      XLSX.writeFile(wb, `Tarefas-por-Atendente-${dateStart}_${dateEnd}.xlsx`);
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
    a.download = `Tarefas-por-Atendente-${dateStart}_${dateEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tProd("toastExportSuccess"));
  };

  const handlePrint = () => {
    if (!hasData) return;
    if (!printReportTable({ title: t("tasksByUser.title"), headers, rows: matrix() })) {
      toast.error(tProd("toastExportError"));
    }
  };

  if (!allowed) return <AccessDenied />;

  const pageHelp: PageHelpProps = {
    description: t("tasksByUser.helpDesc"),
    sections: [{ title: t("tasksByUser.helpS0T"), items: [t("tasksByUser.helpS0I0")] }],
  };
  const header = (
    <PageHeader title={t("tasksByUser.title")} description={t("tasksByUser.description")} help={pageHelp} />
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
    { key: "pendentes", label: t("tasksByUser.colPending"), value: totals.pendentes, className: "" },
    { key: "concluidas", label: t("tasksByUser.colCompleted"), value: totals.concluidas, className: "" },
    {
      key: "atrasadas",
      label: t("tasksByUser.colOverdue"),
      value: totals.atrasadas,
      className: totals.atrasadas > 0 ? "text-destructive" : "",
    },
    { key: "total", label: t("tasksByUser.colTotal"), value: totals.total, className: "" },
  ];

  return (
    <div className="space-y-6">
      {header}

      <Card>
        <CardContent className="space-y-4 pt-6">
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

          <div className="flex gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t("tasksByUser.periodNote")}</p>
          </div>
        </CardContent>
      </Card>

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
        <EmptyState icon={ListChecks} title={t("common.noData")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.key}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", k.className)}>
                    {formatNumber(k.value)}
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
                      <SortableTableHead sortKey="pendentes" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("tasksByUser.colPending")}</SortableTableHead>
                      <SortableTableHead sortKey="concluidas" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("tasksByUser.colCompleted")}</SortableTableHead>
                      <SortableTableHead sortKey="atrasadas" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("tasksByUser.colOverdue")}</SortableTableHead>
                      <SortableTableHead sortKey="total" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("tasksByUser.colTotal")}</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((r) => (
                      <TableRow key={r.key} className="odd:bg-muted/30">
                        <TableCell className={cn("font-medium", isLiveMode && "live-blur-text")}>{r.atendente}</TableCell>
                        <TableCell className="text-center tabular-nums">{formatNumber(r.pendentes)}</TableCell>
                        <TableCell className="text-center tabular-nums">{formatNumber(r.concluidas)}</TableCell>
                        <TableCell className={cn("text-center tabular-nums", r.atrasadas > 0 && "font-semibold text-destructive")}>
                          {formatNumber(r.atrasadas)}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">{formatNumber(r.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>{t("common.total")}</TableCell>
                      <TableCell className="text-center tabular-nums">{formatNumber(totals.pendentes)}</TableCell>
                      <TableCell className="text-center tabular-nums">{formatNumber(totals.concluidas)}</TableCell>
                      <TableCell className="text-center tabular-nums">{formatNumber(totals.atrasadas)}</TableCell>
                      <TableCell className="text-center tabular-nums">{formatNumber(totals.total)}</TableCell>
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
