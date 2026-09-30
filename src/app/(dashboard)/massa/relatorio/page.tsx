"use client";

import { formatDateTime } from "@/lib/format";

/**
 * RelatorioBulkDispatch — matches the legacy front's RelatorioBulkDispatch
 *
 * Shows paginated send history with filters for status and dispatch type.
 * Clicking a row opens a details modal with general info, statistics, errors,
 * and a visual preview of the sent message.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, RotateCcw, Eye, RefreshCw, Info, ExternalLink, FileText, Mic, Image as ImageIcon, Video, CheckCircle2, XCircle, Clipboard, Download, Ban, Loader2, CircleAlert, CircleMinus, CircleHelp } from "lucide-react";
import { toast } from "sonner";
import {
  listDispatches,
  showDispatch,
  fetchWabaTemplates,
  getBulkDispatchReport,
  fetchBulkSmsDispatch,
  cancelBulkSmsDispatch,
  readBulkSmsErrorCode,
  readBulkSmsErrorStatus,
  isLegacyBackend404,
  type BulkDispatch,
  type BulkDispatchReportRecipient,
  type SmsBulkDispatchLean,
  type WabaTemplate,
  type WabaTemplateComponent,
} from "@/services/bulk";
import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
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
  { key: "typeSms", value: "sms" },
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

// ─── SMS em massa (docs/PLANO_SMS_MASSA_SEGUNDO_PLANO.md §5.5 e §5.8) ─────────
// Linhas `dispatchType: 'sms'` são enviadas em segundo plano pelo servidor. Tudo
// daqui até a página vale só para elas: os outros tipos seguem pelos caminhos de sempre.

const SMS_POLL_INTERVAL_MS = 5000;
// A lista de um disparo SMS pode ter dezenas de milhares de números: cada aba
// desenha em blocos conforme a rolagem, em vez de montar tudo de uma vez.
const SMS_LIST_CHUNK = 200;

type SmsRecipientStatus = "accepted" | "failed" | "unconfirmed" | "not_sent" | "unknown";

const SMS_STATUS_ORDER: SmsRecipientStatus[] = ["accepted", "failed", "unconfirmed", "not_sent", "unknown"];

const SMS_STATUS_LABEL_KEY: Record<SmsRecipientStatus, string> = {
  accepted: "smsStatusAccepted",
  failed: "smsStatusFailed",
  unconfirmed: "smsStatusUnconfirmed",
  not_sent: "smsStatusNotSent",
  unknown: "smsStatusUnknown",
};

// `cancellationReason` de linha SMS → motivo legível (código desconhecido não aparece).
const SMS_REASON_LABEL_KEY: Record<string, string> = {
  user: "smsReasonUser",
  ERR_SMS_INVALID_KEY: "smsReasonInvalidKey",
  ERR_SMS_PROVIDER_REJECTED: "smsReasonAccount",
  ERR_SMS_BULK_INTERRUPTED: "smsReasonInterrupted",
  ERR_SMS_TOKEN_NOT_FOUND: "smsReasonTokenMissing",
};

type DispatchError = NonNullable<BulkDispatch["errors"]>[number];

/** Campos aditivos do `/:id/report` em linha SMS (backend novo); backend antigo não manda. */
type SmsReportRecipient = BulkDispatchReportRecipient & { smsStatus?: unknown; smsCode?: unknown };

function isSmsRecipientStatus(value: unknown): value is SmsRecipientStatus {
  return typeof value === "string" && (SMS_STATUS_ORDER as string[]).includes(value);
}

function smsReasonLabelKey(reason?: string | null): string | undefined {
  if (!reason || !Object.prototype.hasOwnProperty.call(SMS_REASON_LABEL_KEY, reason)) return undefined;
  return SMS_REASON_LABEL_KEY[reason];
}

function isSmsDispatch(d?: Pick<BulkDispatch, "dispatchType"> | null): boolean {
  return d?.dispatchType === "sms";
}

function isActiveDispatchStatus(status?: string | null): boolean {
  return status === "pending" || status === "processing";
}

