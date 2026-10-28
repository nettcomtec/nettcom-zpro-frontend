"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Filter, Inbox, Loader2, RotateCw, ShieldAlert,
  TriangleAlert, X,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FORM_LIMITS,
  FORM_SUBMISSION_STATUSES,
  type FormConfirmationOutcome,
  type FormField,
  type FormSubmissionItem,
  type FormSubmissionStatus,
  type FormSubmissionsResponse,
} from "@/lib/forms";
import { fetchFormSubmissions, getRequestStatus, retryFormSubmission, type FormSubmissionsQuery } from "@/services/forms";
import {
  FieldNote,
  InfoHint,
  formErrorKey,
  formatAnswerValue,
  isKnownFormError,
} from "@/components/forms/editor/form-editor-shared";

export interface ResponsesTabProps {
  formId: number;
  formSlug: string;
  /** Campos salvos: ordem e rótulos das colunas da planilha. */
  fields: FormField[];
  /** Situação já filtrada ao abrir (vinda dos contadores da lista). "pending" = recebido ou processando. */
  initialStatus?: ResponsesStatusFilter | null;
}

/** Filtro de situação da tela: uma situação ou "pending" (recebido + processando). */
export type ResponsesStatusFilter = FormSubmissionStatus | "pending";

const PENDING_STATUSES = "received,processing";

const PAGE_SIZE = 25;
// Envio parado em "recebido" há mais de 2 min (ou em "processando" há mais de 5 min) está
// preso: a mesma regra da retomada automática do servidor, contada da última mudança do
// envio (updatedAt; backend sem o campo = data do envio).
const STUCK_RECEIVED_MS = 2 * 60 * 1000;
const STUCK_PROCESSING_MS = 5 * 60 * 1000;

const CONFIRMATION_VARIANTS: Record<FormConfirmationOutcome, BadgeProps["variant"]> = {
  sent: "success-soft",
  skipped: "outline",
  failed: "destructive-soft",
};

const STATUS_VARIANTS: Record<FormSubmissionStatus, BadgeProps["variant"]> = {
  received: "secondary",
  processing: "info-soft",
  processed: "success-soft",
  failed: "destructive-soft",
  suspect: "warning-soft",
  skipped: "outline",
};

