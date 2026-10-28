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

// allowOvernight aceita o turno que vira a noite (início > fim, ex.: 22:00–02:00), que
// o servidor confere dentro do próprio dia. Só a fila liga: o horário do usuário segue
// recusando, porque o login do atendente não entende a virada. Desligado (padrão), as
// regras são as de sempre.
export interface BusinessHoursRules {
  allowOvernight?: boolean;
}

// Minutos do dia de "HH:mm" (ou "H:mm"), no formato que o servidor lê ao conferir o
// horário; null = hora vazia ou ilegível. Com allowOvernight, período e sobreposição
// seguem a mesma conta de hasInvalidPeriod/hasOverlap de filas/page.tsx (e da tela da
// empresa): é ela que decide o Salvar da fila, então mudar uma exige a outra.
function parseShiftMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{1,2})\s*$/.exec(String(value ?? ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function hasEmptyBusinessHourTime(bh: BusinessHour): boolean {
  if (bh.type !== "H") return false;
  return !bh.hr1 || !bh.hr2 || !bh.hr3 || !bh.hr4;
}

export function hasInvalidBusinessHourPeriod(bh: BusinessHour, rules?: BusinessHoursRules): boolean {
  if (bh.type !== "H") return false;
  if (hasEmptyBusinessHourTime(bh)) return false;
  if (rules?.allowOvernight) {
    // Início maior que o fim é a virada da noite. Inválidos ficam o intervalo vazio
    // (início igual ao fim) e a hora ilegível, que o servidor nunca conta como dentro.
    const [start1, end1, start2, end2] = [bh.hr1, bh.hr2, bh.hr3, bh.hr4].map(parseShiftMinutes);
    if (start1 === null || end1 === null || start2 === null || end2 === null) return true;
    return start1 === end1 || start2 === end2;
  }
  return (
    timeToMinutes(bh.hr1) >= timeToMinutes(bh.hr2) ||
    timeToMinutes(bh.hr3) >= timeToMinutes(bh.hr4)
  );
}

export function hasBusinessHourOverlap(bh: BusinessHour, rules?: BusinessHoursRules): boolean {
  if (bh.type !== "H") return false;
  if (hasEmptyBusinessHourTime(bh) || hasInvalidBusinessHourPeriod(bh, rules)) return false;
  // Fim do 1º >= início do 2º, nos dois modos. Com allowOvernight as quatro horas já
  // passaram pelo parseShiftMinutes acima, então esta conta dá o mesmo que a dele.
  return timeToMinutes(bh.hr2) >= timeToMinutes(bh.hr3);
}

export type BusinessHoursValidationError = "empty" | "invalidPeriod" | "overlap";

export function validateBusinessHours(
  hours: BusinessHour[],
  rules?: BusinessHoursRules
): BusinessHoursValidationError | null {
  if (hours.some(hasEmptyBusinessHourTime)) return "empty";
  if (hours.some((bh) => hasInvalidBusinessHourPeriod(bh, rules))) return "invalidPeriod";
  if (hours.some((bh) => hasBusinessHourOverlap(bh, rules))) return "overlap";
  return null;
}

interface Props {
  value: BusinessHour[];
  onChange: (v: BusinessHour[]) => void;
  // Turno que vira a noite (ver BusinessHoursRules). Padrão false.
  allowOvernight?: boolean;
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

export function BusinessHoursEditor({ value, onChange, allowOvernight = false }: Props) {
  const t = useTranslations("businessHoursEditor");
  const hours = value.length > 0 ? value : getDefaultBusinessHours();
  const rules: BusinessHoursRules = { allowOvernight };

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
        const isInvalid = hasInvalidBusinessHourPeriod(h, rules);
        const isOverlap = hasBusinessHourOverlap(h, rules);
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
                ? t(allowOvernight ? "validationInvalidPeriodOvernight" : "validationInvalidPeriod")
                : t("validationOverlap")}
            </p>
          )}
        </div>
        );
      })}
    </div>
  );
}
