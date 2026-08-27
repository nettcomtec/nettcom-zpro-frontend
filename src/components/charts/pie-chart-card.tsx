"use client";

import React, { useMemo, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { PieChart, Pie, Cell, Sector, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";

interface PieChartData {
  name: string;
  value: number;
  color?: string;
}

interface PieChartCardProps {
  title: string;
  data: PieChartData[];
  donut?: boolean;
  /** Máximo de fatias reais; o excedente é agregado numa única fatia "Outros". */
  maxSlices?: number;
  /** Rótulo da fatia agregada (ex.: t("others")). */
  othersLabel?: string;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
];

const CHART_AREA_HEIGHT = 250;
const PIE_REGION_HEIGHT = 185;
const LEGEND_REGION_HEIGHT = CHART_AREA_HEIGHT - PIE_REGION_HEIGHT - 4;

function PieChartTooltipContent({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-card-foreground">
      <p className="font-medium text-sm">{item.name ?? "—"}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {item.value} ({pct}%)
      </p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActiveShape(props: any) {
  const {
    cx, cy, innerRadius, outerRadius,
    startAngle, endAngle, fill,
    payload, percent, value,
  } = props;
  const isDonut = innerRadius > 0;

  return (
    <g>
      {isDonut && (
        <>
          <text
            x={cx} y={cy - 8}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fill, fontWeight: 700, fontSize: 15 }}
          >
            {(percent * 100).toFixed(1)}%
          </text>
          <text
            x={cx} y={cy + 10}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          >
            {value}
          </text>
        </>
      )}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
}

export function PieChartCard({ title, data, donut = false, maxSlices, othersLabel }: PieChartCardProps) {
  const t = useTranslations("pieChartCard");
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  // Top-N + "Outros": quando a lista excede maxSlices, mantém as maiores fatias
  // e agrega as menores numa única fatia (o tooltip mostra o valor somado).
  const displayData = useMemo<PieChartData[]>(() => {
    if (!maxSlices || maxSlices < 1 || data.length <= maxSlices) return data;
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const rest = sorted.slice(maxSlices);
    return [
      ...sorted.slice(0, maxSlices),
      {
        name: othersLabel || "Outros",
        value: rest.reduce((sum, d) => sum + d.value, 0),
        color: "hsl(var(--muted-foreground))",
      },
    ];
  }, [data, maxSlices, othersLabel]);

  const total = displayData.reduce((sum, d) => sum + d.value, 0);
  const n = displayData.length;
  const manyItems = n > 4;
  const outerRadius = manyItems ? 54 : 64;
  const innerRadius = donut ? (manyItems ? 34 : 42) : 0;
  const pieCy = PIE_REGION_HEIGHT / 2;

  return (
    <Card ref={ref}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
            {t("noData")}
          </div>
        ) : (
          <div className="h-[250px] w-full flex flex-col">
            <div className="flex-shrink-0" style={{ height: PIE_REGION_HEIGHT }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart key={inView ? 1 : 0} margin={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                  <Pie
                    data={displayData}
                    cx="50%"
                    cy={pieCy}
                    innerRadius={innerRadius}
                    outerRadius={outerRadius}
                    paddingAngle={2}
                    dataKey="value"
                    activeIndex={activeIndex}
                    activeShape={<ActiveShape />}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(undefined)}
                    isAnimationActive={inView}
                    animationBegin={100}
                    animationDuration={700}
                    animationEasing="ease-out"
                  >
                    {displayData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color || COLORS[index % COLORS.length]}
                        style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                        opacity={activeIndex === undefined || activeIndex === index ? 1 : 0.55}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<PieChartTooltipContent total={total} />}
                    wrapperStyle={{ outline: "none" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div
              className="flex flex-wrap gap-x-4 gap-y-1.5 items-center justify-center pt-2 pb-1 px-1 overflow-y-auto overflow-x-hidden"
              style={{ minHeight: 28, maxHeight: LEGEND_REGION_HEIGHT }}
            >
              {displayData.map((entry, index) => (
                <div
                  key={`legend-${index}`}
                  className="flex items-center gap-1.5 shrink-0 max-w-full cursor-pointer transition-opacity"
                  style={{ opacity: activeIndex === undefined || activeIndex === index ? 1 : 0.45 }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                  title={entry.name}
                >
                  <span
                    className="rounded-full shrink-0"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: entry.color || COLORS[index % COLORS.length],
                    }}
                  />
                  <span className={`text-muted-foreground truncate block min-w-0 ${manyItems ? "text-[11px] max-w-[100px]" : "text-xs max-w-[120px]"}`}>
                    {entry.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
