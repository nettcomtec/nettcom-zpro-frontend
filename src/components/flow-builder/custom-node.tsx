"use client";

import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { FlowNodeData, FlowCondition } from "./lib/types";
import {
  Play,
  Settings,
  MessageSquare,
  GitBranch,
  Zap,
  Pencil,
  Copy,
  Trash2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface CustomNodeProps {
  /** `hasError` é flag transitória injetada pelo flow-editor na validação do
   *  save (condição sem destino válido) — não faz parte do shape persistido */
  data: FlowNodeData & { hasError?: boolean };
  selected?: boolean;
}

const WEEKDAY_SHORT_KEYS = [
  "weekdaySun",
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
];

function formatWeekdayRange(
  weekdays: number[] | undefined,
  t: (key: string) => string
): string {
  if (!Array.isArray(weekdays) || weekdays.length === 0) return "—";
  const sorted = [...weekdays].sort((a, b) => a - b);
  if (sorted.length === 7) return t("weekdayRangeAll");

  // ranges contíguos
  const runs: number[][] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      current.push(sorted[i]);
    } else {
      runs.push(current);
      current = [sorted[i]];
    }
  }
  runs.push(current);

  return runs
    .map((r) =>
      r.length === 1
        ? t(WEEKDAY_SHORT_KEYS[r[0]])
        : `${t(WEEKDAY_SHORT_KEYS[r[0]])}-${t(WEEKDAY_SHORT_KEYS[r[r.length - 1]])}`
    )
    .join(", ");
}

function formatTimeWindow(
  startTime: string | undefined,
  endTime: string | undefined,
  t: (key: string) => string
): string {
  const s = startTime || "00:00";
  const e = endTime || "00:00";
  if (s === "00:00" && e === "00:00") return t("fullDay");
  return `${s} – ${e}`;
}

