"use client";

import { formatDate, formatTime } from "@/lib/format";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, ExternalLink, Video, Cake, CalendarDays, MapPin } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  listGoogleCalendarConfigs,
  listGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  type GoogleCalendarConfig,
  type GoogleCalendarEvent,
} from "@/services/google-calendar";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

const emptyEvent = {
  summary: "",
  description: "",
  startDateTime: "",
  endDateTime: "",
  location: "",
  attendees: "",
};

function formatDateTime(dateString?: string) {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    const date = formatDate(d, { day: "2-digit", month: "2-digit" });
    const time = formatTime(d, { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  } catch {
    return dateString;
  }
}

function getStatusColor(status?: string) {
  switch (status) {
    case "confirmed": return "bg-green-500";
    case "tentative": return "bg-yellow-500";
    case "cancelled": return "bg-red-500";
    default: return "bg-blue-500";
  }
}

export default function GoogleCalendarEventsPage() {
  const t = useTranslations("configGoogleCalendarPage");
  const allowed = usePageAccess("google-calendar", { allowIfNotSet: true });
  if (!allowed) return <AccessDenied />;

  const [configs, setConfigs] = useState<GoogleCalendarConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");

  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);

  // O Google devolve o MESMO `id` para instancias de um evento recorrente e, com
  // googleCalendarId "all", o mesmo evento ainda pode voltar por mais de um
  // calendario. As duas coisas produziam "Encountered two children with the same
  // key" no map da tabela, e a linha duplicada aparecia so ao refazer a busca.
  // A instancia e identificada pelo par calendario + inicio; o indice entra so se
  // AINDA assim colidir, nunca sozinho - chave puramente posicional quebraria a
  // reconciliacao ao reordenar. Mesmo tratamento de configuracoes/google-calendar.
  const eventRows = useMemo(() => {
    const seen = new Set<string>();
    return events.map((ev, idx) => {
      const base = `${ev.calendarId ?? ""}|${ev.id}|${ev.start ?? ""}`;
      const key = seen.has(base) ? `${base}#${idx}` : base;
      seen.add(key);
      return { ev, key };
    });
  }, [events]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [filtros, setFiltros] = useState({
    dataInicio: new Date().toISOString().split("T")[0],
    dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    maxResults: 50,
  });

  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ ...emptyEvent });
  const [creatingEvent, setCreatingEvent] = useState(false);

  const [editEventOpen, setEditEventOpen] = useState(false);
  // calendarId: o evento pode viver num calendario secundario da conta (a busca
  // varre todos). Sem ele, editar/apagar cai sempre no primary e falha.
  const [editingEvent, setEditingEvent] = useState({ id: "", calendarId: "", ...emptyEvent });
  const [updatingEvent, setUpdatingEvent] = useState(false);

  const [deleteEventDialogOpen, setDeleteEventDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; calendarId?: string } | null>(null);

  const loadConfigs = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const res = await listGoogleCalendarConfigs();
      const list = res.data?.configs ?? [];
      setConfigs(list);
      if (list.length > 0 && !selectedConfigId) {
        // Prioriza a agenda padrao do tenant (a mesma do Meet/agendamento).
        const preferred =
          list.find(c => c.isDefault && c.isActive && c.googleAccessToken) ??
          list.find(c => c.isActive && c.googleAccessToken) ??
          list[0];
        setSelectedConfigId(String(preferred.id));
      }
    } catch {
      setConfigs([]);
    } finally {
      setLoadingConfigs(false);
    }
  }, [selectedConfigId]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const selectedConfig = configs.find(c => String(c.id) === selectedConfigId);

  const loadEvents = async () => {
    if (!selectedConfig) {
      toast.warning(t("selectConfig"));
      return;
    }
    if (!selectedConfig.googleAccessToken) {
      toast.warning(t("configureGoogleFirst"));
      return;
    }
    setLoadingEvents(true);
    try {
      const res = await listGoogleCalendarEvents(
        {
          // dataInicio/dataFim sao YYYY-MM-DD; timeMin = inicio do dia (local),
          // timeMax = FIM do dia (local 23:59:59.999) para que eventos do ultimo
          // dia selecionado entrem no resultado (timeMax do Google e exclusivo).
          timeMin: filtros.dataInicio ? new Date(`${filtros.dataInicio}T00:00:00`).toISOString() : new Date().toISOString(),
          timeMax: filtros.dataFim ? new Date(`${filtros.dataFim}T23:59:59.999`).toISOString() : new Date().toISOString(),
          maxResults: filtros.maxResults || 50,
          googleCalendarId: "all", // Phase 16 — multi-calendar
        },
        {
          googleAccessToken: selectedConfig.googleAccessToken,
          googleRefreshToken: selectedConfig.googleRefreshToken,
          googleClientId: selectedConfig.googleClientId,
          googleClientSecret: selectedConfig.googleClientSecret,
        }
      );
      setEvents(res.data?.events ?? []);
    } catch {
      toast.error(t("errorLoadEvents"));
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!selectedConfig) return;
    setCreatingEvent(true);
    try {
      const attendees = newEvent.attendees
        ? newEvent.attendees.split(",").map(e => e.trim())
        : [];
      await createGoogleCalendarEvent({
        summary: newEvent.summary,
        description: newEvent.description,
        startDateTime: newEvent.startDateTime,
        endDateTime: newEvent.endDateTime,
        location: newEvent.location,
        attendees,
        googleAccessToken: selectedConfig.googleAccessToken,
        googleRefreshToken: selectedConfig.googleRefreshToken,
        googleClientId: selectedConfig.googleClientId,
        googleClientSecret: selectedConfig.googleClientSecret,
      });
      toast.success(t("eventCreated"));
      setNewEvent({ ...emptyEvent });
      setCreateEventOpen(false);
      await loadEvents();
    } catch {
      toast.error(t("errorCreateEvent"));
    } finally {
      setCreatingEvent(false);
    }
  };

  const openEditEvent = (event: GoogleCalendarEvent) => {
    let startDateTime = "";
    let endDateTime = "";
    if (event.start) {
      try {
        const d = new Date(event.start);
        if (event.start.length === 10) d.setHours(9, 0, 0, 0);
        startDateTime = d.toISOString().slice(0, 16);
      } catch { /* ignore */ }
    }
    if (event.end) {
      try {
        const d = new Date(event.end);
        if (event.end.length === 10) d.setHours(10, 0, 0, 0);
        endDateTime = d.toISOString().slice(0, 16);
      } catch { /* ignore */ }
    }
    setEditingEvent({
      id: event.id,
      calendarId: event.calendarId ?? "",
      summary: event.summary ?? "",
      description: event.description ?? "",
      startDateTime,
      endDateTime,
      location: event.location ?? "",
      attendees: event.attendees ? event.attendees.join(", ") : "",
    });
    setEditEventOpen(true);
  };

  const handleUpdateEvent = async () => {
    if (!selectedConfig) return;
    setUpdatingEvent(true);
    try {
      const attendees = editingEvent.attendees
        ? editingEvent.attendees.split(",").map(e => e.trim())
        : [];
      await updateGoogleCalendarEvent(editingEvent.id, {
        summary: editingEvent.summary,
        description: editingEvent.description,
        startDateTime: editingEvent.startDateTime,
        endDateTime: editingEvent.endDateTime,
        location: editingEvent.location,
        attendees,
        googleCalendarId: editingEvent.calendarId || undefined,
        googleAccessToken: selectedConfig.googleAccessToken,
        googleRefreshToken: selectedConfig.googleRefreshToken,
        googleClientId: selectedConfig.googleClientId,
        googleClientSecret: selectedConfig.googleClientSecret,
      });
      toast.success(t("eventUpdated"));
      setEditEventOpen(false);
      await loadEvents();
    } catch {
      toast.error(t("errorUpdate"));
    } finally {
      setUpdatingEvent(false);
    }
  };

  const confirmDeleteEvent = (event: GoogleCalendarEvent) => {
    setEventToDelete({ id: event.id, calendarId: event.calendarId });
    setDeleteEventDialogOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete || !selectedConfig) return;
    try {
      await deleteGoogleCalendarEvent(eventToDelete.id, {
        googleCalendarId: eventToDelete.calendarId || undefined,
        googleAccessToken: selectedConfig.googleAccessToken,
        googleRefreshToken: selectedConfig.googleRefreshToken,
        googleClientId: selectedConfig.googleClientId,
        googleClientSecret: selectedConfig.googleClientSecret,
      });
      toast.success(t("eventDeleted"));
      setDeleteEventDialogOpen(false);
      setEventToDelete(null);
      await loadEvents();
    } catch {
      toast.error(t("errorDeleteEvent"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("eventsTitle")}
        description={t("subtitle")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")] },
            { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1")] },
          ],
        }}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          {loadingConfigs ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : configs.length === 0 ? (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
              <p className="font-semibold">{t("noConfigs")}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="min-w-[200px] flex-1 sm:flex-none">
                  <Label className="text-xs mb-1 block">{t("calendarLabel")}</Label>
                  <Select value={selectedConfigId} onValueChange={v => { setSelectedConfigId(v); setEvents([]); }}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectCalendar")} />
                    </SelectTrigger>
                    <SelectContent>
                      {configs.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                          {c.isDefault && ` (${t("defaultBadge")})`}
                          {!c.googleAccessToken && ` (${t("tokensPending")})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{t("startDate")}</Label>
                  <Input type="date" value={filtros.dataInicio}
                    onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))}
                    className="w-40" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{t("endDate")}</Label>
                  <Input type="date" value={filtros.dataFim}
                    onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))}
                    className="w-40" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{t("maxResults")}</Label>
                  <Input type="number" min={1} max={100} value={filtros.maxResults}
                    onChange={e => setFiltros(f => ({ ...f, maxResults: Number(e.target.value) }))}
                    className="w-24" />
                </div>
                <Button onClick={loadEvents} disabled={loadingEvents || !selectedConfigId}>
                  {loadingEvents ? t("loading") : t("search")}
                </Button>
                <Button variant="outline" onClick={() => setCreateEventOpen(true)} disabled={!selectedConfigId}>
                  <Plus className="h-4 w-4 mr-1" /> {t("newEvent")}
                </Button>
              </div>

              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[35%]">{t("colTitle")}</TableHead>
                        <TableHead className="whitespace-nowrap">{t("colCalendar")}</TableHead>
                        <TableHead className="whitespace-nowrap">{t("colStart")}</TableHead>
                        <TableHead className="whitespace-nowrap">{t("colEnd")}</TableHead>
                        <TableHead className="text-center">{t("colStatus")}</TableHead>
                        <TableHead className="text-right whitespace-nowrap">{t("colActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventRows.map(({ ev, key }) => (
                        <TableRow key={key}>
                          <TableCell>
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {ev.eventType === "birthday" && (
                                  <Cake className="h-3.5 w-3.5 text-pink-500 shrink-0" aria-label="Birthday" />
                                )}
                                <span className="font-medium">{ev.summary}</span>
                                {ev.meetLink && (
                                  <a
                                    href={ev.meetLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100"
                                  >
                                    <Video className="h-3 w-3" />
                                    Meet
                                  </a>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                                {ev.location && (
                                  <span className="inline-flex items-center gap-1 truncate max-w-[180px]" title={ev.location}>
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {ev.location}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {ev.calendarName ? (
                              <span className="inline-flex items-center gap-1 truncate max-w-[160px]" title={ev.calendarName}>
                                <CalendarDays className="h-3 w-3 shrink-0 text-muted-foreground" />
                                {ev.calendarName}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatDateTime(ev.start)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatDateTime(ev.end)}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={getStatusColor(ev.status)}>{ev.status ?? "-"}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-0.5">
                              {!ev.isReadOnly && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEvent(ev)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirmDeleteEvent(ev)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </>
                              )}
                              {ev.htmlLink && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(ev.htmlLink, "_blank")}>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createEventOpen} onOpenChange={setCreateEventOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t("createEventTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2">
            {/* A busca lista eventos de todas as agendas da conta, mas a criação
                sempre cai na principal — deixar explícito evita procurar depois. */}
            <p className="text-xs text-muted-foreground">{t("newEventPrimaryNote")}</p>
            <div>
              <Label>{t("eventTitleLabel")}</Label>
              <Input className="w-full" value={newEvent.summary}
                onChange={e => setNewEvent(p => ({ ...p, summary: e.target.value }))} />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0">
                <Label>{t("eventStartDateTime")}</Label>
                <Input className="w-full" type="datetime-local" value={newEvent.startDateTime}
                  onChange={e => setNewEvent(p => ({ ...p, startDateTime: e.target.value }))} />
              </div>
              <div className="flex-1 min-w-0">
                <Label>{t("eventEndDateTime")}</Label>
                <Input className="w-full" type="datetime-local" value={newEvent.endDateTime}
                  onChange={e => setNewEvent(p => ({ ...p, endDateTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("eventDescription")}</Label>
              <Textarea className="w-full" rows={3} value={newEvent.description}
                onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label>{t("eventLocation")}</Label>
                <Input className="w-full" value={newEvent.location}
                  onChange={e => setNewEvent(p => ({ ...p, location: e.target.value }))} />
              </div>
              <div>
                <Label>{t("eventAttendees")}</Label>
                <Input className="w-full" value={newEvent.attendees} placeholder="email1@..., email2@..."
                  onChange={e => setNewEvent(p => ({ ...p, attendees: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">{t("attendeesSeparator")}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCreateEventOpen(false)} className="w-full sm:w-auto">{t("cancel")}</Button>
            <Button onClick={handleCreateEvent} disabled={creatingEvent || !newEvent.summary || !newEvent.startDateTime || !newEvent.endDateTime} className="w-full sm:w-auto">
              {creatingEvent ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editEventOpen} onOpenChange={setEditEventOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t("editEventTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2">
            <div>
              <Label>{t("eventTitleLabel")}</Label>
              <Input className="w-full" value={editingEvent.summary}
                onChange={e => setEditingEvent(p => ({ ...p, summary: e.target.value }))} />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0">
                <Label>{t("eventStartDateTime")}</Label>
                <Input className="w-full" type="datetime-local" value={editingEvent.startDateTime}
                  onChange={e => setEditingEvent(p => ({ ...p, startDateTime: e.target.value }))} />
              </div>
              <div className="flex-1 min-w-0">
                <Label>{t("eventEndDateTime")}</Label>
                <Input className="w-full" type="datetime-local" value={editingEvent.endDateTime}
                  onChange={e => setEditingEvent(p => ({ ...p, endDateTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("eventDescription")}</Label>
              <Textarea className="w-full" rows={3} value={editingEvent.description}
                onChange={e => setEditingEvent(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label>{t("eventLocation")}</Label>
                <Input className="w-full" value={editingEvent.location}
                  onChange={e => setEditingEvent(p => ({ ...p, location: e.target.value }))} />
              </div>
              <div>
                <Label>{t("eventAttendees")}</Label>
                <Input className="w-full" value={editingEvent.attendees} placeholder="email1@..., email2@..."
                  onChange={e => setEditingEvent(p => ({ ...p, attendees: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">{t("attendeesSeparator")}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setEditEventOpen(false)} className="w-full sm:w-auto">{t("cancel")}</Button>
            <Button onClick={handleUpdateEvent} disabled={updatingEvent || !editingEvent.summary} className="w-full sm:w-auto">
              {updatingEvent ? t("updating") : t("update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteEventDialogOpen} onOpenChange={setDeleteEventDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteEventTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteEventConfirm")} {t("cannotBeUndone")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEventDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteEvent}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
