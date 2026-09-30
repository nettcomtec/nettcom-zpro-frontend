"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, CalendarDays, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateRangePresets } from "@/components/ui/date-range-presets";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCentsBRL, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { aiCreditsErrorKey } from "@/components/ai-credits/topup-dialog";
import {
  fetchAiCreditsUsage,
  fetchAiCreditsUsageEvents,
  type AiCreditUsageDailyView,
  type AiCreditUsageEventView,
  type AiUsageSource,
} from "@/services/ai-credits";

// Consumo de IA do período: consolidado por dia e detalhe por chamada (guardado
// 90 dias). Valores cobrados usam `precise` porque uma chamada custa fração de
// centavo — com 2 casas toda linha apareceria como zero.

type Mode = "daily" | "detail";

// Origem vinda de um servidor mais novo não tem tradução: mostra o valor cru.
const KNOWN_SOURCES = new Set<string>([
  "agent", "agent_summary", "kb_embedding", "kb_query", "chatgpt",
  "copilot", "transcription", "speech", "vision",
]);

const DEFAULT_WINDOW_DAYS = 30;
// O período é do fuso de quem olha a tela; o servidor consolida o dia em
// America/Sao_Paulo e recorta o que existe.
const toYMD = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const defaultRange = (): { from: string; to: string } => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (DEFAULT_WINDOW_DAYS - 1));
  return { from: toYMD(from), to: toYMD(to) };
};

// "YYYY-MM-DD" é um dia de calendário: `new Date(dia)` seria lido como UTC e
// voltaria um dia em fuso negativo.
const dayToLocalDate = (day: string): Date => {
  const [year, month, date] = String(day || "").split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, date || 1);
};

