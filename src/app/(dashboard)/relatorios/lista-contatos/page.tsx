"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresets } from "@/components/ui/date-range-presets";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Filter, RefreshCw, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { fetchReportContacts } from "@/services/reports";
import { printReportTable } from "@/lib/print-report";
import { sub, format } from "date-fns";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";

interface ContactRow {
  id: number;
  name: string;
  number: string;
  email?: string;
  extraInfo?: Array<{ name: string; value: string }>;
}

export default function RelatorioListaContatosPage() {
  const t = useTranslations("relatoriosListaContatosPage");
  const tFunil = useTranslations("funil");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  const { isLiveMode } = useLiveMode();
  const [loading, setLoading] = useState(false);
  const [dateStart, setDateStart] = useState(
    format(sub(new Date(), { days: 30 }), "yyyy-MM-dd")
  );
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [data, setData] = useState<ContactRow[]>([]);

  if (!allowed) return <AccessDenied />;

  const handleFilter = async (s: string = dateStart, e: string = dateEnd) => {
    if (!s || !e) {
      toast.error(t("toastSelectDates"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetchReportContacts({ startDate: s, endDate: e });
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

  const formatExtraInfo = (extraInfo: Array<{ name: string; value: string }> | undefined) => {
    if (!extraInfo || extraInfo.length === 0) return t("vazio");
    return extraInfo.map((i) => `${i.name}: ${i.value}`).join(" | ");
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
        [t("colInfoExtras")]: formatExtraInfo(d.extraInfo),
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t("sheetName"));
      XLSX.writeFile(wb, "Lista-Contatos.xlsx");
      toast.success(t("toastExportSuccess"));
    } catch {
      toast.error(t("toastExportError"));
    }
  };

  const handlePrint = () => {
    if (data.length === 0) {
      toast.error(t("toastNoData"));
      return;
    }
    const headers = [t("colNome"), t("colWhatsApp"), t("colEmail"), t("colInfoExtras")];
    const rows = data.map((d) => [
      d.name ?? "N/A",
      d.number ?? "N/A",
      d.email ?? "N/A",
      formatExtraInfo(d.extraInfo),
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
    const headers = [t("colNome"), t("colWhatsApp"), t("colEmail"), t("colInfoExtras")];
    const rows = data.map((d) => [
      d.name ?? "N/A",
      d.number ?? "N/A",
      d.email ?? "N/A",
      formatExtraInfo(d.extraInfo),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Lista-Contatos.csv";
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
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>{t("colNome")}</TableHead>
                    <TableHead>{t("colWhatsApp")}</TableHead>
                    <TableHead>{t("colEmail")}</TableHead>
                    <TableHead>{t("colInfoExtras")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((d, idx) => (
                    <TableRow key={d.id ?? idx}>
                      <TableCell className={cn("font-medium", isLiveMode && "live-blur-text")}>{d.name ?? "N/A"}</TableCell>
                      <TableCell className={cn(isLiveMode && "live-blur-text")}>{d.number ?? "N/A"}</TableCell>
                      <TableCell className={cn("text-muted-foreground", isLiveMode && "live-blur-text")}>{d.email ?? "N/A"}</TableCell>
                      <TableCell className={cn("text-xs text-muted-foreground max-w-[300px] break-words", isLiveMode && "live-blur-text")}>
                        {formatExtraInfo(d.extraInfo)}
                      </TableCell>
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
