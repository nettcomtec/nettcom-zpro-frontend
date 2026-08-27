"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listCalendarsOfConfig,
  type GoogleCalendarConfig,
  type CalendarOfAccount,
} from "@/services/google-calendar";

// Cache por conta: o mesmo diálogo pode montar o seletor várias vezes e a
// listagem bate no Google. Vive enquanto a página estiver aberta.
const calendarsCache = new Map<number, Promise<CalendarOfAccount[]>>();
function loadCalendars(configId: number) {
  if (!calendarsCache.has(configId)) {
    calendarsCache.set(
      configId,
      listCalendarsOfConfig(configId, { background: true })
        .then(res => res.data?.calendars ?? [])
        .catch(() => {
          // Conta desconectada ou sem permissão de listagem: some o segundo
          // seletor e o vínculo segue valendo no calendário principal.
          calendarsCache.delete(configId);
          return [] as CalendarOfAccount[];
        })
    );
  }
  return calendarsCache.get(configId)!;
}

interface Props {
  label: string;
  // Texto da opção "sem conta": herdar o padrão (página) ou desligar (profissional).
  emptyLabel: string;
  hint?: string;
  configs: GoogleCalendarConfig[];
  configId?: number;
  calendarId?: string;
  onChange: (value: { configId?: number; calendarId?: string }) => void;
}

export function GoogleCalendarTargetPicker({
  label, emptyLabel, hint, configs, configId, calendarId, onChange,
}: Props) {
  const t = useTranslations("bookingConfig");
  const [calendars, setCalendars] = useState<CalendarOfAccount[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!configId) {
      setCalendars([]);
      return;
    }
    setLoadingCalendars(true);
    loadCalendars(configId)
      .then(list => { if (mounted) setCalendars(list.filter(c => c.canWrite)); })
      .finally(() => { if (mounted) setLoadingCalendars(false); });
    return () => { mounted = false; };
  }, [configId]);

  // Conta vinculada que saiu da lista (desativada ou sem conexão): sem isso o
  // seletor apareceria vazio e ninguém descobriria a qual agenda está preso.
  const linkedMissing = !!configId && !configs.some(c => c.id === configId);
  const secondary = calendars.filter(c => !c.primary);

  return (
    <div className="grid gap-2 min-w-0">
      <Label className="text-xs">{label}</Label>
      <Select
        value={configId ? String(configId) : "none"}
        onValueChange={v =>
          onChange({ configId: v === "none" ? undefined : Number(v), calendarId: undefined })
        }
      >
        <SelectTrigger className="min-w-0">
          <SelectValue placeholder={emptyLabel} className="truncate" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{emptyLabel}</SelectItem>
          {linkedMissing && (
            <SelectItem value={String(configId)} disabled>
              {t("googleCalendarDisconnected")}
            </SelectItem>
          )}
          {configs.map(c => (
            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!!configId && !linkedMissing && (loadingCalendars || secondary.length > 0) && (
        <Select
          value={calendarId || "primary"}
          onValueChange={v => onChange({ configId, calendarId: v === "primary" ? undefined : v })}
          disabled={loadingCalendars}
        >
          <SelectTrigger className="min-w-0">
            <SelectValue
              placeholder={loadingCalendars ? t("googleCalendarLoading") : t("googleCalendarWhichPrimary")}
              className="truncate"
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="primary">{t("googleCalendarWhichPrimary")}</SelectItem>
            {secondary.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