/** Disparo SMS ainda rodando no servidor — só o SMS tem "em andamento" de verdade. */
function isSmsInProgress(d?: Pick<BulkDispatch, "dispatchType" | "status"> | null): boolean {
  return !!d && d.dispatchType === "sms" && isActiveDispatchStatus(d.status);
}

// Cancelado com um número reservado ainda sem resultado: o servidor grava esse
// número em até 5 min (teto por envio) ou a varredura o concilia. A linha segue
// sendo atualizada por até 8 min depois do cancelamento, para a contagem não congelar.
const SMS_CANCEL_SETTLE_MS = 8 * 60 * 1000;

function isSmsCancelSettling(
  d?: Pick<
    BulkDispatch,
    "dispatchType" | "status" | "totalMessages" | "pendingMessages" | "sentMessages" | "failedMessages" | "completedAt"
  > | null
): boolean {
  if (!d || d.dispatchType !== "sms" || d.status !== "cancelled") return false;
  const attempted = Number(d.totalMessages || 0) - Number(d.pendingMessages || 0);
  if (attempted <= Number(d.sentMessages || 0) + Number(d.failedMessages || 0)) return false;
  const doneAt = d.completedAt ? new Date(d.completedAt).getTime() : NaN;
  return Number.isNaN(doneAt) || Date.now() - doneAt < SMS_CANCEL_SETTLE_MS;
}