function CustomNodeComponent({ data, selected }: CustomNodeProps) {
  const t = useTranslations("flowBuilderCustomNode");

  const typeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    start: { icon: Play, color: "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400", label: t("labelStart") },
    configurations: { icon: Settings, color: "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400", label: t("labelConfigurations") },
    node: { icon: MessageSquare, color: "bg-primary/10 border-primary text-primary", label: t("labelNode") },
    timeTable: { icon: Clock, color: "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400", label: t("labelTimeTable") },
  };

  const config = typeConfig[data.type] || typeConfig.node;
  const Icon = config.icon;
  const interactionCount = data.interactions?.length || 0;
  const conditionCount = data.conditions?.length || 0;
  const actionCount = data.actions?.length || 0;

  const isTimeTable = data.type === "timeTable";
  const isAutoNode =
    data.type === "node" && (data.conditions || []).some((c) => c.type === "A");
  const timeBranches: FlowCondition[] = isTimeTable
    ? (data.conditions || []).filter((c) => c.type === "T")
    : [];
  const defaultBranch: FlowCondition | undefined = isTimeTable
    ? (data.conditions || []).find((c) => c.type === "US")
    : undefined;
  // Condições do nó comum (um source-handle por condição, estilo Typebot).
  // Handle só para roteamento por etapa (action 0) — fila/usuário/encerrar/canal
  // não geram edge.
  const nodeConditions: FlowCondition[] = data.type === "node" ? (data.conditions || []) : [];

  const conditionLabel = (c: FlowCondition): string => {
    if (c.type === "A") return `⚡ ${t("autoAdvanceBadge")}`;
    if (c.type === "US") return t("branchDefault");
    if (c.type === "V") {
      return `{{${c.variableKey || "?"}}} ${c.comparisonType || "equals"} ${c.value || ""}`.trim();
    }
    return c.value || (c.condition || []).join(", ") || "…";
  };

  const conditionRouted = (c: FlowCondition): boolean => (c.action ?? 0) === 0;

  return (
    <div
      className={cn(
        "relative min-w-[200px] max-w-[260px] rounded-lg border-2 bg-card shadow-md transition-all",
        config.color,
        data.hasError && "border-destructive",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      {data.type !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}

      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{data.name}</p>
            <p className="text-[10px] uppercase tracking-wider opacity-60">
              {config.label}
            </p>
          </div>
          {data.hasError && (
            <span
              title={t("nodeErrorBadgeTitle")}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            >
              <AlertTriangle className="h-3 w-3" />
            </span>
          )}
        </div>

        {data.type === "node" && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            {isAutoNode && (
              <span
                className="flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 font-medium text-primary"
                title={t("autoAdvanceBadgeTitle")}
              >
                <Zap className="h-3 w-3" />
                {t("autoAdvanceBadge")}
              </span>
            )}
            {interactionCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Zap className="h-3 w-3" />
                {interactionCount}
              </span>
            )}
            {conditionCount > 0 && (
              <span className="flex items-center gap-0.5">
                <GitBranch className="h-3 w-3" />
                {conditionCount}
              </span>
            )}
            {actionCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Settings className="h-3 w-3" />
                {actionCount}
              </span>
            )}
          </div>
        )}

        {data.type === "node" && nodeConditions.length > 0 && (
          <div className="mt-2 space-y-1">
            {nodeConditions.map((c, i) => (
              <div
                key={c.id || i}
                className="relative rounded border border-muted-foreground/20 bg-background/60 px-2 py-1 pr-3 text-[10px]"
              >
                <span className="block truncate text-muted-foreground">
                  {conditionLabel(c)}
                </span>
                {conditionRouted(c) && (
                  <Handle
                    type="source"
                    id={c.id}
                    position={Position.Right}
                    className="!absolute !-right-[20px] !top-1/2 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-background !bg-primary"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {isTimeTable && (
          <div className="mt-2 space-y-1">
            {timeBranches.length === 0 && !defaultBranch && (
              <p className="text-[10px] text-muted-foreground italic">
                {t("noBranchesYet")}
              </p>
            )}
            {timeBranches.map((b, i) => (
              <div
                key={b.id || i}
                className="relative rounded border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-2 py-1 text-[10px]"
              >
                <div className="flex items-center gap-1 font-medium text-amber-900 dark:text-amber-100">
                  <Clock className="h-2.5 w-2.5" />
                  {formatWeekdayRange(b.weekdays, t)}
                </div>
                <div className="text-amber-800 dark:text-amber-200/80">
                  {formatTimeWindow(b.startTime, b.endTime, t)}
                </div>
                {conditionRouted(b) && (
                  <Handle
                    type="source"
                    id={b.id}
                    position={Position.Right}
                    className="!absolute !-right-[20px] !top-1/2 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-background !bg-amber-500"
                  />
                )}
              </div>
            ))}
            {defaultBranch && (
              <div className="relative rounded border border-dashed border-muted-foreground/30 px-2 py-1 text-[10px] text-muted-foreground">
                → {t("branchDefault")}
                {conditionRouted(defaultBranch) && (
                  <Handle
                    type="source"
                    id={defaultBranch.id}
                    position={Position.Right}
                    className="!absolute !-right-[20px] !top-1/2 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-background !bg-primary"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {(data.type === "node" || data.type === "configurations" || isTimeTable) && (
          <div className="mt-2 flex justify-end gap-1">
            <button
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              data-action="edit"
            >
              <Pencil className="h-3 w-3" />
            </button>
            {(data.type === "node" || isTimeTable) && (
              <button
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                data-action="duplicate"
                title={t("duplicateStepTitle")}
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
            {(data.type === "node" || isTimeTable) && data.id !== "nodeC" && (
              <button
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                data-action="delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Handle do NÓ (conexão nova): nos tipos com handles por condição vai para a
          base do card — no meio da lateral ele flutuava entre as linhas de condição */}
      <Handle
        type="source"
        position={data.type === "node" || data.type === "timeTable" ? Position.Bottom : Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

export const FlowCustomNode = memo(CustomNodeComponent);
