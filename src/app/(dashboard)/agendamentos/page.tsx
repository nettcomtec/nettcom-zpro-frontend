"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Calendar,
  Loader2,
  Plus,
  Search,
  Trash2,
  Info,
  Smile,
  Paperclip,
  X,
  PenSquare,
  Images,
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { add, format } from "date-fns";
const uuidv4 = () => crypto.randomUUID();
import {
  fetchSchedules,
  createScheduleMessage,
  createWabaTemplateSchedule,
  createGupshupTemplateSchedule,
  createDialog360TemplateSchedule,
  type ScheduleMessage,
} from "@/services/schedules";
import { fetchContacts, type Contact } from "@/services/contacts";
import { fetchQueues } from "@/services/queues";
import { fetchAllUsers } from "@/services/users";
import {
  fetchWhatsapps,
  type Whatsapp,
  type WABATemplate,
} from "@/services/whatsapp";
import { getTemplatesForChannel } from "@/services/channel-templates";
import {
  TemplateCategorySelect,
  type TemplateCategoryFilter,
  matchTemplateCategory,
} from "@/components/atendimento/template-category-filter";
import { MessageContentView } from "@/components/atendimento/message-bubble";
import { getTicketLastMessagePreview } from "@/lib/template-preview";
import type { Message as BubbleMessage } from "@/stores/ticket-store";
import api from "@/lib/api";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { useAuthStore } from "@/stores/auth-store";
// Cobranca (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F6.4.
// A ficha viaja como campo proprio (`orderDetails`) da rota de agendamento WABA,
// que monta o componente e grava a cobranca. Cada repeticao da recorrencia e um
// POST separado, logo uma referencia propria por disparo (D7).
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { buildSignedBody } from "@/lib/signature";
import { useTableDensity } from "@/hooks/use-table-density";
import { TableDensityToggle } from "@/components/ui/table-density-toggle";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useLiveMode } from "@/hooks/use-live-mode";

// ── Emoji categories and other labeled constants are built inside the component
// using t() — see component body below

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return formatDateTime(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

const statusVariants: Record<string, "success" | "destructive" | "secondary" | "outline"> = {
  sent: "success",
  sended: "success",
  failed: "destructive",
  pending: "secondary",
  canceled: "outline",
};

async function deleteSchedule(id: number | string) {
  return api.delete(`/messages`, { data: { id } });
}

// ── Special-message detection (template/botões/mídia → render como bubble) ───

const PLAIN_TEXT_TYPES = ["chat", "text", "extendedTextMessage", "conversation", ""];
const SPECIAL_BODY_PREFIXES = [
  "GenericTemplate:", "ButtonTemplate:", "MediaTemplate:",
  "Receipt:", "CustomerFeedback:", "Carousel:", "QR:",
];
const TEMPLATE_BAILEYS_MARKERS = ["[QuickReply]", "[Botões]", "[Botoes]", "[Link]", "[Ligar]"];

function isSpecialScheduleMessage(s: ScheduleMessage): boolean {
  const mt = s.mediaType || "chat";
  if (!PLAIN_TEXT_TYPES.includes(mt)) return true;
  const trimmed = (s.body || "").trimStart();
  if (SPECIAL_BODY_PREFIXES.some((p) => trimmed.startsWith(p))) return true;
  if (TEMPLATE_BAILEYS_MARKERS.some((m) => trimmed.includes(m))) return true;
  if ((trimmed.startsWith("[") || trimmed.startsWith("{")) && /"type"\s*:\s*"/.test(trimmed)) return true;
  if (trimmed.includes("BEGIN:VCARD")) return true;
  return false;
}

function toBubbleMessage(s: ScheduleMessage): BubbleMessage {
  return {
    id: String(s.id),
    body: s.body,
    mediaType: s.mediaType || "chat",
    mediaUrl: s.mediaUrl,
    dataJson: s.dataJson,
    fromMe: true,
    read: true,
    createdAt: s.createdAt || s.scheduleDate,
  } as unknown as BubbleMessage;
}

function shortId(id: number | string): string {
  const idStr = String(id);
  return idStr.length > 10 ? `${idStr.slice(0, 8)}…` : idStr;
}

function schedulePreviewText(s: ScheduleMessage): string {
  const preview = getTicketLastMessagePreview(s.body);
  if (preview && preview.trim()) return preview;
  return s.mediaUrl ? "📎" : s.body;
}

// ── WABA template variable field builder ─────────────────────────────────────

interface TemplateVariableField {
  key: string;
  label: string;
  value: string;
}

function buildVariableFields(template: WABATemplate, tFn: (key: string) => string): TemplateVariableField[] {
  const fields: TemplateVariableField[] = [];
  if (!template.components) return fields;

  for (const _comp of template.components) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = _comp as any;
    if (comp.type === "HEADER") {
      // Header media (IMAGE/VIDEO/DOCUMENT) → key unificada `header_link`
      if (["VIDEO", "IMAGE", "DOCUMENT"].includes(comp.format || "")) {
        if (!fields.some((f) => f.key === "header_link")) {
          fields.push({ key: "header_link", label: `URL Header (${comp.format})`, value: "" });
        }
        continue;
      }
      if (comp.format === "TEXT") {
        const text = String(comp.text || "");
        // Named variables {{nome}}, {{cliente}} etc.
        [...text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].forEach((m) => {
          const k = `header_named_variable_${m[1]}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `Header {{${m[1]}}}`, value: "" });
        });
        // Positional variables {{1}}, {{2}}
        [...text.matchAll(/\{\{(\d+)\}\}/g)].forEach((m) => {
          const k = `header_variable_${m[1]}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `Header {{${m[1]}}}`, value: "" });
        });
      }
    } else if (comp.type === "BODY") {
      const text = String(comp.text || "");
      [...text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].forEach((m) => {
        const k = `body_named_variable_${m[1]}`;
        if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${tFn("templateVariable")} {{${m[1]}}}`, value: "" });
      });
      [...text.matchAll(/\{\{(\d+)\}\}/g)].forEach((m) => {
        const k = `body_variable_${m[1]}`;
        if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${tFn("templateVariable")} {{${m[1]}}}`, value: "" });
      });
    } else if (comp.type === "BUTTONS" && Array.isArray(comp.buttons)) {
      (comp.buttons as Array<{ type: string; url?: string; text?: string }>).forEach((btn, i) => {
        if (btn.type === "URL" && (btn.url || "").includes("{{1}}")) {
          const k = `button_${i}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${tFn("urlButton")} ${i + 1}`, value: "" });
        } else if (btn.type === "COPY_CODE") {
          const k = `button_${i}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${tFn("urlButton")} ${i + 1}`, value: "" });
        }
      });
    }
  }
  return fields;
}

