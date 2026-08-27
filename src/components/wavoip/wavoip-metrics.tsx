"use client";

/**
 * WavoipMetrics — painel de métricas de chamadas WaVoIP no estilo do /dashboard.
 * Recebe um array de chamadas (da API WaVoIP) e renderiza StatCards + gráficos
 * (volume Entrada/Saída nos últimos 30 dias e horários de pico). Usado tanto na
 * aba "Login e Chamadas" (geral) quanto na aba "Por Token".
 */

import React, { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/charts/stat-card";
import { Layers, PhoneCall, PhoneIncoming, Percent, Clock, PhoneMissed } from "lucide-react";
import type { WaVoipCall } from "@/services/wavoip";

// Cores derivadas da paleta semântica do tema (globals.css) via CSS vars — assim
// acompanham o whitelabel/branding de cada tenant e ficam consistentes com o app.
const INCOMING_COLOR = "hsl(var(--info))";       // Entrada (azul)
const OUTGOING_COLOR = "hsl(var(--success))";    // Saída / Atendidas (verde)
const MISSED_COLOR = "hsl(var(--destructive))";  // Perdidas (vermelho)
const PRIMARY_COLOR = "hsl(var(--primary))";     // Horários de pico / Total (marca)

// ─── Classificadores tolerantes ───────────────────────────────────────────────
// A API WaVoIP não garante um conjunto fixo de strings de status/direção, então
// classificamos de forma defensiva (duração > 0 = atendida; "out" na direção =
// saída) para que as métricas funcionem independentemente do formato exato.

function callDurationSec(c: WaVoipCall): number {
  const raw = (c.duration ?? (c as unknown as { callDuration?: number | string }).callDuration) ?? 0;
  const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) && n > 0 ? Number(n) : 0;
}

// Statuses reais da API WaVoIP observados: ENDED (atendida/concluída), REJECTED,
// RINGING, FAILED, REJECTED_ELSEWHERE (não atendidas). "ended" é o marcador de
// chamada efetivamente atendida; mantemos os demais sinônimos por robustez.
const ANSWERED_HINTS = ["ended", "answer", "accept", "complete", "establish", "success", "atend", "conclu"];

function isAnswered(c: WaVoipCall): boolean {
  const s = String(c.status ?? "").toLowerCase();
  if (s && ANSWERED_HINTS.some((k) => s.includes(k))) return true;
  return callDurationSec(c) > 0;
}

// Direção: a API expõe um campo `direction` (a tabela tem coluna "Direção"),
// mas o valor exato não é garantido — cobrimos as variações usuais (EN/PT).
function callDir(c: WaVoipCall): "in" | "out" {
  const d = String(c.direction ?? "").toLowerCase();
  return /out|sa[ií]da|sent|enviad/.test(d) ? "out" : "in";
}

// A API WaVoIP pode expor a data sob nomes variados e como ISO string OU epoch
// (segundos/ms). Tentamos um conjunto amplo de campos e, em último caso, varremos
// qualquer campo cujo valor pareça uma data plausível — senão os gráficos
// temporais (sparklines/volume/pico) ficam zerados (linha reta).
const DATE_FIELDS = [
  "created_date", "createdAt", "created_at", "createdDate",
  "date", "datetime", "dateTime", "call_date", "callDate",
  "start_time", "startTime", "started_at", "startedAt", "start",
  "timestamp", "time", "updated_at", "updatedAt",
];

