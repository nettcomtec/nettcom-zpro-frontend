"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface BusinessHour {
  day: number;
  label: string;
  // O = sempre aberto (ignora hr1-hr4); H = aberto com horário (hr1-hr4 são validados no backend); C = fechado.
  type: "O" | "H" | "C";
  hr1: string;
  hr2: string;
  hr3: string;
  hr4: string;
}

const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function getDefaultBusinessHours(): BusinessHour[] {
  return DAY_LABELS.map((label, day) => ({
    day,
    label,
    type: "O",
    hr1: "08:00",
    hr2: "12:00",
    hr3: "14:00",
    hr4: "18:00",
  }));
}

function timeToMinutes(t: string): number {
  if (!t) return NaN;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function hasEmptyBusinessHourTime(bh: BusinessHour): boolean {
  if (bh.type !== "H") return false;
  return !bh.hr1 || !bh.hr2 || !bh.hr3 || !bh.hr4;
}

export function hasInvalidBusinessHourPeriod(bh: BusinessHour): boolean {
  if (bh.type !== "H") return false;
  if (hasEmptyBusinessHourTime(bh)) return false;
  return (
    timeToMinutes(bh.hr1) >= timeToMinutes(bh.hr2) ||
    timeToMinutes(bh.hr3) >= timeToMinutes(bh.hr4)
  );
}

export function hasBusinessHourOverlap(bh: BusinessHour): boolean {
  if (bh.type !== "H") return false;
  if (hasEmptyBusinessHourTime(bh) || hasInvalidBusinessHourPeriod(bh)) return false;
  return timeToMinutes(bh.hr2) >= timeToMinutes(bh.hr3);
}

export type BusinessHoursValidationError = "empty" | "invalidPeriod" | "overlap";

export function validateBusinessHours(
  hours: BusinessHour[]
): BusinessHoursValidationError | null {
  if (hours.some(hasEmptyBusinessHourTime)) return "empty";
  if (hours.some(hasInvalidBusinessHourPeriod)) return "invalidPeriod";
  if (hours.some(hasBusinessHourOverlap)) return "overlap";
  return null;
}

interface Props {
  value: BusinessHour[];
  onChange: (v: BusinessHour[]) => void;
}

function TimeRange({
  from, to,
  onFrom, onTo,
}: {
  from: string; to: string;
  onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type="time"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        className="h-7 w-[4.5rem] text-xs px-1.5"
      />
      <span className="text-muted-foreground text-xs shrink-0">–</span>
      <Input
        type="time"
        value={to}
        onChange={(e) => onTo(e.target.value)}
        className="h-7 w-[4.5rem] text-xs px-1.5"
      />
    </div>
  );
}

export function BusinessHoursEditor({ value, onChange }: Props) {
  const t = useTranslations("businessHoursEditor");
  const hours = value.length > 0 ? value : getDefaultBusinessHours();

  const update = (day: number, field: keyof BusinessHour, val: unknown) => {
    onChange(hours.map((h) => h.day === day ? { ...h, [field]: val } : h));
  };

  return (
    <div className="mt-2 rounded-md border overflow-hidden text-sm">
      {/* Cabeçalho */}
      <div className="grid grid-cols-[5.5rem_7rem_1fr_1fr] gap-x-2 px-3 py-1.5 bg-muted/60 border-b text-xs font-medium text-muted-foreground">
        <span>{t("day")}</span>
        <span>{t("status")}</span>
        <span>{t("firstPeriod")}</span>
        <span>{t("secondPeriod")}</span>
      </div>

      {/* Linhas */}
      {hours.map((h, idx) => {
        const isEmpty = hasEmptyBusinessHourTime(h);
        const isInvalid = hasInvalidBusinessHourPeriod(h);
        const isOverlap = hasBusinessHourOverlap(h);
        const hasIssue = isEmpty || isInvalid || isOverlap;
        return (
        <div
          key={h.day}
          className={[
            idx % 2 !== 0 ? "bg-muted/20" : "",
            idx < hours.length - 1 ? "border-b" : "",
          ].join(" ")}
        >
          <div className="grid grid-cols-[5.5rem_7rem_1fr_1fr] items-center gap-x-2 px-3 py-2">
            {/* Nome do dia */}
            <span className="font-medium text-xs truncate">{t(`days.${h.day}` as Parameters<typeof t>[0])}</span>

            {/* Status: aberto / por horário / fechado */}
            <Select
              value={h.type}
              onValueChange={(v) => update(h.day, "type", v as BusinessHour["type"])}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="O" className="text-xs">{t("open")}</SelectItem>
                <SelectItem value="H" className="text-xs">{t("scheduled")}</SelectItem>
                <SelectItem value="C" className="text-xs">{t("closed")}</SelectItem>
              </SelectContent>
            </Select>

            {/* 1º período — apenas em "Por horário" (H), pois só nesse modo o backend valida a faixa */}
            {h.type === "H" ? (
              <TimeRange
                from={h.hr1} to={h.hr2}
                onFrom={(v) => update(h.day, "hr1", v)}
                onTo={(v) => update(h.day, "hr2", v)}
              />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}

            {/* 2º período */}
            {h.type === "H" ? (
              <TimeRange
                from={h.hr3} to={h.hr4}
                onFrom={(v) => update(h.day, "hr3", v)}
                onTo={(v) => update(h.day, "hr4", v)}
              />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          {hasIssue && (
            <p className="px-3 pb-2 text-xs text-destructive">
              {isEmpty
                ? t("validationEmptyTime")
                : isInvalid
                ? t("validationInvalidPeriod")
                : t("validationOverlap")}
            </p>
          )}
        </div>
        );
      })}
    </div>
  );
}
