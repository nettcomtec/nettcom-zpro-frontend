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
import { useAuthStore } from "@/stores/auth-store";
import { printReportTable } from "@/lib/print-report";
import { formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { format, sub } from "date-fns";
import {
  AlertCircle, Download, FileText, Lock, Printer, RefreshCw, Target, Trophy,
} from "lucide-react";
import {
  fetchActionsUntilSaleReport,
  type ActionsUntilSaleReport,
} from "@/services/reports";
import { fetchAllUsers, type User } from "@/services/users";

const ALL_USERS = "all";

type LoadStatus = "idle" | "loading" | "ok" | "error" | "unavailable";

// Nome de aba do XLSX: até 31 caracteres e sem \ / ? * [ ] :
function sheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

function fmtAverage(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatNumber(n, { maximumFractionDigits: 2 });
}

export default function RelatorioAcoesAteVendaPage() {
  const t = useTranslations("relationshipReports");
  const tProd = useTranslations("produtividadeDiariaPage");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  // Cruza os registros de relacionamento com as vendas do funil: exige os dois recursos.
  const featureOn = useAuthStore((s) => s.hasFeature("relationship") && s.hasFeature("funnelKanban"));

  const [dateStart, setDateStart] = useState(format(sub(new Date(), { days: 30 }), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [userId, setUserId] = useState<string>(ALL_USERS);
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<ActionsUntilSaleReport | null>(null);
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
        const res = await fetchActionsUntilSaleReport({
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
        key: String(r.typeId),
        tipo: r.typeName || `#${r.typeId}`,
        total: Number(r.total || 0),
        media: Number(r.average || 0),
      })),
    [data]
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(rows, "total", "desc");

  const opportunities = Number(data?.opportunities || 0);
  const totalActions = useMemo(() => rows.reduce((sum, r) => sum + r.total, 0), [rows]);
  // Média geral = todas as ações ÷ vendas do período (null sem venda).
  const overallAverage = opportunities > 0 ? totalActions / opportunities : null;

  const hasRows = status === "ok" && rows.length > 0;

  const headers = [t("actionsUntilSale.colType"), t("actionsUntilSale.colTotal"), t("actionsUntilSale.colAverage")];
  const matrix = () => [
    ...sortedData.map((r) => [r.tipo, formatNumber(r.total), fmtAverage(r.media)]),
    [t("common.total"), formatNumber(totalActions), fmtAverage(overallAverage)],
  ];

  const handleExportXlsx = async () => {
    if (!hasRows) return;
    try {
      const mod = await import("xlsx");
      const XLSX = mod.default ?? mod;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          [t("actionsUntilSale.opportunitiesCount", { count: opportunities })],
          [],
          headers,
          ...sortedData.map((r) => [r.tipo, r.total, r.media]),
          [t("common.total"), totalActions, overallAverage ?? ""],
        ]),
        sheetName(t("actionsUntilSale.title"))
      );
      XLSX.writeFile(wb, `Acoes-ate-a-Venda-${dateStart}_${dateEnd}.xlsx`);
      toast.success(tProd("toastExportSuccess"));
    } catch {
      toast.error(tProd("toastExportError"));
    }
  };

  const handleExportCsv = () => {
    if (!hasRows) return;
    const csv = [headers, ...matrix()]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Acoes-ate-a-Venda-${dateStart}_${dateEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tProd("toastExportSuccess"));
  };

  const handlePrint = () => {
    if (!hasRows) return;
    if (
      !printReportTable({
        title: `${t("actionsUntilSale.title")} - ${t("actionsUntilSale.opportunitiesCount", { count: opportunities })}`,
        headers,
        rows: matrix(),
      })
    ) {
      toast.error(tProd("toastExportError"));
    }
  };

  if (!allowed) return <AccessDenied />;

  const pageHelp: PageHelpProps = {
    description: t("actionsUntilSale.helpDesc"),
    sections: [{ title: t("actionsUntilSale.helpS0T"), items: [t("actionsUntilSale.helpS0I0")] }],
  };
  const header = (
    <PageHeader title={t("actionsUntilSale.title")} description={t("actionsUntilSale.description")} help={pageHelp} />
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
            <Button variant="outline" onClick={handlePrint} disabled={!hasRows}>
              <Printer className="mr-2 h-4 w-4" />
              {t("common.print")}
            </Button>
            <Button variant="outline" onClick={handleExportXlsx} disabled={!hasRows}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.exportXlsx")}
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={!hasRows}>
              <FileText className="mr-2 h-4 w-4" />
              {t("common.exportCsv")}
            </Button>
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
      ) : (
        <>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <Trophy className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">
                {t("actionsUntilSale.opportunitiesCount", { count: opportunities })}
              </p>
            </CardContent>
          </Card>

          {!hasRows ? (
            <EmptyState icon={Target} title={t("common.noData")} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="max-h-[560px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <SortableTableHead sortKey="tipo" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("actionsUntilSale.colType")}</SortableTableHead>
                        <SortableTableHead sortKey="total" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("actionsUntilSale.colTotal")}</SortableTableHead>
                        <SortableTableHead sortKey="media" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("actionsUntilSale.colAverage")}</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedData.map((r) => (
                        <TableRow key={r.key} className="odd:bg-muted/30">
                          <TableCell className="font-medium">{r.tipo}</TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">{formatNumber(r.total)}</TableCell>
                          <TableCell className="text-center tabular-nums">{fmtAverage(r.media)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell>{t("common.total")}</TableCell>
                        <TableCell className="text-center tabular-nums">{formatNumber(totalActions)}</TableCell>
                        <TableCell className="text-center tabular-nums">{fmtAverage(overallAverage)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
