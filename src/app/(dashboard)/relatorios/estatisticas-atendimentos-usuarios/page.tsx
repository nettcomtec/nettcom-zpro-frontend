"use client";

import React, { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresets } from "@/components/ui/date-range-presets";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableFooter, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Filter, RefreshCw, X, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { fetchReportUserStats } from "@/services/reports";
import { formatDuration } from "@/services/dashboard";
import { printReportTable } from "@/lib/print-report";
import { sub, format } from "date-fns";
import { usePageAccess } from "@/hooks/use-page-access";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface UserStat {
  name?: string;
  email?: string;
  qtd_pendentes?: number;
  qtd_em_atendimento?: number;
  qtd_resolvidos?: number;
  qtd_por_usuario?: number;
  tma?: { hours?: number; minutes?: number; seconds?: number } | null;
  tme?: { hours?: number; minutes?: number; seconds?: number } | null;
  // fallback fields some APIs may return
  userId?: number;
  userName?: string;
  totalTickets?: number;
  openTickets?: number;
  closedTickets?: number;
}

// {hours, minutes, seconds} → minutos totais (fração inclui segundos), ou null
// quando a métrica não existe.
function toMinutes(d?: { hours?: number; minutes?: number; seconds?: number } | null): number | null {
  if (!d) return null;
  return (d.hours ?? 0) * 60 + (d.minutes ?? 0) + (d.seconds ?? 0) / 60;
}

