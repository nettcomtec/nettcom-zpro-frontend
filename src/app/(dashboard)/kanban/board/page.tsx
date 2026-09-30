"use client";

import { formatDate } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { displayContactIdentity } from "@/lib/contact-identity";
import { logger } from "@/lib/logger";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuItem, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Save, RefreshCw, Search, Wallet, Phone, X, ChevronLeft, ChevronRight, MessageSquare, MessagesSquare, Filter, Eye, Info,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SpyContactMessagesPopover } from "@/components/atendimento/spy-contact-messages-dialog";
import { ContactConversationDialog } from "@/components/atendimento/contact-conversation-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn, getInitials } from "@/lib/utils";
import { getReadableTextColor } from "@/lib/color-contrast";
import {
  fetchKanbans, fetchContactsKanban, updateContactKanban,
  type Kanban, type KanbanContact,
} from "@/services/kanban";
import { useTouchDrag } from "@/hooks/use-touch-drag";;
import { createTicket, updateTicket } from "@/services/tickets";
import { findExistingOpenTicket, type ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import { ExistingTicketDialog } from "@/components/atendimento/existing-ticket-dialog";
import { fetchWhatsapps } from "@/services/whatsapp";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchAllUsers, type User } from "@/services/users";
import { fetchSettings } from "@/services/settings";
import { useAuthStore } from "@/stores/auth-store";
import { useWhatsappStore } from "@/stores/whatsapp-store";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { TicketAlreadyAssignedDialog, type TicketAssignedInfo } from "@/components/atendimento/ticket-already-assigned-dialog";
import { useLiveMode } from "@/hooks/use-live-mode";

const CHANNEL_TYPES = [
  { type: "whatsapp", label: "WhatsApp", logo: "whatsapp-logo.png" },
  { type: "baileys", label: "Baileys", logo: "baileys-logo.png" },
  { type: "zapo", label: "Zapo", logo: "zapo-logo.png" },
  { type: "meow", label: "Meow", logo: "meow-logo.png" },
  { type: "evo", label: "Evolution", logo: "evo-logo.png" },
  { type: "evogo", label: "Evolution Go", logo: "evogo-logo.png" },
  { type: "zapi", label: "Z-API", logo: "zapi-logo.png" },
  { type: "uazapi", label: "UAZAPI", logo: "uazapi-logo.png" },
  { type: "waba", label: "WABA", logo: "waba-logo.png" },
  { type: "messenger", label: "Messenger", logo: "messenger-logo.png" },
  { type: "instagram", label: "Instagram", logo: "instagram-logo.png" },
  { type: "hub_instagram", label: "Hub Instagram", logo: "hub_instagram-logo.png" },
  { type: "hub_facebook", label: "Hub Facebook", logo: "hub_facebook-logo.png" },
  { type: "hub_whatsapp_business_account", label: "Hub WBA", logo: "hub_whatsapp-logo.png" },
  { type: "telegram", label: "Telegram", logo: "telegram-logo.png" },
  { type: "webchat", label: "Webchat", logo: "webchat-logo.png" },
];

const NUMBER_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "meow", "evo", "evogo", "zapi", "uazapi", "waba", "hub_whatsapp_business_account"];

// Infer the contact's originating channel from identity fields returned by the API
function inferContactChannel(contact: KanbanContact): string {
  if (contact.instagramPK) return "instagram";
  if (contact.messengerId) return "messenger";
  if (contact.telegramId) return "telegram";
  if (contact.webchatId) return "webchat";
  if (contact.hubWhatsapp) return "hub_whatsapp_business_account";
  if (contact.hubTelegram) return "hub_telegram";
  if (contact.hubSms) return "hub_sms";
  if (contact.hubEmail) return "hub_email";
  if (contact.hubMercadolivre) return "hub_mercadolivre";
  if (contact.hubTiktok) return "hub_tiktok";
  if (contact.hubTwitter) return "hub_twitter";
  if (contact.hubYoutube) return "hub_youtube";
  if (contact.hubLikedin) return "hub_linkedin";
  if (contact.hubOlx) return "hub_olx";
  if (contact.hubIfood) return "hub_ifood";
  if (contact.hubWidget) return "hub_widget";
  if (contact.hubWebchat) return "hub_webchat";
  return "whatsapp"; // default: phone-based contact
}

const EXTRA_CHANNEL_LABELS: Record<string, string> = {
  hub_sms: "Hub SMS",
  hub_telegram: "Hub Telegram",
  hub_email: "Hub E-mail",
  hub_mercadolivre: "Hub Mercado Livre",
  hub_tiktok: "Hub TikTok",
  hub_twitter: "Hub Twitter",
  hub_youtube: "Hub YouTube",
  hub_linkedin: "Hub LinkedIn",
  hub_olx: "Hub OLX",
  hub_ifood: "Hub iFood",
  hub_widget: "Hub Widget",
  hub_webchat: "Hub Webchat",
};

