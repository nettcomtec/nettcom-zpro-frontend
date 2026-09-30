"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Search, MessageSquare, ClipboardList, Send,
  PhoneCall, Phone, CircleDot, LogOut, User, Trash2, Cookie,
  Check, CheckCheck, Mail, Loader2, X, BookOpen, PlayCircle,
  ShieldCheck, ShieldAlert, CreditCard, Tag, Share2, RefreshCw, XCircle, Menu, MoreHorizontal, History, Headset,
  Languages, BellRing, Zap, Clock, Calendar, Images, HelpCircle, Inbox, ChevronRight, ChevronDown,
  PauseCircle,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { TOUR_KEY } from "@/components/tour/AppTour";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore, type Notification } from "@/stores/notification-store";
import { useChatStore } from "@/stores/chat-store";
import { useWebphoneStore } from "@/stores/webphone-store";
import { useBrandingStore } from "@/stores/branding-store";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { LiveModeToggle } from "@/components/live-mode/live-mode-toggle";
import { PushNotifications } from "@/components/PushNotifications";
import { useLocale } from "@/i18n/locale-provider";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { unsubscribePush } from "@/lib/push-subscription";
import { UpdateNotification } from "@/components/UpdateNotification";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { sendIndividualMessage } from "@/services/individual-message";
import { fetchContacts, type Contact } from "@/services/contacts";
import { fetchQueues, type Queue } from "@/services/queues";
import { toNumberArray } from "@/lib/can-user-see-ticket";
import { sendWabaTemplateComponents, type WabaTemplate } from "@/services/messages";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";
import {
  TemplateCategorySelect,
  type TemplateCategoryFilter,
  matchTemplateCategory,
} from "@/components/atendimento/template-category-filter";
// W3-B: helper que rotea getTemplates por whatsapp.type (waba | dialog360 | gupshup).
// Usado tambem no caminho WABA (resolve tokenAPI/id e auto-cura pos-login).
import { getTemplatesForChannel } from "@/services/channel-templates";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { WabaConnectionQualityBadge } from "@/components/atendimento/waba-connection-quality-badge";
import { updateUserIsOnline } from "@/services/users";
import { unregisterMobileDeviceToken } from "@/services/mobile";
import { FCM_TOKEN_STORAGE_KEY } from "@/lib/native";
import { fetchPauseReasons, type PauseReason } from "@/services/pause-reasons";
import { startUserPause, endUserPause, fetchMyActivePause, type ActivePauseSession } from "@/services/user-pause";
import {
  fetchInternalNotifications, markNotificationAsRead, markAllInternalAsRead, deleteNotification,
  type InternalNotification,
} from "@/services/internal-notifications";
import { fetchTickets } from "@/services/tickets";
import { findExistingOpenTicket, type ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import { ExistingTicketDialog } from "@/components/atendimento/existing-ticket-dialog";
import { normalizeTickets } from "@/lib/normalize-ticket";
import { fetchUnreadCounts, fetchUnreadGroupCounts, markAllAsRead as markAllChatAsRead, fetchUnreadPreview, type UnreadPreviewItem } from "@/services/private-chat";
import { fetchTodos, updateTodo, deleteTodo, type TodoItem } from "@/services/todos";
import { fetchTutorials, type Tutorial } from "@/services/tutorials";
import { fetchTenantById, fetchTenantSubscription } from "@/services/tenants";
import { PaymentPlanModal, type AsaasSubscription, type AsaasPayment } from "@/components/layout/payment-plan-modal";
import type { Plan } from "@/services/plans";
import { fetchTicketSharedByUser, deleteTicketShared, updateAllUnreadMessages } from "@/services/tickets";
import packageJson from "../../../package.json";
import { ActivityLog } from "@/components/layout/activity-log";
import { useActivityStore } from "@/stores/activity-store";
import { useTicketStore } from "@/stores/ticket-store";
import { SupportChatButton, SupportChatDrawer } from "@/components/support-chat/support-chat-drawer";
import { useSupportChatStore } from "@/stores/support-chat-store";
import { useNotificationSocket } from "@/hooks/use-notification-socket";
import { useGoogleAuthExpiredSocket } from "@/hooks/use-google-auth-expired-socket";
import { useChannelAuthExpiredSocket } from "@/hooks/use-channel-auth-expired-socket";
import { useTicketSharedSocket } from "@/hooks/use-ticket-shared-socket";
import { useTabNotificationBadge } from "@/hooks/use-tab-notification-badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS, es as esLocale, de as deLocale, fr as frLocale, it as itLocale, ja as jaLocale, zhCN, arSA, hi as hiLocale, id as idLocale, ru as ruLocale, tr as trLocale, type Locale as DateFnsLocale } from "date-fns/locale";
import { useLiveMode } from "@/hooks/use-live-mode";
import { canUserSeeTicket, type TicketVisibilityData } from "@/lib/can-user-see-ticket";
import {
  pickTicketVisibilityPatch,
  revokeTicketNotificationOnClick,
  sweepTicketNotifications,
} from "@/lib/ticket-notification-visibility";
import { getTicketLastMessagePreview, getSyntheticBodyLabel } from "@/lib/template-preview";
import { normalizeBrPhone } from "@/lib/phone-utils";
import { buildSignedBody } from "@/lib/signature";

// ─── Internal Messages Modal ─────────────────────────────

const DATEFNS_LOCALE_MAP: Record<string, DateFnsLocale> = {
  pt: ptBR, en: enUS, es: esLocale, de: deLocale, fr: frLocale, it: itLocale,
  ja: jaLocale, zh: zhCN, ar: arSA, hi: hiLocale, id: idLocale, ru: ruLocale, tr: trLocale,
};

function getDeadlineTone(deadline: Date): "overdue" | "today" | "soon" | "later" {
  const diffH = (deadline.getTime() - Date.now()) / 3600000;
  if (diffH < 0) return "overdue";
  if (diffH < 24) return "today";
  if (diffH < 168) return "soon";
  return "later";
}

// ── Helper: decode {{HTML_B64}} notifications ─────────────
function decodeInternalMessage(message: string): { isHtml: boolean; content: string } {
  if (message.startsWith("{{HTML_B64}}")) {
    try {
      const decoded = decodeURIComponent(escape(atob(message.slice(12))));
      return { isHtml: true, content: decoded };
    } catch {
      return { isHtml: false, content: message };
    }
  }
  return { isHtml: false, content: message };
}

// Converte HTML em texto preview pra listagens (sininho).
// Usa DOMParser pra eliminar <style>/<script>/<head>/<noscript> (e seu conteúdo,
// não só as tags) — o replace(/<[^>]*>/g) anterior deixava o CSS escapar como texto.
function htmlToPreviewText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html.replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("style, script, head, noscript, template").forEach((el) => el.remove());
    const text = doc.body?.textContent ?? "";
    return text.replace(/\s+/g, " ").trim();
  } catch {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function NotificationIframe({ htmlContent }: { htmlContent: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    // <base target="_blank"> garante que <a> sem target abra em nova aba (escapa do sandbox).
    // overflow:auto no body permite scroll interno caso a medicao fique abaixo do real.
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Segoe UI',Arial,sans-serif;overflow:auto;}
      a{color:#2563eb;text-decoration:underline;}
    </style></head><body>${htmlContent}</body></html>`);
    doc.close();
    const measure = () => {
      const h = doc.body?.scrollHeight ?? 120;
      // Sem cap rigido: o DialogContent pai (max-h-[60vh] overflow-y-auto) faz a rolagem.
      setHeight(Math.max(h + 16, 80));
    };
    iframe.addEventListener("load", measure);
    setTimeout(measure, 50);
    return () => iframe.removeEventListener("load", measure);
  }, [htmlContent]);

  return (
    <iframe
      ref={ref}
      title="notification-content"
      // allow-popups + allow-popups-to-escape-sandbox: links com target=_blank abrem em nova
      // aba sem herdar sandbox (necessario p/ navegar em /novidades ou URLs externas).
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="w-full border-0 rounded"
      style={{ height }}
    />
  );
}

// ─── Tasks Modal ─────────────────────────────────────────

function TasksModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("layoutHeader");
  const { user } = useAuthStore();
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchTodos();
      const all = Array.isArray(data) ? data : [];
 // Front legado — filtra por ownerId do usuário e status delayed/pending
      const filtered = all.filter((t) =>
        t.ownerId === user?.userId &&
        (t.status === "delayed" || t.status === "pending")
      );
      setItems(filtered);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [user?.userId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const pending = items.filter((t) => t.status !== "completed" && t.status !== "done");

  const priorityColor: Record<string, string> = {
    high: "text-destructive", medium: "text-warning", low: "text-success",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> {t("tasks.title")}
            {pending.length > 0 && <Badge variant="secondary" className="text-xs">{pending.length} {t("tasks.pending")}</Badge>}
          </DialogTitle>
          <DialogDescription>{t("tasks.description")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("tasks.noTasks")}</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  item.status === "completed" || item.status === "done" ? "opacity-60" : ""
                )}>
                  <div className={cn("h-2 w-2 rounded-full mt-2 shrink-0", priorityColor[item.priority || ""] || "bg-muted")} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", (item.status === "completed" || item.status === "done") && "line-through")}>{item.name}</p>
                    {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">{item.status}</Badge>
                      {item.limitDate && (
                        <span className="text-[10px] text-muted-foreground">
                          {t("tasks.deadline")}: {new Date(item.limitDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); window.location.href = "/tarefas"; }}>
            {t("tasks.viewAll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Conversation Dialog ─────────────────────────────

export function NewConversationDialog({
  open,
  onOpenChange,
  prefilledNumber,
  prefilledContactName,
  prefilledContactEmail,
  parentTicketId,
  lockNumber = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Numero a pre-preencher no campo Numero (ex: contato de um ticket WC pai). */
  prefilledNumber?: string | null;
  /** Nome do contato — exibido no header como contexto quando vier de outro ticket. */
  prefilledContactName?: string | null;
  /** Email do contato — habilita canais email/imap quando vier de cross-channel reply. */
  prefilledContactEmail?: string | null;
  /** Ticket pai (cross-channel reply): apos enviar, o ticket criado eh vinculado a ele. */
  parentTicketId?: number | null;
  /** Se true, campo "numero" fica somente leitura. Default true quando prefilledNumber vier. */
  lockNumber?: boolean;
}) {
  const t = useTranslations("layoutHeader");
  const tMsgInput = useTranslations("messageInput");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");
  const router = useRouter();
  const { user, getConfigValue, supervisorAdmin } = useAuthStore();
  const { isLiveMode } = useLiveMode();
  const [sessions, setSessions] = useState<Whatsapp[]>([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [number, setNumber] = useState("");
  const [applyBrPhoneCorrection, setApplyBrPhoneCorrection] = useState(true);
  const [inputMode, setInputMode] = useState<"phone" | "bsuid">("phone");
  const [bsuid, setBsuid] = useState("");
  const [message, setMessage] = useState("");
  const [desiredStatus, setDesiredStatus] = useState<"open" | "pending">("open");
  // Fila opcional (segmentacao da conversa avulsa). "none" = nenhuma (backend decide).
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState("none");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [signatureEnabled, setSignatureEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("signatureEnabled");
    return saved === null ? true : saved === "true";
  });

  // WABA template state
  const [wabaTemplates, setWabaTemplates] = useState<WabaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategoryFilter>("all");
  const [templateVars, setTemplateVars] = useState<{ key: string; label: string; value: string }[]>([]);
  // Cobranca (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F6.
  // Estado paralelo ao templateVars: o botao de cobranca nao gera variavel.
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());

  // Filtro de tipo de conexão (null = todas; "official" = só WABA; "unofficial" = não-WABA)
  const [connectionFilter, setConnectionFilter] = useState<null | "official" | "unofficial" | "email">(null);

  // Gallery picker for header media URL
  const [tplGalleryOpen, setTplGalleryOpen] = useState(false);

  // Busca/preload de contato para facilitar preenchimento do número (igual ao envio de cartão)
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactLoading, setContactLoading] = useState(false);

 // Aviso "ticket aberto em outro operador" antes do envio avulso (espelho do front legado)
  const [existingTicket, setExistingTicket] = useState<ExistingOpenTicket | null>(null);

  const isAdminOrSuper = user?.profile === "admin" || user?.profile === "super" || user?.profile === "superadmin";
  // supervisorAdmin === 'enabled' => super age como supervisor limitado (restringe canal/fila),
  // espelhando o backend e o filtro de /atendimento. Usado nos gates de canal e fila da avulsa.
  const isAdminAvulsa = user?.profile === "admin" || user?.profile === "superadmin" || (user?.profile === "super" && supervisorAdmin !== "enabled");
  const forceSignature = getConfigValue("signed") === "enabled" && !isAdminOrSuper;
  const isRestrictedUserHere = user?.restrictedUser === true || user?.restrictedUser === "enabled";

  const selectedSessionObj = sessions.find((s) => String(s.id) === selectedSession);
  const selectedType = (selectedSessionObj?.type ?? "").toLowerCase();
  const isWaba = selectedType === "waba";
  const isGupshup = selectedType === "gupshup";
  const isDialog360 = selectedType === "dialog360";
  // BSPs (Gupshup/Dialog360) compartilham UX WABA — template obrigatório,
  // janela 24h, etc. Renderiza template picker + envia via BSP sender.
  const isWabaLike = isWaba || isGupshup || isDialog360;
  const isEmail = ["email", "webmail"].includes(selectedType);

  // Subject for email channels (separate from message body)
  const [emailSubject, setEmailSubject] = useState("");
  // Email destinatario manual quando nao vier prefilled (envio avulso para email)
  const [manualEmail, setManualEmail] = useState("");
  const emailDestinationFinal = ((prefilledContactEmail || "").trim() || manualEmail.trim());

  const sessionsForSelect = React.useMemo(() => {
    const isEmailType = (t: string) => ["email", "webmail"].includes(t);
    const isOfficialType = (t: string) => ["waba", "gupshup", "dialog360"].includes(t);
    if (connectionFilter === "official") return sessions.filter((s) => isOfficialType((s.type ?? "").toLowerCase()));
    if (connectionFilter === "email") return sessions.filter((s) => isEmailType((s.type ?? "").toLowerCase()));
    if (connectionFilter === "unofficial") {
      return sessions.filter((s) => {
        const t = (s.type ?? "").toLowerCase();
        return !isOfficialType(t) && !isEmailType(t);
      });
    }
    return sessions;
  }, [sessions, connectionFilter]);

  // Filas que o operador pode escolher: admin ve todas as ativas; nao-admin so as suas
  // (user.queues). Vazio => seletor escondido (decisao: sem fila escolhivel para esse operador).
  const allowedQueues = React.useMemo(() => {
    const active = queues.filter((q) => q.isActive !== false);
    if (isAdminAvulsa) return active;
    const userQueueIds = toNumberArray(user?.queues);
    return active.filter((q) => userQueueIds.includes(q.id));
  }, [queues, isAdminAvulsa, user?.queues]);

  // Reset filter ao fechar o modal
  useEffect(() => {
    if (!open) {
      setConnectionFilter(null);
      setContactSearch("");
      setContactResults([]);
      setManualEmail("");
      setEmailSubject("");
      setInputMode("phone");
      setBsuid("");
      setApplyBrPhoneCorrection(true);
      setSelectedQueue("none");
    } else if (prefilledNumber) {
      // Modo cross-channel reply: numero ja vem do contato do ticket pai.
      setNumber(prefilledNumber);
    }
  }, [open, prefilledNumber]);

  // Locked = explicito via prop OU auto-lock quando vem prefilledNumber
  const numberLocked = lockNumber || !!prefilledNumber;

  // Debounce: busca de contato para pré-selecionar número
  useEffect(() => {
    if (!contactSearch.trim()) { setContactResults([]); return; }
    const timer = setTimeout(async () => {
      setContactLoading(true);
      try {
        const res = await fetchContacts({ searchParam: contactSearch.trim(), pageNumber: 1 });
        const contacts: Contact[] = (res.data as { contacts?: Contact[] })?.contacts ?? (res.data as Contact[]) ?? [];
        setContactResults(contacts.slice(0, 8));
      } catch { setContactResults([]); }
      finally { setContactLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [contactSearch]);

  // Ao sair do WABA, volta para modo telefone
  useEffect(() => {
    if (!isWaba) { setInputMode("phone"); setBsuid(""); }
  }, [isWaba]);

  // Se filtro tirar a sessão selecionada, limpa
  useEffect(() => {
    if (!selectedSession) return;
    if (!sessionsForSelect.some((s) => String(s.id) === selectedSession)) {
      setSelectedSession("");
      setSelectedTemplate(null);
      setTemplateVars([]);
    }
  }, [sessionsForSelect, selectedSession]);

  useEffect(() => {
    if (!open) return;
    setLoadingSessions(true);
    fetchWhatsapps()
      .then(({ data }) => {
        // Inclui canais email/webmail sempre — usuario pode digitar o email manualmente.
        // Quando vier de cross-channel reply (prefilledContactEmail) o destino ja vem preenchido.
        const AVULSA_SUPPORTED_TYPES = ["whatsapp", "baileys", "zapo", "meow", "evo", "evogo", "uazapi", "zapi", "waba", "gupshup", "dialog360", "email", "webmail"];
        let connected = (Array.isArray(data) ? data : [])
          .filter((w) => w.status === "CONNECTED" && AVULSA_SUPPORTED_TYPES.includes((w.type ?? "").toLowerCase()));
        if (!isAdminAvulsa && user?.whatsappAllowed && Array.isArray(user.whatsappAllowed) && user.whatsappAllowed.length > 0) {
          const allowed = user.whatsappAllowed as { id: number }[];
          connected = connected.filter((w) => allowed.some((a) => a.id === w.id));
        }
        setSessions(connected);
        if (connected.length === 1) setSelectedSession(String(connected[0].id));
      })
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, [open, isAdminAvulsa, user?.whatsappAllowed]);

  // Carrega filas ao abrir — alimenta o seletor opcional de fila da conversa avulsa.
  useEffect(() => {
    if (!open) return;
    fetchQueues()
      .then(({ data }) => setQueues(data))
      .catch(() => {});
  }, [open]);

  // Fetch templates when WABA/Gupshup/Dialog360 session is selected
  useEffect(() => {
    if (!isWabaLike) {
      setWabaTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    const sess = selectedSessionObj as
      | { type?: string; id?: number; tokenAPI?: string; appId?: string }
      | undefined;
    if (!sess) {
      setWabaTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    // getTemplatesForChannel resolve o identificador do canal (tokenAPI no WABA;
    // id nos BSP). Se a sessao chegar sem tokenAPI logo apos o login, ele refaz
    // o fetch de /whatsapp e re-resolve — antes o WABA desistia e so um F5 curava.
    setLoadingTemplates(true);
    getTemplatesForChannel(sess)
      .then((res) => {
        const list = (Array.isArray(res) ? res : (res as { data?: WabaTemplate[] })?.data || []) as WabaTemplate[];
        setWabaTemplates([...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
      })
      .catch(() => toast.error(t("newConversation.errorLoadingTemplates")))
      .finally(() => setLoadingTemplates(false));
  }, [isWabaLike, isWaba, selectedSessionObj?.tokenAPI, selectedSessionObj?.id]);

  // Parse template variables when selection changes
  useEffect(() => {
    if (!selectedTemplate) { setTemplateVars([]); return; }
    const vars: { key: string; label: string; value: string }[] = [];
    selectedTemplate.components?.forEach((comp) => {
      if (comp.type === "HEADER" && comp.format && comp.format !== "TEXT" && comp.format !== "NONE") {
        vars.push({ key: "header_link", label: `Header (${comp.format})`, value: "" });
      }
      if ((comp.type === "BODY" || comp.type === "HEADER") && comp.text) {
        // Numeração de variáveis WABA é independente por componente: prefixar key com header_/body_.
        const keyPrefix = comp.type === "HEADER" ? "header_" : "body_";
        const labelPrefix = comp.type === "HEADER" ? "Header — " : "";
        const named = [...comp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
        named.forEach((m) => {
          const k = `${keyPrefix}named_variable_${m[1]}`;
          if (!vars.some((v) => v.key === k))
            vars.push({ key: k, label: `${labelPrefix}{{${m[1]}}}`, value: "" });
        });
        const positional = [...comp.text.matchAll(/\{\{(\d+)\}\}/g)];
        positional.forEach((m) => {
          const k = `${keyPrefix}variable_${m[1]}`;
          if (!vars.some((v) => v.key === k))
            vars.push({ key: k, label: `${labelPrefix}{{${m[1]}}}`, value: "" });
        });
      }
    });
    setTemplateVars(vars);
    // Zera a ficha de cobranca ao trocar de template (nao ha var de botao p/ ORDER_DETAILS).
    setOrderDetailsValue(emptyOrderDetails());
  }, [selectedTemplate]);

  // Template de cobranca: exige a ficha de pagamento no envio (sub_category/display_format/botao).
  const isOrderDetailsSelected = React.useMemo(
    () => isOrderDetailsTemplate(selectedTemplate),
    [selectedTemplate]
  );

  const handleSend = async (skipPrecheck = false) => {
    // Em modo email, o "destino" eh o email (prefilled OU digitado manualmente).
    // O campo `number` continua armazenando algo apenas pra validacao base.
    const emailDestination = emailDestinationFinal;
    if (isEmail) {
      if (!selectedSession || !emailDestination) {
        toast.error(t("newConversation.selectSessionAndEmail"));
        return;
      }
      if (!emailSubject.trim()) {
        toast.error(t("newConversation.emailSubjectRequired"));
        return;
      }
      if (!message.trim()) {
        toast.error(t("newConversation.emailBodyRequired"));
        return;
      }
    } else if (inputMode === "bsuid") {
      if (!selectedSession || !bsuid.trim()) {
        toast.error(t("newConversation.selectSessionAndBsuid"));
        return;
      }
    } else {
      if (!selectedSession || !number) {
        toast.error(t("newConversation.selectSessionAndNumber"));
        return;
      }
    }
    const session = sessions.find((s) => String(s.id) === selectedSession);
    if (!session) return;

    if (isWabaLike && !selectedTemplate) {
      toast.error(t("newConversation.selectTemplate"));
      return;
    }

    // ─── Email branch (cross-channel reply) ────────────────────────────────
    if (isEmail) {
      setSending(true);
      try {
        const { sendEmailWebmail } = await import("@/services/messages");
        const { data: emailRes } = await sendEmailWebmail(session.id, {
          to: emailDestination,
          subject: emailSubject.trim(),
          text: message.trim(),
        });
        const childTicketId = (emailRes as { ticketId?: number })?.ticketId;
        if (parentTicketId && childTicketId) {
          try {
            const { linkTicketParent } = await import("@/services/tickets");
            await linkTicketParent(childTicketId, parentTicketId);
          } catch { /* silenciar */ }
        }
        toast.success(t("newConversation.messageSent"));
        onOpenChange(false);
        setMessage(""); setEmailSubject(""); setSelectedSession(""); setManualEmail("");
        if (parentTicketId && childTicketId) {
          router.push(`/atendimento?ticketId=${childTicketId}`);
        } else if (childTicketId) {
          // Avulsa pura sem ticket pai — abre o ticket recém criado.
          router.push(`/atendimento?ticketId=${childTicketId}`);
        }
      } catch {
        toast.error(t("newConversation.errorSending"));
      } finally {
        setSending(false);
      }
      return;
    }

    // Regra do 9 digito BR e opcional aqui: se o usuario optou por manter o numero
    // original (botao "Manter original" no aviso), preserva o digitado sem ajuste.
    const rawDigits = number.replace(/\D/g, "");
    const normalizedNumber = applyBrPhoneCorrection ? normalizeBrPhone(rawDigits) : rawDigits;

    // Pre-check: ticket aberto/pending no MESMO canal com OUTRO operador.
    // Se houver, abre dialog (Cancelar/Abrir/Assumir) e aborta o envio. Espelha
 // `abrirAtendimentoExistente` do front legado.
    if (inputMode === "phone" && !skipPrecheck) {
      try {
        const found = await findExistingOpenTicket({
          number: normalizedNumber,
          whatsappId: session.id,
          currentUserId: user?.userId ?? null,
        });
        if (found) {
          setExistingTicket(found);
          return;
        }
      } catch { /* silenciar — não bloquear envio se pre-check falhar */ }
    }

    if (isWabaLike && selectedTemplate) {
      const headerLinkCheck = templateVars.find((v) => v.key === "header_link");
      if (headerLinkCheck && !isValidHttpUrl(headerLinkCheck.value)) {
        toast.error(tErrors("invalidMediaHeaderUrl"));
        return;
      }
      // Cobranca: valida antes de criar o ticket — evita ticket orfao com envio 400.
      if (isOrderDetailsSelected) {
        const orderError = validateOrderDetails(orderDetailsValue);
        if (orderError) {
          toast.warning(tOrder(orderError));
          return;
        }
      }
    }

    setSending(true);
    try {
      const signName = (typeof window !== "undefined" ? (user?.username ?? localStorage.getItem("username")) : (user?.username ?? null)) || "";
      const useSignature = forceSignature ? true : signatureEnabled;
      const signedMessage = useSignature && signName.trim() && message.trim()
        ? buildSignedBody(signName, message, session.type)
        : (message || "");
      const { data: indRes } = await sendIndividualMessage({
        whatsappId: session.id,
        whatsappType: (session.type ?? "").toLowerCase(),
        ...(inputMode === "bsuid" ? { bsuid: bsuid.trim() } : { number: normalizedNumber }),
        message: isWabaLike ? "" : signedMessage,
        desiredStatus,
        ...(selectedQueue && selectedQueue !== "none" ? { queueId: Number(selectedQueue) } : {}),
      });

      if (isWabaLike && selectedTemplate) {
        const ticketId = (indRes as { ticketId?: number })?.ticketId;
        const cleanNumber = inputMode === "bsuid" ? bsuid.trim() : normalizedNumber;

        const components: Record<string, unknown>[] = [];
        const headerComp = selectedTemplate.components?.find((c) => c.type === "HEADER");
        if (headerComp) {
          if (headerComp.format === "TEXT") {
            const headerPositional = templateVars.filter((v) => v.key.startsWith("header_variable_"));
            const headerNamed = templateVars.filter((v) => v.key.startsWith("header_named_variable_"));
            if (headerPositional.length > 0) {
              const variables: string[] = [];
              headerPositional.sort((a, b) => parseInt(a.key.replace("header_variable_", "")) - parseInt(b.key.replace("header_variable_", "")))
                .forEach((v, i) => { variables[i] = v.value; });
              components.push({ type: "HEADER", format: "TEXT", variables });
            } else if (headerNamed.length > 0) {
              components.push({ type: "HEADER", format: "TEXT", parameters: headerNamed.map((v) => ({ type: "text", text: v.value, name: v.key.replace("header_named_variable_", "") })) });
            }
          } else {
            const headerLinkVar = templateVars.find((v) => v.key === "header_link");
            if (headerLinkVar?.value)
              components.push({ type: "HEADER", format: headerComp.format, value: headerLinkVar.value });
          }
        }
        const positionalVars = templateVars.filter((v) => v.key.startsWith("body_variable_"));
        const namedVars = templateVars.filter((v) => v.key.startsWith("body_named_variable_"));
        if (positionalVars.length > 0) {
          const variables: string[] = [];
          positionalVars.sort((a, b) => parseInt(a.key.replace("body_variable_", "")) - parseInt(b.key.replace("body_variable_", "")))
            .forEach((v, i) => { variables[i] = v.value; });
          components.push({ type: "BODY", variables });
        } else if (namedVars.length > 0) {
          components.push({ type: "BODY", parameters: namedVars.map((v) => ({ type: "text", text: v.value, name: v.key.replace("body_named_variable_", "") })) });
        }

        const idFront = `avulsa_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        // Cobranca vai como campo proprio: o backend monta, valida e injeta o
        // componente no BUTTONS. Sem cobranca o spread vira {} (no-op).
        const orderDetailsField = isOrderDetailsSelected
          ? { orderDetails: buildOrderDetailsPayload(orderDetailsValue) }
          : {};

        if (isGupshup) {
          const { sendGupshupTemplateMsg } = await import("@/services/gupshup-messages");
          await sendGupshupTemplateMsg({
            from: cleanNumber,
            ticketId,
            whatsappId: session.id,
            tokenApi: session.tokenAPI,
            idFront,
            fromMe: true,
            read: 1,
            name: selectedTemplate.name,
            language: selectedTemplate.language,
            components,
            // Mesmo array de components do ramo WABA (contrato do dataJson):
            // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
            dataJson: JSON.stringify(components),
            ...orderDetailsField,
          });
        } else if (isDialog360) {
          const { sendDialog360Template } = await import("@/services/dialog360-messages");
          await sendDialog360Template({
            from: cleanNumber,
            ticketId,
            whatsappId: session.id,
            tokenApi: session.tokenAPI,
            idFront,
            fromMe: true,
            read: 1,
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language,
            components,
            // Mesmo array de components do ramo WABA (contrato do dataJson):
            // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
            dataJson: JSON.stringify(components),
            ...orderDetailsField,
          });
        } else {
          await sendWabaTemplateComponents({
            from: cleanNumber,
            tokenApi: session.tokenAPI,
            ticketId,
            phone_number_id: session.tokenAPI,
            language: selectedTemplate.language,
            templateName: selectedTemplate.name,
            body: JSON.stringify(selectedTemplate.components || []),
            mediaType: "templates",
            sendType: "templates",
            fromMe: true,
            components,
            dataJson: JSON.stringify(components),
            scheduleDate: null,
            quotedMsg: null,
            idFront,
            ...orderDetailsField,
          });
        }
      }

      // Cross-channel reply: vincula ticket criado ao ticket pai (WC) via parentTicketId.
      // Usa o ticketId retornado por sendIndividualMessage. Best-effort: se falhar,
      // a mensagem ja foi enviada e o admin nao perde nada.
      const childTicketId = (indRes as { ticketId?: number })?.ticketId;
      if (parentTicketId && childTicketId) {
        try {
          const { linkTicketParent } = await import("@/services/tickets");
          await linkTicketParent(childTicketId, parentTicketId);
        } catch { /* silenciar — nao bloqueia UX */ }
      }

      toast.success(t("newConversation.messageSent"));
      onOpenChange(false);
      setNumber("");
      setBsuid("");
      setInputMode("phone");
      setMessage("");
      setSelectedSession("");
      setSelectedTemplate(null);
      setTemplateVars([]);
      setDesiredStatus("open");

      // Em modo cross-channel reply, redireciona pro ticket criado (admin pode
      // continuar conversando ali ou ver o thread).
      if (parentTicketId && childTicketId) {
        router.push(`/atendimento?ticketId=${childTicketId}`);
      }
    } catch (err: unknown) {
      // Mesmo caso do chargeErrCode abaixo: o interceptor rejeita com a RESPOSTA, entao
      // o codigo vem em `data.error`. Ler so `response.data.error` deixava fila/canal sem
      // permissao e numero invalido caindo no toast generico. `message` so quando parece
      // codigo — no 409 esse campo carrega o ticket serializado.
      const errMsg = String(
        (err as { data?: { message?: string } })?.data?.message ||
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        ""
      );
      const errCode = String(
        (err as { data?: { error?: string } })?.data?.error ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (errMsg.startsWith("ERR_") ? errMsg : "")
      );
      // Cobrança: o interceptor de api.ts rejeita com a RESPOSTA (não com o
      // AxiosError), então o código chega em `data.error`. Lê as duas formas —
      // sem isso o motivo da recusa (CRC, valor, permissão) some no toast genérico.
      const chargeErrCode = String(
        (err as { data?: { error?: string } })?.data?.error ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        ""
      );
      if (errCode.startsWith("ERR_NUMBER_RESOLVED_MISMATCH")) {
        toast.error(tErrors("numberResolvedMismatch"));
      } else if (errCode === "ERR_QUEUE_NOT_ALLOWED") {
        toast.error(t("newConversation.queueNotAllowed"));
      } else if (errCode === "ERR_SESSION_NOT_ALLOWED") {
        toast.error(t("newConversation.sessionNotAllowed"));
      } else if (errCode.startsWith("ERR_WAPP_INVALID_CONTACT")) {
        toast.error(t("newConversation.numberNotOnWhatsapp"));
      } else if (errCode.startsWith("ERR_WAPP_CHECK_CONTACT")) {
        toast.error(t("newConversation.numberCheckFailed"));
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
        toast.error(t("newConversation.errorSending"));
      }
    } finally {
      setSending(false);
    }
  };

  const filteredTemplates = wabaTemplates.filter((tp) => {
    if (!matchTemplateCategory(tp, templateCategoryFilter)) return false;
    if (templateSearch && !tp.name.toLowerCase().includes(templateSearch.toLowerCase())) return false;
    return true;
  });

  const pickTplGalleryItem = (item: GalleryItem) => {
    setTemplateVars((prev) =>
      prev.map((v) => v.key === "header_link" ? { ...v, value: item.url } : v)
    );
    setTplGalleryOpen(false);
  };

  const renderTemplatePreview = (tpl: WabaTemplate, vars: { key: string; value: string }[]) => (
    <div className="bg-[#e5ddd5] rounded-lg p-3">
      <div className="bg-white rounded-lg shadow-sm p-3 max-w-[90%] ml-auto space-y-1.5">
        {tpl.components?.find((c) => c.type === "HEADER") && (() => {
          const hdr = tpl.components!.find((c) => c.type === "HEADER")!;
          if (hdr.format === "TEXT" && hdr.text) {
            let rendered = hdr.text;
            vars.filter((v) => v.key.startsWith("header_variable_") || v.key.startsWith("header_named_variable_")).forEach((v) => {
              const n = v.key.startsWith("header_variable_") ? v.key.replace("header_variable_", "") : v.key.replace("header_named_variable_", "");
              rendered = rendered.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
            });
            return <p className="font-bold text-sm text-gray-900">{rendered}</p>;
          }
          if (hdr.format === "IMAGE") return <div className="h-24 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Imagem]</div>;
          if (hdr.format === "VIDEO") return <div className="h-24 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Vídeo]</div>;
          if (hdr.format === "DOCUMENT") return <div className="h-12 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Documento]</div>;
          return null;
        })()}
        {tpl.components?.find((c) => c.type === "BODY")?.text && (() => {
          let text = tpl.components!.find((c) => c.type === "BODY")!.text!;
          vars.filter((v) => v.key.startsWith("body_variable_") || v.key.startsWith("body_named_variable_")).forEach((v) => {
            const n = v.key.startsWith("body_variable_") ? v.key.replace("body_variable_", "") : v.key.replace("body_named_variable_", "");
            text = text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
          });
          return <p className="text-sm whitespace-pre-wrap text-gray-800">{text}</p>;
        })()}
        {tpl.components?.find((c) => c.type === "FOOTER")?.text && (
          <p className="text-xs text-gray-400">{tpl.components.find((c) => c.type === "FOOTER")!.text}</p>
        )}
        {tpl.components?.find((c) => c.type === "BUTTONS")?.buttons && (
          <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
            {tpl.components!.find((c) => c.type === "BUTTONS")!.buttons!.map((btn, i) => (
              <div key={i} className="text-center text-xs text-blue-500 py-0.5 border border-gray-200 rounded">{btn.text}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-full" style={{ maxHeight: "90dvh", display: "flex", flexDirection: "column" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" /> {t("newConversation.title")}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    tabIndex={-1}
                    onFocus={(e) => e.currentTarget.blur()}
                    aria-label={t("newConversation.helpAria")}
                    className="text-muted-foreground hover:text-foreground transition-colors outline-none"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                  <p className="font-semibold mb-1">{t("newConversation.helpTitle")}</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>{t("newConversation.helpItem1")}</li>
                    <li>{t("newConversation.helpItem2")}</li>
                    <li>{t("newConversation.helpItem3")}</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription>{t("newConversation.description")}</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 flex-1 space-y-4 py-2 pr-1">
          {/* Card do contato — so aparece em modo cross-channel reply */}
          {(prefilledContactName || prefilledNumber || prefilledContactEmail) && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("newConversation.contactInfoLabel")}
              </p>
              {prefilledContactName && (
                <p className="text-sm font-medium">{prefilledContactName}</p>
              )}
              {prefilledNumber && (
                <p className="text-xs text-muted-foreground">📱 {prefilledNumber}</p>
              )}
              {prefilledContactEmail && (
                <p className="text-xs text-muted-foreground">✉️ {prefilledContactEmail}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("newConversation.whatsappSession")} *</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={connectionFilter === null ? "default" : "outline"}
                onClick={() => setConnectionFilter(null)}
              >
                {t("newConversation.filterAll")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={connectionFilter === "official" ? "default" : "outline"}
                onClick={() => setConnectionFilter("official")}
              >
                {t("newConversation.filterApiOfficial")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={connectionFilter === "unofficial" ? "default" : "outline"}
                onClick={() => setConnectionFilter("unofficial")}
              >
                {t("newConversation.filterApiUnofficial")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={connectionFilter === "email" ? "default" : "outline"}
                onClick={() => setConnectionFilter("email")}
              >
                Email
              </Button>
            </div>
            {loadingSessions ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("newConversation.loading")}</div>
            ) : (
              <Select value={selectedSession} onValueChange={(v) => { setSelectedSession(v); setSelectedTemplate(null); setTemplateVars([]); }}>
                <SelectTrigger><SelectValue placeholder={t("newConversation.selectSession")} /></SelectTrigger>
                <SelectContent>
                  {sessionsForSelect.length === 0 ? (
                    <div className="py-2 px-3 text-sm text-muted-foreground">{t("newConversation.noSessionsForFilter")}</div>
                  ) : sessionsForSelect.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} ({s.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isWaba && selectedSessionObj ? (
              <WabaConnectionQualityBadge
                bmToken={selectedSessionObj.bmToken}
                tokenAPI={selectedSessionObj.tokenAPI}
                wabaId={selectedSessionObj.wabaId}
                phoneHint={selectedSessionObj.number}
                wabaVersion={selectedSessionObj.wabaVersion}
                loadingLabel={t("newConversation.qualityLoading")}
                tooltipTitle={t("newConversation.qualityTitle")}
                tooltipBody={t("newConversation.qualityBody")}
              />
            ) : null}
          </div>
          {allowedQueues.length > 0 && !isEmail && (
            <div className="space-y-2">
              <Label>{t("newConversation.queueLabel")}</Label>
              <Select value={selectedQueue} onValueChange={setSelectedQueue}>
                <SelectTrigger><SelectValue placeholder={t("newConversation.queuePlaceholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("newConversation.queueNone")}</SelectItem>
                  {allowedQueues.map((q) => (
                    <SelectItem key={q.id} value={String(q.id)}>
                      <span className="flex items-center gap-2">
                        {q.color && <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: q.color }} />}
                        {q.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isEmail && !prefilledContactEmail && (
            <div className="space-y-2">
              <Label>{t("newConversation.emailTo") || "Email do destinatario"} *</Label>
              {/* Busca de contato — preenche email se contato tiver, senão preenche número (não usado) */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder={tMsgInput("vcardSearchPlaceholder")}
                  className="h-8 text-sm pl-7"
                />
                {contactLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {contactResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded border divide-y">
                  {contactResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        if ((c as { email?: string }).email) {
                          setManualEmail((c as { email?: string }).email || "");
                        }
                        setContactSearch("");
                        setContactResults([]);
                      }}
                    >
                      <div className={cn("font-medium leading-none", isLiveMode && "live-blur-text")}>{c.name}</div>
                      <div className={cn("text-xs text-muted-foreground mt-0.5", isLiveMode && "live-blur-text")}>
                        {(c as { email?: string }).email || c.number}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <Input
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="contato@exemplo.com"
                type="email"
              />
            </div>
          )}
          {!isEmail && (
          <div className="space-y-2">
            <Label>{inputMode === "bsuid" ? t("newConversation.inputModeBsuid") : t("newConversation.number")} *</Label>
            {prefilledContactName && (
              <p className="text-xs text-muted-foreground">{t("newConversation.replyingTo", { name: prefilledContactName })}</p>
            )}
            {/* Tab de modo de entrada: só aparece em WABA sem numberLocked */}
            {isWaba && !numberLocked && (
              <div className="flex gap-0.5 p-0.5 bg-muted rounded-md w-fit">
                <button
                  type="button"
                  onClick={() => setInputMode("phone")}
                  className={cn(
                    "px-3 py-1 text-xs rounded transition-colors",
                    inputMode === "phone" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t("newConversation.inputModePhone")}
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("bsuid")}
                  className={cn(
                    "px-3 py-1 text-xs rounded transition-colors",
                    inputMode === "bsuid" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t("newConversation.inputModeBsuid")}
                </button>
              </div>
            )}
            {/* Busca de contato no sistema — pré-seleciona número/BSUID no campo abaixo.
                Em modo cross-channel reply (numberLocked), oculta busca e bloqueia edicao. */}
            {!numberLocked && (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder={tMsgInput("vcardSearchPlaceholder")}
                    className="h-8 text-sm pl-7"
                  />
                  {contactLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                {contactResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border divide-y">
                    {contactResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                        onClick={() => {
                          if (inputMode === "bsuid") {
                            setBsuid((c as { bsuid?: string }).bsuid || (c as { username?: string }).username || "");
                          } else {
                            setNumber(c.number || "");
                            if ((c as { email?: string }).email) {
                              setManualEmail((c as { email?: string }).email || "");
                            }
                          }
                          setContactSearch("");
                          setContactResults([]);
                        }}
                      >
                        <div className={cn("font-medium leading-none", isLiveMode && "live-blur-text")}>{c.name}</div>
                        <div className={cn("text-xs text-muted-foreground mt-0.5", isLiveMode && "live-blur-text")}>
                          {inputMode === "bsuid"
                            ? ((c as { bsuid?: string }).bsuid || (c as { username?: string }).username || c.number)
                            : c.number
                          }
                          {inputMode !== "bsuid" && (c as { email?: string }).email ? ` · ${(c as { email?: string }).email}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {contactSearch.trim() && !contactLoading && contactResults.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-1">{tMsgInput("vcardNoResults")}</p>
                )}
              </>
            )}
            {inputMode === "bsuid" ? (
              <>
                <Input
                  value={bsuid}
                  onChange={(e) => setBsuid(e.target.value)}
                  placeholder={t("newConversation.bsuidPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("newConversation.bsuidHint")}</p>
              </>
            ) : (
              <>
                <Input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="+5511999999999"
                  type="tel"
                  readOnly={numberLocked}
                  className={numberLocked ? "bg-muted/50" : undefined}
                />
                <p className="text-xs text-muted-foreground">{t("newConversation.includeCountryCode")}</p>
                {(() => {
                  const raw = number.replace(/\D/g, "");
                  const normalized = normalizeBrPhone(raw);
                  if (raw.length >= 12 && raw.startsWith("55") && normalized !== raw) {
                    return (
                      <div className="text-xs rounded border border-amber-300 bg-amber-50 p-2 space-y-1.5 dark:bg-amber-900/20 dark:border-amber-800">
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                          {t("newConversation.brPhoneAdjusted")}
                        </p>
                        <p className="font-mono text-amber-900 dark:text-amber-300">
                          <span className={cn(!applyBrPhoneCorrection ? "font-semibold" : "line-through opacity-60")}>{raw}</span>
                          <span className="mx-1">→</span>
                          <span className={cn(applyBrPhoneCorrection ? "font-semibold" : "line-through opacity-60")}>{normalized}</span>
                        </p>
                        <div className="flex gap-1.5 pt-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={applyBrPhoneCorrection ? "default" : "outline"}
                            className="h-7 text-[11px] px-2"
                            onClick={() => setApplyBrPhoneCorrection(true)}
                          >
                            {t("newConversation.brPhoneApplyCorrection")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={!applyBrPhoneCorrection ? "default" : "outline"}
                            className="h-7 text-[11px] px-2"
                            onClick={() => setApplyBrPhoneCorrection(false)}
                          >
                            {t("newConversation.brPhoneKeepOriginal")}
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </>
            )}
          </div>
          )}

          {isWabaLike ? (
            <div className="space-y-2 min-w-0">
              <Label>{t("newConversation.wabaTemplate")}</Label>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("newConversation.loading")}</div>
              ) : !selectedTemplate ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("newConversation.searchTemplate")}
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                    <TemplateCategorySelect
                      value={templateCategoryFilter}
                      onChange={setTemplateCategoryFilter}
                      size="sm"
                      className="w-36 shrink-0"
                    />
                  </div>
                  {filteredTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("newConversation.noTemplates")}</p>
                  ) : (
                    <div className="max-h-[200px] overflow-y-auto" style={{ overflowX: "hidden" }}>
                      <div className="space-y-1" style={{ width: "100%", maxWidth: "100%" }}>
                        {filteredTemplates.map((tp) => (
                          <div
                            key={`${tp.name}-${tp.language}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedTemplate(tp)}
                            onKeyDown={(e) => e.key === "Enter" && setSelectedTemplate(tp)}
                            className="w-full text-left p-2.5 rounded-lg border text-sm transition-colors hover:bg-accent border-transparent cursor-pointer overflow-hidden"
                            style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
                          >
                            <p className="font-medium" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tp.name}</p>
                            <p className="text-xs text-muted-foreground" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {tp.language}
                              {tp.status && <span className="ml-2 text-emerald-600">{tp.status}</span>}
                              {tp.category && <span className="ml-2 uppercase">· {tp.category}</span>}
                            </p>
                            {tp.components?.find((c) => c.type === "BODY")?.text && (
                              <p className="text-xs text-muted-foreground mt-0.5" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {tp.components.find((c) => c.type === "BODY")?.text}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1 shrink-0">
                    <button onClick={() => setSelectedTemplate(null)} className="text-xs text-primary hover:underline">← {t("newConversation.back")}</button>
                    <span className="text-sm font-semibold truncate">{selectedTemplate.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{selectedTemplate.language}</span>
                  </div>
                  <div className="overflow-y-auto space-y-2" style={{ maxHeight: "42vh" }}>
                    {renderTemplatePreview(selectedTemplate, templateVars)}
                    {templateVars.length > 0 ? (
                      <div className="space-y-2 mt-1">
                        <p className="text-xs font-medium text-muted-foreground">{t("newConversation.fillVariables")}</p>
                        {templateVars.map((v) => (
                          <div key={v.key} className="flex items-center gap-2">
                            <Label className="text-xs w-28 shrink-0">{v.label}</Label>
                            <Input
                              value={v.value}
                              onChange={(e) => setTemplateVars((prev) => prev.map((tv) => tv.key === v.key ? { ...tv, value: e.target.value } : tv))}
                              className="h-7 text-sm flex-1"
                              placeholder={v.label}
                            />
                            {v.key === "header_link" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                title={t("newConversation.pickFromGallery")}
                                onClick={() => setTplGalleryOpen(true)}
                              >
                                <Images className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : isOrderDetailsSelected ? null : (
                      <p className="text-xs text-muted-foreground text-center">{t("newConversation.selectTemplate")}</p>
                    )}
                    {isOrderDetailsSelected && (
                      <div className="mt-2 space-y-2 border-t pt-2">
                        <p className="text-xs font-medium text-muted-foreground">{tOrder("sectionTitle")}</p>
                        <OrderDetailsFields
                          key={`${selectedTemplate.name}-${selectedTemplate.language}`}
                          value={orderDetailsValue}
                          onChange={setOrderDetailsValue}
                          compact
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : isEmail ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("newConversation.emailSubject")} *</Label>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder={t("newConversation.emailSubjectPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("newConversation.emailBody")} *</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("newConversation.emailBodyPlaceholder")}
                  className="min-h-[120px]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("newConversation.message")}</Label>
                {(user?.username || (typeof window !== "undefined" && localStorage.getItem("username"))) && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      id="newconv-sig-toggle"
                      checked={forceSignature ? true : signatureEnabled}
                      onCheckedChange={forceSignature ? undefined : (v) => {
                        localStorage.setItem("signatureEnabled", String(v));
                        setSignatureEnabled(v);
                      }}
                      disabled={forceSignature}
                      className="scale-90"
                    />
                    <Label htmlFor="newconv-sig-toggle" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                      {(forceSignature ? true : signatureEnabled) ? tMsgInput("signatureEnabled") : tMsgInput("signatureDisabled")}
                    </Label>
                  </div>
                )}
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("newConversation.messagePlaceholder")}
                className="min-h-[80px]"
              />
            </div>
          )}

          {/* Status selector — última escolha antes de Enviar (espelha o "última coisa antes da mensagem").
              Garante que pending/open sejam confirmados depois do texto/template. */}
          {!isEmail && (
            <div className="space-y-2">
              <Label>{t("newConversation.statusLabel")}</Label>
              <RadioGroup
                value={desiredStatus}
                onValueChange={(v) => setDesiredStatus(v as "open" | "pending")}
                className="grid grid-cols-2 gap-2"
              >
                <label className={cn(
                  "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                  desiredStatus === "open" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}>
                  <RadioGroupItem value="open" id="newconv-status-open" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium leading-none">{t("newConversation.statusOpen")}</div>
                    <p className="text-[11px] text-muted-foreground leading-tight">{t("newConversation.statusOpenDesc")}</p>
                  </div>
                </label>
                <label className={cn(
                  "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                  desiredStatus === "pending" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}>
                  <RadioGroupItem value="pending" id="newconv-status-pending" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium leading-none">{t("newConversation.statusPending")}</div>
                    <p className="text-[11px] text-muted-foreground leading-tight">{t("newConversation.statusPendingDesc")}</p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("newConversation.cancel")}</Button>
          <Button onClick={() => handleSend()} disabled={sending || !selectedSession || (isEmail ? (!emailDestinationFinal || !emailSubject.trim() || !message.trim()) : !number) || (isWabaLike && !selectedTemplate)}>
            {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("newConversation.sending")}</> : <><Send className="mr-2 h-4 w-4" /> {t("newConversation.send")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Gallery picker for header media URL */}
      <GalleryPickerWithUploadDialog
        open={tplGalleryOpen}
        onOpenChange={setTplGalleryOpen}
        onPick={pickTplGalleryItem}
        {...wabaHeaderFormatToGalleryParams(
          selectedTemplate?.components?.find((c) => c.type === "HEADER")?.format
        )}
      />
    </Dialog>
    <ExistingTicketDialog
      open={!!existingTicket}
      onOpenChange={(o) => { if (!o) setExistingTicket(null); }}
      ticket={existingTicket}
      isRestrictedUser={isRestrictedUserHere}
      notViewAssignedTickets={getConfigValue("NotViewAssignedTickets") === "enabled"}
      targetWhatsappId={selectedSessionObj?.id ?? null}
      onProceed={() => handleSend(true)}
    />
    </>
  );
}

// ─── User Menu ───────────────────────────────────────────

function UserMenu({ onOpenActivityLog }: { onOpenActivityLog?: () => void }) {
  const t = useTranslations("layoutHeader");
  const router = useRouter();
  const { user, clearAuth, patchUser, canViewPayments } = useAuthStore();
  const showPayments = canViewPayments();
  const [isOnline, setIsOnline] = useState<boolean>(user?.isOnline ?? true);
  // Pausa do operador (status "Pausado": online mas fora do roteamento automatico)
  const [activePause, setActivePause] = useState<ActivePauseSession | null>(null);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseReasons, setPauseReasons] = useState<PauseReason[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<number | null>(null);
  const [pauseScopeAll, setPauseScopeAll] = useState(true);
  const [selectedQueueIds, setSelectedQueueIds] = useState<number[]>([]);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [tenantLicense, setTenantLicense] = useState<string | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [subscription, setSubscription] = useState<AsaasSubscription | null>(null);
  const [payments, setPayments] = useState<AsaasPayment[]>([]);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [trialSource, setTrialSource] = useState<{
    createdAt: Date;
    /** Instante em que o acesso expira (trial interno OU janela até a 1ª cobrança). */
    endsAt: Date;
    /** Janela total, para a barra de progresso. */
    totalDays: number;
    /** true = quem governa é a COBRANÇA, não o trialPeriod (mesmo critério do job). */
    billing: boolean;
  } | null>(null);
  const [dueDaysLeft, setDueDaysLeft] = useState<number | null>(null);
  const [billingDueDate, setBillingDueDate] = useState<Date | null>(null);

  const loadSubscription = useCallback(async () => {
    if (!user?.tenantId) return;
    try {
      const { data } = await fetchTenantSubscription();
      const d = data as { subscription?: AsaasSubscription; payments?: AsaasPayment[]; availablePlans?: Plan[] };
      setSubscription(d?.subscription ?? null);
      setPayments(d?.payments ?? []);
      setAvailablePlans(d?.availablePlans ?? []);

      // Dias até o vencimento da PRÓXIMA FATURA a pagar — não subscription.nextDueDate,
      // que o Asaas avança para o 2º ciclo logo após gerar a 1ª cobrança (mostrava
      // ~61 dias em vez dos 30 reais). Usa a fatura vencida ou a pendente mais próxima
      // (espelha o cálculo de layout.tsx); só cai no nextDueDate se não houver fatura.
      const pays = (d?.payments ?? []) as AsaasPayment[];
      const overdueInv = pays.find((p) => (p.status ?? "").toUpperCase() === "OVERDUE");
      const pendingInv = pays
        .filter((p) => (p.status ?? "").toUpperCase() === "PENDING")
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
      const nextDue = (overdueInv ?? pendingInv)?.dueDate
        ?? (d?.subscription as AsaasSubscription | undefined)?.nextDueDate;
      if (nextDue) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const due = new Date(nextDue + "T00:00:00");
        const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
        setDueDaysLeft(diff);
        // Vencimento REAL da 1ª cobrança: quando o tenant já está provisionado no
        // gateway, é ele que define até quando o acesso vai — não a janela fixa de
        // 30 dias (que só serve de estimativa enquanto nenhuma fatura foi gerada).
        setBillingDueDate(due);
      } else {
        setDueDaysLeft(null);
        setBillingDueDate(null);
      }
    } catch { /* sem assinatura */ }
  }, [user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId) return;
    fetchTenantById(user.tenantId)
      .then(async ({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        const td = d as Record<string, unknown>;
        setTenantLicense((td?.tenantLicense as string) ?? "enabled");

        // Trial info — espelha o que REALMENTE expira, nunca uma janela inventada.
        // Quem governa o fim do acesso é o backend: `billingProvisioned` usa o mesmo
        // critério do job que desativa o tenant (token + customerId do gateway), e
        // `trialEndsAt` é a própria data que o job compara. O cálculo antigo tratava
        // o interruptor "Asaas habilitado" como cobrança provisionada e trocava a
        // duração configurada por 30 dias fixos; e, por comparar `createdAt` (com
        // hora) contra a meia-noite de hoje, somava mais um dia no dia da criação
        // (5 dias de trial apareciam como "31 dias", com "-1d" na régua da barra).
        if (td?.trial === "enabled" && td?.createdAt) {
          const BILLING_WINDOW_DAYS = 30; // /signup: nextDueDate = createdAt + 30 (cycle MONTHLY)
          const created = new Date(td.createdAt as string);

          // Backend antigo não manda `billingProvisioned` (rollout aditivo): o
          // fallback exige o customerId de fato — nunca a flag `asaas` sozinha,
          // que é justamente o que inflava o prazo.
          const gw = (td?.paymentGateway as string) || "asaas";
          const fallbackBilling =
            gw === "asaas"
              ? td?.asaas === "enabled" && !!td?.asaasCustomerId
              : !!td?.[`${gw}CustomerId`];
          const billing =
            typeof td?.billingProvisioned === "boolean"
              ? (td.billingProvisioned as boolean)
              : fallbackBilling;

          if (billing) {
            // Cobrança provisionada: o job NÃO bloqueia mais pelo trialPeriod — o
            // acesso segue até a 1ª cobrança. A data real vem das faturas
            // (loadSubscription); até chegar, estima createdAt + 30.
            const endsAt = new Date(created);
            endsAt.setDate(endsAt.getDate() + BILLING_WINDOW_DAYS);
            setTrialSource({ createdAt: created, endsAt, totalDays: BILLING_WINDOW_DAYS, billing: true });
          } else {
            const periodDays = Number(td?.trialPeriodEffective ?? td?.trialPeriod);
            const totalDays = Number.isFinite(periodDays) && periodDays > 0 ? periodDays : 3;
            const endsAt = td?.trialEndsAt
              ? new Date(td.trialEndsAt as string)
              : (() => {
                  const e = new Date(created);
                  e.setDate(e.getDate() + totalDays);
                  return e;
                })();
            setTrialSource({ createdAt: created, endsAt, totalDays, billing: false });
          }
        }

        // LGPD: só carrega/expõe dados de assinatura se o perfil pode ver pagamentos.
        // Cobrança habilitada = Asaas legado (flag) OU tenant provisionado em outro
        // gateway (paymentGateway + customerId, ex.: Stripe via signup/migração) —
        // o gate antigo `asaas === "enabled"` escondia o plano de tenants Stripe.
        const pg = td?.paymentGateway as string | undefined;
        const gatewayProvisioned =
          (td?.asaas as string) === "enabled" ||
          (!!pg && pg !== "asaas" && !!td?.[`${pg}CustomerId`]);
        if (gatewayProvisioned && showPayments) {
          setBillingEnabled(true);
          await loadSubscription();
        }
      })
      .catch(() => {});
  }, [user?.tenantId, loadSubscription, showPayments]);

  /**
   * Contagem exibida no menu. `daysLeft` é o tempo que AINDA falta arredondado para
   * cima (mesma leitura do job, que compara o instante exato de expiração): duração
   * de 5 dias mostra "5" no dia da criação e "1" no último dia. A régua da barra é
   * derivada daqui e fica sempre dentro de [0, total] — o "-1d" do cálculo antigo
   * era o mesmo off-by-one que inflava o contador.
   */
  const trialView = useMemo(() => {
    if (!trialSource) return null;
    const endsAt = trialSource.billing && billingDueDate ? billingDueDate : trialSource.endsAt;
    const msLeft = endsAt.getTime() - Date.now();
    if (msLeft <= 0) return null;
    const daysLeft = Math.max(1, Math.ceil(msLeft / 86400000));
    const spanDays = Math.ceil((endsAt.getTime() - trialSource.createdAt.getTime()) / 86400000);
    const totalDays = Math.max(daysLeft, trialSource.billing && billingDueDate ? spanDays : trialSource.totalDays);
    const elapsedDays = Math.min(totalDays, Math.max(0, totalDays - daysLeft));
    return {
      daysLeft,
      totalDays,
      elapsedDays,
      billing: trialSource.billing,
      endsAtLabel: endsAt.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }),
    };
  }, [trialSource, billingDueDate]);

  const latestPayment = payments?.[0] ?? null;

  const paymentStatusColor: Record<string, string> = {
    PENDING: "text-warning",
    RECEIVED: "text-success",
    OVERDUE: "text-destructive",
  };
  const paymentStatusLabel: Record<string, string> = {
    PENDING: t("userMenu.paymentPending"),
    RECEIVED: t("userMenu.paymentReceived"),
    OVERDUE: t("userMenu.paymentOverdue"),
  };
  const subStatusColor: Record<string, string> = {
    ACTIVE:   "text-success",
    INACTIVE: "text-muted-foreground",
    EXPIRED:  "text-destructive",
  };
  const subStatusLabel: Record<string, string> = {
    ACTIVE:   t("userMenu.subActive"),
    INACTIVE: t("userMenu.subInactive"),
    EXPIRED:  t("userMenu.subExpired"),
  };

  useEffect(() => {
    if (typeof user?.isOnline === "boolean") {
      setIsOnline(user.isOnline);
    }
  }, [user?.isOnline]);

  // Carrega a pausa ativa do operador no mount (estado "Pausado" derivado).
  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;
    fetchMyActivePause()
      .then(({ data }) => { if (!cancelled) setActivePause(data ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.userId]);

  // Fase 2: enquanto pausado, refaz o fetch a cada 60s para refletir o estouro
  // (overflowedAt setado pelo job) no header. O alerta em si chega via notificacao.
  const isPaused = !!activePause;
  useEffect(() => {
    if (!isPaused || !user?.userId) return;
    const id = setInterval(() => {
      fetchMyActivePause().then(({ data }) => setActivePause(data ?? null)).catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, [isPaused, user?.userId]);

  // Filas do proprio operador (para a pausa seletiva por fila).
  const myQueues = (((user?.queues as Array<{ id: number; queue?: string; name?: string; color?: string }>) || [])
    .map((q) => ({ id: q.id, name: q.name ?? q.queue ?? `#${q.id}`, color: q.color })));

  const openPauseDialog = () => {
    if (activePause) {
      setSelectedReasonId(activePause.pauseReasonId ?? null);
      setPauseScopeAll(activePause.scopeAllQueues);
      setSelectedQueueIds(activePause.queueIds || []);
    } else {
      setSelectedReasonId(null);
      setPauseScopeAll(true);
      setSelectedQueueIds([]);
    }
    // RAF: o DropdownMenu fecha (DismissableLayer) e o Dialog abre no proximo frame,
    // senao o dismiss em cadeia fecharia o dialog (fix nested-dialog/RAF da memoria).
    requestAnimationFrame(() => setPauseDialogOpen(true));
    fetchPauseReasons(true)
      .then(({ data }) => setPauseReasons(data || []))
      .catch(() => setPauseReasons([]));
  };

  const handleSetOnline = async () => {
    if (!user?.userId) return;
    setPauseLoading(true);
    try {
      if (activePause) { await endUserPause(); setActivePause(null); }
      if (!isOnline) {
        await updateUserIsOnline(user.userId, true);
        setIsOnline(true);
        patchUser({ isOnline: true });
      }
      toast.success(t("userMenu.statusOnline"));
    } catch {
      toast.error(t("userMenu.errorChangingStatus"));
    } finally {
      setPauseLoading(false);
    }
  };

  const handleSetOffline = async () => {
    if (!user?.userId) return;
    setPauseLoading(true);
    try {
      // Backend tambem encerra a pausa ativa ao ficar offline (furo 3).
      await updateUserIsOnline(user.userId, false);
      setIsOnline(false);
      setActivePause(null);
      patchUser({ isOnline: false });
      toast.success(t("userMenu.statusOffline"));
    } catch {
      toast.error(t("userMenu.errorChangingStatus"));
    } finally {
      setPauseLoading(false);
    }
  };

  const handleStartPause = async () => {
    if (!user?.userId) return;
    if (!selectedReasonId) { toast.error(t("userMenu.pauseSelectReason")); return; }
    if (!pauseScopeAll && selectedQueueIds.length === 0) { toast.error(t("userMenu.pauseSelectQueues")); return; }
    setPauseLoading(true);
    try {
      // Pausa pressupoe presenca: garante online (nao dispara reatribuicao de offline).
      if (!isOnline) {
        await updateUserIsOnline(user.userId, true);
        setIsOnline(true);
        patchUser({ isOnline: true });
      }
      // Se ja esta pausado e o usuario muda motivo/escopo, encerra a sessao atual e
      // reinicia (StartUserPause e idempotente e devolveria a existente sem alterar).
      if (activePause) { await endUserPause(); }
      const { data } = await startUserPause({
        pauseReasonId: selectedReasonId,
        scopeAllQueues: pauseScopeAll,
        queueIds: pauseScopeAll ? [] : selectedQueueIds,
      });
      setActivePause(data as ActivePauseSession);
      setPauseDialogOpen(false);
      toast.success(t("userMenu.pauseStarted"));
    } catch (e: any) {
      const code = e?.data?.error ?? e?.response?.data?.error;
      toast.error(code === "ERR_PAUSE_MAX_USES_REACHED" ? t("userMenu.pauseMaxUsesReached") : t("userMenu.pauseError"));
    } finally {
      setPauseLoading(false);
    }
  };

  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    setLogoutDialogOpen(true);
  };

  const confirmLogout = async (setOffline: boolean) => {
    setLoggingOut(true);
    if (setOffline && user?.userId) {
      // Best-effort: se a chamada falhar, não trava o logout — usuário sai mesmo assim.
      try {
        await updateUserIsOnline(user.userId, false);
      } catch { /* ignora */ }
    }
    // App nativo: remove o token FCM do aparelho no backend (best-effort) para
    // este usuário parar de receber push após sair. Navegador comum: sem token, no-op.
    try {
      const fcmToken = typeof window !== "undefined" ? localStorage.getItem(FCM_TOKEN_STORAGE_KEY) : null;
      if (fcmToken) {
        await unregisterMobileDeviceToken(fcmToken);
        localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
      }
    } catch { /* ignora */ }
    // Web Push (PWA): desfaz a assinatura deste aparelho para quem saiu parar de
    // receber avisos aqui. Best-effort com teto de 3s — sair nunca trava.
    await unsubscribePush();
    setLogoutDialogOpen(false);
    setLoggingOut(false);
    clearAuth();
    router.push("/login");
  };

  const handleClearCookies = () => {
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    localStorage.clear();
    toast.success(t("userMenu.cookiesCleared"));
    router.push("/login");
  };

  const initials = user?.username
    ? user.username.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.profilePicture || ""} alt={user?.username} />
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <span className={cn(
            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
            !isOnline ? "bg-muted-foreground" : activePause ? (activePause.overflowedAt ? "bg-destructive" : "bg-warning") : "bg-success"
          )} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium truncate" title={user?.username || ""}>{user?.username || t("userMenu.defaultUser")}</p>
            <p className="text-xs text-muted-foreground truncate" title={user?.email || ""}>{user?.email || ""}</p>
            <Badge variant="secondary" className="w-fit text-[10px] mt-1">{user?.profile || "user"}</Badge>
            <div className="flex flex-col gap-1 mt-2 pt-2 border-t">
              {/* Versão */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Tag className="h-3 w-3 shrink-0" />
                <span>{t("userMenu.version")}: <span className="font-medium text-foreground">{packageJson.version}</span></span>
              </div>
              {/* Licença */}
              {tenantLicense !== null && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {tenantLicense === "enabled"
                    ? <ShieldCheck className="h-3 w-3 shrink-0 text-success" />
                    : <ShieldAlert className="h-3 w-3 shrink-0 text-warning" />
                  }
                  <span>{t("userMenu.license")}: <span className={cn("font-medium", tenantLicense === "enabled" ? "text-success" : "text-warning")}>
                    {tenantLicense === "enabled" ? t("userMenu.licenseActive") : t("userMenu.licenseValidating")}
                  </span></span>
                </div>
              )}
              {/* Trial ativo */}
              {trialView && (
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0 text-info" />
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {trialView.billing
                        ? t("userMenu.firstChargeDaysLeft", { days: trialView.daysLeft })
                        : t("userMenu.trialDaysLeft", { days: trialView.daysLeft })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Calendar className="h-3 w-3 shrink-0" />
                    <span>{t("userMenu.trialExpiresOn", { date: trialView.endsAtLabel })}</span>
                  </div>
                  <div className="w-full">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-info transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, (trialView.elapsedDays / trialView.totalDays) * 100))}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5 text-[9px] text-muted-foreground">
                      <span>{trialView.elapsedDays}d</span>
                      <span>{trialView.totalDays}d</span>
                    </div>
                  </div>
                </div>
              )}
              {/* Pagamento enriquecido (apenas se cobrança provisionada e perfil pode ver — LGPD) */}
              {billingEnabled && showPayments && (
                <div className="mt-1 space-y-1.5">
                  {/* Assinatura */}
                  {subscription && (
                    <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                      <CreditCard className="h-3 w-3 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground leading-tight">
                            {subscription.description || t("userMenu.currentPlan")}
                          </span>
                          <span className={cn("text-[9px] font-medium px-1 py-px rounded-full",
                            subscription.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" :
                            subscription.status === "EXPIRED" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" :
                            "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          )}>
                            {subStatusLabel[subscription.status] ?? subscription.status}
                          </span>
                        </div>
                        <span>
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(subscription.value)}
                          {subscription.nextDueDate ? ` · ${subscription.nextDueDate.split("-").reverse().join("/")}` : ""}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Barra de progresso — dias até vencimento */}
                  {dueDaysLeft !== null && dueDaysLeft >= 0 && (
                    <div className="w-full">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span className={cn("font-medium",
                          dueDaysLeft <= 3 ? "text-destructive" : dueDaysLeft <= 7 ? "text-warning" : "text-muted-foreground"
                        )}>
                          {dueDaysLeft === 0
                            ? t("userMenu.duesToday")
                            : t("userMenu.daysUntilDue", { days: dueDaysLeft })}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-300",
                            dueDaysLeft <= 3 ? "bg-destructive" : dueDaysLeft <= 7 ? "bg-warning" : "bg-success"
                          )}
                          style={{ width: `${Math.max(5, Math.min(100, ((30 - dueDaysLeft) / 30) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {/* Último pagamento */}
                  {latestPayment && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <CreditCard className="h-3 w-3 shrink-0" />
                      <span>{t("userMenu.payment")}:</span>
                      <span className={cn("font-medium", paymentStatusColor[latestPayment.status] ?? "text-muted-foreground")}>
                        {paymentStatusLabel[latestPayment.status] ?? latestPayment.status}
                      </span>
                    </div>
                  )}
                  {!subscription && !latestPayment && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <CreditCard className="h-3 w-3 shrink-0" />
                      <span>{t("userMenu.noSubscription")}</span>
                    </div>
                  )}
                  {/* Botão mudar plano */}
                  {availablePlans.length > 0 && (
                    <button
                      onClick={(e) => { e.preventDefault(); setPlanModalOpen(true); }}
                      className="flex items-center gap-1 text-[10px] font-medium text-primary hover:opacity-70 transition-opacity"
                    >
                      <CreditCard className="h-3 w-3" />
                      {t("userMenu.changePlan")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground pt-1.5 pb-0.5 flex items-center gap-1">
          {t("userMenu.statusLabel")}
          <HelpCircle className="h-3 w-3 opacity-50" />
        </DropdownMenuLabel>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem onClick={handleSetOnline} disabled={pauseLoading} className="py-1.5">
                <CircleDot className="mr-2 h-4 w-4 text-success" />
                <span>{t("userMenu.statusOnlineOption")}</span>
                {isOnline && !activePause && <Check className="ml-auto h-3.5 w-3.5 text-success" />}
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px] text-xs leading-snug">
              {t("userMenu.statusOnlineHint")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem onClick={openPauseDialog} disabled={pauseLoading} className="flex-col items-start gap-0.5 py-1.5">
                <div className="flex items-center w-full">
                  <PauseCircle className={cn("mr-2 h-4 w-4", activePause?.overflowedAt ? "text-destructive" : "text-warning")} />
                  <span>{t("userMenu.statusPausedOption")}</span>
                  {activePause && <Check className={cn("ml-auto h-3.5 w-3.5", activePause.overflowedAt ? "text-destructive" : "text-warning")} />}
                </div>
                {activePause?.pauseReason?.name && (
                  <p className={cn("text-[10px] leading-snug ml-6 max-w-[180px] truncate", activePause.overflowedAt ? "text-destructive font-medium" : "text-muted-foreground")}>
                    {activePause.pauseReason.name}
                    {!activePause.scopeAllQueues ? ` · ${t("userMenu.pauseScopeSomeShort")}` : ""}
                    {activePause.overflowedAt ? ` · ${t("userMenu.pauseOverflowed")}` : ""}
                  </p>
                )}
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px] text-xs leading-snug">
              {t("userMenu.statusPausedHint")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem onClick={handleSetOffline} disabled={pauseLoading} className="py-1.5">
                <CircleDot className="mr-2 h-4 w-4 text-gray-400" />
                <span>{t("userMenu.statusOfflineOption")}</span>
                {pauseLoading
                  ? <Loader2 className="ml-auto h-3 w-3 animate-spin" />
                  : (!isOnline && <Check className="ml-auto h-3.5 w-3.5 text-gray-400" />)}
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px] text-xs leading-snug">
              {t("userMenu.statusOfflineHint")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuItem onClick={() => {
          const p = user?.profile;
          if (p === "superadmin") router.push("/perfil");
          else router.push("/meu-perfil");
        }}>
          <User className="mr-2 h-4 w-4" /> {t("userMenu.myProfile")}
        </DropdownMenuItem>
        {/* Registro de atividades — movido da linha do header p/ reduzir overflow.
            Mesmo handler/drawer (ActivityLog) de antes; drawer não é Radix Dialog,
            então dispensa o truque de RAF do dialog de pausa. */}
        {onOpenActivityLog && (
          <DropdownMenuItem onClick={onOpenActivityLog}>
            <History className="mr-2 h-4 w-4" /> {t("activityLog")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleClearCookies}>
          <Cookie className="mr-2 h-4 w-4" /> {t("userMenu.clearCookies")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> {t("userMenu.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    {planModalOpen && showPayments && (
      <PaymentPlanModal
        open={planModalOpen}
        onOpenChange={setPlanModalOpen}
        subscription={subscription}
        payments={payments}
        availablePlans={availablePlans}
        onPlanChanged={loadSubscription}
      />
    )}

    <Dialog open={logoutDialogOpen} onOpenChange={(o) => { if (!loggingOut) setLogoutDialogOpen(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5" /> {t("userMenu.logoutDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("userMenu.logoutDialogDesc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={loggingOut} onClick={() => confirmLogout(false)}>
            <CircleDot className="mr-2 h-4 w-4 text-success" />
            {t("userMenu.logoutKeepOnline")}
          </Button>
          <Button variant="destructive" disabled={loggingOut} onClick={() => confirmLogout(true)}>
            <CircleDot className="mr-2 h-4 w-4" />
            {t("userMenu.logoutSetOffline")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={pauseDialogOpen} onOpenChange={(o) => { if (!pauseLoading) setPauseDialogOpen(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-warning" /> {t("userMenu.pauseDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("userMenu.pauseDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("userMenu.pauseReasonLabel")}</Label>
            <Select
              value={selectedReasonId ? String(selectedReasonId) : ""}
              onValueChange={(v) => setSelectedReasonId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("userMenu.pauseReasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {pauseReasons.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("userMenu.pauseNoReasons")}</div>
                ) : (
                  pauseReasons.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      <span className="flex items-center gap-2">
                        {r.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />}
                        {r.name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("userMenu.pauseScopeLabel")}</Label>
            <RadioGroup value={pauseScopeAll ? "all" : "some"} onValueChange={(v) => setPauseScopeAll(v === "all")}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="pause-scope-all" />
                <Label htmlFor="pause-scope-all" className="font-normal cursor-pointer">{t("userMenu.pauseScopeAll")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="some" id="pause-scope-some" />
                <Label htmlFor="pause-scope-some" className="font-normal cursor-pointer">{t("userMenu.pauseScopeSome")}</Label>
              </div>
            </RadioGroup>
            {!pauseScopeAll && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border p-2 space-y-1.5">
                {myQueues.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("userMenu.pauseNoQueues")}</p>
                ) : (
                  myQueues.map((q) => (
                    <label key={q.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={selectedQueueIds.includes(q.id)}
                        onChange={(e) =>
                          setSelectedQueueIds((prev) =>
                            e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id)
                          )
                        }
                      />
                      {q.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: q.color }} />}
                      <span className="truncate">{q.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={pauseLoading} onClick={() => setPauseDialogOpen(false)}>
            {t("userMenu.pauseCancel")}
          </Button>
          <Button disabled={pauseLoading || !selectedReasonId} onClick={handleStartPause}>
            {pauseLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {activePause ? t("userMenu.pauseUpdate") : t("userMenu.pauseConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}

// ─── Tutorials Dialog ────────────────────────────────────

// ─── Health Dot ──────────────────────────────────────────

function HealthDot({ connected }: { connected: boolean }) {
  const t = useTranslations("layoutHeader");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-default">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected
                ? "bg-success shadow-[0_0_6px_hsl(var(--success)/0.8)] animate-pulse"
                : "bg-destructive shadow-[0_0_6px_hsl(var(--destructive)/0.8)]"
            )}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {connected ? t("healthConnected") : t("healthDisconnected")}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Main Header ─────────────────────────────────────────

// Tour de boas-vindas (AppTour, mesmo layout) pendente de exibição ou na tela.
// Usado para adiar o auto-open da mensagem interna: abrir o dialog junto do
// tour o deixa inacessível atrás do overlay, e cliques no tour (overlay custom,
// fora das layers Radix) contam como "fora" do dialog e o fechariam.
const isTourPendingOrActive = (): boolean => {
  // Marca por usuário no servidor (User.configs.tourDone): tour já dispensado em
  // outro aparelho não é "pendente" mesmo com localStorage limpo.
  if (useAuthStore.getState().user?.configs?.tourDone) {
    return useUIStore.getState().tourActive;
  }
  try {
    if (localStorage.getItem(TOUR_KEY) !== "done") return true;
  } catch { /* empty */ }
  return useUIStore.getState().tourActive;
};

export function Header() {
  const t = useTranslations("layoutHeader");
  const tAdmin = useTranslations("supportChatAdmin");
  const tCommon = useTranslations("common");
  // Chaves de preview de mídia vivem no namespace do atendimento
  const tAtd = useTranslations("atendimentoChatExtra");
  // "Você não tem acesso a este atendimento" — mesma mensagem do guard de acesso da tela
  const tAtdChat = useTranslations("atendimentoChat");
  const router = useRouter();
  const { user, supervisorAdmin, getConfigValue, tenantConfigsLoaded } = useAuthStore();
  // Seletor escopado (ação = referência estável): evita re-render do header inteiro
  // a cada mudança de status do SIP / tick de chamada vinda da store do webphone.
  const toggleWebphone = useWebphoneStore((s) => s.toggleVisibility);
  const { setMobileSidebarOpen, tourActive } = useUIStore();
  const {
    notifications,
    internalNotifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    markAllTicketAsRead,
    markInternalAsRead,
    setInternalNotifications,
    setNotifications,
    addNotification,
    addInternalNotification,
  } = useNotificationStore();
  const chatUnread = useChatStore((s) => s.unreadCount);
  const setChatUnreadCount = useChatStore((s) => s.setUnreadCount);
  const { tickets: storeTickets, setTickets } = useTicketStore();
  const socketModelOptimized = useBrandingStore((s) => s.socketModelOptimized);
  const isSuperAdmin = user?.profile === "superadmin";
  const supportChatEnabled = getConfigValue("supportChatEnabled") === "enabled";
  const adminSupportUnread = useSupportChatStore((s) => s.adminTotalUnread);
  const supportChatUnread = useSupportChatStore((s) => s.unreadCount);
  const supportUsers = useSupportChatStore((s) => s.supportUsers);
  const setActiveConversation = useSupportChatStore((s) => s.setActiveConversation);

 // Regras de negócio — controles de visibilidade por perfil/tenant (espelho do front legado)
  const isAdmin = user?.profile === "admin";
  // supervisorViewDept é config POR USUÁRIO (string 'enabled') e só vale para o perfil 'super':
  // supervisor restrito enxerga apenas os tickets das próprias filas. A /atendimento já manda
  // esse filtro no REST; o sino precisa mandar também, senão o backend devolve o tenant inteiro
  // e a lista de notificações mostra atendimento que o supervisor não pode ver.
  const supervisorViewDept = user?.profile === "super" && user?.configs?.supervisorViewDept === "enabled";
  const isRestrictedUser = user?.restrictedUser === true || user?.restrictedUser === "enabled";
  const blockWavoip = user?.blockWavoip === true;
 // SIP: igual ao front legado: userProfile !== 'superadmin' && usuario.sipEnabled
  const sipEnabled = !!user?.sipEnabled;
  // Gate único do WaVoIP (plano + interruptor do tenant). Curto-circuita também o
  // fetchWhatsapps abaixo: com o recurso desligado não há motivo para varrer as
  // sessões atrás de token — e o GET /whatsapp devolve o model inteiro.
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());
  const [hasWavoipToken, setHasWavoipToken] = useState(false);
  useEffect(() => {
    if (isSuperAdmin || !wavoipEnabled) {
      setHasWavoipToken(false);
      return;
    }
    fetchWhatsapps()
      .then(({ data }) => {
        const sessions = Array.isArray(data) ? data : [];
        setHasWavoipToken(sessions.some((s: Whatsapp) => !!s.wavoipToken));
      })
      .catch(() => {});
  }, [isSuperAdmin, wavoipEnabled]);

  // WaVoIP: só mostra se o tenant tem o recurso ligado, ao menos um canal tiver
  // wavoipToken E o usuário não estiver bloqueado
  const showWavoipBtn = wavoipEnabled && !isSuperAdmin && hasWavoipToken && (isAdmin || !blockWavoip);
 // SIP: igual ao front legado: userProfile !== 'superadmin' && usuario.sipEnabled
  const showSipBtn = !isSuperAdmin && sipEnabled;

 // Toggle do widget nativo WaVoIP (igual ao front legado: toggleWavoipWidget)
  const toggleWavoipWidget = () => {
    const current = localStorage.getItem("wavoipWidgetVisible") !== "false";
    const next = !current;
    localStorage.setItem("wavoipWidgetVisible", String(next));
    if (typeof window !== "undefined" && window.wavoip?.settings) {
      window.wavoip.settings.setShowWidgetButton(next);
    }
  };

  const { locale, setLocale } = useLocale();
  const { subscribed, isPWA, subscribeToPush } = usePushNotifications();
  const [mobileSupportChatOpen, setMobileSupportChatOpen] = useState(false);
  const [mobileLocaleOpen, setMobileLocaleOpen] = useState(false);

  // Atalho da busca por plataforma: "⌘K" no macOS, "Ctrl+K" no resto.
  // Client-only (useState+useEffect) para não divergir na hidratação.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  const [sendMsgOpen, setSendMsgOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsTab, setNotificationsTab] = useState<"summary" | "messages" | "tutorials">("summary");
  const [tutorialsList, setTutorialsList] = useState<Tutorial[]>([]);
  const [tutorialsLoading, setTutorialsLoading] = useState(false);
  const tutorialsLoadedRef = useRef(false);
  const [chatPreviewOpen, setChatPreviewOpen] = useState(false);
  const [chatPreviewItems, setChatPreviewItems] = useState<UnreadPreviewItem[]>([]);
  const [chatPreviewLoading, setChatPreviewLoading] = useState(false);
  const chatPreviewLoadedRef = useRef(false);
  const convitesLoadedRef = useRef(false);
  const [tasksList, setTasksList] = useState<TodoItem[]>([]);
  const [tasksExpandOpen, setTasksExpandOpen] = useState(false);
  const [tasksDetailItem, setTasksDetailItem] = useState<TodoItem | null>(null);
  const [systemExpandOpen, setSystemExpandOpen] = useState(false);
  const [systemDetailItem, setSystemDetailItem] = useState<Notification | null>(null);
  // Mensagem interna com auto-open adiado enquanto o tour está pendente/ativo.
  const [pendingSystemNotif, setPendingSystemNotif] = useState<Notification | null>(null);

  // Libera o auto-open adiado quando o tour fecha (ou se ele não chegar a abrir).
  useEffect(() => {
    if (!pendingSystemNotif) return;
    if (tourActive) return; // tour na tela — aguarda fechar
    let tourPending = false;
    try { tourPending = localStorage.getItem(TOUR_KEY) !== "done"; } catch { /* empty */ }
    // Marca do servidor vale como "visto" mesmo com localStorage limpo (aparelho novo).
    if (useAuthStore.getState().user?.configs?.tourDone) tourPending = false;
    if (!tourPending) {
      // Tour concluído/pulado — abrir agora.
      setSystemDetailItem(pendingSystemNotif);
      setPendingSystemNotif(null);
      return;
    }
    // Tour pendente mas ainda não ativo (delay de 1200ms do AppTour). Se não
    // ativar em 3s (edge: AppTour não montado/erro), abre o aviso mesmo assim.
    const timer = setTimeout(() => {
      if (!useUIStore.getState().tourActive) {
        setSystemDetailItem(pendingSystemNotif);
        setPendingSystemNotif(null);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [pendingSystemNotif, tourActive]);
  const [pendingExpandOpen, setPendingExpandOpen] = useState(false);
  const [messagesPage, setMessagesPage] = useState(1);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const { activities, addActivity } = useActivityStore();
 // Convites: tickets compartilhados com o usuário (Front legado / carregarConvitesTickets)
  const [convitesCount, setConvitesCount] = useState(0);
  const [convitesOpen, setConvitesOpen] = useState(false);
  const [convitesList, setConvitesList] = useState<{ id: number; ticketId?: number; ticket?: { id?: number; contact?: { name?: string } }; contact?: { name?: string } }[]>([]);
  const [loadingConvites, setLoadingConvites] = useState(false);
 // Tutoriais: só exibe o botão se houver tutoriais ativos
  const [hasActiveTutorials, setHasActiveTutorials] = useState(false);
 // Flag de sessão: auto-open do modal de mensagens internas só uma vez (front legado: modalMensagensAutoAberto)
  const autoOpenedSystemNotifRef = useRef(false);

  // Online/offline status tracking
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Listen for custom logActivity events dispatched from anywhere in the app
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) addActivity(detail);
    };
    window.addEventListener("logActivity", handler as EventListener);
    return () => window.removeEventListener("logActivity", handler as EventListener);
  }, [addActivity]);

  // Command palette → abre o dialog de Nova Conversa (mesmo caminho do botão Send).
  // Gate reavaliado AQUI (não confia no emissor): mesmo guard do botão (!isSuperAdmin && !isRestrictedUser).
  useEffect(() => {
    const handler = () => {
      if (isSuperAdmin || isRestrictedUser) return;
      setSendMsgOpen(true);
    };
    window.addEventListener("zpro:new-conversation", handler as EventListener);
    return () => window.removeEventListener("zpro:new-conversation", handler as EventListener);
  }, [isSuperAdmin, isRestrictedUser]);

  const totalBadge = unreadCount + chatUnread + convitesCount;
  // Espelha a contagem do sino no título da aba, no favicon e no badge do PWA.
  // Superadmin não tem sino (gate !isSuperAdmin no popover) → força 0.
  useTabNotificationBadge(totalBadge, isSuperAdmin);

 // Carregar notificações internas (API) e tickets (atendimentos) ao montar — igual ao front legado
  useEffect(() => {
    if (!user?.userId) return;

    fetchInternalNotifications(user.userId)
      .then((res) => {
        const data = res.data as InternalNotification[] | { notifications?: InternalNotification[] };
        const all = Array.isArray(data) ? data : (data as { notifications?: InternalNotification[] })?.notifications ?? [];
 // Filter to only this user's notifications (matching legacy behavior)
        const list = all.filter((n) => !n.userId || n.userId === user.userId);
        const mapped = list.map((n) => ({
          id: n.id,
          message: n.message,
          read: n.isRead,
          createdAt: n.createdAt,
          internalContactId: n.senderId,
          internalIsGroup: !!n.groupId,
          internalGroupId: n.groupId,
          source: n.source ?? null,
        }));
        setInternalNotifications(mapped);

        // Auto-open da notificação interna não-lida mais recente, uma única vez por mount.
 // Espelha o comportamento do front legado (MainLayout): hasUnreadMessages && !modalMensagensAutoAberto
        // && userProfile !== 'superadmin'. Filtra notificações sem ticketId/internalContactId/groupId,
        // que são as "mensagens internas de sistema" exibidas no sino.
        if (!autoOpenedSystemNotifRef.current && user?.profile !== "superadmin") {
          const systemUnread = mapped
            .filter((n) => !n.read && !n.internalContactId && !n.internalGroupId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          if (systemUnread.length > 0) {
            autoOpenedSystemNotifRef.current = true;
            if (isTourPendingOrActive()) {
              setPendingSystemNotif(systemUnread[0]);
            } else {
              setSystemDetailItem(systemUnread[0]);
            }
          }
        }
      })
      .catch(() => {});

 // Contagem de mensagens não lidas no chat interno (igual front legado: Number(data?.count) + Number(data?.count?.count))
    Promise.all([fetchUnreadCounts(), fetchUnreadGroupCounts()])
      .then(([privateRes, groupRes]) => {
        const privateCount = Number((privateRes.data as { count?: number })?.count) || 0;
        const groupData = groupRes.data as { count?: number | { count?: number } };
        const groupCount = Number(groupData?.count && typeof groupData.count === "object" ? groupData.count?.count : groupData?.count) || 0;
        setChatUnreadCount(privateCount + groupCount);
      })
      .catch(() => {});

 // Convites: tickets compartilhados com o usuário (Front legado / carregarConvitesTickets)
    fetchTicketSharedByUser()
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setConvitesCount(list.length);
      })
      .catch(() => {});

    // Tarefas pendentes/atrasadas do usuário (mesmo filtro do TasksModal)
    fetchTodos()
      .then(({ data }) => {
        const all = Array.isArray(data) ? data : [];
        const filtered = (all as TodoItem[]).filter((t) =>
          t.ownerId === user?.userId && (t.status === "delayed" || t.status === "pending"),
        );
        setTasksList(filtered);
      })
      .catch(() => {});

 // Tutoriais: verifica se há tutoriais ativos para exibir o botão (Front legado / buscarTutoriaisAtivos)
    if (user.profile !== "superadmin") {
      fetchTutorials({ pageNumber: 1, pageSize: 999 })
        .then(({ data }) => {
          const active = (data?.tutorials ?? []).filter((t) => t.isActive);
          setHasActiveTutorials(active.length > 0);
        })
        .catch(() => {});
    }
  }, [user?.userId, user?.profile, setInternalNotifications, setNotifications, setChatUnreadCount]);

  // Snapshot inicial dos tickets do sino (aba "Mensagens") — effect SEPARADO do mount de
  // propósito: este bloco depende de config que chega DEPOIS do mount. O layout do dashboard
  // só resolve o fetchTenantById alguns ticks adiante (setSupervisorAdmin → injectTenantSettings
  // → setTenantConfigsLoaded). Rodando junto com o resto, supervisorAdmin ainda seria o default
  // "disabled" do store e getConfigValue devolveria undefined para todas as flags de tenant —
  // o que faz QUALQUER 'super' virar admin-like no canUserSeeTicket e o sino listar o tenant
  // inteiro, sem nunca recalcular (o effect antigo não tinha essas deps).
  //
  // O gate em tenantConfigsLoaded é fail-closed DELIBERADO: se o fetchTenantById falhar, o
  // dashboard inteiro já está degradado (menuVisibility, planFeatures, billing) e é melhor o
  // sino nascer vazio do que vazar atendimento alheio — ele continua sendo alimentado em tempo
  // real pelos hooks de socket, que recalculam a visibilidade a cada evento.
  useEffect(() => {
    if (!user?.userId) return;
    if (!tenantConfigsLoaded) return;

    // Buscar tickets abertos/pendentes para listar como notificações (Clientes pendentes na fila)
    const params: NonNullable<Parameters<typeof fetchTickets>[0]> = {
      searchParam: "",
      pageNumber: 1,
      status: ["open", "pending"],
    };
    // Espelha a /atendimento: só envia quando a flag está ligada. É aditivo — backend antigo
    // ignora query param desconhecido e o novo revalida profile === 'super' do req.user, então
    // o param nunca amplia a visão de ninguém, só restringe o supervisor ao próprio departamento.
    if (supervisorViewDept) params.supervisorViewDept = "true";

    fetchTickets(params)
      .then((res) => {
        const raw = (res.data as Record<string, unknown>)?.tickets ?? [];
        const tickets = normalizeTickets(Array.isArray(raw) ? raw : []);
        const hasMore = Boolean((res.data as Record<string, unknown>)?.hasMore) || tickets.length >= 30;
        setMessagesHasMore(hasMore);
        setMessagesPage(1);

        // Configurações de visibilidade aplicadas ao sino — admin/superadmin/super-admin-like
        // retornam true no helper antes de qualquer filtro, preservando "admin vê tudo".
        const visibilityConfig = {
          supervisorAdmin,
          notViewAssignedTickets: getConfigValue("NotViewAssignedTickets") === "enabled",
          notViewTicketsChatBot: getConfigValue("NotViewTicketsChatBot") === "enabled",
          showGroupsForAll: getConfigValue("showGroupsForAll") !== "disabled",
          nullTickets: getConfigValue("nullTickets"),
          inboundByQueueOnly: getConfigValue("inboundByQueueOnly"),
          supervisorChannelScoped: getConfigValue("supervisorChannelScoped"),
        };

        const isVisible = (t: TicketVisibilityData & { status: string; unreadMessages?: number }) =>
          canUserSeeTicket(t, user, visibilityConfig);

        // Tickets abertos com mensagens não lidas (filtrados por regras de visibilidade)
        const openTickets = tickets.filter((t) => {
          if (t.status !== "open" || (t.unreadMessages ?? 0) <= 0) return false;
          return isVisible(t);
        });
        // Tickets pendentes na fila (sem atendente)
        const pendingTickets = tickets.filter((t) => t.status === "pending" && isVisible(t));
        const allTicketNotifications = [...openTickets, ...pendingTickets.filter((t: { id: number }) => !openTickets.some((o: { id: number }) => o.id === t.id))];

        const snapshot: Notification[] = allTicketNotifications.map((tk: { id: number; contact?: { name?: string }; lastMessage?: string; updatedAt: string; status?: string; isGroup?: boolean; unreadMessages?: number }) => ({
          id: tk.id,
          message: `${tk.contact?.name || t("notifications.contactFallback")}: ${(getSyntheticBodyLabel(tk.lastMessage, tAtd) ?? getTicketLastMessagePreview(tk.lastMessage)) || t("notifications.newMessageFallback")}`,
          read: (tk.unreadMessages ?? 0) === 0,
          createdAt: tk.updatedAt ?? new Date().toISOString(),
          ticketId: tk.id,
          ticketIsGroup: !!tk.isGroup,
          // Retrato de visibilidade: deixa a entrada ser revogada quando o atendimento muda de
          // dono/fila depois (ver lib/ticket-notification-visibility.ts).
          visibility: pickTicketVisibilityPatch(tk),
        }));

        // MERGE em vez de substituição: este effect pode rodar mais de uma vez (deps
        // tenantConfigsLoaded/supervisorAdmin) e também demora um round-trip para responder.
        // Entre o disparo e a resposta — ou entre duas execuções — os hooks de socket já podem
        // ter posto notificações novas no store (ticket:create / mensagem recebida). Um
        // setNotifications cru com o resultado do REST apagaria justamente essas entradas, que
        // são as MAIS recentes e nunca voltariam (o socket não reemite evento passado).
        //
        // O estado é lido por getState() e não pela variável `notifications` do render: assim o
        // valor é o do momento da resposta (não o capturado no fechamento) e, principalmente,
        // `notifications` NÃO precisa entrar nas deps — como o effect chama setNotifications,
        // essa dep criaria loop infinito.
        const current = useNotificationStore.getState().notifications;
        const keyOf = (n: Notification) => n.ticketId ?? n.id;
        const snapshotKeys = new Set(snapshot.map(keyOf));
        // Chaves que o store considera NÃO lidas. Uma mensagem que chegou pelo socket e ainda não
        // foi aberta não pode virar "lida" só porque o REST respondeu unreadMessages = 0 — a
        // contagem do backend pode ser anterior a essa mensagem (ou o socket ter chegado antes).
        const unreadKeys = new Set(current.filter((n) => !n.read).map(keyOf));
        setNotifications([
          // Entradas que só existem no store (chegaram por socket, ou vieram de uma página
          // seguinte que o snapshot da página 1 não cobre) são preservadas no topo — mesma
          // posição em que o addNotification as coloca.
          ...current.filter((n) => !snapshotKeys.has(keyOf(n))),
          // Nas que existem nos dois, o snapshot manda (texto, data, ordem), exceto por read:
          // ele nunca regride de não lida para lida.
          ...snapshot.map((n) => (unreadKeys.has(keyOf(n)) ? { ...n, read: false } : n)),
        ]);
      })
      .catch(() => {});
  }, [user?.userId, user?.profile, tenantConfigsLoaded, supervisorAdmin, supervisorViewDept, setNotifications]);

  // Revalida as entradas de atendimento do sino com a MESMA regra que as criou: ao abrir o sino e
  // sempre que muda o que decide a visibilidade (filas/canais do usuário — renovados a cada 30 s —
  // e a opção de não ver atendimentos de outros). O evento de socket já revoga na hora; isto cobre
  // o evento perdido em queda de conexão e a opção ligada com a aba aberta. Só mexe no store
  // quando alguma entrada de fato sai.
  const notViewAssignedForSweep = getConfigValue("NotViewAssignedTickets");
  useEffect(() => {
    if (!user?.userId || !tenantConfigsLoaded) return;
    sweepTicketNotifications();
  }, [notificationsOpen, user?.userId, user?.queues, user?.whatsappAllowed, tenantConfigsLoaded, notViewAssignedForSweep]);

  const refreshChatUnreadCount = useCallback(() => {
    Promise.all([fetchUnreadCounts(), fetchUnreadGroupCounts()])
      .then(([privateRes, groupRes]) => {
        const privateCount = Number((privateRes.data as { count?: number })?.count) || 0;
        const groupData = groupRes.data as { count?: number | { count?: number } };
        const groupCount = Number(groupData?.count && typeof groupData.count === "object" ? groupData.count?.count : groupData?.count) || 0;
        setChatUnreadCount(privateCount + groupCount);
      })
      .catch(() => {});
  }, [setChatUnreadCount]);

  const loadConvites = useCallback(async () => {
    setLoadingConvites(true);
    try {
      const { data } = await fetchTicketSharedByUser();
      const raw = data as unknown;
      const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.data;
      setConvitesList(Array.isArray(arr) ? arr : []);
    } catch {
      setConvitesList([]);
    } finally {
      setLoadingConvites(false);
    }
  }, []);

  const handleRemoveConvite = useCallback(async (id: number) => {
    try {
      await deleteTicketShared(id);
      setConvitesList((prev) => prev.filter((c) => c.id !== id));
      setConvitesCount((prev) => Math.max(0, prev - 1));
      toast.success(t("invites.removed"));
    } catch {
      toast.error(t("invites.errorRemoving"));
    }
  }, []);

  const handleOpenConviteTicket = useCallback((ticketId: number) => {
    setConvitesOpen(false);
    setNotificationsOpen(false);
    router.push(`/atendimento?ticketId=${ticketId}`);
  }, [router]);

  const loadMoreNotifications = useCallback(async () => {
    if (messagesLoadingMore || !messagesHasMore || !user) return;
    setMessagesLoadingMore(true);
    try {
      const nextPage = messagesPage + 1;
      const params: NonNullable<Parameters<typeof fetchTickets>[0]> = { searchParam: "", pageNumber: nextPage, status: ["open", "pending"] };
      // Mesmo filtro do snapshot inicial: sem ele o backend pagina sobre o tenant inteiro
      // e o scroll infinito do sino traria tickets fora do departamento do supervisor.
      if (supervisorViewDept) params.supervisorViewDept = "true";
      const res = await fetchTickets(params);
      const raw = (res.data as Record<string, unknown>)?.tickets ?? [];
      const tickets = normalizeTickets(Array.isArray(raw) ? raw : []);
      const hasMore = Boolean((res.data as Record<string, unknown>)?.hasMore) || tickets.length >= 30;
      const visibilityConfig = {
        supervisorAdmin,
        notViewAssignedTickets: getConfigValue("NotViewAssignedTickets") === "enabled",
        notViewTicketsChatBot: getConfigValue("NotViewTicketsChatBot") === "enabled",
        showGroupsForAll: getConfigValue("showGroupsForAll") !== "disabled",
        nullTickets: getConfigValue("nullTickets"),
        inboundByQueueOnly: getConfigValue("inboundByQueueOnly"),
        supervisorChannelScoped: getConfigValue("supervisorChannelScoped"),
      };
      const isVisible = (tk: TicketVisibilityData & { status: string; unreadMessages?: number }) =>
        canUserSeeTicket(tk, user, visibilityConfig);
      const visible = tickets.filter((tk) => {
        if (tk.status === "open" && (tk.unreadMessages ?? 0) > 0) return isVisible(tk);
        if (tk.status === "pending") return isVisible(tk);
        return false;
      });
      const existingIds = new Set(notifications.map((n) => n.id));
      const newOnes = visible
        .filter((tk: { id: number }) => !existingIds.has(tk.id))
        .map((tk: { id: number; contact?: { name?: string }; lastMessage?: string; updatedAt: string; status?: string; isGroup?: boolean; unreadMessages?: number }) => ({
          id: tk.id,
          message: `${tk.contact?.name || t("notifications.contactFallback")}: ${(getSyntheticBodyLabel(tk.lastMessage, tAtd) ?? getTicketLastMessagePreview(tk.lastMessage)) || t("notifications.newMessageFallback")}`,
          read: (tk.unreadMessages ?? 0) === 0,
          createdAt: tk.updatedAt ?? new Date().toISOString(),
          ticketId: tk.id,
          ticketIsGroup: !!tk.isGroup,
          visibility: pickTicketVisibilityPatch(tk),
        }));
      if (newOnes.length > 0) setNotifications([...notifications, ...newOnes]);
      setMessagesPage(nextPage);
      setMessagesHasMore(hasMore && newOnes.length > 0);
    } catch { /* empty */ }
    finally { setMessagesLoadingMore(false); }
  }, [messagesLoadingMore, messagesHasMore, messagesPage, notifications, setNotifications, user, supervisorAdmin, supervisorViewDept, getConfigValue, t]);

  const handleNotificationClick = async (n: {
    id: number;
    ticketId?: number;
    ticketIsGroup?: boolean;
    read: boolean;
    internalContactId?: number;
    internalIsGroup?: boolean;
    internalGroupId?: number;
  }) => {
    if (n.ticketId) {
      // Revalida no clique: entrada de atendimento que o usuário deixou de poder ver (aceito ou
      // transferido para outro atendente depois do aviso) sai do sino e não navega. Sem dado
      // local para decidir o clique segue — o guard do backend responde "sem acesso" ao abrir.
      if (revokeTicketNotificationOnClick(n.ticketId)) {
        toast.error(tAtdChat("noTicketAccess"));
        return;
      }
    }
    if (!n.read) markAsRead(n.id);
    if (n.ticketId) {
      const tab = n.ticketIsGroup ? "groups" : "private";
      router.push(`/atendimento?ticketId=${n.ticketId}&tab=${tab}`);
      setNotificationsOpen(false);
      return;
    }
    if (user?.userId) {
      try {
        await markNotificationAsRead(n.id, user.userId);
      } catch {
        // já atualizamos localmente
      }
    }
    const params = new URLSearchParams();
    if (n.internalIsGroup && (n.internalGroupId != null || n.internalContactId != null))
      params.set("groupId", String(n.internalGroupId ?? n.internalContactId));
    else if (n.internalContactId != null) params.set("contactId", String(n.internalContactId));
    router.push(`/chat-privado${params.toString() ? `?${params.toString()}` : ""}`);
    setNotificationsOpen(false);
  };

  // Socket: receber novas notificações internas em real-time e adicionar ao store.
  // Vai para internalNotifications (lista do sininho) — não para a lista de tickets —
  // e abre o popup de leitura na hora, sem esperar F5 (espelha o auto-open do mount).
  useNotificationSocket({
    onNotification: (n) => {
      const mapped = {
        id: n.id,
        message: n.message,
        read: false,
        createdAt: n.createdAt ?? new Date().toISOString(),
        source: n.source ?? null,
      };
      addInternalNotification(mapped);
      if (user?.profile !== "superadmin" && !systemDetailItem && !pendingSystemNotif) {
        if (isTourPendingOrActive()) {
          setPendingSystemNotif(mapped);
        } else {
          setSystemDetailItem(mapped);
        }
      }
    },
  });

  // Socket: convites de tickets compartilhados — refresh em tempo real
  useTicketSharedSocket({
    onCreate: () => {
      fetchTicketSharedByUser()
        .then((res) => {
          const raw = res.data as unknown;
          const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.data;
          const list = Array.isArray(arr) ? arr : [];
          setConvitesCount(list.length);
          if (convitesLoadedRef.current) {
            setConvitesList(list as { id: number; ticketId?: number; ticket?: { id?: number; contact?: { name?: string } }; contact?: { name?: string } }[]);
          }
        })
        .catch(() => {});
    },
    onDelete: (p) => {
      setConvitesCount((prev) => Math.max(0, prev - 1));
      setConvitesList((prev) => prev.filter((c) => c.id !== p.id && c.ticketId !== p.ticketId));
    },
  });

  useGoogleAuthExpiredSocket({
    onExpired: ({ service, whatsappId }) => {
      if (isSuperAdmin) return;
      const titleKey =
        service === "gmail"
          ? "googleAuthExpiredGmailTitle"
          : service === "youtube"
          ? "googleAuthExpiredYoutubeTitle"
          : "googleAuthExpiredCalendarTitle";
      const descKey =
        service === "gmail"
          ? "googleAuthExpiredGmailDescription"
          : service === "youtube"
          ? "googleAuthExpiredYoutubeDescription"
          : "googleAuthExpiredCalendarDescription";
      const route =
        service === "calendar"
          ? "/configuracoes/google-calendar?reconnect=true"
          : `/sessoes?reconnect=${service}${whatsappId ? `&id=${whatsappId}` : ""}`;
      toast.error(t(titleKey), {
        id: `google-auth-expired-${service}`,
        description: t(descKey),
        duration: Infinity,
        action: {
          label: t("googleAuthExpiredAction"),
          onClick: () => router.push(route),
        },
      });
    },
  });

  useChannelAuthExpiredSocket({
    onExpired: ({ service, whatsappId }) => {
      if (isSuperAdmin) return;
      const channelLabel = t(`channelAuthExpiredService_${service}` as any);
      toast.error(t("channelAuthExpiredTitle", { channel: channelLabel }), {
        id: `channel-auth-expired-${service}-${whatsappId}`,
        description: t("channelAuthExpiredDescription", { channel: channelLabel }),
        duration: Infinity,
        action: {
          label: t("channelAuthExpiredAction"),
          onClick: () =>
            router.push(`/sessoes?reconnect=${service}${whatsappId ? `&id=${whatsappId}` : ""}`),
        },
      });
    },
  });

  const handleMarkAllTicketAsRead = () => {
    markAllTicketAsRead();
    setTickets(storeTickets.map((t) => ({ ...t, unreadMessages: 0 })));
    updateAllUnreadMessages().catch(() => {});
  };

  const handleMarkAllChatAsRead = () => {
    setChatUnreadCount(0);
    markAllChatAsRead().then(() => {
      refreshChatUnreadCount();
    }).catch(() => {});
  };

  const handleMarkAllAsRead = () => {
    if (user?.userId) {
      markAllInternalAsRead(user.userId).catch(() => {});
    }
    markAllAsRead();
  };

  const ticketUnreadCount = notifications.filter((n) => !n.read).length;
  const ticketNotifications = notifications.filter((n) => n.ticketId);
  const systemUnreadCount = internalNotifications.filter((n) => !n.read).length;

  const allNotifications = [
    ...notifications.map((n) => ({ ...n, fromTicket: true })),
    ...internalNotifications.map((n) => ({ ...n, fromTicket: false })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 px-3 md:px-6">
        <div className="flex items-center gap-2 md:gap-4 flex-1">
          {/* Hamburger — only visible on mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden shrink-0"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label={t("openMenu")}
          >
            <Menu className="h-5 w-5" />
          </Button>
          {/* Mobile search trigger */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden shrink-0"
            onClick={() => window.dispatchEvent(new Event("openCommandPalette"))}
          >
            <Search className="h-4 w-4" />
          </Button>
          <button
            id="tour-header-search"
            data-tour="header-search"
            className="relative max-w-md flex-1 hidden md:flex h-9 items-center gap-2 rounded-md border border-border/50 bg-muted/50 px-3 text-sm text-muted-foreground hover:bg-muted/80 transition-colors"
            onClick={() => window.dispatchEvent(new Event("openCommandPalette"))}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left truncate">{t("searchPlaceholder")}</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] sm:flex">
              {isMac ? (
                <>
                  <span className="text-xs">⌘</span>K
                </>
              ) : (
                "Ctrl+K"
              )}
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Health Dot */}
          <HealthDot connected={isOnline} />

          {/* Socket otimizado ativo */}
          {socketModelOptimized && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center cursor-default">
                  <Zap className="h-3.5 w-3.5 text-amber-400 fill-amber-400 animate-pulse" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {t("socketOptimizedActive")}
              </TooltipContent>
            </Tooltip>
          )}

          {/* LocaleSwitcher — desktop only */}
          <span className="hidden md:inline-flex"><LocaleSwitcher /></span>

          {/* Live presentation mode toggle (only renders if env flag enabled) */}
          <LiveModeToggle />

          {/* Notificações */}
          {!isSuperAdmin && (() => {
            const tasksCount = tasksList.length;
            const systemCount = internalNotifications.length;
            const summaryCount = (convitesCount > 0 ? 1 : 0) + (chatUnread > 0 ? 1 : 0) + (ticketUnreadCount > 0 ? 1 : 0) + (tasksCount > 0 ? 1 : 0) + (systemCount > 0 ? 1 : 0);
            const messagesCount = ticketNotifications.length;
            const footerAction = () => {
              if (notificationsTab === "messages") {
                if (ticketUnreadCount > 0) handleMarkAllTicketAsRead();
                return;
              }
              if (ticketUnreadCount > 0) handleMarkAllTicketAsRead();
              if (chatUnread > 0) handleMarkAllChatAsRead();
            };
            const footerDisabled =
              notificationsTab === "messages"
                ? ticketUnreadCount === 0
                : ticketUnreadCount === 0 && chatUnread === 0;
            return (
            <Popover open={notificationsOpen} onOpenChange={(open) => {
              setNotificationsOpen(open);
              if (open) refreshChatUnreadCount();
              if (!open) {
                setChatPreviewOpen(false);
                chatPreviewLoadedRef.current = false;
                setConvitesOpen(false);
                convitesLoadedRef.current = false;
                setTasksExpandOpen(false);
                setSystemExpandOpen(false);
                setPendingExpandOpen(false);
              }
            }}>
              <PopoverTrigger asChild>
                <Button id="tour-header-bell" data-tour="header-bell" variant="ghost" size="icon" className="relative h-9 w-9">
                  <Bell className="h-4 w-4" />
                  {totalBadge > 0 && (
                    <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full px-1 text-[9px]">
                      {totalBadge > 99 ? "99+" : totalBadge}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                collisionPadding={8}
                className="w-[calc(100vw-1rem)] max-w-96 sm:w-96 p-0 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{t("notifications.title")}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={t("notifications.close")}
                    onClick={() => setNotificationsOpen(false)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Tabs */}
                <Tabs
                  value={notificationsTab}
                  onValueChange={(v) => {
                    const next = v as typeof notificationsTab;
                    setNotificationsTab(next);
                    if (next === "tutorials" && !tutorialsLoadedRef.current) {
                      tutorialsLoadedRef.current = true;
                      setTutorialsLoading(true);
                      fetchTutorials({ pageNumber: 1, pageSize: 999 })
                        .then(({ data }) => setTutorialsList((data?.tutorials ?? []).filter((tu) => tu.isActive)))
                        .catch(() => setTutorialsList([]))
                        .finally(() => setTutorialsLoading(false));
                    }
                  }}
                  className="w-full"
                >
                  <div className="px-3 pt-3">
                    <TabsList className={cn("grid w-full h-9", hasActiveTutorials ? "grid-cols-3" : "grid-cols-2")}>
                      <TabsTrigger value="summary" className="text-xs gap-1.5">
                        {t("notifications.tabs.summary")}
                        {summaryCount > 0 && (
                          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1">
                            {summaryCount}
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="messages" className="text-xs gap-1.5">
                        {t("notifications.tabs.messages")}
                        {messagesCount > 0 && (
                          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1">
                            {messagesCount > 99 ? "99+" : messagesCount}
                          </span>
                        )}
                      </TabsTrigger>
                      {hasActiveTutorials && (
                        <TabsTrigger value="tutorials" className="text-xs gap-1.5">
                          {t("notifications.tabs.tutorials")}
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>

                  {/* Resumo */}
                  <TabsContent value="summary" className="mt-0 p-2 max-h-[380px] overflow-y-auto">
                    {summaryCount === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                        <Inbox className="h-8 w-8 opacity-40" />
                        <span className="text-sm">{t("notifications.empty.summary")}</span>
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {convitesCount > 0 && (
                          <li>
                            <button
                              type="button"
                              aria-expanded={convitesOpen}
                              onClick={() => {
                                const next = !convitesOpen;
                                setConvitesOpen(next);
                                if (next && !convitesLoadedRef.current) {
                                  convitesLoadedRef.current = true;
                                  loadConvites();
                                }
                              }}
                              className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 transition-colors text-left"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-500">
                                <Share2 className="h-4 w-4" />
                              </span>
                              <span className="flex-1 text-sm">{t("notifications.sharedTickets")}</span>
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">
                                {convitesCount > 99 ? "99+" : convitesCount}
                              </span>
                              {convitesOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              )}
                            </button>
                            {convitesOpen && (
                              <div className="mt-1 ml-11 mr-1 pl-2 border-l border-border/60 flex flex-col gap-1">
                                {loadingConvites ? (
                                  <>
                                    <div className="h-10 rounded-md bg-muted/50 animate-pulse" />
                                    <div className="h-10 rounded-md bg-muted/50 animate-pulse" />
                                  </>
                                ) : convitesList.length === 0 ? (
                                  <span className="text-xs text-muted-foreground py-2">
                                    {t("invites.noInvites")}
                                  </span>
                                ) : (
                                  convitesList.map((c) => {
                                    const ticketId = c.ticketId ?? c.ticket?.id ?? 0;
                                    const name = c.ticket?.contact?.name ?? c.contact?.name ?? `Ticket #${ticketId}`;
                                    return (
                                      <div
                                        key={c.id}
                                        className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted/60 transition-colors"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => ticketId && handleOpenConviteTicket(ticketId)}
                                          className="flex-1 min-w-0 text-left text-xs truncate"
                                        >
                                          {name}
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={t("invites.remove")}
                                          onClick={(e) => { e.stopPropagation(); handleRemoveConvite(c.id); }}
                                          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                        >
                                          <XCircle className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </li>
                        )}
                        {chatUnread > 0 && (
                          <li>
                            <button
                              type="button"
                              aria-expanded={chatPreviewOpen}
                              onClick={() => {
                                const next = !chatPreviewOpen;
                                setChatPreviewOpen(next);
                                if (next && !chatPreviewLoadedRef.current) {
                                  chatPreviewLoadedRef.current = true;
                                  setChatPreviewLoading(true);
                                  fetchUnreadPreview(5)
                                    .then((res) => setChatPreviewItems(res.data?.items ?? []))
                                    .catch(() => setChatPreviewItems([]))
                                    .finally(() => setChatPreviewLoading(false));
                                }
                              }}
                              className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 transition-colors text-left"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-500">
                                <MessageSquare className="h-4 w-4" />
                              </span>
                              <span className="flex-1 text-sm">{t("notifications.unreadChatMessages")}</span>
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">
                                {chatUnread > 99 ? "99+" : chatUnread}
                              </span>
                              {chatPreviewOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              )}
                            </button>
                            {chatPreviewOpen && (
                              <div className="mt-1 ml-11 mr-1 pl-2 border-l border-border/60 flex flex-col gap-1">
                                {chatPreviewLoading ? (
                                  <>
                                    <div className="h-12 rounded-md bg-muted/50 animate-pulse" />
                                    <div className="h-12 rounded-md bg-muted/50 animate-pulse" />
                                    <div className="h-12 rounded-md bg-muted/50 animate-pulse" />
                                  </>
                                ) : chatPreviewItems.length === 0 ? (
                                  <span className="text-xs text-muted-foreground py-2">
                                    {t("notifications.empty.messages")}
                                  </span>
                                ) : (
                                  <>
                                    {chatPreviewItems.map((item) => {
                                      const initials = (item.name || "?").trim().slice(0, 2).toUpperCase();
                                      const preview = item.lastMessage.text
                                        || (item.lastMessage.mediaType ? `[${item.lastMessage.mediaType}]` : "");
                                      const when = item.lastMessage.createdAt
                                        ? new Date(item.lastMessage.createdAt).toLocaleTimeString(
                                            "pt-BR",
                                            { hour: "2-digit", minute: "2-digit" },
                                          )
                                        : "";
                                      return (
                                        <button
                                          key={`${item.type}-${item.peerId}`}
                                          type="button"
                                          onClick={() => {
                                            const qs = item.type === "group"
                                              ? `?groupId=${item.peerId}`
                                              : `?userId=${item.peerId}`;
                                            router.push(`/chat-privado${qs}`);
                                            setNotificationsOpen(false);
                                          }}
                                          className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors text-left"
                                        >
                                          <Avatar className="h-7 w-7 shrink-0">
                                            {item.avatarUrl && <AvatarImage src={item.avatarUrl} alt={item.name} />}
                                            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                                          </Avatar>
                                          <span className="flex-1 min-w-0">
                                            <span className="flex items-center justify-between gap-2">
                                              <span className="text-xs font-medium truncate">{item.name}</span>
                                              <span className="text-[10px] text-muted-foreground shrink-0">{when}</span>
                                            </span>
                                            <span className="block text-[11px] text-muted-foreground line-clamp-1">{preview}</span>
                                          </span>
                                          {item.unreadCount > 0 && (
                                            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500/15 text-blue-500 px-1 text-[10px] font-semibold shrink-0">
                                              {item.unreadCount > 99 ? "99+" : item.unreadCount}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                    <button
                                      type="button"
                                      onClick={() => { router.push("/chat-privado"); setNotificationsOpen(false); }}
                                      className="text-xs text-primary hover:underline px-2 py-1 text-left"
                                    >
                                      {t("notifications.viewAll")}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </li>
                        )}
                        {ticketUnreadCount > 0 && (
                          <li>
                            <button
                              type="button"
                              aria-expanded={pendingExpandOpen}
                              onClick={() => setPendingExpandOpen((v) => !v)}
                              className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 transition-colors text-left"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-500">
                                <Clock className="h-4 w-4" />
                              </span>
                              <span className="flex-1 text-sm">{t("notifications.pendingClients")}</span>
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">
                                {ticketUnreadCount > 99 ? "99+" : ticketUnreadCount}
                              </span>
                              {pendingExpandOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              )}
                            </button>
                            {pendingExpandOpen && (
                              <div className="mt-1 ml-11 mr-1 pl-2 border-l border-border/60 flex flex-col gap-1">
                                {ticketNotifications.slice(0, 5).map((n) => (
                                  <button
                                    key={`pend-${n.id}`}
                                    type="button"
                                    onClick={() => handleNotificationClick(n)}
                                    className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors text-left"
                                  >
                                    {!n.read && (
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                                    )}
                                    <span className={cn("flex-1 min-w-0", n.read && "pl-[14px]")}>
                                      <span className={cn("block text-xs line-clamp-2", !n.read && "font-medium")}>{n.message}</span>
                                      {n.createdAt && (
                                        <span className="block text-[10px] text-muted-foreground mt-0.5">
                                          {new Date(n.createdAt).toLocaleString("pt-BR")}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                ))}
                                {ticketNotifications.length > 5 && (
                                  <button
                                    type="button"
                                    onClick={() => setNotificationsTab("messages")}
                                    className="text-xs text-primary hover:underline px-2 py-1 text-left"
                                  >
                                    {t("notifications.viewAllInMessages")}
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        )}
                        {tasksCount > 0 && (
                          <li>
                            <button
                              type="button"
                              aria-expanded={tasksExpandOpen}
                              onClick={() => setTasksExpandOpen((v) => !v)}
                              className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 transition-colors text-left"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-500">
                                <ClipboardList className="h-4 w-4" />
                              </span>
                              <span className="flex-1 text-sm">{t("notifications.pendingTasks")}</span>
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">
                                {tasksCount > 99 ? "99+" : tasksCount}
                              </span>
                              {tasksExpandOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              )}
                            </button>
                            {tasksExpandOpen && (
                              <div className="mt-1 ml-11 mr-1 pl-2 border-l border-border/60 flex flex-col gap-1">
                                {tasksList.slice(0, 5).map((task) => {
                                  const dotColor = task.priority === "high" ? "bg-destructive"
                                    : task.priority === "medium" ? "bg-warning"
                                    : task.priority === "low" ? "bg-success" : "bg-muted-foreground/40";
                                  return (
                                    <button
                                      key={task.id}
                                      type="button"
                                      onClick={() => setTasksDetailItem(task)}
                                      className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors text-left"
                                    >
                                      <span className={cn("mt-1 h-2 w-2 rounded-full shrink-0", dotColor)} />
                                      <span className="flex-1 min-w-0">
                                        <span className={cn("block text-xs font-medium truncate", task.status === "delayed" && "text-destructive")}>{task.name}</span>
                                        {task.limitDate && (
                                          <span className="block text-[10px] text-muted-foreground">
                                            {t("tasks.deadline")}: {new Date(task.limitDate).toLocaleDateString()}
                                          </span>
                                        )}
                                      </span>
                                    </button>
                                  );
                                })}
                                {tasksList.length > 5 && (
                                  <button
                                    type="button"
                                    onClick={() => { setTasksOpen(true); setNotificationsOpen(false); }}
                                    className="text-xs text-primary hover:underline px-2 py-1 text-left"
                                  >
                                    {t("notifications.viewAll")}
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        )}
                        {systemCount > 0 && (
                          <li>
                            <button
                              type="button"
                              aria-expanded={systemExpandOpen}
                              onClick={() => setSystemExpandOpen((v) => !v)}
                              className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 transition-colors text-left"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sky-500">
                                <Mail className="h-4 w-4" />
                              </span>
                              <span className="flex-1 text-sm">{t("notifications.systemNotifications")}</span>
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">
                                {systemUnreadCount > 0
                                  ? (systemUnreadCount > 99 ? "99+" : systemUnreadCount)
                                  : (systemCount > 99 ? "99+" : systemCount)}
                              </span>
                              {systemExpandOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
                              )}
                            </button>
                            {systemExpandOpen && (
                              <div className="mt-1 ml-11 mr-1 pl-2 border-l border-border/60 flex flex-col gap-1">
                                {internalNotifications.slice(0, 5).map((n) => {
                                  const decoded = decodeInternalMessage(n.message);
                                  const preview = decoded.isHtml
                                    ? htmlToPreviewText(decoded.content)
                                    : decoded.content;
                                  return (
                                    <button
                                      key={`sys-${n.id}`}
                                      type="button"
                                      onClick={() => setSystemDetailItem(n)}
                                      className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors text-left"
                                    >
                                      {!n.read && (
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                                      )}
                                      <span className={cn("flex-1 min-w-0", n.read && "pl-[14px]")}>
                                        <span className={cn("block text-xs line-clamp-2", !n.read && "font-medium")}>{preview}</span>
                                        <span className="flex items-center gap-1.5 mt-0.5">
                                          {n.source === "chatflow" && (
                                            <span className="inline-flex items-center rounded bg-violet-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-violet-500">
                                              {t("internalMessages.viaChatbot")}
                                            </span>
                                          )}
                                          {n.source === "ai_credits" && (
                                            <span className="inline-flex items-center rounded bg-amber-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                              {t("internalMessages.viaAiCredits")}
                                            </span>
                                          )}
                                          {n.source === "ai_platform" && (
                                            <span className="inline-flex items-center rounded bg-sky-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                                              {t("internalMessages.viaAiPlatform")}
                                            </span>
                                          )}
                                          {n.createdAt && (
                                            <span className="text-[10px] text-muted-foreground">
                                              {new Date(n.createdAt).toLocaleString("pt-BR")}
                                            </span>
                                          )}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </li>
                        )}
                      </ul>
                    )}
                  </TabsContent>

                  {/* Mensagens */}
                  <TabsContent
                    value="messages"
                    className="mt-0 p-0 max-h-[380px] overflow-y-auto"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
                        loadMoreNotifications();
                      }
                    }}
                  >
                    {messagesCount === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 opacity-40" />
                        <span className="text-sm">{t("notifications.empty.messages")}</span>
                      </div>
                    ) : (
                      <ul className="flex flex-col py-1">
                        {ticketNotifications.map((n) => (
                          <li key={`t-${n.id}`}>
                            <button
                              type="button"
                              onClick={() => handleNotificationClick(n)}
                              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
                            >
                              {!n.read && (
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                              )}
                              <div className={cn("flex-1 min-w-0", n.read && "pl-[14px]")}>
                                <span className={cn("text-sm line-clamp-2 break-words", !n.read && "font-medium")}>{n.message}</span>
                                <span className="block text-[11px] text-muted-foreground mt-0.5">
                                  {n.createdAt ? new Date(n.createdAt).toLocaleString("pt-BR") : ""}
                                </span>
                              </div>
                            </button>
                          </li>
                        ))}
                        {messagesLoadingMore && (
                          <li className="flex items-center justify-center py-3">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </li>
                        )}
                      </ul>
                    )}
                  </TabsContent>

                  {/* Tutoriais */}
                  {hasActiveTutorials && (
                    <TabsContent value="tutorials" className="mt-0 p-2 max-h-[380px] overflow-y-auto">
                      {tutorialsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : tutorialsList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                          <BookOpen className="h-8 w-8 opacity-40" />
                          <span className="text-sm">{t("tutorials.noTutorials")}</span>
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {tutorialsList.map((tu) => (
                            <li key={tu.id}>
                              <a
                                href={tu.link || "#"}
                                target={tu.link ? "_blank" : undefined}
                                rel={tu.link ? "noopener noreferrer" : undefined}
                                className="flex items-start gap-2.5 rounded-md border p-2 hover:bg-muted/60 transition-colors"
                              >
                                {tu.thumbnailUrl ? (
                                  <img
                                    src={tu.thumbnailUrl}
                                    alt={tu.title}
                                    className="h-12 w-12 sm:h-14 sm:w-14 rounded object-cover shrink-0"
                                    onError={(e) => { (e.target as HTMLImageElement).src = "/logo.png"; }}
                                  />
                                ) : (
                                  <div className="h-12 w-12 sm:h-14 sm:w-14 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                    <PlayCircle className="h-5 w-5 text-primary" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium line-clamp-1">{tu.title}</p>
                                  {tu.description && (
                                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{tu.description}</p>
                                  )}
                                  {tu.link && (
                                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary">
                                      <PlayCircle className="h-3 w-3" /> {t("tutorials.watch")}
                                    </span>
                                  )}
                                </div>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TabsContent>
                  )}

                </Tabs>

                {/* Footer — só na aba Mensagens */}
                {notificationsTab === "messages" && (
                  <div className="border-t px-2 py-2">
                    <button
                      type="button"
                      onClick={footerAction}
                      disabled={footerDisabled}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                    >
                      <CheckCheck className="h-4 w-4" />
                      {t("notifications.markAllRead")}
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            );
          })()}

          {/* Secondary buttons — desktop only (hidden on mobile) */}
          <div className="hidden md:flex items-center gap-1">
            {/* Nova Conversa */}
            {!isSuperAdmin && !isRestrictedUser && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button id="tour-header-new-conversation" data-tour="header-new-conversation" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSendMsgOpen(true)}>
                    <Send className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("tooltips.newConversation")}</TooltipContent>
              </Tooltip>
            )}

            {/* Telefonia: SIP + WaVoIP simultâneos → um só dropdown "Chamadas"
                (reduz overflow do header); apenas um visível → botão direto,
                comportamento atual. Gates showSipBtn/showWavoipBtn intactos. */}
            {showSipBtn && showWavoipBtn ? (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{t("tooltips.calls")}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => toggleWebphone()}>
                    <Phone className="mr-2 h-4 w-4" /> {t("tooltips.webphoneSip")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleWavoipWidget}>
                    <PhoneCall className="mr-2 h-4 w-4" /> {t("tooltips.wavoip")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                {/* WebPhone SIP */}
                {showSipBtn && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => toggleWebphone()}>
                        <Phone className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("tooltips.webphoneSip")}</TooltipContent>
                  </Tooltip>
                )}

                {/* WaVoIP */}
                {showWavoipBtn && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleWavoipWidget}>
                        <PhoneCall className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("tooltips.wavoip")}</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}

            {/* Support Chat — tenant user */}
            {!isSuperAdmin && supportChatEnabled && (
              <SupportChatButton />
            )}

            {/* Support Chat — superadmin notification button */}
            {isSuperAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 relative">
                    <Headset className="h-4 w-4" />
                    {adminSupportUnread > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full px-1 text-[9px]"
                      >
                        {adminSupportUnread > 99 ? "99+" : adminSupportUnread}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>{tAdmin("dropdownTitle")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {supportUsers.filter((u) => u.unreadCount > 0).length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {tAdmin("dropdownNoUnread")}
                    </div>
                  ) : (
                    <div className="max-h-[360px] overflow-y-auto">
                      {[...supportUsers]
                        .filter((u) => u.unreadCount > 0)
                        .sort((a, b) => b.unreadCount - a.unreadCount)
                        .map((u) => (
                          <DropdownMenuItem
                            key={`${u.tenantId}:${u.userId}`}
                            className="flex items-center gap-3 py-3 cursor-pointer"
                            onClick={() => {
                              setActiveConversation({ tenantId: u.tenantId, userId: u.userId });
                              router.push("/suporte-chat");
                            }}
                          >
                            <Avatar className="h-9 w-9 shrink-0">
                              {u.profilePicture && <AvatarImage src={u.profilePicture} />}
                              <AvatarFallback className="text-xs">
                                {u.userName.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <p className="text-sm font-medium truncate">{u.userName}</p>
                                <span className="text-xs opacity-60 shrink-0">{u.tenantName}</span>
                              </div>
                              {(u.lastMessageText || u.lastMessageMediaType) && (
                                <p className="text-xs opacity-70 truncate">
                                  {u.lastMessageFromSuperadmin ? "↩ " : ""}
                                  {u.lastMessageText || (u.lastMessageMediaType === "image" ? "📷" : u.lastMessageMediaType === "audio" ? "🎵" : u.lastMessageMediaType === "video" ? "🎬" : "📎")}
                                </p>
                              )}
                            </div>
                            <Badge variant="destructive" className="h-5 min-w-[20px] rounded-full px-1.5 text-[10px] shrink-0">
                              {u.unreadCount > 99 ? "99+" : u.unreadCount}
                            </Badge>
                          </DropdownMenuItem>
                        ))}
                    </div>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-primary focus:bg-primary/10 justify-center text-sm"
                    onClick={() => router.push("/suporte-chat")}
                  >
                    {tAdmin("dropdownViewAll")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Web Push */}
            {!isSuperAdmin && <PushNotifications />}
          </div>

          {/* Mobile "More" dropdown — consolidates secondary actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden relative">
                <MoreHorizontal className="h-4 w-4" />
                {(systemUnreadCount > 0 || (isSuperAdmin && adminSupportUnread > 0)) && (
                  <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full px-1 text-[9px]">
                    {isSuperAdmin ? (adminSupportUnread > 9 ? "9+" : adminSupportUnread) : (systemUnreadCount > 9 ? "9+" : systemUnreadCount)}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-0 w-auto" onCloseAutoFocus={() => setMobileLocaleOpen(false)}>
              {/* Language switcher — inline toggle (no submenu) */}
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); setMobileLocaleOpen((v) => !v); }}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Languages className="h-4 w-4" />
                  {localeNames[locale as Locale] ?? locale.toUpperCase()}
                </span>
                <span className="text-muted-foreground text-xs">{mobileLocaleOpen ? "▲" : "▼"}</span>
              </DropdownMenuItem>
              {mobileLocaleOpen && (
                <>
                  {locales.map((loc) => (
                    <DropdownMenuItem
                      key={loc}
                      onSelect={() => { setLocale(loc as Locale); setMobileLocaleOpen(false); }}
                      className="flex items-center justify-between pl-8"
                    >
                      <span>{localeNames[loc]}</span>
                      {locale === loc && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {!isSuperAdmin && <DropdownMenuSeparator />}

              {/* Non-superadmin actions */}
              {!isSuperAdmin && (
                <>
                  {!isRestrictedUser && (
                    <DropdownMenuItem onClick={() => setSendMsgOpen(true)}>
                      <Send className="mr-2 h-4 w-4" /> {t("tooltips.newConversation")}
                    </DropdownMenuItem>
                  )}
                  {showSipBtn && (
                    <DropdownMenuItem onClick={() => toggleWebphone()}>
                      <Phone className="mr-2 h-4 w-4" /> {t("tooltips.webphoneSip")}
                    </DropdownMenuItem>
                  )}
                  {showWavoipBtn && (
                    <DropdownMenuItem onClick={toggleWavoipWidget}>
                      <PhoneCall className="mr-2 h-4 w-4" /> {t("tooltips.wavoip")}
                    </DropdownMenuItem>
                  )}
                  {supportChatEnabled && (
                    <DropdownMenuItem onClick={() => setMobileSupportChatOpen(true)}>
                      <Headset className="mr-2 h-4 w-4" />
                      {t("tooltips.supportChat")}
                      {supportChatUnread > 0 && (
                        <Badge className="ml-auto h-4 min-w-[16px] rounded-full px-1 text-[9px]">
                          {supportChatUnread > 9 ? "9+" : supportChatUnread}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                  )}
                  {isPWA && (
                    <DropdownMenuItem onClick={subscribeToPush}>
                      <BellRing className="mr-2 h-4 w-4" />
                      {subscribed ? t("tooltips.updatePushSubscription") : t("tooltips.activatePush")}
                    </DropdownMenuItem>
                  )}
                </>
              )}

              {/* Superadmin actions */}
              {isSuperAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/suporte-chat")}>
                    <Headset className="mr-2 h-4 w-4" />
                    {tAdmin("headerTooltip")}
                    {adminSupportUnread > 0 && (
                      <Badge variant="destructive" className="ml-auto h-4 min-w-[16px] rounded-full px-1 text-[9px]">
                        {adminSupportUnread > 9 ? "9+" : adminSupportUnread}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* User Menu */}
          <UserMenu onOpenActivityLog={() => setActivityLogOpen(true)} />
        </div>
      </header>

      {/* Modals */}
      <NewConversationDialog open={sendMsgOpen} onOpenChange={setSendMsgOpen} />
      <TasksModal open={tasksOpen} onOpenChange={setTasksOpen} />
      <Dialog open={!!tasksDetailItem} onOpenChange={(o) => !o && setTasksDetailItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" /> {t("tasks.detailsTitle")}
            </DialogTitle>
          </DialogHeader>
          {tasksDetailItem && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{tasksDetailItem.name}</p>
                {tasksDetailItem.description && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{tasksDetailItem.description}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {tasksDetailItem.priority && (
                  <Badge variant="secondary" className="text-[10px]">
                    <span className={cn("h-2 w-2 rounded-full mr-1.5",
                      tasksDetailItem.priority === "high" ? "bg-destructive"
                        : tasksDetailItem.priority === "medium" ? "bg-warning"
                        : tasksDetailItem.priority === "low" ? "bg-success" : "bg-muted-foreground/40")} />
                    {tasksDetailItem.priority === "high" ? t("tasks.priorityHigh")
                      : tasksDetailItem.priority === "medium" ? t("tasks.priorityMedium")
                      : tasksDetailItem.priority === "low" ? t("tasks.priorityLow")
                      : t("tasks.priorityNone")}
                  </Badge>
                )}
                <Badge variant={tasksDetailItem.status === "delayed" ? "destructive" : "secondary"} className="text-[10px]">
                  {tasksDetailItem.status === "delayed" ? t("tasks.statusDelayed")
                    : tasksDetailItem.status === "finished" || tasksDetailItem.status === "done" || tasksDetailItem.status === "completed" ? t("tasks.statusFinished")
                    : t("tasks.statusPending")}
                </Badge>
              </div>
              {tasksDetailItem.limitDate && (() => {
                const deadline = new Date(tasksDetailItem.limitDate);
                const tone = getDeadlineTone(deadline);
                const dfLocale = DATEFNS_LOCALE_MAP[locale] ?? ptBR;
                const rel = formatDistanceToNow(deadline, { locale: dfLocale, addSuffix: true });
                const relCap = rel.charAt(0).toUpperCase() + rel.slice(1);
                const absolute = deadline.toLocaleString(undefined, {
                  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                });
                const toneStyles = {
                  overdue: { border: "border-destructive/30", bg: "bg-destructive/5", icon: "text-destructive", text: "text-destructive" },
                  today: { border: "border-warning/30", bg: "bg-warning/5", icon: "text-warning", text: "text-warning" },
                  soon: { border: "border-yellow-500/30", bg: "bg-yellow-500/5", icon: "text-yellow-600 dark:text-yellow-400", text: "text-yellow-600 dark:text-yellow-400" },
                  later: { border: "border-border", bg: "bg-muted/20", icon: "text-muted-foreground", text: "text-foreground" },
                }[tone];
                return (
                  <div className={cn("flex items-center gap-2.5 rounded-lg border p-2.5", toneStyles.border, toneStyles.bg)}>
                    <Calendar className={cn("h-4 w-4 shrink-0", toneStyles.icon)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium leading-tight", toneStyles.text)}>{relCap}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{absolute}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!tasksDetailItem) return;
                try {
                  await deleteTodo(tasksDetailItem.id);
                  setTasksList((prev) => prev.filter((x) => x.id !== tasksDetailItem.id));
                  setTasksDetailItem(null);
                } catch { /* empty */ }
              }}
              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("tasks.delete")}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!tasksDetailItem) return;
                try {
                  await updateTodo(tasksDetailItem.id, { status: "finished" });
                  setTasksList((prev) => prev.filter((x) => x.id !== tasksDetailItem.id));
                  setTasksDetailItem(null);
                } catch { /* empty */ }
              }}
              className="h-8 px-3"
            >
              <Check className="h-3.5 w-3.5 mr-1" /> {t("tasks.markComplete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!systemDetailItem} onOpenChange={(o) => !o && setSystemDetailItem(null)}>
        <DialogContent
          className="sm:max-w-lg"
          // Tour ativo por cima (overlay custom, fora das layers Radix): cliques
          // no tour contam como interação "fora" deste dialog e o fechariam —
          // bloquear dismiss externo/Esc enquanto o tour estiver na tela.
          onPointerDownOutside={(e) => { if (useUIStore.getState().tourActive) e.preventDefault(); }}
          onInteractOutside={(e) => { if (useUIStore.getState().tourActive) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (useUIStore.getState().tourActive) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> {t("internalMessages.title")}
              {systemDetailItem?.source === "chatflow" && (
                <span className="inline-flex items-center rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-500">
                  {t("internalMessages.viaChatbot")}
                </span>
              )}
              {systemDetailItem?.source === "ai_credits" && (
                <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  {t("internalMessages.viaAiCredits")}
                </span>
              )}
              {systemDetailItem?.source === "ai_platform" && (
                <span className="inline-flex items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                  {t("internalMessages.viaAiPlatform")}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {systemDetailItem && (() => {
            const decoded = decodeInternalMessage(systemDetailItem.message);
            return (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {decoded.isHtml ? (
                  <NotificationIframe htmlContent={decoded.content} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{decoded.content}</p>
                )}
                {systemDetailItem.createdAt && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(systemDetailItem.createdAt).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            );
          })()}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!systemDetailItem) return;
                try {
                  await deleteNotification(systemDetailItem.id);
                } catch (err) {
                  // O interceptor (api.ts) rejeita com `error.response`, então o status
                  // fica no TOPO; `.response.status` só p/ o AxiosError cru (sem resposta).
                  const e = err as { status?: number; response?: { status?: number } };
                  const status = e?.status ?? e?.response?.status;
                  // 404 = já removida no servidor → sucesso (limpa local abaixo).
                  // 403 = sem permissão → o toast global (zpro:no-permission) já aparece,
                  // não duplicar. Demais erros: avisar em vez de engolir.
                  if (status !== 404) {
                    if (status !== 403) toast.error(tCommon("errorOccurred"));
                    return;
                  }
                }
                setInternalNotifications(
                  internalNotifications.filter((x) => x.id !== systemDetailItem.id),
                );
                setSystemDetailItem(null);
              }}
              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("internalMessages.delete")}
            </Button>
            {!systemDetailItem?.read && (
              <Button
                size="sm"
                onClick={async () => {
                  if (!systemDetailItem || !user?.userId) return;
                  try {
                    await markNotificationAsRead(systemDetailItem.id, user.userId);
                  } catch (err) {
                    // Interceptor rejeita com `error.response` → status no TOPO;
                    // `.response.status` só p/ o AxiosError cru (sem resposta).
                    const e = err as { status?: number; response?: { status?: number } };
                    const status = e?.status ?? e?.response?.status;
                    // 404 = já não existe → segue marcando local. 403 = sem permissão →
                    // toast global já aparece, não duplicar. Demais: avisar.
                    if (status !== 404) {
                      if (status !== 403) toast.error(tCommon("errorOccurred"));
                      return;
                    }
                  }
                  markInternalAsRead(systemDetailItem.id);
                  setSystemDetailItem({ ...systemDetailItem, read: true });
                }}
                className="h-8 px-3"
              >
                <Check className="h-3.5 w-3.5 mr-1" /> {t("internalMessages.markAsRead")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <UpdateNotification />
      {!isSuperAdmin && supportChatEnabled && (
        <SupportChatDrawer open={mobileSupportChatOpen} onClose={() => setMobileSupportChatOpen(false)} />
      )}

      {/* Activity Log drawer */}
      <ActivityLog open={activityLogOpen} onClose={() => setActivityLogOpen(false)} />
    </TooltipProvider>
  );
}
