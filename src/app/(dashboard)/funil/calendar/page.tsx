"use client";

import { formatCurrencyBRL, formatDate } from "@/lib/format";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar, RefreshCw, X, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import {
  fetchOpportunities, fetchOpportunity, fetchPipelines, fetchStages, updateOpportunity, createOpportunity,
} from "@/services/funnel";
import { fetchAllUsers } from "@/services/users";
import { fetchContacts } from "@/services/contacts";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/layout/access-denied";
import { useOpportunityCalendarEvent } from "@/components/funil/opportunity-calendar-event";
import { useRouter } from "next/navigation";
import {
  civilDayFromLocal, civilDayFromUTC, closingForecastToDateInput, dateInputToClosingForecastISO,
} from "@/lib/opportunity-date";

// Teto de oportunidades carregadas por mês (o servidor recorta pela previsão de fechamento)
const MONTH_OPPORTUNITIES_CAP = 5000;

interface Opportunity {
  id: number;
  name: string;
  value?: number;
  closingForecast?: string | null;
  status?: string;
  pipelineId?: number;
  stageId?: number;
  responsibleId?: number;
  contactId?: number;
  description?: string;
  contact?: {
    id?: number;
    name?: string;
    number?: string;
    email?: string;
    profilePicUrl?: string;
  };
  pipeline?: { name: string };
  stage?: { name: string; color?: string };
  responsible?: { name: string };
  createdAt?: string;
  updatedAt?: string;
}

interface ContactOption { id: number; name: string; number?: string; }

