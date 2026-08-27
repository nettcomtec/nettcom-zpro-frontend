"use client";

import React, { useRef } from "react";
import { useInView } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";

interface AreaChartData {
  date: string;
  value: number;
}

interface AreaChartCardProps {
  title: string;
  data: AreaChartData[];
  color?: string;
  gradientColor?: string;
}

function AreaChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { date?: string; value?: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const dateLabel = item.payload?.date ?? label ?? "—";
  const value = item.value ?? item.payload?.value ?? 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-card-foreground">
      <p className="font-medium text-sm">{dateLabel}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{value}</p>
    </div>
  );
}

export function AreaChartCard({ title, data, color = "hsl(220, 70%, 50%)", gradientColor }: AreaChartCardProps) {
  const t = useTranslations("areaChartCard");
  const gColor = gradientColor || color;
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
              <AreaChart key={inView ? 1 : 0} data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={gColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={gColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis className="text-xs" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip content={<AreaChartTooltipContent />} wrapperStyle={{ outline: "none" }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill="url(#areaGradient)"
                  dot={data.length === 1 ? { r: 4, fill: color, stroke: color } : false}
                  isAnimationActive={inView}
                  animationBegin={100}
                  animationDuration={900}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
