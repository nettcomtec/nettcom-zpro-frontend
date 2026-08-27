"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Plus, Pencil, Trash2, Calendar, Clock, ListChecks, CalendarOff, Copy, Check, Loader2, Link2, Images, Info,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
import { AccessDenied } from "@/components/layout/access-denied";
import { isValidHttpUrl } from "@/lib/utils";
import { fetchWhatsapps } from "@/services/whatsapp";
import { fetchQueues } from "@/services/queues";
import {
  fetchBookingPages, createBookingPage, updateBookingPage, deleteBookingPage, checkBookingSlug,
  fetchBookingEventType, createBookingEventType, updateBookingEventType, deleteBookingEventType,
  setBookingAvailability, setBookingFormFields,
  createBookingDateOverride, deleteBookingDateOverride,
  type BookingPage, type BookingEventType, type BookingAvailability,
  type BookingFormField, type BookingDateOverride, type BookingLocationType, type BookingFieldType,
  fetchBookingProfessionals, type BookingProfessional,
} from "@/services/booking";
import { listGoogleCalendarConfigs, type GoogleCalendarConfig } from "@/services/google-calendar";
import { GoogleCalendarTargetPicker } from "@/components/agendamento-publico/google-calendar-target-picker";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { ProfessionalsManager } from "@/components/agendamento-publico/professionals-manager";
import { BookingTemplatePicker } from "@/components/agendamento-publico/booking-template-picker";

const WA_CHANNEL_TYPES = ["waba", "waba_oauth", "whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "wuzapi", "gupshup", "dialog360"];
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const LOCATION_TYPES: BookingLocationType[] = ["in_person", "online", "phone", "custom"];
const FIELD_TYPES: BookingFieldType[] = ["text", "textarea", "select", "email", "phone"];

const TIMEZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Bahia", "America/Fortaleza",
  "America/Recife", "America/Cuiaba", "America/Belem", "America/Rio_Branco",
  "America/Argentina/Buenos_Aires", "America/Lima", "America/Mexico_City", "UTC",
];

// Logo da galeria pode vir com URL relativa; o portal público (outra origem)
// precisa de URL absoluta. Prefixa a base da API quando não for http(s).
function toAbsoluteUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

interface ChannelOption { id: number; name: string; type: string; tokenAPI?: string }
const BSP_CHANNEL_TYPES = ["waba", "waba_oauth", "gupshup", "dialog360"];
interface QueueOption { id: number; name: string }

const emptyPageForm = {
  slug: "", title: "", description: "", timezone: "America/Sao_Paulo",
  whatsappId: undefined as number | undefined, isActive: true,
  logoUrl: "", primaryColor: "", welcomeMessage: "", confirmationHeader: "",
  checkInMinutesBefore: 0, checkInMessage: "",
  // Agenda Google desta pagina (undefined = usa a agenda padrao do sistema) e
  // qual calendario dentro da conta (undefined = calendario principal).
  googleCalendarConfigId: undefined as number | undefined,
  googleCalendarId: undefined as string | undefined,
};

interface EventTypeForm {
  name: string; description: string; isActive: boolean; color: string;
  durationMinutes: number; slotIntervalMinutes: number;
  bufferBeforeMin: number; bufferAfterMin: number;
  minNoticeMinutes: number; maxDaysAhead: number; maxPerDay: string;
  locationType: BookingLocationType; locationDetails: string; meetingLink: string;
  queueId: number | undefined; price: string; autoConfirm: boolean;
  professionalIds: number[];
  capacity: number;
  maxPerDayMode: "attendees" | "slots";
  capacityScope: "per_professional" | "shared";
  confirmationTemplate: string;
}

