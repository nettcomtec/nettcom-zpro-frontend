"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  change?: number;
  /** Texto exibido após o percentual (ex.: "vs. período anterior"). Sem ele, mostra só o %. */
  changeLabel?: string;
  /** Métricas de tempo: delta NEGATIVO é melhora (verde) e positivo é piora (vermelho). */
  invertChange?: boolean;
  description?: string;
  info?: string;
  className?: string;
  delay?: number;
  sparkline?: { date: string; value: number }[];
  sparklineColor?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel,
  invertChange = false,
  description,
  info,
  className,
  delay = 0,
  sparkline,
  sparklineColor = "hsl(220, 70%, 50%)",
}: StatCardProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  const numericValue = typeof value === "number" ? value : null;
  const [displayValue, setDisplayValue] = useState(numericValue !== null ? "0" : String(value));

  useEffect(() => {
    if (!inView) return;
    if (numericValue !== null) {
      const duration = 900;
      const delayMs = delay * 100;
      const startTime = performance.now() + delayMs;
      let raf: number;
      const step = (now: number) => {
        if (now < startTime) { raf = requestAnimationFrame(step); return; }
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(Math.round(numericValue * eased).toLocaleString());
        if (progress < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    } else {
      setDisplayValue(String(value));
    }
  }, [inView, numericValue, value, delay]);

  const gradientId = `sg-${title.replace(/\W/g, "")}`;

  return (
    <motion.div
      ref={ref}
      className="h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ delay: delay * 0.08, duration: 0.35, ease: "easeOut" }}
    >
      <Card className={cn("h-full overflow-hidden hover:shadow-md transition-shadow", className)}>
        <CardContent className="p-4 h-full flex flex-col justify-between gap-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground leading-tight">
              {title}
              {info && (
                <span title={info} className="inline-block ml-1 align-middle text-muted-foreground/60 cursor-help">
                  <Info className="inline-block h-3 w-3" />
                </span>
              )}
            </p>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          </div>

          <div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{displayValue}</p>
            {change !== undefined && (
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium mt-0.5",
                (invertChange ? change <= 0 : change >= 0)
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              )}>
                {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span>{Math.abs(change)}%{changeLabel ? ` ${changeLabel}` : ""}</span>
              </div>
            )}
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>

          {sparkline && sparkline.length > 1 && (
            <div className="-mx-1 mt-1">
              <ResponsiveContainer width="100%" height={38}>
                <AreaChart data={sparkline} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={sparklineColor} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={sparklineColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={sparklineColor}
                    strokeWidth={1.5}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    isAnimationActive={inView}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
