"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { printReportTable } from "@/lib/print-report";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";

// DDD -> sigla mapping (Brazilian states)
const estadoPorDdd: Record<string, string> = {
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP",
  "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF", "62": "GO", "63": "TO", "64": "GO",
  "65": "MT", "66": "MT", "67": "MS",
  "68": "AC", "69": "RO",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE",
  "81": "PE", "87": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE", "88": "CE",
  "86": "PI", "89": "PI",
  "91": "PA", "93": "PA", "94": "PA",
  "92": "AM", "97": "AM",
  "95": "RR",
  "96": "AP",
  "98": "MA", "99": "MA",
};

const estadosBR = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

interface ContactRow {
  id: number;
  name: string;
  number: string;
  email?: string;
}

function definirEstadoNumero(numero: string): string {
  const ddd = numero.substring(2, 4);
  const sigla = estadoPorDdd[ddd];
  return estadosBR.find((e) => e.sigla === sigla)?.nome ?? "";
}

export default function RelatorioContatosEstadoPage() {
  const t = useTranslations("relatoriosContatosEstadoPage");
  const tFunil = useTranslations("funil");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  const [loading, setLoading] = useState(false);
  const [selectedDdds, setSelectedDdds] = useState<string[]>([]);
  const [data, setData] = useState<ContactRow[]>([]);

  if (!allowed) return <AccessDenied />;

  const selectedLabels = estadosBR
    .filter((e) => selectedDdds.includes(e.sigla))
    .map((e) => e.nome);

  const handlePrint = () => {
    if (data.length === 0) {
      toast.error(t("toastNoData"));
      return;
    }
    const headers = [t("colNome"), t("colWhatsApp"), t("colEmail"), t("colEstado")];
    const rows = data.map((d) => [
      d.name ?? "N/A",
      d.number ?? "N/A",
      d.email ?? "N/A",
      definirEstadoNumero(d.number ?? ""),
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
    const headers = [t("colNome"), t("colWhatsApp"), t("colEmail"), t("colEstado")];
    const rows = data.map((d) => [
      d.name ?? "N/A",
      d.number ?? "N/A",
      d.email ?? "N/A",
      definirEstadoNumero(d.number ?? ""),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Contatos-por-Estado.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("toastExportSuccess"));
  };

  const handleFilter = async () => {
    if (selectedDdds.length === 0) {
      toast.error(t("toastSelectState"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetchReportContacts({ ddds: selectedDdds });
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
        [t("colEstado")]: definirEstadoNumero(d.number ?? ""),
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t("sheetName"));
      XLSX.writeFile(wb, "Contatos-por-Estado.xlsx");
      toast.success(t("toastExportSuccess"));
    } catch {
      toast.error(t("toastExportError"));
    }
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
              <Label>{t("labelEstado")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="justify-between min-w-[220px] h-9 text-left font-normal">
                    <span className="truncate text-sm">
                      {selectedLabels.length > 0 ? selectedLabels.join(", ") : t("placeholderEstados")}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-60 overflow-y-auto w-64">
                  {estadosBR.map((e) => (
                    <DropdownMenuCheckboxItem
                      key={e.sigla}
                      checked={selectedDdds.includes(e.sigla)}
                      onCheckedChange={(checked) => {
                        setSelectedDdds(
                          checked
                            ? [...selectedDdds, e.sigla]
                            : selectedDdds.filter((s) => s !== e.sigla)
                        );
                      }}
                    >
                      {e.nome} ({e.sigla})
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Button onClick={handleFilter} disabled={loading || selectedDdds.length === 0}>
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
                    <TableHead>{t("colEstado")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((d, idx) => (
                    <TableRow key={d.id ?? idx}>
                      <TableCell className="font-medium">{d.name ?? "N/A"}</TableCell>
                      <TableCell>{d.number ?? "N/A"}</TableCell>
                      <TableCell className="text-muted-foreground">{d.email ?? "N/A"}</TableCell>
                      <TableCell>{definirEstadoNumero(d.number ?? "")}</TableCell>
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