function parseDateValue(v: unknown): Date | null {
  if (typeof v === "number") {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const ms = s.length <= 10 ? n * 1000 : n;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function callDateObj(c: WaVoipCall): Date | null {
  const rec = c as unknown as Record<string, unknown>;
  for (const f of DATE_FIELDS) {
    const d = parseDateValue(rec[f]);
    if (d) return d;
  }
  // Fallback: qualquer campo com data plausível (filtra epochs de telefone/duração).
  for (const k of Object.keys(rec)) {
    const d = parseDateValue(rec[k]);
    if (d) {
      const y = d.getFullYear();
      if (y >= 2015 && y <= 2100) return d;
    }
  }
  return null;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatSeconds(total: number, secLabel: string): string {
  const s = Math.round(total);
  if (s < 60) return `${s} ${secLabel}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

// ─── Tooltips / legenda ────────────────────────────────────────────────────────
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="rounded-full" style={{ width: 8, height: 8, backgroundColor: color }} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function VolumeTooltip({
  active, payload, label, inLabel, outLabel,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string;
  inLabel: string;
  outLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const inV = payload.find((p) => p.dataKey === "in")?.value ?? 0;
  const outV = payload.find((p) => p.dataKey === "out")?.value ?? 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-card-foreground">
      <p className="font-medium text-sm">{label}</p>
      <p className="text-xs mt-0.5" style={{ color: INCOMING_COLOR }}>{inLabel}: {inV}</p>
      <p className="text-xs" style={{ color: OUTGOING_COLOR }}>{outLabel}: {outV}</p>
    </div>
  );
}

function PeakTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-card-foreground">
      <p className="font-medium text-sm">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{payload[0].value ?? 0}</p>
    </div>
  );
}

interface WavoipMetricsProps {
  calls: WaVoipCall[];
  /** Quantidade de canais/dispositivos WaVoIP (omitir oculta o card "Canais"). */
  channelCount?: number;
}

export function WavoipMetrics({ calls, channelCount }: WavoipMetricsProps) {
  const t = useTranslations("wavoipPage");
  const locale = useLocale();

  const agg = useMemo(() => {
    const total = calls.length;
    let answered = 0;
    let durSum = 0;
    let durCount = 0;

    // Datas parseadas uma vez. Janela de 30 dias ancorada na chamada MAIS RECENTE
    // (não em "hoje") para que dados históricos também apareçam nos gráficos.
    const dates = calls.map(callDateObj);
    let anchorMs = 0;
    for (const d of dates) if (d) anchorMs = Math.max(anchorMs, d.getTime());
    const anchor = anchorMs ? new Date(anchorMs) : new Date();
    anchor.setHours(0, 0, 0, 0);

    const keys: string[] = [];
    const map = new Map<string, { in: number; out: number; answered: number; missed: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      keys.push(k);
      map.set(k, { in: 0, out: 0, answered: 0, missed: 0 });
    }
    const hours = new Array<number>(24).fill(0);

    calls.forEach((c, idx) => {
      const ans = isAnswered(c);
      if (ans) {
        answered++;
        const dur = callDurationSec(c);
        if (dur > 0) { durSum += dur; durCount++; }
      }
      const d = dates[idx];
      if (d) {
        hours[d.getHours()]++;
        const day = new Date(d);
        day.setHours(0, 0, 0, 0);
        const bucket = map.get(dayKey(day));
        if (bucket) {
          if (callDir(c) === "in") bucket.in++; else bucket.out++;
          if (ans) bucket.answered++; else bucket.missed++;
        }
      }
    });

    const missed = total - answered;
    const answerRate = total ? Math.round((answered / total) * 100) : 0;
    const avgDuration = durCount ? durSum / durCount : 0;

    const fmtLabel = (k: string) =>
      new Date(`${k}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });

    const volume = keys.map((k) => {
      const b = map.get(k)!;
      return { label: fmtLabel(k), in: b.in, out: b.out };
    });
    const peak = hours.map((v, h) => ({ hour: `${h}h`, value: v }));
    const spark = (sel: (b: { in: number; out: number; answered: number; missed: number }) => number) =>
      keys.map((k) => ({ date: k, value: sel(map.get(k)!) }));

    return {
      total, answered, missed, answerRate, avgDuration,
      volume, peak,
      sparkTotal: spark((b) => b.in + b.out),
      sparkAnswered: spark((b) => b.answered),
      sparkMissed: spark((b) => b.missed),
    };
  }, [calls, locale]);

  const avgLabel = formatSeconds(agg.avgDuration, t("metricSeconds"));

  return (
    <div className="space-y-6">
      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 items-stretch">
        {channelCount !== undefined && (
          <StatCard title={t("metricChannels")} value={channelCount} icon={Layers} delay={0} />
        )}
        <StatCard title={t("metricTotalCalls")} value={agg.total} icon={PhoneCall} delay={1} sparkline={agg.sparkTotal} sparklineColor={PRIMARY_COLOR} />
        <StatCard title={t("metricAnswered")} value={agg.answered} icon={PhoneIncoming} delay={2} sparkline={agg.sparkAnswered} sparklineColor={OUTGOING_COLOR} />
        <StatCard title={t("metricAnswerRate")} value={`${agg.answerRate}%`} icon={Percent} delay={3} />
        <StatCard title={t("metricAvgDuration")} value={avgLabel} icon={Clock} delay={4} />
        <StatCard title={t("metricMissed")} value={agg.missed} icon={PhoneMissed} delay={5} sparkline={agg.sparkMissed} sparklineColor={MISSED_COLOR} />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Volume de chamadas (Entrada/Saída) — últimos 30 dias */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("chartVolumeTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={agg.volume} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="wvIncoming" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={INCOMING_COLOR} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={INCOMING_COLOR} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="wvOutgoing" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={OUTGOING_COLOR} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={OUTGOING_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" minTickGap={24} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    content={<VolumeTooltip inLabel={t("chartIncoming")} outLabel={t("chartOutgoing")} />}
                    wrapperStyle={{ outline: "none" }}
                  />
                  <Area type="monotone" dataKey="in" stroke={INCOMING_COLOR} strokeWidth={2} fill="url(#wvIncoming)" isAnimationActive animationDuration={800} />
                  <Area type="monotone" dataKey="out" stroke={OUTGOING_COLOR} strokeWidth={2} fill="url(#wvOutgoing)" isAnimationActive animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-4 pt-2">
              <LegendDot color={INCOMING_COLOR} label={t("chartIncoming")} />
              <LegendDot color={OUTGOING_COLOR} label={t("chartOutgoing")} />
            </div>
          </CardContent>
        </Card>

        {/* Horários de pico */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("chartPeakHours")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agg.peak} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" interval={3} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                    content={<PeakTooltip />}
                    wrapperStyle={{ outline: "none" }}
                  />
                  <Bar dataKey="value" fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