function getChannelLabel(ch: string): string {
  return (
    CHANNEL_TYPES.find((c) => c.type === ch)?.label ??
    EXTRA_CHANNEL_LABELS[ch] ??
    ch
  );
}

function getChannelLogo(ch: string): string | null {
  return CHANNEL_TYPES.find((c) => c.type === ch)?.logo ?? null;
}

interface KanbanLane {
  lane: Kanban;
  contacts: KanbanContact[];
}

function formatLastMessageTime(dateVal?: string | null): string {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return formatDate(d);
}

type TicketStatusCategory = "open" | "pending" | "closed" | "noTicket";
const TICKET_STATUS_KEYS: TicketStatusCategory[] = ["open", "pending", "closed", "noTicket"];

// Categorize a contact by the status of its most recent ticket (null = no ticket)
function ticketStatusCategory(contact: KanbanContact): TicketStatusCategory {
  const s = contact.lastTicketStatus;
  if (!s) return "noTicket";
  if (s === "closed") return "closed";
  if (s === "pending") return "pending";
  return "open"; // "open" or any other active status
}

// ─── Contact Card ────────────────────────────────────────────────────────────

interface KanbanCardProps {
  contact: KanbanContact;
  laneId: number;
  onDragStart: (contact: KanbanContact, fromLaneId: number) => void;
  onRemove: (contact: KanbanContact) => void;
  onStartTicket: (contact: KanbanContact, ch: typeof CHANNEL_TYPES[0], connections: { id: number; name: string }[]) => void;
  channelOptions: { ch: typeof CHANNEL_TYPES[0]; connections: { id: number; name: string }[] }[];
  onTouchStart: (e: React.TouchEvent<HTMLElement>, item: { contact: KanbanContact; laneId: number }) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onOpenCrm: (contact: KanbanContact) => void;
}

