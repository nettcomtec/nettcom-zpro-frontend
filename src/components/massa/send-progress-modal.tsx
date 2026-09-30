"use client";

import React, { useMemo } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Ban,
  CheckCircle2,
  Clipboard,
  Download,
  Loader2,
  XCircle,
  Pause,
  PlayCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SendErrorEntry {
  number: string;
  error: string;
  timestamp: Date;
}

export interface SendSuccessEntry {
  number: string;
  timestamp: Date;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sending: boolean;
  sentCount: number;
  totalMessages: number;
  errors?: number;
  errorLog?: SendErrorEntry[];
  successLog?: SendSuccessEntry[];
  title?: string;
  detailLine?: string;
  processingHint?: string;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  /**
   * Contagens vindas de fora (envio que roda no servidor e chega por consulta, sem
   * log por número). Presentes, o contador e a barra usam elas em vez dos logs, e a
   * barra mostra o andamento (enviados + falhas).
   */
  sentCountOverride?: number;
  failedCountOverride?: number;
  /** Esconde as abas de log e a exportação em CSV (não há log por número). */
  hideLogTabs?: boolean;
  /** Botão de cancelar enquanto envia; a confirmação fica com quem chama. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Deixa fechar o painel com o envio em andamento (o envio segue no servidor). */
  closableWhileSending?: boolean;
}

function fmtTime(d: Date): string {
  try {
    return d.toLocaleTimeString("pt-BR", { hour12: false });
  } catch {
    return "";
  }
}

function toCsv(rows: string[][]): string {
  return "\uFEFF" + rows.map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(filename: string, content: string) {
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

export function SendProgressModal({
  open,
  onClose,
  sending,
  sentCount,
  totalMessages,
  errors = 0,
  errorLog = [],
  successLog = [],
  title,
  detailLine,
  processingHint,
  isPaused,
  onPause,
  onResume,
  sentCountOverride,
  failedCountOverride,
  hideLogTabs,
  onCancel,
  cancelLabel,
  closableWhileSending,
}: Props) {
  const t = useTranslations("sendProgressModal");
  const tCommon = useTranslations("common");

  // Sem contagem externa, tudo segue como sempre: barra pelo `sentCount`, contador pelo log.
  const hasCountOverride = sentCountOverride !== undefined || failedCountOverride !== undefined;
  const shownSent = sentCountOverride ?? successLog.length;
  const shownErrors = failedCountOverride ?? errors;
  const progressCount = hasCountOverride ? (sentCountOverride ?? 0) + (failedCountOverride ?? 0) : sentCount;
  const progressValue = totalMessages > 0 ? Math.min(100, (progressCount / totalMessages) * 100) : 0;
  const canClose = !sending || !!closableWhileSending;
  const showPauseControls = sending && (!!onPause || !!onResume);
  const showLogs = !hideLogTabs;

  type TimelineEntry =
    | { kind: "success"; number: string; timestamp: Date }
    | { kind: "error"; number: string; timestamp: Date; error: string };

  const timeline: TimelineEntry[] = useMemo(() => {
    const items: TimelineEntry[] = [
      ...successLog.map((s) => ({ kind: "success" as const, number: s.number, timestamp: s.timestamp })),
      ...errorLog.map((e) => ({ kind: "error" as const, number: e.number, timestamp: e.timestamp, error: e.error })),
    ];
    items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return items;
  }, [successLog, errorLog]);

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
    download(`envio-massa-${Date.now()}.csv`, toCsv(rows));
  };

  const exportErrors = () => {
    const rows: string[][] = [["number", "timestamp", "error"]];
    for (const e of errorLog) {
      rows.push([e.number, e.timestamp.toISOString(), e.error]);
    }
    download(`envio-massa-erros-${Date.now()}.csv`, toCsv(rows));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && canClose) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-green-500" />
            <DialogTitle>{title ?? t("title")}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {detailLine ? (
            <p className="text-sm text-muted-foreground">{detailLine}</p>
          ) : null}
          {sending ? (
            <p className="text-xs text-muted-foreground">
              {processingHint ?? t("processingHint")}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Progress value={progressValue} className="flex-1" />
            <span className="text-xs tabular-nums w-14 text-right">{Math.round(progressValue)}%</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                {shownSent} / {totalMessages}
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-red-600" />
                {shownErrors}
              </span>
            </div>
            {showPauseControls || showLogs ? (
              <div className="flex items-center gap-2">
                {showPauseControls ? (
                  isPaused ? (
                    <Button size="sm" variant="outline" onClick={onResume}>
                      <PlayCircle className="h-3.5 w-3.5 mr-1" /> {t("resume")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={onPause}>
                      <Pause className="h-3.5 w-3.5 mr-1" /> {t("pause")}
                    </Button>
                  )
                ) : null}
                {showLogs ? (
                  <>
                    <Button size="sm" variant="outline" onClick={exportFull} disabled={timeline.length === 0}>
                      <Download className="h-3.5 w-3.5 mr-1" /> {t("exportCsvAll")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={exportErrors} disabled={errorLog.length === 0}>
                      <Download className="h-3.5 w-3.5 mr-1" /> {t("exportCsvErrors")}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {showLogs ? (
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="all">{t("tabAll")} ({timeline.length})</TabsTrigger>
                <TabsTrigger value="sent">{t("tabSent")} ({successLog.length})</TabsTrigger>
                <TabsTrigger value="errors">{t("tabErrors")} ({errorLog.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <ScrollArea className="h-56">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("noEntries")}
                    </p>
                  ) : (
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
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="sent">
                <ScrollArea className="h-56">
                  {successLog.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">{t("noSent")}</p>
                  ) : (
                    <ul className="divide-y text-xs">
                      {successLog.map((s, i) => (
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
                <ScrollArea className="h-56">
                  {errorLog.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">{t("noErrors")}</p>
                  ) : (
                    <ul className="divide-y text-xs">
                      {errorLog.map((e, i) => (
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
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            {sending && onCancel ? (
              <Button size="sm" variant="destructive" onClick={onCancel}>
                <Ban className="h-3.5 w-3.5 mr-1" /> {cancelLabel ?? tCommon("cancel")}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onClose} disabled={!canClose}>
              {canClose ? t("close") : t("sendingWait")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
