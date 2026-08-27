"use client";

import { formatDateTime } from "@/lib/format";

/**
 * RelatorioBulkDispatch — matches Vue's RelatorioBulkDispatch.vue
 *
 * Shows paginated send history with filters for status and dispatch type.
 * Clicking a row opens a details modal with general info, statistics, errors,
 * and a visual preview of the sent message.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, RotateCcw, Eye, RefreshCw, Info, ExternalLink, FileText, Mic, Image as ImageIcon, Video, CheckCircle2, XCircle, Clipboard, Download } from "lucide-react";
import { toast } from "sonner";
import {
  listDispatches,
  showDispatch,
  fetchWabaTemplates,
  getBulkDispatchReport,
  type BulkDispatch,
  type WabaTemplate,
  type WabaTemplateComponent,
} from "@/services/bulk";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";

// ─── helpers ──────────────────────────────────────────────────────────────────

const DISPATCH_TYPE_VALUES = [
  { key: "dispatchTemplate", value: "template" },
  { key: "dispatchTemplateMarketing", value: "template_marketing" },
  { key: "dispatchTemplateVariavel", value: "template_variable" },
  { key: "dispatchTemplateVariavelMarketing", value: "template_variable_marketing" },
  { key: "dispatchTexto", value: "text" },
  { key: "dispatchTextoVariavel", value: "text_variable" },
  { key: "dispatchEmail", value: "email" },
];

function getStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "destructive";
  if (status === "pending" || status === "processing") return "warning";
  return "secondary";
}

function formatDate(val?: string): string {
  if (!val) return "—";
  return formatDateTime(new Date(val));
}

function isWabaTemplate(dispatchType?: string): boolean {
  if (!dispatchType) return false;
  return (
    dispatchType === "template" ||
    dispatchType === "template_marketing" ||
    dispatchType === "template_variable" ||
    dispatchType === "template_variable_marketing"
  );
}

// ─── buildPreviewText ─────────────────────────────────────────────────────────

function buildPreviewText(text: string, variables: string[]): string {
  let result = text;
  variables.forEach((val, i) => {
    result = result.replace(
      new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"),
      val ? `*${val}*` : `{{${i + 1}}}`
    );
  });
  return result;
}

// ─── TemplatePreview ──────────────────────────────────────────────────────────

function TemplatePreview({
  template,
  variables,
  t,
}: {
  template: WabaTemplate;
  variables: string[];
  t: (key: string) => string;
}) {
  const comps: WabaTemplateComponent[] = template.components || [];
  const header = comps.find((c) => c.type === "HEADER");
  const body = comps.find((c) => c.type === "BODY");
  const footer = comps.find((c) => c.type === "FOOTER");
  const buttons = comps.find((c) => c.type === "BUTTONS");

  const headerMediaUrl =
    header?.example?.header_url?.[0] || undefined;

  return (
    <div className="flex flex-col items-center bg-[#e5ddd5] rounded-xl p-4 min-h-[80px]">
      <div className="w-full max-w-xs">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          {header && (
            <div className="bg-gray-100 px-3 pt-3 pb-2">
              {header.format === "IMAGE" ? (
                headerMediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headerMediaUrl}
                    alt="header"
                    className="w-full rounded object-cover max-h-40"
                  />
                ) : (
                  <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center gap-1 text-xs text-gray-400">
                    <ImageIcon className="h-4 w-4" />
                    {t("imagePreview")}
                  </div>
                )
              ) : header.format === "VIDEO" ? (
                <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center gap-1 text-xs text-gray-400">
                  <Video className="h-4 w-4" />
                  {t("videoPreview")}
                </div>
              ) : header.format === "DOCUMENT" ? (
                <div className="w-full h-10 bg-gray-200 rounded flex items-center justify-center gap-1 text-xs text-gray-400">
                  <FileText className="h-4 w-4" />
                  {t("documentPreview")}
                </div>
              ) : header.text ? (
                <p className="text-sm font-semibold text-gray-800">
                  {buildPreviewText(header.text, variables)}
                </p>
              ) : null}
            </div>
          )}

          {/* Body */}
          {body?.text && (
            <div className="px-3 py-2">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {buildPreviewText(body.text, variables)}
              </p>
            </div>
          )}

          {/* Footer */}
          {footer?.text && (
            <div className="px-3 pb-2">
              <p className="text-xs text-gray-400">{footer.text}</p>
            </div>
          )}

          {/* Buttons */}
          {buttons?.buttons && buttons.buttons.length > 0 && (
            <div className="border-t divide-y">
              {buttons.buttons.map((btn, i) => (
                <div key={i} className="px-3 py-2 text-center text-xs text-blue-500 font-medium">
                  {btn.text}
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-right">{template.language}</p>
      </div>
    </div>
  );
}

// ─── NonOfficialPreview ───────────────────────────────────────────────────────

function NonOfficialPreview({ dispatch }: { dispatch: BulkDispatch }) {
  const { message, mediaUrl, mediaDescription, voiceUrl } = dispatch;

  const isImage =
    mediaUrl &&
    /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(mediaUrl);
  const isVideo =
    mediaUrl &&
    /\.(mp4|webm|ogg|mov)(\?|$)/i.test(mediaUrl);
  const isAudio = !!voiceUrl;

  return (
    <div className="flex flex-col items-center bg-[#e5ddd5] rounded-xl p-4 min-h-[80px]">
      <div className="w-full max-w-xs">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Image */}
          {isImage && (
            <div className="bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl}
                alt="media"
                className="w-full object-cover max-h-48 rounded-t-xl"
              />
            </div>
          )}

          {/* Video placeholder */}
          {isVideo && !isImage && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="w-full h-28 bg-gray-200 rounded-t-xl flex items-center justify-center gap-1 text-xs text-gray-500">
                <Video className="h-5 w-5" />
                <span className="underline">Vídeo</span>
              </div>
            </a>
          )}

          {/* Non-image media link (doc, etc.) */}
          {mediaUrl && !isImage && !isVideo && (
            <div className="px-3 pt-3">
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 underline"
              >
                <FileText className="h-4 w-4" />
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Caption / message */}
          {(message || mediaDescription) && (
            <div className="px-3 py-2">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {message || mediaDescription}
              </p>
            </div>
          )}

          {/* Audio */}
          {isAudio && (
            <div className="px-3 pb-3">
              <audio controls src={voiceUrl} className="w-full h-8" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── timeline helpers ────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  try {
    return formatDateTime(d, { hour12: false });
  } catch {
    return "";
  }
}

function toCsv(rows: string[][]): string {
  return "﻿" + rows.map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type TimelineEntry =
  | { kind: "success"; number: string; timestamp: Date }
  | { kind: "error"; number: string; timestamp: Date; error: string };

function DispatchTimeline({
  dispatch,
  t,
}: {
  dispatch: BulkDispatch;
  t: (key: string) => string;
}) {
  const successEntries = (dispatch.metadata?.sentContacts ?? []).map((s) => ({
    kind: "success" as const,
    number: s.contact,
    timestamp: new Date(s.timestamp),
  }));
  const errorEntries = (dispatch.errors ?? []).map((e) => ({
    kind: "error" as const,
    number: e.contact,
    timestamp: new Date(e.timestamp),
    // Marcador interno do pulo por conversa ativa (crossChannelTicketCheck) →
    // rótulo humano na tela e nos CSVs; demais erros seguem crus.
    error: e.error === "active_conversation" ? t("skippedActiveConversation") : e.error,
  }));
  const timeline: TimelineEntry[] = [...successEntries, ...errorEntries].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  if (timeline.length === 0) return null;

  const copyNumber = (n: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(n).then(
        () => toast.success(t("numberCopied")),
        () => toast.error(t("copyFailed")),
      );
    }
  };

  const exportFull = () => {
    const rows: string[][] = [["status", "number", "timestamp", "error"]];
    for (const it of timeline) {
      rows.push([
        it.kind,
        it.number,
        it.timestamp.toISOString(),
        it.kind === "error" ? it.error : "",
      ]);
    }
    downloadCsv(`relatorio-disparo-${dispatch.id}-${Date.now()}.csv`, toCsv(rows));
  };

  const exportErrors = () => {
    const rows: string[][] = [["number", "timestamp", "error"]];
    for (const e of errorEntries) {
      rows.push([e.number, e.timestamp.toISOString(), e.error]);
    }
    downloadCsv(`relatorio-disparo-${dispatch.id}-erros-${Date.now()}.csv`, toCsv(rows));
  };

  // Diferente dos dois acima (montados só com o que o disparo guarda), este busca no
  // servidor o status que o provedor confirmou por destinatário — aceite, entrega,
  // leitura ou falha posterior. `matched_by` diz se o casamento foi exato (wamid) ou
  // deduzido pelo número, em disparo anterior ao registro do id da mensagem.
  const exportDelivery = async () => {
    try {
      const res = await getBulkDispatchReport(dispatch.id);
      const report = res.data;
      const rows: string[][] = [
        ["number", "accepted", "provider_status", "message_id", "sent_at", "dispatch_error", "matched_by"],
      ];
      for (const r of report.recipients ?? []) {
        rows.push([
          r.number,
          r.accepted ? "true" : "false",
          r.providerStatus ?? "",
          r.messageId ?? "",
          r.sentAt ?? "",
          r.dispatchError === "active_conversation"
            ? t("skippedActiveConversation")
            : r.dispatchError ?? "",
          r.matchedBy ?? "",
        ]);
      }
      downloadCsv(`relatorio-disparo-${dispatch.id}-entrega-${Date.now()}.csv`, toCsv(rows));
    } catch {
      toast.error(t("exportDeliveryFailed"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-base">{t("timelineTitle")}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportFull} disabled={timeline.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> {t("exportCsvAll")}
          </Button>
          <Button size="sm" variant="outline" onClick={exportErrors} disabled={errorEntries.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> {t("exportCsvErrors")}
          </Button>
          <Button size="sm" variant="outline" onClick={exportDelivery} disabled={timeline.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> {t("exportCsvDelivery")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="all">{t("tabAll")} ({timeline.length})</TabsTrigger>
          <TabsTrigger value="sent">{t("tabSent")} ({successEntries.length})</TabsTrigger>
          <TabsTrigger value="errors">{t("tabErrors")} ({errorEntries.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <ScrollArea className="h-72">
            <ul className="divide-y text-xs">
              {timeline.map((it, i) => (
                <li key={i} className="py-1.5 flex items-center gap-2">
                  {it.kind === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  )}
                  <span className="font-mono">{it.number}</span>
                  {it.kind === "error" ? (
                    <span className="text-red-600 truncate">· {it.error}</span>
                  ) : null}
                  <span className="ml-auto text-muted-foreground tabular-nums">{fmtTime(it.timestamp)}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyNumber(it.number)} title={t("copyNumber")}>
                    <Clipboard className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sent">
          <ScrollArea className="h-72">
            {successEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">{t("noSent")}</p>
            ) : (
              <ul className="divide-y text-xs">
                {successEntries.map((s, i) => (
                  <li key={i} className="py-1.5 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <span className="font-mono">{s.number}</span>
                    <span className="ml-auto text-muted-foreground tabular-nums">{fmtTime(s.timestamp)}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyNumber(s.number)}>
                      <Clipboard className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="errors">
          <ScrollArea className="h-72">
            {errorEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">{t("noErrors")}</p>
            ) : (
              <ul className="divide-y text-xs">
                {errorEntries.map((e, i) => (
                  <li key={i} className="py-1.5 flex items-start gap-2">
                    <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono truncate">{e.number}</p>
                      <p className="text-red-600 text-[11px]">{e.error}</p>
                    </div>
                    <span className="text-muted-foreground tabular-nums mt-0.5">{fmtTime(e.timestamp)}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyNumber(e.number)}>
                      <Clipboard className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MassaRelatorioPage() {
  const t = useTranslations("massaRelatorioPage");
  const allowed = usePageAccess("massa");
  if (!allowed) return <AccessDenied />;

  const STATUS_OPTIONS = [
    { label: t("statusPending"), value: "pending" },
    { label: t("statusProcessing"), value: "processing" },
    { label: t("statusCompleted"), value: "completed" },
    { label: t("statusFailed"), value: "failed" },
    { label: t("statusCancelled"), value: "cancelled" },
  ];

  const DISPATCH_TYPE_OPTIONS = DISPATCH_TYPE_VALUES.map((o) => ({
    label: t(o.key as Parameters<typeof t>[0]),
    value: o.value,
  }));

  function getStatusLabel(status: string): string {
    if (status === "pending" || status === "processing") return t("statusIncomplete");
    if (status === "completed") return t("statusCompleted");
    if (status === "failed") return t("statusFailed");
    if (status === "cancelled") return t("statusCancelled");
    return status;
  }

  function getDispatchTypeLabel(type?: string): string {
    if (!type) return "—";
    const found = DISPATCH_TYPE_OPTIONS.find((o) => o.value === type);
    return found ? found.label : type;
  }

  const [loading, setLoading] = useState(false);
  const [dispatches, setDispatches] = useState<BulkDispatch[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(20);

  // Details modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<BulkDispatch | null>(null);

  // Template preview
  const [previewTemplate, setPreviewTemplate] = useState<WabaTemplate | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: rowsPerPage,
        sortBy: "createdAt",
        order: "DESC",
      };
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.dispatchType = filterType;
      if (filterStartDate) params.startDate = `${filterStartDate}T00:00:00`;
      if (filterEndDate) params.endDate = `${filterEndDate}T23:59:59.999`;

      const res = await listDispatches(params as Parameters<typeof listDispatches>[0]);
      const raw = res.data as { rows: BulkDispatch[]; count: number } | BulkDispatch[];
      if (Array.isArray(raw)) {
        setDispatches(raw);
        setTotalCount(raw.length);
      } else {
        setDispatches((raw as { rows: BulkDispatch[]; count: number }).rows || []);
        setTotalCount((raw as { rows: BulkDispatch[]; count: number }).count || 0);
      }
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, filterStartDate, filterEndDate, page, rowsPerPage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClearFilters = () => {
    setFilterStatus("");
    setFilterType("");
    setFilterStartDate("");
    setFilterEndDate("");
    setPage(1);
  };

  const handleViewDetails = async (row: BulkDispatch) => {
    setPreviewTemplate(null);
    try {
      const res = await showDispatch(row.id);
      const details = res.data;
      setSelectedDetails(details);
      setModalOpen(true);

      // Fetch template structure for WABA dispatches
      if (isWabaTemplate(details.dispatchType) && details.whatsappId && details.templateName) {
        setPreviewLoading(true);
        try {
          const templatesRes = await fetchWabaTemplates(details.whatsappId);
          const templates = Array.isArray(templatesRes.data) ? templatesRes.data : [];
          const found = templates.find((tpl) => tpl.name === details.templateName) || null;
          setPreviewTemplate(found);
        } catch {
          setPreviewTemplate(null);
        } finally {
          setPreviewLoading(false);
        }
      }
    } catch {
      toast.error(t("errorLoadDetails"));
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  // Variables for template preview (positional, from metadata)
  const previewVariables: string[] = selectedDetails?.metadata?.variables ?? [];

  return (
    <>
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("cardTitle")}
            <Info className="h-4 w-4 text-muted-foreground" />
            <PageHelp
              description={t("helpDesc")}
              sections={[
                { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
                { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
              ]}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("labelStatus")}</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder={t("allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("labelDispatchType")}</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder={t("allTypes")} />
                </SelectTrigger>
                <SelectContent>
                  {DISPATCH_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("labelDateStart")}</label>
              <Input
                type="date"
                value={filterStartDate}
                onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
                className="w-[160px] h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("labelDateEnd")}</label>
              <Input
                type="date"
                value={filterEndDate}
                onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
                className="w-[160px] h-9"
              />
            </div>
            <Button size="sm" onClick={loadData} disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              {t("search")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleClearFilters}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("clearFilters")}
            </Button>
            <Button size="sm" variant="ghost" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colType")}</TableHead>
                <TableHead>{t("colTemplate")}</TableHead>
                <TableHead>{t("colProgress")}</TableHead>
                <TableHead>{t("colCreatedAt")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    {t("loading")}
                  </TableCell>
                </TableRow>
              ) : dispatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    {t("noRecords")}
                  </TableCell>
                </TableRow>
              ) : (
                dispatches.map((d) => {
                  const sent = Math.min(d.sentMessages ?? 0, d.totalMessages ?? 0);
                  const total = d.totalMessages ?? 0;
                  const pct = total > 0 ? (sent / total) * 100 : 0;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">#{d.id}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(d.status)}>
                          {getStatusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getDispatchTypeLabel(d.dispatchType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{d.templateName || "—"}</TableCell>
                      <TableCell className="min-w-[140px]">
                        <div className="space-y-1">
                          <Progress value={pct} className="h-3" />
                          <p className="text-xs text-center text-muted-foreground">
                            {sent} / {total}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(d.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewDetails(d)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t("page")} {page} {t("of")} {totalPages} ({totalCount} {t("records")})
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  {t("previous")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t("detailsTitle")}</DialogTitle>
          </DialogHeader>
          {selectedDetails && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* General info */}
              <Card>
                <CardContent className="pt-4 space-y-2 text-sm">
                  <p className="font-semibold text-base mb-2">{t("generalInfo")}</p>
                  <p><strong>ID:</strong> {selectedDetails.id}</p>
                  <div className="flex items-center gap-1">
                    <strong>{t("detailStatus")}:</strong>{" "}
                    <Badge variant={getStatusVariant(selectedDetails.status)}>
                      {getStatusLabel(selectedDetails.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <strong>{t("detailType")}:</strong>{" "}
                    <Badge variant="outline">{getDispatchTypeLabel(selectedDetails.dispatchType)}</Badge>
                  </div>
                  <p><strong>{t("detailCreatedAt")}:</strong> {formatDate(selectedDetails.createdAt)}</p>
                  {selectedDetails.startedAt && (
                    <p><strong>{t("detailStartedAt")}:</strong> {formatDate(selectedDetails.startedAt)}</p>
                  )}
                  {selectedDetails.completedAt && (
                    <p><strong>{t("detailCompletedAt")}:</strong> {formatDate(selectedDetails.completedAt)}</p>
                  )}
                </CardContent>
              </Card>

              {/* Statistics */}
              <Card>
                <CardContent className="pt-4 space-y-2 text-sm">
                  <p className="font-semibold text-base mb-2">{t("statistics")}</p>
                  <p><strong>{t("totalMessages")}:</strong> {selectedDetails.totalMessages ?? "—"}</p>
                  <div className="flex items-center gap-1">
                    <strong>{t("sent")}:</strong>{" "}
                    <Badge variant="default">
                      {Math.min(
                        selectedDetails.sentMessages ?? 0,
                        selectedDetails.totalMessages ?? 0
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <strong>{t("notSent")}:</strong>{" "}
                    <Badge variant="secondary">
                      {(selectedDetails.pendingMessages ?? 0) +
                        (selectedDetails.failedMessages ?? 0)}
                    </Badge>
                  </div>
                  {selectedDetails.minDelay != null && selectedDetails.maxDelay != null && (
                    <p>
                      <strong>{t("interval")}:</strong> {selectedDetails.minDelay}s – {selectedDetails.maxDelay}s
                    </p>
                  )}
                  {selectedDetails.templateName && (
                    <p><strong>{t("detailTemplate")}:</strong> {selectedDetails.templateName}</p>
                  )}
                  {/* Message content (non-template) — kept for text dispatches */}
                  {!isWabaTemplate(selectedDetails.dispatchType) && selectedDetails.message && (
                    <div>
                      <strong>{t("message")}:</strong>
                      <div className="mt-1 p-2 bg-muted rounded text-xs max-h-32 overflow-y-auto">
                        {selectedDetails.message}
                      </div>
                    </div>
                  )}
                  {!isWabaTemplate(selectedDetails.dispatchType) && selectedDetails.mediaUrl && (
                    <p>
                      <strong>{t("media")}:</strong>{" "}
                      <a
                        href={selectedDetails.mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline inline-flex items-center gap-1"
                      >
                        {t("viewMedia")} <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  )}
                  {!isWabaTemplate(selectedDetails.dispatchType) && selectedDetails.mediaDescription && (
                    <div>
                      <strong>{t("mediaCaption")}:</strong>
                      <div className="mt-1 p-2 bg-muted rounded text-xs max-h-24 overflow-y-auto">
                        {selectedDetails.mediaDescription}
                      </div>
                    </div>
                  )}
                  {!isWabaTemplate(selectedDetails.dispatchType) && selectedDetails.voiceUrl && (
                    <p>
                      <strong>{t("audio")}:</strong>{" "}
                      <a
                        href={selectedDetails.voiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline inline-flex items-center gap-1"
                      >
                        {t("listen")} <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* ── Message Preview ─────────────────────────────────────────── */}
              <div className="md:col-span-2">
                <Card>
                  <CardContent className="pt-4">
                    <p className="font-semibold text-base mb-3">{t("previewTitle")}</p>

                    {/* WABA template preview */}
                    {isWabaTemplate(selectedDetails.dispatchType) && (
                      previewLoading ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {t("previewLoading")}
                        </div>
                      ) : previewTemplate ? (
                        <TemplatePreview
                          template={previewTemplate}
                          variables={previewVariables}
                          t={t}
                        />
                      ) : (
                        <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                          {t("previewNotAvailable")}
                        </div>
                      )
                    )}

                    {/* Non-official API preview — e-mail fica fora (o assunto num
                        balão de WhatsApp confunde; auditoria pós-impl. #15) */}
                    {!isWabaTemplate(selectedDetails.dispatchType) &&
                      selectedDetails.dispatchType !== "email" &&
                      (selectedDetails.message || selectedDetails.mediaUrl || selectedDetails.voiceUrl) && (
                        <NonOfficialPreview dispatch={selectedDetails} />
                      )}
                  </CardContent>
                </Card>
              </div>

              {/* Timeline (sent + errors per contact) */}
              {((selectedDetails.errors?.length ?? 0) > 0 ||
                (selectedDetails.metadata?.sentContacts?.length ?? 0) > 0) && (
                <div className="md:col-span-2">
                  <Card>
                    <CardContent className="pt-4">
                      <DispatchTimeline dispatch={selectedDetails} t={t} />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
