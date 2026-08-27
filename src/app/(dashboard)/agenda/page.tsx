"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { displayContactIdentity } from "@/lib/contact-identity";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { Plus, Pencil, Trash2, Calendar, Bell, Loader2, ChevronLeft, ChevronRight, ChevronsUpDown, Check, Search, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import {
  fetchAppointments,
  fetchAppointmentsRange,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  fetchReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  toggleReminder,
  type ScheduleAppointment,
  type ScheduleReminder,
} from "@/services/agenda";
import { fetchWhatsapps, type WABATemplate } from "@/services/whatsapp";
import { fetchContacts } from "@/services/contacts";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
// Cobranca (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F6.4.
// A ficha e guardada dentro do proprio messageContent do lembrete (campo livre)
// SEM referencia: quem gera o "N da cobranca" e o job, a cada disparo (D7).
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  isOrderDetailsTemplate,
  findOrderDetailsButtonIndex,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { AccessDenied } from "@/components/layout/access-denied";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

// Channels that support WhatsApp messaging (same as funil/acao-ticket)
const WA_CHANNEL_TYPES = ["waba", "waba_oauth", "whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "wuzapi"];
// Channels that support WABA templates
// BSPs (gupshup, dialog360) também suportam templates — incluídos no select.
const WABA_ONLY_TYPES = ["waba", "waba_oauth", "gupshup", "dialog360"];

const WEEKDAYS_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const APPT_PAGE_SIZES = [25, 50, 100, 200];
const APPT_STATUSES = ["pending", "confirmed", "cancelled", "completed", "no_show"];

function sameLocalDate(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// Grade do mês: os dias do mês mais o preenchimento das semanas de borda (que também
// aparecem na tela e podem ter consulta). Fica fora do componente porque a BUSCA do
// calendário usa exatamente a mesma janela — grade e intervalo carregado não podem
// divergir, senão volta a existir dia visível sem dado.
function buildMonthGrid(base: Date) {
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = firstDay.getDay();
  const days: { date: Date; num: number; inMonth: boolean }[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, num: d.getDate(), inMonth: false });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({ date: d, num: i, inMonth: true });
  }
  const rem = 7 - (days.length % 7);
  if (rem < 7) {
    for (let i = 1; i <= rem; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, num: d.getDate(), inMonth: false });
    }
  }
  return days;
}

function monthGridRange(base: Date) {
  const days = buildMonthGrid(base);
  const first = days[0].date;
  const last = days[days.length - 1].date;
  return {
    from: new Date(first.getFullYear(), first.getMonth(), first.getDate(), 0, 0, 0, 0).toISOString(),
    to: new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999).toISOString(),
  };
}

interface WhatsappOption {
  id: number;
  name: string;
  type: string;
  tokenAPI?: string;
}

interface TemplateVarField {
  key: string;
  label: string;
}

function buildVariableFields(
  template: WABATemplate | null,
  varPrefix: string,
  urlBtnPrefix: string
): TemplateVarField[] {
  if (!template?.components) return [];
  const fields: TemplateVarField[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const _comp of template.components as any[]) {
    const comp = _comp;
    if (comp.type === "HEADER") {
      // Header media (IMAGE/VIDEO/DOCUMENT) → key unificada `header_link`
      if (["VIDEO", "IMAGE", "DOCUMENT"].includes(comp.format || "")) {
        if (!fields.some((f) => f.key === "header_link")) {
          fields.push({ key: "header_link", label: `URL Header (${comp.format})` });
        }
        continue;
      }
      if (comp.format === "TEXT") {
        const text = String(comp.text || "");
        [...text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].forEach((m) => {
          const k = `header_named_variable_${m[1]}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `Header {{${m[1]}}}` });
        });
        [...text.matchAll(/\{\{(\d+)\}\}/g)].forEach((m) => {
          const k = `header_variable_${m[1]}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `Header {{${m[1]}}}` });
        });
      }
    } else if (comp.type === "BODY") {
      const text = String(comp.text || "");
      [...text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].forEach((m) => {
        const k = `body_named_variable_${m[1]}`;
        if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${varPrefix} {{${m[1]}}}` });
      });
      [...text.matchAll(/\{\{(\d+)\}\}/g)].forEach((m) => {
        const k = `body_variable_${m[1]}`;
        if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${varPrefix} {{${m[1]}}}` });
      });
    } else if (comp.type === "BUTTONS" && Array.isArray(comp.buttons)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (comp.buttons as any[]).forEach((btn: any, i: number) => {
        if (btn.type === "URL" && (btn.url || "").includes("{{1}}")) {
          const k = `button_${i}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${urlBtnPrefix} ${i + 1}` });
        } else if (btn.type === "COPY_CODE") {
          const k = `button_${i}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${urlBtnPrefix} ${i + 1}` });
        }
      });
    }
  }
  return fields;
}