function KanbanCard({ contact, laneId, onDragStart, onRemove, onStartTicket, channelOptions, onTouchStart, onTouchMove, onTouchEnd, onOpenCrm }: KanbanCardProps) {
  const t = useTranslations("kanbanBoardPage");
  const { isLiveMode } = useLiveMode();
  const walletName =
    contact.wallet && typeof contact.wallet === "object"
      ? contact.wallet.name
      : typeof contact.wallet === "string"
      ? contact.wallet
      : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart(contact, laneId);
      }}
      onTouchStart={(e) => onTouchStart(e, { contact, laneId })}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all hover:-translate-y-0.5 space-y-2 select-none touch-none"
    >
      {/* Header: avatar + name + actions */}
      <div className="flex items-start gap-2">
        <Avatar className={cn("h-9 w-9 shrink-0", isLiveMode && "live-blur")}>
          {contact.profilePicUrl ? (
            <AvatarImage
              src={contact.profilePicUrl}
              alt={contact.name}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          <AvatarFallback className="text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
            {getInitials(contact.name || contact.pushname)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold text-gray-800 dark:text-gray-100 truncate leading-tight", isLiveMode && "live-blur-text")}>
            {contact.name || contact.pushname || "—"}
          </p>
          {contact.number && (
            <a
              href={`tel:${contact.number}`}
              onClick={(e) => e.stopPropagation()}
              className={cn("flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors", isLiveMode && "live-blur-text")}
            >
              <Phone className="h-2.5 w-2.5" />
              <span>{displayContactIdentity(contact)}</span>
            </a>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <SpyContactMessagesPopover contactId={contact.id} contactName={contact.name ?? contact.pushname ?? undefined}>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title={t("spyConversation")}
              className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </SpyContactMessagesPopover>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenCrm(contact); }}
            title={t("openCrmDialog")}
            className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
          >
            <MessagesSquare className="h-3.5 w-3.5" />
          </button>
          {channelOptions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  title="Iniciar atendimento"
                  className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("startTicketTitle")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {channelOptions.map(({ ch, connections }) => (
                  <DropdownMenuItem
                    key={ch.type}
                    onClick={(e) => { e.stopPropagation(); onStartTicket(contact, ch, connections); }}
                  >
                    <img src={`/${ch.logo}`} alt={ch.label} className="h-4 w-4 object-contain mr-2" />
                    {ch.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(contact);
            }}
            title="Remover do kanban"
            className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contact.tags.slice(0, 4).map((t, i) => (
            <span
              key={t.tagid ?? t.id ?? i}
              className="inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: t.color || "#6b7280", color: getReadableTextColor(t.color || "#6b7280") }}
              title={t.tag}
            >
              {t.tag}
            </span>
          ))}
        </div>
      )}

      {/* Wallet */}
      {walletName && (
        <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
          <Wallet className="h-2.5 w-2.5 shrink-0" />
          <span className={cn("truncate", isLiveMode && "live-blur-text")}>{walletName}</span>
        </div>
      )}

      {/* Last message time */}
      {contact.lastMessageAt && (
        <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
          {contact.lastMessageFromMe ? (
            <ChevronRight className="h-2.5 w-2.5 shrink-0" />
          ) : (
            <ChevronLeft className="h-2.5 w-2.5 shrink-0" />
          )}
          <span>{t("lastMsg")}: {formatLastMessageTime(contact.lastMessageAt)}</span>
        </div>
      )}

      {/* Footer: channel badge + contact id */}
      <div className="flex items-center justify-between">
        {(() => {
          const ch = inferContactChannel(contact);
          const logo = getChannelLogo(ch);
          return (
            <div className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500">
              {logo
                ? <img src={`/${logo}`} alt={ch} className="h-3 w-3 object-contain" />
                : <span className="inline-block h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />}
              <span>{getChannelLabel(ch)}</span>
            </div>
          );
        })()}
        <p className="text-[9px] text-gray-300 dark:text-gray-600">#{contact.id}</p>
      </div>
    </div>
  );
}

// ─── Board Page ───────────────────────────────────────────────────────────────

export default function KanbanBoardPage() {
  const t = useTranslations("kanbanBoardPage");
  const tCommon = useTranslations("common");
  const allowed = usePageAccess("kanban");
  if (!allowed) return <AccessDenied />;
  const router = useRouter();
  const { user, isAdmin, isSuporte, supervisorAdmin, getConfigValue, isRestrictedUser } = useAuthStore();
  const whatsapps = useWhatsappStore((s) => s.whatsapps);
 // Front legado: admin ou (super && supervisorAdmin === 'disabled') vê todos os canais
  const isAdminLike = user?.profile === "admin" || (user?.profile === "super" && supervisorAdmin !== "enabled");
  const setWhatsapps = useWhatsappStore((s) => s.setWhatsapps);

  const [lanes, setLanes] = useState<KanbanLane[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  // Rastreia SÓ os contatos movidos desde o último save/load — o Salvar envia
  // apenas esses (em chunks), em vez de re-gravar o board inteiro.
  const movedIdsRef = useRef<Set<number>>(new Set());
  // Espelho do dirty p/ o listener de beforeunload (registrado uma única vez).
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [notViewAssignedTickets, setNotViewAssignedTickets] = useState(false);
  const [channelFilter, setChannelFilter] = useState("");
  // Status filter (combinable). Default: hide finalizados (closed) to declutter the board.
  const [statusFilter, setStatusFilter] = useState<Set<TicketStatusCategory>>(
    () => new Set<TicketStatusCategory>(["open", "pending", "noTicket"])
  );
  const allStatusSelected = TICKET_STATUS_KEYS.every((k) => statusFilter.has(k));
  const toggleStatus = (key: TicketStatusCategory) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleAllStatus = () => {
    setStatusFilter(allStatusSelected ? new Set<TicketStatusCategory>() : new Set(TICKET_STATUS_KEYS));
  };

  // Mini-CRM dialog (conversa + transferir + notificar + etiquetas)
  const [crmOpen, setCrmOpen] = useState(false);
  const [crmContact, setCrmContact] = useState<KanbanContact | null>(null);

  // Confirmação via AlertDialog (substitui o confirm() nativo): a ação só roda no Confirmar.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ message: string; destructive?: boolean; action: () => void } | null>(null);

  // Start ticket modal state
  const [startTicketOpen, setStartTicketOpen] = useState(false);
  const [startTicketContact, setStartTicketContact] = useState<KanbanContact | null>(null);
  const [startTicketChannelType, setStartTicketChannelType] = useState<string>("");
  const [startTicketChannelLabel, setStartTicketChannelLabel] = useState<string>("");
  const [startTicketConnections, setStartTicketConnections] = useState<{ id: number; name: string }[]>([]);
  const [startTicketConnectionId, setStartTicketConnectionId] = useState<number | null>(null);
  // Aviso cross-canal (flag do tenant crossChannelTicketCheck): ticket aberto em OUTRO canal
  const [crossChannelTicket, setCrossChannelTicket] = useState<ExistingOpenTicket | null>(null);
  const [startTicketQueueId, setStartTicketQueueId] = useState<number | null>(null);
  const [startTicketUserId, setStartTicketUserId] = useState<number | null>(null);
  const [startTicketSubmitting, setStartTicketSubmitting] = useState(false);
  const [assignedDialogOpen, setAssignedDialogOpen] = useState(false);
  const [assignedDialogInfo, setAssignedDialogInfo] = useState<TicketAssignedInfo | null>(null);

  // Drag & drop state (HTML5 native)
  const dragContact = useRef<KanbanContact | null>(null);
  const dragFromLaneId = useRef<number | null>(null);
  const [dragOverLaneId, setDragOverLaneId] = useState<number | null>(null);

  // Horizontal scroll ref + nav helpers (avoid bottom-of-page scrollbar trap)
  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollBoard = useCallback((dir: -1 | 1) => {
    const el = boardRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  }, []);

  // Auto-scroll horizontal nas bordas do board durante o drag — o DnD nativo
  // do HTML5 nao rola containers com overflow, entao arrastar um card para uma
  // coluna fora da viewport exigia soltar no meio do caminho. Loop rAF unico
  // (guard em autoScrollRaf) com delta proporcional a proximidade da borda.
  const autoScrollRaf = useRef<number | null>(null);
  const autoScrollDelta = useRef(0);

  const stopEdgeAutoScroll = useCallback(() => {
    autoScrollDelta.current = 0;
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  const updateEdgeAutoScroll = useCallback((clientX: number) => {
    const el = boardRef.current;
    if (!el) return;
    const EDGE = 80; // px da borda que ativa o auto-scroll
    const MIN_STEP = 8; // px/frame ao entrar na zona
    const MAX_STEP = 20; // px/frame colado na borda
    const rect = el.getBoundingClientRect();
    let delta = 0;
    if (clientX < rect.left + EDGE) {
      const ratio = Math.min(1, (rect.left + EDGE - clientX) / EDGE);
      delta = -(MIN_STEP + (MAX_STEP - MIN_STEP) * ratio);
    } else if (clientX > rect.right - EDGE) {
      const ratio = Math.min(1, (clientX - (rect.right - EDGE)) / EDGE);
      delta = MIN_STEP + (MAX_STEP - MIN_STEP) * ratio;
    }
    autoScrollDelta.current = delta;
    if (delta === 0) {
      stopEdgeAutoScroll();
      return;
    }
    if (autoScrollRaf.current !== null) return; // loop ja ativo — so atualiza o delta
    const step = () => {
      const container = boardRef.current;
      if (!container || autoScrollDelta.current === 0) {
        autoScrollRaf.current = null;
        return;
      }
      container.scrollLeft += autoScrollDelta.current;
      autoScrollRaf.current = requestAnimationFrame(step);
    };
    autoScrollRaf.current = requestAnimationFrame(step);
  }, [stopEdgeAutoScroll]);

  // Cancela o loop de auto-scroll no unmount
  useEffect(() => stopEdgeAutoScroll, [stopEdgeAutoScroll]);

  // ── Available channels (derived from loaded contacts) ────────────────────

  const availableChannels = useMemo(() => {
    const seen = new Set<string>();
    lanes.forEach((bl) => bl.contacts.forEach((c) => seen.add(inferContactChannel(c))));
    return Array.from(seen).sort();
  }, [lanes]);

  // ── Channel helpers ───────────────────────────────────────────────────────

  const getChannelWhatsapps = useCallback((type: string) => {
    const connected = whatsapps.filter((w) => !w.isDeleted && w.status === "CONNECTED" && (w.type || w.channel) === type);
    if (isAdminLike) return connected;
    const allowedIds = ((user?.whatsappAllowed as { id: number }[]) || []).map((w) => w.id);
    return connected.filter((w) => allowedIds.includes(w.id));
  }, [whatsapps, isAdminLike, user?.whatsappAllowed]);

  const getContactChannelOptions = useCallback((contact: KanbanContact) => {
    return CHANNEL_TYPES.flatMap((ch) => {
      const sessions = getChannelWhatsapps(ch.type);
      if (sessions.length === 0) return [];
      if (NUMBER_CHANNEL_TYPES.includes(ch.type)) {
        return contact.number ? [{ ch, connections: sessions }] : [];
      }
      // Bot do Telegram só escreve para quem já falou com ele (telegramId gravado
      // na primeira mensagem do contato).
      if (ch.type === "telegram") {
        return contact.telegramId ? [{ ch, connections: sessions }] : [];
      }
      // Messenger/Instagram require specific fields not present in KanbanContact
      return [];
    });
  }, [getChannelWhatsapps]);

  // ── Start ticket logic ────────────────────────────────────────────────────

  const openStartTicketModal = useCallback((
    contact: KanbanContact,
    ch: typeof CHANNEL_TYPES[0],
    connections: { id: number; name: string }[],
  ) => {
    setStartTicketContact(contact);
    setStartTicketChannelType(ch.type);
    setStartTicketChannelLabel(ch.label);
    setStartTicketConnections(connections);
    setStartTicketConnectionId(connections.length === 1 ? connections[0].id : null);
    setStartTicketQueueId(null);
    setStartTicketUserId(null);
    setStartTicketOpen(true);
  }, []);

  const extract409Ticket = (err: unknown) => {
    const resp = err as { status?: number; data?: Record<string, unknown> };
    if (resp?.status !== 409) return null;
    const d = resp.data;
    if (!d) return null;
    if (d.ticket && typeof d.ticket === "object") return d.ticket as { id: number; status: string; userId?: number; user?: { name: string }; whatsappId?: number | null };
    const raw = d.message ?? d.error;
    if (!raw) return null;
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
  };

  const handleConfirmStartTicket = async (skipPrecheck = false) => {
    if (!startTicketContact || !startTicketConnectionId) return;
    setStartTicketSubmitting(true);

    // Pre-check cross-canal (gated pela flag do tenant): avisa se o contato ja tem ticket
    // aberto/pending em OUTRO canal. Same-channel segue via fluxo 409 (extract409Ticket).
    if (
      !skipPrecheck &&
      getConfigValue("crossChannelTicketCheck") === "enabled" &&
      startTicketContact.number
    ) {
      try {
        const cross = await findExistingOpenTicket({
          number: startTicketContact.number,
          whatsappId: startTicketConnectionId,
          currentUserId: user?.userId ?? null,
        });
        if (cross && cross.whatsappId != null && Number(cross.whatsappId) !== Number(startTicketConnectionId)) {
          setStartTicketOpen(false);
          setCrossChannelTicket(cross);
          setStartTicketSubmitting(false);
          return;
        }
      } catch { /* silenciar — nao bloquear criacao se pre-check falhar */ }
    }

    try {
      const payload: Record<string, unknown> = {
        contactId: startTicketContact.id,
        isActiveDemand: true,
        userId: startTicketUserId ?? user?.userId,
        channel: startTicketChannelType,
        channelId: startTicketConnectionId,
        status: "open",
      };
      if (startTicketQueueId) payload.queueId = startTicketQueueId;
      const { data } = await createTicket(payload);
      const ticketId = data?.id || data?.ticket?.id;
      setStartTicketOpen(false);
      toast.success(t("ticketStarted", { name: startTicketContact.name, id: ticketId }));
      router.push(`/atendimento?ticketId=${ticketId}`);
    } catch (err) {
      const ticketAtual = extract409Ticket(err);
      if (ticketAtual) {
        setStartTicketOpen(false);
        if (notViewAssignedTickets && !isAdmin && !isSuporte) {
          setAssignedDialogInfo({
            ticketId: ticketAtual.id,
            contactName: startTicketContact.name,
            assignedUserId: ticketAtual.userId ?? null,
            assignedUserName: ticketAtual.user?.name ?? null,
            assignedUserProfilePicture:
              (ticketAtual.user as { profilePicture?: string } | undefined)?.profilePicture ?? null,
          });
          setAssignedDialogOpen(true);
          setStartTicketSubmitting(false);
          return;
        }
        const updateData: Record<string, unknown> = {};
        if (ticketAtual.status === "pending") {
          updateData.status = "open";
          updateData.userId = startTicketUserId ?? user?.userId;
          if (startTicketQueueId) updateData.queueId = startTicketQueueId;
        }
        if (ticketAtual.whatsappId === null) updateData.whatsapp = startTicketConnectionId;
        if (Object.keys(updateData).length > 0) {
          try { await updateTicket(ticketAtual.id, updateData); await new Promise((r) => setTimeout(r, 250)); } catch { /* ignore */ }
        }
        toast.info(t("ticketExists", { id: ticketAtual.id, name: startTicketContact.name }));
        router.push(`/atendimento?ticketId=${ticketAtual.id}`);
      } else {
        toast.error(t("createTicketError"));
      }
    } finally {
      setStartTicketSubmitting(false);
    }
  };

  // ── Load data ────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    movedIdsRef.current = new Set();
    try {
      // 1. Load lanes
      const lanesRes = await fetchKanbans();
      const laneList: Kanban[] = lanesRes.data;

      if (laneList.length === 0) {
        setLanes([]);
        return;
      }

      // 2. Load all contacts with pagination
      const allContacts: KanbanContact[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const res = await fetchContactsKanban({ pageNumber: page });
        const d = res.data;
        const contacts: KanbanContact[] = Array.isArray(d)
          ? (d as unknown as KanbanContact[])
          : d?.contacts ?? [];

        // Only include contacts that are assigned to a kanban lane
        contacts.forEach((c) => {
          if (!c.isGroup && c.kanban !== null && c.kanban !== undefined) {
            allContacts.push(c);
          }
        });

        hasMore = d?.hasMore ?? false;
        page++;
        if (page > 30) break; // safety limit
      }

 // Sort contacts by id ascending (matches legacy behaviour)
      allContacts.sort((a, b) => a.id - b.id);

      // 3. Distribute contacts into lanes
      const builtLanes: KanbanLane[] = laneList.map((l) => ({
        lane: l,
        contacts: [],
      }));

      allContacts.forEach((c) => {
        const lane = builtLanes.find((bl) => bl.lane.id === c.kanban);
        if (lane) lane.contacts.push(c);
      });

      setLanes(builtLanes);
    } catch (err) {
      logger.error("Erro ao carregar kanban:", err);
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    fetchWhatsapps().then(({ data }) => {
      const all = Array.isArray(data) ? data : [];
      setWhatsapps(all.filter((w) => !(w as any).isDeleted));
    });
    fetchQueues().then(({ data: q }) => setQueues(q));
    fetchAllUsers().then(({ data }) => {
      const arr = (data?.users || []).filter((u: { profile?: string }) => u.profile !== "superadmin");
      setUsers(arr);
    });
    fetchSettings().then(({ data }) => {
      const list: { key: string; value: string }[] = Array.isArray(data) ? data : data?.settings || [];
      const conf = list.find((s) => s.key === "NotViewAssignedTickets");
      setNotViewAssignedTickets(conf?.value === "enabled");
    });
  }, [loadAll]);

  // ── Drag & drop ──────────────────────────────────────────────────────────

  const { touchStart, touchMove, touchEnd } = useTouchDrag<{ contact: KanbanContact; laneId: number }>({
    dataAttr: "data-lane-id",
    onDrop: ({ contact, laneId: fromLaneId }, zoneId) => {
      const targetLaneId = Number(zoneId);
      if (fromLaneId === targetLaneId) return;
      setLanes((prev) => {
        const next = prev.map((bl) => ({ ...bl, contacts: [...bl.contacts] }));
        const src = next.find((bl) => bl.lane.id === fromLaneId);
        if (src) src.contacts = src.contacts.filter((c) => c.id !== contact.id);
        const tgt = next.find((bl) => bl.lane.id === targetLaneId);
        if (tgt) tgt.contacts.push({ ...contact, kanban: targetLaneId });
        return next;
      });
      movedIdsRef.current.add(contact.id);
      setDirty(true);
    },
  });

  // Touch: mesmo auto-scroll de borda do drag nativo, usando a posicao do dedo
  const handleCardTouchMove = (e: React.TouchEvent) => {
    touchMove(e);
    const touch = e.touches[0];
    if (touch) updateEdgeAutoScroll(touch.clientX);
  };

  const handleCardTouchEnd = (e: React.TouchEvent) => {
    stopEdgeAutoScroll();
    touchEnd(e);
  };

  const handleDragStart = (contact: KanbanContact, fromLaneId: number) => {
    dragContact.current = contact;
    dragFromLaneId.current = fromLaneId;
  };

  const handleDragEnter = (e: React.DragEvent, laneId: number) => {
    e.preventDefault();
    setDragOverLaneId(laneId);
  };

  const handleDragOver = (e: React.DragEvent, laneId: number) => {
    e.preventDefault();
    setDragOverLaneId(laneId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear when leaving the column entirely (not when entering a child element)
    const related = e.relatedTarget as Node | null;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      setDragOverLaneId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetLaneId: number) => {
    e.preventDefault();
    setDragOverLaneId(null);

    const contact = dragContact.current;
    const fromLaneId = dragFromLaneId.current;

    if (!contact || targetLaneId === fromLaneId) {
      dragContact.current = null;
      dragFromLaneId.current = null;
      return;
    }

    setLanes((prev) => {
      const next = prev.map((bl) => ({ ...bl, contacts: [...bl.contacts] }));

      // Remove from source lane
      const src = next.find((bl) => bl.lane.id === fromLaneId);
      if (src) src.contacts = src.contacts.filter((c) => c.id !== contact.id);

      // Add to target lane
      const tgt = next.find((bl) => bl.lane.id === targetLaneId);
      if (tgt) tgt.contacts.push({ ...contact, kanban: targetLaneId });

      return next;
    });

    movedIdsRef.current.add(contact.id);
    setDirty(true);
    dragContact.current = null;
    dragFromLaneId.current = null;
  };

  const handleDragEnd = () => {
    setDragOverLaneId(null);
    dragContact.current = null;
    dragFromLaneId.current = null;
  };

  // ── Remove contact from kanban ───────────────────────────────────────────

  const handleRemove = useCallback((contact: KanbanContact) => {
    setConfirmData({
      message: t("confirmRemove", { name: contact.name || displayContactIdentity(contact) }),
      destructive: true,
      action: async () => {
        try {
          // Sem `number` no payload: remoção do kanban não precisa revalidar sessão.
          await updateContactKanban(contact.id, { kanban: null });
          toast.success(t("removeSuccess"));
          // Remove locally
          setLanes((prev) =>
            prev.map((bl) => ({
              ...bl,
              contacts: bl.contacts.filter((c) => c.id !== contact.id),
            }))
          );
        } catch {
          toast.error(t("removeError"));
        }
      },
    });
    setConfirmOpen(true);
  }, []);

  // ── Save all changes ─────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      // Salva SÓ os contatos movidos desde o último save/load, em chunks de 10.
      // Sem `number` no payload: update de kanban não revalida a sessão
      // (o backend pula o check onWhatsApp quando number está ausente).
      const moved = lanes.flatMap((bl) =>
        bl.contacts
          .filter((contact) => movedIdsRef.current.has(contact.id))
          .map((contact) => ({ contactId: contact.id, laneId: bl.lane.id }))
      );
      const failedIds = new Set<number>();
      const CHUNK_SIZE = 10;
      for (let i = 0; i < moved.length; i += CHUNK_SIZE) {
        const chunk = moved.slice(i, i + CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map(({ contactId, laneId }) => updateContactKanban(contactId, { kanban: laneId }))
        );
        results.forEach((r, idx) => {
          if (r.status === "rejected") failedIds.add(chunk[idx].contactId);
        });
      }
      movedIdsRef.current = failedIds;
      if (failedIds.size > 0) {
        // Falha parcial: os que falharam continuam pendentes (dirty segue true)
        // e serão re-tentados no próximo Salvar.
        toast.error(t("saveError"));
      } else {
        toast.success(t("saveSuccess"));
        setDirty(false);
      }
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  // ── Filtering ────────────────────────────────────────────────────────────

  const filterContacts = (contacts: KanbanContact[]) => {
    let result = contacts;
    // Status filter (combinable): keep a card only if its ticket-status category is selected.
    // When every category is selected this is a no-op (= "mostrar todos").
    if (!allStatusSelected) {
      result = result.filter((c) => statusFilter.has(ticketStatusCategory(c)));
    }
    if (channelFilter) {
      result = result.filter((c) => inferContactChannel(c) === channelFilter);
    }
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.pushname?.toLowerCase().includes(q) ||
        c.number?.includes(q) ||
        String(c.id).includes(q)
    );
  };

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <PageHelp
          description={t("helpDesc")}
          sections={[
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ]}
        />
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8 h-8"
          />
        </div>
        {availableChannels.length > 1 && (
          <Select value={channelFilter || "__all__"} onValueChange={(v) => setChannelFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 w-44 gap-1">
              <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder={t("allChannels")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("allChannels")}</SelectItem>
              {availableChannels.map((ch) => {
                const logo = getChannelLogo(ch);
                return (
                  <SelectItem key={ch} value={ch}>
                    <div className="flex items-center gap-2">
                      {logo && <img src={`/${logo}`} alt={ch} className="h-4 w-4 object-contain" />}
                      {getChannelLabel(ch)}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {t("statusFilterLabel")}
              {!allStatusSelected && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums">
                  {statusFilter.size}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>{t("statusFilterLabel")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={allStatusSelected}
              onCheckedChange={toggleAllStatus}
              onSelect={(e) => e.preventDefault()}
            >
              {t("statusAll")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={statusFilter.has("open")}
              onCheckedChange={() => toggleStatus("open")}
              onSelect={(e) => e.preventDefault()}
            >
              {t("statusOpen")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={statusFilter.has("pending")}
              onCheckedChange={() => toggleStatus("pending")}
              onSelect={(e) => e.preventDefault()}
            >
              {t("statusPending")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={statusFilter.has("closed")}
              onCheckedChange={() => toggleStatus("closed")}
              onSelect={(e) => e.preventDefault()}
            >
              {t("statusClosed")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={statusFilter.has("noTicket")}
              onCheckedChange={() => toggleStatus("noTicket")}
              onSelect={(e) => e.preventDefault()}
            >
              {t("statusNoTicket")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Refresh descarta movimentações não salvas — pede confirmação antes.
            if (dirty) {
              setConfirmData({ message: t("confirmRefreshDiscard"), action: loadAll });
              setConfirmOpen(true);
              return;
            }
            loadAll();
          }}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          {t("refresh")}
        </Button>
        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? t("saving") : t("saveChanges")}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollBoard(-1)} aria-label={tCommon("scrollLeft")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollBoard(1)} aria-label={tCommon("scrollRight")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Board */}
      {lanes.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
          {t("noLanes")}
        </div>
      ) : (
        <div
          ref={boardRef}
          className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-2"
          style={{ scrollbarGutter: "stable" }}
          onDragOver={(e) => updateEdgeAutoScroll(e.clientX)}
          onDragLeave={(e) => {
            // So para quando o ponteiro sai do container de fato (nao ao entrar em filho)
            const related = e.relatedTarget as Node | null;
            if (!related || !(e.currentTarget as HTMLElement).contains(related)) stopEdgeAutoScroll();
          }}
          onDrop={stopEdgeAutoScroll}
          onDragEnd={stopEdgeAutoScroll}
        >
          {lanes.map((bl) => {
            const filtered = filterContacts(bl.contacts);
            const isOver = dragOverLaneId === bl.lane.id;
            const laneColor = bl.lane.color || "#94a3b8";

            return (
              <div
                key={bl.lane.id}
                className="shrink-0 flex flex-col h-full min-h-0"
                style={{ width: 300 }}
                data-lane-id={bl.lane.id}
                onDragEnter={(e) => handleDragEnter(e, bl.lane.id)}
                onDragOver={(e) => handleDragOver(e, bl.lane.id)}
                onDragLeave={(e) => handleDragLeave(e)}
                onDrop={(e) => handleDrop(e, bl.lane.id)}
              >
                {/* Lane header */}
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold mb-2 shrink-0 shadow-sm text-gray-800 dark:text-gray-100"
                  style={{
                    backgroundColor: `${laneColor}22`,
                    borderLeft: `4px solid ${laneColor}`,
                  }}
                >
                  <span className="truncate">{bl.lane.name || bl.lane.tag || `#${bl.lane.id}`}</span>
                  <Badge
                    variant="secondary"
                    className="text-xs ml-2 shrink-0 tabular-nums"
                    style={{ borderColor: laneColor, color: laneColor }}
                  >
                    {filtered.length}
                  </Badge>
                </div>

                {/* Drop zone / cards */}
                <div
                  className={cn(
                    "flex-1 min-h-0 flex flex-col gap-2 rounded-xl p-2 transition-all border-2 overflow-y-auto",
                    isOver
                      ? "ring-2 ring-primary bg-primary/5 border-primary/40"
                      : "border-transparent bg-gray-100/70 dark:bg-gray-800/60"
                  )}
                  style={{ scrollbarWidth: "thin" }}
                  onDragEnd={handleDragEnd}
                >
                  {filtered.map((contact) => {
                    const channelOptions = getContactChannelOptions(contact);
                    return (
                      <KanbanCard
                        key={contact.id}
                        contact={contact}
                        laneId={bl.lane.id}
                        onDragStart={handleDragStart}
                        onRemove={handleRemove}
                        onStartTicket={openStartTicketModal}
                        channelOptions={channelOptions}
                        onTouchStart={touchStart}
                        onTouchMove={handleCardTouchMove}
                        onTouchEnd={handleCardTouchEnd}
                        onOpenCrm={(c) => { setCrmContact(c); setCrmOpen(true); }}
                      />
                    );
                  })}

                  {filtered.length === 0 && (
                    <div className="flex items-center justify-center h-16 text-[11px] text-muted-foreground select-none">
                      {search ? t("noResults") : t("dragHere")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Start Ticket Modal */}
      <Dialog open={startTicketOpen} onOpenChange={(open) => { if (!open) setStartTicketOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("startTicketTitle")}</DialogTitle>
            <DialogDescription>
              {t("contact")}: <strong>{startTicketContact?.name}</strong> — {t("channel")}: <strong>{startTicketChannelLabel}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {startTicketChannelType === "telegram" && (
              <Alert className="py-2 px-3">
                <Info className="h-4 w-4" />
                <AlertDescription className="pl-6 text-xs">
                  {tCommon("telegramStartTicketNote")}
                </AlertDescription>
              </Alert>
            )}
            {startTicketConnections.length > 1 && (
              <div className="space-y-2">
                <Label>{t("connection")} *</Label>
                <Select value={startTicketConnectionId != null ? String(startTicketConnectionId) : ""} onValueChange={(v) => setStartTicketConnectionId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder={t("selectConnection")} /></SelectTrigger>
                  <SelectContent>
                    {startTicketConnections.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("queue")}</Label>
              <Select value={startTicketQueueId != null ? String(startTicketQueueId) : "none"} onValueChange={(v) => { setStartTicketQueueId(v === "none" ? null : Number(v)); setStartTicketUserId(null); }}>
                <SelectTrigger><SelectValue placeholder={t("noQueue")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noQueue")}</SelectItem>
                  {queues.filter((q) => q.isActive !== false).map((q) => (
                    <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("agent")}</Label>
              <Select value={startTicketUserId != null ? String(startTicketUserId) : "none"} onValueChange={(v) => setStartTicketUserId(v === "none" ? null : Number(v))}>
                <SelectTrigger><SelectValue placeholder={t("noAgent")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noAgent")}</SelectItem>
                  {users
                    .filter((u) => {
                      if (!startTicketQueueId) return true;
                      const uWithQueues = u as { queues?: { id: number }[] };
                      return uWithQueues.queues?.some((q) => q.id === startTicketQueueId) ?? true;
                    })
                    .map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartTicketOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => handleConfirmStartTicket()} disabled={startTicketSubmitting || !startTicketConnectionId}>
              {startTicketSubmitting ? t("starting") : t("start")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso cross-canal: contato com ticket aberto em OUTRO canal (flag crossChannelTicketCheck) */}
      <ExistingTicketDialog
        open={!!crossChannelTicket}
        onOpenChange={(o) => { if (!o) setCrossChannelTicket(null); }}
        ticket={crossChannelTicket}
        isRestrictedUser={isRestrictedUser()}
        notViewAssignedTickets={notViewAssignedTickets}
        targetWhatsappId={startTicketConnectionId}
        onProceed={() => handleConfirmStartTicket(true)}
      />

      <TicketAlreadyAssignedDialog
        open={assignedDialogOpen}
        onOpenChange={setAssignedDialogOpen}
        info={assignedDialogInfo}
      />

      <ContactConversationDialog
        open={crmOpen}
        onOpenChange={setCrmOpen}
        contact={crmContact ? {
          id: crmContact.id,
          name: crmContact.name || crmContact.pushname || "",
          number: crmContact.number ?? undefined,
          profilePicUrl: crmContact.profilePicUrl ?? undefined,
        } : null}
        onChanged={loadAll}
      />

      {/* Confirmação (AlertDialog): remoção de contato e refresh com alterações não salvas */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon("confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{confirmData?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={confirmData?.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
              onClick={() => confirmData?.action()}
            >
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