const WEEKDAYS_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  win:  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  lose: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function formatCurrency(v?: number) {
  return formatCurrencyBRL(Number(v || 0), {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}

/**
 * `closingForecast` é gravado em meia-noite UTC; as células do calendário são
 * Dates locais. Comparar os dois direto desloca o dia em fusos != UTC, então
 * cada lado é normalizado para o mesmo "dia civil" antes da comparação.
 */
function isForecastOnDay(forecast: string | Date | null | undefined, day: Date): boolean {
  const f = civilDayFromUTC(forecast);
  return f !== null && f === civilDayFromLocal(day);
}

function convertISOToBR(iso: string) {
  const short = iso.split("T")[0];
  const [y, m, d] = short.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return "";
}

function convertBRToISO(br: string) {
  if (!br) return "";
  const [d, m, y] = br.split("/");
  if (d && m && y) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return "";
}

// ─── Opportunity Edit Form ────────────────────────────────────────────────────

interface EditFormProps {
  open: boolean;
  opp: Opportunity | null;
  loading: boolean;
  pipelines: { id: number; name: string }[];
  stages: { id: number; name: string; pipelineId: number; color?: string }[];
  responsaveis: { label: string; value: number }[];
  onClose: () => void;
  onSaved: () => void;
}

function OpportunityEditForm({ open, opp, loading, pipelines, stages, responsaveis, onClose, onSaved }: EditFormProps) {
  const t = useTranslations("funilCalendarPage");
  const { isLiveMode } = useLiveMode();
  const [form, setForm] = useState({
    name: "", pipelineId: "" as string | number, stageId: "" as string | number,
    responsibleId: "" as string | number, contactId: "" as string | number,
    closingForecast: "", value: 0, description: "", status: "open",
  });
  const [contactSearch, setContactSearch] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gcal = useOpportunityCalendarEvent();

  useEffect(() => {
    if (opp && open) {
      const cf = closingForecastToDateInput(opp.closingForecast);
      setForm({
        name: opp.name || "",
        pipelineId: opp.pipelineId || "",
        stageId: opp.stageId || "",
        responsibleId: opp.responsibleId || "",
        contactId: opp.contactId || "",
        closingForecast: cf,
        value: opp.value || 0,
        description: opp.description || "",
        status: opp.status || "open",
      });
      if (opp.contact?.name) {
        setContactSearch(opp.contact.name);
      }
    }
  }, [opp, open]);

  const etapasFiltradas = stages.filter(s => String(s.pipelineId) === String(form.pipelineId));

  function searchContacts(term: string) {
    setContactSearch(term);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (term.length < 2) return;
    searchTimeout.current = setTimeout(async () => {
      setLoadingContacts(true);
      try {
        const res = await fetchContacts({ searchParam: term });
        const contacts = res.data?.contacts ?? res.data ?? [];
        setContactOptions(Array.isArray(contacts) ? contacts : []);
      } catch {
        // ignore
      } finally {
        setLoadingContacts(false);
      }
    }, 700);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!opp || !form.name.trim()) { toast.error(t("nameRequired")); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        pipelineId: form.pipelineId ? Number(form.pipelineId) : undefined,
        stageId: form.stageId ? Number(form.stageId) : undefined,
        responsibleId: form.responsibleId ? Number(form.responsibleId) : undefined,
        contactId: form.contactId ? Number(form.contactId) : undefined,
        value: Number(form.value) || 0,
        closingForecast: dateInputToClosingForecastISO(form.closingForecast),
      };
      await updateOpportunity(opp.id, payload);
      toast.success(t("updateSuccess"));
      onSaved();
      onClose();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editOpportunity")}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1">
              <Label>{t("labelName")}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <Label>{t("pipeline")}</Label>
              <Select value={String(form.pipelineId || "")} onValueChange={v => setForm(f => ({ ...f, pipelineId: v, stageId: "" }))}>
                <SelectTrigger><SelectValue placeholder={t("pipeline")} /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("stage")}</Label>
              <Select value={String(form.stageId || "")} onValueChange={v => setForm(f => ({ ...f, stageId: v }))} disabled={!form.pipelineId}>
                <SelectTrigger><SelectValue placeholder={t("stage")} /></SelectTrigger>
                <SelectContent>
                  {etapasFiltradas.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("responsible")}</Label>
              <Select value={String(form.responsibleId || "")} onValueChange={v => setForm(f => ({ ...f, responsibleId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("responsible")} /></SelectTrigger>
                <SelectContent>
                  {responsaveis.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("contact")}</Label>
              <div className="relative">
                <Input
                  value={contactSearch}
                  onChange={e => searchContacts(e.target.value)}
                  placeholder={t("contact")}
                />
                {loadingContacts && <div className="absolute right-2 top-2"><RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
                {contactOptions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-48 overflow-y-auto">
                    {contactOptions.map(c => (
                      <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                        onClick={() => { setForm(f => ({ ...f, contactId: c.id })); setContactSearch(c.name); setContactOptions([]); }}>
                        <div className={cn("font-medium", isLiveMode && "live-blur-text")}>{c.name}</div>
                        {c.number && <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{c.number}</div>}
                      </button>
                    ))}
                  </div>
                )}
                {contactSearch && (
                  <button type="button" className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    onClick={() => { setContactSearch(""); setForm(f => ({ ...f, contactId: "" })); setContactOptions([]); }}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("closingForecast")}</Label>
              <Input type="date" value={form.closingForecast}
                onChange={e => setForm(f => ({ ...f, closingForecast: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("value")}</Label>
              <Input type="number" min={0} step="0.01" value={form.value}
                onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("description")}</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t("status.open")}</SelectItem>
                  <SelectItem value="win">{t("status.win")}</SelectItem>
                  <SelectItem value="lose">{t("status.lose")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
              {gcal.hasActiveConfigs && (
                <Button
                  type="button"
                  variant="outline"
                  className="sm:mr-auto"
                  onClick={() => gcal.openEventDialog({
                    name: form.name,
                    description: form.description,
                    closingForecast: form.closingForecast,
                    contactEmail: opp?.contact?.email,
                  })}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {gcal.labels.createEventButton}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
              <Button type="submit" disabled={saving}>
                {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
    {gcal.dialogs}
    </>
  );
}

// ─── Opportunity Create Form ──────────────────────────────────────────────────

interface CreateFormProps {
  open: boolean;
  createDate: string | null;
  pipelines: { id: number; name: string }[];
  stages: { id: number; name: string; pipelineId: number; color?: string }[];
  responsaveis: { label: string; value: number }[];
  onClose: () => void;
  onSaved: () => void;
}

function OpportunityCreateForm({ open, createDate, pipelines, stages, responsaveis, onClose, onSaved }: CreateFormProps) {
  const t = useTranslations("funilCalendarPage");
  const { isLiveMode } = useLiveMode();
  const [form, setForm] = useState({
    name: "", pipelineId: "" as string | number, stageId: "" as string | number,
    responsibleId: "" as string | number, contactId: "" as string | number,
    closingForecast: "", value: 0, description: "", status: "open",
  });
  const [contactSearch, setContactSearch] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gcal = useOpportunityCalendarEvent();

  useEffect(() => {
    if (open) {
      setForm({
        name: "", pipelineId: "", stageId: "",
        responsibleId: "", contactId: "",
        closingForecast: createDate ?? "",
        value: 0, description: "", status: "open",
      });
      setContactSearch("");
      setContactOptions([]);
    }
  }, [open, createDate]);

  const etapasFiltradas = stages.filter(s => String(s.pipelineId) === String(form.pipelineId));

  function searchContacts(term: string) {
    setContactSearch(term);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (term.length < 2) return;
    searchTimeout.current = setTimeout(async () => {
      setLoadingContacts(true);
      try {
        const res = await fetchContacts({ searchParam: term });
        const contacts = res.data?.contacts ?? res.data ?? [];
        setContactOptions(Array.isArray(contacts) ? contacts : []);
      } catch {
        // ignore
      } finally {
        setLoadingContacts(false);
      }
    }, 700);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t("nameRequired")); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        pipelineId: form.pipelineId ? Number(form.pipelineId) : undefined,
        stageId: form.stageId ? Number(form.stageId) : undefined,
        responsibleId: form.responsibleId ? Number(form.responsibleId) : undefined,
        contactId: form.contactId ? Number(form.contactId) : undefined,
        value: Number(form.value) || 0,
        closingForecast: dateInputToClosingForecastISO(form.closingForecast),
      };
      await createOpportunity(payload);
      toast.success(t("createSuccess"));
      gcal.askToCreateEvent({
        name: form.name,
        description: form.description,
        closingForecast: form.closingForecast,
      });
      onSaved();
      onClose();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newOpportunity")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <Label>{t("labelName")}</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <Label>{t("pipeline")}</Label>
            <Select value={String(form.pipelineId || "")} onValueChange={v => setForm(f => ({ ...f, pipelineId: v, stageId: "" }))}>
              <SelectTrigger><SelectValue placeholder={t("pipeline")} /></SelectTrigger>
              <SelectContent>
                {pipelines.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("stage")}</Label>
            <Select value={String(form.stageId || "")} onValueChange={v => setForm(f => ({ ...f, stageId: v }))} disabled={!form.pipelineId}>
              <SelectTrigger><SelectValue placeholder={t("stage")} /></SelectTrigger>
              <SelectContent>
                {etapasFiltradas.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("responsible")}</Label>
            <Select value={String(form.responsibleId || "")} onValueChange={v => setForm(f => ({ ...f, responsibleId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("responsible")} /></SelectTrigger>
              <SelectContent>
                {responsaveis.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("contact")}</Label>
            <div className="relative">
              <Input
                value={contactSearch}
                onChange={e => searchContacts(e.target.value)}
                placeholder={t("contact")}
              />
              {loadingContacts && <div className="absolute right-2 top-2"><RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
              {contactOptions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {contactOptions.map(c => (
                    <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      onClick={() => { setForm(f => ({ ...f, contactId: c.id })); setContactSearch(c.name); setContactOptions([]); }}>
                      <div className={cn("font-medium", isLiveMode && "live-blur-text")}>{c.name}</div>
                      {c.number && <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{c.number}</div>}
                    </button>
                  ))}
                </div>
              )}
              {contactSearch && (
                <button type="button" className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setContactSearch(""); setForm(f => ({ ...f, contactId: "" })); setContactOptions([]); }}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("closingForecast")}</Label>
            <Input type="date" value={form.closingForecast}
              onChange={e => setForm(f => ({ ...f, closingForecast: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("value")}</Label>
            <Input type="number" min={0} step="0.01" value={form.value}
              onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("description")}</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("status.open")}</SelectItem>
                <SelectItem value="win">{t("status.win")}</SelectItem>
                <SelectItem value="lose">{t("status.lose")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" disabled={saving}>
              {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {gcal.dialogs}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FunilCalendarPage() {
  // Gate isolado num wrapper: sair com `return` no meio dos hooks do conteúdo
  // quebrava o React ("Rendered fewer hooks than expected") quando a permissão
  // caía com a página montada — o teto do tenant chega após o 1º render.
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;
  return <FunilCalendarPageContent />;
}

function FunilCalendarPageContent() {
  const t = useTranslations("funilCalendarPage");
  const router = useRouter();
  const gcal = useOpportunityCalendarEvent();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [pipelines, setPipelines] = useState<{ id: number; name: string }[]>([]);
  const [allStages, setAllStages] = useState<{ id: number; name: string; color?: string; pipelineId: number }[]>([]);
  const [responsaveis, setResponsaveis] = useState<{ label: string; value: number }[]>([]);

  // Day modal
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayModalOpen, setDayModalOpen] = useState(false);

  // Edit form
  const [editOpp, setEditOpp] = useState<Opportunity | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      firstDay.setUTCHours(0, 0, 0, 0);
      lastDay.setUTCHours(23, 59, 59, 999);

      const [oppRes, pipeRes, stageRes, usersRes] = await Promise.all([
        fetchOpportunities({
          page: 1,
          limit: MONTH_OPPORTUNITIES_CAP,
          orderBy: "closingForecast",
          orderDirection: "ASC",
          dataInicio: firstDay.toISOString(),
          dataFim: lastDay.toISOString(),
        }),
        fetchPipelines(),
        fetchStages(),
        fetchAllUsers(),
      ]);

      const oppData = oppRes.data?.data ?? (Array.isArray(oppRes.data) ? oppRes.data : []);
      const oppList = Array.isArray(oppData) ? oppData : [];
      setOpportunities(oppList);
      const total = Number(oppRes.data?.pagination?.total);
      setMonthTotal(Number.isFinite(total) ? total : oppList.length);

      const pRaw = pipeRes.data?.data ?? (Array.isArray(pipeRes.data) ? pipeRes.data : []);
      setPipelines(Array.isArray(pRaw) ? pRaw : []);

      const sRaw = stageRes.data?.data ?? (Array.isArray(stageRes.data) ? stageRes.data : []);
      setAllStages(Array.isArray(sRaw) ? sRaw : []);

      const uRaw = usersRes.data?.users ?? [];
      setResponsaveis(
        uRaw
          .filter((u: { profile: string }) => u.profile !== "superadmin")
          .map((u: { id: number; name: string }) => ({ label: u.name, value: u.id }))
      );
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const prevMonth = () => setCurrentMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; });
  const nextMonth = () => setCurrentMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; });

  const monthName = formatDate(currentMonth, { month: "long", year: "numeric" });

  const { days, opportunitiesByKey } = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstWeekday = firstDay.getDay();

    const dayEntries: { date: Date; num: number; inMonth: boolean }[] = [];
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      dayEntries.push({ date: d, num: d.getDate(), inMonth: false });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      dayEntries.push({ date: d, num: i, inMonth: true });
    }
    const remaining = 7 - (dayEntries.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        dayEntries.push({ date: d, num: d.getDate(), inMonth: false });
      }
    }

    const byKey: Record<number, Opportunity[]> = {};
    opportunities.forEach((opp) => {
      const key = civilDayFromUTC(opp.closingForecast);
      if (key === null) return;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(opp);
    });

    return { days: dayEntries, opportunitiesByKey: byKey };
  }, [currentMonth, opportunities]);

  const getOppsForDay = (date: Date) => opportunitiesByKey[civilDayFromLocal(date)] ?? [];

  const handleDayClick = (date: Date, inMonth: boolean) => {
    if (!inMonth) return;
    setSelectedDate(date);
    setDayModalOpen(true);
  };

  const openCreateForm = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) { toast.error(t("pastDateError")); return; }
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setDayModalOpen(false);
    setCreateDate(iso);
    setCreateOpen(true);
  };

  const openEditForm = async (opp: Opportunity) => {
    setDayModalOpen(false);
    setEditOpp(opp);
    setEditOpen(true);
    setEditLoading(true);
    try {
      const res = await fetchOpportunity(opp.id);
      setEditOpp(res.data ?? opp);
    } catch {
      // keep partial data
    } finally {
      setEditLoading(false);
    }
  };

  const getStageColor = (opp: Opportunity) =>
    opp.stage?.color ?? allStages.find(s => s.id === opp.stageId)?.color ?? null;

  const getPipelineName = (opp: Opportunity) =>
    opp.pipeline?.name ?? pipelines.find(p => p.id === opp.pipelineId)?.name ?? "—";

  const selectedDayOpps = useMemo(() => {
    if (!selectedDate) return [];
    return opportunities.filter(opp => isForecastOnDay(opp.closingForecast, selectedDate));
  }, [selectedDate, opportunities]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px]" />
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
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {gcal.hasActiveConfigs && (
            <Button variant="outline" size="sm" onClick={() => router.push("/google-calendar")}>
              <Calendar className="h-4 w-4 mr-2" />
              {gcal.labels.eventsButton}
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium capitalize">{monthName}</span>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </PageHeader>

      {monthTotal > opportunities.length && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t("capWarning", { total: monthTotal, shown: opportunities.length })}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAYS_KEYS.map(day => (
              <div key={day} className="text-center font-medium text-sm text-muted-foreground py-2">
                {t(`weekdays.${day}`)}
              </div>
            ))}
            {days.map((day, idx) => {
              const opps = getOppsForDay(day.date);
              const hasOpps = opps.length > 0;
              const isToday = civilDayFromLocal(day.date) === civilDayFromLocal();
              return (
                <div
                  key={idx}
                  onClick={() => handleDayClick(day.date, day.inMonth)}
                  className={[
                    "min-h-[80px] sm:min-h-[100px] rounded-lg border p-2 transition-colors",
                    day.inMonth ? "bg-background cursor-pointer hover:bg-muted/50" : "bg-muted/40 opacity-60 cursor-default",
                    hasOpps ? "border-primary/40 bg-primary/5 hover:bg-primary/10" : "",
                    isToday ? "ring-2 ring-primary/50" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                    {day.num}
                  </div>
                  <div className="space-y-0.5">
                    {opps.slice(0, 2).map(opp => {
                      const stageColor = getStageColor(opp);
                      return (
                        <div key={opp.id} className="text-xs rounded px-1.5 py-0.5 truncate"
                          style={stageColor
                            ? { backgroundColor: stageColor + "30", borderLeft: `2px solid ${stageColor}` }
                            : { backgroundColor: "hsl(var(--primary) / 0.12)", borderLeft: "2px solid hsl(var(--primary))" }}
                          title={`${opp.name} — ${formatCurrency(opp.value)}`}>
                          <span className="font-medium truncate">{opp.name}</span>
                        </div>
                      );
                    })}
                    {opps.length > 2 && (
                      <div className="text-xs text-muted-foreground pl-1">+{opps.length - 2} {t("more")}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {opportunities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("noOpportunities")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("noOpportunitiesDescription")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day modal */}
      <Dialog open={dayModalOpen} onOpenChange={setDayModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDate
                ? formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                : t("opportunities")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDayOpps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t("noOpportunitiesDay")}</p>
            )}
            {selectedDayOpps.map(opp => {
              const statusKey = opp.status ?? "open";
              const statusClass = STATUS_CLASSES[statusKey] ?? STATUS_CLASSES.open;
              const stageColor = getStageColor(opp);
              return (
                <button
                  key={opp.id}
                  onClick={() => openEditForm(opp)}
                  className="w-full text-left rounded-lg border p-4 hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{opp.name}</div>
                      <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{getPipelineName(opp)}</span>
                        {opp.stageId && (
                          <>
                            <span>›</span>
                            <span className="rounded px-1.5 py-0.5 text-xs font-medium"
                              style={stageColor ? { backgroundColor: stageColor + "30", color: stageColor } : {}}>
                              {opp.stage?.name ?? allStages.find(s => s.id === opp.stageId)?.name ?? "—"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                        {t(`status.${statusKey}`)}
                      </span>
                      {opp.value != null && (
                        <span className="text-sm font-semibold text-primary">{formatCurrency(opp.value)}</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-primary font-medium">{t("clickToEdit")}</div>
                </button>
              );
            })}
          </div>
          <DialogFooter className="mt-2">
            <Button onClick={() => selectedDate && openCreateForm(selectedDate)} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              {t("newOpportunity")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit form */}
      <OpportunityEditForm
        open={editOpen}
        opp={editOpp}
        loading={editLoading}
        pipelines={pipelines}
        stages={allStages}
        responsaveis={responsaveis}
        onClose={() => { setEditOpen(false); setEditOpp(null); }}
        onSaved={loadData}
      />

      {/* Create form */}
      <OpportunityCreateForm
        open={createOpen}
        createDate={createDate}
        pipelines={pipelines}
        stages={allStages}
        responsaveis={responsaveis}
        onClose={() => { setCreateOpen(false); setCreateDate(null); }}
        onSaved={loadData}
      />
    </div>
  );
}
