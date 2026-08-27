"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Filter, RefreshCw, ChevronDown, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { fetchReportContacts } from "@/services/reports";
import { fetchKanbans } from "@/services/kanban";
import { printReportTable } from "@/lib/print-report";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";

interface KanbanOption {
  id: number;
  name: string;
  color?: string;
}

interface ContactRow {
  id: number;
  name: string;
  number: string;
  email?: string;
  kanban?: number | string;
}

export default function RelatorioContatosKanbanPage() {
  const t = useTranslations("relatoriosContatosKanbanPage");
  const tFunil = useTranslations("funil");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  const { isLiveMode } = useLiveMode();
  const [loading, setLoading] = useState(false);
  const [loadingKanbans, setLoadingKanbans] = useState(false);
  const [kanbans, setKanbans] = useState<KanbanOption[]>([]);
  const [selectedKanbans, setSelectedKanbans] = useState<number[]>([]);
  const [data, setData] = useState<ContactRow[]>([]);

  // Contact.kanban stores the kanban id; map it back to the kanban name so the
  // report shows "Vendas (#3)" instead of just "Kanban ID #3".
  const kanbanNameById = useMemo(
    () => new Map(kanbans.map((k) => [Number(k.id), k.name])),
    [kanbans]
  );
  const kanbanLabel = (kanban: number | string | undefined) => {
    if (!kanban) return "N/A";
    const name = kanbanNameById.get(Number(kanban));
    return name ? `${name} (#${kanban})` : `Kanban ID #${kanban}`;
  };

  const loadKanbans = useCallback(async () => {
    setLoadingKanbans(true);
    try {
      const res = await fetchKanbans();
      const raw = res.data as KanbanOption[] | { kanban?: KanbanOption[] };
      const list: KanbanOption[] = Array.isArray(raw)
        ? raw
        : (raw as { kanban?: KanbanOption[] }).kanban ?? [];
      setKanbans(list);
    } catch {
      toast.error(t("toastErrorKanbans"));
    } finally {
      setLoadingKanbans(false);
    }
  }, []);

  useEffect(() => {
    loadKanbans();
  }, [loadKanbans]);

  if (!allowed) return <AccessDenied />;

  const handleFilter = async () => {
    if (selectedKanbans.length === 0) {
      toast.error(t("toastSelectKanban"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetchReportContacts({ kanban: selectedKanbans });
      const raw = res.data as { contacts?: ContactRow[] } | ContactRow[];
      const result: ContactRow[] = Array.isArray(raw)
        ? raw
        : (raw as { contacts?: ContactRow[] }).contacts ?? [];
      setData(result);
      if (result.length === 0) toast.info(t("toastNoContacts"));
    } catch {
      toast.error(t("toastErrorContacts"));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (data.length === 0) {
      toast.error(t("toastNoData"));
      return;
    }
    try {
      const mod = await import("xlsx");
      const XLSX = mod.default ?? mod;
      const exportData = data.map((d) => ({
        [t("colNome")]: d.name ?? "N/A",
        [t("colWhatsApp")]: d.number ?? "N/A",
        [t("colEmail")]: d.email ?? "N/A",
        [t("colKanban")]: kanbanLabel(d.kanban),
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t("sheetName"));
      XLSX.writeFile(wb, "Contatos-por-Kanban.xlsx");
      toast.success(t("toastExportSuccess"));
    } catch {
      toast.error(t("toastExportError"));
    }
  };

  const selectedLabels = kanbans
    .filter((k) => selectedKanbans.includes(k.id))
    .map((k) => k.name);

  const handlePrint = () => {
    if (data.length === 0) {
      toast.error(t("toastNoData"));
      return;
    }
    const headers = [t("colNome"), t("colWhatsApp"), t("colEmail"), t("colKanban")];
    const rows = data.map((d) => [
      d.name ?? "N/A",
      d.number ?? "N/A",
      d.email ?? "N/A",
      kanbanLabel(d.kanban),
    ]);
    if (!printReportTable({ title: t("title"), headers, rows })) {
      toast.error(t("toastExportError"));
    }
  };

  const handleExportCsv = () => {
    if (data.length === 0) {
      toast.error(t("toastNoData"));
      return;
    }
    const headers = [t("colNome"), t("colWhatsApp"), t("colEmail"), t("colKanban")];
    const rows = data.map((d) => [
      d.name ?? "N/A",
      d.number ?? "N/A",
      d.email ?? "N/A",
      kanbanLabel(d.kanban),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Contatos-por-Kanban.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("toastExportSuccess"));
  };

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
              <Label>{t("labelKanban")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="justify-between min-w-[220px] h-9 text-left font-normal"
                    disabled={loadingKanbans}
                  >
                    <span className="truncate text-sm">
                      {loadingKanbans
                        ? t("carregando")
                        : selectedLabels.length > 0
                        ? selectedLabels.join(", ")
                        : t("placeholderKanban")}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-60 overflow-y-auto w-64">
                  {kanbans.map((k) => (
                    <DropdownMenuCheckboxItem
                      key={k.id}
                      checked={selectedKanbans.includes(k.id)}
                      onCheckedChange={(checked) => {
                        setSelectedKanbans(
                          checked
                            ? [...selectedKanbans, k.id]
                            : selectedKanbans.filter((id) => id !== k.id)
                        );
                      }}
                    >
                      <span className="flex items-center gap-2">
                        {k.color && (
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ backgroundColor: k.color }}
                          />
                        )}
                        {k.name}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {selectedLabels.length > 0 && (
              <div className="flex flex-wrap gap-1 items-center">
                {selectedLabels.map((label, i) => (
                  <Badge key={i} variant="secondary">{label}</Badge>
                ))}
              </div>
            )}

            <Button onClick={handleFilter} disabled={loading || selectedKanbans.length === 0}>
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
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>{t("colNome")}</TableHead>
                    <TableHead>{t("colWhatsApp")}</TableHead>
                    <TableHead>{t("colEmail")}</TableHead>
                    <TableHead>{t("colKanban")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((d, idx) => (
                    <TableRow key={d.id ?? idx}>
                      <TableCell className={cn("font-medium", isLiveMode && "live-blur-text")}>{d.name ?? "N/A"}</TableCell>
                      <TableCell className={cn(isLiveMode && "live-blur-text")}>{d.number ?? "N/A"}</TableCell>
                      <TableCell className={cn("text-muted-foreground", isLiveMode && "live-blur-text")}>{d.email ?? "N/A"}</TableCell>
                      <TableCell>{kanbanLabel(d.kanban)}</TableCell>

                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