export function UsageTable() {
  const t = useTranslations("aiCreditsPage");

  const [range, setRange] = useState(defaultRange);
  const [mode, setMode] = useState<Mode>("daily");

  const [daily, setDaily] = useState<AiCreditUsageDailyView[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [loadingDaily, setLoadingDaily] = useState(true);

  const [events, setEvents] = useState<AiCreditUsageEventView[]>([]);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const dailySeq = useRef(0);
  const eventsSeq = useRef(0);

  // Período pela metade (campo de data limpo) não vira request.
  const validRange = !!range.from && !!range.to && range.from <= range.to;

  const loadDaily = useCallback(async (from: string, to: string) => {
    dailySeq.current += 1;
    const seq = dailySeq.current;
    setLoadingDaily(true);
    try {
      const { data } = await fetchAiCreditsUsage({ from, to });
      if (dailySeq.current !== seq) return;
      setDaily(Array.isArray(data?.items) ? data.items : []);
      setTotalCents(Number(data?.totalChargedCents) || 0);
    } catch (err: unknown) {
      if (dailySeq.current !== seq) return;
      toast.error(t(aiCreditsErrorKey(err)));
      setDaily([]);
      setTotalCents(0);
    } finally {
      if (dailySeq.current === seq) setLoadingDaily(false);
    }
  }, [t]);

  const loadEvents = useCallback(async (from: string, to: string, cursor: string | null) => {
    eventsSeq.current += 1;
    const seq = eventsSeq.current;
    if (cursor) setLoadingMore(true);
    else setLoadingEvents(true);
    try {
      const { data } = await fetchAiCreditsUsageEvents({ from, to, cursor });
      if (eventsSeq.current !== seq) return;
      const rows = Array.isArray(data?.items) ? data.items : [];
      setEvents(prev => (cursor ? [...prev, ...rows] : rows));
      setEventsCursor(
        typeof data?.nextCursor === "string" && data.nextCursor ? data.nextCursor : null
      );
    } catch (err: unknown) {
      if (eventsSeq.current !== seq) return;
      toast.error(t(aiCreditsErrorKey(err)));
      if (!cursor) {
        setEvents([]);
        setEventsCursor(null);
      }
    } finally {
      if (eventsSeq.current === seq) {
        setLoadingEvents(false);
        setLoadingMore(false);
      }
    }
  }, [t]);

  // O total do período vem sempre do consolidado (o detalhe é paginado e não
  // somaria o período inteiro), então ele carrega nas duas visões.
  useEffect(() => {
    if (!validRange) return;
    const id = setTimeout(() => void loadDaily(range.from, range.to), 300);
    return () => clearTimeout(id);
  }, [validRange, range.from, range.to, loadDaily]);

  // Detalhe só é buscado quando a visão está aberta.
  useEffect(() => {
    if (!validRange || mode !== "detail") return;
    const id = setTimeout(() => void loadEvents(range.from, range.to, null), 300);
    return () => clearTimeout(id);
  }, [validRange, mode, range.from, range.to, loadEvents]);

  useEffect(() => () => {
    dailySeq.current += 1;
    eventsSeq.current += 1;
  }, []);

  const sourceLabel = (source: AiUsageSource): string =>
    KNOWN_SOURCES.has(source) ? t(`source_${source}`) : String(source);

  const money = (cents: number): string =>
    formatCentsBRL(Number(cents) || 0, { precise: true });

  const segmentClass = (active: boolean) =>
    cn(
      "flex min-h-8 min-w-0 items-center justify-center gap-1.5 rounded px-2.5 py-1 text-center text-sm leading-tight transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      active
        ? "bg-background font-medium text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    );

  const loadingCurrent = mode === "daily" ? loadingDaily : loadingEvents;
  const rowsCount = mode === "daily" ? daily.length : events.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(2,minmax(0,12rem))]">
          <div className="space-y-1.5">
            <Label htmlFor="ai-usage-from">{t("usageFrom")}</Label>
            <Input
              id="ai-usage-from"
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={e => setRange(prev => ({ ...prev, from: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-usage-to">{t("usageTo")}</Label>
            <Input
              id="ai-usage-to"
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={e => setRange(prev => ({ ...prev, to: e.target.value }))}
            />
          </div>
        </div>

        <DateRangePresets onSelect={(start, end) => setRange({ from: start, to: end })} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="radiogroup"
            aria-label={`${t("usageDaily")} / ${t("usageDetail")}`}
            className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === "daily"}
              onClick={() => setMode("daily")}
              className={segmentClass(mode === "daily")}
            >
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{t("usageDaily")}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "detail"}
              onClick={() => setMode("detail")}
              className={segmentClass(mode === "detail")}
            >
              <CalendarClock className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{t("usageDetail")}</span>
            </button>
          </div>

          <p className="text-sm text-muted-foreground">
            {t("usageTotal")}
            <span className="ml-1.5 font-semibold tabular-nums text-foreground">
              {money(totalCents)}
            </span>
          </p>
        </div>
      </div>

      {mode === "detail" && (
        <p className="text-xs text-muted-foreground">{t("usageDetailNote")}</p>
      )}

      {loadingCurrent ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rowsCount === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center">
          <p className="px-4 text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{t("colDate")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("colSource")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("colModel")}</TableHead>
                  {mode === "daily" && (
                    <TableHead className="whitespace-nowrap text-right">{t("colCalls")}</TableHead>
                  )}
                  <TableHead className="whitespace-nowrap text-right">{t("colInputTokens")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colOutputTokens")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colCharged")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mode === "daily"
                  ? daily.map(row => (
                      <TableRow key={`${row.day}|${row.source}|${row.model}`}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(dayToLocalDate(row.day), { dateStyle: "short" })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{sourceLabel(row.source)}</TableCell>
                        <TableCell className="max-w-[14rem] break-all font-mono text-xs">
                          {row.model || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatNumber(Number(row.calls) || 0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                          {formatNumber(Number(row.inputTokens) || 0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                          {formatNumber(Number(row.outputTokens) || 0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium">
                          {money(row.chargedCents)}
                        </TableCell>
                      </TableRow>
                    ))
                  : events.map(row => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(row.createdAt, { dateStyle: "short", timeStyle: "short" })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{sourceLabel(row.source)}</TableCell>
                        <TableCell className="max-w-[14rem] break-all font-mono text-xs">
                          {row.model || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                          {formatNumber(Number(row.inputTokens) || 0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                          {formatNumber(Number(row.outputTokens) || 0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium">
                          {money(row.chargedCents)}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {mode === "detail" && eventsCursor && !loadingEvents && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loadingMore}
            onClick={() => void loadEvents(range.from, range.to, eventsCursor)}
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
