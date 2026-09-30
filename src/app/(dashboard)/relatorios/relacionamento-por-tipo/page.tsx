"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertCircle, Download, FileText, Handshake, Lock, Printer, RefreshCw,
} from "lucide-react";
import {
  fetchRelationshipByTypeReport,
  type RelationshipByTypeReport,
} from "@/services/reports";
import { fetchAllUsers, type User } from "@/services/users";

const ALL_USERS = "all";

type LoadStatus = "idle" | "loading" | "ok" | "error" | "unavailable";

// Nome de aba do XLSX: até 31 caracteres e sem \ / ? * [ ] :
function sheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

export default function RelatorioRelacionamentoPorTipoPage() {
  const t = useTranslations("relationshipReports");
  const tProd = useTranslations("produtividadeDiariaPage");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  const featureOn = useAuthStore((s) => s.hasFeature("relationship"));
  const { isLiveMode } = useLiveMode();

  const [dateStart, setDateStart] = useState(format(sub(new Date(), { days: 30 }), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [userId, setUserId] = useState<string>(ALL_USERS);
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<RelationshipByTypeReport | null>(null);
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
        const res = await fetchRelationshipByTypeReport({
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

  const userLabel = useCallback(
    (id: number | null | undefined, name: string | null | undefined) =>
      id == null ? t("common.noUser") : name || `#${id}`,
    [t]
  );

  const rows = useMemo(
    () =>
      (data?.rows || []).map((r) => ({
        key: `${r.typeId}-${r.userId ?? "none"}`,
        tipo: r.typeName || `#${r.typeId}`,
        atendente: userLabel(r.userId, r.userName),
        quantidade: Number(r.count || 0),
      })),
    [data, userLabel]
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(rows, "quantidade", "desc");

  const totalsByType = useMemo(
    () =>
      [...(data?.totalsByType || [])]
        .map((r) => ({ key: String(r.typeId), tipo: r.typeName || `#${r.typeId}`, quantidade: Number(r.count || 0) }))
        .sort((a, b) => b.quantidade - a.quantidade),
    [data]
  );

  const total = Number(data?.total || 0);
  const hasData = status === "ok" && (rows.length > 0 || total > 0);

  const headers = [t("byType.colType"), t("byType.colUser"), t("byType.colCount")];
  const matrix = () => sortedData.map((r) => [r.tipo, r.atendente, formatNumber(r.quantidade)]);

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
          ...sortedData.map((r) => [r.tipo, r.atendente, r.quantidade]),
          [t("common.total"), "", total],
        ]),
        sheetName(t("byType.title"))
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          [t("byType.colType"), t("byType.colCount")],
          ...totalsByType.map((r) => [r.tipo, r.quantidade]),
          [t("common.total"), total],
        ]),
        sheetName(t("byType.totalsTitle"))
      );
      XLSX.writeFile(wb, `Relacionamento-por-Tipo-${dateStart}_${dateEnd}.xlsx`);
      toast.success(tProd("toastExportSuccess"));
    } catch {
      toast.error(tProd("toastExportError"));
    }
  };

  const handleExportCsv = () => {
    if (!hasData) return;
    const csv = [headers, ...matrix(), [t("common.total"), "", formatNumber(total)]]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Relacionamento-por-Tipo-${dateStart}_${dateEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tProd("toastExportSuccess"));
  };

  const handlePrint = () => {
    if (!hasData) return;
    if (
      !printReportTable({
        title: t("byType.title"),
        headers,
        rows: [...matrix(), [t("common.total"), "", formatNumber(total)]],
      })
    ) {
      toast.error(tProd("toastExportError"));
    }
  };

  if (!allowed) return <AccessDenied />;

  const pageHelp: PageHelpProps = {
    description: t("byType.helpDesc"),
    sections: [{ title: t("byType.helpS0T"), items: [t("byType.helpS0I0")] }],
  };
  const header = (
    <PageHeader title={t("byType.title")} description={t("byType.description")} help={pageHelp} />
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
        <EmptyState icon={Handshake} title={t("common.noData")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("byType.totalsTitle")}</CardTitle>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t("common.total")}</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(total)}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {totalsByType.map((r) => {
                const pct = total > 0 ? Math.min(100, (r.quantidade / total) * 100) : 0;
                return (
                  <div key={r.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{r.tipo}</span>
                      <span className="shrink-0 font-medium tabular-nums">{formatNumber(r.quantidade)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("byType.title")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[560px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <SortableTableHead sortKey="tipo" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("byType.colType")}</SortableTableHead>
                      <SortableTableHead sortKey="atendente" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("byType.colUser")}</SortableTableHead>
                      <SortableTableHead sortKey="quantidade" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("byType.colCount")}</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((r) => (
                      <TableRow key={r.key} className="odd:bg-muted/30">
                        <TableCell className="font-medium">{r.tipo}</TableCell>
                        <TableCell className={cn("text-muted-foreground", isLiveMode && "live-blur-text")}>
                          {r.atendente}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">{formatNumber(r.quantidade)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={2}>{t("common.total")}</TableCell>
                      <TableCell className="text-center tabular-nums">{formatNumber(total)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
