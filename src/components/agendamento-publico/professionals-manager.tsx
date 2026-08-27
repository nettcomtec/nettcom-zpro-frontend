"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { Plus, Pencil, Trash2, Loader2, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  createBookingProfessional, updateBookingProfessional, deleteBookingProfessional,
  type BookingProfessional, type ProfessionalWorkingHour,
} from "@/services/booking";
import type { GoogleCalendarConfig } from "@/services/google-calendar";
import { GoogleCalendarTargetPicker } from "@/components/agendamento-publico/google-calendar-target-picker";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface Props {
  pageId: number;
  professionals: BookingProfessional[];
  // Agendas Google conectadas do tenant — vazio esconde o seletor.
  calendarConfigs?: GoogleCalendarConfig[];
  onChanged: () => void;
}

export function ProfessionalsManager({ pageId, professionals, calendarConfigs = [], onChanged }: Props) {
  const t = useTranslations("bookingConfig");
  const tWd = useTranslations("agendaPage");
  const tErrors = useTranslations("errors");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BookingProfessional | null>(null);
  const [form, setForm] = useState({
    name: "", color: "", isActive: true, hours: [] as ProfessionalWorkingHour[],
    googleCalendarConfigId: undefined as number | undefined,
    googleCalendarId: undefined as string | undefined,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BookingProfessional | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "", color: "", isActive: true,
      hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "18:00" })),
      googleCalendarConfigId: undefined,
      googleCalendarId: undefined,
    });
    setDialogOpen(true);
  };
  const openEdit = (p: BookingProfessional) => {
    setEditing(p);
    setForm({
      name: p.name,
      color: p.color ?? "",
      isActive: p.isActive,
      hours: (p.workingHours ?? []).map((h) => ({ weekday: h.weekday, startTime: h.startTime, endTime: h.endTime })),
      googleCalendarConfigId: p.googleCalendarConfigId ?? undefined,
      googleCalendarId: p.googleCalendarId ?? undefined,
    });
    setDialogOpen(true);
  };

  const addRange = (weekday: number) => setForm((f) => ({ ...f, hours: [...f.hours, { weekday, startTime: "09:00", endTime: "18:00" }] }));
  const removeRange = (idx: number) => setForm((f) => ({ ...f, hours: f.hours.filter((_, i) => i !== idx) }));
  const updateRange = (idx: number, patch: Partial<ProfessionalWorkingHour>) =>
    setForm((f) => ({ ...f, hours: f.hours.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));

  // Faixas iguais (mesmo dia/início/fim) NÃO somam capacidade — cada horário aceita
  // 1 agendamento. Colapsa duplicatas p/ não poluir a listagem pública ao reabrir.
  const dedupeRanges = (rows: ProfessionalWorkingHour[]): ProfessionalWorkingHour[] => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = `${r.weekday}|${r.startTime}|${r.endTime}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error(t("validationName")); return; }
    setSaving(true);
    try {
      const payload: Partial<BookingProfessional> = {
        bookingPageId: pageId,
        name: form.name.trim(),
        color: form.color.trim() || null,
        isActive: form.isActive,
        workingHours: dedupeRanges(form.hours),
        googleCalendarConfigId: form.googleCalendarConfigId ?? null,
        googleCalendarId: form.googleCalendarId ?? null,
      };
      if (editing) { await updateBookingProfessional(editing.id, payload); toast.success(t("saved")); }
      else { await createBookingProfessional(payload); toast.success(t("created")); }
      setDialogOpen(false);
      onChanged();
    } catch { toast.error(t("errorSave")); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!deleting) return;
    try { await deleteBookingProfessional(deleting.id); toast.success(t("deleted")); setDeleting(null); onChanged(); }
    catch { toast.error(t("errorDelete")); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-1"><Users className="h-4 w-4" />{t("professionalsTitle")}</h3>
        <Button size="sm" variant="outline" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />{t("newProfessional")}</Button>
      </div>
      {professionals.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{t("noProfessionals")}</p>
      ) : (
        <div className="space-y-2">
          {professionals.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border p-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {p.color && <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />}
                <span className="text-sm font-medium truncate">{p.name}</span>
                {!p.isActive && <Badge variant="secondary" className="text-xs">{t("inactive")}</Badge>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleting(p)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? t("editProfessional") : t("newProfessionalTitle")}</DialogTitle>
            <DialogDescription>{t("professionalHoursLabel")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3 overflow-y-auto flex-1 pr-1">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div className="grid gap-2">
                <Label className="text-xs">{t("professionalNameLabel")}</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">{t("primaryColorLabel")}</Label>
                <Input type="color" value={form.color || "#2563eb"} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-9 w-14 p-1" />
              </div>
            </div>
            {calendarConfigs.length > 0 && (
              <GoogleCalendarTargetPicker
                label={t("googleCalendarProfLabel")}
                emptyLabel={t("googleCalendarProfNone")}
                hint={t("googleCalendarProfHint")}
                configs={calendarConfigs}
                configId={form.googleCalendarConfigId}
                calendarId={form.googleCalendarId}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    googleCalendarConfigId: v.configId,
                    googleCalendarId: v.calendarId,
                  }))
                }
              />
            )}
            <div>
              <Label className="text-xs mb-1 block">{t("professionalHoursLabel")}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t("hoursNoCapacityHint")}</p>
              <div className="space-y-2">
                {WEEKDAY_KEYS.map((key, weekday) => {
                  const ranges = form.hours.map((r, idx) => ({ r, idx })).filter(({ r }) => r.weekday === weekday);
                  return (
                    <div key={key} className="rounded-md border p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium capitalize">{tWd(`weekdays.${key}`)}</span>
                        <Button variant="ghost" size="sm" onClick={() => addRange(weekday)}><Plus className="h-3 w-3 mr-1" />{t("addRange")}</Button>
                      </div>
                      {ranges.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("closedDay")}</p>
                      ) : (
                        <div className="space-y-1.5">
                          {ranges.map(({ r, idx }) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Input type="time" value={r.startTime} onChange={(e) => updateRange(idx, { startTime: e.target.value })} className="h-8" />
                              <span className="text-muted-foreground">—</span>
                              <Input type="time" value={r.endTime} onChange={(e) => updateRange(idx, { endTime: e.target.value })} className="h-8" />
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRange(idx)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              <Label>{t("professionalActiveLabel")}</Label>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{editing ? t("save") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteProfessional")}</DialogTitle>
            <DialogDescription>{t("deleteServiceConfirm")} &quot;{deleting?.name}&quot;?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={del}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
