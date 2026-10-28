"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarRange, Clock, MessageSquareWarning, RefreshCw, Star } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/charts/stat-card";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchGoogleReviewSummary, type GoogleReviewSummary } from "@/services/google-business";
import { GoogleInfoTip, formatGoogleRating, googleBusinessErrorText, googleLocationLabel } from "./google-connection-card";

// Série única por gráfico: slot 1 da paleta de gráficos do tema (claro e escuro).
const SERIES_COLOR = "hsl(var(--chart-1))";
const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

interface GoogleReviewsSummaryProps {
  locationId?: number;
  /** AAAA-MM-DD */
  from?: string;
  /** AAAA-MM-DD */
  to?: string;
  reloadKey: number;
}

function monthDate(month: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

function monthShort(month: string): string {
  const d = monthDate(month);
  if (!d) return month;
  try {
    return formatDate(d, { month: "short", year: "2-digit" });
  } catch {
    return month;
  }
}

function monthLong(month: string): string {
  const d = monthDate(month);
  if (!d) return month;
  try {
    return formatDate(d, { month: "long", year: "numeric" });
  } catch {
    return month;
  }
}

interface ChartTipProps {
  active?: boolean;
  payload?: Array<{ value?: number | null; payload?: { month?: string } }>;
  valueText: (value: number) => string;
}

/** Valor em destaque, mês em segundo plano (o leitor já sabe qual é a série). */
function ChartTip({ active, payload, valueText }: ChartTipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = item?.value;
  const month = item?.payload?.month ?? "";
  if (value === null || value === undefined) return null;
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-card-foreground shadow-md">
      <p className="text-sm font-semibold">{valueText(Number(value))}</p>
      <p className="text-xs text-muted-foreground">{monthLong(month)}</p>
    </div>
  );
}