interface Filters {
  from: string;
  to: string;
  status: ResponsesStatusFilter | "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayStartIso = (date: string): string | undefined => {
  if (!DATE_RE.test(date)) return undefined;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

const dayEndIso = (date: string): string | undefined => {
  if (!DATE_RE.test(date)) return undefined;
  const d = new Date(`${date}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

const toQuery = (filters: Filters, page: number, limit: number): FormSubmissionsQuery => ({
  page,
  limit,
  from: filters.from ? dayStartIso(filters.from) : undefined,
  to: filters.to ? dayEndIso(filters.to) : undefined,
  status: filters.status === "pending" ? PENDING_STATUSES : filters.status || undefined,
});

const isStuck = (item: FormSubmissionItem, now: number): boolean => {
  const changed = new Date(item.updatedAt || item.createdAt).getTime();
  if (!Number.isFinite(changed)) return false;
  if (item.status === "received") return now - changed > STUCK_RECEIVED_MS;
  if (item.status === "processing") return now - changed > STUCK_PROCESSING_MS;
  return false;
};

// ── Planilha (CSV) ────────────────────────────────────────────────────────────
// Célula que começa com = + - @ (ou tab/retorno) seria lida como fórmula pela planilha:
// ganha um apóstrofo na frente.
const FORMULA_START = /^[=+\-@\t\r]/;

const csvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

const csvDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const todayStamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export function ResponsesTab({ formId, formSlug, fields, initialStatus }: ResponsesTabProps) {
  const t = useTranslations("formsPage");
  const initialFilters: Filters = { from: "", to: "", status: initialStatus ?? "" };
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FormSubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [suspectTarget, setSuspectTarget] = useState<FormSubmissionItem | null>(null);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seqRef = useRef(0);

  const load = useCallback(
    async (nextFilters: Filters, nextPage: number) => {
      const seq = ++seqRef.current;
      setLoading(true);
      try {
        const res = await fetchFormSubmissions(formId, toQuery(nextFilters, nextPage, PAGE_SIZE));
        if (seq !== seqRef.current) return;
        setData(res);
        setLoadFailed(false);
        setNow(Date.now());
      } catch {
        if (seq !== seqRef.current) return;
        setLoadFailed(true);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [formId]
  );

  useEffect(() => {
    void load(filters, page);
  }, [load, filters, page]);

  const applyFilters = () => {
    if (draft.from && draft.to && draft.from > draft.to) {
      toast.error(t("responses.invalidRange"));
      return;
    }
    setExpanded(new Set());
    setPage(1);
    setFilters({ ...draft });
  };

  const clearFilters = () => {
    const empty: Filters = { from: "", to: "", status: "" };
    setDraft(empty);
    setExpanded(new Set());
    setPage(1);
    setFilters(empty);
  };

  const hasFilters = !!(filters.from || filters.to || filters.status);
  const draftChanged = draft.from !== filters.from || draft.to !== filters.to || draft.status !== filters.status;

  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const errorText = (code: string | null): string =>
    code ? (isKnownFormError(code) ? t(formErrorKey(code)) : t("responses.unknownError")) : "";

  const replaceItem = (item: FormSubmissionItem) =>
    setData((prev) =>
      prev ? { ...prev, submissions: prev.submissions.map((s) => (s.id === item.id ? { ...s, ...item } : s)) } : prev
    );

  const runRetry = async (item: FormSubmissionItem) => {
    if (busyId !== null) return;
    setBusyId(item.id);
    try {
      const updated = await retryFormSubmission(formId, item.id);
      if (updated) {
        replaceItem(updated);
        setNow(Date.now());
        if (updated.status === "processed") toast.success(t("responses.retryDone"));
        else if (updated.status === "failed") toast.error(t("responses.retryFailed", { reason: errorText(updated.errorCode) }));
        else if (updated.status === "skipped") toast.warning(t("responses.retrySkipped"));
        else toast.info(t("responses.retryPending"));
      } else {
        toast.success(t("responses.retryPending"));
        void load(filters, page);
      }
    } catch (err) {
      const code = getBackendErrorCode(err);
      // "Sem permissão" e "fora do plano" já têm aviso geral do painel.
      if (code !== "ERR_NO_PERMISSION" && getRequestStatus(err) !== 402) toast.error(t(formErrorKey(code)));
      if (code === "ERR_FORM_SUBMISSION_BUSY" || code === "ERR_FORM_SUBMISSION_NOT_FOUND") void load(filters, page);
    } finally {
      setBusyId(null);
    }
  };

  // ── Exportação: páginas de 500 buscadas pelo navegador, até 10.000 linhas ──
  const exportCsv = async () => {
    if (exporting) return;
    const total = data?.count ?? 0;
    if (total === 0) {
      toast.warning(t("responses.exportEmpty"));
      return;
    }
    const maxRows = FORM_LIMITS.exportMaxRows;
    setExporting(true);
    const toastId = toast.loading(t("responses.exporting", { done: 0, total: Math.min(total, maxRows) }));
    try {
      const rows: FormSubmissionItem[] = [];
      const seen = new Set<number>();
      let currentPage = 1;
      let serverCount = total;
      while (rows.length < maxRows) {
        const res = await fetchFormSubmissions(formId, toQuery(filters, currentPage, FORM_LIMITS.exportPageSize));
        serverCount = res.count;
        for (const item of res.submissions) {
          if (rows.length >= maxRows) break;
          // Envio novo durante a exportação empurra as páginas: o mesmo envio pode voltar.
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          rows.push(item);
        }
        toast.loading(t("responses.exporting", { done: rows.length, total: Math.min(serverCount, maxRows) }), {
          id: toastId,
        });
        if (!res.hasMore || res.submissions.length === 0) break;
        currentPage += 1;
      }

      // Colunas: os campos do formulário na ordem salva + campos que já não existem
      // mas aparecem nas respostas (com o rótulo da época).
      const columns: Array<{ key: string; label: string }> = fields.map((f) => ({ key: f.key, label: f.label || f.key }));
      const known = new Set(columns.map((c) => c.key));
      rows.forEach((row) => {
        (row.answers || []).forEach((answer) => {
          if (!known.has(answer.k)) {
            known.add(answer.k);
            columns.push({ key: answer.k, label: answer.l || answer.k });
          }
        });
      });
      const labelCount = new Map<string, number>();
      columns.forEach((c) => labelCount.set(c.label, (labelCount.get(c.label) ?? 0) + 1));
      const headerFor = (c: { key: string; label: string }) => ((labelCount.get(c.label) ?? 0) > 1 ? `${c.label} (${c.key})` : c.label);

      const yes = t("responses.yes");
      const no = t("responses.no");
      const header = [
        t("responses.csvDate"),
        t("responses.csvStatus"),
        t("responses.csvError"),
        t("responses.csvSource"),
        t("responses.csvContact"),
        t("responses.csvTicket"),
        t("responses.csvConfirmation"),
      ].concat(columns.map(headerFor));
      const lines = [header.map(csvCell).join(",")];
      rows.forEach((row) => {
        const byKey = new Map((row.answers || []).map((a) => [a.k, a] as const));
        const cells: unknown[] = [
          csvDate(row.createdAt),
          t(`responses.statuses.${row.status}`),
          row.errorCode ?? "",
          t(`responses.sources.${row.source}`),
          row.contact?.name ?? "",
          row.ticketId ?? "",
          row.confirmation ? t(`responses.confirmation.${row.confirmation}`) : "",
        ];
        columns.forEach((c) => {
          const answer = byKey.get(c.key);
          cells.push(answer ? formatAnswerValue(answer, yes, no) : "");
        });
        lines.push(cells.map(csvCell).join(","));
      });
      const bom = String.fromCharCode(0xfeff);
      const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${formSlug || "form"}-${todayStamp()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t("responses.exportDone", { count: rows.length }), { id: toastId });
      if (serverCount > maxRows) toast.info(t("responses.exportCapped", { max: maxRows }));
    } catch {
      toast.error(t("responses.exportFailed"), { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const items = data?.submissions ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const statusLegend = useMemo(
    () => FORM_SUBMISSION_STATUSES.map((s) => `${t(`responses.statuses.${s}`)}: ${t(`responses.statusHints.${s}`)}`).join(" · "),
    [t]
  );

  return (
    <div className="grid min-w-0 gap-4">
      {/* ── Filtros ── */}
      <div className="grid gap-3 rounded-lg border p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{t("responses.filters")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="form-responses-from">{t("responses.from")}</Label>
            <Input
              id="form-responses-from"
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="form-responses-to">{t("responses.to")}</Label>
            <Input
              id="form-responses-to"
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="form-responses-status">{t("responses.status")}</Label>
              <InfoHint text={statusLegend} />
            </div>
            <Select
              value={draft.status || "all"}
              onValueChange={(v) => setDraft((d) => ({ ...d, status: v === "all" ? "" : (v as ResponsesStatusFilter) }))}
            >
              <SelectTrigger id="form-responses-status" className="min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("responses.allStatuses")}</SelectItem>
                <SelectItem value="pending">{t("responses.pendingFilter")}</SelectItem>
                {FORM_SUBMISSION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`responses.statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button type="button" onClick={applyFilters} disabled={!draftChanged || loading} className="gap-1.5">
              <Filter className="h-4 w-4" />
              {t("responses.apply")}
            </Button>
            {(hasFilters || draftChanged) && (
              <Button type="button" variant="ghost" onClick={clearFilters} className="gap-1.5">
                <X className="h-4 w-4" />
                {t("responses.clear")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Cabeçalho da lista ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {loading && !data ? t("responses.loading") : t("responses.count", { count })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load(filters, page)}
            disabled={loading}
            className="gap-1.5"
          >
            <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {t("responses.refresh")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void exportCsv()}
            disabled={exporting || count === 0}
            className="gap-1.5"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? t("responses.exportingShort") : t("responses.export")}
          </Button>
        </div>
      </div>
      <FieldNote>{t("responses.exportHint", { max: FORM_LIMITS.exportMaxRows })}</FieldNote>

      {/* ── Lista ── */}
      {loading && !data ? (
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : loadFailed && !data ? (
        <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>{t("responses.loadFailed")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load(filters, page)} className="shrink-0 gap-1.5">
            <RotateCw className="h-3.5 w-3.5" />
            {t("retry")}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={hasFilters ? t("responses.emptyFiltered") : t("responses.empty")}
          description={hasFilters ? t("responses.emptyFilteredBody") : t("responses.emptyBody")}
          className="py-10"
        />
      ) : (
        <ul className={cn("grid gap-2", loading && "opacity-60")}>
          {items.map((item) => {
            const open = expanded.has(item.id);
            const stuck = isStuck(item, now);
            const canRetry = item.status === "failed" || stuck;
            const canProcess = item.status === "suspect";
            const busy = busyId === item.id;
            const answers = item.answers || [];
            return (
              <li key={item.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={STATUS_VARIANTS[item.status] ?? "secondary"} className="whitespace-nowrap">
                        {t(`responses.statuses.${item.status}`)}
                      </Badge>
                      {stuck && (
                        <Badge variant="warning-soft" className="whitespace-nowrap">
                          {t("responses.stuck")}
                        </Badge>
                      )}
                      <Badge variant="outline" className="whitespace-nowrap font-normal">
                        {t(`responses.sources.${item.source}`)}
                      </Badge>
                      {item.confirmation && (
                        <span className="inline-flex items-center gap-1">
                          <Badge
                            variant={CONFIRMATION_VARIANTS[item.confirmation] ?? "outline"}
                            className="whitespace-nowrap font-normal"
                          >
                            {t(`responses.confirmation.${item.confirmation}`)}
                          </Badge>
                          <InfoHint text={t(`responses.confirmationHints.${item.confirmation}`)} />
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.createdAt, { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                    <p className="text-sm">
                      {item.contact ? (
                        <Link href={`/contatos/${item.contact.id}`} className="font-medium hover:underline" prefetch={false}>
                          {item.contact.name || t("responses.noName")}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t("responses.noContact")}</span>
                      )}
                    </p>
                    {item.errorCode && (
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-destructive">
                        <span>{errorText(item.errorCode)}</span>
                        <code className="rounded bg-destructive/10 px-1 font-mono text-[10px]">{item.errorCode}</code>
                      </p>
                    )}
                    {item.status === "suspect" && <FieldNote>{t("responses.suspectNote")}</FieldNote>}
                    {item.status === "skipped" && <FieldNote>{t("responses.skippedNote")}</FieldNote>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.ticketId && (
                      <Button variant="outline" size="sm" asChild className="h-8 gap-1.5">
                        <Link href={`/atendimento?ticketId=${item.ticketId}`} prefetch={false}>
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t("responses.openTicket")}
                        </Link>
                      </Button>
                    )}
                    {canRetry && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => void runRetry(item)}
                        disabled={busyId !== null}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                        {t("responses.retry")}
                      </Button>
                    )}
                    {canProcess && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => setSuspectTarget(item)}
                        disabled={busyId !== null}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                        {t("responses.process")}
                      </Button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleExpanded(item.id)}
                  aria-expanded={open}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                  {open ? t("responses.hideAnswers") : t("responses.showAnswers", { count: answers.length })}
                </button>
                {open && (
                  answers.length === 0 ? (
                    <FieldNote className="mt-2">{t("responses.noAnswers")}</FieldNote>
                  ) : (
                    <dl className="mt-2 grid gap-x-4 gap-y-1.5 rounded-md bg-muted/40 p-2.5 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                      {answers.map((answer) => (
                        <div key={answer.k} className="contents">
                          <dt className="min-w-0 break-words text-xs font-medium text-muted-foreground sm:text-sm">
                            {answer.l || answer.k}
                            {answer.t === "hidden" && (
                              <span className="ml-1 text-[10px] font-normal">({t("responses.hiddenField")})</span>
                            )}
                          </dt>
                          <dd className="min-w-0 whitespace-pre-wrap break-words">
                            {formatAnswerValue(answer, t("responses.yes"), t("responses.no")) || "—"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Paginação ── */}
      {data && (count > PAGE_SIZE || page > 1) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("responses.page", { page, total: totalPages })}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("responses.previous")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.hasMore || loading}
              className="gap-1"
            >
              {t("responses.next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={suspectTarget !== null} onOpenChange={(open) => { if (!open) setSuspectTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("responses.processTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("responses.processBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = suspectTarget;
                setSuspectTarget(null);
                if (target) void runRetry(target);
              }}
            >
              {t("responses.process")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