/** Data válida ou null: `errors[].timestamp` pode faltar ou vir num formato inesperado. */
function parseDateSafe(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data para o CSV sem `toISOString()` em data inválida (que lança RangeError). */
function csvTimestamp(value: unknown): string {
  const d = parseDateSafe(value);
  if (d) return d.toISOString();
  return typeof value === "string" ? value : "";
}

// Número × erro casados pelos dígitos: a lista já saiu do servidor sem repetidos
// (comparados por dígitos), então dois números dela nunca têm a mesma chave.
function smsNumberKey(value: unknown): string {
  const raw = String(value ?? "").trim();
  return raw.replace(/\D/g, "") || raw;
}

interface SmsRecipientRow {
  index: number;
  number: string;
  status: SmsRecipientStatus;
  error: string;
  timestamp: Date | null;
  rawTimestamp: unknown;
}

/**
 * Situação de cada número pela mesma regra do backend (§5.5), sem depender de
 * `metadata.sentContacts` (o SMS não guarda a lista de aceitos): tentados =
 * total − pendentes, na ordem da lista. Tentado com erro = falhou (ou não
 * confirmado); tentado sem erro = aceito, ou "sem confirmação individual" quando
 * há mais falhas do que erros guardados (teto de 500); o resto = não enviado.
 *
 * Único acréscimo à regra do backend: o número já tentado cujo resultado ainda não
 * foi gravado (em voo enquanto o provedor responde; tentados > enviados + falhas)
 * aparece como "sem confirmação individual", não como aceito. Com o disparo parado
 * os dois lados coincidem (o servidor concilia o que ficou em voo).
 */
function buildSmsRecipientRows(dispatch: BulkDispatch): SmsRecipientRow[] {
  const rawContacts = dispatch.metadata?.contacts;
  const contacts: unknown[] = Array.isArray(rawContacts) ? rawContacts : [];
  if (contacts.length === 0) return [];
  const errors: DispatchError[] = Array.isArray(dispatch.errors) ? dispatch.errors : [];
  const errorByNumber = new Map<string, DispatchError>();
  for (const e of errors) {
    const key = smsNumberKey(e?.contact);
    if (key && !errorByNumber.has(key)) errorByNumber.set(key, e);
  }
  const total = Number(dispatch.totalMessages ?? contacts.length) || 0;
  const pending = Number(dispatch.pendingMessages ?? 0) || 0;
  const attempted = Math.max(0, total - pending);
  const sent = Number(dispatch.sentMessages ?? 0) || 0;
  const failed = Number(dispatch.failedMessages ?? 0) || 0;
  const errorsIncomplete = failed > errors.length;
  // O envio é sequencial e grava o resultado na ordem: do índice `settled` até
  // `attempted` só pode haver número em voo.
  const settled = Math.min(sent + failed, attempted);

  return contacts.map((raw, index): SmsRecipientRow => {
    const number = String(raw ?? "");
    if (index >= attempted) {
      return { index, number, status: "not_sent", error: "", timestamp: null, rawTimestamp: undefined };
    }
    const err = errorByNumber.get(smsNumberKey(number));
    if (err) {
      return {
        index,
        number,
        status: err.code === "ERR_SMS_UNCONFIRMED" ? "unconfirmed" : "failed",
        error: typeof err.error === "string" ? err.error : "",
        timestamp: parseDateSafe(err.timestamp),
        rawTimestamp: err.timestamp,
      };
    }
    return {
      index,
      number,
      status: errorsIncomplete || index >= settled ? "unknown" : "accepted",
      error: "",
      timestamp: null,
      rawTimestamp: undefined,
    };
  });
}

function smsErrorKey(e: Partial<DispatchError> | null | undefined): string {
  return `${e?.contact ?? ""}|${e?.timestamp ?? ""}|${e?.code ?? ""}`;
}

/** Soma aos erros da tela os mais recentes do retorno enxuto (`withErrors`: últimos 100). */
function unionSmsErrors(
  current: BulkDispatch["errors"],
  incoming: SmsBulkDispatchLean["errors"]
): BulkDispatch["errors"] {
  if (!Array.isArray(incoming) || incoming.length === 0) return current;
  const base = Array.isArray(current) ? current : [];
  const seen = new Set(base.map(smsErrorKey));
  const added: DispatchError[] = [];
  for (const e of incoming) {
    if (!e) continue;
    const key = smsErrorKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(e);
  }
  return added.length > 0 ? [...base, ...added] : current;
}

/** Mescla o retorno enxuto do acompanhamento na linha; devolve a MESMA linha se nada mudou. */
function mergeSmsLean(d: BulkDispatch, lean: SmsBulkDispatchLean): BulkDispatch {
  if (d.dispatchType !== "sms" || d.id !== lean.id) return d;
  const next: BulkDispatch = {
    ...d,
    status: typeof lean.status === "string" && lean.status ? lean.status : d.status,
    totalMessages: typeof lean.totalMessages === "number" ? lean.totalMessages : d.totalMessages,
    sentMessages: typeof lean.sentMessages === "number" ? lean.sentMessages : d.sentMessages,
    failedMessages: typeof lean.failedMessages === "number" ? lean.failedMessages : d.failedMessages,
    pendingMessages: typeof lean.pendingMessages === "number" ? lean.pendingMessages : d.pendingMessages,
    startedAt: lean.startedAt ?? d.startedAt,
    completedAt: lean.completedAt ?? d.completedAt,
    cancellationReason: lean.cancellationReason ?? d.cancellationReason ?? null,
    errors: unionSmsErrors(d.errors, lean.errors),
  };
  const unchanged =
    next.status === d.status &&
    next.totalMessages === d.totalMessages &&
    next.sentMessages === d.sentMessages &&
    next.failedMessages === d.failedMessages &&
    next.pendingMessages === d.pendingMessages &&
    next.startedAt === d.startedAt &&
    next.completedAt === d.completedAt &&
    next.cancellationReason === (d.cancellationReason ?? null) &&
    next.errors === d.errors;
  return unchanged ? d : next;
}

function SmsStatusIcon({ status }: { status: SmsRecipientStatus }) {
  const cls = "h-3.5 w-3.5 shrink-0 mt-0.5";
  if (status === "accepted") return <CheckCircle2 className={`${cls} text-green-600`} />;
  if (status === "failed") return <XCircle className={`${cls} text-red-600`} />;
  if (status === "unconfirmed") return <CircleAlert className={`${cls} text-amber-600`} />;
  if (status === "not_sent") return <CircleMinus className={`${cls} text-muted-foreground`} />;
  return <CircleHelp className={`${cls} text-muted-foreground`} />;
}

function SmsRecipientList({
  rows,
  showStatus,
  t,
  onCopy,
}: {
  rows: SmsRecipientRow[];
  showStatus: boolean;
  t: (key: string) => string;
  onCopy: (value: string) => void;
}) {
  const [limit, setLimit] = useState(SMS_LIST_CHUNK);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  const hasMore = rows.length > limit;

  // Desenha o próximo bloco quando o fim do que já está na tela aparece na rolagem.
  useEffect(() => {
    if (!hasMore) return;
    if (typeof IntersectionObserver === "undefined") {
      setLimit(rows.length);
      return;
    }
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setLimit((current) => current + SMS_LIST_CHUNK);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, limit, rows.length]);

  return (
    <ul className="divide-y text-xs">
      {rows.slice(0, limit).map((r) => {
        const detail = [showStatus ? t(SMS_STATUS_LABEL_KEY[r.status]) : "", r.error]
          .filter(Boolean)
          .join(" · ");
        const time = r.timestamp ? fmtTime(r.timestamp) : "";
        return (
          <li key={r.index} className="py-1.5 flex items-start gap-2">
            <SmsStatusIcon status={r.status} />
            <div className="flex-1 min-w-0">
              <p className="font-mono truncate">{r.number}</p>
              {detail && (
                <p className={`text-[11px] break-words ${r.status === "failed" ? "text-red-600" : "text-muted-foreground"}`}>
                  {detail}
                </p>
              )}
              {time && <p className="sm:hidden text-[11px] text-muted-foreground tabular-nums">{time}</p>}
            </div>
            {time && (
              <span className="hidden sm:inline shrink-0 text-muted-foreground tabular-nums mt-0.5">{time}</span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => onCopy(r.number)}
              title={t("copyNumber")}
              aria-label={t("copyNumber")}
            >
              <Clipboard className="h-3 w-3" />
            </Button>
          </li>
        );
      })}
      {hasMore && (
        <li ref={sentinelRef} aria-hidden="true" className="flex justify-center py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </li>
      )}
    </ul>
  );
}

function SmsDispatchResults({
  dispatch,
  t,
}: {
  dispatch: BulkDispatch;
  t: (key: string) => string;
}) {
  const rows = useMemo(() => buildSmsRecipientRows(dispatch), [dispatch]);
  const byStatus = useMemo(() => {
    const groups: Record<SmsRecipientStatus, SmsRecipientRow[]> = {
      accepted: [],
      failed: [],
      unconfirmed: [],
      not_sent: [],
      unknown: [],
    };
    for (const r of rows) groups[r.status].push(r);
    return groups;
  }, [rows]);
  const errorRows = useMemo(
    () => [...byStatus.failed, ...byStatus.unconfirmed].sort((a, b) => a.index - b.index),
    [byStatus]
  );
  const [tab, setTab] = useState<string>("all");

  if (rows.length === 0) return null;

  const visibleStatuses = SMS_STATUS_ORDER.filter((s) => byStatus[s].length > 0);
  // Aba que esvaziou com a atualização automática (ex.: "Não enviado" no fim) volta para "Todos".
  const activeTab = isSmsRecipientStatus(tab) && byStatus[tab].length > 0 ? tab : "all";
  const statusLabel = (s: SmsRecipientStatus) => t(SMS_STATUS_LABEL_KEY[s]);

  const copyNumber = (n: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(n).then(
        () => toast.success(t("numberCopied")),
        () => toast.error(t("copyFailed")),
      );
    }
  };

  const exportFull = () => {
    const out: string[][] = [["status", "number", "timestamp", "error"]];
    for (const r of rows) {
      out.push([statusLabel(r.status), r.number, csvTimestamp(r.rawTimestamp), r.error]);
    }
    downloadCsv(`relatorio-disparo-${dispatch.id}-${Date.now()}.csv`, toCsv(out));
  };

  const exportErrors = () => {
    const out: string[][] = [["number", "timestamp", "error"]];
    for (const r of errorRows) {
      out.push([r.number, csvTimestamp(r.rawTimestamp), r.error || statusLabel(r.status)]);
    }
    downloadCsv(`relatorio-disparo-${dispatch.id}-erros-${Date.now()}.csv`, toCsv(out));
  };

  // Mesmo CSV da exportação de sempre; na linha SMS a coluna de status leva a situação
  // do número (`smsStatus`) quando o backend a manda — sem ela, o valor de sempre.
  const exportDelivery = async () => {
    try {
      const res = await getBulkDispatchReport(dispatch.id);
      const report = res.data;
      const out: string[][] = [
        ["number", "accepted", "provider_status", "message_id", "sent_at", "dispatch_error", "matched_by"],
      ];
      for (const recipient of report?.recipients ?? []) {
        const r = recipient as SmsReportRecipient;
        const smsStatus = r.smsStatus;
        const statusCell = isSmsRecipientStatus(smsStatus)
          ? statusLabel(smsStatus)
          : typeof smsStatus === "string" && smsStatus
            ? smsStatus
            : r.providerStatus ?? "";
        out.push([
          r.number,
          r.accepted ? "true" : "false",
          statusCell,
          r.messageId ?? "",
          r.sentAt ?? "",
          r.dispatchError === "active_conversation"
            ? t("skippedActiveConversation")
            : r.dispatchError ?? "",
          r.matchedBy ?? "",
        ]);
      }
      downloadCsv(`relatorio-disparo-${dispatch.id}-entrega-${Date.now()}.csv`, toCsv(out));
    } catch {
      toast.error(t("exportDeliveryFailed"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-base">{t("timelineTitle")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportFull}>
            <Download className="h-3.5 w-3.5 mr-1" /> {t("exportCsvAll")}
          </Button>
          <Button size="sm" variant="outline" onClick={exportErrors} disabled={errorRows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> {t("exportCsvErrors")}
          </Button>
          <Button size="sm" variant="outline" onClick={exportDelivery}>
            <Download className="h-3.5 w-3.5 mr-1" /> {t("exportCsvDelivery")}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="all" className="text-xs">
            {t("tabAll")} ({rows.length})
          </TabsTrigger>
          {visibleStatuses.map((s) => (
            <TabsTrigger key={s} value={s} className="text-xs">
              {statusLabel(s)} ({byStatus[s].length})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all">
          <ScrollArea className="h-72">
            <SmsRecipientList rows={rows} showStatus t={t} onCopy={copyNumber} />
          </ScrollArea>
        </TabsContent>
        {visibleStatuses.map((s) => (
          <TabsContent key={s} value={s}>
            <ScrollArea className="h-72">
              <SmsRecipientList rows={byStatus[s]} showStatus={false} t={t} onCopy={copyNumber} />
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MassaRelatorioPage() {
  const t = useTranslations("massaRelatorioPage");
  const tSms = useTranslations("massaSmsPage");
  const allowed = usePageAccess("massa");
  // O `return <AccessDenied />` fica DEPOIS de todos os hooks (a permissão pode mudar
  // com a tela aberta, pelo refresh de 30 s, e a ordem dos hooks não pode variar).

  // Quem pode cancelar um SMS em massa: o dono do disparo ou admin-like pelo critério
  // canônico (`isAdminLikeForByUser` do backend, que confere de novo no cancelamento).
  const currentUserId = useAuthStore((s) => s.user?.userId);
  const currentProfile = useAuthStore((s) => s.user?.profile);
  const supervisorIsLimited = useAuthStore((s) => s.isSupervisorAdmin());
  const customCanViewAllTickets = useAuthStore(
    (s) =>
      s.user?.profile === "custom" &&
      (s.user?.customProfile?.customPermissions as unknown as { tickets_view_all?: boolean } | undefined)
        ?.tickets_view_all === true
  );
  const isAdminLike =
    currentProfile === "admin" ||
    currentProfile === "superadmin" ||
    (currentProfile === "super" && !supervisorIsLimited) ||
    customCanViewAllTickets;

  const canCancelSms = (d: BulkDispatch): boolean => {
    if (!isSmsInProgress(d)) return false;
    if (isAdminLike) return true;
    const ownerId = d.userId ?? d.user?.id ?? null;
    return ownerId != null && currentUserId != null && Number(ownerId) === Number(currentUserId);
  };

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

  function getStatusLabel(status: string, dispatchType?: string): string {
    // SMS em segundo plano está de fato enviando: "Processando", separado do
    // "Incompleto" dos outros tipos (que ficam como sempre foram).
    if (dispatchType === "sms" && (status === "pending" || status === "processing")) {
      return t("statusProcessing");
    }
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

  // SMS em andamento ganha o selo de andamento; os demais, o selo de sempre.
  function renderStatusBadge(d: BulkDispatch) {
    if (isSmsInProgress(d)) {
      return (
        <Badge variant="info" className="gap-1 whitespace-nowrap">
          <Loader2 className="h-3 w-3 animate-spin" />
          {getStatusLabel(d.status, d.dispatchType)}
        </Badge>
      );
    }
    return (
      <Badge variant={getStatusVariant(d.status)}>
        {getStatusLabel(d.status, d.dispatchType)}
      </Badge>
    );
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

  // SMS em massa: cancelamento (com confirmação) e atualização automática
  const [cancelTarget, setCancelTarget] = useState<BulkDispatch | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const cancellingRef = useRef(false);
  // Backend sem as rotas de acompanhamento (404 sem código): desliga a atualização da página.
  const [smsPollDisabled, setSmsPollDisabled] = useState(false);
  // Disparo que o servidor diz não existir mais: sai da atualização automática.
  const droppedSmsIdsRef = useRef<Set<number>>(new Set());
  const openDetailsIdRef = useRef<number | null>(null);

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
      if (filterType === "sms") {
        // Backend antigo ou migration pendente recusam o tipo novo no filtro:
        // não há disparo SMS para mostrar — lista vazia, sem aviso de erro.
        setDispatches([]);
        setTotalCount(0);
      } else {
        toast.error(t("errorLoad"));
      }
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, filterStartDate, filterEndDate, page, rowsPerPage]);

  useEffect(() => {
    if (!allowed) return;
    loadData();
  }, [loadData, allowed]);

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

  // ── SMS em massa: atualização automática e cancelamento ─────────────────────

  const openDetailsId = modalOpen && selectedDetails ? selectedDetails.id : null;
  useEffect(() => {
    openDetailsIdRef.current = openDetailsId;
  }, [openDetailsId]);

  /** Mescla o retorno enxuto nas linhas da página e no detalhe aberto. */
  const applySmsLeans = useCallback((leans: SmsBulkDispatchLean[]) => {
    if (leans.length === 0) return;
    const byId = new Map<number, SmsBulkDispatchLean>(leans.map((lean) => [lean.id, lean] as const));
    setDispatches((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        const lean = byId.get(d.id);
        if (!lean) return d;
        const merged = mergeSmsLean(d, lean);
        if (merged !== d) changed = true;
        return merged;
      });
      return changed ? next : prev;
    });
    setSelectedDetails((prev) => {
      if (!prev) return prev;
      const lean = byId.get(prev.id);
      return lean ? mergeSmsLean(prev, lean) : prev;
    });
  }, []);

  /** Detalhe aberto terminou: relê o disparo completo uma vez (lista final de erros). */
  const reloadOpenSmsDetails = useCallback(async (id: number) => {
    try {
      // Leitura automática: sem o aviso global de "recurso fora do plano".
      const res = await api.get<BulkDispatch>(`/bulk-dispatch/${id}`, BACKGROUND_REQUEST);
      const fresh = res.data;
      if (!fresh || fresh.id !== id) return;
      setSelectedDetails((prev) => (prev && prev.id === id ? fresh : prev));
    } catch {
      /* segue com o que já está na tela */
    }
  }, []);

  const refreshSmsRow = useCallback(
    async (id: number) => {
      try {
        // Detalhe aberto nesta linha: traz junto os erros recentes (lista por número).
        const withErrors = openDetailsIdRef.current === id;
        const res = await fetchBulkSmsDispatch(id, withErrors ? { withErrors: true } : undefined);
        if (res.data && typeof res.data.id === "number") applySmsLeans([res.data]);
      } catch {
        /* a próxima leitura corrige */
      }
    },
    [applySmsLeans]
  );

  // Ids das linhas SMS em andamento na página, em texto (dependência estável do efeito).
  const activeSmsKey = useMemo(
    () => dispatches.filter((d) => isSmsInProgress(d) || isSmsCancelSettling(d)).map((d) => d.id).join(","),
    [dispatches]
  );

  // A cada 5 s, só enquanto houver SMS em andamento na página e com a aba visível:
  // 1 leitura enxuta por linha (quase sempre 1 a 3). O detalhe aberto recebe junto os
  // erros recentes, para a lista por número acompanhar o envio.
  useEffect(() => {
    if (!allowed || smsPollDisabled || !activeSmsKey) return;
    const ids = activeSmsKey
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

    const schedule = () => {
      if (stopped || running || timer || !isVisible()) return;
      timer = setTimeout(() => {
        timer = null;
        void tick();
      }, SMS_POLL_INTERVAL_MS);
    };

    const tick = async () => {
      if (stopped || running || !isVisible()) return;
      const targets = ids.filter((id) => !droppedSmsIdsRef.current.has(id));
      if (targets.length === 0) return;
      running = true;
      const openId = openDetailsIdRef.current;
      try {
        const results = await Promise.all(
          targets.map(async (id) => {
            try {
              const res = await fetchBulkSmsDispatch(id, id === openId ? { withErrors: true } : undefined);
              const lean = res.data && typeof res.data.id === "number" ? res.data : null;
              return { lean, legacy: false };
            } catch (err) {
              if (readBulkSmsErrorCode(err) === "ERR_BULK_DISPATCH_NOT_FOUND") {
                droppedSmsIdsRef.current.add(id);
              }
              return { lean: null, legacy: isLegacyBackend404(err) };
            }
          })
        );
        if (stopped) return;
        if (results.some((r) => r.legacy)) {
          setSmsPollDisabled(true);
          return;
        }
        const leans = results
          .map((r) => r.lean)
          .filter((lean): lean is SmsBulkDispatchLean => lean !== null);
        applySmsLeans(leans);
        const openLean = openId != null ? leans.find((lean) => lean.id === openId) : undefined;
        if (openLean && !isActiveDispatchStatus(openLean.status)) {
          void reloadOpenSmsDetails(openLean.id);
        }
      } finally {
        running = false;
      }
      schedule();
    };

    // Aba oculta pausa a atualização; ao voltar, atualiza na hora.
    const onVisibilityChange = () => {
      if (isVisible()) {
        if (!timer && !running) void tick();
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [allowed, smsPollDisabled, activeSmsKey, applySmsLeans, reloadOpenSmsDetails]);

  const handleConfirmCancel = async (target: BulkDispatch) => {
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setCancellingId(target.id);
    let resync = true;
    try {
      const res = await cancelBulkSmsDispatch(target.id);
      const status =
        typeof res.data?.status === "string" && res.data.status ? res.data.status : "cancelled";
      const patch = (d: BulkDispatch): BulkDispatch =>
        d.id === target.id && d.dispatchType === "sms"
          ? { ...d, status, cancellationReason: status === "cancelled" ? "user" : d.cancellationReason }
          : d;
      setDispatches((prev) => prev.map(patch));
      setSelectedDetails((prev) => (prev ? patch(prev) : prev));
      toast.success(t("cancelDispatchSuccess"));
    } catch (err) {
      if (readBulkSmsErrorStatus(err) === 403) {
        // Sem permissão: o aviso já sai pelo interceptor global.
        resync = false;
      } else if (readBulkSmsErrorCode(err) === "ERR_SMS_BULK_NOT_RUNNING") {
        // Terminou entre abrir a confirmação e clicar: não é erro.
        toast.info(tSms("errNotRunning"));
      } else {
        toast.error(t("cancelDispatchError"));
      }
    } finally {
      cancellingRef.current = false;
      setCancellingId(null);
    }
    // Contadores e motivo como o servidor gravou — ou o estado final, se ele já tinha terminado.
    if (resync) void refreshSmsRow(target.id);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  // Variables for template preview (positional, from metadata)
  const previewVariables: string[] = selectedDetails?.metadata?.variables ?? [];

  const smsReasonKey = isSmsDispatch(selectedDetails)
    ? smsReasonLabelKey(selectedDetails?.cancellationReason)
    : undefined;
  const smsRemovedDuplicates = isSmsDispatch(selectedDetails)
    ? Number(selectedDetails?.metadata?.removedDuplicates) || 0
    : 0;

  if (!allowed) return <AccessDenied />;

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
                  const viewButton = (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewDetails(d)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  );
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">#{d.id}</TableCell>
                      <TableCell>
                        {renderStatusBadge(d)}
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
                        {canCancelSms(d) ? (
                          <div className="flex items-center gap-1">
                            {viewButton}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setCancelTarget(d)}
                              disabled={cancellingId === d.id}
                              title={t("cancelDispatch")}
                              aria-label={t("cancelDispatch")}
                            >
                              {cancellingId === d.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          viewButton
                        )}
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
                    {renderStatusBadge(selectedDetails)}
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
                  {smsReasonKey && (
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{t(smsReasonKey)}</span>
                    </p>
                  )}
                  {canCancelSms(selectedDetails) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 text-destructive hover:text-destructive"
                      onClick={() => setCancelTarget(selectedDetails)}
                      disabled={cancellingId === selectedDetails.id}
                    >
                      {cancellingId === selectedDetails.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Ban className="mr-1 h-3.5 w-3.5" />
                      )}
                      {t("cancelDispatch")}
                    </Button>
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
                  {smsRemovedDuplicates > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("smsDuplicatesRemoved", { count: smsRemovedDuplicates })}
                    </p>
                  )}
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
                        balão de WhatsApp confunde; auditoria pós-impl. #15) e o SMS
                        também (texto simples logo abaixo) */}
                    {!isWabaTemplate(selectedDetails.dispatchType) &&
                      selectedDetails.dispatchType !== "email" &&
                      selectedDetails.dispatchType !== "sms" &&
                      (selectedDetails.message || selectedDetails.mediaUrl || selectedDetails.voiceUrl) && (
                        <NonOfficialPreview dispatch={selectedDetails} />
                      )}

                    {isSmsDispatch(selectedDetails) && selectedDetails.message && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{t("smsMessageLabel")}</p>
                        <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                          {selectedDetails.message}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Resultado por número: o SMS deriva da lista enviada + contadores + erros */}
              {isSmsDispatch(selectedDetails) ? (
                (selectedDetails.metadata?.contacts?.length ?? 0) > 0 && (
                  <div className="md:col-span-2">
                    <Card>
                      <CardContent className="pt-4">
                        <SmsDispatchResults key={selectedDetails.id} dispatch={selectedDetails} t={t} />
                      </CardContent>
                    </Card>
                  </div>
                )
              ) : (
                /* Timeline (sent + errors per contact) */
                ((selectedDetails.errors?.length ?? 0) > 0 ||
                  (selectedDetails.metadata?.sentContacts?.length ?? 0) > 0) && (
                  <div className="md:col-span-2">
                    <Card>
                      <CardContent className="pt-4">
                        <DispatchTimeline dispatch={selectedDetails} t={t} />
                      </CardContent>
                    </Card>
                  </div>
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação de cancelamento do SMS em massa */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelDispatch")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancelDispatchConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelDispatchKeep")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                const target = cancelTarget;
                if (target) void handleConfirmCancel(target);
              }}
            >
              {t("cancelDispatch")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
