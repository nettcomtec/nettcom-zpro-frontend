"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listGoogleCalendarConfigs,
  createGoogleCalendarEvent,
  type GoogleCalendarConfig,
} from "@/services/google-calendar";

export interface OpportunityEventData {
  name: string;
  description?: string;
  closingForecast?: string;
  contactEmail?: string;
}

const emptyEvent = {
  configId: "",
  summary: "",
  startDateTime: "",
  endDateTime: "",
  description: "",
  location: "",
  attendees: "",
};

// Cache de módulo: várias instâncias do hook na mesma página (form de criar,
// form de editar, header) compartilham um único GET /google-calendar-configs.
let configsCache: Promise<GoogleCalendarConfig[]> | null = null;
function loadConfigsOnce() {
  if (!configsCache) {
    configsCache = listGoogleCalendarConfigs({ background: true })
      .then(res => res.data?.configs ?? [])
      .catch(() => {
        // Falha silenciosa: tenant sem a feature googleCalendar (402) apenas
        // não vê os botões; permite retry em montagem futura.
        configsCache = null;
        return [] as GoogleCalendarConfig[];
      });
  }
  return configsCache;
}

export function useOpportunityCalendarEvent() {
  const t = useTranslations("gcalOpportunity");
  const [configs, setConfigs] = useState<GoogleCalendarConfig[]>([]);
  const [askOpen, setAskOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyEvent });
  const [pending, setPending] = useState<OpportunityEventData | null>(null);

  useEffect(() => {
    let mounted = true;
    loadConfigsOnce().then(list => { if (mounted) setConfigs(list); });
    return () => { mounted = false; };
  }, []);

  const activeConfigs = useMemo(
    () => configs.filter(c => c.isActive && c.googleAccessToken && c.googleRefreshToken),
    [configs]
  );
  const hasActiveConfigs = activeConfigs.length > 0;

  function prefill(data: OpportunityEventData) {
    const datePart = data.closingForecast ? data.closingForecast.split("T")[0] : "";
    setForm({
      configId: String(activeConfigs[0]?.id ?? ""),
      summary: data.name,
      startDateTime: datePart ? `${datePart}T09:00` : "",
      endDateTime: datePart ? `${datePart}T10:00` : "",
      description: data.description || t("defaultDescription", { name: data.name }),
      location: "",
      attendees: data.contactEmail ?? "",
    });
  }

  function askToCreateEvent(data: OpportunityEventData) {
    if (!hasActiveConfigs) return;
    setPending(data);
    setAskOpen(true);
  }

  function openEventDialog(data: OpportunityEventData) {
    if (!hasActiveConfigs) return;
    prefill(data);
    setEventOpen(true);
  }

  async function handleCreate() {
    const config = activeConfigs.find(c => String(c.id) === form.configId);
    if (!config) return;
    setSaving(true);
    try {
      const attendees = form.attendees
        ? form.attendees.split(",").map(e => e.trim()).filter(Boolean)
        : [];
      await createGoogleCalendarEvent({
        summary: form.summary,
        description: form.description,
        startDateTime: form.startDateTime,
        endDateTime: form.endDateTime,
        location: form.location,
        attendees,
        googleAccessToken: config.googleAccessToken,
        googleRefreshToken: config.googleRefreshToken,
        googleClientId: config.googleClientId,
        googleClientSecret: config.googleClientSecret,
      });
      toast.success(t("createdSuccess"));
      setEventOpen(false);
    } catch {
      toast.error(t("createError"));
    } finally {
      setSaving(false);
    }
  }

  const dialogs = (
    <>
      {/* Pergunta pós-criação */}
      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("askTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("askMessage")}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAskOpen(false); setPending(null); }}>
              {t("askNo")}
            </Button>
            <Button onClick={() => {
              setAskOpen(false);
              if (pending) {
                prefill(pending);
                setPending(null);
                setEventOpen(true);
              }
            }}>
              {t("askYes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form do evento */}
      <Dialog open={eventOpen} onOpenChange={v => { if (!saving) setEventOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">{t("calendarLabel")} *</Label>
              <Select value={form.configId} onValueChange={v => setForm(p => ({ ...p, configId: v }))}>
                <SelectTrigger className="h-8"><SelectValue placeholder={t("calendarLabel")} /></SelectTrigger>
                <SelectContent>
                  {activeConfigs.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("eventTitleLabel")} *</Label>
              <Input value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} className="h-8" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("startLabel")}</Label>
                <Input type="datetime-local" value={form.startDateTime} onChange={e => setForm(p => ({ ...p, startDateTime: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("endLabel")}</Label>
                <Input type="datetime-local" value={form.endDateTime} onChange={e => setForm(p => ({ ...p, endDateTime: e.target.value }))} className="h-8" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("descriptionLabel")}</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("locationLabel")}</Label>
              <Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("attendeesLabel")}</Label>
              <Input value={form.attendees} onChange={e => setForm(p => ({ ...p, attendees: e.target.value }))} className="h-8" placeholder={t("attendeesHint")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventOpen(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={saving || !form.configId || !form.summary || !form.startDateTime || !form.endDateTime}>
              {saving ? t("creating") : t("createButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    hasActiveConfigs,
    askToCreateEvent,
    openEventDialog,
    dialogs,
    labels: {
      createEventButton: t("editEventButton"),
      eventsButton: t("eventsButton"),
    },
  };
}
