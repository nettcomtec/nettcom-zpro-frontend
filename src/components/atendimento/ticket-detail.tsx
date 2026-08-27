"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { displayContactIdentity, displayContactName } from "@/lib/contact-identity";
import { formatBirthdayDisplay } from "@/lib/birthday-format";
import { closingForecastToDateInput, dateInputToClosingForecastISO } from "@/lib/opportunity-date";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User, Phone, Mail, Briefcase, Calendar, Tag, ArrowRightLeft,
  MessageSquare, Plus, ExternalLink, Copy, RotateCcw, Paperclip, FileImage,
  Pause, Play, Bot, Radio, Search, Image as ImageIcon,
  MessageSquareText, Clock, CheckCircle2, Undo2,
  Link2, FileText, Star, Share2, Filter, UserX, Ban, DollarSign,
  LayoutGrid, FileDown, Shield, ShieldCheck, RefreshCw, Wallet,
  MailOpen, List, Send, ChevronDown, PhoneCall, PhoneOutgoing, Loader2,
  Pencil, Trash2, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Meh,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn, getInitials } from "@/lib/utils";
import { linkifyParts } from "@/lib/linkify";
import { ProfilePicPreviewDialog, type ProfilePicPreview } from "@/components/shared/profile-pic-preview-dialog";
import { useLiveMode } from "@/hooks/use-live-mode";
import { useParentBridge } from "@/hooks/use-parent-bridge";
import { getReadableTextColor } from "@/lib/color-contrast";
import { ContactEditDialog } from "@/components/contatos/contact-edit-dialog";
import { ReopenConfirmDialog } from "@/components/atendimento/reopen-confirm-dialog";
import { findCrossChannelSiblingForTicket, type ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import { buildReopenNotices, type ReopenNotices } from "@/lib/reopen-notices";
import { useTicketStore } from "@/stores/ticket-store";
import type { Ticket } from "@/stores/ticket-store";
import { useWhatsappStore, type WhatsApp } from "@/stores/whatsapp-store";
import { fetchWhatsapps } from "@/services/whatsapp";
import { updateTicket, fetchTicketLogs, transferTicketChannel, transferToChatbot, pauseTicket, resumeTicket } from "@/services/tickets";
import {
  updateContactTags,
  updateContactWallet,
  updateContactBlock,
  updateContactLidFromContactId,
  migrateContact,
  updateContact,
} from "@/services/contacts";
import { sendMessage, fetchMessages, exportMessages, syncOldMessagesByUser, deleteMessage, fetchStarredMessages, sendTextWaba, sendTextInstagramMeta, sendTextMessengerMeta, sendTextDialog360, sendTextGupshup } from "@/services/messages";
import type { Message } from "@/stores/ticket-store";
import { exportChatPdf } from "@/lib/export-chat-pdf";
import { fetchWavoipCallsByTicket, createWavoipCall, updateWavoipCall, createCallNote, type WavoipCallRecord } from "@/services/wavoip";
import { initiateWabaCall, sendWabaCallPermissionRequest } from "@/services/waba-calls";
import { getWabaRtc } from "@/components/waba-call/waba-call-provider";
import { useWabaCallStore } from "@/stores/waba-call-store";
import { createCallLog, fetchCallLogs, type CallLog as CallLogRecord } from "@/services/call-logs";
import { fetchReasons, type Reason } from "@/services/reasons";
import { fetchOpportunitiesByContact, fetchPipelines, fetchStages, createOpportunity, updateOpportunity, deleteOpportunity } from "@/services/funnel";
import { fetchAllUsers } from "@/services/users";
import { listGoogleCalendarConfigs, createGoogleCalendarEvent, type GoogleCalendarConfig } from "@/services/google-calendar";
import { fetchProtocolLogs, createProtocol } from "@/services/protocols";
import { fetchPauseLogs, type PauseLog } from "@/services/pause-logs";
import { createAppointment } from "@/services/agenda";
import { fetchEvaluationLogs, fetchEvaluationConfig, type EvaluationConfig } from "@/services/evaluations";
import { sendEvaluationForTicket, channelSupportsEvaluation } from "@/lib/send-evaluation";
import { fetchTicketNoteLogs, createTicketNote, updateTicketNote, deleteTicketNote } from "@/services/notes";
import { fetchGallery, getGalleryPreviewUrl, type GalleryItem } from "@/services/gallery";
import { fetchTenantById } from "@/services/tenants";
import { sendSMS, sendSMSConecta, sendSMSLivson } from "@/services/sms";
import { fetchVapiAssistants, fetchVapiPhoneNumbers, createVapiCall, type VapiAssistant, type VapiPhoneNumber } from "@/services/vapi";
import { useSettings } from "@/hooks/use-settings";
import { useWebphoneStore } from "@/stores/webphone-store";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { uazapiContactAgenda, listUazapiLabels, setUazapiChatLabels } from "@/services/uazapi-interactive";
import { zapoContactAgenda, listZapoLabels, setZapoChatLabels } from "@/services/zapo-interactive";
import { summarizeContact, analyzeSentiment } from "@/services/copilot";
import {
  listWhatsappPayments, markPaymentAsPaid, cancelPayment,
  type WhatsappPayment, type WhatsappPaymentStatus,
} from "@/services/whatsapp-payments";
import { formatCentsBRL } from "@/lib/order-details";
import { useUrgencyStore } from "@/stores/urgency-store";

const INTEGRATION_CONFIG: { label: string; settingKey: string; ticketField: string }[] = [
  { label: "Typebot", settingKey: "typebot", ticketField: "typebotStatus" },
  { label: "DialogFlow", settingKey: "dialogflow", ticketField: "dialogflowStatus" },
  { label: "ChatGPT", settingKey: "chatgpt", ticketField: "chatgptStatus" },
  { label: "N8N", settingKey: "n8n", ticketField: "n8nStatus" },
  { label: "Dify", settingKey: "dify", ticketField: "difyStatus" },
  { label: "Ollama", settingKey: "ollama", ticketField: "ollamaStatus" },
  { label: "LM", settingKey: "lm", ticketField: "lmStatus" },
  { label: "Grok", settingKey: "grok", ticketField: "grokStatus" },
  { label: "Gemini", settingKey: "gemini", ticketField: "geminiStatus" },
  { label: "Qwen", settingKey: "qwen", ticketField: "qwenStatus" },
  { label: "Claude", settingKey: "claude", ticketField: "claudeStatus" },
  { label: "Deepseek", settingKey: "deepseek", ticketField: "deepseekStatus" },
];

/** Abas no modelo Vue: Perfil, Atendimento, Gestão, Integrações, Utilitários */
export type TicketDetailTab = "perfil" | "atendimento" | "gestao" | "integracoes" | "utilitarios";

/** Aceita também os nomes antigos para compatibilidade com openTab do header */
export type TicketDetailDefaultTab = TicketDetailTab | "info" | "ticket" | "actions" | "tags" | "notes" | "media";

function mapDefaultTab(tab: TicketDetailDefaultTab): TicketDetailTab {
  switch (tab) {
    case "perfil":
    case "atendimento":
    case "gestao":
    case "integracoes":
    case "utilitarios":
      return tab;
    case "info":
    case "ticket":
    case "tags":
    case "media":
      return "perfil";
    case "notes":
      return "atendimento";
    case "actions":
      return "gestao";
    default:
      return "perfil";
  }
}

// Nota do log com URLs/e-mails clicaveis — mesmo tratamento da nota exibida no
// chat. Sem markdown: notas costumam trazer PIX copia-e-cola e linha digitavel,
// onde "*" e "_" fazem parte do codigo.
function NoteLogText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-xs">
      {linkifyParts(text).map((part, i) =>
        part.type === "text" ? (
          <React.Fragment key={i}>{part.value}</React.Fragment>
        ) : (
          <a
            key={i}
            href={part.href}
            target={part.href.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className="underline text-blue-600 dark:text-blue-400 hover:opacity-80"
          >
            {part.value}
          </a>
        )
      )}
    </p>
  );
}

interface TicketDetailProps {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
  defaultTab?: TicketDetailDefaultTab;
  queues?: { id: number; name: string; color: string; isActive?: boolean }[];
  users?: { id: number; name: string; queues?: { id: number }[] }[];
  tags?: { id: number; name: string; color: string; isActive?: boolean }[];
  whatsapps?: { id: number; name: string; type?: string }[];
  chatFlows?: { id: number; name: string }[];
  kanbans?: { id: number; name: string }[];
  motivos?: { id: number; name: string }[];
  onTransfer?: (ticketId: number, queueId: number | null, userId?: number) => void;
  onRefresh?: () => void;
  onScrollToMessage?: (messageId: string) => void;
}