export function GoogleReviewsSummary({ locationId, from, to, reloadKey }: GoogleReviewsSummaryProps) {
  const t = useTranslations("googleReviews");
  const [data, setData] = useState<GoogleReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    setLoading(true);
    setErrorText(null);
    fetchGoogleReviewSummary({ locationId, from, to })
      .then(({ data: res }) => {
        if (seq !== seqRef.current) return;
        setData(res ?? null);
      })
      .catch((err) => {
        if (seq !== seqRef.current) return;
        setErrorText(googleBusinessErrorText(t, err) ?? t("summaryError"));
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, from, to, reloadKey, retryKey]);

  const formatDuration = (hours: number | null | undefined): string => {
    if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) return "—";
    const h = Number(hours);
    if (h < 1) return t("durationMinutes", { count: Math.max(1, Math.round(h * 60)) });
    if (h < 48) return t("durationHours", { count: Math.max(1, Math.round(h)) });
    return t("durationDays", { count: Math.max(1, Math.round(h / 24)) });
  };

  const monthly = useMemo(
    () =>
      (Array.isArray(data?.monthly) ? data!.monthly : []).map((m) => ({
        month: m.month,
        label: monthShort(m.month),
        count: Number(m.count) || 0,
        average: m.average === null || m.average === undefined || !Number.isFinite(Number(m.average)) ? null : Number(m.average),
      })),
    [data],
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (errorText && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">{errorText}</p>
          <Button variant="outline" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4" />
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const locations = Array.isArray(data.locations) ? data.locations : [];
  const ratedLocations = locations.filter((l) => l.averageRating !== null && Number(l.totalReviewCount) > 0);
  const googleTotal = ratedLocations.reduce((s, l) => s + (Number(l.totalReviewCount) || 0), 0);
  // Média de várias fichas: ponderada pelo total de cada uma (a média das médias distorceria).
  const googleAverage = googleTotal > 0
    ? ratedLocations.reduce((s, l) => s + Number(l.averageRating) * (Number(l.totalReviewCount) || 0), 0) / googleTotal
    : null;
  const starCounts = data.starCounts || ({} as GoogleReviewSummary["starCounts"]);
  const starRows = ([5, 4, 3, 2, 1] as const).map((n) => ({
    n,
    count: Number(starCounts[String(n) as keyof GoogleReviewSummary["starCounts"]]) || 0,
  }));
  const periodTotal = starRows.reduce((s, r) => s + r.count, 0);
  const maxStarCount = Math.max(1, ...starRows.map((r) => r.count));
  const hasMonthly = monthly.some((m) => m.count > 0);

  return (
    <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("summaryRatingTitle")}
          value={googleAverage !== null ? formatGoogleRating(googleAverage) : "—"}
          icon={Star}
          info={t("summaryRatingTip")}
          description={
            locations.length > 1
              ? t("summaryRatingDescMulti", { count: googleTotal, locations: locations.length })
              : t("summaryRatingDesc", { count: googleTotal })
          }
          delay={0}
        />
        <StatCard
          title={t("summaryPeriodCount")}
          value={periodTotal}
          icon={CalendarRange}
          info={t("summaryPeriodCountTip")}
          delay={1}
        />
        <StatCard
          title={t("summaryUnanswered")}
          value={Number(data.unansweredCount) || 0}
          icon={MessageSquareWarning}
          info={t("summaryUnansweredTip")}
          delay={2}
        />
        <StatCard
          title={t("summaryAvgResponse")}
          value={formatDuration(data.avgResponseHours)}
          icon={Clock}
          info={t("summaryAvgResponseTip")}
          delay={3}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
              {t("starsDistributionTitle")}
              <GoogleInfoTip text={t("starsDistributionTip")} label={t("infoLabel")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {starRows.map((row) => (
              <div key={row.n} className="flex items-center gap-2 text-xs">
                <span className="inline-flex w-8 shrink-0 items-center gap-0.5 tabular-nums text-muted-foreground" aria-label={t("starsAria", { count: row.n })}>
                  {row.n}
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden />
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(row.count / maxStarCount) * 100}%`, background: SERIES_COLOR }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums">{formatNumber(row.count)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
              {t("monthlyTitle")}
              <GoogleInfoTip text={t("monthlyTip")} label={t("infoLabel")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hasMonthly ? (
              <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">{t("monthlyEmpty")}</div>
            ) : (
              <>
                {/* Duas escalas diferentes (quantidade × nota de 1 a 5): dois gráficos, nunca dois eixos no mesmo. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">{t("monthlyCountTitle")}</p>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthly} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
                          <RechartsTooltip
                            cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                            content={<ChartTip valueText={(v) => t("listCount", { count: v })} />}
                          />
                          <Bar dataKey="count" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">{t("monthlyAverageTitle")}</p>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
                          <RechartsTooltip
                            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                            content={<ChartTip valueText={(v) => formatGoogleRating(v)} />}
                          />
                          <Line
                            type="monotone"
                            dataKey="average"
                            stroke={SERIES_COLOR}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            connectNulls={false}
                            dot={{ r: 4, fill: SERIES_COLOR, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                            activeDot={{ r: 5, fill: SERIES_COLOR, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  aria-expanded={showTable}
                  onClick={() => setShowTable((v) => !v)}
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  {showTable ? t("monthlyTableHide") : t("monthlyTableToggle")}
                </button>
                {showTable && (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("colMonth")}</TableHead>
                          <TableHead className="text-right">{t("colCount")}</TableHead>
                          <TableHead className="text-right">{t("colAverage")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthly.map((m) => (
                          <TableRow key={m.month}>
                            <TableCell className="capitalize">{monthLong(m.month)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(m.count)}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.average !== null ? formatGoogleRating(m.average) : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {locations.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
              {t("byLocationTitle")}
              <GoogleInfoTip text={t("summaryRatingTip")} label={t("infoLabel")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colLocation")}</TableHead>
                  <TableHead className="text-right">{t("colGoogleAverage")}</TableHead>
                  <TableHead className="text-right">{t("colGoogleTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{googleLocationLabel(t, l)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.averageRating !== null && l.averageRating !== undefined ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden />
                          {formatGoogleRating(l.averageRating)}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(l.totalReviewCount) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