const emptyEventForm: EventTypeForm = {
  name: "", description: "", isActive: true, color: "",
  durationMinutes: 30, slotIntervalMinutes: 30,
  bufferBeforeMin: 0, bufferAfterMin: 0,
  minNoticeMinutes: 0, maxDaysAhead: 60, maxPerDay: "",
  locationType: "in_person", locationDetails: "", meetingLink: "",
  queueId: undefined, price: "", autoConfirm: true,
  professionalIds: [],
  capacity: 1,
  maxPerDayMode: "attendees",
  capacityScope: "per_professional",
  confirmationTemplate: "",
};

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" tabIndex={-1} aria-label="?" className="inline-flex align-middle text-muted-foreground hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem] text-xs leading-snug">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function AgendamentoPublicoPage() {
  const t = useTranslations("bookingConfig");
  const tWd = useTranslations("agendaPage");
  const tChat = useTranslations("atendimentoChat");
  const allowed = usePageAccess("agendamento-publico");
  const hasCalendarFeature = useAuthStore((s) => s.hasFeature("googleCalendar"));

  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<BookingPage[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [calendarConfigs, setCalendarConfigs] = useState<GoogleCalendarConfig[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [professionals, setProfessionals] = useState<BookingProfessional[]>([]);
  const [publicBase, setPublicBase] = useState("");

  // page dialog
  const [pageDialogOpen, setPageDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<BookingPage | null>(null);
  const [pageForm, setPageForm] = useState(emptyPageForm);
  const [slugState, setSlugState] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const slugTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deletePageOpen, setDeletePageOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // event type dialog
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<BookingEventType | null>(null);
  const [eventForm, setEventForm] = useState<EventTypeForm>(emptyEventForm);
  const [availability, setAvailability] = useState<BookingAvailability[]>([]);
  const [formFields, setFormFields] = useState<BookingFormField[]>([]);
  const [overrides, setOverrides] = useState<BookingDateOverride[]>([]);
  const [newOverride, setNewOverride] = useState({ date: "", isClosed: true, startTime: "09:00", endTime: "18:00" });
  const [savingEvent, setSavingEvent] = useState(false);
  const [deleteEventOpen, setDeleteEventOpen] = useState(false);

  const selectedPage = pages.find((p) => p.id === selectedId) || null;

  const loadProfessionals = useCallback(async () => {
    if (!selectedId) { setProfessionals([]); return; }
    try { setProfessionals(await fetchBookingProfessionals(selectedId)); } catch { setProfessionals([]); }
  }, [selectedId]);
  useEffect(() => { loadProfessionals(); }, [loadProfessionals]);

  const pageChannel = channels.find((c) => c.id === selectedPage?.whatsappId) || null;
  const isBspPage = !!pageChannel && BSP_CHANNEL_TYPES.includes(pageChannel.type);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchBookingPages();
      setPages(list);
      setSelectedId((cur) => cur ?? (list[0]?.id ?? null));
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadOptions = useCallback(async () => {
    try {
      const wRes = await fetchWhatsapps();
      const wData = Array.isArray((wRes as any)?.data) ? (wRes as any).data : ((wRes as any)?.data?.data ?? []);
      setChannels(
        (Array.isArray(wData) ? wData : [])
          .map((x: any) => ({ id: x.id, name: x.name ?? String(x.id), type: x.type ?? "", tokenAPI: x.tokenAPI }))
          .filter((x: ChannelOption) => WA_CHANNEL_TYPES.includes(x.type))
      );
    } catch { /* optional */ }
    try {
      const qRes = await fetchQueues();
      const qData = Array.isArray(qRes) ? qRes : ((qRes as any)?.data ?? []);
      setQueues((Array.isArray(qData) ? qData : []).map((q: any) => ({ id: q.id, name: q.queue ?? q.name ?? String(q.id) })));
    } catch { /* optional */ }
    // Google Calendar e opcional: sem a feature no plano, nem chega a pedir a
    // lista (o seletor de agenda simplesmente nao existe nesta tela).
    if (hasCalendarFeature) {
      try {
        const gRes = await listGoogleCalendarConfigs({ background: true });
        setCalendarConfigs((gRes.data?.configs ?? []).filter(c => c.isActive && c.googleRefreshToken));
      } catch { /* optional */ }
    }
  }, [hasCalendarFeature]);

  useEffect(() => {
    if (typeof window !== "undefined") setPublicBase(`${window.location.origin}/agendar/`);
    load();
    loadOptions();
  }, [load, loadOptions]);

  // ---- slug availability check ----
  const checkSlug = useCallback((slug: string) => {
    if (slugTimer.current) clearTimeout(slugTimer.current);
    if (!slug.trim()) { setSlugState("idle"); return; }
    setSlugState("checking");
    slugTimer.current = setTimeout(async () => {
      try {
        const res = await checkBookingSlug(slug, editingPage?.id);
        setSlugState(res.available ? "ok" : "taken");
      } catch { setSlugState("idle"); }
    }, 450);
  }, [editingPage]);

  // ---- page dialog ----
  const openCreatePage = () => {
    setEditingPage(null);
    setPageForm(emptyPageForm);
    setSlugState("idle");
    setPageDialogOpen(true);
  };
  const openEditPage = (p: BookingPage) => {
    setEditingPage(p);
    setPageForm({
      slug: p.slug, title: p.title, description: p.description ?? "", timezone: p.timezone || "America/Sao_Paulo",
      whatsappId: p.whatsappId ?? undefined, isActive: p.isActive,
      logoUrl: p.logoUrl ?? "", primaryColor: p.primaryColor ?? "",
      welcomeMessage: p.welcomeMessage ?? "", confirmationHeader: p.confirmationHeader ?? "",
      checkInMinutesBefore: p.checkInMinutesBefore ?? 0, checkInMessage: p.checkInMessage ?? "",
      googleCalendarConfigId: p.googleCalendarConfigId ?? undefined,
      googleCalendarId: p.googleCalendarId ?? undefined,
    });
    setSlugState("idle");
    setPageDialogOpen(true);
  };

  const handleSavePage = async () => {
    if (!pageForm.title.trim()) { toast.error(t("validationTitle")); return; }
    if (!pageForm.slug.trim()) { toast.error(t("validationSlug")); return; }
    if (slugState === "taken") { toast.error(t("slugTaken")); return; }
    if (pageForm.logoUrl && !isValidHttpUrl(pageForm.logoUrl)) { toast.error(t("validationLogoUrl")); return; }
    try {
      const payload: Partial<BookingPage> = {
        slug: pageForm.slug.trim(),
        title: pageForm.title.trim(),
        description: pageForm.description.trim() || null,
        timezone: pageForm.timezone,
        whatsappId: pageForm.whatsappId ?? null,
        isActive: pageForm.isActive,
        logoUrl: pageForm.logoUrl.trim() || null,
        primaryColor: pageForm.primaryColor.trim() || null,
        welcomeMessage: pageForm.welcomeMessage.trim() || null,
        confirmationHeader: pageForm.confirmationHeader.trim() || null,
        checkInMinutesBefore: pageForm.checkInMinutesBefore || 0,
        checkInMessage: pageForm.checkInMessage.trim() || null,
        googleCalendarConfigId: pageForm.googleCalendarConfigId ?? null,
        googleCalendarId: pageForm.googleCalendarId ?? null,
      };
      if (editingPage) {
        const updated = await updateBookingPage(editingPage.id, payload);
        toast.success(t("saved"));
        setSelectedId(updated.id);
      } else {
        const created = await createBookingPage(payload);
        toast.success(t("created"));
        setSelectedId(created.id);
      }
      setPageDialogOpen(false);
      load();
    } catch (e: any) {
      if (e?.response?.status === 409) toast.error(t("slugTaken"));
      else toast.error(t("errorSave"));
    }
  };

  const handleDeletePage = async () => {
    if (!selectedPage) return;
    try {
      await deleteBookingPage(selectedPage.id);
      toast.success(t("deleted"));
      setDeletePageOpen(false);
      setSelectedId(null);
      load();
    } catch { toast.error(t("errorDelete")); }
  };

  const copyLink = (slug: string) => {
    navigator.clipboard?.writeText(`${publicBase}${slug}`);
    toast.success(t("linkCopied"));
  };

  // ---- event type dialog ----
  const openCreateEvent = () => {
    if (!selectedPage) return;
    setEditingEvent(null);
    setEventForm(emptyEventForm);
    setAvailability([
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "18:00" })),
    ]);
    setFormFields([]);
    setOverrides([]);
    setEventDialogOpen(true);
  };

  const openEditEvent = async (id: number) => {
    try {
      const et = await fetchBookingEventType(id);
      setEditingEvent(et);
      setEventForm({
        name: et.name, description: et.description ?? "", isActive: et.isActive, color: et.color ?? "",
        durationMinutes: et.durationMinutes, slotIntervalMinutes: et.slotIntervalMinutes,
        bufferBeforeMin: et.bufferBeforeMin, bufferAfterMin: et.bufferAfterMin,
        minNoticeMinutes: et.minNoticeMinutes, maxDaysAhead: et.maxDaysAhead,
        maxPerDay: et.maxPerDay != null ? String(et.maxPerDay) : "",
        locationType: et.locationType, locationDetails: et.locationDetails ?? "", meetingLink: et.meetingLink ?? "",
        queueId: et.queueId ?? undefined, price: et.price != null ? String(et.price) : "", autoConfirm: et.autoConfirm,
        professionalIds: Array.isArray(et.professionalIds) ? et.professionalIds : [],
        capacity: et.capacity ?? 1,
        maxPerDayMode: et.maxPerDayMode ?? "attendees",
        capacityScope: et.capacityScope ?? "per_professional",
        confirmationTemplate: et.confirmationTemplate ?? "",
      });
      setAvailability((et.availabilities ?? []).map((a) => ({ weekday: a.weekday, startTime: a.startTime, endTime: a.endTime })));
      setFormFields((et.formFields ?? []).map((f, i) => ({ label: f.label, type: f.type, required: f.required, options: f.options ?? null, order: f.order ?? i })));
      setOverrides(et.dateOverrides ?? []);
      setEventDialogOpen(true);
    } catch { toast.error(t("errorLoad")); }
  };

  const handleSaveEvent = async () => {
    if (!selectedPage) return;
    if (!eventForm.name.trim()) { toast.error(t("validationName")); return; }
    if (eventForm.meetingLink && !isValidHttpUrl(eventForm.meetingLink)) { toast.error(t("validationMeetingLink")); return; }
    const pageCh = channels.find((c) => c.id === selectedPage.whatsappId);
    if (eventForm.isActive && pageCh && BSP_CHANNEL_TYPES.includes(pageCh.type) && !eventForm.confirmationTemplate.trim()) {
      toast.error(t("validationTemplateRequired")); return;
    }
    // C1 — turma única (shared) usa a disponibilidade DO SERVIÇO (não os horários dos
    // profissionais); sem faixas, o portal não mostraria horário nenhum.
    if (eventForm.capacityScope === "shared" && availability.length === 0) {
      toast.error(t("sharedNeedsAvailability")); return;
    }
    setSavingEvent(true);
    try {
      const payload: Partial<BookingEventType> = {
        bookingPageId: selectedPage.id,
        name: eventForm.name.trim(),
        description: eventForm.description.trim() || null,
        isActive: eventForm.isActive,
        color: eventForm.color.trim() || null,
        durationMinutes: eventForm.durationMinutes,
        slotIntervalMinutes: eventForm.slotIntervalMinutes,
        bufferBeforeMin: eventForm.bufferBeforeMin,
        bufferAfterMin: eventForm.bufferAfterMin,
        minNoticeMinutes: eventForm.minNoticeMinutes,
        maxDaysAhead: eventForm.maxDaysAhead,
        maxPerDay: eventForm.maxPerDay.trim() ? Number(eventForm.maxPerDay) : null,
        locationType: eventForm.locationType,
        locationDetails: eventForm.locationDetails.trim() || null,
        meetingLink: eventForm.meetingLink.trim() || null,
        queueId: eventForm.queueId ?? null,
        price: eventForm.price.trim() ? Number(eventForm.price) : null,
        autoConfirm: eventForm.autoConfirm,
        professionalIds: eventForm.professionalIds,
        capacity: eventForm.capacity,
        maxPerDayMode: eventForm.maxPerDayMode,
        capacityScope: eventForm.capacityScope,
        confirmationTemplate: eventForm.confirmationTemplate || null,
      };
      const saved = editingEvent
        ? await updateBookingEventType(editingEvent.id, payload)
        : await createBookingEventType(payload);
      await setBookingAvailability(saved.id, dedupeRanges(availability));
      await setBookingFormFields(saved.id, formFields);
      toast.success(editingEvent ? t("saved") : t("created"));
      setEventDialogOpen(false);
      // refresh selected page (event type counts)
      load();
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!editingEvent) return;
    try {
      await deleteBookingEventType(editingEvent.id);
      toast.success(t("deleted"));
      setDeleteEventOpen(false);
      setEventDialogOpen(false);
      load();
    } catch { toast.error(t("errorDelete")); }
  };

  // ---- availability helpers ----
  const addRange = (weekday: number) =>
    setAvailability((a) => [...a, { weekday, startTime: "09:00", endTime: "18:00" }]);
  const removeRange = (idx: number) =>
    setAvailability((a) => a.filter((_, i) => i !== idx));
  const updateRange = (idx: number, patch: Partial<BookingAvailability>) =>
    setAvailability((a) => a.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  // Faixas iguais (mesmo dia/início/fim) NÃO somam capacidade — repetir 09:00–18:00
  // só duplicaria o horário na listagem pública. Colapsa duplicatas ao salvar.
  const dedupeRanges = (rows: BookingAvailability[]): BookingAvailability[] => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = `${r.weekday}|${r.startTime}|${r.endTime}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  // ---- form field helpers ----
  const addField = () =>
    setFormFields((f) => [...f, { label: "", type: "text", required: false, options: null, order: f.length }]);
  const removeField = (idx: number) =>
    setFormFields((f) => f.filter((_, i) => i !== idx));
  const updateField = (idx: number, patch: Partial<BookingFormField>) =>
    setFormFields((f) => f.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  // ---- date override helpers (require saved event type) ----
  const addOverride = async () => {
    if (!editingEvent) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newOverride.date)) { toast.error(t("validationDate")); return; }
    try {
      const created = await createBookingDateOverride(editingEvent.id, {
        date: newOverride.date,
        isClosed: newOverride.isClosed,
        startTime: newOverride.isClosed ? null : newOverride.startTime,
        endTime: newOverride.isClosed ? null : newOverride.endTime,
      });
      setOverrides((o) => [...o, created]);
      setNewOverride({ date: "", isClosed: true, startTime: "09:00", endTime: "18:00" });
    } catch { toast.error(t("errorSave")); }
  };
  const removeOverride = async (id?: number) => {
    if (!id) return;
    try {
      await deleteBookingDateOverride(id);
      setOverrides((o) => o.filter((x) => x.id !== id));
    } catch { toast.error(t("errorDelete")); }
  };

  if (!allowed) return <AccessDenied />;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("pageTitle")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          ],
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* ---- PAGES LIST ---- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("pagesTitle")}</h2>
            <Button size="sm" onClick={openCreatePage}>
              <Plus className="mr-1 h-4 w-4" />
              {t("newPage")}
            </Button>
          </div>
          {pages.length === 0 ? (
            <Card>
              <CardContent className="p-4">
                <EmptyState icon={Calendar} title={t("noPages")} description={t("noPagesDesc")} />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={[
                    "w-full text-left rounded-lg border p-3 transition-colors",
                    selectedId === p.id ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{p.title}</span>
                    <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs shrink-0">
                      {p.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                    <Link2 className="h-3 w-3 shrink-0" />/agendar/{p.slug}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {(p.eventTypes?.length ?? 0)} {t("servicesLabel")}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---- SELECTED PAGE DETAIL ---- */}
        <div>
          {!selectedPage ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState icon={Calendar} title={t("selectPage")} description={t("selectPageDesc")} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 sm:p-6 space-y-5">
                {/* page header row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold truncate">{selectedPage.title}</h2>
                    <button
                      onClick={() => copyLink(selectedPage.slug)}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5"
                    >
                      <Copy className="h-3 w-3" />
                      {publicBase}{selectedPage.slug}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditPage(selectedPage)}>
                      <Pencil className="mr-1 h-4 w-4" />{t("editPageBtn")}
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeletePageOpen(true)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* professionals (F6) */}
                <ProfessionalsManager pageId={selectedPage.id} professionals={professionals} calendarConfigs={calendarConfigs} onChanged={loadProfessionals} />

                {/* services */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">{t("servicesTitle")}</h3>
                    <Button size="sm" onClick={openCreateEvent}>
                      <Plus className="mr-1 h-4 w-4" />{t("newService")}
                    </Button>
                  </div>
                  {(selectedPage.eventTypes?.length ?? 0) === 0 ? (
                    <EmptyState icon={Clock} title={t("noServices")} description={t("noServicesDesc")} />
                  ) : (
                    <div className="space-y-2">
                      {selectedPage.eventTypes?.map((et) => (
                        <button
                          key={et.id}
                          onClick={() => openEditEvent(et.id)}
                          className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-sm">{et.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{et.durationMinutes} {t("minAbbr")}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!et.isActive && <Badge variant="secondary" className="text-xs">{t("inactive")}</Badge>}
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ---- PAGE DIALOG ---- */}
      <Dialog open={pageDialogOpen} onOpenChange={setPageDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingPage ? t("editPageTitle") : t("newPageTitle")}</DialogTitle>
            <DialogDescription>{t("pageDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 pr-1">
            <div className="grid gap-2">
              <Label>{t("titleLabel")}</Label>
              <Input value={pageForm.title} onChange={(e) => setPageForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("titlePlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label>{t("slugLabel")}</Label>
              <Input
                value={pageForm.slug}
                onChange={(e) => { const v = e.target.value; setPageForm((f) => ({ ...f, slug: v })); checkSlug(v); }}
                placeholder={t("slugPlaceholder")}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {slugState === "checking" && <><Loader2 className="h-3 w-3 animate-spin" /> {t("slugChecking")}</>}
                {slugState === "ok" && <span className="text-green-600 flex items-center gap-1"><Check className="h-3 w-3" /> {t("slugAvailable")}</span>}
                {slugState === "taken" && <span className="text-destructive">{t("slugTaken")}</span>}
                {slugState === "idle" && <>{publicBase}{pageForm.slug || "..."}</>}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>{t("descriptionLabel")}</Label>
              <Textarea value={pageForm.description} onChange={(e) => setPageForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder={t("descriptionPlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2 min-w-0">
                <Label>{t("timezoneLabel")}</Label>
                <Select value={pageForm.timezone} onValueChange={(v) => setPageForm((f) => ({ ...f, timezone: v }))}>
                  <SelectTrigger className="min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 min-w-0">
                <Label>{t("channelLabel")}</Label>
                <Select
                  value={pageForm.whatsappId ? String(pageForm.whatsappId) : "none"}
                  onValueChange={(v) => setPageForm((f) => ({ ...f, whatsappId: v === "none" ? undefined : Number(v) }))}
                >
                  <SelectTrigger className="min-w-0"><SelectValue placeholder={t("channelNone")} className="truncate" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("channelNone")}</SelectItem>
                    {channels.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {calendarConfigs.length > 0 && (
              <GoogleCalendarTargetPicker
                label={t("googleCalendarPageLabel")}
                emptyLabel={t("googleCalendarDefault")}
                hint={t("googleCalendarHint")}
                configs={calendarConfigs}
                configId={pageForm.googleCalendarConfigId}
                calendarId={pageForm.googleCalendarId}
                onChange={(v) =>
                  setPageForm((f) => ({
                    ...f,
                    googleCalendarConfigId: v.configId,
                    googleCalendarId: v.calendarId,
                  }))
                }
              />
            )}
            <div className="rounded-md border p-3 bg-muted/30 grid gap-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("brandingSection")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label className="text-xs">{t("logoUrlLabel")}</Label>
                  <div className="flex gap-2">
                    <Input value={pageForm.logoUrl} onChange={(e) => setPageForm((f) => ({ ...f, logoUrl: e.target.value }))} placeholder="https://..." />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setGalleryOpen(true)}
                      title={tChat("galleryPickerTitle")}
                    >
                      <Images className="h-4 w-4" />
                    </Button>
                  </div>
                  {pageForm.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pageForm.logoUrl} alt="" className="h-10 w-auto max-w-[120px] rounded border object-contain bg-background" />
                  )}
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">{t("primaryColorLabel")}</Label>
                  <Input value={pageForm.primaryColor} onChange={(e) => setPageForm((f) => ({ ...f, primaryColor: e.target.value }))} placeholder="#2563eb" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">{t("welcomeMessageLabel")}</Label>
                <Textarea value={pageForm.welcomeMessage} onChange={(e) => setPageForm((f) => ({ ...f, welcomeMessage: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="rounded-md border p-3 bg-muted/30 grid gap-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("checkInSection")}</p>
              <div className="grid gap-2">
                <Label className="text-xs">{t("checkInMinutesLabel")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={pageForm.checkInMinutesBefore}
                  onChange={(e) => setPageForm((f) => ({ ...f, checkInMinutesBefore: Number(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground">{t("checkInMinutesHint")}</p>
              </div>
              {pageForm.checkInMinutesBefore > 0 && (
                <div className="grid gap-2">
                  <Label className="text-xs">{t("checkInMessageLabel")}</Label>
                  <Textarea
                    value={pageForm.checkInMessage}
                    onChange={(e) => setPageForm((f) => ({ ...f, checkInMessage: e.target.value }))}
                    rows={2}
                    placeholder="{{primeiroNome}}"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={pageForm.isActive} onCheckedChange={(v) => setPageForm((f) => ({ ...f, isActive: v }))} />
              <Label>{t("activeLabel")}</Label>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setPageDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSavePage}>{editingPage ? t("save") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- EVENT TYPE DIALOG ---- */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingEvent ? t("editServiceTitle") : t("newServiceTitle")}</DialogTitle>
            <DialogDescription>{t("serviceDialogDesc")}</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="general" className="text-xs sm:text-sm"><Pencil className="h-4 w-4 mr-1" />{t("tabGeneral")}</TabsTrigger>
              <TabsTrigger value="availability" className="text-xs sm:text-sm"><Clock className="h-4 w-4 mr-1" />{t("tabAvailability")}</TabsTrigger>
              <TabsTrigger value="form" className="text-xs sm:text-sm"><ListChecks className="h-4 w-4 mr-1" />{t("tabForm")}</TabsTrigger>
              <TabsTrigger value="exceptions" className="text-xs sm:text-sm"><CalendarOff className="h-4 w-4 mr-1" />{t("tabExceptions")}</TabsTrigger>
            </TabsList>

            <div className="overflow-y-auto flex-1 pr-1 mt-3">
              {/* GENERAL */}
              <TabsContent value="general" className="mt-0 grid gap-4">
                <div className="grid gap-2">
                  <Label>{t("nameLabel")}</Label>
                  <Input value={eventForm.name} onChange={(e) => setEventForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("namePlaceholder")} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("descLabel")}</Label>
                  <Textarea value={eventForm.description} onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <Label>{t("durationLabel")}</Label>
                    <Input type="number" min={5} value={eventForm.durationMinutes} onChange={(e) => setEventForm((f) => ({ ...f, durationMinutes: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("slotIntervalLabel")}</Label>
                    <Input type="number" min={5} value={eventForm.slotIntervalMinutes} onChange={(e) => setEventForm((f) => ({ ...f, slotIntervalMinutes: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center gap-1"><Label>{t("capacityLabel")}</Label><InfoTip text={t("capacityTip")} /></div>
                    <Input type="number" min={1} value={eventForm.capacity} onChange={(e) => setEventForm((f) => { const c = Math.max(1, Number(e.target.value) || 1); return { ...f, capacity: c, capacityScope: c > 1 ? f.capacityScope : "per_professional" }; })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("maxPerDayLabel")}</Label>
                    <Input type="number" min={0} value={eventForm.maxPerDay} onChange={(e) => setEventForm((f) => ({ ...f, maxPerDay: e.target.value }))} placeholder={t("noLimit")} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("bufferBeforeLabel")}</Label>
                    <Input type="number" min={0} value={eventForm.bufferBeforeMin} onChange={(e) => setEventForm((f) => ({ ...f, bufferBeforeMin: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("bufferAfterLabel")}</Label>
                    <Input type="number" min={0} value={eventForm.bufferAfterMin} onChange={(e) => setEventForm((f) => ({ ...f, bufferAfterMin: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("minNoticeLabel")}</Label>
                    <Input type="number" min={0} value={eventForm.minNoticeMinutes} onChange={(e) => setEventForm((f) => ({ ...f, minNoticeMinutes: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("maxDaysAheadLabel")}</Label>
                    <Input type="number" min={1} value={eventForm.maxDaysAhead} onChange={(e) => setEventForm((f) => ({ ...f, maxDaysAhead: Number(e.target.value) || 0 }))} />
                  </div>
                </div>
                {eventForm.capacity > 1 && (
                  <p className="text-xs text-muted-foreground">{t("capacityGroupHint")}</p>
                )}
                {eventForm.maxPerDay.trim() !== "" && eventForm.capacity > 1 && (
                  <div className="grid gap-2">
                    <div className="flex items-center gap-1"><Label>{t("maxPerDayModeLabel")}</Label><InfoTip text={t("maxPerDayModeTip")} /></div>
                    <Select value={eventForm.maxPerDayMode} onValueChange={(v) => setEventForm((f) => ({ ...f, maxPerDayMode: v as "attendees" | "slots" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="attendees">{t("mpdmAttendees")}</SelectItem>
                        <SelectItem value="slots">{t("mpdmSlots")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {eventForm.capacity > 1 && professionals.length > 0 && (
                  <div className="grid gap-2">
                    <div className="flex items-center gap-1"><Label>{t("capacityScopeLabel")}</Label><InfoTip text={t("capacityScopeTip")} /></div>
                    <Select value={eventForm.capacityScope} onValueChange={(v) => setEventForm((f) => ({ ...f, capacityScope: v as "per_professional" | "shared" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_professional">{t("capScopePerProf")}</SelectItem>
                        <SelectItem value="shared">{t("capScopeShared")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {eventForm.capacityScope === "shared" && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">{t("capacityScopeSharedHint")}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>{t("locationTypeLabel")}</Label>
                    <Select value={eventForm.locationType} onValueChange={(v) => setEventForm((f) => ({ ...f, locationType: v as BookingLocationType }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOCATION_TYPES.map((lt) => <SelectItem key={lt} value={lt}>{t(`locType_${lt}`)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{eventForm.locationType === "online" ? t("meetingLinkLabel") : t("locationDetailsLabel")}</Label>
                    {eventForm.locationType === "online" ? (
                      <Input value={eventForm.meetingLink} onChange={(e) => setEventForm((f) => ({ ...f, meetingLink: e.target.value }))} placeholder="https://..." />
                    ) : (
                      <Input value={eventForm.locationDetails} onChange={(e) => setEventForm((f) => ({ ...f, locationDetails: e.target.value }))} />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>{t("queueLabel")}</Label>
                    <Select
                      value={eventForm.queueId ? String(eventForm.queueId) : "none"}
                      onValueChange={(v) => setEventForm((f) => ({ ...f, queueId: v === "none" ? undefined : Number(v) }))}
                    >
                      <SelectTrigger><SelectValue placeholder={t("queueNone")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("queueNone")}</SelectItem>
                        {queues.map((q) => <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("priceLabel")}</Label>
                    <Input type="number" min={0} step="0.01" value={eventForm.price} onChange={(e) => setEventForm((f) => ({ ...f, price: e.target.value }))} placeholder={t("priceOptional")} />
                  </div>
                </div>
                {isBspPage && pageChannel && (
                  <BookingTemplatePicker
                    channel={pageChannel}
                    value={eventForm.confirmationTemplate}
                    onChange={(json) => setEventForm((f) => ({ ...f, confirmationTemplate: json || "" }))}
                  />
                )}
                {professionals.length > 0 && (
                  <div className="grid gap-2">
                    <Label>{t("serviceProfessionalsLabel")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {professionals.map((p) => {
                        const checked = eventForm.professionalIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setEventForm((f) => ({
                              ...f,
                              professionalIds: checked ? f.professionalIds.filter((x) => x !== p.id) : [...f.professionalIds, p.id],
                            }))}
                            className={["inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors", checked ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/50"].join(" ")}
                          >
                            {checked && <Check className="h-3 w-3" />}
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("allProfessionalsHint")}</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={eventForm.autoConfirm} onCheckedChange={(v) => setEventForm((f) => ({ ...f, autoConfirm: v }))} />
                    <Label>{t("autoConfirmLabel")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={eventForm.isActive} onCheckedChange={(v) => setEventForm((f) => ({ ...f, isActive: v }))} />
                    <Label>{t("serviceActiveLabel")}</Label>
                  </div>
                </div>
              </TabsContent>

              {/* AVAILABILITY */}
              <TabsContent value="availability" className="mt-0 space-y-3">
                <p className="text-xs text-muted-foreground">{t("availabilityHint")}</p>
                <p className="text-xs text-muted-foreground">{t("hoursNoCapacityHint")}</p>
                {eventForm.capacityScope === "shared" && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">{t("capacityScopeSharedHint")}</p>
                )}
                {WEEKDAY_KEYS.map((key, weekday) => {
                  const ranges = availability.map((r, idx) => ({ r, idx })).filter(({ r }) => r.weekday === weekday);
                  return (
                    <div key={key} className="rounded-md border p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium capitalize">{tWd(`weekdays.${key}`)}</span>
                        <Button variant="ghost" size="sm" onClick={() => addRange(weekday)}>
                          <Plus className="h-3 w-3 mr-1" />{t("addRange")}
                        </Button>
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
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRange(idx)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </TabsContent>

              {/* FORM */}
              <TabsContent value="form" className="mt-0 space-y-3">
                <p className="text-xs text-muted-foreground">{t("formHint")}</p>
                {formFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">{t("noFields")}</p>
                ) : (
                  <div className="space-y-2">
                    {formFields.map((f, idx) => (
                      <div key={idx} className="rounded-md border p-2 grid gap-2">
                        <div className="flex items-center gap-2">
                          <Input value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })} placeholder={t("fieldLabelPlaceholder")} className="h-8" />
                          <Select value={f.type} onValueChange={(v) => updateField(idx, { type: v as BookingFieldType })}>
                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((ft) => <SelectItem key={ft} value={ft}>{t(`ftype_${ft}`)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeField(idx)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {f.type === "select" && (
                          <div className="grid gap-1.5">
                            {(f.options ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {(f.options ?? []).map((opt, oi) => (
                                  <span key={oi} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
                                    {opt}
                                    <button
                                      type="button"
                                      className="leading-none text-muted-foreground hover:text-destructive"
                                      onClick={() => updateField(idx, { options: (f.options ?? []).filter((_, j) => j !== oi) })}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <Input
                              placeholder={t("fieldOptionsPlaceholder")}
                              className="h-8"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const parts = (e.currentTarget.value || "").split(",").map((x) => x.trim()).filter(Boolean);
                                  if (parts.length) {
                                    updateField(idx, { options: [...(f.options ?? []), ...parts] });
                                    e.currentTarget.value = "";
                                  }
                                }
                              }}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Switch checked={f.required} onCheckedChange={(v) => updateField(idx, { required: v })} />
                          <Label className="text-xs">{t("fieldRequiredLabel")}</Label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={addField}>
                  <Plus className="h-4 w-4 mr-1" />{t("addField")}
                </Button>
              </TabsContent>

              {/* EXCEPTIONS */}
              <TabsContent value="exceptions" className="mt-0 space-y-3">
                <p className="text-xs text-muted-foreground">{t("exceptionsHint")}</p>
                {!editingEvent ? (
                  <p className="text-sm text-muted-foreground py-2">{t("saveServiceFirst")}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                      <div className="grid gap-1">
                        <Label className="text-xs">{t("exceptionDate")}</Label>
                        <Input type="date" value={newOverride.date} onChange={(e) => setNewOverride((o) => ({ ...o, date: e.target.value }))} className="h-8" />
                      </div>
                      <div className="flex items-center gap-2 h-8">
                        <Switch checked={newOverride.isClosed} onCheckedChange={(v) => setNewOverride((o) => ({ ...o, isClosed: v }))} />
                        <Label className="text-xs">{t("exceptionClosed")}</Label>
                      </div>
                      {!newOverride.isClosed && (
                        <>
                          <Input type="time" value={newOverride.startTime} onChange={(e) => setNewOverride((o) => ({ ...o, startTime: e.target.value }))} className="h-8 w-28" />
                          <Input type="time" value={newOverride.endTime} onChange={(e) => setNewOverride((o) => ({ ...o, endTime: e.target.value }))} className="h-8 w-28" />
                        </>
                      )}
                      <Button size="sm" onClick={addOverride}><Plus className="h-4 w-4 mr-1" />{t("addException")}</Button>
                    </div>
                    {overrides.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">{t("noExceptions")}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {overrides.map((o) => (
                          <div key={o.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                            <span>
                              {o.date}{" "}
                              {o.isClosed
                                ? <Badge variant="secondary" className="text-xs ml-1">{t("exceptionClosed")}</Badge>
                                : <span className="text-muted-foreground">{o.startTime}–{o.endTime}</span>}
                            </span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeOverride(o.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="shrink-0 pt-2 gap-2 sm:justify-between">
            <div>
              {editingEvent && (
                <Button variant="outline" className="text-destructive" onClick={() => setDeleteEventOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-1" />{t("delete")}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEventDialogOpen(false)}>{t("cancel")}</Button>
              <Button onClick={handleSaveEvent} disabled={savingEvent}>
                {savingEvent && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingEvent ? t("save") : t("create")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- DELETE PAGE ---- */}
      <Dialog open={deletePageOpen} onOpenChange={setDeletePageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deletePageTitle")}</DialogTitle>
            <DialogDescription>{t("deletePageConfirm")} &quot;{selectedPage?.title}&quot;?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePageOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDeletePage}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- DELETE EVENT ---- */}
      <Dialog open={deleteEventOpen} onOpenChange={setDeleteEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteServiceTitle")}</DialogTitle>
            <DialogDescription>{t("deleteServiceConfirm")} &quot;{editingEvent?.name}&quot;?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEventOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteEvent}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- GALLERY PICKER (logo) ---- */}
      <GalleryPickerWithUploadDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        galleryFileType="image"
        uploadAccept="image/*"
        onPick={(item) => setPageForm((f) => ({ ...f, logoUrl: toAbsoluteUrl(item.url) }))}
      />
    </div>
  );
}