export function TicketDetail({
  ticket, open, onClose, defaultTab = "perfil", queues = [], users = [], tags = [],
  whatsapps = [], chatFlows = [], kanbans = [], motivos = [], onTransfer, onRefresh, onScrollToMessage,
}: TicketDetailProps) {
  const t = useTranslations("ticketDetail");
  const tEx = useTranslations("atendimentoChatExtra");
  const tGcal = useTranslations("gcalOpportunity");
  const router = useRouter();
  const { settings } = useSettings(INTEGRATION_CONFIG.map((c) => c.settingKey));
  // Seletores escopados (referências estáveis) — evita re-render do TicketDetail a
  // cada mudança de status do SIP / tick de chamada vinda da store do webphone.
  const toggleWebphone = useWebphoneStore((s) => s.toggleVisibility);
  const startCall = useWebphoneStore((s) => s.startCall);
  const { user, isRestrictedUser, getConfigValue, syncUserFromLocalStorage, hasPermission } = useAuthStore();
  // Booleans derivados (não o objeto planFeatures) para servirem de dep de efeito:
  // funil e Google Agenda são capabilities de plano e este painel abre em toda tela
  // de atendimento — sem o gate, cada abertura virava um 402 automático.
  const hasFunnelFeature = useAuthStore((s) => s.hasFeature("funnelKanban"));
  const hasCalendarFeature = useAuthStore((s) => s.hasFeature("googleCalendar"));
  // Gate único do WaVoIP (plano + interruptor do tenant) — mesma camada dos dois acima.
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());
  // Demanda obrigatória ao encerrar (config de tenant) — mesmo gate do cabeçalho do atendimento.
  const forceReason = getConfigValue("forceReason") === "enabled";
  const { setCall: setWabaCall, setState: setWabaState } = useWabaCallStore();
  const [wabaCallLogsOpen, setWabaCallLogsOpen] = useState(false);
  const [wabaCallLogsData, setWabaCallLogsData] = useState<CallLogRecord[]>([]);
  const [wabaCallLogsLoading, setWabaCallLogsLoading] = useState(false);
  const contact = ticket?.contact;
  useParentBridge(ticket);
  const ticketData = ticket as unknown as Record<string, unknown>;
  const activeIntegrations = INTEGRATION_CONFIG.filter(
    (c) => (settings[c.settingKey] || "").toLowerCase() === "enabled"
  );
  // Telephony conditions — mirrors Vue: !isGroup && channel !== 'webchat' && !restrictedUser && (wavoip || sip || sms || vapi)
  const whatsappData = ticketData.whatsapp as Record<string, unknown> | undefined;
  const bloquearWavoip = !!user?.blockWavoip;
  const hasWavoip = wavoipEnabled && !!whatsappData?.wavoipToken && !bloquearWavoip;
  // Vue updates sipEnabled in localStorage.usuario via atualizarUsuario() post-login.
  // Read from localStorage as source of truth to stay in sync with Vue.
  const localUsuario = (() => {
    if (typeof window === "undefined") return {} as Record<string, unknown>;
    try { return JSON.parse(localStorage.getItem("usuario") || "{}") as Record<string, unknown>; }
    catch { return {} as Record<string, unknown>; }
  })();
  const sipHabilitado =
    !!user?.sipEnabled ||
    !!(user?.sipConfig?.server && user?.sipConfig?.username) ||
    !!localUsuario.sipEnabled ||
    !!(localUsuario.sipServer && localUsuario.sipUsername);
  const [smsAtivo, setSmsAtivo] = useState(false);
  const [vapiAtivo, setVapiAtivo] = useState(false);
  const [ratingPrivacy, setRatingPrivacy] = useState("disabled");
  const [ratingMaxScore, setRatingMaxScore] = useState(5);
  // hasWabaCall cobre WABA Cloud + BSPs (Gupshup, Dialog360) — ambos têm Calls nativas.
  const hasWabaCall = ticket.channel === 'waba' || ticket.channel === 'gupshup' || ticket.channel === 'dialog360';
  const callChannel = ticket.channel as 'waba' | 'gupshup' | 'dialog360';
  const hasTelephony = !ticket.isGroup
    && ticket.channel !== "webchat"
    && !isRestrictedUser()
    && (hasWavoip || sipHabilitado || smsAtivo || vapiAtivo || hasWabaCall);

  const [activeTab, setActiveTab] = useState<TicketDetailTab>(mapDefaultTab(defaultTab));
  const [profilePicPreview, setProfilePicPreview] = useState<ProfilePicPreview | null>(null);
  // Confirmação de reabertura: atendimento aberto do mesmo contato + destino da
  // posse + janela de 24h. null = nada a avisar, reabre direto.
  const [reopenPrompt, setReopenPrompt] = useState<{
    sibling: ExistingOpenTicket | null;
    notices: ReopenNotices;
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferQueue, setTransferQueue] = useState("");
  const [transferNoQueue, setTransferNoQueue] = useState(false);
  const [transferUser, setTransferUser] = useState("");
  const [transferMessage, setTransferMessage] = useState("");
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [chatbotFlow, setChatbotFlow] = useState("");
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelId, setChannelId] = useState("");

  // ── Retorno rápido / carência manual (botReopenOverride) ───────────────────
  // Habilita, só para ESTE atendimento, o retorno rápido do cliente para um
  // destino escolhido (sem passar pelo menu do robô). Estado inicializado a
  // partir de ticket.botReopenOverride (ShowTicket é findByPk sem whitelist).
  const initialGrace = (ticket as unknown as {
    botReopenOverride?: {
      enabled?: boolean; seconds?: number;
      destinationType?: "lastUser" | "closedUser" | "queue" | "user" | "chatflow";
      queueId?: number | null; userId?: number | null; chatFlowId?: number | null;
    } | null;
  }).botReopenOverride;
  const initialGraceSeconds = Math.min(86400, Math.max(1, Number(initialGrace?.seconds) || 600));
  // Se o valor gravado é múltiplo de 60 (e >= 60), exibe em minutos; senão segundos.
  const initialGraceUnit: "seconds" | "minutes" =
    initialGraceSeconds >= 60 && initialGraceSeconds % 60 === 0 ? "minutes" : "seconds";
  const [graceEnabled, setGraceEnabled] = useState<boolean>(!!initialGrace?.enabled);
  const [graceValue, setGraceValue] = useState<string>(
    String(initialGraceUnit === "minutes" ? initialGraceSeconds / 60 : initialGraceSeconds)
  );
  const [graceUnit, setGraceUnit] = useState<"seconds" | "minutes">(initialGraceUnit);
  const [graceDest, setGraceDest] = useState<"lastUser" | "closedUser" | "queue" | "user" | "chatflow">(
    initialGrace?.destinationType ?? "lastUser"
  );
  const [graceQueueId, setGraceQueueId] = useState<string>(
    initialGrace?.queueId != null ? String(initialGrace.queueId) : ""
  );
  const [graceUserId, setGraceUserId] = useState<string>(
    initialGrace?.userId != null ? String(initialGrace.userId) : ""
  );
  const [graceChatFlowId, setGraceChatFlowId] = useState<string>(
    initialGrace?.chatFlowId != null ? String(initialGrace.chatFlowId) : ""
  );
  const [graceSaving, setGraceSaving] = useState(false);
  // Só quem controla reabertura mexe aqui. Espelha o gate do backend
  // (TicketControllerZPRO: admin/super/superadmin sempre; perfil custom exige a
  // permissão tickets_reopen). Perfil "user" comum é EXCLUÍDO explicitamente:
  // hasPermission devolve true para todo perfil não-custom (inclusive "user"), mas o
  // backend descarta o botReopenOverride para "user" — sem este filtro, o card salvava
  // e mostrava "sucesso" enquanto nada era gravado (sucesso silencioso).
  const canManageGrace = user?.profile !== "user" && hasPermission("tickets_reopen");

  const handleSaveGrace = async () => {
    setGraceSaving(true);
    try {
      if (!graceEnabled) {
        // Desativar = limpar o override (mais limpo que enviar enabled:false).
        await updateTicket(ticket.id, { botReopenOverride: null } as Record<string, unknown>);
      } else {
        const raw = Math.round(Number(graceValue) * (graceUnit === "minutes" ? 60 : 1));
        const seconds = Math.min(86400, Math.max(1, Number.isFinite(raw) ? raw : 600));
        const payload: {
          enabled: boolean; seconds: number;
          destinationType: "lastUser" | "closedUser" | "queue" | "user" | "chatflow";
          queueId?: number; userId?: number; chatFlowId?: number;
        } = { enabled: true, seconds, destinationType: graceDest };
        if (graceDest === "queue" && graceQueueId) payload.queueId = Number(graceQueueId);
        if (graceDest === "user" && graceUserId) payload.userId = Number(graceUserId);
        if (graceDest === "chatflow" && graceChatFlowId) payload.chatFlowId = Number(graceChatFlowId);
        await updateTicket(ticket.id, { botReopenOverride: payload } as Record<string, unknown>);
      }
      toast.success(t("ticketGraceSaved"));
      onRefresh?.();
    } catch {
      toast.error(t("errorSavingMotive"));
    } finally {
      setGraceSaving(false);
    }
  };

  // ── Handoff híbrido (Trilho B — PLANO_WABA_HIBRIDO_PINGPONG F4) ─────────────
  // Canal WABA com hybridMode 'two_numbers' + linkedChannelId ganha o item
  // "Continuar em outro número": envia mensagem-ponte (link wa.me do canal
  // vinculado) e transfere o ticket de canal. Os campos híbridos ainda não
  // existem no type WhatsApp do store — cast local até o type ser estendido (F1).
  const storeWhatsapps = useWhatsappStore((s) => s.whatsapps);
  const setStoreWhatsapps = useWhatsappStore((s) => s.setWhatsapps);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffMessage, setHandoffMessage] = useState("");
  const [handoffSending, setHandoffSending] = useState(false);

  // A página de atendimento passa `whatsapps` via prop com campos estreitados
  // (sem linkedChannelId/hybridMode) e não popula o store — busca aqui quando
  // pode haver handoff (painel aberto + ticket WABA + store vazio).
  useEffect(() => {
    if (!open || (ticket.channel || "").toLowerCase() !== "waba" || storeWhatsapps.length > 0) return;
    fetchWhatsapps()
      .then(({ data }) => {
        const list = (Array.isArray(data) ? data : []).filter(
          (w) => !(w as { isDeleted?: boolean }).isDeleted
        );
        setStoreWhatsapps(list);
      })
      .catch(() => { /* sem lista o item de handoff simplesmente não aparece */ });
  }, [open, ticket.channel, storeWhatsapps.length, setStoreWhatsapps]);

  type HybridWhatsApp = WhatsApp & { linkedChannelId?: number | null; hybridMode?: string };
  const handoffSourceWa = storeWhatsapps.find((w) => w.id === ticket.whatsapp?.id) as
    | HybridWhatsApp
    | undefined;
  const handoffLinkedId = Number(handoffSourceWa?.linkedChannelId) || null;
  const handoffAvailable =
    (ticket.channel || "").toLowerCase() === "waba" &&
    handoffSourceWa?.hybridMode === "two_numbers" &&
    !!handoffLinkedId;
  const handoffTarget = handoffLinkedId
    ? storeWhatsapps.find((w) => w.id === handoffLinkedId)
    : undefined;
  // Número da sessão destino: Whatsapp.number (E.164 do canal); fallback
  // phone.phone (preenchido em canais baileys-like quando number está vazio).
  const handoffTargetNumber = String(handoffTarget?.number || handoffTarget?.phone?.phone || "").replace(/\D/g, "");
  const handoffLink = handoffTargetNumber
    ? `https://wa.me/${handoffTargetNumber}?text=${encodeURIComponent((ticket as unknown as { protocol?: string }).protocol || "Ola")}`
    : "";
  const [noteText, setNoteText] = useState("");
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [noteFilePreview, setNoteFilePreview] = useState<string | null>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const [valorNegociado, setValorNegociado] = useState("");
  const [apptDialogOpen, setApptDialogOpen] = useState(false);
  const [savingAppt, setSavingAppt] = useState(false);
  const [apptForm, setApptForm] = useState({ title: "", startAt: "", endAt: "", notes: "" });
  const [kanbanSelecionado, setKanbanSelecionado] = useState("");
  const [motivoSelecionado, setMotivoSelecionado] = useState("");
  const [reasonsList, setReasonsList] = useState<Reason[]>([]);
  const [deletedScheduledIds, setDeletedScheduledIds] = useState<number[]>([]);

  // Funil / Oportunidades
  const [funilOpen, setFunilOpen] = useState(false);
  const [oportunidadesOpen, setOportunidadesOpen] = useState(false);
  const [oportunidades, setOportunidades] = useState<Record<string, unknown>[]>([]);
  const [oportunidadesLoading, setOportunidadesLoading] = useState(false);
  const [oportunidadesCount, setOportunidadesCount] = useState(0);
  const [pipelines, setPipelines] = useState<{ id: number; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: number; name: string; pipelineId: number }[]>([]);
  const [funilUsers, setFunilUsers] = useState<{ id: number; name: string }[]>([]);
  const [funilForm, setFunilForm] = useState({ name: "", pipelineId: "", stageId: "", responsibleId: "", closingForecast: "", value: "", description: "", status: "open" });
  const [funilSaving, setFunilSaving] = useState(false);
  const [editingOpId, setEditingOpId] = useState<number | null>(null);
  const [deleteOpTarget, setDeleteOpTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteOpSaving, setDeleteOpSaving] = useState(false);
  const [calendarConfigs, setCalendarConfigs] = useState<GoogleCalendarConfig[]>([]);
  const [calendarAskOpen, setCalendarAskOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarForm, setCalendarForm] = useState({ configId: "", summary: "", startDateTime: "", endDateTime: "", description: "", location: "", attendees: "" });
  const [bloquearContato, setBloquearContato] = useState(false);
  const [bloquearChatbot, setBloquearChatbot] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncLimit, setSyncLimit] = useState(100);
  const [tagSelectValue, setTagSelectValue] = useState("");
  const [walletSelectValue, setWalletSelectValue] = useState("");
  const [callLogsOpen, setCallLogsOpen] = useState(false);

  // AI — contact summary
  const [contactSummary, setContactSummary] = useState<string | null>(null);
  const [contactSummaryAnalyzed, setContactSummaryAnalyzed] = useState<number>(0);
  const [contactSummaryGeneratedAt, setContactSummaryGeneratedAt] = useState<Date | null>(null);
  const [contactSummaryProvider, setContactSummaryProvider] = useState<string | null>(null);
  const [contactSummaryModel, setContactSummaryModel] = useState<string | null>(null);
  const [loadingContactSummary, setLoadingContactSummary] = useState(false);
  const [contactSummaryCooldown, setContactSummaryCooldown] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [forceReasonOpen, setForceReasonOpen] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [analyzingSentiment, setAnalyzingSentiment] = useState(false);

  // Reset/preload contact summary state quando o contato muda. Sem isso, ao abrir
  // o detalhe de outro contato o resumo do anterior aparece (estado preso ao componente).
  useEffect(() => {
    const c = contact as unknown as Record<string, unknown> | undefined;
    const savedSummary = (c?.aiSummary as string | null | undefined) ?? null;
    const savedTickets = (c?.aiSummaryTickets as number | null | undefined) ?? 0;
    const savedAt = (c?.aiSummaryGeneratedAt as string | null | undefined) ?? null;
    const savedProvider = (c?.aiSummaryProvider as string | null | undefined) ?? null;
    const savedModel = (c?.aiSummaryModel as string | null | undefined) ?? null;
    setContactSummary(savedSummary);
    setContactSummaryAnalyzed(savedTickets || 0);
    setContactSummaryGeneratedAt(savedAt ? new Date(savedAt) : null);
    setContactSummaryProvider(savedProvider);
    setContactSummaryModel(savedModel);
    setContactSummaryCooldown(false);
  }, [contact?.id]);

  // Contador de oportunidades pro badge do botao em "Funil" — fetch leve no mount/troca de contato.
  // Plano sem funil: nem chama (era um 402 automático a cada contato aberto). O flag entra
  // nas deps porque o snapshot do plano chega assíncrono no boot.
  useEffect(() => {
    if (!contact?.id) { setOportunidadesCount(0); return; }
    if (!hasFunnelFeature) { setOportunidadesCount(0); return; }
    let cancelled = false;
    fetchOpportunitiesByContact(contact.id, undefined, { background: true })
      .then((res) => {
        if (cancelled) return;
        const d = res.data as { data?: Record<string, unknown>[] } | Record<string, unknown>[];
        const list = Array.isArray(d) ? d : (d.data ?? []);
        setOportunidadesCount(list.length);
      })
      .catch(() => { /* badge meramente informativo — silencioso */ });
    return () => { cancelled = true; };
  }, [contact?.id, hasFunnelFeature]);

  // Local state para refletir mudanças sem precisar fechar/abrir o painel
  const [localTags, setLocalTags] = useState<{ id: number; name?: string; tag?: string; color?: string }[]>([]);
  const [localWallets, setLocalWallets] = useState<{ id: number; name: string }[]>([]);
  const [localIntegrationStatus, setLocalIntegrationStatus] = useState<Record<string, boolean>>({});
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [callLogsLoading, setCallLogsLoading] = useState(false);
  const [callLogsData, setCallLogsData] = useState<WavoipCallRecord[]>([]);

  // UazAPI — agenda e labels
  const [uazapiAgendaLoading, setUazapiAgendaLoading] = useState(false);
  const [uazapiLabelsOpen, setUazapiLabelsOpen] = useState(false);
  const [uazapiLabelsList, setUazapiLabelsList] = useState<{ id: string; name: string; color?: string }[]>([]);
  const [uazapiActiveLabelIds, setUazapiActiveLabelIds] = useState<string[]>([]);
  const [uazapiLabelsLoading, setUazapiLabelsLoading] = useState(false);

  // Modal de log do ticket
  type TicketLogEntry = { id?: number; createdAt?: string; type?: string; user?: { name: string } };
  const TICKET_LOG_LABELS: Record<string, string> = {
    access: t("logAccess"), closed: t("logClosed"), create: t("logCreate"),
    delete: t("logDelete"), open: t("logOpen"), pending: t("logPending"),
    transfered: t("logTransfered"), receivedTransfer: t("logReceivedTransfer"),
    queue: t("logQueue"), userDefine: t("logUserDefine"),
    retriesLimitQueue: t("logRetriesLimitQueue"),
    retriesLimitUserDefine: t("logRetriesLimitUserDefine"),
    chatBot: t("logChatBot"), autoClose: t("logAutoClose"),
  };
  const [ticketLogsOpen, setTicketLogsOpen] = useState(false);
  const [ticketLogs, setTicketLogs] = useState<TicketLogEntry[]>([]);
  const [ticketLogsLoading, setTicketLogsLoading] = useState(false);

  const handleOpenTicketLogs = async () => {
    setTicketLogs([]);
    setTicketLogsOpen(true);
    setTicketLogsLoading(true);
    try {
      const res = await fetchTicketLogs(ticket.id);
      setTicketLogs((res.data as TicketLogEntry[]) ?? []);
    } catch { toast.error(t("errorLoadingLogs")); }
    finally { setTicketLogsLoading(false); }
  };

  // Confirmação de envio protocolo/avaliação
  const [confirmProtocolOpen, setConfirmProtocolOpen] = useState(false);
  const [confirmEvalOpen, setConfirmEvalOpen] = useState(false);
  const [sendingProtocol, setSendingProtocol] = useState(false);
  const [sendingEval, setSendingEval] = useState(false);

  // Modais de log (protocolo, avaliação, notas)
  type LogEntry = { id?: number; createdAt?: string; user?: { name: string }; protocol?: string; evaluation?: number; notes?: string; mediaUrl?: string; storageUrl?: string };
  const [protocolLogsOpen, setProtocolLogsOpen] = useState(false);
  const [protocolLogs, setProtocolLogs] = useState<LogEntry[]>([]);
  const [starredOpen, setStarredOpen] = useState(false);
  const [starredMessages, setStarredMessages] = useState<Message[]>([]);
  const [starredLoading, setStarredLoading] = useState(false);
  const [evalLogsOpen, setEvalLogsOpen] = useState(false);
  const [evalLogs, setEvalLogs] = useState<LogEntry[]>([]);
  const [noteLogsOpen, setNoteLogsOpen] = useState(false);
  const [noteLogs, setNoteLogs] = useState<LogEntry[]>([]);
  const [noteLogLightboxSrc, setNoteLogLightboxSrc] = useState<string | null>(null);
  const [noteEditingId, setNoteEditingId] = useState<number | null>(null);
  const [noteEditText, setNoteEditText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [pauseLogsOpen, setPauseLogsOpen] = useState(false);
  const [pauseLogs, setPauseLogs] = useState<PauseLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // SMS modal
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [smsService, setSmsService] = useState("");
  const [smsSending, setSmsSending] = useState(false);

  // VAPI modal
  const [vapiOpen, setVapiOpen] = useState(false);
  const [vapiCustomerNumber, setVapiCustomerNumber] = useState("");
  const [vapiAssistants, setVapiAssistants] = useState<VapiAssistant[]>([]);
  const [vapiPhoneNumbers, setVapiPhoneNumbers] = useState<VapiPhoneNumber[]>([]);
  const [vapiAssistantId, setVapiAssistantId] = useState("");
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState("");
  const [vapiCalling, setVapiCalling] = useState(false);
  const [vapiLoading, setVapiLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab(mapDefaultTab(defaultTab));
      syncUserFromLocalStorage();
    }
  }, [open, defaultTab]);

  // Load tenant settings (smsAtivo / vapi) — same logic as Vue's listTenantPorId
  useEffect(() => {
    if (!open || !user?.tenantId) return;
    fetchTenantById(user.tenantId).then((res) => {
      const tenant = (Array.isArray(res.data) ? res.data[0] : res.data) as Record<string, unknown> | undefined;
      if (!tenant) return;
      const hasSms = !!(
        (tenant.smsToken as string | undefined)?.trim() ||
        (tenant.livsonSmsToken as string | undefined)?.trim() ||
        (tenant.conectaSmsToken as string | undefined)?.trim()
      );
      setSmsAtivo(hasSms);
      setVapiAtivo(!!(tenant.vapiToken as string | undefined)?.trim());
      setRatingPrivacy((tenant.ratingPrivacy as string | undefined) || "disabled");
      setRatingMaxScore(typeof tenant.ratingMaxScore === "number" ? tenant.ratingMaxScore : 5);
    }).catch(() => { /* ignore — tenant fetch failure shouldn't block the panel */ });
  }, [open, user?.tenantId]);

  useEffect(() => {
    if (open && contact) {
      const c = contact as { bloquearContato?: boolean; bloquearChatbot?: boolean; blocked?: boolean; chatbotBlocked?: boolean };
      setBloquearContato(!!(c.bloquearContato ?? c.blocked));
      setBloquearChatbot(!!(c.bloquearChatbot ?? c.chatbotBlocked));
    }
  }, [open, contact]);

  useEffect(() => {
    if (!open) return;
    fetchReasons().then((res) => {
      const data = res.data as { reasons?: Reason[] } | Reason[];
      const list = Array.isArray(data) ? data : (data as { reasons?: Reason[] }).reasons ?? [];
      setReasonsList(list);
    }).catch(() => {});
    // Funil e Google Agenda são gated por plano e estas chamadas são automáticas
    // (abrir o painel). Sem o pré-check viravam 402 + toast "recurso fora do plano"
    // sem o usuário ter pedido nada.
    if (hasFunnelFeature) {
      fetchPipelines(undefined, { background: true }).then((res) => {
        const data = res.data as { data?: { id: number; name: string }[] } | { id: number; name: string }[];
        setPipelines(Array.isArray(data) ? data : (data as { data?: { id: number; name: string }[] }).data ?? []);
      }).catch(() => {});
      fetchStages(undefined, { background: true }).then((res) => {
        const data = res.data as { data?: { id: number; name: string; pipelineId: number }[] } | { id: number; name: string; pipelineId: number }[];
        setStages(Array.isArray(data) ? data : (data as { data?: { id: number; name: string; pipelineId: number }[] }).data ?? []);
      }).catch(() => {});
    }
    fetchAllUsers().then((res) => {
      const list = (res.data?.users ?? [])
        .filter((u) => u.profile !== "superadmin")
        .map((u) => ({ id: u.id, name: u.name, profile: u.profile }));
      setFunilUsers(list);
    }).catch(() => {});
    if (hasCalendarFeature) {
      listGoogleCalendarConfigs({ background: true }).then((res) => {
        setCalendarConfigs(res.data?.configs ?? []);
      }).catch(() => {});
    }
  }, [open, hasFunnelFeature, hasCalendarFeature]);

  useEffect(() => {
    if (open && ticket) {
      const t = ticket as unknown as Record<string, unknown>;
      // Vue stores kanban on the contact; fallback to ticket-level fields
      const kanbanVal = ticket.contact?.kanban ?? t.kanban ?? t.kanbanId;
      setKanbanSelecionado(kanbanVal ? String(kanbanVal) : "");
      setMotivoSelecionado(t.reasons ? String(t.reasons) : (t.reasonId ? String(t.reasonId) : ""));
      setValorNegociado(t.value ? String(t.value) : (t.valorNegociado ? String(t.valorNegociado) : ""));

      // Inicializa estados locais a partir dos dados do ticket/contato
      const allTags = [...(ticket.tags || []), ...((ticket.contact as any)?.tags || [])]
        .filter((tag, i, arr) => arr.findIndex((t) => t.id === tag.id) === i) as { id: number; name?: string; tag?: string; color?: string }[];
      setLocalTags(allTags);

      const walletList = ((ticket.contact as unknown as Record<string, unknown> | undefined)?.wallets as { id: number; name: string }[] | undefined) || [];
      setLocalWallets(walletList);

      const integStatus: Record<string, boolean> = {};
      INTEGRATION_CONFIG.forEach((c) => { integStatus[c.ticketField] = !!(t[c.ticketField]); });
      setLocalIntegrationStatus(integStatus);
    }
  }, [open, ticket]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t("copied"));
  }, [t]);

  const handleCloseTicket = async () => {
    if (isClosing) return;
    // Demanda obrigatória: bloqueia o encerramento até o motivo ser definido (espelha o ChatHeader).
    // Sem isso, encerrar pelo painel do contato pulava o gate que o topo do atendimento aplica.
    if (forceReason && !ticket.reasons && ticket.status === "open") {
      if (reasonsList.length === 0) {
        try {
          const res = await fetchReasons();
          const data = res.data as { reasons?: Reason[] } | Reason[];
          const list = Array.isArray(data) ? data : (data as { reasons?: Reason[] }).reasons ?? [];
          setReasonsList(list);
        } catch { /* ignore — dialog ainda abre, usuário pode cancelar */ }
      }
      setForceReasonOpen(true);
      return;
    }
    // Avaliacao automatica: se o canal envia pesquisa e ha um comportamento configurado,
    // aplica a mesma regra do topo do atendimento (fecha na hora / mantem aberto).
    const ch = (ticket.channel || "").toLowerCase();
    const sendEval = ticket.whatsapp?.sendEvaluation;
    if (sendEval === "enabled" && ticket.status === "open" && channelSupportsEvaluation(ch) && !ticket.isGroup) {
      let config: EvaluationConfig | null = null;
      try {
        const res = await fetchEvaluationConfig();
        config = Array.isArray(res.data) ? res.data[0] : res.data;
      } catch {
        config = null;
      }
      const behavior = (config?.ratingCloseBehavior as string) || "ask";
      if (behavior === "closeOnResolve" || behavior === "waitClientReply" || behavior === "timer") {
        setIsClosing(true);
        try {
          await sendEvaluationForTicket(ticket, { config, questionLabel: "Avalie este atendimento:" });
          if (behavior === "closeOnResolve") {
            await updateTicket(ticket.id, { status: "closed" });
            toast.success(t("ticketClosed"));
          } else {
            toast.success(tEx("evaluationSentWaiting"));
          }
          onRefresh?.();
        } catch {
          toast.error(t("errorClosing"));
        } finally {
          setIsClosing(false);
        }
        return;
      }
      // behavior === "ask": cai no fluxo padrao abaixo (fecha direto, como hoje neste painel)
    }
    setIsClosing(true);
    try {
      await updateTicket(ticket.id, { status: "closed" });
      toast.success(t("ticketClosed"));
      onRefresh?.();
    } catch {
      toast.error(t("errorClosing"));
    } finally {
      setIsClosing(false);
    }
  };

  const reopenTicketNow = async () => {
    try {
      await updateTicket(ticket.id, { status: "open" });
      toast.success(t("ticketReopened"));
      onRefresh?.();
    } catch {
      toast.error(t("errorReopening"));
    }
  };

  const handleReopenTicket = async () => {
    // Pré-check antes de reabrir um fechado. Avisa sobre (a) atendimento já aberto
    // do contato no MESMO canal (duplicata direta, sempre checada) ou em OUTRO canal
    // (gated pela flag crossChannelTicketCheck dentro do helper), (b) para onde vai a
    // posse do ticket e (c) janela de 24h fechada nos canais Meta.
    let sibling: ExistingOpenTicket | null = null;
    if (!ticket.isGroup && contact?.number) {
      sibling = await findCrossChannelSiblingForTicket({
        ticketId: ticket.id,
        number: contact.number,
        whatsappId: (ticket as unknown as { whatsappId?: number }).whatsappId ?? ticket.whatsapp?.id,
        includeSameChannel: true,
      });
    }
    const notices = buildReopenNotices(ticket, user?.userId ?? null);
    // Sem nada a avisar, reabrir continua sendo um clique só.
    if (sibling || notices.ownership || notices.windowClosed) {
      setReopenPrompt({ sibling, notices });
      return;
    }
    await reopenTicketNow();
  };

  const handleReturnToQueue = async () => {
    try {
      await updateTicket(ticket.id, { status: "pending", userId: null });
      toast.success(t("returnedToQueue"));
      onRefresh?.();
    } catch {
      toast.error(t("errorReturning"));
    }
  };

  const handleTransfer = async () => {
    if (!transferQueue && !transferNoQueue) return;
    const body = transferMessage.trim();
    if (body) {
      try {
        const ch = (ticket.channel || "").toLowerCase();
        const idFront = `transfer-${ticket.id}-${Date.now()}`;
        if (ch === "waba" || ch === "instagram" || ch === "messenger") {
          const metaPayload = {
            read: 1, fromMe: true, mediaUrl: "", body,
            scheduleDate: null, quotedMsg: null,
            from: ticket.contact?.number, tokenApi: ticket.whatsapp?.tokenAPI, ticketId: ticket.id,
            idFront,
          };
          if (ch === "waba") await sendTextWaba(metaPayload);
          else if (ch === "instagram") await sendTextInstagramMeta(metaPayload);
          else await sendTextMessengerMeta(metaPayload);
        } else {
          await sendMessage(ticket.id, { body, read: 1, fromMe: true, mediaUrl: "", scheduleDate: null, quotedMsg: null, idFront }, { channel: ch });
        }
      } catch {
        // prossegue com a transferência mesmo se o envio falhar
      }
    }
    onTransfer?.(ticket.id, transferNoQueue ? null : parseInt(transferQueue), transferUser ? parseInt(transferUser) : undefined);
    setTransferOpen(false);
    setTransferQueue("");
    setTransferNoQueue(false);
    setTransferUser("");
    setTransferMessage("");
  };

  const handleTransferToChatbot = async () => {
    if (!chatbotFlow) return;
    try {
      // Endpoint dedicado PUT /ticketsChatBot/:id (UpdateChatbotTicketService).
      // O updateTicket (PUT /tickets/:id) NAO aceita chatFlowId — só status/userId/queueId.
      await transferToChatbot(ticket.id, parseInt(chatbotFlow));
      toast.success(t("transferredToChatbot"));
      setChatbotOpen(false);
      setChatbotFlow("");
      onRefresh?.();
    } catch {
      toast.error(t("errorTransferChatbot"));
    }
  };

  const handleTransferChannel = async () => {
    if (!channelId) return;
    const selectedWa = whatsapps.find((w) => w.id === parseInt(channelId));
    const channel = selectedWa?.type ?? "baileys";
    try {
      await transferTicketChannel(ticket.id, { channel, whatsappId: parseInt(channelId) });
      toast.success(t("channelTransferred"));
      setChannelOpen(false);
      setChannelId("");
      onRefresh?.();
    } catch {
      toast.error(t("errorTransferChannel"));
    }
  };

  // Handoff híbrido: 1) envia a mensagem-ponte pelo fluxo normal de envio do
  // ticket WABA (mesmo payload do doSendProtocol; idFront evita bubble duplicado),
  // 2) aguarda sucesso, 3) transfere o ticket para o canal vinculado.
  const handleHandoff = async () => {
    if (!handoffTarget || !handoffTargetNumber) return;
    setHandoffSending(true);
    try {
      const body = handoffMessage.replace(/\{\{\s*link\s*\}\}/gi, handoffLink).trim();
      if (body) {
        const idFront = `handoff-${ticket.id}-${Date.now()}`;
        await sendTextWaba({
          read: 1, fromMe: true, mediaUrl: "", body,
          scheduleDate: null, quotedMsg: null,
          from: ticket.contact?.number, tokenApi: ticket.whatsapp?.tokenAPI,
          whatsappId: ticket.whatsapp?.id,
          ticketId: ticket.id,
          idFront,
        });
      }
      await transferTicketChannel(ticket.id, {
        channel: handoffTarget.type || "baileys",
        whatsappId: handoffTarget.id,
      });
      toast.success(t("handoffDone"));
      setHandoffOpen(false);
      onRefresh?.();
    } catch (err) {
      const apiData = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      toast.error(apiData?.error || apiData?.message || (err as Error)?.message || t("handoffError"));
    } finally {
      setHandoffSending(false);
    }
  };

  const handlePauseResume = async () => {
    try {
      if (ticket.isPaused) {
        await resumeTicket(ticket.id);
        toast.success(t("pauseResumed"));
      } else {
        await pauseTicket(ticket.id);
        toast.success(t("pauseApplied"));
      }
      onRefresh?.();
    } catch {
      toast.error(t("errorPause"));
    }
  };

  const applyNoteFile = (file: File | null) => {
    setNoteFile(file);
    if (!file) { setNoteFilePreview(null); return; }
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setNoteFilePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setNoteFilePreview(null);
    }
  };

  const handleNoteFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyNoteFile(e.target.files?.[0] ?? null);
  };

  const handleNotePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    applyNoteFile(file);
  };

  const [noteDropActive, setNoteDropActive] = useState(false);

  // Gallery modal for notes
  const [noteGalleryOpen, setNoteGalleryOpen] = useState(false);
  const [noteGalleryItems, setNoteGalleryItems] = useState<GalleryItem[]>([]);
  const [noteGalleryLoading, setNoteGalleryLoading] = useState(false);
  const [noteGallerySearch, setNoteGallerySearch] = useState("");

  const handleOpenNoteGallery = async () => {
    setNoteGalleryOpen(true);
    if (noteGalleryItems.length > 0) return;
    setNoteGalleryLoading(true);
    try {
      const res = await fetchGallery();
      setNoteGalleryItems(res.data);
    } catch { /* silently ignore */ }
    finally { setNoteGalleryLoading(false); }
  };

  const handleSelectGalleryForNote = async (item: GalleryItem) => {
    setNoteGalleryOpen(false);
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      const file = new File([blob], item.name, { type: item.type || blob.type || "application/octet-stream" });
      applyNoteFile(file);
    } catch { toast.error(t("errorAddingNote")); }
  };

  const handleNoteDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setNoteDropActive(true);
  };
  const handleNoteDragLeave = () => setNoteDropActive(false);
  const handleNoteDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setNoteDropActive(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) applyNoteFile(file);
  };

  const handleAddNote = async () => {
    if (!noteText.trim() && !noteFile) return;
    const noteBody = noteText;
    const fileToSend = noteFile;
    const idFront = crypto.randomUUID();
    setNoteText("");
    setNoteFile(null);
    setNoteFilePreview(null);
    if (noteFileInputRef.current) noteFileInputRef.current.value = "";
    try {
      await createTicketNote({ content: noteBody, ticketId: ticket.id, idFront, file: fileToSend ?? undefined });
      toast.success(t("noteAdded"));
      onRefresh?.();
    } catch {
      setNoteText(noteBody);
      setNoteFile(fileToSend);
      toast.error(t("errorAddingNote"));
    }
  };

  const handleEditContact = () => {
    if (!contact?.id) return;
    setContactEditOpen(true);
  };

  const tPrompts = useTranslations("copilotPrompts");
  const tContactSummary = useTranslations("contactSummary");
  const tCopilot = useTranslations("copilot");

  const handleGenerateContactSummary = async () => {
    if (!contact?.id || loadingContactSummary || contactSummaryCooldown) return;
    setLoadingContactSummary(true);
    try {
      const systemPrompt = tPrompts("contactSummary");
      const result = await summarizeContact(contact.id, ticket.id, systemPrompt);
      setContactSummary(result.summary || "");
      setContactSummaryAnalyzed(result.ticketsAnalyzed || 0);
      setContactSummaryGeneratedAt(result.generatedAt ? new Date(result.generatedAt) : new Date());
      setContactSummaryProvider(result.provider ?? null);
      setContactSummaryModel(result.model ?? null);
      setContactSummaryCooldown(true);
      setTimeout(() => setContactSummaryCooldown(false), 60_000);
      setSummaryDialogOpen(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 422) {
        toast.error(tCopilot("noApiKey"));
      } else {
        toast.error(tContactSummary("errorSummary"));
      }
    } finally {
      setLoadingContactSummary(false);
    }
  };

  const handleAnalyzeSentiment = async () => {
    if (!ticket?.id || analyzingSentiment) return;
    setAnalyzingSentiment(true);
    try {
      const result = await analyzeSentiment(ticket.id);
      useUrgencyStore.getState().setSentiment(ticket.id, result.sentiment);
      useTicketStore.getState().updateTicket({
        id: ticket.id,
        sentiment: result.sentiment,
        sentimentSummary: result.summary,
        sentimentAnalyzedAt: new Date().toISOString(),
      });
      toast.success(tCopilot("sentimentDone"));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
        ?? (err as { status?: number })?.status;
      if (status === 422) toast.error(tCopilot("noApiKey"));
      else toast.error(tCopilot("errorSentiment"));
    } finally {
      setAnalyzingSentiment(false);
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!contact?.id) return;
    const currentIds = localTags.map((t) => t.id).filter(Boolean) as number[];
    const newIds = currentIds.includes(Number(tagId)) ? currentIds : [...currentIds, Number(tagId)];
    try {
      await updateContactTags(contact.id, newIds);
      setTagSelectValue("");
      const tagObj = tags.find((t) => t.id === Number(tagId));
      if (tagObj && !currentIds.includes(tagObj.id)) {
        const newTag = { id: tagObj.id, name: tagObj.name, color: tagObj.color };
        const updatedTags = [...localTags, newTag];
        setLocalTags(updatedTags);
        useTicketStore.getState().updateTicket({
          id: ticket.id,
          contact: { ...ticket.contact, tags: updatedTags as { id: number; name: string; color: string }[] },
          tags: updatedTags as { id: number; name: string; color: string }[],
        });
      }
      toast.success(t("tagAdded"));
    } catch {
      toast.error(t("errorAddingTag"));
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!contact?.id) return;
    const newIds = localTags.map((tag) => tag.id).filter((id) => id !== tagId) as number[];
    try {
      await updateContactTags(contact.id, newIds);
      const updatedTags = localTags.filter((tag) => tag.id !== tagId);
      setLocalTags(updatedTags);
      useTicketStore.getState().updateTicket({
        id: ticket.id,
        contact: { ...ticket.contact, tags: updatedTags as { id: number; name: string; color: string }[] },
        tags: updatedTags as { id: number; name: string; color: string }[],
      });
      toast.success(t("tagRemoved"));
    } catch {
      toast.error(t("errorRemovingTag"));
    }
  };

  const handleSetWallet = async (userId: string) => {
    if (!contact?.id) return;
    try {
      await updateContactWallet(contact.id, [Number(userId)]);
      setWalletSelectValue("");
      // Atualiza local imediatamente
      const userObj = users.find((u) => u.id === Number(userId));
      if (userObj) {
        setLocalWallets([{ id: userObj.id, name: userObj.name }]);
      }
      toast.success(t("walletSet"));
      onRefresh?.();
    } catch {
      toast.error(t("errorSettingWallet"));
    }
  };

  const handleRemoveWallet = async (walletId: number) => {
    if (!contact?.id) return;
    try {
      await updateContactWallet(contact.id, []);
      setLocalWallets((prev) => prev.filter((w) => w.id !== walletId));
      toast.success(t("walletRemoved"));
    } catch {
      toast.error(t("errorRemovingWallet"));
    }
  };

  const handleMarkRead = async () => {
    try {
      await updateTicket(ticket.id, { unreadMessages: 0 });
      toast.success(t("markedRead"));
      onRefresh?.();
    } catch {
      toast.error(t("errorMarkingRead"));
    }
  };

  const handleMarkUnread = async () => {
    try {
      await updateTicket(ticket.id, { unreadMessages: 1 });
      toast.success(t("markedUnread"));
      onRefresh?.();
    } catch {
      toast.error(t("errorMarkingUnread"));
    }
  };

  const handleDeleteScheduledMessage = async (msgId: number, messageId?: string) => {
    setDeletedScheduledIds((prev) => [...prev, msgId]);
    try {
      await deleteMessage({ id: msgId, messageId });
    } catch {
      setDeletedScheduledIds((prev) => prev.filter((id) => id !== msgId));
      toast.error(t("errorDeletingScheduled"));
    }
  };

  const handleSyncHistory = async () => {
    const limit = Math.max(1, Math.min(1000, syncLimit));
    const contactId = ticket.isGroup ? `${contact?.number}@g.us` : `${contact?.number}@c.us`;
    const whatsappId = (ticket as { whatsappId?: number }).whatsappId;
    const tenantId = (ticket as { tenantId?: number }).tenantId;
    if (!whatsappId || tenantId == null) {
      toast.error(t("channelDataUnavailable"));
      return;
    }
    try {
      await syncOldMessagesByUser({ whatsappId, limit, tenantId, contactId });
      setSyncDialogOpen(false);
      toast.success(t("syncStarted", { limit }));
      onRefresh?.();
    } catch {
      toast.error(t("errorSyncing"));
    }
  };

  // UazAPI/Zapo — handlers de agenda e labels (mesma UI; dispatch por canal)
  const isUazapiTicket = ticket.channel === "uazapi";
  const isZapoTicket = ticket.channel === "zapo";
  const hasChannelAgendaLabels = isUazapiTicket || isZapoTicket;
  const whatsappIdForUazapi = (ticket as { whatsappId?: number }).whatsappId;

  const handleUazapiAgenda = async (action: "add" | "remove") => {
    if (!contact?.number || !whatsappIdForUazapi) {
      toast.error(t("channelDataUnavailable"));
      return;
    }
    setUazapiAgendaLoading(true);
    try {
      const agendaFn = isZapoTicket ? zapoContactAgenda : uazapiContactAgenda;
      await agendaFn({ whatsappId: whatsappIdForUazapi, action, number: contact.number, name: contact.name });
      toast.success(action === "add" ? t("uazapiAgendaAdded") : t("uazapiAgendaRemoved"));
    } catch {
      toast.error(t("uazapiAgendaError"));
    } finally {
      setUazapiAgendaLoading(false);
    }
  };

  const handleLoadUazapiLabels = async () => {
    if (!whatsappIdForUazapi) return;
    setUazapiLabelsLoading(true);
    try {
      const listFn = isZapoTicket ? listZapoLabels : listUazapiLabels;
      const res = await listFn(whatsappIdForUazapi);
      const labels = Array.isArray(res.data) ? res.data : (res.data?.labels ?? []);
      setUazapiLabelsList(labels);
      setUazapiLabelsOpen(true);
    } catch {
      toast.error(t("uazapiLabelsError"));
    } finally {
      setUazapiLabelsLoading(false);
    }
  };

  const handleSaveUazapiLabels = async () => {
    if (!contact?.number || !whatsappIdForUazapi) return;
    setUazapiLabelsLoading(true);
    try {
      const setLabelsFn = isZapoTicket ? setZapoChatLabels : setUazapiChatLabels;
      await setLabelsFn({ whatsappId: whatsappIdForUazapi, number: contact.number, labelIds: uazapiActiveLabelIds });
      toast.success(t("uazapiLabelsSaved"));
      setUazapiLabelsOpen(false);
    } catch {
      toast.error(t("uazapiLabelsError"));
    } finally {
      setUazapiLabelsLoading(false);
    }
  };

  const handleSendProtocol = () => setConfirmProtocolOpen(true);

  const doSendProtocol = async () => {
    setSendingProtocol(true);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const protocol = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
        ticket.id,
        ticket.contact?.id,
        ticket.whatsapp?.id ?? "",
        ticket.channel ?? "",
      ].join("");
      const body = `Protocolo de atendimento: ${protocol}`;
      const ch = (ticket.channel || "").toLowerCase();
      if (ch === "waba" || ch === "instagram" || ch === "messenger" || ch === "dialog360" || ch === "gupshup") {
        // idFront e obrigatorio: sem ele, o SendMeta/BSP service cria uma 2a Message
        // e emite um 2o chat:create (alem do que CreateMessageSystemService ja emite),
        // duplicando o bubble no front.
        const idFront = `protocol-${ticket.id}-${Date.now()}`;
        const metaPayload = {
          read: 1, fromMe: true, mediaUrl: "", body,
          scheduleDate: null, quotedMsg: null,
          from: ticket.contact?.number, tokenApi: ticket.whatsapp?.tokenAPI,
          whatsappId: ticket.whatsapp?.id,
          ticketId: ticket.id,
          idFront, sendType: "protocol",
        };
        if (ch === "waba") await sendTextWaba(metaPayload);
        else if (ch === "instagram") await sendTextInstagramMeta(metaPayload);
        else if (ch === "messenger") await sendTextMessengerMeta(metaPayload);
        else if (ch === "dialog360") await sendTextDialog360(metaPayload);
        else await sendTextGupshup(metaPayload);
      } else {
        await sendMessage(ticket.id, { body, read: 1, fromMe: true, mediaUrl: "", scheduleDate: null, quotedMsg: null, sendType: "protocol" }, { channel: ticket.channel });
      }
      await createProtocol({ protocol, ticketId: ticket.id });
      toast.success(t("protocolSent", { protocol }));
      onRefresh?.();
    } catch {
      toast.error(t("errorSendingProtocol"));
    } finally {
      setSendingProtocol(false);
      setConfirmProtocolOpen(false);
    }
  };

  const handleSendEvaluation = () => setConfirmEvalOpen(true);

  const doSendEvaluation = async () => {
    setSendingEval(true);
    try {
      let config: EvaluationConfig | null = null;
      try {
        const res = await fetchEvaluationConfig();
        config = Array.isArray(res.data) ? res.data[0] : res.data;
      } catch {
        config = null;
      }
      await sendEvaluationForTicket(ticket, { config, questionLabel: "Avalie este atendimento:" });
      toast.success(t("evaluationSent"));
      onRefresh?.();
    } catch {
      toast.error(t("errorSendingEvaluation"));
    } finally {
      setSendingEval(false);
      setConfirmEvalOpen(false);
    }
  };

  const [exportingPdf, setExportingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    const toastId = toast.loading(t("generatingPdf"));
    try {
      // Busca todas as mensagens (usa exportMessages que retorna lista completa)
      const res = await exportMessages(ticket.id);
      const data = (res as { data?: unknown })?.data;
      // exportMessages pode retornar array direto ou { messages: [] }
      let msgs: unknown[] = [];
      if (Array.isArray(data)) {
        msgs = data;
      } else if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        msgs = Array.isArray(d.messages) ? d.messages : Array.isArray(d.data) ? d.data as unknown[] : [];
      }
      // Se não retornou mensagens, busca via fetchMessages (paginado)
      if (msgs.length === 0) {
        let page = 1;
        while (true) {
          const r = await fetchMessages(ticket.id, { pageNumber: page, markAsRead: false });
          const paged = (r as { data?: unknown })?.data;
          const pageItems: unknown[] = Array.isArray(paged)
            ? paged
            : Array.isArray((paged as Record<string, unknown>)?.messages)
              ? ((paged as Record<string, unknown>).messages as unknown[])
              : [];
          if (!pageItems.length) break;
          msgs = [...pageItems, ...msgs]; // mais antigas primeiro
          const hasMore = (paged as Record<string, unknown>)?.hasMore;
          if (!hasMore) break;
          page++;
        }
      }
      await exportChatPdf(ticket, msgs);
      toast.success(t("pdfGenerated"), { id: toastId });
    } catch (e) {
      // console.error direto (logger.error é no-op em produção) para que a
      // causa real apareça mesmo no build deployado.
      console.error("[PDF export] falha ao gerar histórico do ticket", ticket.id, e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`${t("errorGeneratingPdf")}: ${msg}`, { id: toastId });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleUpdateLid = async () => {
    if (!contact?.id) return;
    try {
      await updateContactLidFromContactId(contact.id);
      toast.success(t("lidUpdated"));
      onRefresh?.();
    } catch {
      toast.error(t("errorUpdatingLid"));
    }
  };

  const handleSanitize = async () => {
    if (!contact?.id) return;
    try {
      await migrateContact(contact.id);
      toast.success(t("sanitized"));
      onRefresh?.();
    } catch {
      toast.error(t("errorSanitizing"));
    }
  };

  const handleBloquearContato = async (checked: boolean) => {
    if (!contact?.id || !contact.number) return;
    setBloquearContato(checked);
    try {
      await updateContactBlock(contact.id, { number: contact.number, bloquearContato: checked });
      toast.success(checked ? t("contactBlocked") : t("contactUnblocked"));
      onRefresh?.();
    } catch {
      setBloquearContato(!checked);
      toast.error(t("errorBlockingContact"));
    }
  };

  const handleBloquearChatbot = async (checked: boolean) => {
    if (!contact?.id || !contact.number) return;
    setBloquearChatbot(checked);
    try {
      await updateContactBlock(contact.id, { number: contact.number, bloquearChatbot: checked });
      toast.success(checked ? t("chatbotBlocked") : t("chatbotUnblocked"));
      onRefresh?.();
    } catch {
      setBloquearChatbot(!checked);
      toast.error(t("errorBlockingChatbot"));
    }
  };

  const handleIntegrationToggle = async (ticketField: string, checked: boolean) => {
    // Atualiza local imediatamente (optimistic)
    setLocalIntegrationStatus((prev) => ({ ...prev, [ticketField]: checked }));
    try {
      await updateTicket(ticket.id, { [ticketField]: checked });
      toast.success(checked ? t("integrationEnabled") : t("integrationDisabled"));
      onRefresh?.();
    } catch {
      // Reverte em caso de erro
      setLocalIntegrationStatus((prev) => ({ ...prev, [ticketField]: !checked }));
      toast.error(t("errorUpdatingIntegration"));
    }
  };

  const handleSaveKanban = async () => {
    if (!kanbanSelecionado || !contact?.id) return;
    try {
      // NÃO enviar `number` aqui. O backend salva o kanban primeiro (UpdateKanbanService)
      // e, se o body traz number, revalida/reformata (formatPhoneNumber mexe no 9º dígito)
      // e pode lançar 409 ERR_CONTACT_NUMBER_ALREADY_EXISTS — deixando o kanban já salvo
      // mas exibindo "Erro ao salvar kanban". Sem number, cai no early-return do controller
      // que preserva o número existente e não há colisão. Kanban é ortogonal ao número.
      await updateContact(contact.id, { name: contact.name, kanban: Number(kanbanSelecionado) });
      toast.success(t("kanbanSaved"));
      onRefresh?.();
    } catch {
      toast.error(t("errorSavingKanban"));
    }
  };

  const handleClearKanban = async () => {
    if (!contact?.id) return;
    try {
      // Mesmo motivo de handleSaveKanban: não enviar `number` (evita 409 com kanban já limpo).
      await updateContact(contact.id, { name: contact.name, kanban: null });
      setKanbanSelecionado("");
      toast.success(t("kanbanRemoved"));
      onRefresh?.();
    } catch {
      toast.error(t("errorRemovingKanban"));
    }
  };

  const handleSaveMotivo = async () => {
    try {
      // Vue: AtualizarTicket(id, { reasons: motivoSelecionado })
      await updateTicket(ticket.id, { reasons: motivoSelecionado ? Number(motivoSelecionado) : null });
      toast.success(motivoSelecionado ? t("motiveSaved") : t("motiveRemoved"));
      onRefresh?.();
    } catch {
      toast.error(t("errorSavingMotive"));
    }
  };

  const handleClearMotivo = async () => {
    try {
      await updateTicket(ticket.id, { reasons: null });
      setMotivoSelecionado("");
      toast.success(t("motiveRemoved"));
      onRefresh?.();
    } catch {
      toast.error(t("errorRemovingMotive"));
    }
  };

  const handleSaveValor = async () => {
    const valor = valorNegociado ? parseFloat(valorNegociado) : null;
    try {
      // Vue: AtualizarTicket(id, { value: valorNegociado })
      await updateTicket(ticket.id, { value: valor });
      toast.success(t("valueSaved"));
      onRefresh?.();
    } catch {
      toast.error(t("errorSavingValue"));
    }
  };

  const handleOpenAppt = () => {
    setApptForm({ title: "", startAt: "", endAt: "", notes: "" });
    setApptDialogOpen(true);
  };

  const handleSaveAppt = async () => {
    if (!apptForm.title.trim()) { toast.error(t("apptValidationTitle")); return; }
    if (!apptForm.startAt) { toast.error(t("apptValidationStart")); return; }
    setSavingAppt(true);
    try {
      await createAppointment({
        title: apptForm.title.trim(),
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? undefined,
        contactPhone: contact?.number ?? undefined,
        startAt: new Date(apptForm.startAt).toISOString(),
        endAt: apptForm.endAt ? new Date(apptForm.endAt).toISOString() : null,
        notes: apptForm.notes?.trim() || undefined,
        status: "pending",
      });
      toast.success(t("apptCreated"));
      setApptDialogOpen(false);
    } catch {
      toast.error(t("apptError"));
    } finally {
      setSavingAppt(false);
    }
  };

  const handleOpenFunil = (op?: Record<string, unknown>) => {
    if (op) {
      const cf = closingForecastToDateInput(op.closingForecast as string);
      setFunilForm({
        name: String(op.name ?? ""),
        pipelineId: String(op.pipelineId ?? ""),
        stageId: String(op.stageId ?? ""),
        responsibleId: String(op.responsibleId ?? ""),
        closingForecast: cf,
        value: op.value != null ? String(op.value) : "",
        description: String(op.description ?? ""),
        status: String(op.status ?? "open"),
      });
      setEditingOpId(op.id as number);
    } else {
      setFunilForm({ name: "", pipelineId: "", stageId: "", responsibleId: "", closingForecast: "", value: "", description: "", status: "open" });
      setEditingOpId(null);
    }
    setFunilOpen(true);
  };

  const handleSaveFunil = async () => {
    if (!funilForm.name || !funilForm.pipelineId || (!contact?.id && !editingOpId)) return;
    setFunilSaving(true);
    try {
      const closingForecastISO = dateInputToClosingForecastISO(funilForm.closingForecast);
      const payload = {
        name: funilForm.name,
        pipelineId: Number(funilForm.pipelineId),
        stageId: funilForm.stageId ? Number(funilForm.stageId) : null,
        responsibleId: funilForm.responsibleId ? Number(funilForm.responsibleId) : null,
        value: funilForm.value ? parseFloat(funilForm.value) : 0,
        description: funilForm.description || null,
        status: funilForm.status || "open",
        closingForecast: closingForecastISO,
      };
      if (editingOpId) {
        await updateOpportunity(editingOpId, payload);
        toast.success(t("opportunityUpdated"));
        setFunilOpen(false);
        if (oportunidadesOpen && contact?.id) {
          const res = await fetchOpportunitiesByContact(contact.id);
          const d = res.data as { data?: Record<string, unknown>[] } | Record<string, unknown>[];
          setOportunidades(Array.isArray(d) ? d : (d.data ?? []));
        }
      } else {
        await createOpportunity({ ...payload, contactId: contact!.id });
        toast.success(t("opportunityCreated"));
        setOportunidadesCount((c) => c + 1);
        const activeConfigs = calendarConfigs.filter((c) => c.isActive && c.googleAccessToken && c.googleRefreshToken);
        if (activeConfigs.length > 0) {
          const startDT = funilForm.closingForecast ? `${funilForm.closingForecast}T09:00` : "";
          const endDT = funilForm.closingForecast ? `${funilForm.closingForecast}T10:00` : "";
          setCalendarForm({
            configId: String(activeConfigs[0].id),
            summary: funilForm.name,
            startDateTime: startDT,
            endDateTime: endDT,
            description: funilForm.description || tGcal("defaultDescription", { name: funilForm.name }),
            location: "",
            attendees: (contact as { email?: string })?.email || "",
          });
          setFunilOpen(false);
          setCalendarAskOpen(true);
        } else {
          setFunilOpen(false);
        }
      }
    } catch {
      toast.error(editingOpId ? t("errorUpdatingOpportunity") : t("errorCreatingOpportunity"));
    } finally {
      setFunilSaving(false);
    }
  };

  const handleDeleteOp = async () => {
    if (!deleteOpTarget) return;
    setDeleteOpSaving(true);
    try {
      await deleteOpportunity(deleteOpTarget.id);
      toast.success(t("opportunityDeleted"));
      setDeleteOpTarget(null);
      setOportunidades((prev) => prev.filter((op) => op.id !== deleteOpTarget.id));
      setOportunidadesCount((c) => Math.max(0, c - 1));
    } catch {
      toast.error(t("errorDeletingOpportunity"));
    } finally {
      setDeleteOpSaving(false);
    }
  };

  const handleCreateCalendarEvent = async () => {
    const config = calendarConfigs.find((c) => String(c.id) === calendarForm.configId);
    if (!config) return;
    setCalendarSaving(true);
    try {
      const attendees = calendarForm.attendees
        ? calendarForm.attendees.split(",").map((e) => e.trim()).filter(Boolean)
        : [];
      await createGoogleCalendarEvent({
        summary: calendarForm.summary,
        description: calendarForm.description,
        startDateTime: calendarForm.startDateTime,
        endDateTime: calendarForm.endDateTime,
        location: calendarForm.location,
        attendees,
        googleAccessToken: config.googleAccessToken,
        googleRefreshToken: config.googleRefreshToken,
        googleClientId: config.googleClientId,
        googleClientSecret: config.googleClientSecret,
      });
      toast.success(t("calendarEventCreated"));
      setCalendarOpen(false);
    } catch {
      toast.error(t("errorCreatingCalendarEvent"));
    } finally {
      setCalendarSaving(false);
    }
  };

  const handleOpenOportunidades = async () => {
    if (!contact?.id) return;
    setOportunidades([]);
    setOportunidadesOpen(true);
    setOportunidadesLoading(true);
    try {
      const res = await fetchOpportunitiesByContact(contact.id);
      const d = res.data as { data?: Record<string, unknown>[] } | Record<string, unknown>[];
      const list = Array.isArray(d) ? d : (d.data ?? []);
      setOportunidades(list);
      setOportunidadesCount(list.length);
    } catch {
      toast.error(t("errorLoadingOpportunities"));
    } finally {
      setOportunidadesLoading(false);
    }
  };

  const handleOpenCallLogs = async () => {
    setCallLogsData([]);
    setCallLogsLoading(true);
    setCallLogsOpen(true);
    try {
      const res = await fetchWavoipCallsByTicket(ticket.id, { limit: 50, orderDirection: "DESC" });
      const d = res.data as { data?: WavoipCallRecord[] } | WavoipCallRecord[];
      setCallLogsData(Array.isArray(d) ? d : (d.data ?? []));
    } catch {
      toast.error(t("errorLoadingCallLogs"));
    } finally {
      setCallLogsLoading(false);
    }
  };

  const handleOpenPauseLogs = async () => {
    setPauseLogs([]);
    setLogsLoading(true);
    setPauseLogsOpen(true);
    try {
      const res = await fetchPauseLogs(ticket.id);
      setPauseLogs(res.data ?? []);
    } catch { toast.error(t("errorLoadingPauseLogs")); }
    finally { setLogsLoading(false); }
  };

  const handleOpenStarred = async () => {
    setStarredMessages([]);
    setStarredLoading(true);
    setStarredOpen(true);
    try {
      const res = await fetchStarredMessages(ticket.id);
      setStarredMessages((res.data as { messages: Message[] }).messages ?? []);
    } catch { toast.error(t("errorLoadingStarred")); }
    finally { setStarredLoading(false); }
  };

  const handleOpenProtocolLogs = async () => {
    setProtocolLogs([]);
    setLogsLoading(true);
    setProtocolLogsOpen(true);
    try {
      const res = await fetchProtocolLogs(ticket.id);
      setProtocolLogs((res.data as LogEntry[]) ?? []);
    } catch { toast.error(t("errorLoadingProtocolLogs")); }
    finally { setLogsLoading(false); }
  };

  const handleOpenEvalLogs = async () => {
    setEvalLogs([]);
    setLogsLoading(true);
    setEvalLogsOpen(true);
    try {
      const res = await fetchEvaluationLogs(ticket.id);
      setEvalLogs((res.data as LogEntry[]) ?? []);
    } catch { toast.error(t("errorLoadingEvalLogs")); }
    finally { setLogsLoading(false); }
  };

  const handleOpenNoteLogs = async () => {
    setNoteLogs([]);
    setLogsLoading(true);
    setNoteLogsOpen(true);
    try {
      const res = await fetchTicketNoteLogs(ticket.id);
      setNoteLogs((res.data as LogEntry[]) ?? []);
    } catch { toast.error(t("errorLoadingNoteLogs")); }
    finally { setLogsLoading(false); }
  };

  const reloadMessages = async () => {
    try {
      const res = await fetchMessages(ticket.id, { pageNumber: 1 });
      const msgs = Array.isArray(res.data?.messages) ? res.data.messages : [];
      useTicketStore.getState().setMessages(msgs);
    } catch { /* silencioso — chat já mostrará o estado correto via socket */ }
  };

  const handleSaveNoteEdit = async (id: number) => {
    if (!noteEditText.trim()) return;
    setNoteSaving(true);
    try {
      await updateTicketNote(id, { content: noteEditText, ticketId: ticket.id });
      setNoteLogs((prev) => prev.map((n) => n.id === id ? { ...n, notes: noteEditText } : n));
      setNoteEditingId(null);
      toast.success(t("noteUpdated"));
      await reloadMessages();
    } catch { toast.error(t("errorUpdateNote")); }
    finally { setNoteSaving(false); }
  };

  const handleDeleteNote = async (id: number) => {
    try {
      await deleteTicketNote(id);
      setNoteLogs((prev) => prev.filter((n) => n.id !== id));
      toast.success(t("noteDeleted"));
      await reloadMessages();
    } catch { toast.error(t("errorDeleteNote")); }
  };

  const handleWavoipCall = async () => {
    if (!contactNumber) return;

    const wavoip = (window as unknown as Record<string, unknown>).wavoip as typeof window.wavoip | undefined;
    if (!wavoip) { toast.error(t("wavoipUnavailable")); return; }

    const channelToken = whatsappData?.wavoipToken as string | undefined;
    if (!channelToken) { toast.error(t("noWavoipToken")); return; }

    const tokenList = channelToken.includes(",")
      ? channelToken.split(",").map((t) => t.trim())
      : [channelToken];

    // Inicia chamada via SDK nativo — o widget nativo exibe a UI (igual ao Vue outcomingCall)
    const callResult = wavoip.call.startCall(contactNumber, tokenList) as {
      onPeerAccept?: (cb: (active?: unknown) => void) => void;
      onPeerReject?: (cb: () => void) => void;
      onUnanswered?: (cb: () => void) => void;
      onEnd?: (cb: () => void) => void;
      _logId?: number;
      _startedAt?: number;
    } | null | undefined;

    const inboxName = (whatsappData?.name as string | undefined) || "";
    const callStartedAt = Date.now();

    // Registra log no backend
    createWavoipCall({
      direction: "outgoing",
      phone: contactNumber,
      deviceToken: tokenList[0],
      inboxName,
      callStatus: "ringing",
      ticketId: ticket.id,
      tenantId: user?.tenantId,
      userId: user?.userId,
    }).then((res) => {
      const logId = (res?.data as { id?: number })?.id;
      if (logId && callResult) {
        callResult._logId = logId;
        callResult._startedAt = callStartedAt;
      }
    }).catch(() => {});

    // Nota de ligação no ticket (igual ao Vue CriarNota)
    createCallNote({
      notes: JSON.stringify({ title: t("voiceCallTitle"), subtitle: t("voiceCallSubtitle") }),
      ticketId: ticket.id,
      noteType: "callNotes",
      fromMe: true,
    }).catch(() => {});

    const updateLog = (status: string) => {
      const id = callResult?._logId;
      if (!id) return;
      const duration = callResult._startedAt ? Math.round((Date.now() - callResult._startedAt) / 1000) : 0;
      updateWavoipCall(id, { callStatus: status, callDuration: duration }).catch(() => {});
    };

    if (callResult) {
      callResult.onPeerAccept?.(() => updateLog("answered"));
      callResult.onPeerReject?.(() => updateLog("rejected"));
      callResult.onUnanswered?.(() => updateLog("unanswered"));
      callResult.onEnd?.(() => updateLog("completed"));
    }

    onRefresh?.();
  };

  const handleOpenWabaCallLogs = async () => {
    setWabaCallLogsOpen(true);
    setWabaCallLogsLoading(true);
    try {
      const phoneNum = contactNumber || (ticket as any).contact?.number || "";
      const res = await fetchCallLogs({ originNumber: phoneNum, limit: 50, orderDirection: "DESC" });
      const data = (res as any)?.data?.data || (res as any)?.data || [];
      setWabaCallLogsData(Array.isArray(data) ? data : []);
    } catch {} finally { setWabaCallLogsLoading(false); }
  };

  const handleWabaCallPermissionRequest = async () => {
    const tokenApi = ticket.whatsapp?.tokenAPI ?? (ticket as any).whatsapp?.tokenAPI;
    if (!contactNumber || !ticket.id) {
      toast.error(t("channelDataUnavailable"));
      return;
    }
    try {
      let res: { alreadyAllowed?: boolean } | undefined;
      if (callChannel === "gupshup") {
        const { sendGupshupCallPermissionRequest } = await import("@/services/gupshup-calls");
        res = await sendGupshupCallPermissionRequest({
          tokenApi: tokenApi || "",
          from: contactNumber,
          ticketId: ticket.id,
        });
      } else if (callChannel === "dialog360") {
        const { sendDialog360CallPermissionRequest } = await import("@/services/dialog360-calls");
        res = await sendDialog360CallPermissionRequest({
          ticketId: ticket.id,
        });
      } else {
        if (!tokenApi) {
          toast.error(t("channelDataUnavailable"));
          return;
        }
        res = await sendWabaCallPermissionRequest({
          tokenApi,
          from: contactNumber,
          ticketId: ticket.id,
        });
      }
      if (res?.alreadyAllowed) {
        toast.info(t("wabaCallPermissionAlreadyAllowed"));
      } else {
        toast.success(t("wabaCallPermissionSent"));
      }
    } catch {
      toast.error(t("wabaCallPermissionError"));
    }
  };

  const handleAsteriskCall = () => {
    if (!contactNumber) return;
    toggleWebphone(true);
    startCall({ phone: contactNumber, tag: contactName, direction: "outgoing" });
  };

  const handleWabaCall = async () => {
    const whatsappId = ticket.whatsapp?.id
      ?? (ticket as any).whatsappId
      ?? (ticketData as any).whatsappId;
    const to = contactNumber || (ticket as any).contact?.number || "";

    if (!whatsappId) {
      toast.error("Canal WABA não identificado (whatsappId ausente)");
      return;
    }
    if (!to) {
      toast.error("Número do contato não disponível");
      return;
    }

    try {
      const rtc = getWabaRtc();
      const sdpOffer = await rtc.createOffer();

      let result: any;
      if (callChannel === "gupshup") {
        const { initiateGupshupCall } = await import("@/services/gupshup-calls");
        result = await initiateGupshupCall({ whatsappId, to, sdpOffer });
      } else if (callChannel === "dialog360") {
        const { initiateDialog360Call } = await import("@/services/dialog360-calls");
        result = await initiateDialog360Call({ whatsappId, to, sdpOffer });
      } else {
        result = await initiateWabaCall({ whatsappId, to, sdpOffer });
      }
      const callId = result?.calls?.[0]?.id || '';
      const phoneNumberId = ticket.whatsapp?.tokenAPI ?? (ticketData as any).whatsapp?.tokenAPI ?? '';

      // Registra áudio remoto antes de o answer chegar
      rtc.onRemoteStream(() => {});

      // Log inicial de chamada sainte
      createCallLog({
        userId: user?.userId || 0,
        tenantId: user?.tenantId || 0,
        phoneNumber: to,
        originNumber: to,
        destinationNumber: to,
        callDuration: 0,
        callStatus: 'Calling'
      }).catch(() => {});

      // Atualiza store para mostrar a barra de chamada ativa
      setWabaCall({
        callId,
        from: phoneNumberId,
        to,
        phoneNumberId,
        channelId: whatsappId,
        channel: callChannel,
        direction: 'BUSINESS_INITIATED',
        contactName: contact?.name,
        contactPic: contact?.profilePicUrl,
        startedAt: Date.now()
      });
      setWabaState('pre_accepting');
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      const errCode = err?.data?.error ?? err?.response?.data?.error;
      if (status === 422 || errCode === 'ERR_WABA_CALL_NO_PERMISSION') {
        toast.error(t("wabaCallNoPermission"), { duration: 6000 });
      } else if (
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        err?.message?.includes('Permission denied') ||
        err?.message?.includes('not allowed')
      ) {
        toast.error("Microfone bloqueado pelo navegador. Verifique as permissões.");
      } else {
        toast.error(`Erro ao ligar: ${err?.message || 'desconhecido'}`);
      }
    }
  };

  const handleSms = () => {
    const num = contactNumber;
    // Mirror Vue's getPhoneNumberSMS: Brazilian numbers with 8-digit suffix get a 9 inserted
    let formatted = num;
    if (num.startsWith("55") && num.length >= 12 && num.charAt(4) > "5") {
      formatted = `${num.slice(0, 4)}9${num.slice(-8)}`;
    }
    setSmsPhone(formatted);
    setSmsMessage("");
    setSmsService("");
    setSmsOpen(true);
  };

  const handleSendSms = async () => {
    if (!smsService) { toast.warning(t("selectSmsService")); return; }
    if (!smsMessage.trim()) { toast.warning(t("typeSmsMessage")); return; }
    setSmsSending(true);
    try {
      const payload = { phoneNumber: smsPhone, message: smsMessage };
      if (smsService === "comtele") await sendSMS(payload);
      else if (smsService === "conecta") await sendSMSConecta(payload);
      else await sendSMSLivson(payload);
      toast.success(t("smsSentSuccess"));
      setSmsOpen(false);
    } catch {
      toast.error(t("errorSendingSms"));
    } finally {
      setSmsSending(false);
    }
  };

  const handleVapi = async () => {
    if (!user?.tenantId) return;
    const num = contactNumber;
    const cc = num.slice(0, 2);
    const ddd = num.slice(2, 4);
    let phone = num.slice(4);
    if (cc === "55" && !phone.startsWith("9")) phone = "9" + phone;
    setVapiCustomerNumber(`+${cc}${ddd}${phone}`);
    setVapiAssistantId("");
    setVapiPhoneNumberId("");
    setVapiOpen(true);
    setVapiLoading(true);
    try {
      const [assistRes, phoneRes] = await Promise.all([
        fetchVapiAssistants(user.tenantId),
        fetchVapiPhoneNumbers(user.tenantId),
      ]);
      const assistData = assistRes.data as VapiAssistant[] | { data?: VapiAssistant[]; assistants?: VapiAssistant[] };
      const phoneData = phoneRes.data as VapiPhoneNumber[] | { data?: VapiPhoneNumber[]; phoneNumbers?: VapiPhoneNumber[] };
      setVapiAssistants(Array.isArray(assistData) ? assistData : (assistData.data ?? (assistData as { assistants?: VapiAssistant[] }).assistants ?? []));
      setVapiPhoneNumbers(Array.isArray(phoneData) ? phoneData : (phoneData.data ?? (phoneData as { phoneNumbers?: VapiPhoneNumber[] }).phoneNumbers ?? []));
    } catch {
      toast.error(t("errorLoadingVapiData"));
    } finally {
      setVapiLoading(false);
    }
  };

  const handleVapiCall = async () => {
    if (!vapiAssistantId || !vapiPhoneNumberId || !user?.tenantId) {
      toast.warning(t("selectAssistantAndPhone"));
      return;
    }
    setVapiCalling(true);
    try {
      await createVapiCall(user.tenantId, [{ number: vapiCustomerNumber }], vapiAssistantId, vapiPhoneNumberId);
      toast.success(t("vapiCallStarted"));
      setVapiOpen(false);
    } catch {
      toast.error(t("errorStartingVapiCall"));
    } finally {
      setVapiCalling(false);
    }
  };

  // restrictedUser — espelho do Vue (InforCabecalhoChat, ItemTicket, Index)
  const isRestricted = isRestrictedUser();
  const { isLiveMode } = useLiveMode();
  const contactName = displayContactName(contact) || t("noName");

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  // Regra Vue: exibe apenas os 5 primeiros caracteres do nome para usuário restrito
  const displayName = isRestricted ? contactName.slice(0, 5) + (contactName.length > 5 ? "..." : "") : contactName;
  const contactNumber = contact?.number || "";
  const contactPic = contact?.profilePicUrl;

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          initial={isMobile ? { x: "100%", opacity: 0 } : { width: 0, opacity: 0 }}
          animate={isMobile ? { x: 0, opacity: 1 } : { width: 360, opacity: 1 }}
          exit={isMobile ? { x: "100%", opacity: 0 } : { width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={isMobile
            ? "absolute inset-0 z-30 bg-background flex flex-col overflow-hidden"
            : "border-l bg-background flex flex-col overflow-hidden shrink-0"}
        >
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-semibold text-sm">{t("contactDetails")}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TicketDetailTab)} className="flex flex-col flex-1 min-h-0">
            <TabsList className="w-full rounded-none border-b h-9 p-0 bg-transparent flex shrink-0 min-w-0">
              <TabsTrigger value="perfil" className="flex-1 min-w-0 text-[11px] sm:text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-1">{t("tabProfile")}</TabsTrigger>
              <TabsTrigger value="atendimento" className="flex-1 min-w-0 text-[11px] sm:text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-1">{t("tabAttend")}</TabsTrigger>
              <TabsTrigger value="gestao" className="flex-1 min-w-0 text-[11px] sm:text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-1">{t("tabManage")}</TabsTrigger>
              <TabsTrigger value="integracoes" className="flex-1 min-w-0 text-[11px] sm:text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-1">{t("tabIntegrations")}</TabsTrigger>
              <TabsTrigger value="utilitarios" className="flex-1 min-w-0 text-[11px] sm:text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-1">{t("tabUtilities")}</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-3 space-y-3">
                {/* === PERFIL (como Vue: perfil) === */}
                <TabsContent value="perfil" className="mt-0 space-y-3">
                  <Card>
                    <CardContent className="pt-4 pb-4 text-center">
                      {/* Regra Vue: blur na foto quando restrictedUser (InforCabecalhoChat.vue:27) ou live mode */}
                      <Avatar
                        className={cn("h-20 w-20 mx-auto mb-2", (isRestricted || isLiveMode) && "blur-sm select-none pointer-events-none", !isRestricted && contactPic && "cursor-zoom-in")}
                        onClick={() => { if (!isRestricted && contactPic) setProfilePicPreview({ url: contactPic, name: contactName }); }}
                      >
                        {contactPic && <AvatarImage src={contactPic} />}
                        <AvatarFallback className="text-xl">{getInitials(contactName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={ticket.isGroup ? "default" : "secondary"}>
                          {ticket.isGroup ? t("group") : t("private")}
                        </Badge>
                        {!isRestricted && contact?.id && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1 px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                            onClick={() => { if (contactSummary) { setSummaryDialogOpen(true); } else { handleGenerateContactSummary(); } }}
                            disabled={loadingContactSummary}
                            title={tContactSummary("title")}
                          >
                            {loadingContactSummary ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            IA
                          </Button>
                        )}
                      </div>
                      <div className="text-left mt-2">
                        {/* Regra Vue: exibe apenas 5 chars do nome; demais campos ocultos (restrictedUserRestriction4 e 5) */}
                        <InfoRow icon={User} label={t("labelName")} value={displayName} onCopy={isRestricted ? undefined : () => handleCopy(contactName)} />
                        {!isRestricted && contactNumber && <InfoRow icon={Phone} label={t("labelPhone")} value={contactNumber} onCopy={() => handleCopy(contactNumber)} />}
                        {!isRestricted && contact?.email && <InfoRow icon={Mail} label={t("labelEmail")} value={contact.email} />}
                        {!isRestricted && contact?.cpf && <InfoRow icon={User} label={t("labelCpf")} value={contact.cpf} />}
                        {!isRestricted && (contact?.birthdayDate || contact?.birthday) && <InfoRow icon={Calendar} label={t("labelBirthday")} value={formatBirthdayDisplay(contact.birthdayDate || contact.birthday)} />}
                        {!isRestricted && contact?.firstName && <InfoRow icon={User} label={t("labelFirstName")} value={contact.firstName} />}
                        {!isRestricted && contact?.lastName && <InfoRow icon={User} label={t("labelLastName")} value={contact.lastName} />}
                        {!isRestricted && contact?.businessName && <InfoRow icon={Briefcase} label={t("labelCompany")} value={contact.businessName} />}
                      </div>
                      {!isRestricted && Array.isArray(contact?.extraInfo) && contact.extraInfo.length > 0 && (
                        <>
                          <Separator className="my-2" />
                          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">{t("extraFields")}</p>
                          {contact.extraInfo.map((field, idx) => (
                            <InfoRow key={idx} icon={ExternalLink} label={field.name} value={String(field.value ?? "")} />
                          ))}
                        </>
                      )}
                      {/* Editar contato: disponível também para grupos (edita o contato do grupo). Telefonia segue oculta via hasTelephony (false em grupo). */}
                      <div className="flex gap-2 mt-2">
                          {/* Regra Vue: botão editar oculto para restrictedUser (restrictedUserRestriction6) */}
                          {!isRestricted && (
                          <Button variant="outline" size="sm" className="flex-1" onClick={handleEditContact}>
                            {t("editContact")}
                          </Button>
                          )}
                          {hasTelephony && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-1">
                                  <PhoneCall className="h-3.5 w-3.5" />
                                  {t("telephony")}
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {hasWabaCall && (
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <PhoneCall className="h-3.5 w-3.5 mr-2" /> {callChannel === "gupshup" ? "Gupshup" : callChannel === "dialog360" ? "Dialog360" : "WABA"}
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuItem onClick={handleWabaCallPermissionRequest}>
                                        <ShieldCheck className="h-3.5 w-3.5 mr-2" /> {t("wabaCallPermissionRequest")}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={handleWabaCall}>
                                        <PhoneCall className="h-3.5 w-3.5 mr-2" /> {t("callWaba")}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={handleOpenWabaCallLogs}>
                                        <List className="h-3.5 w-3.5 mr-2" /> {t("wabaCallLogs")}
                                      </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                )}
                                {hasWavoip && (
                                  <DropdownMenuItem onClick={handleWavoipCall}>
                                    <PhoneOutgoing className="h-3.5 w-3.5 mr-2" /> {t("callWavoip")}
                                  </DropdownMenuItem>
                                )}
                                {sipHabilitado && (
                                  <DropdownMenuItem onClick={handleAsteriskCall}>
                                    <Phone className="h-3.5 w-3.5 mr-2" /> {t("callSip")}
                                  </DropdownMenuItem>
                                )}
                                {smsAtivo && (
                                  <DropdownMenuItem onClick={handleSms}>
                                    <MessageSquare className="h-3.5 w-3.5 mr-2" /> {t("callSms")}
                                  </DropdownMenuItem>
                                )}
                                {vapiAtivo && (
                                  <DropdownMenuItem onClick={handleVapi}>
                                    <Phone className="h-3.5 w-3.5 mr-2" /> {t("callVapi")}
                                  </DropdownMenuItem>
                                )}
                                {hasWavoip && (
                                  <DropdownMenuItem onClick={handleOpenCallLogs}>
                                    <List className="h-3.5 w-3.5 mr-2" /> {t("callLogs")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("tags")}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0">
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {localTags.map((tag, i) => (
                          <Badge key={`${tag.id}-${i}`} style={{ backgroundColor: tag.color || "#3B82F6", color: getReadableTextColor(tag.color || "#3B82F6") }} className="flex items-center gap-1 pr-1">
                            {tag.name ?? tag.tag}
                            <button type="button" onClick={() => handleRemoveTag(tag.id)} className="ml-0.5 hover:opacity-70 leading-none">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      {tags.filter((tg) => tg.isActive !== false).length > 0 && (
                        <Select value={tagSelectValue} onValueChange={(v) => { setTagSelectValue(v); handleAddTag(v); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("addTag")} /></SelectTrigger>
                          <SelectContent>
                            {tags.filter((tg) => tg.isActive !== false).map((tg) => (
                              <SelectItem key={tg.id} value={String(tg.id)}>{tg.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("wallets")}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0">
                      {localWallets.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {localWallets.map((w) => (
                            <Badge key={w.id} variant="outline" className="flex items-center gap-1 pr-1">
                              {w.name}
                              <button type="button" onClick={() => handleRemoveWallet(w.id)} className="ml-0.5 hover:opacity-70 leading-none">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t("noWallet")}</p>
                      )}
                      {users.length > 0 && (
                        <Select value={walletSelectValue} onValueChange={(v) => { setWalletSelectValue(v); handleSetWallet(v); }}>
                          <SelectTrigger className="h-8 text-xs mt-2"><SelectValue placeholder={t("setWallet")} /></SelectTrigger>
                          <SelectContent>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("communication")}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0 flex flex-wrap gap-1">
                      <Button variant="outline" size="sm" onClick={handleMarkRead}><MailOpen className="h-3 w-3 mr-1" /> {t("markRead")}</Button>
                      <Button variant="outline" size="sm" onClick={handleMarkUnread}><Mail className="h-3 w-3 mr-1" /> {t("markUnread")}</Button>
                      <Button variant="outline" size="sm" onClick={handleOpenTicketLogs}><List className="h-3 w-3 mr-1" /> {t("log")}</Button>
                      {ticket.channel === "whatsapp" && (
                        <Button variant="outline" size="sm" onClick={() => setSyncDialogOpen(true)}>{t("syncHistory")}</Button>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 text-yellow-400" /> {t("starredMessages")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0">
                      <Button variant="outline" size="sm" onClick={handleOpenStarred}>
                        <List className="h-3 w-3 mr-1" /> {t("viewStarred")}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* UazAPI/Zapo — Agenda e Labels (canais com agenda/labels nativas) */}
                  {hasChannelAgendaLabels && (
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          {t("uazapiAgenda")}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-muted-foreground text-xs">(ℹ)</span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs text-xs">
                                {t(isZapoTicket ? "zapoAgendaTooltip" : "uazapiAgendaTooltip")}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 pt-0 flex flex-wrap gap-1">
                        <Button variant="outline" size="sm" disabled={uazapiAgendaLoading} onClick={() => handleUazapiAgenda("add")}>
                          {uazapiAgendaLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                          {t("uazapiAgendaAdd")}
                        </Button>
                        <Button variant="outline" size="sm" disabled={uazapiAgendaLoading} onClick={() => handleUazapiAgenda("remove")}>
                          {uazapiAgendaLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <UserX className="h-3 w-3 mr-1" />}
                          {t("uazapiAgendaRemove")}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {hasChannelAgendaLabels && (
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          {t("uazapiLabels")}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-muted-foreground text-xs">(ℹ)</span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs text-xs">
                                {t(isZapoTicket ? "zapoLabelsTooltip" : "uazapiLabelsTooltip")}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 pt-0">
                        {!uazapiLabelsOpen ? (
                          <Button variant="outline" size="sm" disabled={uazapiLabelsLoading} onClick={handleLoadUazapiLabels}>
                            {uazapiLabelsLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Tag className="h-3 w-3 mr-1" />}
                            {t("uazapiLabels")}
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            {uazapiLabelsList.length === 0 ? (
                              <p className="text-xs text-muted-foreground">{t("uazapiLabelsNoLabels")}</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {uazapiLabelsList.map((label) => {
                                  const active = uazapiActiveLabelIds.includes(label.id);
                                  return (
                                    <Badge
                                      key={label.id}
                                      variant={active ? "default" : "outline"}
                                      className="cursor-pointer text-xs"
                                      style={label.color && active ? { backgroundColor: label.color, color: "#fff" } : {}}
                                      onClick={() => setUazapiActiveLabelIds(prev =>
                                        active ? prev.filter(id => id !== label.id) : [...prev, label.id]
                                      )}
                                    >
                                      {label.name}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex gap-1 pt-1">
                              <Button size="sm" disabled={uazapiLabelsLoading} onClick={handleSaveUazapiLabels}>
                                {uazapiLabelsLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                {t("save")}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setUazapiLabelsOpen(false)}>{t("cancel")}</Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {ticket.channel !== "instagram" && ticket.channel !== "telegram" && (
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm">{t("scheduledMessages")}</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 pt-0">
                        {(() => {
                          const visible = (ticket.scheduledMessages ?? []).filter(
                            (m) => !m.isDeleted && !deletedScheduledIds.includes(m.id)
                          );
                          if (visible.length === 0) {
                            return <p className="text-xs text-muted-foreground">{t("noScheduledMessages")}</p>;
                          }
                          return (
                            <ul className="space-y-2">
                              {visible.map((msg) => (
                                <li key={msg.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs">
                                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                    <span className="text-muted-foreground break-words">
                                      {t("scheduledFor")}{" "}
                                      <span className="font-medium text-foreground">
                                        {new Date(msg.scheduleDate).toLocaleString("pt-BR", {
                                          day: "2-digit", month: "2-digit", year: "numeric",
                                          hour: "2-digit", minute: "2-digit",
                                        })}
                                      </span>
                                    </span>
                                    <span className="text-foreground break-all line-clamp-3">{msg.mediaName || msg.body}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteScheduledMessage(msg.id)}
                                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    title={t("deleteScheduled")}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* === ATENDIMENTO (como Vue: atendimento) === */}
                <TabsContent value="atendimento" className="mt-0 space-y-3">
                  {ticket.channel !== "telegram" && (
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm">{t("protocol")}</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 pt-0 flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleSendProtocol}><Send className="h-3 w-3 mr-1" /> {t("send")}</Button>
                        <Button variant="outline" size="sm" onClick={handleOpenProtocolLogs}><List className="h-3 w-3 mr-1" /> {t("log")}</Button>
                      </CardContent>
                    </Card>
                  )}

                  {ticket.channel !== "telegram" && (ratingPrivacy !== "enabled" || user?.profile === "admin" || user?.profile === "super") && (
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm">{t("evaluationLabel")}</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 pt-0 flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleSendEvaluation}><Send className="h-3 w-3 mr-1" /> {t("send")}</Button>
                        <Button variant="outline" size="sm" onClick={handleOpenEvalLogs}><List className="h-3 w-3 mr-1" /> {t("log")}</Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Sentiment analysis card — mostra ultimo resultado persistido + botao para reanalisar */}
                  {(() => {
                    const sent = ticket.sentiment as "positive" | "neutral" | "negative" | "frustrated" | null | undefined;
                    const cfg = sent === "positive"
                      ? { Icon: TrendingUp, cls: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300", labelKey: "sentimentPositive" as const }
                      : sent === "negative"
                      ? { Icon: TrendingDown, cls: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300", labelKey: "sentimentNegative" as const }
                      : sent === "frustrated"
                      ? { Icon: AlertTriangle, cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300", labelKey: "sentimentFrustrated" as const }
                      : sent === "neutral"
                      ? { Icon: Meh, cls: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300", labelKey: "sentimentNeutral" as const }
                      : null;
                    return (
                      <Card>
                        <CardHeader className="py-2 flex-row items-center justify-between gap-2 space-y-0">
                          <CardTitle className="text-sm flex items-center gap-1 min-w-0 flex-1">
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t("sentimentTitle")}</span>
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={handleAnalyzeSentiment}
                            disabled={analyzingSentiment}
                            title={sent ? t("sentimentReanalyze") : t("sentimentAnalyze")}
                          >
                            {analyzingSentiment ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          </Button>
                        </CardHeader>
                        <CardContent className="py-2 pt-0 space-y-2">
                          {!sent && !analyzingSentiment && (
                            <p className="text-xs text-muted-foreground">{t("sentimentEmpty")}</p>
                          )}
                          {analyzingSentiment && !sent && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> {tCopilot("analyzing")}
                            </p>
                          )}
                          {sent && cfg && (
                            <>
                              <Badge variant="outline" className={cn("flex items-center gap-1 w-fit", cfg.cls)}>
                                <cfg.Icon className="h-3 w-3" />
                                <span className="text-[11px] font-medium">{tCopilot(cfg.labelKey)}</span>
                              </Badge>
                              {ticket.sentimentSummary && (
                                <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">{ticket.sentimentSummary}</p>
                              )}
                              {ticket.sentimentAnalyzedAt && (
                                <p className="text-[10px] text-muted-foreground">
                                  {t("sentimentAnalyzedAt")}: {new Date(ticket.sentimentAnalyzedAt).toLocaleString()}
                                </p>
                              )}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })()}

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("notes")}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0 space-y-2">
                      <div
                        className={`relative rounded-md transition-colors ${noteDropActive ? "ring-2 ring-primary bg-primary/5" : ""}`}
                        onDragOver={handleNoteDragOver}
                        onDragLeave={handleNoteDragLeave}
                        onDrop={handleNoteDrop}
                      >
                        {noteDropActive && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-md">
                            <p className="text-xs text-primary font-medium">{t("noteAttach")}</p>
                          </div>
                        )}
                        <Textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onPaste={handleNotePaste}
                          placeholder={t("addNote")}
                          className="text-sm resize-none min-h-[60px]"
                          rows={2}
                        />
                      </div>
                      {noteFilePreview ? (
                        <img src={noteFilePreview} alt="" className="max-h-24 rounded border object-contain" />
                      ) : noteFile ? (
                        <p className="text-xs text-muted-foreground truncate">{noteFile.name}</p>
                      ) : null}
                      <div className="flex gap-2">
                        <input
                          ref={noteFileInputRef}
                          type="file"
                          accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                          className="hidden"
                          onChange={handleNoteFileChange}
                        />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0"
                                onClick={() => noteFileInputRef.current?.click()}
                              >
                                <Paperclip className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{noteFile ? t("noteRemoveAttach") : t("noteAttach")}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleOpenNoteGallery}>
                                <FileImage className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("fromGallery")}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {noteFile && (
                          <Button variant="ghost" size="sm" className="h-8 shrink-0 text-destructive" onClick={() => { setNoteFile(null); setNoteFilePreview(null); if (noteFileInputRef.current) noteFileInputRef.current.value = ""; }}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="sm" className="h-8 shrink-0 ml-auto" onClick={handleAddNote} disabled={!noteText.trim() && !noteFile}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleOpenNoteLogs}><List className="h-3 w-3 mr-1" /> {t("noteLog")}</Button>
                    </CardContent>
                  </Card>

                  <Card className={ticket.isPaused ? "border-yellow-400/50" : ""}>
                    <CardHeader className="py-2">
                      <CardTitle className={`text-sm flex items-center gap-1.5 ${ticket.isPaused ? "text-yellow-600 dark:text-yellow-400" : ""}`}>
                        <Pause className="h-3.5 w-3.5" />
                        {t("pauseReasonTitle")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0 space-y-2">
                      {ticket.isPaused && (
                        ticket.pauseReason
                          ? <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{ticket.pauseReason}</p>
                          : <p className="text-sm text-muted-foreground italic">{t("noPauseReason")}</p>
                      )}
                      <Button variant="outline" size="sm" onClick={handleOpenPauseLogs}>
                        <List className="h-3 w-3 mr-1" /> {t("pauseLog")}
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* === GESTÃO (como Vue: gestao) === */}
                <TabsContent value="gestao" className="mt-0 space-y-3">
                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("ticketActions")}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0 space-y-2">
                      {ticket.status === "open" && (
                        <>
                          <ActionBtn icon={CheckCircle2} label={t("resolveAttendance")} onClick={handleCloseTicket} disabled={isClosing} loading={isClosing} />
                          <ActionBtn icon={Undo2} label={t("returnToQueue")} onClick={handleReturnToQueue} tooltip={t("returnToQueueAutoDistTooltip")} />
                          {ticket.isPaused
                            ? <ActionBtn icon={Play} label={t("resumeAttendance")} onClick={handlePauseResume} variant="default" />
                            : <ActionBtn icon={Pause} label={t("pauseAttendance")} onClick={handlePauseResume} tooltip={t("pauseAttendanceAutoDistTooltip")} />}
                        </>
                      )}
                      {ticket.status !== "open" && (
                        <ActionBtn icon={RotateCcw} label={t("reopenAttendance")} onClick={handleReopenTicket} tooltip={t("reopenAttendanceAutoDistTooltip")} />
                      )}
                      <Separator />
                      <ActionBtn icon={ArrowRightLeft} label={t("transferTicket")} onClick={() => setTransferOpen(true)} tooltip={t("transferTicketAutoDistTooltip")} />
                      <ActionBtn icon={Bot} label={t("transferChatbot")} onClick={() => setChatbotOpen(true)} />
                      <ActionBtn icon={Radio} label={t("transferChannel")} onClick={() => setChannelOpen(true)} />
                      {handoffAvailable && (
                        <ActionBtn
                          icon={PhoneOutgoing}
                          label={t("handoffMenuItem")}
                          onClick={() => {
                            // Pré-preenche a mensagem-ponte; {{link}} é substituído
                            // no envio pelo wa.me do canal vinculado (ICU do next-intl
                            // não aceita chaves literais — token anexado em código).
                            setHandoffMessage(`${t("handoffDefaultMessagePrefix")} {{link}}`);
                            setHandoffOpen(true);
                          }}
                          disabled={!handoffTargetNumber}
                          tooltip={!handoffTargetNumber ? t("handoffNoNumber") : undefined}
                        />
                      )}
                    </CardContent>
                  </Card>

                  {/* Cobranças do atendimento — não renderiza nada quando o ticket
                      não tem nenhuma (caso da grande maioria). */}
                  <TicketCharges ticketId={ticket.id} />

                  {/* Retorno rápido / carência manual (botReopenOverride) — só para
                      quem controla reabertura (tickets_reopen). Muda o comportamento
                      normal: se o cliente responder logo após o encerramento, a
                      conversa volta direto ao destino escolhido, sem o menu do robô. */}
                  {canManageGrace && (
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          {t("ticketGraceTitle")}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-muted-foreground text-xs">(ℹ)</span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs text-xs">
                                {t("ticketGraceTooltip")}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">{t("ticketGraceDesc")}</p>
                      </CardHeader>
                      <CardContent className="py-2 pt-0 space-y-3">
                        {graceEnabled && !!initialGrace?.enabled && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t("ticketGraceActive")}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-sm">{t("ticketGraceEnable")}</Label>
                          <Switch checked={graceEnabled} onCheckedChange={setGraceEnabled} />
                        </div>
                        {graceEnabled && (
                          <>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">{t("ticketGraceDuration")}</Label>
                              <div className="flex gap-2 items-center min-w-0">
                                <Input
                                  type="number"
                                  min={1}
                                  value={graceValue}
                                  onChange={(e) => setGraceValue(e.target.value)}
                                  className="h-8 flex-1 min-w-0"
                                />
                                <Select value={graceUnit} onValueChange={(v) => setGraceUnit(v as "seconds" | "minutes")}>
                                  <SelectTrigger className="h-8 w-[130px] shrink-0"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="seconds">{t("botReopenGraceUnitSeconds")}</SelectItem>
                                    <SelectItem value="minutes">{t("botReopenGraceUnitMinutes")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">{t("ticketGraceDestination")}</Label>
                              <Select value={graceDest} onValueChange={(v) => setGraceDest(v as typeof graceDest)}>
                                <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="lastUser">{t("botReopenDestLastUser")}</SelectItem>
                                  <SelectItem value="closedUser">{t("botReopenDestClosedUser")}</SelectItem>
                                  <SelectItem value="queue">{t("botReopenDestQueue")}</SelectItem>
                                  <SelectItem value="user">{t("botReopenDestUser")}</SelectItem>
                                  <SelectItem value="chatflow">{t("botReopenDestChatFlow")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {graceDest === "queue" && (
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{t("botReopenQueuePicker")}</Label>
                                <Select value={graceQueueId} onValueChange={setGraceQueueId}>
                                  <SelectTrigger className="h-8 w-full"><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                                  <SelectContent>
                                    {queues.filter((q) => q.isActive !== false).map((q) => (
                                      <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {graceDest === "user" && (
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{t("botReopenUserPicker")}</Label>
                                <Select value={graceUserId} onValueChange={setGraceUserId}>
                                  <SelectTrigger className="h-8 w-full"><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                                  <SelectContent>
                                    {users.map((u) => (
                                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {graceDest === "chatflow" && (
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{t("botReopenChatFlowPicker")}</Label>
                                <Select value={graceChatFlowId} onValueChange={setGraceChatFlowId}>
                                  <SelectTrigger className="h-8 w-full"><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                                  <SelectContent>
                                    {(chatFlows || []).map((cf) => (
                                      <SelectItem key={cf.id} value={String(cf.id)}>{cf.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </>
                        )}
                        <div className="flex justify-end">
                          <Button variant="secondary" size="sm" onClick={handleSaveGrace} disabled={graceSaving}>
                            {graceSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                            {t("save")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("funnel")}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleOpenFunil()}><Send className="h-3 w-3 mr-1" /> {t("funnel")}</Button>
                      <Button variant="outline" size="sm" onClick={handleOpenOportunidades}>
                        <List className="h-3 w-3 mr-1" /> {t("opportunities")}
                        {oportunidadesCount > 0 && (
                          <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-destructive text-[10px] text-destructive-foreground px-1 leading-none">
                            {oportunidadesCount}
                          </span>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  {kanbans.length > 0 && (
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm flex items-center justify-between gap-2 min-w-0">
                          <span className="shrink-0">Kanban</span>
                          {kanbanSelecionado && (
                            <Badge variant="secondary" className="text-xs font-normal max-w-[60%] truncate block">
                              {kanbans.find((k) => String(k.id) === kanbanSelecionado)?.name ?? t("selected")}
                            </Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 pt-0 flex gap-2 items-center min-w-0">
                        <Select value={kanbanSelecionado} onValueChange={setKanbanSelecionado}>
                          <SelectTrigger className="h-8 flex-1 min-w-0"><SelectValue placeholder={t("selectKanban")} /></SelectTrigger>
                          <SelectContent>
                            {kanbans.map((k) => (
                              <SelectItem key={k.id} value={String(k.id)}>{k.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="secondary" size="sm" className="shrink-0" onClick={handleSaveKanban} disabled={!kanbanSelecionado}>{t("save")}</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" title={t("removeKanban")} onClick={handleClearKanban}>×</Button>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm flex items-center justify-between gap-2 min-w-0">
                        <span className="shrink-0">{t("demand")}</span>
                        {motivoSelecionado && (() => {
                          const sel = reasonsList.find((m) => String(m.id) === motivoSelecionado);
                          return (
                            <Badge variant="secondary" className="text-xs font-normal flex items-center gap-1.5 max-w-[60%] min-w-0">
                              {sel?.color && (
                                <span
                                  className="inline-block h-2 w-2 rounded-full border border-black/10 shrink-0"
                                  style={{ backgroundColor: sel.color }}
                                />
                              )}
                              <span className="truncate">{sel?.name ?? t("selected")}</span>
                            </Badge>
                          );
                        })()}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0 flex gap-2 items-center min-w-0">
                      <Select value={motivoSelecionado || "none"} onValueChange={(v) => setMotivoSelecionado(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-8 flex-1 min-w-0"><SelectValue placeholder={t("selectDemand")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("none")}</SelectItem>
                          {reasonsList.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              <span className="flex items-center gap-2">
                                {m.color && (
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full border border-black/10 shrink-0"
                                    style={{ backgroundColor: m.color }}
                                  />
                                )}
                                {m.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="secondary" size="sm" className="shrink-0" onClick={handleSaveMotivo}>{t("save")}</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" title={t("removeDemand")} onClick={handleClearMotivo}>×</Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("negotiatedValue")}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0 flex gap-2 items-center">
                      <Input
                        type="number"
                        value={valorNegociado}
                        onChange={(e) => setValorNegociado(e.target.value)}
                        placeholder="0,00"
                        className="h-8 flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleSaveValor()}
                      />
                      <Button variant="secondary" size="sm" onClick={handleSaveValor} disabled={!valorNegociado}>{t("save")}</Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("scheduleSection")}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 pt-0">
                      <Button variant="outline" size="sm" onClick={handleOpenAppt}>
                        <Calendar className="h-3 w-3 mr-1" />
                        {t("createAppointment")}
                      </Button>
                    </CardContent>
                  </Card>

                  {ticket.channel !== "instagram" && ticket.channel !== "telegram" && !String(ticket.channel).includes("hub_") && (
                    <Card>
                      <CardContent className="py-3 flex items-center justify-between">
                        <Label className="text-sm">{t("blockContact")}</Label>
                        <Switch checked={bloquearContato} onCheckedChange={handleBloquearContato} />
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardContent className="py-3 flex items-center justify-between">
                      <Label className="text-sm">{t("blockChatbot")}</Label>
                      <Switch checked={bloquearChatbot} onCheckedChange={handleBloquearChatbot} />
                    </CardContent>
                  </Card>

                </TabsContent>

                {/* === INTEGRAÇÕES (como Vue: integracoes) — só listadas se ativas nas configurações === */}
                <TabsContent value="integracoes" className="mt-0 space-y-3">
                  <p className="text-xs text-muted-foreground">{t("integrationsDesc")}</p>
                  {activeIntegrations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("noIntegrations")}</p>
                  ) : (
                    activeIntegrations.map((c) => (
                      <Card key={c.settingKey}>
                        <CardContent className="py-3 flex items-center justify-between">
                          <span className="text-sm font-medium">{c.label}</span>
                          <Switch
                            checked={!!localIntegrationStatus[c.ticketField]}
                            onCheckedChange={(checked) => handleIntegrationToggle(c.ticketField, !!checked)}
                          />
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                {/* === UTILITÁRIOS (como Vue: utilitarios) === */}
                <TabsContent value="utilitarios" className="mt-0 space-y-3">
                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("extractConversation")}</CardTitle>
                      <p className="text-xs text-muted-foreground">{t("extractDesc")}</p>
                    </CardHeader>
                    <CardContent className="py-2 pt-0">
                      <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={exportingPdf}>
                        <FileDown className="h-3 w-3 mr-1" />
                        {exportingPdf ? t("generatingPdf") : t("exportPdf")}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("updateLid")}</CardTitle>
                      <p className="text-xs text-muted-foreground">{t("updateLidDesc")}</p>
                    </CardHeader>
                    <CardContent className="py-2 pt-0">
                      <Button variant="outline" size="sm" onClick={handleUpdateLid}><RefreshCw className="h-3 w-3 mr-1" /> {t("updateLid")}</Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm">{t("sanitizeContact")}</CardTitle>
                      <p className="text-xs text-muted-foreground">{t("sanitizeContactDesc")}</p>
                    </CardHeader>
                    <CardContent className="py-2 pt-0">
                      <Button variant="outline" size="sm" onClick={handleSanitize}><Shield className="h-3 w-3 mr-1" /> {t("sanitizeContact")}</Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </div>
          </Tabs>

          {/* Demanda obrigatória ao encerrar (forceReason) — espelha o gate do ChatHeader */}
          <Dialog open={forceReasonOpen} onOpenChange={(o) => { if (!o) setForceReasonOpen(false); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("demand")}</DialogTitle>
                <DialogDescription>{t("demandDesc")}</DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Select value={motivoSelecionado || "none"} onValueChange={(v) => setMotivoSelecionado(v === "none" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t("selectDemand")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("none")}</SelectItem>
                    {reasonsList.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        <span className="flex items-center gap-2">
                          {m.color && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border border-black/10 shrink-0"
                              style={{ backgroundColor: m.color }}
                            />
                          )}
                          {m.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setForceReasonOpen(false)}>{t("cancel")}</Button>
                <Button
                  onClick={async () => {
                    if (!motivoSelecionado) { toast.error(t("selectDemandRequired")); return; }
                    setForceReasonOpen(false);
                    try {
                      await updateTicket(ticket.id, { reasons: Number(motivoSelecionado) });
                      toast.success(t("motiveSaved"));
                      onRefresh?.();
                    } catch { toast.error(t("errorSavingMotive")); }
                  }}
                >
                  {t("save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialogs de transferência */}
          <Dialog open={transferOpen} onOpenChange={(open) => { setTransferOpen(open); if (!open) { setTransferQueue(""); setTransferNoQueue(false); setTransferUser(""); setTransferMessage(""); } }}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("transferTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("queue")}</Label>
                  <Select value={transferQueue} disabled={transferNoQueue} onValueChange={(v) => { setTransferQueue(v); setTransferUser(""); }}>
                    <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {queues.filter((q) => q.isActive !== false).map((q) => (
                        <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="ticket-transfer-no-queue"
                      checked={transferNoQueue}
                      onCheckedChange={(v) => {
                        const checked = v === true;
                        setTransferNoQueue(checked);
                        if (checked) setTransferQueue("");
                      }}
                    />
                    <Label htmlFor="ticket-transfer-no-queue" className="text-sm font-normal cursor-pointer">
                      {t("transferNoQueue")}
                    </Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("userOptional")}</Label>
                  <Select value={transferUser} onValueChange={setTransferUser}>
                    <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((u) => !transferQueue || (u.queues || []).some((q) => q.id === parseInt(transferQueue)))
                        .map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("transferMessageLabel")}</Label>
                  <Textarea
                    value={transferMessage}
                    onChange={(e) => setTransferMessage(e.target.value)}
                    placeholder={t("transferMessagePlaceholder")}
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setTransferOpen(false); setTransferQueue(""); setTransferNoQueue(false); setTransferUser(""); setTransferMessage(""); }}>{t("cancel")}</Button>
                <Button onClick={handleTransfer} disabled={!transferQueue && !transferNoQueue}>{t("transfer")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={chatbotOpen} onOpenChange={setChatbotOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("chatbotTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("chatbot")}</Label>
                  <Select value={chatbotFlow} onValueChange={setChatbotFlow}>
                    <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {(chatFlows || []).map((cf) => (
                        <SelectItem key={cf.id} value={String(cf.id)}>{cf.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setChatbotOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleTransferToChatbot} disabled={!chatbotFlow}>{t("transfer")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={channelOpen} onOpenChange={setChannelOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("channelTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("channel")}</Label>
                  <Select value={channelId} onValueChange={setChannelId}>
                    <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent position="popper" side="bottom" sideOffset={4}>
                      {whatsapps.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setChannelOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleTransferChannel} disabled={!channelId}>{t("transfer")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Handoff híbrido — "Continuar em outro número" (WABA → canal vinculado) */}
          <Dialog open={handoffOpen} onOpenChange={(o) => { if (!handoffSending) setHandoffOpen(o); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("handoffMenuItem")}</DialogTitle>
                <DialogDescription>{t("handoffDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1">
                  <Label>{t("handoffTargetLabel")}</Label>
                  <p className="text-sm font-medium">
                    {handoffTarget
                      ? `${handoffTarget.name}${handoffTargetNumber ? ` (+${handoffTargetNumber})` : ""}`
                      : t("handoffNoNumber")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>{t("handoffMessageLabel")}</Label>
                  <Textarea
                    value={handoffMessage}
                    onChange={(e) => setHandoffMessage(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("handoffLinkHint")}{" "}
                    <code className="text-[11px]">{"{{link}}"}</code>
                  </p>
                  {handoffLink && (
                    <p className="text-xs text-muted-foreground break-all">{handoffLink}</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setHandoffOpen(false)} disabled={handoffSending}>{t("cancel")}</Button>
                {!handoffTargetNumber ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          <Button disabled>{t("handoffConfirm")}</Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">{t("handoffNoNumber")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button onClick={handleHandoff} disabled={handoffSending}>
                    {handoffSending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    {t("handoffConfirm")}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("syncTitle")}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{t("syncDesc")}</p>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("syncLimit")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={syncLimit}
                    onChange={(e) => setSyncLimit(Number(e.target.value) || 100)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleSyncHistory}>{t("sync")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={callLogsOpen} onOpenChange={(v) => { setCallLogsOpen(v); if (!v) setCallLogsData([]); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PhoneCall className="h-4 w-4" /> {t("callLogsTitle")} — #{ticket.id}
                </DialogTitle>
              </DialogHeader>
              <div className="h-[60vh] overflow-y-auto">
                {callLogsLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : callLogsData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t("noCallsRegistered")}</p>
                ) : (
                  <div className="space-y-1 pr-2">
                    {callLogsData.map((call, idx) => (
                      <div key={call.id ?? idx} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                        <div className="mt-0.5 shrink-0">
                          {call.direction === "outgoing"
                            ? <PhoneOutgoing className="h-4 w-4 text-primary" />
                            : <PhoneCall className="h-4 w-4 text-green-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{call.phone ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {call.createdAt ? new Date(call.createdAt).toLocaleString("pt-BR") : ""}
                            {call.callDuration != null ? ` · ${call.callDuration}s` : ""}
                            {call.callStatus ? ` · ${call.callStatus}` : ""}
                          </p>
                          {call.user?.name && (
                            <p className="text-xs text-muted-foreground">{call.user.name}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal WABA Call Logs */}
          <Dialog open={wabaCallLogsOpen} onOpenChange={(v) => { setWabaCallLogsOpen(v); if (!v) setWabaCallLogsData([]); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PhoneCall className="h-4 w-4" /> {t("wabaCallLogsTitle")}
                </DialogTitle>
              </DialogHeader>
              <div className="h-[60vh] overflow-y-auto">
                {wabaCallLogsLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : wabaCallLogsData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t("noCallsRegistered")}</p>
                ) : (
                  <div className="space-y-1 pr-2">
                    {wabaCallLogsData.map((call, idx) => (
                      <div key={call.id ?? idx} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                        <div className="mt-0.5 shrink-0">
                          {call.originNumber === call.destinationNumber || call.callStatus === 'Calling'
                            ? <PhoneOutgoing className="h-4 w-4 text-primary" />
                            : <PhoneCall className="h-4 w-4 text-green-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{call.originNumber ?? call.phoneNumber ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {call.createdAt ? new Date(call.createdAt).toLocaleString("pt-BR") : ""}
                            {call.callDuration != null ? ` · ${call.callDuration}s` : ""}
                            {call.callStatus ? ` · ${call.callStatus}` : ""}
                          </p>
                          {(call as any).user?.name && (
                            <p className="text-xs text-muted-foreground">{(call as any).user.name}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal SMS */}
          <Dialog open={smsOpen} onOpenChange={(v) => { setSmsOpen(v); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{t("smsTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("smsNumber")}</Label>
                  <Input value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("smsMessage")}</Label>
                  <Textarea
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    placeholder={t("smsMessagePlaceholder")}
                    rows={4}
                    className="text-sm resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("smsService")}</Label>
                  <Select value={smsService} onValueChange={setSmsService}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("selectService")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comtele">Comtele</SelectItem>
                      <SelectItem value="conecta">ConectaStartup</SelectItem>
                      <SelectItem value="livson">BHI / Livson</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSmsOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleSendSms} disabled={smsSending || !smsService || !smsMessage.trim()}>
                  {smsSending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                  {t("send")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal VAPI */}
          <Dialog open={vapiOpen} onOpenChange={setVapiOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{t("vapiTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("vapiCustomerNumber")}</Label>
                  <Input value={vapiCustomerNumber} onChange={(e) => setVapiCustomerNumber(e.target.value)} className="h-8 text-sm" />
                </div>
                {vapiLoading ? (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("vapiAssistant")}</Label>
                      <Select value={vapiAssistantId} onValueChange={setVapiAssistantId}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("selectAssistant")} /></SelectTrigger>
                        <SelectContent>
                          {vapiAssistants.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("vapiPhoneNumber")}</Label>
                      <Select value={vapiPhoneNumberId} onValueChange={setVapiPhoneNumberId}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("selectNumber")} /></SelectTrigger>
                        <SelectContent>
                          {vapiPhoneNumbers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.number}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setVapiOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleVapiCall} disabled={vapiCalling || vapiLoading || !vapiAssistantId || !vapiPhoneNumberId}>
                  {vapiCalling ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <PhoneCall className="h-3.5 w-3.5 mr-1" />}
                  {t("call")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>
      )}
    </AnimatePresence>

    <ContactEditDialog
      contactId={contact?.id ?? null}
      open={contactEditOpen}
      onClose={() => setContactEditOpen(false)}
      onSaved={() => onRefresh?.()}
    />

    {/* Modal: Mensagens Favoritas */}
    <Dialog open={starredOpen} onOpenChange={(v) => { setStarredOpen(v); if (!v) setStarredMessages([]); }}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-400" /> {t("starredMessages")} — #{ticket.id}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {starredLoading ? (
            <p className="text-xs text-center py-4">{t("loading")}</p>
          ) : starredMessages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("noStarredMessages")}</p>
          ) : (
            <div className="space-y-2 p-1">
              {starredMessages.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  className="w-full text-left border rounded p-2 text-xs space-y-0.5 hover:bg-accent transition-colors"
                  onClick={() => {
                    setStarredOpen(false);
                    onScrollToMessage?.(msg.id);
                  }}
                >
                  <p className="text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="truncate text-foreground">{msg.mediaUrl && !msg.body ? `[${msg.mediaType ?? "mídia"}]` : msg.body}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal: Logs de protocolo */}
    <Dialog open={protocolLogsOpen} onOpenChange={(v) => { setProtocolLogsOpen(v); if (!v) setProtocolLogs([]); }}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle>{t("protocolLogsTitle")} — #{ticket.id}</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {logsLoading ? <p className="text-xs text-center py-4">{t("loading")}</p> : protocolLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("noLogsFound")}</p>
          ) : (
            <div className="space-y-2 p-1">
              {protocolLogs.map((log, i) => (
                <div key={log.id ?? i} className="border rounded p-2 text-xs space-y-0.5">
                  <p className="font-medium">{log.user?.name ?? "Bot"}</p>
                  <p className="text-muted-foreground">{log.protocol ?? t("noProtocolSent")}</p>
                  {log.createdAt && <p className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("pt-BR")}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal: Logs de avaliação */}
    <Dialog open={evalLogsOpen} onOpenChange={(v) => { setEvalLogsOpen(v); if (!v) setEvalLogs([]); }}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("evalLogsTitle")} — #{ticket.id}</DialogTitle>
          {evalLogs.length > 0 && (() => {
            const valid = evalLogs.filter(l => l.evaluation != null && l.evaluation >= 0);
            const avg = valid.length ? (valid.reduce((s, l) => s + (l.evaluation ?? 0), 0) / valid.length).toFixed(1) : null;
            return avg ? <p className="text-xs text-muted-foreground">{t("average", { avg })}</p> : null;
          })()}
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {logsLoading ? <p className="text-xs text-center py-4">{t("loading")}</p> : evalLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("noEvalFound")}</p>
          ) : (
            <div className="space-y-2 p-1">
              {evalLogs.map((log, i) => (
                <div key={log.id ?? i} className="border rounded p-2 text-xs space-y-0.5">
                  <p className="font-medium">{log.user?.name ?? "Bot"}</p>
                  <p>{log.evaluation != null ? `${log.evaluation}/5` : t("inconclusive")}</p>
                  {log.createdAt && <p className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("pt-BR")}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal: Logs de notas */}
    <Dialog open={noteLogsOpen} onOpenChange={(v) => { setNoteLogsOpen(v); if (!v) setNoteLogs([]); }}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle>{t("noteLogsTitle")} — #{ticket.id}</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {logsLoading ? <p className="text-xs text-center py-4">{t("loading")}</p> : noteLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("noNotesFound")}</p>
          ) : (
            <div className="space-y-2 p-1">
              {noteLogs.map((log, i) => (
                <div key={log.id ?? i} className="border rounded p-2 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-medium">{log.user?.name ?? "Bot"}</p>
                    {log.id != null && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setNoteEditingId(log.id!); setNoteEditText(log.notes ?? ""); }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title={t("editNote")}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(log.id!)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                          title={t("deleteNote")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {noteEditingId === log.id ? (
                    <div className="flex flex-col gap-1 mt-1">
                      <Textarea
                        value={noteEditText}
                        onChange={(e) => setNoteEditText(e.target.value)}
                        rows={3}
                        className="text-xs"
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={noteSaving}
                          onClick={() => handleSaveNoteEdit(log.id!)}
                          className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
                        >
                          {noteSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("saveEdit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setNoteEditingId(null)}
                          className="px-2 py-1 rounded border text-xs hover:bg-muted"
                        >
                          {t("cancelEdit")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    (() => {
                      const raw = log.notes ?? "";
                      try {
                        const parsed = JSON.parse(raw) as { title?: string; subtitle?: string };
                        if (parsed && (parsed.title || parsed.subtitle)) {
                          return (
                            <>
                              {parsed.title && <p className="font-medium text-xs">{parsed.title}</p>}
                              {parsed.subtitle && <p className="text-muted-foreground text-xs">{parsed.subtitle}</p>}
                            </>
                          );
                        }
                      } catch { /* not JSON */ }
                      return <NoteLogText text={raw} />;
                    })()
                  )}
                  {log.mediaUrl && (() => {
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
                    const src = log.storageUrl
                      ? log.storageUrl
                      : log.mediaUrl.startsWith("http")
                        ? log.mediaUrl
                        : `${apiUrl}/public/${(ticket as { tenantId?: number }).tenantId}/${log.mediaUrl}`;
                    const isImage = /\.(jpe?g|png|gif|webp|bmp|svg|ico)$/i.test(log.mediaUrl);
                    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(log.mediaUrl);
                    const isAudio = /\.(mp3|ogg|wav|m4a|aac)$/i.test(log.mediaUrl);
                    if (isImage) return (
                      <button type="button" onClick={() => setNoteLogLightboxSrc(src)} className="block relative group/img mt-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="media" className="max-h-40 rounded object-contain" />
                        <div className="absolute inset-0 rounded bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                          <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-md" />
                        </div>
                      </button>
                    );
                    if (isVideo) return <video src={src} controls className="max-h-40 rounded mt-1 w-full" />;
                    if (isAudio) return <audio src={src} controls className="w-full mt-1" />;
                    return <a href={src} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{log.mediaUrl.split("/").pop()}</a>;
                  })()}
                  {log.createdAt && <p className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("pt-BR")}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Lightbox: mídia de log de nota */}
    <Dialog open={!!noteLogLightboxSrc} onOpenChange={(v) => { if (!v) setNoteLogLightboxSrc(null); }}>
      <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
        <DialogTitle className="sr-only">mídia</DialogTitle>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 pr-12">
          <span className="text-sm font-medium truncate">{noteLogLightboxSrc?.split("/").pop() ?? "imagem"}</span>
          <button
            type="button"
            className="rounded-full p-1.5 hover:bg-muted transition-colors"
            onClick={() => { const a = document.createElement("a"); a.href = noteLogLightboxSrc!; a.download = noteLogLightboxSrc!.split("/").pop() ?? "imagem"; a.click(); }}
            title="Download"
          >
            <FileDown className="h-4 w-4" />
          </button>
        </div>
        <div
          className="flex-1 flex items-center justify-center overflow-hidden bg-black/90 cursor-pointer"
          onClick={() => setNoteLogLightboxSrc(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={noteLogLightboxSrc ?? ""}
            alt=""
            className="object-contain max-h-full max-w-full select-none"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal: Galeria para notas */}
    <Dialog open={noteGalleryOpen} onOpenChange={(v) => { setNoteGalleryOpen(v); if (!v) setNoteGallerySearch(""); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileImage className="h-4 w-4" /> {t("fromGallery")}
          </DialogTitle>
        </DialogHeader>
        <div className="shrink-0">
          <Input
            value={noteGallerySearch}
            onChange={(e) => setNoteGallerySearch(e.target.value)}
            placeholder={t("searchGalleryPlaceholder")}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {noteGalleryLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("loadingGallery")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 pr-2 py-1">
              {noteGalleryItems
                .filter((item) => !noteGallerySearch || item.name.toLowerCase().includes(noteGallerySearch.toLowerCase()))
                .map((item) => {
                  const mtype = (item.type || "").toLowerCase();
                  const isImg = mtype.startsWith("image/");
                  const isVid = mtype.startsWith("video/");
                  const isAud = mtype.startsWith("audio/");
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectGalleryForNote(item)}
                      className="relative rounded-lg border-2 border-transparent overflow-hidden hover:border-primary transition-all text-left"
                    >
                      {isImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getGalleryPreviewUrl(item)} alt={item.name} loading="lazy" decoding="async" style={{ width: "100%", height: "96px", objectFit: "cover" }} className={cn(isLiveMode && "live-blur")} />
                      ) : isVid ? (
                        <div className="w-full h-24 bg-muted flex flex-col items-center justify-center gap-1">
                          <FileImage className="h-8 w-8 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground px-1 truncate w-full text-center">{item.name}</span>
                        </div>
                      ) : isAud ? (
                        <div className="w-full h-24 bg-muted flex flex-col items-center justify-center gap-1">
                          <FileImage className="h-8 w-8 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground px-1 truncate w-full text-center">{item.name}</span>
                        </div>
                      ) : (
                        <div className="w-full h-24 bg-muted flex flex-col items-center justify-center gap-1">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground px-1 truncate w-full text-center">{item.name}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              {noteGalleryItems.filter((item) => !noteGallerySearch || item.name.toLowerCase().includes(noteGallerySearch.toLowerCase())).length === 0 && (
                <p className="col-span-3 text-sm text-muted-foreground text-center py-8">{t("noFileFound")}</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setNoteGalleryOpen(false)}>{t("cancel")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal: Logs de pausa */}
    <Dialog open={pauseLogsOpen} onOpenChange={(v) => { setPauseLogsOpen(v); if (!v) setPauseLogs([]); }}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle>{t("pauseLogsTitle")} — #{ticket.id}</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {logsLoading ? <p className="text-xs text-center py-4">{t("loading")}</p> : pauseLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("noPauseLogs")}</p>
          ) : (
            <div className="space-y-2 p-1">
              {pauseLogs.map((log, i) => (
                <div key={log.id ?? i} className="border rounded p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{log.user?.name ?? "—"}</p>
                    {!log.resumedAt && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        {t("pauseActive")}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground space-y-0.5">
                    <p>{t("pauseLogPausedAt")}: {new Date(Number(log.pausedAt)).toLocaleString("pt-BR")}</p>
                    {log.resumedAt
                      ? <p>{t("pauseLogResumedAt")}: {new Date(Number(log.resumedAt)).toLocaleString("pt-BR")}</p>
                      : <p className="text-yellow-600 dark:text-yellow-400">{t("pauseLogResumedAt")}: {t("pauseNotResumedYet")}</p>
                    }
                    {log.resumedAt && (
                      <p>{t("pauseLogDuration")}: {(() => {
                        const ms = Number(log.resumedAt) - Number(log.pausedAt);
                        const m = Math.floor(ms / 60000);
                        const h = Math.floor(m / 60);
                        return h > 0 ? `${h}h ${m % 60}min` : `${m}min`;
                      })()}</p>
                    )}
                  </div>
                  <p className={`italic ${log.pauseReason ? "text-foreground" : "text-muted-foreground"}`}>
                    {log.pauseReason || t("noPauseReason")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal: Criar Oportunidade (Funil) */}
    {/* ---- Appointment Creation Dialog ---- */}
    <Dialog open={apptDialogOpen} onOpenChange={(v) => !savingAppt && setApptDialogOpen(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("newApptDialogTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          {contact && (
            <p className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>
              {displayContactName(contact)}{displayContactIdentity(contact) ? ` — ${displayContactIdentity(contact)}` : ""}
            </p>
          )}
          <div className="space-y-1">
            <Label className="text-xs">{t("apptTitleLabel")}</Label>
            <Input
              value={apptForm.title}
              onChange={(e) => setApptForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t("apptTitlePlaceholder")}
              className="h-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("apptStartAtLabel")}</Label>
              <Input
                type="datetime-local"
                value={apptForm.startAt}
                onChange={(e) => setApptForm((f) => ({ ...f, startAt: e.target.value }))}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("apptEndAtLabel")}</Label>
              <Input
                type="datetime-local"
                value={apptForm.endAt}
                onChange={(e) => setApptForm((f) => ({ ...f, endAt: e.target.value }))}
                className="h-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("apptNotesLabel")}</Label>
            <Textarea
              value={apptForm.notes}
              onChange={(e) => setApptForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={t("apptNotesPlaceholder")}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setApptDialogOpen(false)} disabled={savingAppt}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={handleSaveAppt} disabled={savingAppt}>
            {savingAppt ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {savingAppt ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={funilOpen} onOpenChange={(v) => !funilSaving && setFunilOpen(v)}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editingOpId ? t("editOpportunity") : t("newOpportunity")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1"><Label className="text-xs">{t("opportunityName")} *</Label>
            <Input value={funilForm.name} onChange={(e) => setFunilForm((p) => ({ ...p, name: e.target.value }))} placeholder={t("opportunityNamePlaceholder")} className="h-8" />
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("funnel")} *</Label>
            <Select value={funilForm.pipelineId} onValueChange={(v) => setFunilForm((p) => ({ ...p, pipelineId: v, stageId: "" }))}>
              <SelectTrigger className="h-8"><SelectValue placeholder={t("selectFunnel")} /></SelectTrigger>
              <SelectContent>{pipelines.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("stageLabel")}</Label>
            <Select value={funilForm.stageId} onValueChange={(v) => setFunilForm((p) => ({ ...p, stageId: v }))} disabled={!funilForm.pipelineId}>
              <SelectTrigger className="h-8"><SelectValue placeholder={t("selectStage")} /></SelectTrigger>
              <SelectContent>{stages.filter((s) => String(s.pipelineId) === funilForm.pipelineId).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("responsible")}</Label>
            <Select value={funilForm.responsibleId} onValueChange={(v) => setFunilForm((p) => ({ ...p, responsibleId: v }))}>
              <SelectTrigger className="h-8"><SelectValue placeholder={t("selectResponsible")} /></SelectTrigger>
              <SelectContent>
                {funilUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("closingForecast")}</Label>
            <Input type="date" value={funilForm.closingForecast} onChange={(e) => setFunilForm((p) => ({ ...p, closingForecast: e.target.value }))} className="h-8" />
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("opportunityValue")}</Label>
            <Input type="number" value={funilForm.value} onChange={(e) => setFunilForm((p) => ({ ...p, value: e.target.value }))} placeholder="0,00" className="h-8" />
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("description")}</Label>
            <Textarea value={funilForm.description} onChange={(e) => setFunilForm((p) => ({ ...p, description: e.target.value }))} rows={2} placeholder={t("descriptionPlaceholder")} />
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("opportunityStatus")}</Label>
            <Select value={funilForm.status} onValueChange={(v) => setFunilForm((p) => ({ ...p, status: v }))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("statusOpen")}</SelectItem>
                <SelectItem value="win">{t("statusWin")}</SelectItem>
                <SelectItem value="lose">{t("statusLose")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFunilOpen(false)} disabled={funilSaving}>{t("cancel")}</Button>
          <Button onClick={handleSaveFunil} disabled={funilSaving || !funilForm.name || !funilForm.pipelineId}>
            {funilSaving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal: pergunta se quer criar evento no Google Calendar */}
    <Dialog open={calendarAskOpen} onOpenChange={setCalendarAskOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{tGcal("askTitle")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{tGcal("askMessage")}</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setCalendarAskOpen(false)}>{tGcal("askNo")}</Button>
          <Button onClick={() => { setCalendarAskOpen(false); setCalendarOpen(true); }}>{tGcal("askYes")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal: Google Calendar */}
    <Dialog open={calendarOpen} onOpenChange={(v) => !calendarSaving && setCalendarOpen(v)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("googleCalendarDialogTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1"><Label className="text-xs">{t("selectCalendar")} *</Label>
            <Select value={calendarForm.configId} onValueChange={(v) => setCalendarForm((p) => ({ ...p, configId: v }))}>
              <SelectTrigger className="h-8"><SelectValue placeholder={t("selectCalendar")} /></SelectTrigger>
              <SelectContent>
                {calendarConfigs.filter((c) => c.isActive && c.googleAccessToken && c.googleRefreshToken).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("eventTitle")} *</Label>
            <Input value={calendarForm.summary} onChange={(e) => setCalendarForm((p) => ({ ...p, summary: e.target.value }))} className="h-8" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">{t("eventStartDate")}</Label>
              <Input type="datetime-local" value={calendarForm.startDateTime} onChange={(e) => setCalendarForm((p) => ({ ...p, startDateTime: e.target.value }))} className="h-8" />
            </div>
            <div className="space-y-1"><Label className="text-xs">{t("eventEndDate")}</Label>
              <Input type="datetime-local" value={calendarForm.endDateTime} onChange={(e) => setCalendarForm((p) => ({ ...p, endDateTime: e.target.value }))} className="h-8" />
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("description")}</Label>
            <Textarea value={calendarForm.description} onChange={(e) => setCalendarForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("eventLocation")}</Label>
            <Input value={calendarForm.location} onChange={(e) => setCalendarForm((p) => ({ ...p, location: e.target.value }))} className="h-8" />
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("eventAttendees")}</Label>
            <Input value={calendarForm.attendees} onChange={(e) => setCalendarForm((p) => ({ ...p, attendees: e.target.value }))} className="h-8" placeholder={t("eventAttendeesHint")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCalendarOpen(false)} disabled={calendarSaving}>{t("cancel")}</Button>
          <Button onClick={handleCreateCalendarEvent} disabled={calendarSaving || !calendarForm.configId || !calendarForm.summary}>
            {calendarSaving ? t("saving") : t("createEvent")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal: Oportunidades do contato */}
    <Dialog open={oportunidadesOpen} onOpenChange={setOportunidadesOpen}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0"><DialogTitle>{t("opportunitiesTitle")} — <span className={cn(isLiveMode && "live-blur-text")}>{contact?.name}</span></DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {oportunidadesLoading ? (
            <p className="text-xs text-center py-4">{t("loading")}</p>
          ) : oportunidades.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("noOpportunities")}</p>
          ) : (
            <div className="space-y-2 p-1">
              {oportunidades.map((op, i) => (
                <div key={(op.id as number) ?? i} className="border rounded p-2 text-xs space-y-0.5">
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-medium flex-1">{String(op.name ?? "")}</p>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { handleOpenFunil(op); }} className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => setDeleteOpTarget({ id: op.id as number, name: String(op.name ?? "") })} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {op.pipeline != null && <p className="text-muted-foreground">{t("pipelineLabel")} {String((op.pipeline as Record<string, unknown>)?.name ?? op.pipelineId ?? "")}</p>}
                  {op.stage != null && <p className="text-muted-foreground">{t("stageLabel")} {String((op.stage as Record<string, unknown>)?.name ?? "")}</p>}
                  {op.value != null && <p className="text-muted-foreground">{t("valueLabel", { value: Number(op.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) })}</p>}
                  <p className="text-muted-foreground">{t("statusLabel")} {op.status === "open" ? t("statusOpen") : op.status === "win" ? t("statusWin") : op.status === "lose" ? t("statusLose") : String(op.status ?? "")}</p>
                  {op.createdAt != null && <p className="text-muted-foreground">{new Date(op.createdAt as string).toLocaleDateString("pt-BR")}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal: Confirmar exclusão de oportunidade */}
    <Dialog open={!!deleteOpTarget} onOpenChange={(v) => !deleteOpSaving && !v && setDeleteOpTarget(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("deleteOpportunityTitle")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("deleteOpportunityDesc", { name: deleteOpTarget?.name ?? "" })}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteOpTarget(null)} disabled={deleteOpSaving}>{t("cancel")}</Button>
          <Button variant="destructive" onClick={handleDeleteOp} disabled={deleteOpSaving}>
            {deleteOpSaving ? t("saving") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal: Logs do ticket */}
    <Dialog open={ticketLogsOpen} onOpenChange={(v) => { setTicketLogsOpen(v); if (!v) setTicketLogs([]); }}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle>{t("ticketLogsTitle")} — #{ticket.id}</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          {ticketLogsLoading ? (
            <p className="text-xs text-center py-4">{t("loading")}</p>
          ) : ticketLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("noLogsFound")}</p>
          ) : (
            <div className="space-y-2 p-1">
              {ticketLogs.map((log, i) => (
                <div key={log.id ?? i} className="border rounded p-2 text-xs space-y-0.5">
                  <p className="font-medium">{log.user?.name ?? "Bot"}</p>
                  <p>{TICKET_LOG_LABELS[log.type ?? ""] ?? log.type ?? ""}</p>
                  {log.createdAt && <p className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("pt-BR")}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Confirmação: Enviar Protocolo */}
    <Dialog open={confirmProtocolOpen} onOpenChange={(v) => !sendingProtocol && setConfirmProtocolOpen(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("confirmProtocolTitle")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("confirmProtocolDesc")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmProtocolOpen(false)} disabled={sendingProtocol}>{t("no")}</Button>
          <Button onClick={doSendProtocol} disabled={sendingProtocol}>
            {sendingProtocol ? t("sending") : t("yesSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Confirmação: Enviar Avaliação */}
    <Dialog open={confirmEvalOpen} onOpenChange={(v) => !sendingEval && setConfirmEvalOpen(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("confirmEvalTitle")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("confirmEvalDesc")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmEvalOpen(false)} disabled={sendingEval}>{t("no")}</Button>
          <Button onClick={doSendEvaluation} disabled={sendingEval}>
            {sendingEval ? t("sending") : t("yesSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
      <ProfilePicPreviewDialog preview={profilePicPreview} onClose={() => setProfilePicPreview(null)} blur={isLiveMode} />

      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-violet-600" />
              {tContactSummary("title")}
            </DialogTitle>
            {(contactSummaryProvider || contactSummaryModel) && (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-300">
                  <Sparkles className="h-3 w-3" />
                  {(() => {
                    const labels: Record<string, string> = { openai: "ChatGPT", groq: "Grok", claude: "Claude", gemini: "Gemini" };
                    const p = contactSummaryProvider ? (labels[contactSummaryProvider] ?? contactSummaryProvider) : "";
                    return contactSummaryModel ? `${p} (${contactSummaryModel})` : p;
                  })()}
                </span>
              </div>
            )}
          </DialogHeader>
          <div className="space-y-3 py-1">
            {loadingContactSummary ? (
              <p className="text-sm text-muted-foreground italic flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tContactSummary("generating")}
              </p>
            ) : contactSummary?.trim() ? (
              <>
                <p className={cn("text-sm text-foreground whitespace-pre-wrap leading-relaxed", isLiveMode && "live-blur-text")}>
                  {contactSummary}
                </p>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <Badge variant="outline" className="text-[10px]">
                    {tContactSummary("ticketsAnalyzed", { count: contactSummaryAnalyzed })}
                  </Badge>
                  {contactSummaryGeneratedAt && (
                    <Badge variant="outline" className="text-[10px]">
                      {tContactSummary("generatedAt")}{" "}
                      {contactSummaryGeneratedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </Badge>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">{tContactSummary("empty")}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
              onClick={() => { setSummaryDialogOpen(false); setContactSummaryCooldown(false); handleGenerateContactSummary(); }}
              disabled={loadingContactSummary}
            >
              {loadingContactSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {tContactSummary("generate")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSummaryDialogOpen(false)}>
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de reabertura: atendimento aberto do mesmo contato, destino da
          posse e janela de 24h. Só monta quando há algo a avisar. */}
      <ReopenConfirmDialog
        open={!!reopenPrompt}
        onOpenChange={(o) => { if (!o) setReopenPrompt(null); }}
        sibling={reopenPrompt?.sibling ?? null}
        notices={reopenPrompt?.notices ?? { ownership: null, windowClosed: false }}
        isRestrictedUser={isRestrictedUser()}
        notViewAssignedTickets={getConfigValue("NotViewAssignedTickets") === "enabled"}
        targetWhatsappId={Number((ticket as unknown as { whatsappId?: number }).whatsappId ?? ticket.whatsapp?.id ?? 0) || null}
        onConfirm={() => { setReopenPrompt(null); void reopenTicketNow(); }}
      />
    </>
  );
}

// --- Cobranças do atendimento (template ORDER_DETAILS) ----------------------
// O WhatsApp não avisa quando o cliente paga: a cobrança só sai de `pending` por
// baixa manual. Sem esta lista, saber se a cobrança foi paga exigia rolar o
// histórico até achar a bolha da ficha — pior ainda com mais de uma cobrança.
// Espelha a UX do OrderDetailsSettlement (message-bubble), num lugar só.

const CHARGE_KIND_KEYS: Record<string, string> = {
  pix: "paymentPix",
  link: "paymentLink",
  boleto: "paymentBoleto",
  card: "paymentCard",
};

const CHARGE_STATUS_KEYS: Record<string, string> = {
  pending: "statusPending",
  paid: "statusPaid",
  canceled: "statusCanceled",
  expired: "statusExpired",
  failed: "statusFailed",
};

// Recusas que o operador entende viram texto próprio; o resto mostra o código
// para o suporte em vez de sumir num "erro" genérico.
const CHARGE_ERROR_KEYS: Record<string, string> = {
  ERR_PAYMENT_INVALID_TRANSITION: "errorInvalidTransition",
  ERR_ORDER_STATUS_INVALID_TRANSITION: "errorInvalidTransition",
};

function TicketCharges({ ticketId }: { ticketId: number }) {
  const t = useTranslations("orderDetails");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState<WhatsappPayment[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<{ id: number; kind: "paid" | "cancel" } | null>(null);
  // A lista fica em popup (mesmo padrão de Oportunidades, logo acima nesta aba):
  // inline, um ticket com muitas cobrancas empurraria o resto da Gestao para baixo.
  const [listOpen, setListOpen] = useState(false);
  const mountedRef = useRef(true);

  // A aba só monta quando é aberta (Radix desmonta TabsContent inativo), então a
  // consulta acontece na entrada da Gestão. Backend sem a rota (instalação
  // antiga) devolve 404: falha em silêncio e a seção simplesmente não aparece.
  useEffect(() => {
    mountedRef.current = true;
    listWhatsappPayments({ ticketId })
      .then((list) => { if (mountedRef.current) setRows(list || []); })
      .catch(() => {});
    return () => { mountedRef.current = false; };
  }, [ticketId]);

  const runSettle = async (payment: WhatsappPayment, kind: "paid" | "cancel") => {
    if (busyId) return;
    setBusyId(payment.id);
    try {
      const updated = kind === "paid"
        ? await markPaymentAsPaid(payment.id)
        : await cancelPayment(payment.id);
      // Resposta magra (ou vazia) não pode deixar a linha parada em "pendente".
      const fallbackStatus: WhatsappPaymentStatus = kind === "paid" ? "paid" : "canceled";
      if (mountedRef.current) {
        setRows((prev) => prev.map((r) => (r.id !== payment.id
          ? r
          : updated || {
              ...r,
              status: fallbackStatus,
              paidAt: kind === "paid" ? new Date().toISOString() : r.paidAt,
            })));
      }
      toast.success(kind === "paid" ? t("markedAsPaid") : t("chargeCanceled"));
    } catch (err: unknown) {
      // O interceptor de api.ts rejeita com a RESPOSTA, então o código chega em
      // `data.error`. 403 ERR_NO_PERMISSION já dispara o aviso global — repetir
      // aqui viraria dois toasts para a mesma recusa.
      const status = (err as { status?: number })?.status;
      const code = String(
        (err as { data?: { error?: string } })?.data?.error ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        ""
      );
      if (status === 403 && code === "ERR_NO_PERMISSION") return;
      const mapped = CHARGE_ERROR_KEYS[code];
      if (mapped) toast.error(t(mapped));
      else toast.error(code ? `${t("errorSettleFailed")}: ${code}` : t("errorSettleFailed"));
    } finally {
      if (mountedRef.current) { setBusyId(null); setConfirming(null); }
    }
  };

  // `creating`: o envio ainda está em curso, não há o que mostrar nem dar baixa.
  const charges = rows.filter((r) => r.status !== "creating");
  // A maioria dos atendimentos não tem cobrança — sem nenhuma, nem o título
  // aparece, para a aba continuar exatamente como era.
  if (charges.length === 0) return null;

  const target = confirming ? charges.find((c) => c.id === confirming.id) : null;
  const isCancel = confirming?.kind === "cancel";

  // Pendentes viram badge no gatilho: e a unica informacao que o operador
  // precisa ver sem abrir nada ("tem cobranca esperando pagamento neste ticket?").
  const pendingCount = charges.filter((c) => c.status === "pending").length;

  return (
    <Card>
      <CardHeader className="py-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" />
          {t("chargesTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 pt-0 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setListOpen(true)}>
          <List className="h-3 w-3 mr-1" /> {t("chargesTitle")}
          <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-muted text-[10px] text-muted-foreground px-1 leading-none">
            {charges.length}
          </span>
          {pendingCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-destructive text-[10px] text-destructive-foreground px-1 leading-none">
              {pendingCount}
            </span>
          )}
        </Button>
      </CardContent>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("chargesTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="space-y-2 p-1">
        {charges.map((c) => {
          const kindKey = CHARGE_KIND_KEYS[String(c.paymentKind || "").toLowerCase()];
          const paidAt = c.paidAt
            ? new Date(c.paidAt).toLocaleString(undefined, {
                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
              })
            : "";
          const busy = busyId === c.id;
          return (
            <div key={c.id} className="rounded-md border p-2 space-y-1.5">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-none mb-1">
                    {t("chargeNumber")}
                  </div>
                  <div className="text-xs font-mono break-all leading-snug">{c.referenceId}</div>
                </div>
                <div className="text-sm font-semibold shrink-0">
                  {formatCentsBRL(c.totalAmount, c.currency || "BRL")}
                </div>
              </div>

              {kindKey && (
                <div className="text-[11px] text-muted-foreground break-words">
                  {t("payWith")}: {t(kindKey)}
                </div>
              )}

              {c.status === "paid" && (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{t("statusPaid")}</span>
                  {paidAt && <span className="font-normal text-muted-foreground">{paidAt}</span>}
                </div>
              )}

              {(c.status === "canceled" || c.status === "expired" || c.status === "failed") && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Ban className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{t(CHARGE_STATUS_KEYS[c.status])}</span>
                </div>
              )}

              {c.status === "pending" && (
                <>
                  <p
                    title={t("noteManualSettlement")}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="min-w-0 break-words">{t("statusPending")}</span>
                  </p>
                  <div className="flex flex-col gap-1.5 sm:flex-row">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirming({ id: c.id, kind: "paid" })}
                      className="h-7 flex-1 min-w-0 text-[11px] text-emerald-600 dark:text-emerald-400"
                    >
                      {busy && confirming?.kind === "paid"
                        ? <Loader2 className="h-3 w-3 mr-1 shrink-0 animate-spin" />
                        : <CheckCircle2 className="h-3 w-3 mr-1 shrink-0" />}
                      <span className="min-w-0 truncate">{t("markAsPaid")}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirming({ id: c.id, kind: "cancel" })}
                      className="h-7 flex-1 min-w-0 text-[11px] text-muted-foreground"
                    >
                      {busy && confirming?.kind === "cancel"
                        ? <Loader2 className="h-3 w-3 mr-1 shrink-0 animate-spin" />
                        : <Ban className="h-3 w-3 mr-1 shrink-0" />}
                      <span className="min-w-0 truncate">{t("cancelCharge")}</span>
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

        {confirming && target && (
          <AlertDialog open onOpenChange={(o) => { if (!o && !busyId) setConfirming(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isCancel ? t("confirmCancelTitle") : t("confirmPaidTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isCancel ? t("confirmCancelDescription") : t("confirmPaidDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={!!busyId}>{tCommon("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!!busyId}
                  className={buttonVariants({ variant: isCancel ? "destructive" : "default" })}
                  onClick={(e) => { e.preventDefault(); void runSettle(target, isCancel ? "cancel" : "paid"); }}
                >
                  {!!busyId && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {isCancel ? t("cancelCharge") : t("markAsPaid")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
    </Card>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, variant = "outline", tooltip, disabled, loading,
}: {
  icon: React.ElementType; label: string; onClick: () => void; variant?: "outline" | "default"; tooltip?: string; disabled?: boolean; loading?: boolean;
}) {
  const btn = (
    <Button variant={variant} size="sm" className="w-full justify-start h-8 text-xs" onClick={onClick} disabled={disabled || loading}>
      {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Icon className="mr-2 h-3.5 w-3.5" />} {label}
    </Button>
  );
  if (!tooltip) return btn;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function InfoRow({ icon: Icon, label, value, onCopy, sensitive = true }: { icon: React.ElementType; label: string; value: string; onCopy?: () => void; sensitive?: boolean }) {
  const { isLiveMode } = useLiveMode();
  const blur = sensitive && isLiveMode;
  return (
    <div className="flex items-start gap-2 group py-2 border-b border-border/40 last:border-b-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-[3px]" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-1">{label}</div>
        <div className={cn("text-sm break-all leading-snug", blur && "live-blur-text")}>{value}</div>
      </div>
      {onCopy && (
        <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0 mt-2" onClick={onCopy}>
          <Copy className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
