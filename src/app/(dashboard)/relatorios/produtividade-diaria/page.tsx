"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePresets } from "@/components/ui/date-range-presets";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortable } from "@/hooks/use-sortable";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/layout/access-denied";
import { usePageAccess } from "@/hooks/use-page-access";
import { printReportTable } from "@/lib/print-report";
import { toast } from "sonner";
import { format, sub } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  CalendarClock, Download, FileText, Info, Printer, RefreshCw,
} from "lucide-react";
import {
  fetchDailyProductivity,
  type DailyProductivityReport,
} from "@/services/reports";
import { fetchAllUsers, type User } from "@/services/users";

const ALL_USERS = "all";

// "YYYY-MM-DD" (dia local, como vem da API) -> data formatada no locale do
// navegador. O sufixo T00:00:00 evita o parse como UTC (que voltaria um dia).
function fmtDay(day: string) {
  try {
    return new Date(`${day}T00:00:00`).toLocaleDateString();
  } catch {
    return day;
  }
}

export default function RelatorioProdutividadeDiariaPage() {
  const t = useTranslations("produtividadeDiariaPage");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });

  const [dateStart, setDateStart] = useState(format(sub(new Date(), { days: 6 }), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [userId, setUserId] = useState<string>(ALL_USERS);
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<DailyProductivityReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (s: string = dateStart, e: string = dateEnd, u: string = userId) => {
      if (!s || !e) {
        toast.error(t("toastSelectDates"));
        return;
      }
      setLoading(true);
      try {
        const res = await fetchDailyProductivity({
          startDate: s,
          endDate: e,
          userId: u !== ALL_USERS ? Number(u) : undefined,
        });
        setData(res.data);
        if (!res.data?.byUser?.length) toast.info(t("toastNoData"));
      } catch {
        toast.error(t("toastError"));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateStart, dateEnd, userId]
  );

  useEffect(() => {
    if (!allowed) return;
    load();
    fetchAllUsers()
      .then((res) => setUsers(res.data?.users || []))
      .catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const userOptions = useMemo(
    () => [
      { value: ALL_USERS, label: t("optionTodos") },
      ...users.map((u) => ({ value: String(u.id), label: u.name || u.email })),
    ],
    [users, t]
  );

  // Linhas do resumo por atendente, decoradas para ordenação client-side.
  const summaryRows = useMemo(
    () =>
      (data?.byUser || []).map((u) => ({
        row: u,
        nome: u.name || `#${u.userId}`,
        email: u.email || "",
        atendimentos: Number(u.attended || 0),
        iniciados: Number(u.started || 0),
        resolvidos: Number(u.resolved || 0),
        mensagens: Number(u.messages || 0),
        diasAtivos: Number(u.activeDays || 0),
        mediaDia: u.activeDays > 0 ? Number(u.attended || 0) / u.activeDays : 0,
      })),
    [data]
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(summaryRows, "atendimentos", "desc");

  // Série do gráfico: total de atendimentos por dia (soma dos atendentes).
  const chartData = useMemo(() => {
    const byDay = new Map<string, number>();
    (data?.byDay || []).forEach((r) => {
      byDay.set(r.day, (byDay.get(r.day) || 0) + Number(r.attended || 0));
    });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, attended]) => ({ day: fmtDay(day), attended }));
  }, [data]);

  const detailRows = data?.byDay || [];
  const hasData = (data?.byUser?.length || 0) > 0 || detailRows.length > 0;

  const summaryHeaders = [
    t("colAtendente"), t("colEmail"), t("colAtendimentos"), t("colIniciados"),
    t("colResolvidos"), t("colMensagens"), t("colDiasAtivos"), t("colMediaDia"),
  ];
  const summaryMatrix = () =>
    summaryRows.map((r) => [
      r.nome, r.email, String(r.atendimentos), String(r.iniciados), String(r.resolvidos),
      String(r.mensagens), String(r.diasAtivos), r.diasAtivos > 0 ? r.mediaDia.toFixed(1) : "—",
    ]);

  const detailHeaders = [
    t("colDia"), t("colAtendente"), t("colEmail"), t("colAtendimentos"),
    t("colIniciados"), t("colResolvidos"), t("colMensagens"),
  ];
  const detailMatrix = () =>
    detailRows.map((r) => [
      fmtDay(r.day), r.name || `#${r.userId}`, r.email || "",
      String(r.attended), String(r.started), String(r.resolved), String(r.messages),
    ]);

  const handleExportXlsx = async () => {
    if (!hasData) {
      toast.error(t("toastNoDataExport"));
      return;
    }
    try {
      const mod = await import("xlsx");
      const XLSX = mod.default ?? mod;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryMatrix()]),
        t("sheetSummary")
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([detailHeaders, ...detailMatrix()]),
        t("sheetDetail")
      );
      XLSX.writeFile(wb, `Produtividade-Diaria-${dateStart}_${dateEnd}.xlsx`);
      toast.success(t("toastExportSuccess"));
    } catch {
      toast.error(t("toastExportError"));
    }
  };

  const handleExportCsv = () => {
    if (!hasData) {
      toast.error(t("toastNoDataExport"));
      return;
    }
    const csv = [detailHeaders, ...detailMatrix()]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Produtividade-Diaria-${dateStart}_${dateEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("toastExportSuccess"));
  };

  const handlePrint = () => {
    if (!hasData) {
      toast.error(t("toastNoDataExport"));
      return;
    }
    if (!printReportTable({ title: t("title"), headers: summaryHeaders, rows: summaryMatrix() })) {
      toast.error(t("toastExportError"));
    }
  };

  if (!allowed) return <AccessDenied />;

  const totals = data?.totals;

  const kpis = [
    { key: "attended", label: t("kpiAtendimentos"), hint: t("kpiAtendimentosHint"), value: totals?.attended ?? 0 },
    { key: "started", label: t("kpiIniciados"), hint: t("kpiIniciadosHint"), value: totals?.started ?? 0 },
    { key: "resolved", label: t("kpiResolvidos"), hint: t("kpiResolvidosHint"), value: totals?.resolved ?? 0 },
    { key: "messages", label: t("kpiMensagens"), hint: t("kpiMensagensHint"), value: totals?.messages ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label className="text-xs">{t("labelDataInicio")}</Label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">{t("labelDataFim")}</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">{t("labelAtendente")}</Label>
              <SearchableSelect
                options={userOptions}
                value={userId}
                onValueChange={(v) => setUserId(v || ALL_USERS)}
                placeholder={t("optionTodos")}
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
            <Button onClick={() => load()} disabled={loading}>
              <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
              {t("btnGerar")}
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!hasData}>
              <Printer className="mr-2 h-4 w-4" />
              {t("btnImprimir")}
            </Button>
            <Button variant="outline" onClick={handleExportXlsx} disabled={!hasData}>
              <Download className="mr-2 h-4 w-4" />
              {t("btnExportar")}
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={!hasData}>
              <FileText className="mr-2 h-4 w-4" />
              {t("btnExportarCsv")}
            </Button>
          </div>

          <div className="flex gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t("noteText")}</p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-[320px] w-full" />
      ) : !hasData ? (
        <EmptyState icon={CalendarClock} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.key}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
                  <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{k.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("chartTitle")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("chartHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => [value, t("colAtendimentos")]}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Bar dataKey="attended" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill="hsl(220, 70%, 50%)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("summaryTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="nome" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colAtendente")}</SortableTableHead>
                      <SortableTableHead sortKey="email" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colEmail")}</SortableTableHead>
                      <SortableTableHead sortKey="atendimentos" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colAtendimentos")}</SortableTableHead>
                      <SortableTableHead sortKey="iniciados" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colIniciados")}</SortableTableHead>
                      <SortableTableHead sortKey="resolvidos" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colResolvidos")}</SortableTableHead>
                      <SortableTableHead sortKey="mensagens" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colMensagens")}</SortableTableHead>
                      <SortableTableHead sortKey="diasAtivos" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colDiasAtivos")}</SortableTableHead>
                      <SortableTableHead sortKey="mediaDia" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colMediaDia")}</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map(({ row, ...r }) => (
                      <TableRow key={row.userId} className="odd:bg-muted/30">
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">{r.atendimentos}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.iniciados}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.resolvidos}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.mensagens}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.diasAtivos}</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {r.diasAtivos > 0 ? r.mediaDia.toFixed(1) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {summaryRows.length > 0 && (
                    <TableFooter>
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell colSpan={2} className="text-sm">
                          {t("footerTotals")}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({t("recordsCount", { count: summaryRows.length })})
                          </span>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{totals?.attended ?? 0}</TableCell>
                        <TableCell className="text-center tabular-nums">{totals?.started ?? 0}</TableCell>
                        <TableCell className="text-center tabular-nums">{totals?.resolved ?? 0}</TableCell>
                        <TableCell className="text-center tabular-nums">{totals?.messages ?? 0}</TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("detailTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-32">{t("colDia")}</TableHead>
                      <TableHead>{t("colAtendente")}</TableHead>
                      <TableHead className="text-center">{t("colAtendimentos")}</TableHead>
                      <TableHead className="text-center">{t("colIniciados")}</TableHead>
                      <TableHead className="text-center">{t("colResolvidos")}</TableHead>
                      <TableHead className="text-center">{t("colMensagens")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.map((r) => (
                      <TableRow key={`${r.day}-${r.userId}`} className="odd:bg-muted/30">
                        <TableCell className="whitespace-nowrap">{fmtDay(r.day)}</TableCell>
                        <TableCell className="font-medium">{r.name || `#${r.userId}`}</TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">{r.attended}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.started}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.resolved}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.messages}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
