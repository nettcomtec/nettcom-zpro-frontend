"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TASK_REMINDER_OPTIONS } from "@/lib/task-deadline";
import { useTaskSummaryStore } from "@/stores/task-summary-store";

export interface TaskDeadlineValue {
  date: string;
  time: string;
  reminderMinutes: number | null;
}

interface TaskDeadlineFieldsProps {
  value: TaskDeadlineValue;
  onChange: (value: TaskDeadlineValue) => void;
  /** Prefixo dos `id` dos campos (duas instâncias na mesma tela não podem repetir id). */
  idPrefix: string;
  disabled?: boolean;
  /** Marca a Data como inválida (vazia) depois de tentar salvar. */
  showDateError?: boolean;
  className?: string;
}

const REMINDER_LABEL_KEY: Record<number, string> = {
  0: "reminderAtTime",
  10: "reminder10",
  30: "reminder30",
  60: "reminder60"
};

/**
 * PLANO_TAREFAS_ATENDIMENTO_LEMBRETES §5.2 — Data (obrigatória), Hora (opcional) e Lembrete.
 * Hora e Lembrete só aparecem quando o backend tem as colunas novas (`timeSupported`): sem
 * elas a hora seria gravada como instante cru e a tarefa mudaria de dia.
 */
export function TaskDeadlineFields({
  value,
  onChange,
  idPrefix,
  disabled,
  showDateError,
  className
}: TaskDeadlineFieldsProps) {
  const t = useTranslations("taskShared");
  const timeSupported = useTaskSummaryStore((s) => s.timeSupported === true);
  const hasTime = timeSupported && /^\d{2}:\d{2}$/.test(value.time || "");

  const update = (patch: Partial<TaskDeadlineValue>) => {
    const next = { ...value, ...patch };
    // Sem hora não existe lembrete (o servidor também força isso).
    if (!/^\d{2}:\d{2}$/.test(next.time || "")) next.reminderMinutes = null;
    onChange(next);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("grid gap-3", timeSupported ? "grid-cols-2" : "grid-cols-1")}>
        <div className="space-y-1 min-w-0">
          <Label htmlFor={`${idPrefix}-date`} className="text-xs">
            {t("deadlineDate")} *
          </Label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={value.date}
            disabled={disabled}
            onChange={(e) => update({ date: e.target.value })}
            aria-invalid={showDateError && !value.date ? true : undefined}
            className={cn("h-9", showDateError && !value.date && "border-destructive")}
          />
        </div>
        {timeSupported && (
          <div className="space-y-1 min-w-0">
            <Label htmlFor={`${idPrefix}-time`} className="text-xs">
              {t("deadlineTime")}
            </Label>
            <Input
              id={`${idPrefix}-time`}
              type="time"
              value={value.time}
              disabled={disabled}
              onChange={(e) => update({ time: e.target.value })}
              className="h-9"
            />
          </div>
        )}
      </div>

      {timeSupported && (
        <>
          {!hasTime && <p className="text-[11px] text-muted-foreground">{t("allDayHint")}</p>}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={`${idPrefix}-reminder`} className="text-xs">
                {t("reminderLabel")}
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t("reminderLabel")}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {t("reminderTooltip")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={value.reminderMinutes === null ? "none" : String(value.reminderMinutes)}
              onValueChange={(v) => update({ reminderMinutes: v === "none" ? null : Number(v) })}
              disabled={disabled || !hasTime}
            >
              <SelectTrigger id={`${idPrefix}-reminder`} className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("reminderNone")}</SelectItem>
                {TASK_REMINDER_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {t(REMINDER_LABEL_KEY[minutes])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasTime && <p className="text-[11px] text-muted-foreground">{t("reminderNeedsTime")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