function buildComponentsPayload(template: WABATemplate, fields: TemplateVariableField[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: any[] = [];

  // ── HEADER ────────────────────────────────────────────────────────────────
  const headerLink = fields.find((f) => f.key === "header_link");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tplHeader = (template.components as any[])?.find((c) => c.type === "HEADER");
  if (headerLink?.value && tplHeader && ["IMAGE", "VIDEO", "DOCUMENT"].includes(tplHeader.format)) {
    components.push({ type: "HEADER", format: tplHeader.format, value: headerLink.value });
  } else {
    const headerPositional = fields.filter((f) => f.key.startsWith("header_variable_"));
    const headerNamed = fields.filter((f) => f.key.startsWith("header_named_variable_"));
    if (headerPositional.length > 0) {
      const variables: string[] = [];
      headerPositional
        .sort((a, b) => parseInt(a.key.replace("header_variable_", ""), 10) - parseInt(b.key.replace("header_variable_", ""), 10))
        .forEach((f, i) => { variables[i] = f.value; });
      components.push({ type: "HEADER", format: "TEXT", variables });
    } else if (headerNamed.length > 0) {
      components.push({
        type: "HEADER",
        format: "TEXT",
        parameters: headerNamed.map((f) => ({ type: "text", text: f.value, name: f.key.replace("header_named_variable_", "") })),
      });
    }
  }

  // ── BODY ─────────────────────────────────────────────────────────────────
  const bodyPositional = fields.filter((f) => f.key.startsWith("body_variable_"));
  const bodyNamed = fields.filter((f) => f.key.startsWith("body_named_variable_"));
  if (bodyPositional.length > 0) {
    const variables: string[] = [];
    bodyPositional
      .sort((a, b) => parseInt(a.key.replace("body_variable_", ""), 10) - parseInt(b.key.replace("body_variable_", ""), 10))
      .forEach((f, i) => { variables[i] = f.value; });
    components.push({ type: "BODY", variables });
  } else if (bodyNamed.length > 0) {
    components.push({
      type: "BODY",
      parameters: bodyNamed.map((f) => ({ type: "text", text: f.value, name: f.key.replace("body_named_variable_", "") })),
    });
  }

  // ── BUTTONS ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tplButtons = (template.components as any[])?.find((c) => c.type === "BUTTONS");
  if (tplButtons?.buttons?.length) {
    const buttonParams: Record<string, unknown>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tplButtons.buttons as any[]).forEach((btn: any, idx: number) => {
      const varEntry = fields.find((f) => f.key === `button_${idx}`);
      if (btn.type === "COPY_CODE" && varEntry) {
        buttonParams.push({
          type: "button",
          sub_type: "copy_code",
          index: String(idx),
          parameters: [{ type: "coupon_code", coupon_code: varEntry.value }],
        });
      } else if (btn.type === "URL" && (btn.url || "").includes("{{1}}") && varEntry) {
        buttonParams.push({
          type: "button",
          sub_type: "url",
          index: String(idx),
          parameters: [{ type: "text", text: varEntry.value }],
        });
      }
    });
    if (buttonParams.length > 0) {
      components.push({ type: "BUTTONS", buttons: buttonParams });
    }
  }
  return components;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgendamentosPage() {
  const t = useTranslations("agendamentosPage");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");
  const allowed = usePageAccess("agendamentos", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  const { density, updateDensity, rowClassName, cellClassName } = useTableDensity();
  const { user } = useAuthStore();
  const isSupervisorAdminLimited = useAuthStore((s) => s.isSupervisorAdmin());
  const { isLiveMode } = useLiveMode();

  // ── Emoji categories ────────────────────────────────────────────────────────
  const EMOJI_CATEGORIES = [
    { label: t("emojiFrequent"), emojis: ["😀","😂","😍","👍","👎","🙏","🎉","❤️","🔥","😎","😢","😡","🤔","👋","✅","❌","⚡","💯","🙌","😊"] },
    { label: t("emojiFaces"), emojis: ["😃","😄","😁","😆","🥹","😅","🤣","🥲","☺️","😇","🙂","🙃","😉","😌","😋","😛","😜","🤪","😝","🤑"] },
    { label: t("emojiGestures"), emojis: ["👏","🤝","🫶","🤲","🤞","✌️","🤟","🤘","👌","🫰","🫵","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖"] },
    { label: t("emojiObjects"), emojis: ["📎","📁","📄","📝","💻","📱","☎️","📧","📷","🎥","🔔","🔒","🔑","💡","🔍","📌","📊","📈","🗓️","⏰"] },
  ];

  // ── Schedule quick presets ──────────────────────────────────────────────────
  const SCHEDULE_PRESETS = [
    { label: t("presetCustom"), value: "custom" },
    { label: t("preset30min"), value: "30min" },
    { label: t("presetTomorrow"), value: "amanha" },
    { label: t("presetNextWeek"), value: "semana" },
  ];

  // ── Recurrence options ──────────────────────────────────────────────────────
  const RECURRENCE_OPTIONS = [
    { label: t("recurrenceNone"), value: "none" },
    { label: t("recurrence5"), value: "5" },
    { label: t("recurrence10"), value: "10" },
    { label: t("recurrence15"), value: "15" },
    { label: t("recurrence20"), value: "20" },
    { label: t("recurrence25"), value: "25" },
    { label: t("recurrence30"), value: "30" },
    { label: t("recurrence35"), value: "35" },
    { label: t("recurrence40"), value: "40" },
    { label: t("recurrence45"), value: "45" },
    { label: t("recurrence60"), value: "60" },
    { label: t("presetCustom"), value: "custom" },
  ];

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ScheduleMessage[]>([]);
  const [search, setSearch] = useState("");
  // A lista vem paginada do servidor (40 por página): sem navegar entre as
  // páginas, só os 40 agendamentos mais recentes apareciam.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const loadSeqRef = useRef(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ScheduleMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Details dialog (clique na linha)
  const [detailTarget, setDetailTarget] = useState<ScheduleMessage | null>(null);

  // Contact search / autocomplete
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  // WhatsApp / channel selection
  const [whatsapps, setWhatsapps] = useState<Whatsapp[]>([]);
  const [selectedWhatsappId, setSelectedWhatsappId] = useState("");
  const selectedWhatsapp = whatsapps.find((w) => String(w.id) === selectedWhatsappId) ?? null;
  const isWaba = selectedWhatsapp?.type === "waba";
  const isGupshup = selectedWhatsapp?.type === "gupshup";
  const isDialog360 = selectedWhatsapp?.type === "dialog360";
  const isBspChannel = isWaba || isGupshup || isDialog360;
  const isFileSupportedChannel = selectedWhatsapp && ["whatsapp", "baileys", "zapo", "evo", "evogo", "meow", "uazapi", "zapi"].includes(selectedWhatsapp.type);

  // WABA templates
  const [templates, setTemplates] = useState<WABATemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategoryFilter>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<WABATemplate | null>(null);
  const [templateVarFields, setTemplateVarFields] = useState<TemplateVariableField[]>([]);
  // Template de cobranca (sub_category/display_format/botao ORDER_DETAILS).
  // Template comum nao passa por nada disso: mesmo payload, mesmo disparo (D0).
  const isOrderDetailsSelected = React.useMemo(
    () => isOrderDetailsTemplate(selectedTemplate as unknown as Parameters<typeof isOrderDetailsTemplate>[0]),
    [selectedTemplate]
  );
  // Ficha de cobranca. Estado paralelo ao templateVarFields: o botao
  // ORDER_DETAILS nao gera variavel de template.
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());
  // So a rota WABA Meta (/wabametaTemplateTextSchedule) monta a cobranca; as
  // rotas de agendamento de Gupshup/Dialog360 nao recebem a ficha.
  const canScheduleOrderDetails = isWaba;
  const [agendGalleryOpen, setAgendGalleryOpen] = useState(false);
  const [agendGalleryTargetIdx, setAgendGalleryTargetIdx] = useState<number>(-1);

  // Message body
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // File attachment
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Signature toggle
  const [sign, setSign] = useState(true);

  // Schedule preset + date/time
  const [schedulePreset, setSchedulePreset] = useState("custom");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  // Recurrence
  const [recurrence, setRecurrence] = useState("none");
  const [customRecurrenceDays, setCustomRecurrenceDays] = useState(1);
  const [repetitions, setRepetitions] = useState(1);

  // Roteamento de atendimento da agendada: flag ON abre ticket no envio;
  // flag OFF + fila/usuário roteia a RESPOSTA do contato (sem chatbot).
  const [openTicketOnSend, setOpenTicketOnSend] = useState(false);
  const [routeQueueId, setRouteQueueId] = useState("none");
  const [routeUserId, setRouteUserId] = useState("none");
  const [routeQueues, setRouteQueues] = useState<{ id: number; name: string }[]>([]);
  const [routeUsers, setRouteUsers] = useState<{ id: number; name: string }[]>([]);

  // Emoji picker
  const [emojiOpen, setEmojiOpen] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setListLoading(true);
    try {
      const res = await fetchSchedules(page, debouncedSearch.trim() || undefined);
      if (seq !== loadSeqRef.current) return;
      // Página que deixou de existir (ex.: excluiu o último item da última
      // página): volta para a última que existe, e o efeito recarrega.
      if (page > res.totalPages) {
        setPage(res.totalPages);
        return;
      }
      setData(res.messages);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      if (seq === loadSeqRef.current) toast.error(t("toastErrorLoad"));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setListLoading(false);
      }
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (search === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchWhatsapps()
      .then((res) => {
        const all: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
        setWhatsapps(
          all.filter(
            (w) =>
              w.status === "CONNECTED" &&
              ["whatsapp", "baileys", "zapo", "evo", "evogo", "meow", "uazapi", "zapi", "waba", "gupshup", "dialog360"].includes(w.type)
          )
        );
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });
    // Filas/usuários para o roteamento: não-admin só vê as próprias filas
    // (espelha a validação UsersQueues do backend).
    fetchQueues()
      .then(({ data }) => {
        const sorted = (data || []).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        const isAdminLike =
          user?.profile === "admin" ||
          user?.profile === "superadmin" ||
          (user?.profile === "super" && !isSupervisorAdminLimited);
        if (!isAdminLike) {
          const userQueueIds = new Set(
            (((user as unknown as { queues?: { id: number }[] })?.queues) || []).map((q) => q.id)
          );
          setRouteQueues(sorted.filter((q) => userQueueIds.has(q.id)));
        } else {
          setRouteQueues(sorted);
        }
      })
      .catch(() => {});
    fetchAllUsers()
      .then(({ data }) => {
        setRouteUsers(
          (data?.users || [])
            .filter((u: { profile?: string; inactive?: boolean }) => u.profile !== "superadmin" && !u.inactive)
            .map((u: { id: number; name: string }) => ({ id: u.id, name: u.name }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        );
      })
      .catch(() => {});
  }, []);

  // Load BSP templates (WABA/Gupshup/Dialog360) when a BSP channel is selected
  useEffect(() => {
    if (!isBspChannel || !selectedWhatsapp) {
      setTemplates([]);
      setSelectedTemplate(null);
      setTemplateVarFields([]);
      return;
    }
    setTemplatesLoading(true);
    getTemplatesForChannel(selectedWhatsapp as { id?: number | string; type?: string; tokenAPI?: string; appId?: string })
      .then((list) => {
        const arr = Array.isArray(list) ? (list as unknown as WABATemplate[]) : [];
        setTemplates([...arr].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [isBspChannel, selectedWhatsapp]);

  // Reset sign when BSP selected (templates não usam assinatura)
  useEffect(() => {
    if (isBspChannel) setSign(false);
  }, [isBspChannel]);

  // ── Schedule preset handler ───────────────────────────────────────────────────

  function applyPreset(preset: string) {
    setSchedulePreset(preset);
    if (preset === "custom") return;
    let date: Date;
    if (preset === "30min") date = add(new Date(), { minutes: 30 });
    else if (preset === "amanha") date = add(new Date(), { days: 1 });
    else date = add(new Date(), { weeks: 1 });
    setScheduledDate(format(date, "yyyy-MM-dd"));
    setScheduledTime(format(date, "HH:mm"));
  }

  // ── Contact search ────────────────────────────────────────────────────────────

  const handleContactSearchChange = (value: string) => {
    setContactSearch(value);
    setSelectedContact(null);
    setShowContactDropdown(true);
    if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
    if (value.length < 2) { setContactResults([]); return; }
    contactSearchTimer.current = setTimeout(async () => {
      setContactSearching(true);
      try {
        const { data: res } = await fetchContacts({ searchParam: value, pageNumber: 1 });
        const list = res?.contacts || (Array.isArray(res) ? res : []);
        setContactResults(list.slice(0, 10));
      } catch {
        setContactResults([]);
      } finally {
        setContactSearching(false);
      }
    }, 400);
  };

  const handleSelectContact = (c: Contact) => {
    setSelectedContact(c);
    setContactSearch(c.name);
    setShowContactDropdown(false);
    setContactResults([]);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Dialog open / reset ───────────────────────────────────────────────────────

  function openNew() {
    setSelectedContact(null);
    setContactSearch("");
    setContactResults([]);
    setShowContactDropdown(false);
    setSelectedWhatsappId("");
    setBody("");
    setAttachedFile(null);
    setSign(true);
    setSchedulePreset("custom");
    setScheduledDate("");
    setScheduledTime("");
    setRecurrence("none");
    setCustomRecurrenceDays(1);
    setRepetitions(1);
    setTemplates([]);
    setSelectedTemplate(null);
    setTemplateVarFields([]);
    setOrderDetailsValue(emptyOrderDetails());
    setOpenTicketOnSend(false);
    setRouteQueueId("none");
    setRouteUserId("none");
    setDialogOpen(true);
  }

  // ── Template selection ────────────────────────────────────────────────────────

  function handleSelectTemplate(templateName: string) {
    const tpl = templates.find((x) => x.name === templateName) ?? null;
    setSelectedTemplate(tpl);
    setTemplateVarFields(tpl ? buildVariableFields(tpl, t) : []);
    // Zera a ficha ao trocar de template (o botao de cobranca nao gera variavel).
    setOrderDetailsValue(emptyOrderDetails());
  }

  const pickAgendGalleryItem = (item: GalleryItem) => {
    if (agendGalleryTargetIdx >= 0) {
      const updated = [...templateVarFields];
      updated[agendGalleryTargetIdx] = { ...updated[agendGalleryTargetIdx], value: item.url };
      setTemplateVarFields(updated);
    }
    setAgendGalleryOpen(false);
  };

  // ── Emoji insertion ───────────────────────────────────────────────────────────

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) { setBody((b) => b + emoji); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const newBody = body.substring(0, start) + emoji + body.substring(end);
    setBody(newBody);
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = start + emoji.length; }, 0);
  }

  // ── Compute scheduleDate string ───────────────────────────────────────────────

  function getScheduleDateString() {
    if (!scheduledDate || !scheduledTime) return null;
    return `${scheduledDate} ${scheduledTime}`;
  }

  // ── Create schedule ───────────────────────────────────────────────────────────

  function buildScheduleRoutingPayload() {
    return {
      scheduleOpenTicket: openTicketOnSend,
      scheduleQueueId: routeQueueId !== "none" ? Number(routeQueueId) : null,
      scheduleUserId: routeUserId !== "none" ? Number(routeUserId) : null,
    };
  }

  async function handleCreate() {
    if (!selectedContact) { toast.error(t("toastSelectContact")); return; }
    if (!selectedWhatsappId || selectedWhatsappId === "none") { toast.error(t("toastSelectConnection")); return; }
    if (!scheduledDate || !scheduledTime) { toast.error(t("toastSelectDateTime")); return; }

    const scheduleDateStr = getScheduleDateString()!;
    const recurrenceInterval = recurrence === "custom" ? customRecurrenceDays : recurrence === "none" ? "none" : parseInt(recurrence, 10);

    setSaving(true);
    try {
      if (isBspChannel) {
        // BSP (WABA/Gupshup/Dialog360) template schedule
        if (!selectedTemplate) { toast.error(t("toastSelectTemplate")); return; }
        if (isOrderDetailsSelected) {
          // Gupshup/Dialog360 agendam por rotas próprias, que não recebem a ficha.
          if (!canScheduleOrderDetails) { toast.warning(tOrder("errorNotSupportedHere")); setSaving(false); return; }
          // Valida antes de agendar: o erro só apareceria na hora do disparo,
          // quando ninguém está olhando para a tela.
          const orderError = validateOrderDetails(orderDetailsValue);
          if (orderError) { toast.warning(tOrder(orderError)); setSaving(false); return; }
        }
        const hasEmptyRequired = templateVarFields.some(
          (f) => (
            f.key.startsWith("body_variable_") ||
            f.key.startsWith("body_named_variable_") ||
            f.key.startsWith("header_variable_") ||
            f.key.startsWith("header_named_variable_") ||
            f.key.startsWith("button_") ||
            f.key === "header_link"
          ) && !f.value.trim()
        );
        if (hasEmptyRequired) { toast.warning(t("toastFillVariables")); setSaving(false); return; }
        const headerLinkField = templateVarFields.find((f) => f.key === "header_link");
        if (headerLinkField && !isValidHttpUrl(headerLinkField.value)) {
          toast.error(tErrors("invalidMediaHeaderUrl"));
          setSaving(false);
          return;
        }

        const rawComponents = selectedTemplate.components || [];
        // Em cobrança o dataJson NUNCA pode ser a definição crua: o botão
        // ORDER_DETAILS viria como `{ type, text }` e o mapper de botões do job
        // de agendados o transformaria em parâmetro vazio (400 da Meta).
        const componentsForPayload = (templateVarFields.length > 0 || isOrderDetailsSelected)
          ? buildComponentsPayload(selectedTemplate, templateVarFields)
          : rawComponents;
        // Ficha de cobrança SEM referência: o backend gera uma referência opaca
        // por requisição, e cada repetição da recorrência é uma requisição —
        // logo um "Nº da cobrança" próprio por disparo (D7). Sem cobrança o
        // spread vira {} (no-op) e o agendamento comum sai idêntico ao de hoje.
        const orderDetailsField = isOrderDetailsSelected
          ? { orderDetails: buildOrderDetailsPayload(orderDetailsValue) }
          : {};

        let nextDate = new Date(scheduleDateStr);
        for (let i = 0; i < repetitions; i++) {
          const message = {
            contactId: selectedContact.id,
            channel: selectedWhatsapp!.type,
            channelId: selectedWhatsapp!.id,
            read: 1,
            fromMe: true,
            mediaUrl: "",
            body: JSON.stringify(rawComponents),
            dataJson: JSON.stringify(componentsForPayload),
            scheduleDate: format(nextDate, "yyyy-MM-dd HH:mm"),
            quotedMsg: null,
            from: selectedContact.number,
            tokenApi: selectedWhatsapp!.tokenAPI,
            idFront: uuidv4(),
            mediaType: "templates",
            sendType: "templates",
            language: selectedTemplate.language,
            templateName: selectedTemplate.name,
            ...buildScheduleRoutingPayload(),
            ...orderDetailsField,
          };
          if (isGupshup) {
            await createGupshupTemplateSchedule({ ...message, whatsappId: selectedWhatsapp!.id });
          } else if (isDialog360) {
            await createDialog360TemplateSchedule({ ...message, whatsappId: selectedWhatsapp!.id });
          } else {
            await createWabaTemplateSchedule(message);
          }
          if (recurrenceInterval !== "none") {
            nextDate = add(nextDate, { days: recurrenceInterval as number });
          }
        }
      } else {
        // Non-BSP schedule
        if (!attachedFile && !body.trim()) { toast.error(t("toastFillMessage")); setSaving(false); return; }

        let messageBody = body.trim();
        const username = user?.username || localStorage.getItem("username") || "";
        if (username && sign && messageBody) {
          messageBody = buildSignedBody(username, messageBody, selectedWhatsapp?.type);
        }

        let nextDate = new Date(scheduleDateStr);

        const sendIterations = recurrenceInterval === "none" ? 1 : repetitions;
        for (let i = 0; i < sendIterations; i++) {
          const scheduleDateFormatted = format(nextDate, "yyyy-MM-dd HH:mm");

          if (attachedFile) {
            const formData = new FormData();
            formData.append("channelId", String(selectedWhatsapp!.id));
            formData.append("channel", selectedWhatsapp!.type);
            formData.append("contactId", String(selectedContact.id));
            formData.append("fromMe", "true");
            formData.append("medias", attachedFile);
            formData.append("body", attachedFile.name);
            formData.append("idFront", uuidv4());
            formData.append("scheduleDate", scheduleDateFormatted);
            formData.append("scheduleOpenTicket", String(openTicketOnSend));
            if (routeQueueId !== "none") formData.append("scheduleQueueId", routeQueueId);
            if (routeUserId !== "none") formData.append("scheduleUserId", routeUserId);
            await createScheduleMessage(formData);
          } else {
            const message = {
              contactId: selectedContact.id,
              channel: selectedWhatsapp!.type,
              channelId: selectedWhatsapp!.id,
              read: 1,
              fromMe: true,
              mediaUrl: "",
              body: messageBody,
              scheduleDate: scheduleDateFormatted,
              quotedMsg: null,
              idFront: uuidv4(),
              ...buildScheduleRoutingPayload(),
            };
            await createScheduleMessage(message);
          }

          if (recurrenceInterval !== "none") {
            nextDate = add(nextDate, { days: recurrenceInterval as number });
          }
        }
      }

      toast.success(t("toastCreated"));
      setDialogOpen(false);
      await loadData();
    } catch (err: unknown) {
      const errCode = String((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "");
      // Cobrança: o interceptor de api.ts rejeita com a RESPOSTA (não com o
      // AxiosError), então o código chega em `data.error`. Lê as duas formas —
      // sem isso o motivo da recusa (CRC, valor, permissão) some no toast genérico.
      const chargeErrCode = String(
        (err as { data?: { error?: string } })?.data?.error ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        ""
      );
      if (errCode === "ERR_QUEUE_NOT_ALLOWED") {
        toast.error(tErrors("queueNotAllowed"));
      } else if (errCode === "ERR_SCHEDULE_ROUTING_INVALID") {
        toast.error(tErrors("scheduleRoutingInvalid"));
      } else if (chargeErrCode === "ERR_ORDER_DETAILS_NOT_SUPPORTED") {
        toast.error(tOrder("errorNotSupportedHere"));
      } else if (isOrderDetailsSelected && chargeErrCode === "ERR_NO_PERMISSION") {
        toast.error(tOrder("errorNotAllowed"));
      } else if (chargeErrCode.startsWith("ERR_ORDER_DETAILS")) {
        // A validação do formulário espelha a do backend, então um código aqui é
        // divergência real — mostra o código para o suporte em vez de engolir.
        toast.error(`${tOrder("errorSendFailed")}: ${chargeErrCode}`);
      } else if (isOrderDetailsSelected && chargeErrCode === "ERR_FEATURE_NOT_IN_PLAN") {
        // O interceptor global já avisa "recurso fora do plano" — não duplicar.
      } else {
        toast.error(t("toastErrorCreate"));
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Delete schedule ───────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSchedule(deleteTarget.id);
      toast.success(t("toastDeleted"));
      setDeleteTarget(null);
      await loadData();
    } catch {
      toast.error(t("toastErrorDelete"));
    } finally {
      setDeleting(false);
    }
  }

  // ── Filter ────────────────────────────────────────────────────────────────────

  // A busca roda no servidor; este filtro só cobre backend antigo, que ignora
  // o termo e devolve a página sem filtrar.
  const filtered = data.filter(
    (s) =>
      (s.contact?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.contact?.number || "").includes(search.trim()) ||
      (s.body || "").toLowerCase().includes(search.toLowerCase())
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(
    filtered as unknown as Record<string, unknown>[],
    "scheduleDate"
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  // A ajuda tem de existir tambem no skeleton: enquanto a lista carrega (ou o
  // backend demora), o header sem `help` deixava a pagina sem botao de ajuda.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      >
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> {t("newSchedule")}
        </Button>
      </PageHeader>

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <TableDensityToggle density={density} onChange={updateDensity} />
      </div>

      {/* Table or empty state */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[
            { number: 1, title: t("emptyStep1") },
            { number: 2, title: t("emptyStep2") },
            { number: 3, title: t("emptyStep3") },
          ]}
        >
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> {t("newSchedule")}</Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>#</SortableTableHead>
                  <TableHead>{t("tableContact")}</TableHead>
                  <TableHead>{t("tableChannel")}</TableHead>
                  <TableHead>{t("tableMessage")}</TableHead>
                  <SortableTableHead sortKey="scheduleDate" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("tableScheduledFor")}</SortableTableHead>
                  <SortableTableHead sortKey="createdAt" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("tableCreatedAt")}</SortableTableHead>
                  <SortableTableHead sortKey="status" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("tableStatus")}</SortableTableHead>
                  <TableHead className="text-center">{t("tableActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sortedData as unknown as typeof filtered).map((schedule) => {
                  const variant = statusVariants[schedule.status] || statusVariants.pending;
                  const statusKey = schedule.status === "sent" || schedule.status === "sended" ? "statusSent"
                    : schedule.status === "failed" ? "statusFailed"
                    : schedule.status === "canceled" ? "statusCanceled"
                    : "statusPending";
                  return (
                    <TableRow
                      key={schedule.id}
                      className={cn(rowClassName, "cursor-pointer")}
                      onClick={() => setDetailTarget(schedule)}
                    >
                      <TableCell className={cn("text-muted-foreground text-sm", cellClassName)}>
                        <span className="font-mono text-xs whitespace-nowrap" title={String(schedule.id)}>{shortId(schedule.id)}</span>
                      </TableCell>
                      <TableCell className={cn("font-medium", cellClassName, isLiveMode && "live-blur-text")}>{schedule.contact?.name || `${t("tableContact")} #${schedule.contactId}`}</TableCell>
                      <TableCell className={cn(cellClassName)}>
                        {schedule.ticket?.whatsapp ? (
                          <div className="flex flex-col gap-0.5 min-w-0 max-w-[150px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm truncate" title={schedule.ticket.whatsapp.name || `#${schedule.ticket.whatsapp.id}`}>{schedule.ticket.whatsapp.name || `#${schedule.ticket.whatsapp.id}`}</span>
                              {schedule.ticket.whatsapp.type && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 capitalize shrink-0">{schedule.ticket.whatsapp.type}</Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">#{schedule.ticket.whatsapp.id}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className={cn("max-w-xs", cellClassName)}>
                        <span className="line-clamp-2 break-words text-sm" title={schedulePreviewText(schedule)}>
                          {schedulePreviewText(schedule)}
                        </span>
                      </TableCell>
                      <TableCell className={cn("text-muted-foreground", cellClassName)}>{formatDate(schedule.scheduleDate)}</TableCell>
                      <TableCell className={cn("text-muted-foreground", cellClassName)}>{schedule.createdAt ? formatDate(schedule.createdAt) : "—"}</TableCell>
                      <TableCell className={cellClassName}>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={variant}>{t(statusKey)}</Badge>
                          {(schedule.scheduleOpenTicket || schedule.scheduleQueueId || schedule.scheduleUserId) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0 h-4"
                              title={[
                                schedule.scheduleQueueId ? `${t("routingQueue")}: ${routeQueues.find((q) => q.id === schedule.scheduleQueueId)?.name || `#${schedule.scheduleQueueId}`}` : null,
                                schedule.scheduleUserId ? `${t("routingUser")}: ${routeUsers.find((u) => u.id === schedule.scheduleUserId)?.name || `#${schedule.scheduleUserId}`}` : null,
                              ].filter(Boolean).join(" • ")}
                            >
                              {schedule.scheduleOpenTicket ? t("routingBadgeOpens") : t("routingBadgeRoutes")}
                            </Badge>
                          )}
                          {/* Destino de roteamento excluído após o agendamento: só para
                              pendentes (histórico enviado/cancelado não é acionável). As
                              listas routeQueues/routeUsers são vivas — ausência = deletado. */}
                          {schedule.status !== "sent" && schedule.status !== "sended" && schedule.status !== "canceled" &&
                            (() => {
                              const brokenParts: string[] = [];
                              if (schedule.scheduleQueueId && !routeQueues.some((q) => q.id === schedule.scheduleQueueId)) {
                                brokenParts.push(t("routingBrokenQueue", { id: schedule.scheduleQueueId }));
                              }
                              if (schedule.scheduleUserId && !routeUsers.some((u) => u.id === schedule.scheduleUserId)) {
                                brokenParts.push(t("routingBrokenUser", { id: schedule.scheduleUserId }));
                              }
                              if (!brokenParts.length) return null;
                              return (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 h-4 gap-0.5 border-destructive/40 bg-destructive/10 text-destructive"
                                  title={`${brokenParts.join(" • ")} — ${t("routingBrokenHint")}`}
                                >
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {t("routingBrokenBadge")}
                                </Badge>
                              );
                            })()}
                        </div>
                      </TableCell>
                      <TableCell className={cn("text-center", cellClassName)}>
                        {schedule.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(schedule); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{t("paginationTotal", { total })}</span>
          <div className="flex items-center gap-2">
            {listLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || listLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label={t("paginationPrevious")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm whitespace-nowrap">{t("paginationPage", { page, totalPages })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || listLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label={t("paginationNext")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Dialog: Novo agendamento ──────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* ── Channel selection ── */}
            <div className="space-y-2">
              <Label>{t("labelConnection")} <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={whatsapps.map((w) => ({ value: String(w.id), label: `${w.name}${w.number ? ` (${w.number})` : ""} — ${w.type}` }))}
                value={selectedWhatsappId}
                onValueChange={(v) => {
                  setSelectedWhatsappId(v);
                  setBody("");
                  setSelectedTemplate(null);
                  setTemplateVarFields([]);
                }}
                placeholder={t("selectConnection")}
              />
            </div>

            {/* ── Contact autocomplete ── */}
            <div className="space-y-2 relative" ref={contactDropdownRef}>
              <Label>{t("labelContact")} <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={contactSearch}
                  onChange={(e) => handleContactSearchChange(e.target.value)}
                  onFocus={() => contactSearch.length >= 2 && setShowContactDropdown(true)}
                  placeholder={t("contactSearchPlaceholder")}
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              {showContactDropdown && (contactSearching || contactResults.length > 0) && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-[200px] overflow-y-auto">
                  {contactSearching ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> {t("searching")}
                    </div>
                  ) : (
                    contactResults.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer text-sm"
                        onMouseDown={(e) => { e.preventDefault(); handleSelectContact(c); }}
                      >
                        <div className={cn("h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0", isLiveMode && "live-blur")}>
                          {c.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("font-medium truncate", isLiveMode && "live-blur-text")}>{c.name}</p>
                          <p className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{c.number}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {selectedContact && (
                <p className={cn("text-xs text-green-600 dark:text-green-400", isLiveMode && "live-blur-text")}>
                  {t("selectedContact", { name: selectedContact.name, number: selectedContact.number })}
                </p>
              )}
              {!selectedContact && contactSearch.length > 0 && contactSearch.length < 2 && (
                <p className="text-xs text-muted-foreground">{t("typeAtLeast2Chars")}</p>
              )}
            </div>

            {/* ── Schedule preset + date/time ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("labelWhen")}</Label>
                <Select value={schedulePreset} onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>{t("labelDate")} <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => { setScheduledDate(e.target.value); setSchedulePreset("custom"); }}
                    disabled={schedulePreset !== "custom"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("labelTime")} <span className="text-destructive">*</span></Label>
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => { setScheduledTime(e.target.value); setSchedulePreset("custom"); }}
                    disabled={schedulePreset !== "custom"}
                  />
                </div>
              </div>
            </div>

            {/* ── Recurrence ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("labelRecurrence")}</Label>
                <Select value={recurrence} onValueChange={setRecurrence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {recurrence === "custom" && (
                <div className="space-y-2">
                  <Label>{t("labelIntervalDays")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={customRecurrenceDays}
                    onChange={(e) => setCustomRecurrenceDays(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              )}
              {recurrence !== "none" && (
                <div className="space-y-2">
                  <Label>{t("labelRepetitions")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={repetitions}
                    onChange={(e) => setRepetitions(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              )}
            </div>

            {/* ── Message or BSP template (WABA/Gupshup/Dialog360) ── */}
            {isBspChannel ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>{t("wabaNotice")}</span>
                </div>
                <Label>{t("labelWabaTemplate")} <span className="text-destructive">*</span></Label>
                {templatesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("loadingTemplates")}
                  </div>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noTemplatesAvailable")}</p>
                ) : (
                  <div className="flex gap-2">
                    <TemplateCategorySelect
                      value={templateCategoryFilter}
                      onChange={setTemplateCategoryFilter}
                      className="w-40 shrink-0"
                    />
                    <Select value={selectedTemplate?.name ?? ""} onValueChange={handleSelectTemplate}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder={t("selectTemplate")} /></SelectTrigger>
                      <SelectContent>
                        {templates.filter((tp) => matchTemplateCategory(tp, templateCategoryFilter)).map((tp, i) => (
                          <SelectItem key={`${tp.name}-${i}`} value={tp.name}>
                            {tp.name} <span className="text-muted-foreground text-xs">({tp.language})</span>
                            {tp.category && (
                              <span className="ml-1 text-[10px] text-muted-foreground uppercase">· {tp.category}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Ficha de cobrança — só aparece em template ORDER_DETAILS */}
                {isOrderDetailsSelected && selectedTemplate && (
                  canScheduleOrderDetails ? (
                    <div className="space-y-2 rounded-md border p-3">
                      <div>
                        <Label className="text-xs mb-0.5 block">{tOrder("sectionTitle")}</Label>
                        <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                      </div>
                      <OrderDetailsFields
                        key={`${selectedTemplate.name}-${selectedTemplate.language}`}
                        value={orderDetailsValue}
                        onChange={setOrderDetailsValue}
                        compact
                        bulkWarning={recurrence !== "none" && repetitions > 1}
                      />
                    </div>
                  ) : (
                    <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium">{tOrder("sectionTitle")}</p>
                        <p className="text-xs text-muted-foreground">{tOrder("errorNotSupportedHere")}</p>
                      </div>
                    </div>
                  )
                )}

                {/* WhatsApp-style template preview */}
                {selectedTemplate && (
                  <div className="bg-[#e5ddd5] rounded-lg p-3">
                    {(() => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const comps = (selectedTemplate.components || []) as any[];
                      const header = comps.find((c) => c.type === "HEADER");
                      const body = comps.find((c) => c.type === "BODY");
                      const footer = comps.find((c) => c.type === "FOOTER");
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const buttons = comps.filter((c: any) => c.type === "BUTTONS" || c.type === "BUTTON");
                      // Build substituted body text (positional + named)
                      let bodyText = body?.text || "";
                      templateVarFields.filter((f) => f.key.startsWith("body_variable_")).forEach((f) => {
                        const n = f.key.replace("body_variable_", "");
                        bodyText = bodyText.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), f.value || `{{${n}}}`);
                      });
                      templateVarFields.filter((f) => f.key.startsWith("body_named_variable_")).forEach((f) => {
                        const name = f.key.replace("body_named_variable_", "");
                        bodyText = bodyText.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), f.value || `{{${name}}}`);
                      });
                      // Build substituted header text (positional + named)
                      let headerText = header?.format === "TEXT" ? (header?.text || "") : "";
                      templateVarFields.filter((f) => f.key.startsWith("header_variable_")).forEach((f) => {
                        const n = f.key.replace("header_variable_", "");
                        headerText = headerText.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), f.value || `{{${n}}}`);
                      });
                      templateVarFields.filter((f) => f.key.startsWith("header_named_variable_")).forEach((f) => {
                        const name = f.key.replace("header_named_variable_", "");
                        headerText = headerText.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), f.value || `{{${name}}}`);
                      });
                      const headerImgVal = templateVarFields.find((f) => f.key === "header_link")?.value;
                      return (
                        <div className="bg-white rounded-lg p-2 shadow-sm max-w-xs space-y-1 text-gray-900">
                          {header && ["IMAGE"].includes(header.format) && (
                            headerImgVal
                              ? <img src={headerImgVal} alt="header" className="w-full rounded object-cover max-h-32" />
                              : <div className="w-full h-20 bg-gray-100 rounded flex items-center justify-center"><Images className="h-6 w-6 text-gray-400" /></div>
                          )}
                          {header && header.format === "VIDEO" && (
                            headerImgVal
                              ? <video src={headerImgVal} className="w-full rounded max-h-32" controls />
                              : <div className="w-full h-20 bg-gray-100 rounded flex items-center justify-center"><Images className="h-6 w-6 text-gray-400" /></div>
                          )}
                          {header && header.format === "TEXT" && <p className="text-sm font-bold text-gray-900">{headerText}</p>}
                          {bodyText && <p className="text-sm whitespace-pre-wrap text-gray-900">{bodyText}</p>}
                          {footer?.text && <p className="text-xs text-gray-500">{footer.text}</p>}
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {buttons.flatMap((b: any) => b.buttons || [b]).map((btn: any, i: number) => (
                            <div key={i} className="border-t border-gray-200 pt-1 text-center text-xs text-blue-600 font-medium">{String(btn.text || "")}</div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Template variable fields */}
                {templateVarFields.length > 0 && (
                  <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">{t("fillTemplateVariables")}</p>
                    {templateVarFields.map((f, i) => {
                      const isHeaderMedia = f.key === "header_link";
                      return (
                        <div key={f.key} className="space-y-1">
                          <Label className="text-xs">{f.label}</Label>
                          <div className="flex gap-2">
                            <Input
                              className="flex-1"
                              value={f.value}
                              onChange={(e) => {
                                const updated = [...templateVarFields];
                                updated[i] = { ...updated[i], value: e.target.value };
                                setTemplateVarFields(updated);
                              }}
                              placeholder={f.label}
                            />
                            {isHeaderMedia && (
                              <button
                                type="button"
                                className="h-10 px-3 text-xs border rounded hover:bg-accent transition-colors shrink-0 flex items-center gap-1"
                                onClick={() => { setAgendGalleryTargetIdx(i); setAgendGalleryOpen(true); }}
                              >
                                <Images className="h-3.5 w-3.5" />
                                {t("pickFromGallery")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Toolbar: emoji + file + signature */}
                <div className="flex items-center gap-1">
                  {/* Emoji picker */}
                  <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" type="button" title="Emoji">
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2" side="top" align="start">
                      <ScrollArea className="h-48">
                        {EMOJI_CATEGORIES.map((cat) => (
                          <div key={cat.label} className="mb-2">
                            <p className="text-xs text-muted-foreground mb-1">{cat.label}</p>
                            <div className="flex flex-wrap gap-1">
                              {cat.emojis.map((emoji) => (
                                <button
                                  key={emoji}
                                  className="text-lg hover:bg-muted rounded p-0.5"
                                  onMouseDown={(e) => { e.preventDefault(); insertEmoji(emoji); setEmojiOpen(false); }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>

                  {/* File attachment (whatsapp/baileys only) */}
                  {isFileSupportedChannel && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        type="button"
                        title={t("labelAttachFile")}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.mp4,.xls,.xlsx,.zip,.ppt,.pptx,.ogg,.mp3,.txt,.csv,image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setAttachedFile(f);
                          if (f) setBody("");
                          e.target.value = "";
                        }}
                      />
                    </>
                  )}

                  {/* Signature toggle */}
                  <div className="flex items-center gap-1.5 ml-2">
                    <PenSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <Switch
                      checked={sign}
                      onCheckedChange={setSign}
                      className="scale-75"
                    />
                    <span className="text-xs text-muted-foreground">{t("labelSignature")}</span>
                  </div>
                </div>

                {/* Attached file preview */}
                {attachedFile && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{attachedFile.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAttachedFile(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* Text area */}
                {!attachedFile && (
                  <>
                    <Label>{t("labelMessage")} <span className="text-destructive">*</span></Label>
                    <Textarea
                      ref={textareaRef}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={t("messagePlaceholder")}
                      rows={4}
                    />
                  </>
                )}
              </div>
            )}

            {/* ── Atendimento: abrir ticket no envio / rotear resposta ── */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label>{t("routingOpenTicketLabel")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {openTicketOnSend ? t("routingHintOpenOnSend") : t("routingHintOnReply")}
                  </p>
                </div>
                <Switch checked={openTicketOnSend} onCheckedChange={setOpenTicketOnSend} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("routingQueue")}</Label>
                  <Select value={routeQueueId} onValueChange={setRouteQueueId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("routingNone")}</SelectItem>
                      {routeQueues.map((q) => (
                        <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("routingUser")}</Label>
                  <Select value={routeUserId} onValueChange={setRouteUserId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("routingNone")}</SelectItem>
                      {routeUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {openTicketOnSend && routeQueueId === "none" && routeUserId === "none" && (
                <p className="text-xs text-muted-foreground">{t("routingHintDefaultCreator")}</p>
              )}
              {openTicketOnSend && recurrence !== "none" && (
                <p className="text-xs text-amber-600 dark:text-amber-500">{t("routingHintRecurrence")}</p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDialogOpen(false)}>{t("btnCancel")}</Button>
            <Button className="w-full sm:w-auto" onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("btnSchedule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Details dialog (clique na linha) ─────────────────────────────── */}
      <Dialog open={!!detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("detailsTitle")}</DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4 text-sm">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">ID</p>
                <p className="font-mono text-xs break-all">{String(detailTarget.id)}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t("tableContact")}</p>
                  <p className={cn("font-medium break-words", isLiveMode && "live-blur-text")}>
                    {detailTarget.contact?.name || `${t("tableContact")} #${detailTarget.contactId}`}
                  </p>
                  {detailTarget.contact?.number && (
                    <p className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{detailTarget.contact.number}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t("tableChannel")}</p>
                  {detailTarget.ticket?.whatsapp ? (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="break-words">{detailTarget.ticket.whatsapp.name || `#${detailTarget.ticket.whatsapp.id}`}</span>
                        {detailTarget.ticket.whatsapp.type && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 capitalize shrink-0">{detailTarget.ticket.whatsapp.type}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">#{detailTarget.ticket.whatsapp.id}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("tableMessage")}</p>
                {isSpecialScheduleMessage(detailTarget) ? (
                  <MessageContentView message={toBubbleMessage(detailTarget)} />
                ) : (
                  <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3">{detailTarget.body}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t("tableScheduledFor")}</p>
                  <p>{formatDate(detailTarget.scheduleDate)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t("tableCreatedAt")}</p>
                  <p>{detailTarget.createdAt ? formatDate(detailTarget.createdAt) : "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t("tableStatus")}</p>
                  <Badge variant={statusVariants[detailTarget.status] || statusVariants.pending}>
                    {t(
                      detailTarget.status === "sent" || detailTarget.status === "sended" ? "statusSent"
                        : detailTarget.status === "failed" ? "statusFailed"
                        : detailTarget.status === "canceled" ? "statusCanceled"
                        : "statusPending"
                    )}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDetailTarget(null)}>{t("btnClose")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete dialog ─────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDialogDescription", { contact: deleteTarget?.contact?.name || `${t("tableContact")} #${deleteTarget?.contactId}` })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("btnCancel")}</Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("btnDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WABA Gallery Dialog */}
      <GalleryPickerWithUploadDialog
        open={agendGalleryOpen}
        onOpenChange={setAgendGalleryOpen}
        onPick={pickAgendGalleryItem}
        {...wabaHeaderFormatToGalleryParams(
          (selectedTemplate?.components as Array<{ type?: string; format?: string }> | undefined)?.find((c) => c.type === "HEADER")?.format
        )}
      />
    </div>
  );
}
