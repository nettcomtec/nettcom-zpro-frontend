"use client";

import React, { useRef, useState } from "react";
import { useInView } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";

interface BarChartData {
  name: string;
  value: number;
  color?: string;
}

interface BarChartCardProps {
  title: string;
  data: BarChartData[];
  color?: string;
  horizontal?: boolean;
}

const BAR_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-9))",
  "hsl(var(--chart-10))",
];

function BarChartTooltipContent({
  active,
  payload,
  label,
  total,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { name?: string; value?: number } }>;
  label?: string;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const name = item.payload?.name ?? label ?? "—";
  const value = item.value ?? 0;
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-card-foreground">
      <p className="font-medium text-sm">{name}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {value} <span className="opacity-70">({pct}%)</span>
      </p>
    </div>
  );
}

export function BarChartCard({ title, data, horizontal = false }: BarChartCardProps) {
  const t = useTranslations("barChartCard");
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <Card ref={ref}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            {t("noData")}
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                key={inView ? 1 : 0}
                data={data}
                layout={horizontal ? "vertical" : "horizontal"}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                onMouseLeave={() => setActiveIndex(undefined)}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                {horizontal ? (
                  <>
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  </>
                ) : (
                  <>
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  </>
                )}
                <Tooltip
                  content={<BarChartTooltipContent total={total} />}
                  wrapperStyle={{ outline: "none" }}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                />
                <Bar
                  dataKey="value"
                  radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  maxBarSize={50}
                  isAnimationActive={inView}
                  animationDuration={700}
                  animationEasing="ease-out"
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color || BAR_COLORS[index % BAR_COLORS.length]}
                      opacity={activeIndex === undefined || activeIndex === index ? 1 : 0.5}
                      style={{ transition: "opacity 0.15s", cursor: "pointer" }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
