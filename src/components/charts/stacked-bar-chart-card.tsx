"use client";

import React, { useMemo, useRef } from "react";
import { useInView } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";

// Linha bruta vinda do backend: um par (categoria, série) com a contagem.
export interface StackedRow {
  queue?: string;
  reason?: string;
  qtd?: number | string;
}

interface StackedBarChartCardProps {
  title: string;
  rows: StackedRow[];
  horizontal?: boolean;
}

const SERIES_COLORS = [
  "hsl(220, 70%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(340, 65%, 50%)",
  "hsl(270, 55%, 55%)",
  "hsl(190, 65%, 45%)",
  "hsl(50, 80%, 50%)",
  "hsl(0, 65%, 50%)",
  "hsl(140, 55%, 45%)",
  "hsl(300, 50%, 55%)",
];

const toNum = (v: number | string | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
};

function StackedTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ name: string; value: number; color?: string; fill?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((p) => toNum(p.value) > 0);
  if (!visible.length) return null;
  const total = visible.reduce((s, p) => s + toNum(p.value), 0);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-card-foreground max-w-[260px]">
      <p className="font-medium text-sm mb-1">{label}</p>
      <div className="space-y-0.5">
        {visible.map((p) => (
          <div key={p.name} className="flex items-center gap-1.5 text-xs">
            <span className="rounded-full shrink-0" style={{ width: 8, height: 8, backgroundColor: p.color || p.fill }} />
            <span className="text-muted-foreground truncate">{p.name}</span>
            <span className="ml-auto font-medium tabular-nums">{toNum(p.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 pt-1 border-t border-border/60 flex justify-between text-xs">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular-nums">{total}</span>
      </div>
    </div>
  );
}

export function StackedBarChartCard({ title, rows, horizontal = false }: StackedBarChartCardProps) {
  const t = useTranslations("barChartCard");
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  // Monta { categorias, séries, dados empilhados } a partir das linhas (fila, motivo, qtd).
  const { data, series } = useMemo(() => {
    const seriesTotals = new Map<string, number>();
    const catTotals = new Map<string, number>();
    const byCat = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const cat = (row.queue ?? "").trim() || "—";
      const ser = (row.reason ?? "").trim() || "—";
      const v = toNum(row.qtd);
      if (v <= 0) continue;
      seriesTotals.set(ser, (seriesTotals.get(ser) ?? 0) + v);
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + v);
      const bucket = byCat.get(cat) ?? {};
      bucket[ser] = (bucket[ser] ?? 0) + v;
      byCat.set(cat, bucket);
    }

    const orderedSeries = [...seriesTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const orderedCats = [...catTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const stacked = orderedCats.map((cat) => {
      const bucket = byCat.get(cat) ?? {};
      const entry: Record<string, number | string> = { name: cat };
      orderedSeries.forEach((s) => { entry[s] = bucket[s] ?? 0; });
      return entry;
    });

    return { data: stacked, series: orderedSeries };
  }, [rows]);

  const colorFor = (s: string) => SERIES_COLORS[series.indexOf(s) % SERIES_COLORS.length];

  return (
    <Card ref={ref}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 || series.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            {t("noData")}
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  key={inView ? 1 : 0}
                  data={data}
                  layout={horizontal ? "vertical" : "horizontal"}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  {horizontal ? (
                    <>
                      <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={110} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    </>
                  ) : (
                    <>
                      <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    </>
                  )}
                  <Tooltip
                    content={<StackedTooltipContent />}
                    wrapperStyle={{ outline: "none" }}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  />
                  {series.map((s, i) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      stackId="reasons"
                      fill={colorFor(s)}
                      maxBarSize={50}
                      isAnimationActive={inView}
                      animationDuration={700}
                      animationEasing="ease-out"
                      radius={i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Legenda das séries (motivos) */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center justify-center pt-2 px-1">
              {series.map((s) => (
                <div key={s} className="flex items-center gap-1.5 shrink-0 max-w-full" title={s}>
                  <span className="rounded-full shrink-0" style={{ width: 8, height: 8, backgroundColor: colorFor(s) }} />
                  <span className="text-muted-foreground truncate block min-w-0 text-xs max-w-[140px]">{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