function buildComponentsForSave(template: WABATemplate | null, vars: Record<string, string>): unknown[] {
  if (!template?.components) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comps = template.components as any[];

  // ── HEADER ────────────────────────────────────────────────────────────────
  const headerComp = comps.find((c) => c.type === "HEADER");
  if (headerComp) {
    if (["VIDEO", "IMAGE", "DOCUMENT"].includes(headerComp.format || "")) {
      if (vars.header_link) {
        components.push({ type: "HEADER", format: headerComp.format, value: vars.header_link });
      }
    } else if (headerComp.format === "TEXT") {
      const text = String(headerComp.text || "");
      const positional = [...text.matchAll(/\{\{(\d+)\}\}/g)];
      const named = [...text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
      if (positional.length > 0) {
        const variables = positional.map((m) => (vars[`header_variable_${m[1]}`] || "").trim() || " ");
        // `text` junto dos valores: o sender lê só `variables`/`parameters`/`value` e
        // ignora este campo, mas é dele que a bolha do lembrete monta o header real.
        components.push({ type: "HEADER", format: "TEXT", text, variables });
      } else if (named.length > 0) {
        components.push({
          type: "HEADER",
          format: "TEXT",
          text,
          parameters: named.map((m) => ({ type: "text", text: (vars[`header_named_variable_${m[1]}`] || "").trim() || " ", name: m[1] })),
        });
      } else if (text) {
        components.push({ type: "HEADER", format: "TEXT", text });
      }
    }
  }

  // ── BODY ──────────────────────────────────────────────────────────────────
  const bodyComp = comps.find((c) => c.type === "BODY");
  if (bodyComp) {
    const text = String(bodyComp.text || "");
    const positional = [...text.matchAll(/\{\{(\d+)\}\}/g)];
    const named = [...text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
    if (positional.length > 0) {
      const variables = positional.map((m) => (vars[`body_variable_${m[1]}`] || "").trim() || " ");
      // Idem: sem o `text` a bolha mostraria o NOME do template no lugar do corpo.
      components.push({ type: "BODY", text, variables });
    } else if (named.length > 0) {
      components.push({
        type: "BODY",
        text,
        parameters: named.map((m) => ({ type: "text", text: (vars[`body_named_variable_${m[1]}`] || "").trim() || " ", name: m[1] })),
      });
    } else if (text) {
      // Template sem variáveis: componente só para a bolha (o sender pula BODY sem
      // `parameters`/`variables`).
      components.push({ type: "BODY", text });
    }
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  // Tipo que o sender não conhece e ignora no loop — só a bolha usa.
  const footerComp = comps.find((c) => c.type === "FOOTER");
  if (footerComp?.text) components.push({ type: "FOOTER", text: String(footerComp.text) });

  // ── BUTTONS ───────────────────────────────────────────────────────────────
  const btnComp = comps.find((c) => c.type === "BUTTONS");
  if (btnComp?.buttons?.length) {
    const buttonParams: Record<string, unknown>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (btnComp.buttons as any[]).forEach((btn: any, idx: number) => {
      const value = vars[`button_${idx}`];
      if (btn.type === "COPY_CODE" && value) {
        buttonParams.push({
          type: "button",
          sub_type: "copy_code",
          index: String(idx),
          parameters: [{ type: "coupon_code", coupon_code: value }],
        });
      } else if (btn.type === "URL" && (btn.url || "").includes("{{1}}") && value) {
        buttonParams.push({
          type: "button",
          sub_type: "url",
          index: String(idx),
          parameters: [{ type: "text", text: value }],
        });
      }
    });
    if (buttonParams.length > 0) {
      components.push({ type: "BUTTONS", buttons: buttonParams });
    }
  }

  return components;
}

// Reminders salvos antes da extensão de variáveis usavam keys legadas
// (`variable_N`, `header_image/video/document`, `button_url_<N+1>`). Ao
// abrir pra editar, remapeamos para o esquema atual (`body_variable_N`,
// `header_link`, `button_<N>`) — senão os inputs viriam vazios.
function migrateLegacyTemplateVars(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (/^header_(image|video|document)$/.test(k)) {
      out.header_link = v;
    } else if (/^button_url_(\d+)$/.test(k)) {
      const i = parseInt(k.replace("button_url_", ""), 10) - 1;
      out[`button_${i}`] = v;
    } else if (/^variable_\d+$/.test(k)) {
      out[`body_${k}`] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Ficha de cobranca salva (shape de buildOrderDetailsPayload) -> estado do
// formulario. Fail-open: shape inesperado volta uma ficha vazia, nunca quebra a
// edicao do lembrete. Nao le referenceId de proposito — a referencia e do disparo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hydrateOrderDetails(raw: any): OrderDetailsValue {
  const base = emptyOrderDetails();
  if (!raw || typeof raw !== "object") return base;
  const items = Array.isArray(raw.items) && raw.items.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? raw.items.map((i: any) => ({
        name: String(i?.name ?? ""),
        quantity: Number(i?.quantity) > 0 ? Number(i.quantity) : 1,
        amount: Number(i?.amount) || 0,
      }))
    : base.items;
  return {
    goodsType: raw.goodsType === "physical-goods" ? "physical-goods" : "digital-goods",
    items,
    tax: Number(raw.tax?.value) || undefined,
    shipping: Number(raw.shipping?.value) || undefined,
    discount: Number(raw.discount?.value) || undefined,
    expirationTimestamp: Number(raw.expirationTimestamp) || undefined,
    expirationDescription: raw.expirationDescription || undefined,
    payment: raw.payment && typeof raw.payment === "object"
      ? { ...base.payment, ...raw.payment }
      : base.payment,
  };
}

function formatDateTime(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

// `datetime-local` NÃO carrega fuso: o navegador lê o que está no input como hora
// LOCAL — é exatamente assim que handleSaveAppt grava (`new Date(valor).toISOString()`).
// Preencher o input com `toISOString()` colocava a hora em UTC: no Brasil a modal
// abria +3h em relação à listagem e cada "salvar" empurrava o compromisso mais 3h.
// Aqui o instante volta para hora local, igual ao que a listagem e o calendário mostram.
function toDateTimeLocalInput(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "secondary",
  confirmed: "default",
  cancelled: "destructive",
  completed: "outline",
  no_show: "destructive",
};

export default function AgendaPage() {
  const t = useTranslations("agendaPage");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");
  const { isLiveMode } = useLiveMode();
  const allowed = usePageAccess("agenda", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;

  // ---- shared state ----
  const [tab, setTab] = useState("appointments");
  const [whatsapps, setWhatsapps] = useState<WhatsappOption[]>([]);
  const [contacts, setContacts] = useState<{ id: number; name: string; number: string }[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [searchingContacts, setSearchingContacts] = useState(false);
  const contactSearchRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- appointments ----
  // A lista é paginada NO SERVIDOR: `appointments` guarda só a página visível. Antes a
  // tela puxava os 100 primeiros de uma vez e renderizava tudo — como a ordem é por
  // startAt crescente, passando de 100 registros o tenant perdia justamente as consultas
  // FUTURAS, e o calendário (que lia o mesmo array) aparecia vazio nos meses à frente.
  const [appointments, setAppointments] = useState<ScheduleAppointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [apptPage, setApptPage] = useState(1);
  const [apptPageSize, setApptPageSize] = useState(50);
  const [apptTotal, setApptTotal] = useState(0);
  const [apptTotalPages, setApptTotalPages] = useState(1);
  const [apptStatusFilter, setApptStatusFilter] = useState("all");
  const [apptFrom, setApptFrom] = useState("");
  const [apptTo, setApptTo] = useState("");
  const [apptSearchInput, setApptSearchInput] = useState("");
  const [apptSearch, setApptSearch] = useState("");
  const [apptOrder, setApptOrder] = useState<"asc" | "desc">("asc");
  const [apptDialogOpen, setApptDialogOpen] = useState(false);
  const [deleteApptDialogOpen, setDeleteApptDialogOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<ScheduleAppointment | null>(null);
  const [deletingAppt, setDeletingAppt] = useState<ScheduleAppointment | null>(null);
  const [contactComboOpen, setContactComboOpen] = useState(false);
  const [apptForm, setApptForm] = useState({
    title: "",
    description: "",
    contactId: undefined as number | undefined,
    contactName: "",
    contactPhone: "",
    startAt: "",
    endAt: "",
    status: "pending" as ScheduleAppointment["status"],
    notes: "",
  });

  // ---- calendar ----
  // O calendário tem carga PRÓPRIA, pela janela do mês exibido (grade inteira, incluindo
  // os dias vizinhos que aparecem na primeira/última semana). Assim o volume total do
  // tenant deixa de importar: cada mês carrega só o próprio mês.
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarDayOpen, setCalendarDayOpen] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date | null>(null);
  const [calendarAppts, setCalendarAppts] = useState<ScheduleAppointment[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarTruncated, setCalendarTruncated] = useState(false);

  // ---- reminders ----
  const [reminders, setReminders] = useState<ScheduleReminder[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(true);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [deleteReminderDialogOpen, setDeleteReminderDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ScheduleReminder | null>(null);
  const [deletingReminder, setDeletingReminder] = useState<ScheduleReminder | null>(null);
  const [templates, setTemplates] = useState<WABATemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WABATemplate | null>(null);
  // Ficha de cobranca do lembrete. Estado paralelo ao templateVars: o botao
  // ORDER_DETAILS nao gera variavel de template.
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());
  const reminderMsgRef = useRef<HTMLTextAreaElement>(null);
  const [reminderForm, setReminderForm] = useState({
    name: "",
    description: "",
    hoursBeforeEvent: 24,
    messageType: "message" as "message" | "waba_template",
    messageContent: "",
    whatsappId: undefined as number | undefined,
    active: true,
    templateVars: {} as Record<string, string>,
  });

  const waWhatsapps = whatsapps.filter((w) => WA_CHANNEL_TYPES.includes(w.type));
  const wabaWhatsapps = whatsapps.filter((w) => WABA_ONLY_TYPES.includes(w.type));
  const varFields = buildVariableFields(selectedTemplate, t("templateVarPrefix"), t("urlButtonPrefix"));

  // Template de cobranca (sub_category/display_format/botao ORDER_DETAILS).
  // Template comum nao passa por nada disso: o messageContent sai identico ao
  // de hoje e o job dispara pelo mesmo caminho (D0).
  const isOrderDetailsSelected = useMemo(
    () => isOrderDetailsTemplate(selectedTemplate as unknown as Parameters<typeof isOrderDetailsTemplate>[0]),
    [selectedTemplate]
  );

  // ---- load templates when waba channel is selected ----
  useEffect(() => {
    if (reminderForm.messageType !== "waba_template" || !reminderForm.whatsappId) {
      setTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    const w = wabaWhatsapps.find((x) => x.id === reminderForm.whatsappId);
    if (!w) {
      setTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    setLoadingTemplates(true);
    setTemplates([]);
    setSelectedTemplate(null);
    const currentKey = reminderForm.messageContent;
    // getTemplatesForChannel resolve tokenAPI/id do canal e auto-cura pos-login
    // (sessao pode chegar sem tokenAPI logo apos o login). Cobre WABA e BSP.
    const fetchPromise = import("@/services/channel-templates").then(
      ({ getTemplatesForChannel }) =>
        getTemplatesForChannel({ id: w.id, type: w.type, tokenAPI: w.tokenAPI }),
    );
    fetchPromise
      .then((list: any) => {
        setTemplates([...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
        if (currentKey) {
          if (currentKey.includes("|")) {
            const [name, lang] = currentKey.split("|");
            const found = list.find((tpl: any) => tpl.name === name && tpl.language === lang) ?? null;
            if (found) setSelectedTemplate(found);
          } else {
            const found = list.find((tpl: any) => tpl.name === currentKey) ?? null;
            if (found) {
              setSelectedTemplate(found);
              setReminderForm((f) => ({ ...f, messageContent: `${found.name}|${found.language}` }));
            }
          }
        }
      })
      .catch(() => { toast.error(tErrors("loadFailed")); })
      .finally(() => setLoadingTemplates(false));
  }, [reminderForm.messageType, reminderForm.whatsappId]);

  const loadOptions = useCallback(async () => {
    try {
      const wRes = await fetchWhatsapps();
      const wData = Array.isArray((wRes as any)?.data) ? (wRes as any).data : ((wRes as any)?.data?.data ?? []);
      setWhatsapps(
        Array.isArray(wData)
          ? wData.map((x: any) => ({ id: x.id, name: x.name ?? String(x.id), type: x.type ?? "", tokenAPI: x.tokenAPI }))
          : []
      );
    } catch {
      // optional
    }
  }, []);

  const searchContacts = useCallback(async (query: string) => {
    setSearchingContacts(true);
    try {
      const cRes = await fetchContacts({ searchParam: query, pageNumber: 1 });
      const cData = (cRes as any)?.data?.contacts ?? (cRes as any)?.data ?? (Array.isArray(cRes) ? cRes : []);
      setContacts(Array.isArray(cData) ? cData.map((c: any) => ({ id: c.id, name: c.name ?? "", number: c.number ?? "" })) : []);
    } catch {
      // optional
    } finally {
      setSearchingContacts(false);
    }
  }, []);

  // Janela do mês exibido — a busca do calendário depende dela.
  const calendarRange = useMemo(() => monthGridRange(currentMonth), [currentMonth]);

  // Os inputs de data são `date` (dia local): o começo do dia e o fim do dia viram
  // instante ANTES de ir para a API, senão "até 20/08" cortaria tudo depois das 00:00.
  const toRangeStart = (day: string) => new Date(`${day}T00:00:00`).toISOString();
  const toRangeEnd = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

  const loadAppointments = useCallback(async (targetPage = 1) => {
    setLoadingAppts(true);
    try {
      const { data, pagination } = await fetchAppointments({
        page: targetPage,
        limit: apptPageSize,
        order: apptOrder,
        ...(apptStatusFilter !== "all" ? { status: apptStatusFilter } : {}),
        ...(apptFrom ? { startFrom: toRangeStart(apptFrom) } : {}),
        ...(apptTo ? { startTo: toRangeEnd(apptTo) } : {}),
        ...(apptSearch ? { search: apptSearch } : {}),
      });
      setAppointments(data);
      setApptTotal(pagination?.total ?? data.length);
      setApptTotalPages(Math.max(1, pagination?.totalPages ?? 1));
      setApptPage(pagination?.page ?? targetPage);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoadingAppts(false);
    }
  }, [apptPageSize, apptOrder, apptStatusFilter, apptFrom, apptTo, apptSearch]);

  const loadCalendar = useCallback(async () => {
    setLoadingCalendar(true);
    try {
      const { data, truncated } = await fetchAppointmentsRange({
        startFrom: calendarRange.from,
        startTo: calendarRange.to,
      });
      setCalendarAppts(data);
      setCalendarTruncated(truncated);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoadingCalendar(false);
    }
  }, [calendarRange.from, calendarRange.to]);

  // Recarrega a lista e, se o calendário estiver aberto, também o mês exibido — criar
  // uma consulta pelo calendário tem de aparecer nas duas visões.
  const reloadAfterMutation = useCallback((targetPage = apptPage) => {
    loadAppointments(targetPage);
    if (tab === "calendar") loadCalendar();
  }, [loadAppointments, loadCalendar, apptPage, tab]);

  const loadReminders = useCallback(async () => {
    setLoadingReminders(true);
    try {
      const data = await fetchReminders();
      setReminders(data);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoadingReminders(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
    loadReminders();
  }, [loadOptions, loadReminders]);

  // `loadAppointments` troca de identidade quando algum filtro/ordenação/tamanho de
  // página muda — o efeito volta para a página 1 junto, que é o esperado ao filtrar.
  useEffect(() => {
    loadAppointments(1);
  }, [loadAppointments]);

  // Busca por texto com debounce: cada tecla não pode virar uma requisição.
  useEffect(() => {
    const id = setTimeout(() => setApptSearch(apptSearchInput.trim()), 400);
    return () => clearTimeout(id);
  }, [apptSearchInput]);

  // Carrega o calendário ao abrir a aba e a cada troca de mês (nunca antes disso —
  // quem fica na lista não paga a busca do mês).
  useEffect(() => {
    if (tab !== "calendar") return;
    loadCalendar();
  }, [tab, loadCalendar]);

  const handleContactSearchChange = useCallback((value: string) => {
    setContactSearchQuery(value);
    if (contactSearchRef.current) clearTimeout(contactSearchRef.current);
    contactSearchRef.current = setTimeout(() => {
      searchContacts(value);
    }, 400);
  }, [searchContacts]);

  useEffect(() => {
    if (contactComboOpen) {
      searchContacts(contactSearchQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactComboOpen]);

  // ---- appointment dialog ----
  const openCreateAppt = () => {
    setEditingAppt(null);
    setApptForm({
      title: "",
      description: "",
      contactId: undefined,
      contactName: "",
      contactPhone: "",
      startAt: "",
      endAt: "",
      status: "pending",
      notes: "",
    });
    setApptDialogOpen(true);
  };

  // Clique em dia vazio do calendário: abre a criação com a data pré-preenchida
  // (09:00 local, formato datetime-local do input de startAt).
  const openCreateApptForDay = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditingAppt(null);
    setApptForm({
      title: "",
      description: "",
      contactId: undefined,
      contactName: "",
      contactPhone: "",
      startAt: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00`,
      endAt: "",
      status: "pending",
      notes: "",
    });
    setApptDialogOpen(true);
  };

  const openEditAppt = (a: ScheduleAppointment) => {
    setEditingAppt(a);
    setApptForm({
      title: a.title ?? "",
      description: a.description ?? "",
      contactId: a.contactId ?? undefined,
      contactName: a.contactName ?? "",
      contactPhone: a.contactPhone ?? "",
      startAt: a.startAt ? toDateTimeLocalInput(a.startAt) : "",
      endAt: a.endAt ? toDateTimeLocalInput(a.endAt) : "",
      status: a.status ?? "pending",
      notes: a.notes ?? "",
    });
    setApptDialogOpen(true);
  };

  const handleSaveAppt = async () => {
    if (!apptForm.title.trim()) { toast.error(t("validationTitle")); return; }
    if (!apptForm.startAt) { toast.error(t("validationStartAt")); return; }
    try {
      const payload: Partial<ScheduleAppointment> = {
        title: apptForm.title.trim(),
        description: apptForm.description?.trim() || undefined,
        contactId: apptForm.contactId || null,
        contactName: apptForm.contactName?.trim() || undefined,
        contactPhone: apptForm.contactPhone?.trim() || undefined,
        startAt: new Date(apptForm.startAt).toISOString(),
        endAt: apptForm.endAt ? new Date(apptForm.endAt).toISOString() : null,
        status: apptForm.status,
        notes: apptForm.notes?.trim() || undefined,
      };
      if (editingAppt) {
        await updateAppointment(editingAppt.id, payload);
        toast.success(t("appointmentUpdated"));
      } else {
        await createAppointment(payload);
        toast.success(t("appointmentCreated"));
      }
      setApptDialogOpen(false);
      reloadAfterMutation();
    } catch {
      toast.error(editingAppt ? t("errorUpdate") : t("errorCreate"));
    }
  };

  const handleDeleteAppt = async () => {
    if (!deletingAppt) return;
    try {
      await deleteAppointment(deletingAppt.id);
      toast.success(t("appointmentDeleted"));
      setDeleteApptDialogOpen(false);
      setDeletingAppt(null);
      // Era o último item da página: sem recuar, a tela ficaria numa página que não
      // existe mais e pareceria vazia.
      reloadAfterMutation(appointments.length === 1 && apptPage > 1 ? apptPage - 1 : apptPage);
    } catch {
      toast.error(t("errorDelete"));
    }
  };

  // ---- reminder dialog ----
  const openCreateReminder = () => {
    setEditingReminder(null);
    setTemplates([]);
    setSelectedTemplate(null);
    setOrderDetailsValue(emptyOrderDetails());
    setReminderForm({
      name: "",
      description: "",
      hoursBeforeEvent: 24,
      messageType: "message",
      messageContent: "",
      whatsappId: undefined,
      active: true,
      templateVars: {},
    });
    setReminderDialogOpen(true);
  };

  const openEditReminder = (r: ScheduleReminder) => {
    setEditingReminder(r);
    setTemplates([]);
    setSelectedTemplate(null);
    setOrderDetailsValue(emptyOrderDetails());

    let messageContent = r.messageContent ?? "";
    let templateVars: Record<string, string> = {};
    if (r.messageType === "waba_template" && r.messageContent) {
      try {
        const parsed = JSON.parse(r.messageContent);
        if (parsed.templateName) {
          messageContent = parsed.language
            ? `${parsed.templateName}|${parsed.language}`
            : parsed.templateName;
          templateVars = migrateLegacyTemplateVars(parsed.vars || {});
          // Reidrata a ficha de cobranca salva (ausente em template comum).
          if (parsed.orderDetails) setOrderDetailsValue(hydrateOrderDetails(parsed.orderDetails));
        }
      } catch {
        // plain template name
      }
    }

    setReminderForm({
      name: r.name ?? "",
      description: r.description ?? "",
      hoursBeforeEvent: r.hoursBeforeEvent ?? 24,
      messageType: (r.messageType as "message" | "waba_template") ?? "message",
      messageContent,
      whatsappId: r.whatsappId ?? undefined,
      active: r.active ?? true,
      templateVars,
    });
    setReminderDialogOpen(true);
  };

  const handleSaveReminder = async () => {
    if (!reminderForm.name.trim()) { toast.error(t("validationReminderName")); return; }
    if (reminderForm.hoursBeforeEvent < 0) { toast.error(t("validationHours")); return; }
    if (reminderForm.messageType === "message" && !reminderForm.messageContent.trim()) {
      toast.error(t("validationMessageContent")); return;
    }
    if (reminderForm.messageType === "waba_template" && (!reminderForm.whatsappId || !reminderForm.messageContent.trim())) {
      toast.error(t("validationWabaRequired")); return;
    }
    if (reminderForm.messageType === "waba_template") {
      // Cobrança: valida antes de gravar — o job só descobriria o erro na hora do
      // disparo, quando o lembrete já viraria log "failed" sem ninguém olhando.
      if (isOrderDetailsSelected) {
        const orderError = validateOrderDetails(orderDetailsValue);
        if (orderError) { toast.warning(tOrder(orderError)); return; }
      }
      // Header de mídia exige URL http(s) — texto comum vira image.link e a Meta
      // rejeita (#100) no disparo. Placeholder {{...}} é aceito (substituído em runtime).
      const tplHeader = (selectedTemplate?.components as { type?: string; format?: string }[] | undefined)?.find((c) => c.type === "HEADER");
      if (tplHeader && ["VIDEO", "IMAGE", "DOCUMENT"].includes(tplHeader.format || "")) {
        const urlVal = (reminderForm.templateVars["header_link"] || "").trim();
        if (!isValidHttpUrl(urlVal) && !/\{\{.+\}\}/.test(urlVal)) {
          toast.error(tErrors("invalidMediaHeaderUrl"));
          return;
        }
      }
    }

    try {
      let messageContent = reminderForm.messageContent.trim();
      if (reminderForm.messageType === "waba_template") {
        const rawKey = reminderForm.messageContent.trim();
        const templateName = rawKey.includes("|") ? rawKey.split("|")[0] : rawKey;
        const components = buildComponentsForSave(selectedTemplate, reminderForm.templateVars);
        // D7: a ficha vai SEM referência. Um lembrete dispara uma vez por
        // agendamento elegível, e o "Nº da cobrança" é lido pelo cliente — gravar
        // a referência aqui faria todos os disparos repetirem a mesma cobrança.
        // O job gera uma referência nova a cada envio.
        const orderDetailsField = isOrderDetailsSelected
          ? {
              orderDetails: buildOrderDetailsPayload(orderDetailsValue),
              orderDetailsButtonIndex: findOrderDetailsButtonIndex(
                selectedTemplate?.components as Parameters<typeof findOrderDetailsButtonIndex>[0]
              ),
            }
          : {};
        messageContent = JSON.stringify({
          templateName,
          language: selectedTemplate?.language || "pt_BR",
          vars: reminderForm.templateVars,
          components,
          ...orderDetailsField,
        });
      }

      const payload: Partial<ScheduleReminder> = {
        name: reminderForm.name.trim(),
        description: reminderForm.description?.trim() || undefined,
        hoursBeforeEvent: reminderForm.hoursBeforeEvent,
        messageType: reminderForm.messageType,
        messageContent,
        whatsappId: reminderForm.whatsappId || null,
        active: reminderForm.active,
      };

      if (editingReminder) {
        await updateReminder(editingReminder.id, payload);
        toast.success(t("reminderUpdated"));
      } else {
        await createReminder(payload);
        toast.success(t("reminderCreated"));
      }
      setReminderDialogOpen(false);
      loadReminders();
    } catch {
      toast.error(editingReminder ? t("errorUpdate") : t("errorCreate"));
    }
  };

  const handleDeleteReminder = async () => {
    if (!deletingReminder) return;
    try {
      await deleteReminder(deletingReminder.id);
      toast.success(t("reminderDeleted"));
      setDeleteReminderDialogOpen(false);
      setDeletingReminder(null);
      loadReminders();
    } catch {
      toast.error(t("errorDelete"));
    }
  };

  const handleToggleReminder = async (r: ScheduleReminder) => {
    try {
      await toggleReminder(r.id);
      toast.success(r.active ? t("reminderDeactivated") : t("reminderActivated"));
      loadReminders();
    } catch {
      toast.error(t("errorToggle"));
    }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      pending: t("statusPending"),
      confirmed: t("statusConfirmed"),
      cancelled: t("statusCancelled"),
      completed: t("statusCompleted"),
      no_show: t("statusNoShow"),
    };
    return map[s] ?? s;
  };

  // ---- calendar helpers ----
  const prevMonth = () => setCurrentMonth((d) => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; });
  const nextMonth = () => setCurrentMonth((d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; });

  const monthName = currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const calendarDays = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  const apptsByDateKey = useMemo(() => {
    const byKey: Record<string, ScheduleAppointment[]> = {};
    calendarAppts.forEach((a) => {
      if (!a.startAt) return;
      const d = new Date(a.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(a);
    });
    // Dentro do dia, ordem por horário — o backend ordena o intervalo inteiro, mas a
    // paginação pode entregar as páginas fora de ordem entre si.
    Object.values(byKey).forEach((list) =>
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    );
    return byKey;
  }, [calendarAppts]);

  const getApptsByDay = (date: Date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return apptsByDateKey[key] ?? [];
  };

  const calendarSelectedAppts = useMemo(() => {
    if (!calendarSelectedDate) return [];
    return getApptsByDay(calendarSelectedDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarSelectedDate, apptsByDateKey]);

  const hasApptFilters = apptStatusFilter !== "all" || !!apptFrom || !!apptTo || !!apptSearch;

  const clearApptFilters = () => {
    setApptStatusFilter("all");
    setApptFrom("");
    setApptTo("");
    setApptSearchInput("");
    setApptSearch("");
  };

  if (loadingAppts && loadingReminders) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
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
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="appointments" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Calendar className="h-4 w-4 shrink-0" />
              {t("tabAppointments")}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Calendar className="h-4 w-4 shrink-0" />
              {t("tabCalendar")}
            </TabsTrigger>
            <TabsTrigger value="reminders" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Bell className="h-4 w-4 shrink-0" />
              {t("tabReminders")}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ---- APPOINTMENTS TAB ---- */}
        <TabsContent value="appointments" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={openCreateAppt}>
              <Plus className="mr-2 h-4 w-4" />
              {t("newAppointment")}
            </Button>
          </div>

          {/* Filtros — o recorte é feito NO BANCO (situação, período e texto), então a
              tela carrega só a página exibida por mais consultas que o tenant tenha. */}
          <Card>
            <CardContent className="py-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>{t("filterStatusLabel")}</Label>
                  <Select value={apptStatusFilter} onValueChange={setApptStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("filterAll")}</SelectItem>
                      {APPT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appt-from">{t("filterFromLabel")}</Label>
                  <Input
                    id="appt-from"
                    type="date"
                    value={apptFrom}
                    onChange={(e) => setApptFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appt-to">{t("filterToLabel")}</Label>
                  <Input
                    id="appt-to"
                    type="date"
                    value={apptTo}
                    onChange={(e) => setApptTo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appt-search">{t("searchLabel")}</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="appt-search"
                      className="pl-8"
                      value={apptSearchInput}
                      onChange={(e) => setApptSearchInput(e.target.value)}
                      placeholder={t("searchPlaceholder")}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label>{t("sortLabel")}</Label>
                  <Select value={apptOrder} onValueChange={(v) => setApptOrder(v as "asc" | "desc")}>
                    <SelectTrigger className="w-[210px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">{t("sortAsc")}</SelectItem>
                      <SelectItem value="desc">{t("sortDesc")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("perPageLabel")}</Label>
                  <Select value={String(apptPageSize)} onValueChange={(v) => setApptPageSize(Number(v))}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPT_PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {hasApptFilters && (
                  <Button variant="ghost" onClick={clearApptFilters}>
                    {t("clearFilters")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {loadingAppts && appointments.length === 0 ? (
            <Skeleton className="h-64 w-full" />
          ) : appointments.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={Calendar}
                  title={hasApptFilters ? t("noResults") : t("noAppointments")}
                  description={hasApptFilters ? t("noResultsDesc") : t("noAppointmentsDesc")}
                >
                  {hasApptFilters ? (
                    <Button variant="outline" onClick={clearApptFilters}>
                      {t("clearFilters")}
                    </Button>
                  ) : (
                    <Button onClick={openCreateAppt}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t("newAppointment")}
                    </Button>
                  )}
                </EmptyState>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colTitle")}</TableHead>
                      <TableHead>{t("colContact")}</TableHead>
                      <TableHead>{t("colDate")}</TableHead>
                      <TableHead>{t("colStatus")}</TableHead>
                      <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.title}</TableCell>
                        <TableCell>
                          <span className={cn(isLiveMode && "live-blur-text")}>
                            {a.contact?.name || a.contactName || "-"}
                          </span>
                          {(displayContactIdentity(a.contact) || a.contactPhone) && (
                            <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>
                              {displayContactIdentity(a.contact) || a.contactPhone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{formatDateTime(a.startAt)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_COLORS[a.status] as any}>
                            {statusLabel(a.status)}
                          </Badge>
                          {a.checkInStatus === "on_the_way" && (
                            <Badge variant="outline" className="ml-1 text-xs text-green-600 border-green-600/40">
                              {t("checkInOnTheWay")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditAppt(a)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => { setDeletingAppt(a); setDeleteApptDialogOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>

                {/* Paginação */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    {loadingAppts && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>
                      {apptTotal} {apptTotal === 1 ? t("record") : t("records")}
                      {apptTotalPages > 1 &&
                        ` — ${t("pageIndicator", { page: apptPage, total: apptTotalPages })}`}
                    </span>
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={apptPage <= 1 || loadingAppts}
                      title={t("prevPage")}
                      aria-label={t("prevPage")}
                      onClick={() => loadAppointments(apptPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={apptPage >= apptTotalPages || loadingAppts}
                      title={t("nextPage")}
                      aria-label={t("nextPage")}
                      onClick={() => loadAppointments(apptPage + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---- REMINDERS TAB ---- */}
        <TabsContent value="reminders" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button onClick={openCreateReminder}>
              <Plus className="mr-2 h-4 w-4" />
              {t("newReminder")}
            </Button>
          </div>
          {reminders.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState icon={Bell} title={t("noReminders")} description={t("noRemindersDesc")}>
                  <Button onClick={openCreateReminder}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("newReminder")}
                  </Button>
                </EmptyState>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead>{t("colHoursBefore")}</TableHead>
                      <TableHead>{t("colType")}</TableHead>
                      <TableHead>{t("colChannel")}</TableHead>
                      <TableHead>{t("colActive")}</TableHead>
                      <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reminders.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.hoursBeforeEvent}h</TableCell>
                        <TableCell>
                          {r.messageType === "waba_template" ? t("messageTypeWabaTemplate") : t("messageTypeMessage")}
                        </TableCell>
                        <TableCell>{r.whatsapp?.name ?? "-"}</TableCell>
                        <TableCell>
                          <Switch checked={r.active} onCheckedChange={() => handleToggleReminder(r)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditReminder(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => { setDeletingReminder(r); setDeleteReminderDialogOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---- CALENDAR TAB ---- */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="flex items-center gap-2 text-sm font-semibold capitalize">
                  {monthName}
                  {loadingCalendar && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </span>
                <button
                  onClick={nextMonth}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {calendarTruncated && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
                  <p>{t("calendarTruncatedNote")}</p>
                </div>
              )}

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
                {WEEKDAYS_KEYS.map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {t(`weekdays.${day}`)}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {calendarDays.map((day, idx) => {
                  const appts = getApptsByDay(day.date);
                  const hasAppts = appts.length > 0;
                  const isToday = sameLocalDate(day.date, new Date());
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (!hasAppts) {
                          // Dia vazio: cria compromisso já com a data pré-preenchida.
                          openCreateApptForDay(day.date);
                          return;
                        }
                        setCalendarSelectedDate(day.date);
                        setCalendarDayOpen(true);
                      }}
                      className={[
                        "min-h-[72px] sm:min-h-[90px] rounded-lg border p-1.5 transition-colors",
                        day.inMonth ? "bg-background" : "bg-muted/30 opacity-50",
                        hasAppts ? "border-primary/40 bg-primary/5 cursor-pointer hover:bg-primary/10" : "cursor-pointer hover:bg-muted/50",
                        isToday ? "ring-2 ring-primary/50" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        {day.num}
                      </div>
                      <div className="space-y-0.5">
                        {appts.slice(0, 2).map((a) => (
                          <div
                            key={a.id}
                            className="text-xs rounded px-1 py-0.5 truncate bg-primary/12 border-l-2 border-primary"
                            title={a.title}
                          >
                            {a.title}
                          </div>
                        ))}
                        {appts.length > 2 && (
                          <div className="text-xs text-muted-foreground pl-1">
                            +{appts.length - 2}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {calendarAppts.length === 0 && !loadingCalendar && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Calendar className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">{t("calendarNoAppointments")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("calendarNoAppointmentsDesc")}</p>
                </div>
              )}

              <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                <p>{t("calendarMonthScopeNote")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- CALENDAR DAY MODAL ---- */}
      <Dialog open={calendarDayOpen} onOpenChange={setCalendarDayOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {calendarSelectedDate?.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {calendarSelectedAppts.map((a) => (
              <button
                key={a.id}
                onClick={() => { setCalendarDayOpen(false); openEditAppt(a); }}
                className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>{formatDateTime(a.startAt)}</span>
                  <Badge variant={STATUS_COLORS[a.status] as any} className="text-xs">
                    {statusLabel(a.status)}
                  </Badge>
                </div>
                {(a.contact?.name || a.contactName) && (
                  <div className={cn("text-xs text-muted-foreground mt-0.5", isLiveMode && "live-blur-text")}>
                    {a.contact?.name || a.contactName}
                  </div>
                )}
                {a.formAnswersList && a.formAnswersList.length > 0 && (
                  <div className="mt-1.5 border-t pt-1.5 space-y-0.5">
                    {a.formAnswersList.map((fa, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium">{fa.label}:</span>{" "}
                        <span className={cn("text-muted-foreground break-words", isLiveMode && "live-blur-text")}>{fa.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- APPOINTMENT DIALOG ---- */}
      <Dialog open={apptDialogOpen} onOpenChange={setApptDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingAppt ? t("editAppointment") : t("newAppointmentTitle")}</DialogTitle>
            <DialogDescription>{t("appointmentDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 pr-1">
            <div className="grid gap-2">
              <Label>{t("titleLabel")}</Label>
              <Input
                value={apptForm.title}
                onChange={(e) => setApptForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("titlePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("descriptionLabel")}</Label>
              <Textarea
                value={apptForm.description}
                onChange={(e) => setApptForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("descriptionPlaceholder")}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("contactLabel")}</Label>
              <Popover open={contactComboOpen} onOpenChange={setContactComboOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className={cn(apptForm.contactId ? "" : "text-muted-foreground", isLiveMode && apptForm.contactId && "live-blur-text")}>
                      {apptForm.contactId
                        ? contacts.find((c) => c.id === apptForm.contactId)?.name ?? t("contactPlaceholder")
                        : t("contactPlaceholder")}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder={t("contactSearchPlaceholder")}
                      value={contactSearchQuery}
                      onValueChange={handleContactSearchChange}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {searchingContacts ? (
                          <span className="flex items-center gap-2 justify-center py-1 text-sm text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> {t("contactSearchPlaceholder")}
                          </span>
                        ) : t("contactNotFound")}
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => {
                            setApptForm((f) => ({ ...f, contactId: undefined }));
                            setContactComboOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${!apptForm.contactId ? "opacity-100" : "opacity-0"}`} />
                          {t("contactNone")}
                        </CommandItem>
                        {contacts.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.number}`}
                            onSelect={() => {
                              setApptForm((f) => ({
                                ...f,
                                contactId: c.id,
                                contactName: c.name,
                                contactPhone: c.number,
                              }));
                              setContactComboOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${apptForm.contactId === c.id ? "opacity-100" : "opacity-0"}`} />
                            <span className={cn(isLiveMode && "live-blur-text")}>{c.name}</span>
                            {c.number && <span className={cn("ml-1 text-muted-foreground text-xs", isLiveMode && "live-blur-text")}>— {c.number}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {!apptForm.contactId && (
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label>{t("contactNameLabel")}</Label>
                  <Input
                    value={apptForm.contactName}
                    onChange={(e) => setApptForm((f) => ({ ...f, contactName: e.target.value }))}
                    placeholder={t("contactNamePlaceholder")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("contactPhoneLabel")}</Label>
                  <Input
                    value={apptForm.contactPhone}
                    onChange={(e) => setApptForm((f) => ({ ...f, contactPhone: e.target.value }))}
                    placeholder={t("contactPhonePlaceholder")}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>{t("startAtLabel")}</Label>
                <Input
                  type="datetime-local"
                  value={apptForm.startAt}
                  onChange={(e) => setApptForm((f) => ({ ...f, startAt: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("endAtLabel")}</Label>
                <Input
                  type="datetime-local"
                  value={apptForm.endAt}
                  onChange={(e) => setApptForm((f) => ({ ...f, endAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("statusLabel")}</Label>
              <Select
                value={apptForm.status}
                onValueChange={(v) => setApptForm((f) => ({ ...f, status: v as ScheduleAppointment["status"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("statusPending")}</SelectItem>
                  <SelectItem value="confirmed">{t("statusConfirmed")}</SelectItem>
                  <SelectItem value="cancelled">{t("statusCancelled")}</SelectItem>
                  <SelectItem value="completed">{t("statusCompleted")}</SelectItem>
                  <SelectItem value="no_show">{t("statusNoShow")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("notesLabel")}</Label>
              <Textarea
                value={apptForm.notes}
                onChange={(e) => setApptForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={t("notesPlaceholder")}
                rows={2}
              />
            </div>
            {editingAppt?.formAnswersList && editingAppt.formAnswersList.length > 0 && (
              <div className="grid gap-2">
                <Label>{t("formAnswersLabel")}</Label>
                <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                  {editingAppt.formAnswersList.map((fa, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{fa.label}:</span>{" "}
                      <span className={cn("text-muted-foreground break-words", isLiveMode && "live-blur-text")}>{fa.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setApptDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveAppt}>{editingAppt ? t("save") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- REMINDER DIALOG ---- */}
      <Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingReminder ? t("editReminder") : t("newReminderTitle")}</DialogTitle>
            <DialogDescription>{t("reminderDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 pr-1">
            <div className="grid gap-2">
              <Label>{t("nameLabel")}</Label>
              <Input
                value={reminderForm.name}
                onChange={(e) => setReminderForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("hoursBeforeLabel")}</Label>
              <Input
                type="number"
                min={0}
                value={reminderForm.hoursBeforeEvent}
                onChange={(e) => setReminderForm((f) => ({ ...f, hoursBeforeEvent: Number(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">{t("hoursBeforeHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label>{t("messageTypeLabel")}</Label>
              <Select
                value={reminderForm.messageType}
                onValueChange={(v) => {
                  setSelectedTemplate(null);
                  setTemplates([]);
                  setReminderForm((f) => ({ ...f, messageType: v as "message" | "waba_template", messageContent: "", whatsappId: undefined, templateVars: {} }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">{t("messageTypeMessage")}</SelectItem>
                  <SelectItem value="waba_template">{t("messageTypeWabaTemplate")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reminderForm.messageType === "message" && (
              <>
                <div className="grid gap-2">
                  <Label>{t("messageContentLabel")}</Label>
                  <Textarea
                    ref={reminderMsgRef}
                    value={reminderForm.messageContent}
                    onChange={(e) => setReminderForm((f) => ({ ...f, messageContent: e.target.value }))}
                    placeholder={t("messageContentPlaceholder")}
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-muted-foreground self-center">{t("variablesLabel")}:</span>
                    {[
                      { label: t("varName"), value: "{{nome}}" },
                      { label: t("varFirstName"), value: "{{primeiroNome}}" },
                      { label: t("varPhone"), value: "{{telefone}}" },
                      { label: t("varDate"), value: "{{data}}" },
                      { label: t("varTime"), value: "{{hora}}" },
                      { label: t("varTitle"), value: "{{titulo}}" },
                    ].map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => {
                          const el = reminderMsgRef.current;
                          if (!el) { setReminderForm((f) => ({ ...f, messageContent: f.messageContent + v.value })); return; }
                          const start = el.selectionStart ?? el.value.length;
                          const end = el.selectionEnd ?? el.value.length;
                          const next = el.value.slice(0, start) + v.value + el.value.slice(end);
                          setReminderForm((f) => ({ ...f, messageContent: next }));
                          requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + v.value.length, start + v.value.length); });
                        }}
                        className="inline-flex items-center rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors"
                      >
                        {v.label} <span className="ml-1 font-mono opacity-60">{v.value}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>{t("channelLabel")}</Label>
                  <Select
                    value={String(reminderForm.whatsappId ?? "")}
                    onValueChange={(v) => setReminderForm((f) => ({ ...f, whatsappId: v ? Number(v) : undefined }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {waWhatsapps.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {reminderForm.messageType === "waba_template" && (
              <>
                <div className="grid gap-2">
                  <Label>{t("wabaChannelLabel")}</Label>
                  <Select
                    value={String(reminderForm.whatsappId ?? "")}
                    onValueChange={(v) => {
                      setSelectedTemplate(null);
                      setOrderDetailsValue(emptyOrderDetails());
                      setReminderForm((f) => ({ ...f, whatsappId: v ? Number(v) : undefined, messageContent: "", templateVars: {} }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {wabaWhatsapps.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {reminderForm.whatsappId && (
                  <div className="grid gap-2">
                    <Label>{t("templateLabel")}</Label>
                    {loadingTemplates ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("loadingTemplates")}
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">{t("noTemplates")}</p>
                    ) : (
                      <Select
                        value={reminderForm.messageContent}
                        onValueChange={(v) => {
                          const [tplName, tplLang] = v.split("|");
                          const found = templates.find((tpl) => tpl.name === tplName && tpl.language === tplLang) ?? null;
                          setSelectedTemplate(found);
                          // Zera a ficha ao trocar de template (o botao de cobranca nao gera variavel).
                          setOrderDetailsValue(emptyOrderDetails());
                          setReminderForm((f) => ({ ...f, messageContent: v, templateVars: {} }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((tpl) => (
                            <SelectItem key={`${tpl.name}|${tpl.language}`} value={`${tpl.name}|${tpl.language}`}>
                              {tpl.name} ({tpl.language})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                {/* Ficha de cobrança — só aparece em template ORDER_DETAILS */}
                {isOrderDetailsSelected && selectedTemplate && (
                  <div className="grid gap-2 rounded-md border p-3">
                    <div>
                      <Label className="text-xs mb-0.5 block">{tOrder("sectionTitle")}</Label>
                      <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                    </div>
                    <OrderDetailsFields
                      key={`${editingReminder?.id ?? "new"}-${selectedTemplate.name}-${selectedTemplate.language}`}
                      value={orderDetailsValue}
                      onChange={setOrderDetailsValue}
                      compact
                      bulkWarning
                    />
                  </div>
                )}
                {varFields.length > 0 && (
                  <div className="grid gap-3 rounded-md border p-3 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("templateVarsSection")}
                    </p>
                    {varFields.map((field) => (
                      <div key={field.key} className="grid gap-1">
                        <Label className="text-xs">{field.label}</Label>
                        <Input
                          value={reminderForm.templateVars[field.key] ?? ""}
                          onChange={(e) =>
                            setReminderForm((f) => ({
                              ...f,
                              templateVars: { ...f.templateVars, [field.key]: e.target.value },
                            }))
                          }
                          placeholder={field.label}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={reminderForm.active}
                onCheckedChange={(v) => setReminderForm((f) => ({ ...f, active: v }))}
              />
              <Label>{t("colActive")}</Label>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setReminderDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveReminder}>{editingReminder ? t("save") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- DELETE APPOINTMENT ---- */}
      <Dialog open={deleteApptDialogOpen} onOpenChange={setDeleteApptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteAppointment")}</DialogTitle>
            <DialogDescription>
              {t("deleteAppointmentConfirm")} &quot;{deletingAppt?.title}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteApptDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteAppt}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- DELETE REMINDER ---- */}
      <Dialog open={deleteReminderDialogOpen} onOpenChange={setDeleteReminderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteReminder")}</DialogTitle>
            <DialogDescription>
              {t("deleteReminderConfirm")} &quot;{deletingReminder?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteReminderDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteReminder}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