function minutesToHM(min: number): { hours: number; minutes: number; seconds: number } {
  const totalSec = Math.round(min * 60);
  return {
    hours: Math.floor(totalSec / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

export default function RelatorioEstatisticasPage() {
  const t = useTranslations("relatoriosEstatisticasPage");
  const tPerf = useTranslations("performanceTable");
  const tFunil = useTranslations("funil");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  const [loading, setLoading] = useState(false);
  const [dateStart, setDateStart] = useState(
    format(sub(new Date(), { days: 30 }), "yyyy-MM-dd")
  );
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [data, setData] = useState<UserStat[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Subset exibido (respeita o filtro ativo do gráfico por usuário).
  const displayData = useMemo(
    () =>
      activeFilter
        ? data.filter((d) => (d.name ?? d.userName ?? "") === activeFilter)
        : data,
    [data, activeFilter]
  );

  // Linhas decoradas para ordenação client-side: contagens/durações viram números
  // (o comparador do useSortable é exato em inteiros); textos ficam string
  // (locale-aware); null vai para o fim. TME/TMA nulos ordenam como 0 (a coluna
  // exibe "0min" nesses casos). Padrão inicial: Resolvidos desc.
  const sortableRows = useMemo(
    () =>
      displayData.map((d) => ({
        stat: d,
        nome: d.name ?? d.userName ?? null,
        email: d.email ?? null,
        pendentes: Number(d.qtd_pendentes ?? d.openTickets ?? 0),
        emAtendimento: Number(d.qtd_em_atendimento ?? 0),
        resolvidos: Number(d.qtd_resolvidos ?? d.closedTickets ?? 0),
        total: Number(d.qtd_por_usuario ?? d.totalTickets ?? 0),
        tme: toMinutes(d.tme) ?? 0,
        tma: toMinutes(d.tma) ?? 0,
      })),
    [displayData]
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(sortableRows, "resolvidos", "desc");

  if (!allowed) return <AccessDenied />;

  const handleFilter = async (s: string = dateStart, e: string = dateEnd) => {
    if (!s || !e) {
      toast.error(t("toastSelectDates"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetchReportUserStats({ startDate: s, endDate: e });
      // API may return array directly or wrapped
      const raw = res.data as UserStat[] | { users?: UserStat[]; data?: UserStat[] };
      const result: UserStat[] = Array.isArray(raw)
        ? raw
        : (raw as { users?: UserStat[] }).users ?? (raw as { data?: UserStat[] }).data ?? [];
      setData(result);
      if (result.length === 0) toast.info(t("toastNoData"));
    } catch {
      toast.error(t("toastErrorStats"));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (data.length === 0) {
      toast.error(t("toastNoDataExport"));
      return;
    }
    try {
      const mod = await import("xlsx");
      const XLSX = mod.default ?? mod;
      const exportData = data.map((d) => ({
        [t("colNome")]: d.name ?? d.userName ?? "N/A",
        [t("colEmail")]: d.email ?? "N/A",
        [t("colPendentes")]: Number(d.qtd_pendentes ?? d.openTickets ?? 0),
        [t("colEmAtendimento")]: Number(d.qtd_em_atendimento ?? 0),
        [t("colResolvidos")]: Number(d.qtd_resolvidos ?? d.closedTickets ?? 0),
        [t("colTotal")]: Number(d.qtd_por_usuario ?? d.totalTickets ?? 0),
        [tPerf("colTME")]: formatDuration(d.tme),
        [tPerf("colTMA")]: formatDuration(d.tma),
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t("sheetName"));
      XLSX.writeFile(wb, "Resumo-Atendimentos-Usuarios.xlsx");
      toast.success(t("toastExportSuccess"));
    } catch {
      toast.error(t("toastExportError"));
    }
  };

  const handlePrint = () => {
    if (data.length === 0) {
      toast.error(t("toastNoDataExport"));
      return;
    }
    const headers = [t("colNome"), t("colEmail"), t("colPendentes"), t("colEmAtendimento"), t("colResolvidos"), t("colTotal"), tPerf("colTME"), tPerf("colTMA")];
    const rows = data.map((d) => [
      d.name ?? d.userName ?? "N/A",
      d.email ?? "N/A",
      String(d.qtd_pendentes ?? d.openTickets ?? 0),
      String(d.qtd_em_atendimento ?? 0),
      String(d.qtd_resolvidos ?? d.closedTickets ?? 0),
      String(d.qtd_por_usuario ?? d.totalTickets ?? 0),
      formatDuration(d.tme),
      formatDuration(d.tma),
    ]);
    if (!printReportTable({ title: t("title"), headers, rows })) {
      toast.error(t("toastExportError"));
    }
  };

  const handleExportCsv = () => {
    const filtered = activeFilter
      ? data.filter((d) => (d.name ?? d.userName ?? "") === activeFilter)
      : data;
    if (filtered.length === 0) {
      toast.error(t("toastNoDataExport"));
      return;
    }
    const headers = [t("colNome"), t("colEmail"), t("colPendentes"), t("colEmAtendimento"), t("colResolvidos"), t("colTotal"), tPerf("colTME"), tPerf("colTMA")];
    const rows = filtered.map((d) => [
      d.name ?? d.userName ?? "N/A",
      d.email ?? "N/A",
      String(d.qtd_pendentes ?? d.openTickets ?? 0),
      String(d.qtd_em_atendimento ?? 0),
      String(d.qtd_resolvidos ?? d.closedTickets ?? 0),
      String(d.qtd_por_usuario ?? d.totalTickets ?? 0),
      formatDuration(d.tme),
      formatDuration(d.tma),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Resumo-Atendimentos-Usuarios.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("toastExportSuccess"));
  };

  const chartData = data.map((d) => ({
    name: d.name ?? d.userName ?? "N/A",
    total: Number(d.qtd_por_usuario ?? d.totalTickets ?? 0),
  }));

  // Rodapé: SOMA para contagens; MÉDIA para TME/TMA (nunca soma de duração),
  // calculada apenas sobre usuários que possuem a métrica no período.
  // Number(): a API pode entregar contagens como string (COUNT bigint no
  // driver pg) — sem coerção o += concatena em vez de somar.
  const totals = (() => {
    let pendentes = 0;
    let emAtendimento = 0;
    let resolvidos = 0;
    let total = 0;
    const tmeVals: number[] = [];
    const tmaVals: number[] = [];
    displayData.forEach((d) => {
      pendentes += Number(d.qtd_pendentes ?? d.openTickets ?? 0);
      emAtendimento += Number(d.qtd_em_atendimento ?? 0);
      resolvidos += Number(d.qtd_resolvidos ?? d.closedTickets ?? 0);
      total += Number(d.qtd_por_usuario ?? d.totalTickets ?? 0);
      const tme = toMinutes(d.tme);
      const tma = toMinutes(d.tma);
      if (tme !== null) tmeVals.push(tme);
      if (tma !== null) tmaVals.push(tma);
    });
    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    return { pendentes, emAtendimento, resolvidos, total, tmeAvg: avg(tmeVals), tmaAvg: avg(tmaVals) };
  })();

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} description={t("description")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }} />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t("title")}</CardTitle>
            {data.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <FileText className="mr-2 h-3.5 w-3.5" />
                {tFunil("exportCSV")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label>{t("labelDataInicio")}</Label>
              <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t("labelDataFim")}</Label>
              <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>
            <DateRangePresets onSelect={(s, e) => { setDateStart(s); setDateEnd(e); handleFilter(s, e); }} />
            <Button onClick={() => handleFilter()} disabled={loading}>
              {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("btnGerar")}
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={data.length === 0}>
              <Printer className="mr-2 h-4 w-4" />
              {t("btnImprimir")}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={data.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {t("btnExportar")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-[300px]" />
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Filter className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("nenhumDado")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("emptyHint")}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Chart: atendimentos por usuário — clique filtra a tabela */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("chartByUserTitle")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("chartClickHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                    onClick={(e) => {
                      if (e && e.activePayload && e.activePayload.length > 0) {
                        const clickedName = (e.activePayload[0].payload as { name: string }).name;
                        setActiveFilter((prev) => prev === clickedName ? null : clickedName);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => [value, t("colTotal")]}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={36}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={activeFilter === entry.name ? "hsl(220, 70%, 40%)" : "hsl(220, 70%, 50%)"}
                          opacity={activeFilter && activeFilter !== entry.name ? 0.45 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Active filter chip */}
          {activeFilter && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("activeFilterLabel")}</span>
              <Badge variant="secondary" className="flex items-center gap-1 pr-1">
                {activeFilter}
                <button
                  onClick={() => setActiveFilter(null)}
                  className="ml-1 rounded-full hover:bg-muted p-0.5"
                  aria-label={t("clearFilter")}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
              <span className="text-xs text-muted-foreground">
                ({t("recordsCount", { count: displayData.length })})
              </span>
            </div>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <SortableTableHead sortKey="nome" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colNome")}</SortableTableHead>
                      <SortableTableHead sortKey="email" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colEmail")}</SortableTableHead>
                      <SortableTableHead sortKey="pendentes" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colPendentes")}</SortableTableHead>
                      <SortableTableHead sortKey="emAtendimento" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colEmAtendimento")}</SortableTableHead>
                      <SortableTableHead sortKey="resolvidos" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colResolvidos")}</SortableTableHead>
                      <SortableTableHead sortKey="total" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{t("colTotal")}</SortableTableHead>
                      <SortableTableHead sortKey="tme" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{tPerf("colTME")}</SortableTableHead>
                      <SortableTableHead sortKey="tma" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center [&>button]:justify-center">{tPerf("colTMA")}</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map(({ stat: d }, idx) => (
                      <TableRow key={d.userId ?? idx} className="odd:bg-muted/30">
                        <TableCell className="font-medium">{d.name ?? d.userName ?? "N/A"}</TableCell>
                        <TableCell className="text-muted-foreground">{d.email ?? "N/A"}</TableCell>
                        <TableCell className="text-center">{d.qtd_pendentes ?? d.openTickets ?? 0}</TableCell>
                        <TableCell className="text-center">{d.qtd_em_atendimento ?? 0}</TableCell>
                        <TableCell className="text-center">{d.qtd_resolvidos ?? d.closedTickets ?? 0}</TableCell>
                        <TableCell className="text-center font-semibold">{d.qtd_por_usuario ?? d.totalTickets ?? 0}</TableCell>
                        <TableCell className="text-center">{formatDuration(d.tme)}</TableCell>
                        <TableCell className="text-center">{formatDuration(d.tma)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {displayData.length > 0 && (
                    <TableFooter>
                      <TableRow className="font-semibold bg-muted/40">
                        <TableCell colSpan={2} className="text-sm">
                          {tPerf("footerTotals")}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({t("recordsCount", { count: displayData.length })})
                          </span>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{totals.pendentes}</TableCell>
                        <TableCell className="text-center tabular-nums">{totals.emAtendimento}</TableCell>
                        <TableCell className="text-center tabular-nums">{totals.resolvidos}</TableCell>
                        <TableCell className="text-center tabular-nums">{totals.total}</TableCell>
                        <TableCell className="text-center">
                          <span className="block text-[10px] font-normal text-muted-foreground">{tPerf("footerAvg")}</span>
                          {totals.tmeAvg !== null ? formatDuration(minutesToHM(totals.tmeAvg)) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="block text-[10px] font-normal text-muted-foreground">{tPerf("footerAvg")}</span>
                          {totals.tmaAvg !== null ? formatDuration(minutesToHM(totals.tmaAvg)) : "—"}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
