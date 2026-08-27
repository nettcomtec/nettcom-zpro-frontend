"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Clock, Settings, CalendarOff, Plus, Pencil, Trash2, Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchBusinessHours,
  updateBusinessHours,
  updateMessageBusinessHours,
  updateHolidays,
  type Holiday,
} from "@/services/tenants";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

type DayType = "O" | "C" | "H";

interface DaySchedule {
  day: number;
  label: string;
  type: DayType;
  hr1: string;
  hr2: string;
  hr3: string;
  hr4: string;
}

const DAY_LABEL_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

export default function HorarioAtendimentoPage() {
  const t = useTranslations("horarioAtendimentoPage");
  const allowed = usePageAccess("horarioAtendimento", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  const DAY_LABELS = DAY_LABEL_KEYS.map((k) => t(k as any));
  const defaultSchedule: DaySchedule[] = DAY_LABELS.map((label, i) => ({
    day: i,
    label,
    type: i >= 1 && i <= 5 ? "H" : "C",
    hr1: "08:00",
    hr2: "12:00",
    hr3: "14:00",
    hr4: "18:00",
  }));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [outOfHoursMessage, setOutOfHoursMessage] = useState("");

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<{ index: number; holiday: Holiday } | null>(null);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayDescription, setHolidayDescription] = useState("");
  const [deletingHoliday, setDeletingHoliday] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchBusinessHours();
      const tenant = Array.isArray(data) ? data[0] : data;
      if (tenant?.businessHours) {
        setSchedule(
          tenant.businessHours.map((d: DaySchedule) => ({
            ...d,
            label: DAY_LABELS[d.day],
          }))
        );
      }
      if (tenant?.messageBusinessHours) {
        setOutOfHoursMessage(tenant.messageBusinessHours);
      }
      if (tenant?.holidays) {
        setHolidays(tenant.holidays);
      }
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setDayType = (index: number, type: DayType) => {
    setSchedule((prev) =>
      prev.map((s, i) => (i === index ? { ...s, type } : s))
    );
  };

  const updateTime = (index: number, field: "hr1" | "hr2" | "hr3" | "hr4", value: string) => {
    setSchedule((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const hasEmptyTime = (day: DaySchedule): boolean => {
    if (day.type !== "H") return false;
    return !day.hr1 || !day.hr2 || !day.hr3 || !day.hr4;
  };

  const hasOverlap = (day: DaySchedule): boolean => {
    if (day.type !== "H") return false;
    if (hasEmptyTime(day)) return false;
    return day.hr2 >= day.hr3;
  };

  const hasInvalidPeriod = (day: DaySchedule): boolean => {
    if (day.type !== "H") return false;
    if (hasEmptyTime(day)) return false;
    return day.hr1 >= day.hr2 || day.hr3 >= day.hr4;
  };

  const handleSaveAll = async () => {
    if (schedule.some(hasEmptyTime)) {
      toast.error(t("validationEmptyTime"));
      return;
    }
    if (schedule.some((d) => hasInvalidPeriod(d) || hasOverlap(d))) {
      toast.error(t("validationFixBeforeSave"));
      return;
    }
    setSaving(true);
    try {
      await updateBusinessHours(schedule);
      await updateMessageBusinessHours({ messageBusinessHours: outOfHoursMessage });
      await updateHolidays({ holidays });
      toast.success(t("successSave"));
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // --- Holidays ---

  const openAddHoliday = () => {
    setEditingHoliday(null);
    setHolidayDate("");
    setHolidayDescription("");
    setHolidayDialogOpen(true);
  };

  const openEditHoliday = (index: number) => {
    const h = holidays[index];
    setEditingHoliday({ index, holiday: h });
    setHolidayDate(h.date);
    setHolidayDescription(h.description);
    setHolidayDialogOpen(true);
  };

  const handleSaveHoliday = () => {
    if (!holidayDate || !holidayDescription.trim()) return;
    const entry: Holiday = { date: holidayDate, description: holidayDescription.trim(), active: true };

    if (editingHoliday !== null) {
      entry.active = editingHoliday.holiday.active;
      setHolidays((prev) => prev.map((h, i) => (i === editingHoliday.index ? entry : h)));
    } else {
      setHolidays((prev) => [...prev, entry]);
    }
    setHolidayDialogOpen(false);
  };

  const toggleHolidayActive = (index: number) => {
    setHolidays((prev) =>
      prev.map((h, i) => (i === index ? { ...h, active: !h.active } : h))
    );
  };

  const confirmDeleteHoliday = () => {
    if (deletingHoliday === null) return;
    setHolidays((prev) => prev.filter((_, i) => i !== deletingHoliday));
    setDeletingHoliday(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <Button onClick={handleSaveAll} disabled={saving}>
          <Settings className="mr-2 h-4 w-4" /> {saving ? t("saving") : t("save")}
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[300px]" />
        </div>
      ) : (
        <div className="grid gap-6">
          {/* Horários por Dia */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-5 w-5" /> {t("scheduleByDay")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {schedule.map((day, index) => {
                const emptyTime = hasEmptyTime(day);
                const overlap = hasOverlap(day);
                const invalidPeriod = hasInvalidPeriod(day);
                return (
                  <div key={day.day} className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-24 sm:w-32 font-medium text-sm shrink-0">{day.label}</span>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant={day.type === "O" ? "default" : "outline"} className="h-7 text-xs px-2" onClick={() => setDayType(index, "O")}>{t("open24h")}</Button>
                        <Button size="sm" variant={day.type === "H" ? "default" : "outline"} className="h-7 text-xs px-2" onClick={() => setDayType(index, "H")}>{t("scheduled")}</Button>
                        <Button size="sm" variant={day.type === "C" ? "default" : "outline"} className="h-7 text-xs px-2" onClick={() => setDayType(index, "C")}>{t("closed")}</Button>
                      </div>
                    </div>
                    {day.type === "H" && (
                      <div className="ml-0 sm:ml-36 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground w-14 shrink-0">{t("morning")}</span>
                          <Input type="time" value={day.hr1} onChange={(e) => updateTime(index, "hr1", e.target.value)} className="w-28 h-8 text-sm" />
                          <span className="text-xs text-muted-foreground">{t("until")}</span>
                          <Input type="time" value={day.hr2} onChange={(e) => updateTime(index, "hr2", e.target.value)} className="w-28 h-8 text-sm" />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground w-14 shrink-0">{t("afternoon")}</span>
                          <Input type="time" value={day.hr3} onChange={(e) => updateTime(index, "hr3", e.target.value)} className="w-28 h-8 text-sm" />
                          <span className="text-xs text-muted-foreground">{t("until")}</span>
                          <Input type="time" value={day.hr4} onChange={(e) => updateTime(index, "hr4", e.target.value)} className="w-28 h-8 text-sm" />
                        </div>
                        {emptyTime && <p className="text-xs text-destructive">{t("validationEmptyTime")}</p>}
                        {!emptyTime && overlap && <p className="text-xs text-destructive">{t("validationOverlap")}</p>}
                        {!emptyTime && invalidPeriod && <p className="text-xs text-destructive">{t("validationInvalidPeriod")}</p>}
                      </div>
                    )}
                    {day.type === "O" && <p className="ml-36 text-xs text-emerald-600">{t("open24hNote")}</p>}
                    {day.type === "C" && <p className="ml-36 text-xs text-muted-foreground">{t("closedNote")}</p>}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Mensagem Fora do Horário */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("outOfHoursTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>{t("outOfHoursLabel")}</Label>
              <Textarea
                value={outOfHoursMessage}
                onChange={(e) => setOutOfHoursMessage(e.target.value)}
                placeholder={t("outOfHoursPlaceholder")}
                rows={4}
                className="resize-y"
              />
            </CardContent>
          </Card>

          {/* Feriados */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarOff className="h-5 w-5" /> {t("holidaysTitle")}
                </CardTitle>
                <Button size="sm" onClick={openAddHoliday}>
                  <Plus className="mr-2 h-4 w-4" /> {t("addHoliday")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t("holidayNote")}
                </span>
              </div>

              {holidays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <CalendarOff className="mb-2 h-10 w-10 opacity-40" />
                  <p className="text-sm">{t("noHolidays")}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={openAddHoliday}>
                    <Plus className="mr-2 h-4 w-4" /> {t("addHoliday")}
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colDate")}</TableHead>
                        <TableHead>{t("colDescription")}</TableHead>
                        <TableHead>{t("colStatus")}</TableHead>
                        <TableHead className="w-28">{t("colActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holidays.map((h, index) => (
                        <TableRow key={`${h.date}-${index}`}>
                          <TableCell className="font-mono text-sm">
                            {formatDate(h.date)}
                          </TableCell>
                          <TableCell className="font-medium">{h.description}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={h.active}
                                onCheckedChange={() => toggleHolidayActive(index)}
                              />
                              <Badge variant={h.active ? "destructive" : "secondary"}>
                                {h.active ? t("holidayClosed") : t("holidayInactive")}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditHoliday(index)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setDeletingHoliday(index)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add/Edit Holiday Dialog */}
      <Dialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingHoliday ? t("editHolidayTitle") : t("addHolidayTitle")}
            </DialogTitle>
            <DialogDescription>
              {editingHoliday ? t("editHolidayDescription") : t("addHolidayDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("holidayDateLabel")}</Label>
              <Input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("holidayDescLabel")}</Label>
              <Input
                value={holidayDescription}
                onChange={(e) => setHolidayDescription(e.target.value)}
                placeholder={t("holidayDescPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHolidayDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSaveHoliday}
              disabled={!holidayDate || !holidayDescription.trim()}
            >
              {editingHoliday ? t("update") : t("add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Holiday Confirmation */}
      <Dialog open={deletingHoliday !== null} onOpenChange={() => setDeletingHoliday(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteHolidayTitle")}</DialogTitle>
            <DialogDescription>{t("deleteCannotUndo")}</DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            {t("deleteHolidayConfirm")}{" "}
            <strong>
              {deletingHoliday !== null ? holidays[deletingHoliday]?.description : ""}
            </strong>{" "}
            ({deletingHoliday !== null ? formatDate(holidays[deletingHoliday]?.date ?? "") : ""})?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingHoliday(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDeleteHoliday}>
              {t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
