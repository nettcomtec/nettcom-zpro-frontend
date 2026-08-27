"use client";

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { displayContactIdentity, displayContactName } from "@/lib/contact-identity";
import { handleTicketAccessDenied } from "@/lib/ticket-access-denied";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Search, MessageSquare, Clock, CheckCircle2, Bot, BotOff,
  RefreshCw, Inbox, Info, Users, MoreHorizontal, Phone, Loader2,
  Kanban as KanbanIcon,
  ArrowRightLeft, Undo2, RotateCcw,
  Globe, Mail, Instagram, Facebook, Send as SendIcon,
  XCircle, Eye, MailOpen, SlidersHorizontal,
  ArrowUpDown, CheckSquare, Square,
  Share2, Wallet, Link2, FileText, Star, Filter, UserX, Ban, Paperclip, X, Forward,
  DollarSign, LayoutGrid, LayoutList, FileDown, Shield, Tag, Flag,
  Image as ImageIcon,
  Images,
  LogIn, Smartphone, MessageCircle, Cpu,
  ChevronsDown, ChevronsUp, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pause, Play, Pin, Check, ChevronsUpDown, HelpCircle, Radio, ShoppingBag, Linkedin,
  Youtube, Music2, WifiOff, Wifi, Hourglass,
  Plus, Trash2, Route,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useLocale } from "@/i18n/locale-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TruncateWithTooltip } from "@/components/ui/truncate-with-tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import { cn, getInitials, getAvatarColor, isValidHttpUrl } from "@/lib/utils";
import { ProfilePicPreviewDialog, type ProfilePicPreview } from "@/components/shared/profile-pic-preview-dialog";
import { getReadableTextColor } from "@/lib/color-contrast";
import { normalizeBrPhone } from "@/lib/phone-utils";
import { useTicketStore, type Ticket, type Message } from "@/stores/ticket-store";
import { useTicketFilterStore } from "@/stores/ticket-filter-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useWebphoneStore } from "@/stores/webphone-store";
import { useUrgencyStore } from "@/stores/urgency-store";
import { analyzeSentiment } from "@/services/copilot";
import { isFeatureNotInPlanError } from "@/lib/api";
import { useChatDraftStore } from "@/stores/chat-draft-store";
import { useLiveMode } from "@/hooks/use-live-mode";
import { useSocketStatus } from "@/hooks/use-socket-status";
import type { AxiosProgressEvent } from "axios";
import { useWhatsappStore } from "@/stores/whatsapp-store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { fetchTickets, fetchTicket, updateTicket, updateTicketForce, pauseTicket, resumeTicket, transferToChatbot, fetchTicketSharedByUser, deleteTicketShared, fetchTicketShared, createTicketShared, updateTicketShared, transferTicketChannel, fetchCrossChannelSiblings, type CrossChannelSibling } from "@/services/tickets";
import { useTicketSharedSocket } from "@/hooks/use-ticket-shared-socket";
import {
  fetchMessages, fetchTicketMediaCount, sendMessage as sendMessageApi, sendNoRedis, sendLocation,
  deleteMessage, forwardMessage, forwardToOtherChannel,
  sendReaction, sendReactionWaba, sendReactionInstagram, sendReactionMessenger,
  sendReactionMeow, sendReactionEvo, sendReactionEvoGo, sendReactionUazapi, sendReactionZapi,
  editMessage, editMessageMeow, editMessageEvo, editMessageEvoGo, editMessageZapi, editMessageUazapi, updateScheduledMessageBody,
  toggleStarMessage,
  pinMessage, unpinMessage, fetchPinnedMessages,
  sendTextWaba, sendMediaWaba, sendStickerWaba, sendEmailWebmail,
  sendTextInstagramMeta, sendTextMessengerMeta,
  getWabaTemplates, type WabaTemplate,
  sendIndividualMessage,
  sendWabaTemplateComponents,
  searchMessages as searchMessagesApi,
} from "@/services/messages";
import {
  sendGupshupText,
  sendGupshupImage,
  sendGupshupVideo,
  sendGupshupAudio,
  sendGupshupDocument,
  sendGupshupSticker,
  sendGupshupReaction,
} from "@/services/gupshup-messages";
import {
  sendDialog360Text,
  sendDialog360Image,
  sendDialog360Video,
  sendDialog360Audio,
  sendDialog360Doc,
  sendDialog360Sticker,
  sendDialog360Reaction,
} from "@/services/dialog360-messages";
import { fetchFarewells, type FarewellPrivateMessage } from "@/services/farewell";
import { fetchReasons, type Reason } from "@/services/reasons";
import { fetchEvaluationConfig, updateEvaluationByTicket, type EvaluationConfig } from "@/services/evaluations";
import { sendEvaluationForTicket, channelSupportsEvaluation } from "@/lib/send-evaluation";
import { createWabaTemplateSchedule } from "@/services/schedules";
import { getTemplatesForChannel } from "@/services/channel-templates";
import { sendPrivateMessage } from "@/services/private-chat";
import { fetchChatFlows } from "@/services/chatflow";
import { fetchQueues } from "@/services/queues";
import { fetchUsers, fetchAllUsers, updateUserConfigs } from "@/services/users";
import { fetchContacts, type Contact } from "@/services/contacts";
import { fetchWhatsapps } from "@/services/whatsapp";
import { fetchTags } from "@/services/tags";
import { fetchKanbans } from "@/services/kanban";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { MessageBubble, NON_FORWARDABLE_TYPES } from "@/components/atendimento/message-bubble";
import { MessageInput } from "@/components/atendimento/message-input";
import { TicketDetail } from "@/components/atendimento/ticket-detail";
import { PinMessageDialog, type PinDuration } from "@/components/atendimento/pin-message-dialog";
import { EspiarConversaDialog } from "@/components/atendimento/espiar-conversa-dialog";
import { GlobalMessageSearchDialog } from "@/components/atendimento/global-message-search-dialog";
import { WabaConnectionQualityBadge } from "@/components/atendimento/waba-connection-quality-badge";
import { ReplyViaChannelDialog } from "@/components/atendimento/reply-via-channel-dialog";
import { normalizeTicket } from "@/lib/normalize-ticket";
// Helper compartilhado com o gate do sino (lib/can-user-see-ticket.ts:340) — lista e sino
// precisam usar a MESMA definição de "ticket ainda no fluxo do bot".
import { isTicketInBotFlow } from "@/lib/can-user-see-ticket";
import { dedupeActiveTicketsByContactChannel } from "@/lib/dedupe-active-tickets";
import { findExistingOpenTicket, findCrossChannelSiblingForTicket, type ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import { ExistingTicketDialog } from "@/components/atendimento/existing-ticket-dialog";
import { ReopenConfirmDialog } from "@/components/atendimento/reopen-confirm-dialog";
import { buildReopenNotices, type ReopenNotices } from "@/lib/reopen-notices";
import { buildEmailReplyInfo } from "@/lib/email-reply";
import { buildSignedBody, isWhatsappChannel } from "@/lib/signature";
import { getTicketLastMessagePreview, getTicketListPreview, getSyntheticBodyLabel } from "@/lib/template-preview";
import { normalizeUploadFilename } from "@/lib/chat-upload-validation";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import { PageHelp } from "@/components/layout/page-help";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";

// useLayoutEffect no cliente / useEffect no SSR — o posicionamento inicial do chat
// precisa acontecer ANTES do paint (senão a conversa pisca no topo antes de descer),
// mas useLayoutEffect emite warning no prerender do Next.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function useStatusTabs() {
  const t = useTranslations("atendimentoChat");
  return [
    { value: "open", label: t("tabOpen"), icon: MessageSquare, color: "text-success" },
    { value: "pending", label: t("tabPending"), icon: Clock, color: "text-warning" },
    { value: "closed", label: t("tabClosed"), icon: CheckCircle2, color: "text-muted-foreground" },
  ];
}

// Normaliza a fonte do "tempo aproximado" para epoch-ms.
// lastMessageAt e BIGINT e chega do backend como string numerica ("1751800000000") —
// new Date(string) daria Invalid Date; converter com Number. updatedAt e ISO string —
// usar new Date direto. Number ja vem em epoch-ms.
function toEpochMs(value: string | number): number {
  if (typeof value === "number") return value;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  return new Date(v).getTime();
}

// Fonte do badge de idade da conversa: ultima mensagem real (lastMessageAt, gravado em
// todos os canais e em ambas as direcoes) com fallback para updatedAt. Evita o updatedAt
// "carimbado" por eventos que nao sao mensagem (atribuicao, fila, status, bot, pausa),
// que fazia o tempo parecer menor que a idade real da conversa.
function ticketBadgeDate(ticket: { lastMessageAt?: string | number | null; updatedAt?: string | null }): string | number {
  const lm = ticket.lastMessageAt;
  if (lm != null && Number(lm) > 0) return lm;
  return ticket.updatedAt ?? "";
}

function timeAgo(date: string | number, nowLabel = ""): string {
  const now = Date.now();
  const diff = now - toEpochMs(date);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return nowLabel;
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function timeAgoColor(date: string | number, active = false): string {
  const diff = Date.now() - toEpochMs(date);
  const hours = diff / 3600000;
  if (hours >= 24) return "text-destructive";
  if (hours >= 1) return "text-warning";
  return active ? "text-accent-foreground/60" : "text-muted-foreground";
}

function isValidAvatarUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  if (u.includes("@") && !u.startsWith("http") && !u.startsWith("/")) return false;
  return true;
}

// Cap visual para badges de contagem — evita badge gigante com números longos
const formatCount = (n: number) => (n > 99 ? "99+" : String(n));

const CHANNEL_LOGOS: Record<string, string> = {
  baileys: "/baileys-logo.png",
  zapo: "/zapo-logo.png",
  whatsapp: "/whatsapp-logo.png",
  waba: "/waba-logo.png",
  evo: "/evo-logo.png",
  meow: "/meow-logo.png",
  telegram: "/telegram-logo.png",
  instagram: "/instagram-logo.png",
  facebook: "/facebook-logo.png",
  messenger: "/messenger-logo.png",
  webchat: "/webchat-logo.png",
  uazapi: "/uazapi-logo.png",
  zapi: "/zapi-logo.png",
  webmail: "/webmail-logo.png",
  hub: "/hub-logo.png",
  hub_telegram: "/hub_telegram-logo.png",
  hub_instagram: "/hub_instagram-logo.png",
  hub_facebook: "/hub_facebook-logo.png",
  hub_whatsapp: "/hub_whatsapp-logo.png",
  hub_whatsapp_business_account: "/hub_whatsapp_business_account-logo.png",
  hub_email: "/hub_email-logo.png",
  hub_sms: "/hub_sms-logo.png",
  hub_webchat: "/hub_webchat-logo.png",
  hub_widget: "/hub_widget-logo.png",
  hub_twitter: "/hub_twitter-logo.png",
  hub_linkedin: "/hub_linkedin-logo.png",
  hub_youtube: "/hub_youtube-logo.png",
  hub_olx: "/hub_olx-logo.png",
  hub_ifood: "/hub_ifood-logo.png",
  linkedin: "/linkedin-logo.png",
  mercadolivre: "/hub_mercadolivre-logo.png",
  hub_mercadolivre: "/hub_mercadolivre-logo.png",
  hub_mercado_livre: "/hub_mercado_livre-logo.png",
  hub_ticktok: "/hub_ticktok-logo.png",
  olx: "/olx-logo.png",
  youtube: "/youtube-logo.png",
  tiktok: "/tiktok-logo.png",
  woocommerce: "/woocommerce-logo.png",
  nuvemshop: "/nuvemshop-logo.png",
  waba_oauth: "/waba-logo.png",
  instagram_oauth: "/instagram-logo.png",
  facebook_oauth: "/facebook-logo.png",
  messenger_oauth: "/messenger-logo.png",
};

function getChannelLogo(type?: string): string | null {
  if (!type) return null;
  const key = type.toLowerCase();
  if (CHANNEL_LOGOS[key]) return CHANNEL_LOGOS[key];
  if (key.startsWith("hub")) return CHANNEL_LOGOS["hub"] || null;
  return `/${key}-logo.png`;
}

const CHANNEL_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  whatsapp: { icon: MessageSquare, color: "text-green-500" },
  baileys: { icon: MessageSquare, color: "text-green-500" },
  zapo: { icon: MessageSquare, color: "text-green-500" },
  waba: { icon: MessageSquare, color: "text-green-600" },
  meow: { icon: MessageSquare, color: "text-green-500" },
  evolution: { icon: MessageSquare, color: "text-green-500" },
  telegram: { icon: SendIcon, color: "text-blue-500" },
  instagram: { icon: Instagram, color: "text-pink-500" },
  facebook: { icon: Facebook, color: "text-blue-600" },
  messenger: { icon: Facebook, color: "text-blue-500" },
  email: { icon: Mail, color: "text-orange-500" },
  webchat: { icon: Globe, color: "text-indigo-500" },
  hub_whatsapp: { icon: MessageSquare, color: "text-green-500" },
  hub_instagram: { icon: Instagram, color: "text-pink-500" },
  hub_facebook: { icon: Facebook, color: "text-blue-600" },
  hub_telegram: { icon: SendIcon, color: "text-blue-500" },
  linkedin: { icon: Linkedin, color: "text-blue-700" },
  mercadolivre: { icon: ShoppingBag, color: "text-yellow-500" },
  hub_mercadolivre: { icon: ShoppingBag, color: "text-yellow-500" },
  olx: { icon: Tag, color: "text-orange-500" },
  youtube: { icon: Youtube, color: "text-red-600" },
  tiktok: { icon: Music2, color: "text-pink-500" },
  woocommerce: { icon: ShoppingBag, color: "text-purple-600" },
  nuvemshop: { icon: ShoppingBag, color: "text-blue-600" },
};

function getChannelIcon(channel?: string) {
  if (!channel) return null;
  const key = channel.toLowerCase().replace(/[-\s]/g, "_");
  return CHANNEL_ICON_MAP[key] || { icon: Globe, color: "text-muted-foreground" };
}

const TicketListItem = React.memo(function TicketListItem({
  ticket, active, onClick, onAccept, onClose, onSpy,
  bulkMode, selected, onToggleSelect, isRestricted, kanbansList, reasonsList, density,
  isPinned, onPin, onMarkRead, onMarkUnread, crossSiblings,
}: {
  ticket: Ticket; active: boolean; onClick: () => void;
  onAccept?: (ticket: Ticket) => void;
  onClose?: (ticket: Ticket) => void;
  onSpy?: (ticket: Ticket) => void;
  bulkMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (ticket: Ticket, checked: boolean, shiftKey?: boolean) => void;
  isRestricted?: boolean;
  kanbansList?: { id: number; name: string }[];
  reasonsList?: Reason[];
  density?: "compact" | "comfortable";
  isPinned?: boolean;
  onPin?: (ticket: Ticket) => void;
  onMarkRead?: (ticket: Ticket) => void;
  onMarkUnread?: (ticket: Ticket) => void;
  /** Irmãos open/pending do mesmo contato em OUTROS canais (flag crossChannelTicketCheck) */
  crossSiblings?: CrossChannelSibling[];
}) {
  const tE = useTranslations("atendimentoChatExtra");
  const { isLiveMode } = useLiveMode();
  // Canal híbrido (coexistência com vínculo): selo no item do ticket. Selector
  // primitivo (boolean) — só re-renderiza quando o estado híbrido deste canal muda.
  const wid = (ticket as unknown as { whatsappId?: number }).whatsappId ?? ticket.whatsapp?.id;
  const isHybridTicket = useWhatsappStore((s) => {
    const w = s.whatsapps.find((x) => x.id === wid);
    return !!w && w.hybridMode === "coexistence" && !!w.linkedChannelId;
  });
  // Nome do canal com fallback pelo whatsapp-store: ticket recém-inserido por
  // socket pode chegar sem `whatsapp` (payload magro do ticket:update) — sem o
  // fallback o badge do canal some até o refetch REST (F5).
  const storeChannelName = useWhatsappStore((s) => s.whatsapps.find((x) => x.id === wid)?.name);
  const channelName = ticket.whatsapp?.name || storeChannelName;
  const currentUserId = useAuthStore((s) => s.user?.userId ?? null);
  const isSharedWithMe = currentUserId != null
    && Array.isArray((ticket as unknown as { userIdArray?: number[] }).userIdArray)
    && ((ticket as unknown as { userIdArray?: number[] }).userIdArray as number[]).includes(currentUserId);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  // Bloquear/retomar chatbot deste ticket direto no card (pendentes — onde o bot atua)
  const [itemBotBlocked, setItemBotBlocked] = useState(!!(ticket as unknown as { botStopped?: boolean }).botStopped);
  const [itemBotToggling, setItemBotToggling] = useState(false);
  useEffect(() => {
    setItemBotBlocked(!!(ticket as unknown as { botStopped?: boolean }).botStopped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, (ticket as unknown as { botStopped?: boolean }).botStopped]);
  const handleItemToggleBot = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (itemBotToggling) return;
    const next = !itemBotBlocked;
    setItemBotBlocked(next);
    setItemBotToggling(true);
    try {
      await updateTicket(ticket.id, { botStopped: next });
      toast.success(next ? tE("chatbotTicketBlocked") : tE("chatbotTicketUnblocked"));
    } catch {
      setItemBotBlocked(!next);
      toast.error(tE("errorBlockingChatbotTicket"));
    } finally {
      setItemBotToggling(false);
    }
  };
  const [profilePicPreview, setProfilePicPreview] = useState<ProfilePicPreview | null>(null);
  const touchStartX = useRef(0);
  const SWIPE_THRESHOLD = 70;
  // Urgência: store em memória (auto-análise da sessão) com fallback para o
  // valor persistido no ticket (ticket.sentiment). Assim o badge aparece mesmo
  // após reload, e a auto-análise do front continua sobrescrevendo se mais nova.
  const storeIsUrgent = useUrgencyStore((s) => s.isUrgent(ticket.id));
  const storeHasEntry = useUrgencyStore((s) => !!s.getSentiment(ticket.id));
  const isUrgent = storeHasEntry ? storeIsUrgent : ticket.sentiment === "frustrated";
  const draft = useChatDraftStore((s) => s.drafts[ticket.id]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - touchStartX.current;
    if (ticket.status === "open" && delta < 0)
      setSwipeX(Math.max(delta, -SWIPE_THRESHOLD * 1.5));
    else if (ticket.status === "pending" && delta > 0)
      setSwipeX(Math.min(delta, SWIPE_THRESHOLD * 1.5));
  };
  const handleTouchEnd = () => {
    if (swipeX <= -SWIPE_THRESHOLD && ticket.status === "open" && onClose) {
      setIsClosing(true);
      Promise.resolve(onClose(ticket)).finally(() => { setIsClosing(false); setSwipeX(0); });
    } else if (swipeX >= SWIPE_THRESHOLD && ticket.status === "pending" && onAccept) {
      setIsAccepting(true);
      Promise.resolve(onAccept(ticket)).finally(() => { setIsAccepting(false); setSwipeX(0); });
    } else {
      setSwipeX(0);
    }
  };

  const avatarColor = getAvatarColor(ticket.contact?.name);
  // When active, bg-accent (derived from primary) may have low contrast with muted-foreground in dark mode
  const mutedText = active ? "text-accent-foreground/60" : "text-muted-foreground";

  // Mesma lógica do Vue (ItemTicket.vue):
  // open + não respondido + não é grupo → amarelo (ticketNotAnswered)
  // open + respondido → azul (primary)
  // pending → vermelho
  // closed → verde
  const isNotAnswered = ticket.status === "open" && ticket.answered === false && !ticket.isGroup;
  const borderColorClass = isNotAnswered
    ? "border-l-amber-400"
    : ticket.status === "open"
    ? "border-l-gray-400"
    : ticket.status === "pending"
    ? "border-l-red-500"
    : ticket.status === "closed"
    ? "border-l-emerald-500"
    : "border-l-transparent";

  const channelInfo = getChannelIcon(ticket.channel);
  const isPending = ticket.status === "pending";
  const isClosed = ticket.status === "closed";
  const isOpen = ticket.status === "open";
  // Pendente: clique no card abre o Espiar Conversa — SOMENTE quando o usuário tem
  // acesso ao espiar (onSpy é undefined quando controlFeatures && profile === "user",
  // mesmo gate do botão de olho). Sem acesso, o card pendente continua no-op.
  const cardClick = bulkMode ? undefined : isPending ? (onSpy ? () => onSpy(ticket) : undefined) : onClick;

  return (
    <>
    <div
      className={cn(
        "group w-full min-w-0 max-w-full grid grid-cols-[auto_1fr] gap-3 p-3 text-left border-l-[3px] border-b border-border/15 last:border-b-0 hover:bg-accent/50 cursor-pointer relative overflow-hidden box-border",
        swipeX !== 0 ? "transition-none" : "transition-colors",
        borderColorClass,
        active && "bg-accent",
        bulkMode && onToggleSelect && "grid-cols-[auto_auto_1fr]",
        swipeX <= -SWIPE_THRESHOLD && "bg-red-50 dark:bg-red-950/30",
        swipeX >= SWIPE_THRESHOLD && "bg-emerald-50 dark:bg-emerald-950/30",
        !bulkMode && !!cardClick && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !bulkMode && isPending && !onSpy && "cursor-default",
      )}
      style={{
        width: "100%", maxWidth: "100%", minWidth: 0,
        transform: `translateX(${swipeX}px)`,
        ...(!active && ticket.queue?.color ? { backgroundColor: `${ticket.queue.color}0d` } : {}),
      }}
      {...(!bulkMode && cardClick ? {
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          // Guard: só reage quando o foco está no próprio card — não sequestra
          // Enter/Espaço de botões/inputs filhos (pin, marcar lido, etc.)
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            cardClick();
          }
        },
      } : {})}
      onClick={cardClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {bulkMode && onToggleSelect && (
        <div
          className="flex items-center col-start-1"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(ticket, !selected, e.shiftKey); }}
        >
          <Checkbox checked={selected} onCheckedChange={() => {}} />
        </div>
      )}
      <div className="relative flex-shrink-0" onClick={(e) => { if (isPending) e.stopPropagation(); }}>
        {isPending && onAccept ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="h-10 w-10 relative shrink-0 overflow-hidden flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  style={{ borderRadius: "var(--avatar-radius)" }}
                  disabled={isAccepting}
                  onClick={() => {
                    setIsAccepting(true);
                    Promise.resolve(onAccept(ticket)).finally(() => setIsAccepting(false));
                  }}
                >
                  {!isRestricted && isValidAvatarUrl(ticket.contact?.profilePicUrl) && (
                    <img
                      src={ticket.contact!.profilePicUrl!}
                      alt=""
                      className={cn("absolute inset-0 h-full w-full object-cover", isLiveMode && "live-blur")}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <span className="absolute inset-0 bg-black/60" />
                  <span className="relative z-10 flex items-center justify-center text-white">
                    {isAccepting ? <RefreshCw className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{tE("attend")}</TooltipContent>
            </Tooltip>
            {/* Unread count badge on avatar (pending tickets with accept button) */}
            {(ticket.unreadMessages ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center px-1 z-10 pointer-events-none">
                {formatCount(ticket.unreadMessages ?? 0)}
              </span>
            )}
            {/* Channel logo at bottom-right (pending) */}
            {ticket.channel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background border border-border overflow-hidden flex items-center justify-center z-10 pointer-events-none">
                    <img
                      src={getChannelLogo(ticket.channel) || ""}
                      alt={ticket.channel}
                      className="h-3 w-3 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{tE("channelLabel", { channel: ticket.channel })}</TooltipContent>
              </Tooltip>
            )}
            {isHybridTicket && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-success border border-background flex items-center justify-center z-10 pointer-events-none">
                    <Route className="h-2.5 w-2.5 text-white" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{tE("hybridTicketBadge")}</TooltipContent>
              </Tooltip>
            )}
          </>
        ) : (
          <>
            {/* Avatar com blur para usuário restrito (restrictedUser) ou modo live */}
            <Avatar
              className={cn("h-10 w-10", (isRestricted || isLiveMode) && "blur-sm", !isRestricted && isValidAvatarUrl(ticket.contact?.profilePicUrl) && "cursor-zoom-in")}
              onClick={(e) => {
                if (!isRestricted && isValidAvatarUrl(ticket.contact?.profilePicUrl)) {
                  e.stopPropagation();
                  setProfilePicPreview({ url: ticket.contact!.profilePicUrl!, name: ticket.contact?.name, isGroup: ticket.isGroup });
                } else if (!bulkMode) {
                  onClick();
                }
              }}
            >
              {!isRestricted && isValidAvatarUrl(ticket.contact?.profilePicUrl) && (
                <AvatarImage src={ticket.contact!.profilePicUrl!} />
              )}
              <AvatarFallback className="text-xs font-semibold" style={{ backgroundColor: avatarColor.background, color: avatarColor.color }}>{getInitials(ticket.contact?.name || "?")}</AvatarFallback>
            </Avatar>
            {/* Unread count badge on avatar (open + pending tickets) */}
            {(ticket.status === "open" || ticket.status === "pending") && (ticket.unreadMessages ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center px-1 z-10">
                {formatCount(ticket.unreadMessages ?? 0)}
              </span>
            )}
            {/* Channel logo at bottom-right of avatar */}
            {ticket.channel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background border border-border overflow-hidden flex items-center justify-center z-10">
                    <img
                      src={getChannelLogo(ticket.channel) || ""}
                      alt={ticket.channel}
                      className="h-3 w-3 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{tE("channelLabel", { channel: ticket.channel })}</TooltipContent>
              </Tooltip>
            )}
            {isHybridTicket && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-success border border-background flex items-center justify-center z-10 pointer-events-none">
                    <Route className="h-2.5 w-2.5 text-white" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{tE("hybridTicketBadge")}</TooltipContent>
              </Tooltip>
            )}
            {/* Pulsing dot for unanswered open tickets */}
            {ticket.status === "open" && ticket.answered === false && !ticket.isGroup && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="absolute bottom-0 left-0 h-2.5 w-2.5 rounded-full bg-amber-400 ring-1 ring-background animate-pulse" />
                </TooltipTrigger>
                <TooltipContent side="left">{tE("notAnswered")}</TooltipContent>
              </Tooltip>
            )}
            {/* Urgency badge — sentiment frustrated */}
            {isUrgent && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-background animate-pulse z-20" />
                </TooltipTrigger>
                <TooltipContent side="left">{tE("urgencyBadge")}</TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>

      <div className="min-w-0 overflow-hidden flex flex-col gap-0.5">
        {density === "compact" ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn("text-xs font-medium truncate min-w-0 flex-1", active && "text-accent-foreground", isLiveMode && "live-blur-text")}>
              {isRestricted
                ? `${(ticket.contact?.name || tE("contact")).slice(0, 5)}...`
                : (ticket.contact?.name || tE("noName"))}
            </span>
            {ticket.queue && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: ticket.queue.color }} />}
            <span className={cn("text-[10px] whitespace-nowrap shrink-0", timeAgoColor(ticketBadgeDate(ticket), active))}>
              {timeAgo(ticketBadgeDate(ticket), tE("now"))}
            </span>
          </div>
        ) : (<>
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* Nome do contato com truncamento para usuário restrito */}
          {isRestricted ? (
            <span className={cn("text-sm font-medium truncate min-w-0 flex-1", active && "text-accent-foreground", isLiveMode && "live-blur-text")}>
              {`${(ticket.contact?.name || tE("contact")).slice(0, 5)}...`}
            </span>
          ) : (
            <TruncateWithTooltip
              as="span"
              text={ticket.contact?.name || tE("noName")}
              className={cn("text-sm font-medium flex-1", active && "text-accent-foreground", isLiveMode && "live-blur-text")}
            />
          )}
          <span className={cn("text-[10px] shrink-0", mutedText)}>#{ticket.id}</span>
          <div className="flex items-center gap-1 shrink-0 flex-none">
            {ticket.imported && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <FileDown className="h-3 w-3 text-info shrink-0" />
                </TooltipTrigger>
                <TooltipContent>{tE("importedTooltip")}</TooltipContent>
              </Tooltip>
            )}
            <span className={cn("text-[10px] whitespace-nowrap", timeAgoColor(ticketBadgeDate(ticket), active))}>
              {timeAgo(ticketBadgeDate(ticket), tE("now"))}
            </span>
            <div className={cn("items-center gap-0.5", isPinned ? "flex" : "hidden group-hover:flex group-focus-within:flex [@media(pointer:coarse)]:flex")}>
              {onPin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onPin(ticket); }}
                      className={cn(
                        "h-6 w-6 rounded flex items-center justify-center",
                        isPinned
                          ? "text-primary hover:bg-primary/10"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <Pin className="h-3.5 w-3.5" style={isPinned ? { fill: "currentColor" } : {}} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{isPinned ? tE("unpinTicket") : tE("pinTicket")}</TooltipContent>
                </Tooltip>
              )}
              {(ticket.unreadMessages ?? 0) > 0 && onMarkRead && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onMarkRead(ticket); }}
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <MailOpen className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tE("markRead")}</TooltipContent>
                </Tooltip>
              )}
              {(ticket.unreadMessages ?? 0) === 0 && onMarkUnread && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onMarkUnread(ticket); }}
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tE("markUnread")}</TooltipContent>
                </Tooltip>
              )}
              {(ticket.status === "open" || ticket.status === "pending") && onClose && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      disabled={isClosing}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsClosing(true);
                        Promise.resolve(onClose(ticket)).finally(() => setIsClosing(false));
                      }}
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900 text-red-500 disabled:opacity-50"
                    >
                      {isClosing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tE("resolve")}</TooltipContent>
                </Tooltip>
              )}
            </div>
            {isPending && (ticket.chatbot || itemBotBlocked) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={itemBotToggling}
                    onClick={handleItemToggleBot}
                    className={cn(
                      "h-7 w-7 rounded flex items-center justify-center shrink-0 disabled:opacity-50",
                      itemBotBlocked
                        ? "hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-500"
                        : "hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-500"
                    )}
                  >
                    {itemBotBlocked ? <BotOff className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{itemBotBlocked ? tE("resumeChatbotTicket") : tE("blockChatbotTicket")}</TooltipContent>
              </Tooltip>
            )}
            {isPending && onSpy && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSpy(ticket); }}
                    className="h-7 w-7 rounded flex items-center justify-center hover:bg-primary/10 text-primary shrink-0"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tE("spyConversation")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {draft ? (
          <p className={cn("text-xs truncate min-w-0 italic", isLiveMode && "live-blur-text")} title={isLiveMode ? undefined : `${tE("draftLabel")} ${draft}`}>
            <span className="text-amber-600 dark:text-amber-400 font-semibold not-italic mr-1">{tE("draftLabel")}</span>
            <span className={mutedText}>{draft}</span>
          </p>
        ) : (
          <p className={cn("text-xs truncate min-w-0", mutedText, isLiveMode && "live-blur-text")} title={isLiveMode ? undefined : getTicketListPreview(ticket.lastMessage, ticket.lastMessageType, tE)}>
            {getTicketListPreview(ticket.lastMessage, ticket.lastMessageType, tE)}
          </p>
        )}

        <div className="flex items-center gap-1 min-w-0 overflow-hidden flex-wrap">
          {isSharedWithMe && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="text-[9px] h-[18px] px-1 leading-none shrink-0 gap-0.5 border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/50 font-semibold"
                >
                  <Share2 className="h-2.5 w-2.5" />
                  {tE("sharedWithMeBadge")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{tE("sharedWithMeBadgeTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {/* Aviso de atendimento duplicado: o contato deste card já tem ticket
              open/pending em outro canal (pendentes, flag crossChannelTicketCheck)
              ou — nos fechados — também no MESMO canal, caso em que reabrir criaria
              duas conversas paralelas. Nos abertos o badge marca a duplicata que já
              existe: são dois atendimentos do mesmo contato no mesmo canal, ambos
              listados desde que a deduplicação parou de esconder um deles. */}
          {(isPending || isClosed || isOpen) && !!crossSiblings?.length && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="text-[9px] h-[18px] px-1 leading-none shrink-0 gap-0.5 border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/50 font-semibold"
                >
                  <ArrowRightLeft className="h-2.5 w-2.5" />
                  {crossSiblings.length}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[280px]">
                <div className="space-y-0.5">
                  {crossSiblings.map((s) => {
                    const key = s.sameChannel
                      ? (s.ownerName ? "sameChannelSiblingTooltip" : "sameChannelSiblingTooltipNoOwner")
                      : (s.ownerName ? "crossChannelSiblingTooltip" : "crossChannelSiblingTooltipNoOwner");
                    return (
                      <div key={s.ticketId}>
                        {tE(key, {
                          channel: s.whatsappName || "?",
                          owner: s.ownerName || "",
                          ticketId: String(s.ticketId),
                        })}
                      </div>
                    );
                  })}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {ticket.queue?.name && (() => {
            const queueColor = ticket.queue.color || "#666";
            return (
              <span
                className="inline-flex items-center rounded-md text-[9px] h-[18px] px-1 leading-none max-w-[80px] truncate shrink-0 font-semibold"
                style={{ backgroundColor: queueColor, color: getReadableTextColor(queueColor), border: `1px solid ${queueColor}` }}
                title={ticket.queue.name}
              >
                {ticket.queue.name}
              </span>
            );
          })()}
          {ticket.user?.name && (
            <Badge variant="secondary" className="text-[9px] h-[18px] px-1 leading-none max-w-[80px] truncate shrink-0" title={ticket.user.name}>
              {ticket.user.name}
            </Badge>
          )}
          {channelName && (
            <Badge variant="outline" className={cn("text-[9px] h-[18px] px-1 leading-none max-w-[80px] truncate shrink-0", mutedText)} title={channelName}>
              {channelName}
            </Badge>
          )}
          {(() => {
            const uniqueTags = (ticket.tags || []).filter((tag, i, arr) => arr.findIndex(t => t.id === tag.id) === i);
            return (<>
              {uniqueTags.slice(0, 3).map((tag) => {
                const tagLabel = tag.tag || tag.name || `#${tag.id}`;
                return (
                  <Tooltip key={tag.id}>
                    <TooltipTrigger asChild>
                      <Tag
                        className={cn("h-3 w-3 shrink-0", !tag.color && "text-primary")}
                        style={tag.color ? { color: tag.color } : undefined}
                        fill="currentColor"
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">{tE("tag", { name: tagLabel })}</TooltipContent>
                  </Tooltip>
                );
              })}
              {uniqueTags.length > 3 && (
                <span className={cn("text-[9px] shrink-0", mutedText)}>+{uniqueTags.length - 3}</span>
              )}
            </>);
          })()}
          {/* Wallet (carteira) */}
          {ticket.wallet && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-0.5 shrink-0">
                  <Wallet className="h-3 w-3 text-blue-400 shrink-0" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {tE("wallet", { name: typeof ticket.wallet === "object" ? (ticket.wallet.name || `#${ticket.wallet.id}`) : String(ticket.wallet) })}
              </TooltipContent>
            </Tooltip>
          )}
          {ticket.isGroup && (
            <Tooltip>
              <TooltipTrigger asChild><Users className="h-3 w-3 text-muted-foreground shrink-0" /></TooltipTrigger>
              <TooltipContent>{tE("group")}</TooltipContent>
            </Tooltip>
          )}
          {ticket.chatbot && (
            <Tooltip>
              <TooltipTrigger asChild><Bot className="h-3 w-3 text-info shrink-0" /></TooltipTrigger>
              <TooltipContent>{tE("chatbotActive")}</TooltipContent>
            </Tooltip>
          )}
          {ticket.isPaused && (
            <Tooltip>
              <TooltipTrigger asChild><Pause className="h-3 w-3 text-warning shrink-0" /></TooltipTrigger>
              <TooltipContent>{tE("paused")}</TooltipContent>
            </Tooltip>
          )}
          {(() => {
            const integrations: string[] = [];
            if (ticket.typebotStatus === "enabled") integrations.push("Typebot");
            if (ticket.dialogflowStatus === "enabled") integrations.push("DialogFlow");
            if (ticket.chatgptStatus === "enabled") integrations.push("ChatGPT");
            if (ticket.n8nStatus === "enabled") integrations.push("N8N");
            if (ticket.difyStatus === "enabled") integrations.push("Dify");
            if (ticket.lmStatus === "enabled") integrations.push("LM Studio");
            if (ticket.grokStatus === "enabled") integrations.push("Grok");
            if (ticket.geminiStatus === "enabled") integrations.push("Gemini");
            if (ticket.deepseekStatus === "enabled") integrations.push("DeepSeek");
            if (ticket.qwenStatus === "enabled") integrations.push("Qwen");
            if (ticket.claudeStatus === "enabled") integrations.push("Claude");
            if (ticket.ollamaStatus === "enabled") integrations.push("Ollama");
            if (!integrations.length) return null;
            return (
              <Tooltip>
                <TooltipTrigger asChild><Cpu className="h-3 w-3 text-violet-500 shrink-0" /></TooltipTrigger>
                <TooltipContent>{tE("integrationActive", { names: integrations.join(", ") })}</TooltipContent>
              </Tooltip>
            );
          })()}
          {(() => {
            // Kanban vive em contact.kanban (canônico, atualizado por updateContact)
            // com fallback para ticket.kanban (legado/server-side join).
            const kanbanVal = (ticket.contact as { kanban?: number | string } | undefined)?.kanban ?? ticket.kanban;
            if (!kanbanVal) return null;
            return (
              <Tooltip>
                <TooltipTrigger asChild><KanbanIcon className="h-3 w-3 text-purple-500 shrink-0" /></TooltipTrigger>
                <TooltipContent>
                  {tE("kanban", { name: (() => {
                    if (typeof kanbanVal === "object" && kanbanVal !== null) return (kanbanVal as { id?: number; name?: string }).name || `#${(kanbanVal as { id?: number }).id}`;
                    const found = kanbansList?.find(kb => kb.id === Number(kanbanVal));
                    return found ? found.name : String(kanbanVal);
                  })() })}
                </TooltipContent>
              </Tooltip>
            );
          })()}
          {ticket.reasons != null && (() => {
            const reason = reasonsList?.find((r) => r.id === Number(ticket.reasons));
            if (!reason) return null;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Flag
                    className={cn("h-3 w-3 shrink-0", !reason.color && "text-orange-500")}
                    style={reason.color ? { color: reason.color, fill: reason.color } : { fill: "currentColor" }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{tE("reasonTooltip", { name: reason.name })}</TooltipContent>
              </Tooltip>
            );
          })()}
          {/* Status indicator for closed */}
          {ticket.status === "closed" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
              </TooltipTrigger>
              <TooltipContent>{tE("resolved")}</TooltipContent>
            </Tooltip>
          )}
          {ticket.pendingEvaluation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Hourglass className="h-3 w-3 text-warning shrink-0" />
              </TooltipTrigger>
              <TooltipContent>{tE("pendingEvaluationBadge")}</TooltipContent>
            </Tooltip>
          )}
        </div>
        </> )} {/* end comfortable */}
      </div>
    </div>
    <ProfilePicPreviewDialog preview={profilePicPreview} onClose={() => setProfilePicPreview(null)} blur={isLiveMode} />
    </>
  );
});

type DetailTab = "info" | "ticket" | "actions" | "tags" | "notes" | "media";

// Estado da navegação da busca de mensagens (contador "n/total" estilo WhatsApp).
// current: 1 = ocorrência mais recente; hasMoreOlder: ainda há histórico não carregado.
type SearchNavState = { term: string; current: number; total: number; hasMoreOlder: boolean };

function ChatHeader({
  ticket,
  onToggleDetail,
  onOpenDetailTab,
  detailOpen,
  onRefresh,
  onTransfer,
  queues,
  users,
  searchMessages,
  searchNav = null,
  autoScrollEnabled,
  onToggleAutoScroll,
  allowPause,
  forceReason,
  controlFeatures,
  userProfile,
  convitesCount = 0,
  onOpenConvites,
  availableWhatsapps,
  searching = false,
  userName,
  signatureEnabled = true,
  onCloseChat,
}: {
  ticket: Ticket;
  onToggleDetail: () => void;
  /** Abre o painel de detalhes na aba indicada */
  onOpenDetailTab?: (tab: DetailTab) => void;
  detailOpen: boolean;
  onRefresh: () => void;
  onTransfer: (queueId: number | null, userId?: number) => void;
  queues: { id: number; name: string; color: string; isActive?: boolean }[];
  users: { id: number; name: string; queues?: { id: number }[] }[];
  searchMessages: (term: string, direction?: "older" | "newer") => void | Promise<void>;
  searchNav?: SearchNavState | null;
  autoScrollEnabled?: boolean;
  onToggleAutoScroll?: () => void;
  allowPause?: boolean;
  forceReason?: boolean;
  controlFeatures?: boolean;
  userProfile?: string;
  convitesCount?: number;
  onOpenConvites?: () => void;
  availableWhatsapps?: { id: number; name: string; type?: string }[];
  searching?: boolean;
  userName?: string | null;
  signatureEnabled?: boolean;
  /** Fecha a tela do chat (deseleciona o ticket) — mesma ação do ESC. */
  onCloseChat?: () => void;
}) {
  const tE = useTranslations("atendimentoChatExtra");
  const tErrors = useTranslations("errors");
  const { isLiveMode } = useLiveMode();
  const openTab = (tab: DetailTab) => {
    onOpenDetailTab?.(tab);
    if (!detailOpen) onToggleDetail();
  };
  // Seletor escopado: pega só a ação (referência estável). Sem isto, useWebphoneStore()
  // sem seletor assinava a store inteira e re-renderizava o atendimento a cada mudança
  // de status do SIP (registering/error) ou tick de chamada.
  const toggleWebphone = useWebphoneStore((s) => s.toggleVisibility);
  const { updateTicket: updateTicketInStore } = useTicketStore();
  // Regra Vue: blur foto e truncar nome no cabeçalho do chat (InforCabecalhoChat.vue)
  const { isRestrictedUser: checkRestricted } = useAuthStore();
  const isRestricted = checkRestricted();
  const headerUserId = useAuthStore((s) => s.user?.userId ?? 0);
  const headerNotViewAssigned = useAuthStore((s) => s.getConfigValue("NotViewAssignedTickets") === "enabled");
  // Confirmação de reabertura: o que o pré-check achou de relevante para avisar
  // antes de reabrir (atendimento aberto do mesmo contato + destino da posse +
  // janela de 24h). null = nada a dizer, reabre direto.
  const [reopenPrompt, setReopenPrompt] = useState<{
    sibling: ExistingOpenTicket | null;
    notices: ReopenNotices;
  } | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<ProfilePicPreview | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferQueue, setTransferQueue] = useState("");
  const [transferNoQueue, setTransferNoQueue] = useState(false);
  const [transferUser, setTransferUser] = useState("");
  const [transferMessage, setTransferMessage] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [channelTransferOpen, setChannelTransferOpen] = useState(false);
  const [channelTransferId, setChannelTransferId] = useState("");
  const [chatFlows, setChatFlows] = useState<{ id: number; name: string }[]>([]);
  const [selectedChatFlow, setSelectedChatFlow] = useState("");
  type ScheduleItem = { id: string; date: string; text: string; files: File[]; signature: boolean };
  const makeScheduleItem = (sig: boolean): ScheduleItem => ({
    id: Math.random().toString(36).slice(2),
    date: "",
    text: "",
    files: [],
    signature: sig,
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(""); // WABA single-template path
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [scheduleRecurrence, setScheduleRecurrence] = useState<number | "none">("none");
  const [scheduleRecurrenceCount, setScheduleRecurrenceCount] = useState(1);
  const [scheduleRecurrenceCustomDays, setScheduleRecurrenceCustomDays] = useState(1);
  // Roteamento de atendimento da agendada: flag ON abre ticket no envio;
  // flag OFF + fila/usuário roteia a RESPOSTA do contato (sem chatbot).
  const [schedOpenTicket, setSchedOpenTicket] = useState(false);
  const [schedRouteQueueId, setSchedRouteQueueId] = useState("none");
  const [schedRouteUserId, setSchedRouteUserId] = useState("none");
  const [wabaTemplates, setWabaTemplates] = useState<WabaTemplate[]>([]);
  const [wabaTemplateSelected, setWabaTemplateSelected] = useState("");
  const [wabaSelectedTemplate, setWabaSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [wabaTemplateVars, setWabaTemplateVars] = useState<Array<{ key: string; label: string; value: string; isHeaderLink?: boolean; filename?: string }>>([]);
  const [wabaTemplateSearch, setWabaTemplateSearch] = useState("");
  const [wabaSchedGalleryOpen, setWabaSchedGalleryOpen] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(!!ticket.isPaused);
  // Sincroniza isPaused sempre que o ticket mudar
  React.useEffect(() => { setIsPaused(!!ticket.isPaused); }, [ticket.id, ticket.isPaused]);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseTransferAfter, setPauseTransferAfter] = useState(false);
  const [pauseSending, setPauseSending] = useState(false);
  const [forceReasonOpen, setForceReasonOpen] = useState(false);
  const [reasonsList, setReasonsList] = useState<Reason[]>([]);
  const [reasonsLoading, setReasonsLoading] = useState(false);
  const [selectedReasonId, setSelectedReasonId] = useState<number | null>(null);
  const [reasonComboOpen, setReasonComboOpen] = useState(false);
  // closingReason kept for doClose optional param (unused in dialog now)
  const [farewellDialogOpen, setFarewellDialogOpen] = useState(false);
  const [farewells, setFarewells] = useState<FarewellPrivateMessage[]>([]);
  const [selectedFarewellId, setSelectedFarewellId] = useState<number | null>(null);
  const [farewellLoading, setFarewellLoading] = useState(false);
  const [farewellComboOpen, setFarewellComboOpen] = useState(false);
  // Avaliação automática ao resolver: diálogo "fechar forçado?" + janela de tempo configurada
  const [evalCloseOpen, setEvalCloseOpen] = useState(false);
  const [evalCloseBusy, setEvalCloseBusy] = useState(false);
  const [evalCloseWindowMs, setEvalCloseWindowMs] = useState<number | null>(null);

  // ── Media / Links / Docs modal ─────────────────────────────────────────
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTab, setMediaTab] = useState<"media" | "links" | "docs">("media");
  type RawMsg = { id: string; body?: string; mediaType?: string; mediaUrl?: string; fileName?: string };
  const [mediaMessages, setMediaMessages] = useState<RawMsg[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [mediaTotal, setMediaTotal] = useState<number | null>(null);

  const loadMediaMessages = async (reset = false) => {
    setMediaLoading(true);
    const page = reset ? 1 : mediaPage;
    try {
      const { data } = await fetchMessages(ticket.id, { pageNumber: page });
      const msgs: RawMsg[] = Array.isArray(data?.messages) ? data.messages : [];
      setMediaMessages((prev) => reset ? msgs : [...prev, ...msgs]);
      setMediaPage(page + 1);
      setMediaHasMore(!!(data?.hasMore));
    } catch { /* empty */ }
    finally { setMediaLoading(false); }
  };

  const openMediaModal = () => {
    setMediaOpen(true);
    setMediaTab("media");
    setMediaMessages([]);
    setMediaPage(1);
    setMediaHasMore(false);
    setMediaTotal(null);
    loadMediaMessages(true);
    fetchTicketMediaCount(ticket.id)
      .then(({ data }) => setMediaTotal(typeof data?.count === "number" ? data.count : null))
      .catch(() => { /* empty */ });
  };

  // Fecha o modal de mídias e navega até a mensagem original no chat.
  // Reutiliza o listener global "chat:scroll-to-message" do AtendimentoPage,
  // que pagina o histórico se necessário e dá scroll + highlight.
  const goToMessage = (msgId: string) => {
    if (!msgId) return;
    setMediaOpen(false);
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("chat:scroll-to-message", { detail: { id: String(msgId) } })
      );
    }, 220);
  };

  const mediaTypeItems = mediaMessages.filter((m) => {
    const mt = (m.mediaType ?? "").toLowerCase();
    return mt.startsWith("image") || mt.startsWith("video") || mt.startsWith("audio") || mt === "sticker";
  });

  const docTypeItems = mediaMessages.filter((m) => {
    const mt = (m.mediaType ?? "").toLowerCase();
    return mt.startsWith("document") || (mt === "media" && m.mediaUrl && !/\.(mp4|webm|ogg|mp3|wav|jpg|jpeg|png|gif|webp)$/i.test(m.mediaUrl));
  });

  const extractLinks = (msgs: RawMsg[]) => {
    const urlRegex = /(https?:\/\/[^\s<>'"]+)/gi;
    const seen = new Set<string>();
    return msgs.flatMap((m) => {
      const matches = (m.body || "").match(urlRegex) ?? [];
      return matches.filter((u) => { if (seen.has(u)) return false; seen.add(u); return true; }).map((url) => ({ url, msgId: m.id }));
    });
  };
  const linkTypeItems = extractLinks(mediaMessages);

  // ── Share ticket modal ─────────────────────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUsers, setShareUsers] = useState<{ id: number; name: string }[]>([]);
  // Backend: one TicketShared record per ticket containing userIdArray
  const [shareRecord, setShareRecord] = useState<{ id: number; userIdArray?: number[] } | null>(null);
  const [shareSelected, setShareSelected] = useState<Set<number>>(new Set());
  const [shareLoading, setShareLoading] = useState(false);

  const openShareModal = async () => {
    setShareOpen(true);
    setShareLoading(true);
    setShareUsers((users as { id: number; name: string; profile?: string }[]).filter((u) => u.profile !== "superadmin"));
    try {
      const { data } = await fetchTicketShared(ticket.id);
      setShareRecord(data ?? null);
      const ids: number[] = Array.isArray(data?.userIdArray) ? data.userIdArray : [];
      setShareSelected(new Set(ids));
    } catch {
      setShareRecord(null);
      setShareSelected(new Set());
    }
    finally { setShareLoading(false); }
  };

  const confirmShare = async () => {
    setShareLoading(true);
    try {
      const ids = Array.from(shareSelected);
      if (shareRecord) {
        if (ids.length === 0) {
          await deleteTicketShared(shareRecord.id);
        } else {
          await updateTicketShared(shareRecord.id, { userIdArray: ids });
        }
      } else if (ids.length > 0) {
        const inviteUrl = typeof window !== "undefined"
          ? `${window.location.origin}/atendimento?ticketId=${ticket.id}`
          : `/atendimento?ticketId=${ticket.id}`;
        await createTicketShared({ ticketId: ticket.id, inviteUrl, userIdArray: ids });
      }
      toast.success(tE("shareUpdated"));
      setShareOpen(false);
    } catch { toast.error(tE("errorSharing")); }
    finally { setShareLoading(false); }
  };

  const toggleShareUser = (id: number) => {
    setShareSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Group Users modal ──────────────────────────────────────────────────
  const groupTicket = ticket as Ticket & { groupUserIdArray?: number[] };
  const [groupUsersOpen, setGroupUsersOpen] = useState(false);
  const [groupUsersList, setGroupUsersList] = useState<{ id: number; name: string }[]>([]);
  const [groupUsersSelected, setGroupUsersSelected] = useState<Set<number>>(new Set());
  const [groupUsersLoading, setGroupUsersLoading] = useState(false); // used by confirmGroupUsers

  const openGroupUsersModal = () => {
    setGroupUsersOpen(true);
    setGroupUsersList((users as { id: number; name: string; profile?: string }[]).filter((u) => u.profile !== "superadmin"));
    const existing: number[] = Array.isArray(groupTicket.groupUserIdArray) ? groupTicket.groupUserIdArray : [];
    setGroupUsersSelected(new Set(existing));
  };

  const confirmGroupUsers = async () => {
    setGroupUsersLoading(true);
    try {
      const ids = Array.from(groupUsersSelected);
      await updateTicket(ticket.id, { groupUserIdArray: ids.length > 0 ? ids : null });
      toast.success(tE("groupUsersUpdated"));
      setGroupUsersOpen(false);
      onRefresh();
    } catch { toast.error(tE("errorUpdatingGroupUsers")); }
    finally { setGroupUsersLoading(false); }
  };

  const toggleGroupUser = (id: number) => {
    setGroupUsersSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doClose = async (reason?: string) => {
    const prevStatus = ticket.status;
    updateTicketInStore({ id: ticket.id, status: "closed" });
    try {
      const payload: Record<string, unknown> = { status: "closed" };
      if (reason) payload.closingReason = reason;
      await updateTicket(ticket.id, payload);
      toast.success(tE("ticketClosed"));
      onRefresh();
    } catch {
      updateTicketInStore({ id: ticket.id, status: prevStatus });
      toast.error(tE("errorClosing"));
    }
  };

  /** Envia farewell message (despedida) via canal correto e aguarda 5s antes de fechar */
  const sendFarewellMsg = async (farewell: FarewellPrivateMessage) => {
    const ch = (ticket.channel || "").toLowerCase();
    const wa = ticket.whatsapp;
    const idFront = `farewell-${ticket.id}-${Date.now()}`;
    // Meta payload (WABA / instagram / messenger) — sem sendType, igual ao Vue
    const metaPayload = {
      read: 1, fromMe: true, mediaUrl: "", body: farewell.message,
      scheduleDate: null, quotedMsg: null,
      from: ticket.contact.number, tokenApi: wa?.tokenAPI, ticketId: ticket.id, idFront,
    };
    // Standard payload (demais canais) — com sendType, igual ao Vue
    const message = { read: 1, fromMe: true, mediaUrl: "", body: farewell.message,
      scheduleDate: null, quotedMsg: null, sendType: "farewell", idFront };
    try {
      if (ch === "waba") {
        await sendTextWaba(metaPayload);
      } else if (ch === "instagram") {
        await sendTextInstagramMeta(metaPayload);
      } else if (ch === "messenger") {
        await sendTextMessengerMeta(metaPayload);
      } else {
        await sendMessageApi(ticket.id, message, { channel: ch });
      }
      // Se a mensagem de fechamento tem demanda vinculada, seta automaticamente
      // a demanda no ticket ao enviá-la (sem alterar o fluxo de encerramento).
      const farewellUpdate: { isFarewellMessage: boolean; reasons?: number } = { isFarewellMessage: true };
      if (farewell.reasonId) farewellUpdate.reasons = farewell.reasonId;
      await updateTicket(ticket.id, farewellUpdate);
      try { await updateEvaluationByTicket(ticket.id, { attempts: 2 }); } catch { /* ignore */ }
      toast.success(tE("farewellSent"));
      await new Promise<void>((r) => setTimeout(r, 5000));
    } catch { /* silenciar erros de envio da despedida */ }
  };

  /** Envia avaliação automaticamente ao fechar (quando sendEvaluation=enabled no canal) */
  const doSendEvaluationOnClose = async (cfg?: EvaluationConfig | null) => {
    try {
      let config: EvaluationConfig | null = cfg ?? null;
      if (!config) {
        try { const res = await fetchEvaluationConfig(); config = Array.isArray(res.data) ? res.data[0] : res.data; } catch { config = null; }
      }
      await sendEvaluationForTicket(ticket, { config, questionLabel: tE("evaluationLabel") });
      toast.success(tE("evaluationSent"));
      onRefresh();
    } catch { toast.error(tE("errorSendingEvaluation")); }
  };

  // Janela de tempo (ratingStoreTime) na qual a avaliação ainda é registrada após o
  // fechamento — formatada em minutos/horas/dias conforme o valor configurado.
  const formatRatingWindow = (ms: number): string => {
    const min = Math.max(1, Math.round(ms / 60000));
    if (min % 1440 === 0) return tE("ratingWindowDays", { count: min / 1440 });
    if (min % 60 === 0) return tE("ratingWindowHours", { count: min / 60 });
    return tE("ratingWindowMinutes", { count: min });
  };

  // "Manter aberto": comportamento atual — envia a pergunta de avaliação e mantém o
  // ticket aberto até o cliente responder.
  const handleEvalKeepOpen = async () => {
    setEvalCloseBusy(true);
    try {
      await doSendEvaluationOnClose();
      setEvalCloseOpen(false);
    } finally { setEvalCloseBusy(false); }
  };

  // "Fechar forçado": envia a pergunta de avaliação e encerra o atendimento agora.
  // A TicketEvaluation pendente é preservada — se o cliente responder dentro da janela
  // configurada (ratingStoreTime + ratingStoreUse), o backend reabre o ticket e registra a nota.
  const handleEvalForceClose = async () => {
    setEvalCloseBusy(true);
    const prevStatus = ticket.status;
    try {
      await doSendEvaluationOnClose();
      updateTicketInStore({ id: ticket.id, status: "closed" });
      await updateTicketForce(ticket.id, "closed", headerUserId);
      toast.success(tE("ticketClosed"));
      setEvalCloseOpen(false);
      onRefresh();
    } catch {
      updateTicketInStore({ id: ticket.id, status: prevStatus });
      toast.error(tE("errorClosing"));
    } finally { setEvalCloseBusy(false); }
  };

  const handleFarewellConfirm = async () => {
    setFarewellDialogOpen(false);
    if (selectedFarewellId !== null) {
      const farewell = farewells.find((f) => f.id === selectedFarewellId);
      if (farewell) await sendFarewellMsg(farewell);
    }
    await doClose();
  };

  const handleClose = async () => {
    if (forceReason && !ticket.reasons && ticket.status === "open") {
      setSelectedReasonId(null);
      setReasonsLoading(true);
      setForceReasonOpen(true);
      try {
        const { data } = await fetchReasons();
        const raw = data as unknown as { reasons?: Reason[] } | Reason[];
        const list = Array.isArray(raw) ? raw : (Array.isArray((raw as { reasons?: Reason[] }).reasons) ? (raw as { reasons: Reason[] }).reasons : []);
        if (!list.length) {
          toast.error(tE("noReasonsFound"));
          setForceReasonOpen(false);
          return;
        }
        setReasonsList(list);
      } catch { toast.error(tE("errorLoadingReasons")); setForceReasonOpen(false); }
      finally { setReasonsLoading(false); }
      return;
    }
    const ch = (ticket.channel || "").toLowerCase();
    const sendEval = ticket.whatsapp?.sendEvaluation;
    const supportsEval = channelSupportsEvaluation(ch);

    // Avaliação automática (sendEvaluation=enabled + ticket aberto + canal suportado + não grupo)
    if (sendEval === "enabled" && ticket.status === "open" && supportsEval && !ticket.isGroup) {
      let config: EvaluationConfig | null = null;
      try { const res = await fetchEvaluationConfig(); config = Array.isArray(res.data) ? res.data[0] : res.data; } catch { config = null; }
      const behavior = (config?.ratingCloseBehavior as string) || "ask";

      // Opcao 1: fecha na hora (via updateTicket normal — NAO usa /ticketsForce)
      if (behavior === "closeOnResolve") {
        await doSendEvaluationOnClose(config);
        updateTicketInStore({ id: ticket.id, status: "closed" });
        try { await updateTicket(ticket.id, { status: "closed" }); toast.success(tE("ticketClosed")); onRefresh(); }
        catch { updateTicketInStore({ id: ticket.id, status: "open" }); toast.error(tE("errorClosing")); }
        return;
      }
      // Opcoes 2 e 3: envia e MANTEM aberto (o fechamento vem da resposta do cliente / job de timer no backend)
      if (behavior === "waitClientReply" || behavior === "timer") {
        await doSendEvaluationOnClose(config);
        toast.info(tE("evaluationSentWaiting"));
        return;
      }
      // Opcao 4 (ask, padrao): comportamento atual — modal "manter aberto / fechar forcado"
      const canForceClose = !(controlFeatures && userProfile === "user");
      if (!canForceClose) { await doSendEvaluationOnClose(config); return; }
      let windowMs: number | null = null;
      const cfg = config as unknown as { ratingStoreUse?: string; ratingStoreTime?: string } | null;
      const ms = parseInt(cfg?.ratingStoreTime ?? "", 10);
      if (cfg?.ratingStoreUse === "enabled" && Number.isFinite(ms) && ms > 0) windowMs = ms;
      setEvalCloseWindowMs(windowMs);
      setEvalCloseOpen(true);
      return;
    }

    // Mostrar seleção de mensagem de despedida (quando sendEvaluation=disabled no canal)
    if (sendEval === "disabled") {
      setFarewellLoading(true);
      try {
        const list = await fetchFarewells();
        setFarewells(list);
      } catch { setFarewells([]); } finally { setFarewellLoading(false); }
      setSelectedFarewellId(null);
      setFarewellDialogOpen(true);
      return;
    }

    await doClose();
  };

  const reopenTicketNow = async () => {
    try {
      await updateTicket(ticket.id, { status: "open" });
      toast.success(tE("ticketReopened"));
      onRefresh();
    } catch { toast.error(tE("errorReopening")); }
  };

  const handleReopen = async () => {
    // Pré-check antes de reabrir um fechado. Avisa sobre (a) atendimento já aberto
    // do contato no MESMO canal (duplicata direta, sempre checada) ou em OUTRO canal
    // (gated pela flag crossChannelTicketCheck dentro do helper), (b) para onde vai a
    // posse do ticket e (c) janela de 24h fechada nos canais Meta.
    // Best-effort: qualquer falha do check segue direto para a reabertura.
    let sibling: ExistingOpenTicket | null = null;
    if (!ticket.isGroup && ticket.contact?.number) {
      sibling = await findCrossChannelSiblingForTicket({
        ticketId: ticket.id,
        number: ticket.contact.number,
        whatsappId: (ticket as unknown as { whatsappId?: number }).whatsappId ?? ticket.whatsapp?.id,
        includeSameChannel: true,
      });
    }
    const notices = buildReopenNotices(ticket, headerUserId || null);
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
      toast.success(tE("returnedToQueue"));
      onRefresh();
    } catch { toast.error(tE("errorReturning")); }
  };

  const handleTransferSubmit = async () => {
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
          await sendMessageApi(ticket.id, { body, read: 1, fromMe: true, mediaUrl: "", scheduleDate: null, quotedMsg: null, idFront }, { channel: ch });
        }
      } catch {
        // prossegue com a transferência mesmo se o envio falhar
      }
    }
    onTransfer(transferNoQueue ? null : parseInt(transferQueue), transferUser ? parseInt(transferUser) : undefined);
    setTransferOpen(false);
    setTransferQueue("");
    setTransferNoQueue(false);
    setTransferUser("");
    setTransferMessage("");
  };

  const handleTogglePause = async () => {
    if (isPaused) {
      try {
        await resumeTicket(ticket.id);
        setIsPaused(false);
        updateTicketInStore({ id: ticket.id, isPaused: false, pauseReason: null });
        toast.success(tE("ticketResumed"));
      } catch { toast.error(tE("errorPause")); }
    } else {
      setPauseReason("");
      setPauseTransferAfter(false);
      setPauseDialogOpen(true);
    }
  };

  const handleConfirmPause = async () => {
    setPauseSending(true);
    try {
      await pauseTicket(ticket.id, pauseReason.trim() || undefined);
      setIsPaused(true);
      updateTicketInStore({ id: ticket.id, isPaused: true, pauseReason: pauseReason.trim() || null });
      setPauseDialogOpen(false);
      toast.success(tE("ticketPaused"));
      if (pauseTransferAfter) {
        setTransferOpen(true);
      }
    } catch { toast.error(tE("errorPause")); }
    finally { setPauseSending(false); }
  };

  const handleOpenChatbot = async () => {
    try {
      const { data } = await fetchChatFlows();
      const flows = Array.isArray(data) ? data : (data as Record<string, unknown>)?.chatFlow as { id: number; name: string }[] || [];
      setChatFlows(Array.isArray(flows) ? flows : []);
    } catch { /* empty */ }
    setChatbotOpen(true);
  };

  const handleTransferChatbot = async () => {
    if (!selectedChatFlow) return;
    try {
      await transferToChatbot(ticket.id, parseInt(selectedChatFlow));
      toast.success(tE("transferredToChatbot"));
      setChatbotOpen(false);
      setSelectedChatFlow("");
      onRefresh();
    } catch { toast.error(tE("errorTransferChatbot")); }
  };

  const handleTransferChannel = async () => {
    if (!channelTransferId || !ticket) return;
    const selectedWa = availableWhatsapps?.find((w) => w.id === parseInt(channelTransferId));
    if (!selectedWa) return;
    try {
      await transferTicketChannel(ticket.id, { channel: selectedWa.type || "baileys", whatsappId: parseInt(channelTransferId) });
      toast.success(tE("transferredChannel"));
      setChannelTransferOpen(false);
      setChannelTransferId("");
      onRefresh();
    } catch { toast.error(tE("errorTransferChannel")); }
  };

  const chSched = (ticket.channel || "").toLowerCase();
  const isWaba = ["waba", "gupshup", "dialog360"].includes(chSched);
  const isWhatsappOrBaileys = ["whatsapp", "baileys", "zapo", "evo", "evogo", "meow", "uazapi", "zapi"].includes(chSched);
  const scheduleAllowedChannels = ["whatsapp", "baileys", "zapo", "evo", "evogo", "meow", "uazapi", "zapi", "waba", "gupshup", "dialog360"];
  const isScheduleChannel = scheduleAllowedChannels.includes(chSched);
  const wabaTokenApi = (ticket.whatsapp as Record<string, unknown>)?.tokenAPI as string | undefined;
  const toLocalDatetime = (d: Date) => {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const openScheduleModal = async () => {
    setScheduleDate("");
    setScheduleItems([makeScheduleItem(signatureEnabled)]);
    setScheduleRecurrence("none"); setScheduleRecurrenceCount(1); setScheduleRecurrenceCustomDays(1);
    setWabaTemplateSelected(""); setWabaSelectedTemplate(null); setWabaTemplateVars([]); setWabaTemplateSearch("");
    if (isWaba && ticket.whatsapp) {
      setScheduleLoading(true);
      try {
        const wp = ticket.whatsapp as { id?: number; type?: string; tokenAPI?: string; appId?: string };
        const res = await getTemplatesForChannel({ id: wp.id, type: wp.type, tokenAPI: wp.tokenAPI, appId: wp.appId });
        const list = (Array.isArray(res) ? res : (res as { data?: WabaTemplate[] })?.data || []) as WabaTemplate[];
        setWabaTemplates([...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
      } catch (err: any) {
        setWabaTemplates([]);
        const data = err?.response?.data;
        const upstreamStatus = data?.upstreamStatus ?? err?.response?.status;
        const reason = data?.message || data?.error || err?.message;
        toast.error(`${tE("errorLoadingTemplates") || "Erro ao listar templates"}${upstreamStatus ? ` (HTTP ${upstreamStatus})` : ""}${reason ? `: ${reason}` : ""}`);
      }
      finally { setScheduleLoading(false); }
    }
    setSchedOpenTicket(false);
    setSchedRouteQueueId("none");
    setSchedRouteUserId("none");
    setScheduleOpen(true);
  };

  // Extract variables from selected WABA template for schedule modal
  React.useEffect(() => {
    if (!wabaSelectedTemplate) { setWabaTemplateVars([]); return; }
    const vars: Array<{ key: string; label: string; value: string; isHeaderLink?: boolean }> = [];
    const components = wabaSelectedTemplate.components || [];
    const header = components.find((c) => c.type === "HEADER");
    if (header && (header.format === "IMAGE" || header.format === "VIDEO" || header.format === "DOCUMENT")) {
      vars.push({ key: "header_link", label: tE("schedWabaHeaderLink"), value: "", isHeaderLink: true });
    }
    // Header TEXT vars (numeração independente do body)
    if (header?.format === "TEXT" && header.text) {
      const hPos = [...header.text.matchAll(/\{\{(\d+)\}\}/g)];
      const hNamed = [...header.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
      if (hPos.length) {
        hPos.forEach((m) => {
          const k = `header_var_${m[1]}`;
          if (!vars.find((v) => v.key === k)) vars.push({ key: k, label: `Header — ${tE("schedWabaVar", { n: m[1] })}`, value: "" });
        });
      } else if (hNamed.length) {
        hNamed.forEach((m) => {
          const k = `header_named_${m[1]}`;
          if (!vars.find((v) => v.key === k)) vars.push({ key: k, label: `Header — {{${m[1]}}}`, value: "" });
        });
      }
    }
    const body = components.find((c) => c.type === "BODY");
    if (body?.text) {
      const positional = [...body.text.matchAll(/\{\{(\d+)\}\}/g)];
      const named = [...body.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
      if (positional.length) {
        positional.forEach((m) => {
          const k = `var_${m[1]}`;
          if (!vars.find((v) => v.key === k)) vars.push({ key: k, label: tE("schedWabaVar", { n: m[1] }), value: "" });
        });
      } else if (named.length) {
        named.forEach((m) => {
          const k = `named_${m[1]}`;
          if (!vars.find((v) => v.key === k)) vars.push({ key: k, label: `{{${m[1]}}}`, value: "" });
        });
      }
    }
    setWabaTemplateVars(vars);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wabaSelectedTemplate]);

  const pickWabaSchedGalleryItem = (item: GalleryItem) => {
    setWabaTemplateVars((prev) => prev.map((v) => v.isHeaderLink ? { ...v, value: item.url, filename: item.name } : v));
    setWabaSchedGalleryOpen(false);
  };

  const handleScheduleMessage = async () => {
    setScheduleLoading(true);
    const intervalDays = scheduleRecurrence === "none" ? 0 : (scheduleRecurrence === ("custom" as unknown as number) ? scheduleRecurrenceCustomDays : Number(scheduleRecurrence));
    const repetitions = scheduleRecurrenceCount || 1;
    const scheduleRoutingPayload = {
      scheduleOpenTicket: schedOpenTicket,
      scheduleQueueId: schedRouteQueueId !== "none" ? Number(schedRouteQueueId) : null,
      scheduleUserId: schedRouteUserId !== "none" ? Number(schedRouteUserId) : null,
    };

    const addDays = (dateStr: string, days: number) => {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + days);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 16);
    };

    try {
      if (isWaba) {
        if (!scheduleDate) { toast.error(tE("selectDatetime")); setScheduleLoading(false); return; }
        if (!wabaTemplateSelected) { toast.error(tE("selectTemplatePlease")); setScheduleLoading(false); return; }
        const tpl = wabaSelectedTemplate || wabaTemplates.find((t) => t.name === wabaTemplateSelected);
        // Build components from vars
        const components: Record<string, unknown>[] = [];
        const headerLinkVar = wabaTemplateVars.find((v) => v.isHeaderLink);
        const header = tpl?.components?.find((c) => c.type === "HEADER");
        if (header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(header.format || "") && !isValidHttpUrl(headerLinkVar?.value)) {
          toast.error(tErrors("invalidMediaHeaderUrl"));
          setScheduleLoading(false);
          return;
        }
        if (headerLinkVar?.value && header) {
          components.push({
            type: "HEADER",
            format: header.format,
            value: headerLinkVar.value,
            ...(header.format === "DOCUMENT" && headerLinkVar.filename ? { filename: headerLinkVar.filename } : {}),
          });
        } else if (header?.format === "TEXT") {
          const headerPositional = wabaTemplateVars.filter((v) => v.key.startsWith("header_var_"));
          const headerNamed = wabaTemplateVars.filter((v) => v.key.startsWith("header_named_"));
          // Meta rejeita parâmetro de texto vazio (131008) — fallback para espaço.
          if (headerPositional.length) {
            components.push({ type: "HEADER", format: "TEXT", variables: headerPositional.map((v) => v.value.trim() || " ") });
          } else if (headerNamed.length) {
            components.push({ type: "HEADER", format: "TEXT", parameters: headerNamed.map((v) => ({ type: "text", text: v.value.trim() || " ", name: v.key.replace("header_named_", "") })) });
          }
        }
        const bodyVars = wabaTemplateVars.filter((v) => !v.isHeaderLink && !v.key.startsWith("header_"));
        if (bodyVars.length) {
          const positionalVars = bodyVars.filter((v) => v.key.startsWith("var_"));
          const namedBodyVars = bodyVars.filter((v) => v.key.startsWith("named_"));
          if (positionalVars.length) {
            components.push({ type: "BODY", variables: positionalVars.map((v) => v.value.trim() || " ") });
          } else if (namedBodyVars.length) {
            components.push({ type: "BODY", parameters: namedBodyVars.map((v) => ({ type: "text", text: v.value.trim() || " ", name: v.key.replace("named_", "") })) });
          }
        }
        await createWabaTemplateSchedule({
          ticketId: ticket.id,
          contactId: ticket.contact.id,
          channel: chSched || "waba",
          channelId: ticket.whatsapp?.id,
          tokenApi: wabaTokenApi,
          from: ticket.contact.number,
          scheduleDate,
          templateName: wabaTemplateSelected,
          language: tpl?.language || "pt_BR",
          body: JSON.stringify(tpl?.components || []),
          dataJson: JSON.stringify(components),
          sendType: "templates",
          ...scheduleRoutingPayload,
        });
      } else {
        // Non-WABA: itens múltiplos (cada um com data/texto/arquivos)
        const validItems = scheduleItems.filter((it) => it.date && (it.text.trim() || it.files.length > 0));
        if (validItems.length === 0) {
          // Mensagem dependendo do que falta: data, ou conteúdo
          const anyMissingDate = scheduleItems.some((it) => !it.date);
          if (anyMissingDate) toast.error(tE("selectDatetime"));
          else toast.error(tE("typeMessage"));
          setScheduleLoading(false);
          return;
        }
        for (const item of validItems) {
          let currentDate = item.date;
          for (let r = 0; r < repetitions; r++) {
            if (item.text.trim()) {
              const signedBody = item.signature && userName?.trim()
                ? buildSignedBody(userName, item.text, ticket.channel)
                : item.text;
              await sendMessageApi(ticket.id, {
                body: signedBody,
                scheduleDate: currentDate,
                fromMe: true,
                read: "1",
                sendType: "chat",
                ...scheduleRoutingPayload,
              }, { channel: ticket.channel });
            }
            for (const file of item.files) {
              const fd = new FormData();
              fd.append("medias", file);
              fd.append("body", file.name);
              fd.append("fromMe", "true");
              fd.append("read", "1");
              fd.append("scheduleDate", currentDate);
              fd.append("sendType", "chat");
              fd.append("scheduleOpenTicket", String(schedOpenTicket));
              if (schedRouteQueueId !== "none") fd.append("scheduleQueueId", schedRouteQueueId);
              if (schedRouteUserId !== "none") fd.append("scheduleUserId", schedRouteUserId);
              await sendMessageApi(ticket.id, fd, { channel: ticket.channel });
            }
            if (intervalDays > 0) currentDate = addDays(currentDate, intervalDays);
          }
        }
      }
      toast.success(tE("messageScheduled"));
      setScheduleOpen(false);
      onRefresh();
    } catch { toast.error(tE("errorScheduling")); }
    finally { setScheduleLoading(false); }
  };

  const updateScheduleItem = (idx: number, patch: Partial<ScheduleItem>) => {
    setScheduleItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const addScheduleItem = () => setScheduleItems((prev) => [...prev, makeScheduleItem(signatureEnabled)]);
  const removeScheduleItem = (idx: number) => setScheduleItems((prev) => prev.filter((_, i) => i !== idx));

  const channelHeaderInfo = getChannelIcon(ticket.channel);

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0 cursor-pointer flex-1" onClick={onToggleDetail}>
          <div className="relative shrink-0">
            <Avatar
              className={cn("h-9 w-9", isRestricted && "blur-sm pointer-events-none select-none", isLiveMode && "live-blur", !isRestricted && isValidAvatarUrl(ticket.contact?.profilePicUrl) && "cursor-zoom-in")}
              onClick={(e) => {
                if (!isRestricted && isValidAvatarUrl(ticket.contact?.profilePicUrl)) {
                  e.stopPropagation();
                  setProfilePicPreview({ url: ticket.contact!.profilePicUrl!, name: ticket.contact?.name, isGroup: ticket.isGroup });
                }
              }}
            >
              {!isRestricted && isValidAvatarUrl(ticket.contact?.profilePicUrl) && <AvatarImage src={ticket.contact!.profilePicUrl!} />}
              {(() => { const ac = getAvatarColor(ticket.contact?.name); return <AvatarFallback className="text-xs font-semibold" style={{ backgroundColor: ac.background, color: ac.color }}>{getInitials(ticket.contact?.name || "?")}</AvatarFallback>; })()}
            </Avatar>
            {channelHeaderInfo && (
              <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-background border flex items-center justify-center">
                <channelHeaderInfo.icon className={cn("h-2.5 w-2.5", channelHeaderInfo.color)} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium truncate flex items-center gap-1.5 min-w-0">
              {isRestricted ? (
                <span className={cn("truncate min-w-0", isLiveMode && "live-blur-text")}>
                  {`${(displayContactName(ticket.contact) || tE("contact")).slice(0, 5)}...`}
                </span>
              ) : (
                <TruncateWithTooltip
                  as="span"
                  text={displayContactName(ticket.contact) || tE("noName")}
                  className={cn("min-w-0", isLiveMode && "live-blur-text")}
                />
              )}
              {isPaused && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-warning/10 border-warning/30 text-warning leading-none">{tE("paused")}</Badge>}
              {ticket.status === "pending" && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-warning/10 border-warning/30 text-warning leading-none">{tE("pending")}</Badge>}
              {ticket.status === "closed" && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-success/10 border-success/30 text-success leading-none">{tE("resolved")}</Badge>}
              {ticket.imported && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-info/10 border-info/30 text-info leading-none cursor-help">{tE("imported")}</Badge>
                  </TooltipTrigger>
                  <TooltipContent>{tE("importedTooltip")}</TooltipContent>
                </Tooltip>
              )}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              #{ticket.id}
              {!isRestricted && displayContactIdentity(ticket.contact) && <span className={cn("ml-1", isLiveMode && "live-blur-text")}>· {displayContactIdentity(ticket.contact)}</span>}
              {ticket.queue && <span className="ml-1">· {ticket.queue.name}</span>}
              {ticket.user && <span className="ml-1">· {ticket.user.name}</span>}
            </p>
            {ticket.tags && ticket.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {ticket.tags.filter((tag, i, arr) => arr.findIndex((t) => t.id === tag.id) === i).map((tag) => {
                  const label = tag.tag || tag.name || `#${tag.id}`;
                  return (
                    <Badge
                      key={tag.id}
                      className="text-[9px] px-1.5 py-0 h-4 font-medium border-transparent rounded-sm"
                      style={tag.color ? { backgroundColor: tag.color, color: "#fff" } : undefined}
                    >
                      {label}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {searchOpen && (
          <div className="flex items-center gap-1 mx-2 flex-1 max-w-xs">
            <div className="relative flex-1">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={tE("searchMessagesPlaceholder")}
                className="h-7 text-xs pr-7"
                autoFocus
                disabled={searching}
                onKeyDown={(e) => { if (e.key === "Enter" && !searching && searchTerm.trim()) searchMessages(searchTerm, e.shiftKey ? "newer" : "older"); if (e.key === "Escape") { setSearchOpen(false); setSearchTerm(""); } }}
              />
              {searching && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            {searchNav && searchNav.total > 0 && searchNav.term === searchTerm.trim().toLowerCase() && (
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                {searchNav.current}/{searchNav.total}{searchNav.hasMoreOlder ? "+" : ""}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title={tE("searchOlderMatch")}
              disabled={searching || !searchTerm.trim()}
              onClick={() => searchMessages(searchTerm, "older")}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title={tE("searchNewerMatch")}
              disabled={searching || !searchTerm.trim() || !searchNav || searchNav.term !== searchTerm.trim().toLowerCase() || searchNav.current <= 1}
              onClick={() => searchMessages(searchTerm, "newer")}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <TooltipProvider>
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Reabrir — always shown when not open */}
            {ticket.status !== "open" && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReopen}><RotateCcw className="h-4 w-4" /></Button>
              </TooltipTrigger><TooltipContent>{tE("reopen")}</TooltipContent></Tooltip>
            )}
            {/* Retornar à fila */}
            {ticket.status === "open" && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReturnToQueue}><Undo2 className="h-4 w-4" /></Button>
              </TooltipTrigger><TooltipContent>{tE("returnToQueue")}</TooltipContent></Tooltip>
            )}
            {/* Resolver/Fechar — shown for open tickets */}
            {ticket.status === "open" && (
              <Tooltip><TooltipTrigger asChild>
                {/* data-resolve-ticket-btn: alvo do atalho Alt+R — o atalho dispara um
                    click AQUI para reusar exatamente o mesmo fluxo (guards, motivo
                    obrigatório, avaliação, confirmações). Oculto/ausente = atalho no-op. */}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-success hover:text-success/80" data-resolve-ticket-btn="" onClick={handleClose}>
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>{tE("resolveTicket")}</TooltipContent></Tooltip>
            )}
            {/* Transferir — oculto no mobile (disponível no dropdown) */}
            {ticket.status === "open" && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex" onClick={() => setTransferOpen(true)}>
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>{tE("transfer")}</TooltipContent></Tooltip>
            )}
            {/* Transferir Canal — oculto no mobile (disponível no dropdown) */}
            {ticket.status === "open" && availableWhatsapps && availableWhatsapps.length > 0 && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex" onClick={() => setChannelTransferOpen(true)}>
                  <Radio className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>{tE("transferChannel")}</TooltipContent></Tooltip>
            )}
            {/* Mídias, links e docs — oculto no mobile (disponível no dropdown) */}
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex" onClick={openMediaModal} disabled={!ticket.id}>
                <ImageIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger><TooltipContent>{tE("mediaLinksAndDocs")}</TooltipContent></Tooltip>
            {/* Compartilhar ticket (não-grupos) — oculto no mobile */}
            {!ticket.isGroup && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex" onClick={openShareModal}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>{tE("shareTicket")}</TooltipContent></Tooltip>
            )}
            {/* Usuários do Grupo (grupos apenas) — oculto no mobile */}
            {ticket.isGroup && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 relative hidden sm:inline-flex" onClick={openGroupUsersModal}>
                  <Users className="h-4 w-4" />
                  {(groupTicket.groupUserIdArray?.length ?? 0) > 0 && (
                    <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-success" />
                  )}
                </Button>
              </TooltipTrigger><TooltipContent>{tE("groupUsers")}</TooltipContent></Tooltip>
            )}
            {/* Buscar mensagens — oculto no mobile (disponível no dropdown) */}
            <Tooltip><TooltipTrigger asChild>
              <Button variant={searchOpen ? "secondary" : "ghost"} size="icon" className="h-8 w-8 hidden sm:inline-flex" onClick={() => setSearchOpen(!searchOpen)}>
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger><TooltipContent>{tE("searchMessages")}</TooltipContent></Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={onToggleDetail}>
                  <Info className="mr-2 h-4 w-4" /> {tE("viewContactDetails")}
                </DropdownMenuItem>
                {/* Buscar mensagens — só visível no mobile (botão oculto no toolbar) */}
                <DropdownMenuItem onClick={() => setSearchOpen(!searchOpen)} className="sm:hidden">
                  <Search className="mr-2 h-4 w-4" /> {tE("searchMessages")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTransferOpen(true)} disabled={ticket.status === "closed"}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" /> {tE("transfer")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenChatbot} disabled={ticket.status === "closed" || (controlFeatures && userProfile === "user")}>
                  <Bot className="mr-2 h-4 w-4" /> {tE("transferToChatbot")}
                </DropdownMenuItem>
                {availableWhatsapps && availableWhatsapps.length > 0 && (
                  <DropdownMenuItem onClick={() => setChannelTransferOpen(true)} disabled={ticket.status === "closed"}>
                    <Radio className="mr-2 h-4 w-4" /> {tE("transferChannel")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openScheduleModal} disabled={ticket.status === "closed" || !isScheduleChannel}>
                  <Clock className="mr-2 h-4 w-4" /> {tE("scheduleMessage")}
                </DropdownMenuItem>
                {/* Pausar — visível somente se allowPause estiver habilitado nas configurações */}
                {allowPause !== false && (
                  <DropdownMenuItem onClick={handleTogglePause} disabled={ticket.status === "closed"}>
                    {isPaused ? <RotateCcw className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />}
                    {isPaused ? tE("resumeTicket") : tE("pauseTicket")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openMediaModal} disabled={!ticket.id}>
                  <ImageIcon className="mr-2 h-4 w-4" /> {tE("mediaLinksAndDocs")}
                </DropdownMenuItem>
                {!ticket.isGroup && (
                  <DropdownMenuItem onClick={openShareModal}>
                    <Share2 className="mr-2 h-4 w-4" /> {tE("shareTicket")}
                  </DropdownMenuItem>
                )}
                {ticket.isGroup && (
                  <DropdownMenuItem onClick={openGroupUsersModal}>
                    <Users className="mr-2 h-4 w-4" /> {tE("groupUsers")}
                  </DropdownMenuItem>
                )}
                {typeof autoScrollEnabled === "boolean" && onToggleAutoScroll && (
                  <DropdownMenuItem onClick={onToggleAutoScroll}>
                    <ArrowUpDown className="mr-2 h-4 w-4" />
                    {autoScrollEnabled ? tE("stopAutoScroll") : tE("enableAutoScroll")}
                  </DropdownMenuItem>
                )}
                {ticket.status === "open" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleReturnToQueue}>
                      <Undo2 className="mr-2 h-4 w-4" /> {tE("returnToQueue")}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={handleClose}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> {tE("closeTicket")}
                    </DropdownMenuItem>
                  </>
                )}
                {ticket.status !== "open" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleReopen}>
                      <RotateCcw className="mr-2 h-4 w-4" /> {tE("reopenTicket")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant={detailOpen ? "secondary" : "ghost"} size="icon" className="h-8 w-8 hidden sm:inline-flex" onClick={onToggleDetail}>
              <Info className="h-4 w-4" />
            </Button>

            {/* Fechar conversa — mesma ação do ESC (deseleciona o ticket) */}
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onCloseChat?.()}>
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger><TooltipContent>{tE("closeChat")}</TooltipContent></Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={(open) => { setTransferOpen(open); if (!open) { setTransferQueue(""); setTransferNoQueue(false); setTransferUser(""); setTransferMessage(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tE("transferTitle")}</DialogTitle>
            <DialogDescription>{tE("transferDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{tE("queueLabel")}</Label>
              <SearchableSelect
                options={queues.filter((q) => q.isActive !== false).map((q) => ({ value: String(q.id), label: q.name }))}
                value={transferQueue}
                onValueChange={(v) => { setTransferQueue(v); setTransferUser(""); }}
                placeholder={tE("selectQueue")}
                disabled={transferNoQueue}
              />
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="chat-transfer-no-queue"
                  checked={transferNoQueue}
                  onCheckedChange={(v) => {
                    const checked = v === true;
                    setTransferNoQueue(checked);
                    if (checked) setTransferQueue("");
                  }}
                />
                <Label htmlFor="chat-transfer-no-queue" className="text-sm font-normal cursor-pointer">
                  {tE("transferNoQueue")}
                </Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tE("attendantOptional")}</Label>
              <SearchableSelect
                options={[
                  ...users
                    .filter((u) => !transferQueue || (u.queues || []).some((q) => q.id === parseInt(transferQueue)))
                    .map((u) => ({ value: String(u.id), label: u.name })),
                ]}
                value={transferUser}
                onValueChange={setTransferUser}
                placeholder={tE("anyAttendant")}
              />
            </div>
            <div className="space-y-2">
              <Label>{tE("transferMessageLabel")}</Label>
              <Textarea
                value={transferMessage}
                onChange={(e) => setTransferMessage(e.target.value)}
                placeholder={tE("transferMessagePlaceholder")}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTransferOpen(false); setTransferQueue(""); setTransferNoQueue(false); setTransferUser(""); setTransferMessage(""); }}>{tE("cancel")}</Button>
            <Button onClick={handleTransferSubmit} disabled={!transferQueue && !transferNoQueue}>{tE("transfer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pause Dialog */}
      <Dialog open={pauseDialogOpen} onOpenChange={(v) => { if (!pauseSending) setPauseDialogOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pause className="h-5 w-5" /> {tE("pauseDialogTitle")}</DialogTitle>
            <DialogDescription>{tE("pauseDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{tE("pauseReasonLabel")}</Label>
              <Textarea
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder={tE("pauseReasonPlaceholder")}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="pause-transfer"
                checked={pauseTransferAfter}
                onCheckedChange={(v) => setPauseTransferAfter(!!v)}
              />
              <Label htmlFor="pause-transfer" className="cursor-pointer font-normal">{tE("pauseTransferAfter")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseDialogOpen(false)} disabled={pauseSending}>{tE("cancel")}</Button>
            <Button onClick={handleConfirmPause} disabled={pauseSending}>
              <Pause className="mr-2 h-4 w-4" /> {tE("pauseConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chatbot Transfer Dialog */}
      <Dialog open={chatbotOpen} onOpenChange={setChatbotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> {tE("chatbotTitle")}</DialogTitle>
            <DialogDescription>{tE("chatbotDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <SearchableSelect
              options={chatFlows.map((cf) => ({ value: String(cf.id), label: cf.name }))}
              value={selectedChatFlow}
              onValueChange={setSelectedChatFlow}
              placeholder={tE("selectChatbot")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChatbotOpen(false)}>{tE("cancel")}</Button>
            <Button onClick={handleTransferChatbot} disabled={!selectedChatFlow}>{tE("transfer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel Transfer Dialog */}
      <Dialog open={channelTransferOpen} onOpenChange={(v) => { setChannelTransferOpen(v); if (!v) setChannelTransferId(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> {tE("channelTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <SearchableSelect
              options={(availableWhatsapps || []).map((w) => ({ value: String(w.id), label: `${w.name}${w.type ? ` (${w.type})` : ""}` }))}
              value={channelTransferId}
              onValueChange={setChannelTransferId}
              placeholder={tE("selectPlaceholder")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChannelTransferOpen(false)}>{tE("cancel")}</Button>
            <Button onClick={handleTransferChannel} disabled={!channelTransferId}>{tE("transfer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Message Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> {tE("scheduleTitle")}</DialogTitle>
            <DialogDescription>
              {isWaba ? tE("scheduleWabaDesc") : tE("scheduleDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* ── Data/hora + presets (somente WABA — não-WABA tem por item) ── */}
            {isWaba && (
              <div className="space-y-2">
                <Label>{tE("dateTimeLabel")}</Label>
                <Input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                <div className="flex gap-1 flex-wrap">
                  {[
                    { label: "+30 min", ms: 30 * 60 * 1000 },
                    { label: tE("tomorrow"), ms: 24 * 60 * 60 * 1000 },
                    { label: "+1 semana", ms: 7 * 24 * 60 * 60 * 1000 },
                  ].map(({ label, ms }) => (
                    <button key={label} type="button"
                      className="text-xs px-2 py-1 rounded border border-input bg-muted hover:bg-accent transition-colors"
                      onClick={() => setScheduleDate(toLocalDatetime(new Date(Date.now() + ms)))}
                    >{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── WABA: template + preview + vars + gallery ── */}
            {isWaba && (
              <div className="space-y-3">
                <Label>{tE("wabaTemplate")}</Label>
                {scheduleLoading ? (
                  <div className="flex justify-center py-4"><RefreshCw className="h-5 w-5 animate-spin" /></div>
                ) : wabaTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tE("noTemplateFound")}</p>
                ) : !wabaSelectedTemplate ? (
                  /* Template list */
                  <div className="space-y-2">
                    <Input
                      placeholder={tE("schedWabaTemplateSearch")}
                      value={wabaTemplateSearch}
                      onChange={(e) => setWabaTemplateSearch(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="border rounded-md max-h-48 overflow-y-auto">
                      {wabaTemplates
                        .filter((t) => !wabaTemplateSearch || t.name.toLowerCase().includes(wabaTemplateSearch.toLowerCase()))
                        .map((tmpl) => (
                          <button
                            key={`${tmpl.name}::${tmpl.language}`}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-0"
                            onClick={() => { setWabaSelectedTemplate(tmpl); setWabaTemplateSelected(tmpl.name); }}
                          >
                            <span className="font-medium">{tmpl.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">({tmpl.language})</span>
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  /* Template selected: preview + vars */
                  <div className="space-y-3">
                    {/* Change button */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{wabaSelectedTemplate.name}</span>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => { setWabaSelectedTemplate(null); setWabaTemplateSelected(""); setWabaTemplateVars([]); }}
                      >{tE("schedWabaChangeTemplate")}</button>
                    </div>
                    {/* WhatsApp-style preview */}
                    <div className="bg-[#e5ddd5] rounded-lg p-3 space-y-1">
                      {(() => {
                        const comps = wabaSelectedTemplate.components || [];
                        const header = comps.find((c) => c.type === "HEADER");
                        const body = comps.find((c) => c.type === "BODY");
                        const footer = comps.find((c) => c.type === "FOOTER");
                        const buttons = comps.filter((c) => c.type === "BUTTONS" || c.type === "BUTTON");
                        const headerLinkVal = wabaTemplateVars.find((v) => v.isHeaderLink)?.value;
                        // Build preview body text with var substitutions
                        let bodyText = body?.text || "";
                        wabaTemplateVars.filter((v) => !v.isHeaderLink).forEach((v, idx) => {
                          const num = idx + 1;
                          bodyText = bodyText.replace(new RegExp(`\\{\\{${num}\\}\\}`, "g"), v.value || `{{${num}}}`);
                          if (v.key.startsWith("named_")) {
                            const name = v.key.replace("named_", "");
                            bodyText = bodyText.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), v.value || `{{${name}}}`);
                          }
                        });
                        return (
                          <div className="bg-white rounded-lg p-2 shadow-sm max-w-xs space-y-1 text-gray-900">
                            {header && header.format === "IMAGE" && (
                              headerLinkVal
                                ? <img src={headerLinkVal} alt="header" className="w-full rounded object-cover max-h-32" />
                                : <div className="w-full h-20 bg-gray-100 rounded flex items-center justify-center"><Images className="h-6 w-6 text-gray-500" /></div>
                            )}
                            {header && header.format === "VIDEO" && (
                              headerLinkVal
                                ? <video src={headerLinkVal} className="w-full rounded max-h-32" controls />
                                : <div className="w-full h-20 bg-gray-100 rounded flex items-center justify-center"><Images className="h-6 w-6 text-gray-500" /></div>
                            )}
                            {header && header.format === "TEXT" && (
                              <p className="text-sm font-bold text-gray-900">{header.text}</p>
                            )}
                            {bodyText && <p className="text-sm whitespace-pre-wrap text-gray-900">{bodyText}</p>}
                            {footer?.text && <p className="text-xs text-gray-500">{footer.text}</p>}
                            {(buttons as { type: string; text?: string; buttons?: { type: string; text: string }[] }[]).flatMap((b) => b.buttons ?? [b as { type: string; text?: string }]).map((btn, i) => (
                              <div key={i} className="border-t border-gray-200 pt-1 text-center text-xs text-blue-600 font-medium">{String(btn.text || "")}</div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Variable inputs */}
                    {wabaTemplateVars.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs">{tE("schedWabaVarsTitle")}</Label>
                        {wabaTemplateVars.map((v, idx) => (
                          <div key={v.key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{v.label}</Label>
                            <div className="flex gap-2">
                              <Input
                                className="h-8 text-sm flex-1"
                                value={v.value}
                                onChange={(e) => setWabaTemplateVars((prev) => prev.map((x, i) => i === idx ? { ...x, value: e.target.value, ...(x.isHeaderLink ? { filename: undefined } : {}) } : x))}
                                placeholder={v.isHeaderLink ? "https://..." : v.label}
                              />
                              {v.isHeaderLink && (
                                <button
                                  type="button"
                                  className="h-8 px-2 text-xs border rounded hover:bg-accent transition-colors shrink-0 flex items-center gap-1"
                                  onClick={() => setWabaSchedGalleryOpen(true)}
                                >
                                  <Images className="h-3.5 w-3.5" />
                                  {tE("schedWabaPickFromGallery")}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Não-WABA: lista de itens (data/texto/arquivos por item) ── */}
            {!isWaba && (
              <>
                <div className="space-y-3">
                  {scheduleItems.map((item, idx) => (
                    <div key={item.id} className="rounded-md border p-3 space-y-3 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">{tE("schedItemTitle", { n: idx + 1 })}</span>
                        {scheduleItems.length > 1 && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => removeScheduleItem(idx)}
                            aria-label={tE("removeItem")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Data/hora + presets do item */}
                      <div className="space-y-2">
                        <Label className="text-xs">{tE("dateTimeLabel")}</Label>
                        <Input
                          type="datetime-local"
                          value={item.date}
                          onChange={(e) => updateScheduleItem(idx, { date: e.target.value })}
                        />
                        <div className="flex gap-1 flex-wrap">
                          {[
                            { label: "+30 min", ms: 30 * 60 * 1000 },
                            { label: tE("tomorrow"), ms: 24 * 60 * 60 * 1000 },
                            { label: "+1 semana", ms: 7 * 24 * 60 * 60 * 1000 },
                          ].map(({ label, ms }) => (
                            <button key={label} type="button"
                              className="text-xs px-2 py-1 rounded border border-input bg-background hover:bg-accent transition-colors"
                              onClick={() => updateScheduleItem(idx, { date: toLocalDatetime(new Date(Date.now() + ms)) })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {/* Texto (opcional) */}
                      <div className="space-y-1">
                        <Label className="text-xs">{tE("messageLabelOptional")}</Label>
                        <Textarea
                          value={item.text}
                          onChange={(e) => updateScheduleItem(idx, { text: e.target.value })}
                          placeholder={tE("messagePlaceholder")}
                          rows={3}
                          className="resize-none"
                        />
                      </div>

                      {/* Arquivos (opcional, múltiplos) — somente canais com suporte */}
                      {isWhatsappOrBaileys && (
                        <div className="space-y-1">
                          <Label className="text-xs">{tE("filesLabelOptional")}</Label>
                          <div
                            className="border-2 border-dashed rounded-md p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => document.getElementById(`schedule-file-input-${item.id}`)?.click()}
                          >
                            <p className="text-xs text-muted-foreground">{tE("clickToSelectFiles")}</p>
                          </div>
                          <input
                            id={`schedule-file-input-${item.id}`}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const picked = Array.from(e.target.files ?? []);
                              if (picked.length) updateScheduleItem(idx, { files: [...item.files, ...picked] });
                              e.target.value = "";
                            }}
                          />
                          {item.files.length > 0 && (
                            <ul className="space-y-1 pt-1">
                              {item.files.map((f, fi) => (
                                <li key={`${f.name}-${fi}`} className="flex items-center justify-between text-xs bg-background rounded border px-2 py-1">
                                  <span className="truncate flex-1 mr-2">{f.name}</span>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => updateScheduleItem(idx, { files: item.files.filter((_, i) => i !== fi) })}
                                    aria-label={tE("removeFile")}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* Assinatura — só se houver texto e nome do usuário */}
                      {item.text.trim() && userName?.trim() && (
                        <div className="flex items-center justify-between rounded-md border bg-background p-2">
                          <div className="space-y-0.5">
                            <Label htmlFor={`schedule-signature-${item.id}`} className="text-xs cursor-pointer">
                              {tE("signatureLabel")}
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              {item.signature
                                ? tE(
                                    isWhatsappChannel(ticket.channel)
                                      ? "signatureOnHint"
                                      : "signatureOnHintPlain",
                                    { name: userName.trim() }
                                  )
                                : tE("signatureOffHint")}
                            </p>
                          </div>
                          <Switch
                            id={`schedule-signature-${item.id}`}
                            checked={item.signature}
                            onCheckedChange={(v) => updateScheduleItem(idx, { signature: !!v })}
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addScheduleItem}
                    className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-md border border-dashed hover:bg-accent transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {tE("addScheduleItem")}
                  </button>
                </div>

                {/* ── Recorrência (aplica a todos os itens) ── */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs">{tE("recurrence")}</Label>
                    <Select value={String(scheduleRecurrence)} onValueChange={(v) => setScheduleRecurrence(v === "none" ? "none" : v === "custom" ? ("custom" as unknown as number) : Number(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tE("noRepeat")}</SelectItem>
                        {[5, 10, 15, 20, 25, 30, 35, 40, 45, 60].map((d) => (
                          <SelectItem key={d} value={String(d)}>{tE("everyDays", { days: d })}</SelectItem>
                        ))}
                        <SelectItem value="custom">{tE("custom")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tE("repetitions")}</Label>
                    <Input
                      type="number" min={1} max={30} className="h-8 text-xs"
                      value={scheduleRecurrenceCount}
                      onChange={(e) => setScheduleRecurrenceCount(Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={scheduleRecurrence === "none"}
                    />
                  </div>
                </div>
                {scheduleRecurrence === ("custom" as unknown as number) && (
                  <div className="space-y-1">
                    <Label className="text-xs">{tE("customInterval")}</Label>
                    <Input
                      type="number" min={1} className="h-8 text-xs"
                      value={scheduleRecurrenceCustomDays}
                      onChange={(e) => setScheduleRecurrenceCustomDays(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                )}
              </>
            )}

            {/* ── Atendimento: abrir ticket no envio / rotear resposta ── */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-xs">{tE("schedRoutingOpenTicketLabel")}</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {schedOpenTicket ? tE("schedRoutingHintOpenOnSend") : tE("schedRoutingHintOnReply")}
                  </p>
                </div>
                <Switch checked={schedOpenTicket} onCheckedChange={setSchedOpenTicket} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{tE("schedRoutingQueue")}</Label>
                  <Select value={schedRouteQueueId} onValueChange={setSchedRouteQueueId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tE("schedRoutingNone")}</SelectItem>
                      {queues.map((q) => (
                        <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tE("schedRoutingUser")}</Label>
                  <Select value={schedRouteUserId} onValueChange={setSchedRouteUserId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tE("schedRoutingNone")}</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {schedOpenTicket && schedRouteQueueId === "none" && schedRouteUserId === "none" && (
                <p className="text-[11px] text-muted-foreground">{tE("schedRoutingHintDefault")}</p>
              )}
              {schedOpenTicket && scheduleRecurrence !== "none" && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">{tE("schedRoutingHintRecurrence")}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>{tE("cancel")}</Button>
            <Button
              onClick={handleScheduleMessage}
              disabled={
                scheduleLoading ||
                (isWaba
                  ? (!scheduleDate || !wabaTemplateSelected)
                  : !scheduleItems.some((it) => it.date && (it.text.trim() || it.files.length > 0)))
              }
            >
              {scheduleLoading ? tE("scheduling") : tE("schedule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WABA Schedule Gallery Dialog */}
      <GalleryPickerWithUploadDialog
        open={wabaSchedGalleryOpen}
        onOpenChange={setWabaSchedGalleryOpen}
        onPick={pickWabaSchedGalleryItem}
        {...wabaHeaderFormatToGalleryParams(
          wabaSelectedTemplate?.components?.find((c) => c.type === "HEADER")?.format
        )}
      />

      {/* Mídias, Links e Docs Dialog */}
      <Dialog open={mediaOpen} onOpenChange={setMediaOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" /> {tE("mediaTitle")}
            </DialogTitle>
            <DialogDescription>
              {tE("mediaDesc")}
              {mediaTotal != null && mediaTotal > 0 ? ` (${mediaTotal})` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex border-b mb-2">
            {(["media", "links", "docs"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMediaTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${mediaTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab === "media" ? tE("mediaTab", { count: mediaTypeItems.length }) : tab === "links" ? tE("linksTab", { count: linkTypeItems.length }) : tE("docsTab", { count: docTypeItems.length })}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto flex-1 min-h-[200px] pr-2">
            {mediaLoading && mediaMessages.length === 0 ? (
              <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : mediaTab === "media" ? (
              mediaTypeItems.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">{tE("noMedia")}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 p-1">
                  {mediaTypeItems.map((m) => {
                    const mt = (m.mediaType ?? "").toLowerCase();
                    const isAudio = mt.startsWith("audio");
                    const isVideo = mt.startsWith("video");
                    return (
                      <div key={m.id} className="relative rounded-lg overflow-hidden border bg-muted aspect-square flex items-center justify-center group">
                        {isAudio ? (
                          <div className="flex flex-col items-center gap-1 p-2 w-full">
                            <audio src={m.mediaUrl} controls className="w-full max-w-full" style={{ height: 32 }} />
                          </div>
                        ) : isVideo ? (
                          <video src={m.mediaUrl} className="w-full h-full object-cover" />
                        ) : (
                          <img src={m.mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        )}
                        <button
                          type="button"
                          onClick={() => goToMessage(m.id)}
                          className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded p-0.5"
                          title={tE("goToMessage")}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                        {m.mediaUrl && (
                          <a
                            href={m.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded p-0.5"
                            title={tE("download")}
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : mediaTab === "links" ? (
              linkTypeItems.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">{tE("noLinks")}</p>
              ) : (
                <div className="space-y-2 p-1">
                  {linkTypeItems.map(({ url, msgId }) => {
                    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
                    const ytId = ytMatch?.[1];
                    let domain = "";
                    try { domain = new URL(url).hostname; } catch { /* empty */ }
                    return (
                      <div
                        key={`${msgId}-${url}`}
                        className="flex items-center gap-1 rounded border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-2 flex-1 min-w-0"
                        >
                          {ytId ? (
                            <img
                              src={`https://img.youtube.com/vi/${ytId}/default.jpg`}
                              alt=""
                              className="h-12 w-20 object-cover rounded shrink-0"
                            />
                          ) : (
                            <img
                              src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
                              alt=""
                              className="h-6 w-6 rounded shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-primary truncate hover:underline">{url}</p>
                            {domain && <p className="text-xs text-muted-foreground">{domain}</p>}
                          </div>
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 mr-1"
                          title={tE("goToMessage")}
                          onClick={() => goToMessage(msgId)}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              docTypeItems.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">{tE("noDocs")}</p>
              ) : (
                <div className="space-y-2 p-1">
                  {docTypeItems.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.fileName || m.body || tE("document")}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title={tE("goToMessage")}
                        onClick={() => goToMessage(m.id)}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      {m.mediaUrl && (
                        <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" download title={tE("download")}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><FileDown className="h-4 w-4" /></Button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
          {mediaHasMore && (
            <div className="flex justify-center pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => loadMediaMessages(false)} disabled={mediaLoading}>
                {mediaLoading ? tE("loading") : tE("loadMore")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compartilhar Ticket Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" /> {tE("shareTitle")}
            </DialogTitle>
            <DialogDescription>{tE("shareDesc")}</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-[200px] pr-2">
            {shareLoading ? (
              <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : shareUsers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">{tE("noUsersAvailable")}</p>
            ) : (
              <div className="space-y-1 p-1">
                {shareUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                    <Checkbox
                      checked={shareSelected.has(u.id)}
                      onCheckedChange={() => toggleShareUser(u.id)}
                    />
                    <span className="text-sm">{u.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>{tE("cancel")}</Button>
            <Button onClick={confirmShare} disabled={shareLoading}>
              {shareLoading ? tE("saving") : tE("confirm")}
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
        isRestrictedUser={isRestricted}
        notViewAssignedTickets={headerNotViewAssigned}
        targetWhatsappId={Number((ticket as unknown as { whatsappId?: number }).whatsappId ?? ticket.whatsapp?.id ?? 0) || null}
        onConfirm={() => { setReopenPrompt(null); void reopenTicketNow(); }}
      />

      {/* Usuários do Grupo Dialog */}
      <Dialog open={groupUsersOpen} onOpenChange={setGroupUsersOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> {tE("groupUsersTitle")}
            </DialogTitle>
            <DialogDescription>{tE("groupUsersDesc")}</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-[200px] pr-2">
            {groupUsersLoading ? (
              <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : groupUsersList.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">{tE("noUsersAvailable")}</p>
            ) : (
              <div className="space-y-1 p-1">
                {groupUsersList.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                    <Checkbox
                      checked={groupUsersSelected.has(u.id)}
                      onCheckedChange={() => toggleGroupUser(u.id)}
                    />
                    <span className="text-sm">{u.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupUsersOpen(false)}>{tE("cancel")}</Button>
            <Button onClick={confirmGroupUsers} disabled={groupUsersLoading}>
              {groupUsersLoading ? tE("saving") : tE("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Reason (Demanda) Dialog */}
      <Dialog open={forceReasonOpen} onOpenChange={(o) => { if (!o) setForceReasonOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tE("demandTitle")}</DialogTitle>
            <DialogDescription>{tE("demandDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {reasonsLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Popover open={reasonComboOpen} onOpenChange={setReasonComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={reasonComboOpen}
                    className="w-full justify-between"
                  >
                    <span className="truncate flex items-center gap-2 min-w-0">
                      {(() => {
                        const sel = selectedReasonId === null ? null : reasonsList.find((r) => r.id === selectedReasonId);
                        return (
                          <>
                            {sel?.color && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full border border-black/10 shrink-0"
                                style={{ backgroundColor: sel.color }}
                              />
                            )}
                            <span className="truncate">{sel ? sel.name : tE("noneOption")}</span>
                          </>
                        );
                      })()}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={tE("searchReason")} />
                    <CommandList>
                      <CommandEmpty>{tE("noReasonsFound")}</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => { setSelectedReasonId(null); setReasonComboOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedReasonId === null ? "opacity-100" : "opacity-0")} />
                          {tE("noneOption")}
                        </CommandItem>
                        {reasonsList.map((r) => (
                          <CommandItem
                            key={r.id}
                            value={r.name}
                            onSelect={() => { setSelectedReasonId(r.id); setReasonComboOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedReasonId === r.id ? "opacity-100" : "opacity-0")} />
                            {r.color && (
                              <span
                                className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-black/10 shrink-0"
                                style={{ backgroundColor: r.color }}
                              />
                            )}
                            {r.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceReasonOpen(false)}>{tE("cancel")}</Button>
            <Button
              disabled={reasonsLoading}
              onClick={async () => {
                if (selectedReasonId === null) { toast.error(tE("selectReason")); return; }
                setForceReasonOpen(false);
                try {
                  await updateTicket(ticket.id, { reasons: selectedReasonId });
                  toast.success(tE("demandSaved"));
                } catch { toast.error(tE("errorSavingDemand")); }
              }}
            >
              {tE("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Farewell Message Dialog */}
      <Dialog open={farewellDialogOpen} onOpenChange={(o) => { if (!o) setFarewellDialogOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tE("farewellTitle")}</DialogTitle>
            <DialogDescription>{tE("farewellDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {farewellLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : farewells.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{tE("noFarewells")}</p>
            ) : (
              <>
                <Popover open={farewellComboOpen} onOpenChange={setFarewellComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={farewellComboOpen}
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {selectedFarewellId
                          ? (() => {
                              const sel = farewells.find((f) => f.id === selectedFarewellId);
                              return sel?.name?.trim() || sel?.message?.slice(0, 40) || `#${selectedFarewellId}`;
                            })()
                          : tE("selectFarewell")}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={tE("searchFarewell")} />
                      <CommandList>
                        <CommandEmpty>{tE("noFarewells")}</CommandEmpty>
                        <CommandGroup>
                          {farewells.map((f) => {
                            const displayName = f.name?.trim() || f.message?.slice(0, 40) || `#${f.id}`;
                            return (
                              <CommandItem
                                key={f.id}
                                value={`${f.id}-${displayName}`}
                                onSelect={() => {
                                  setSelectedFarewellId(f.id);
                                  setFarewellComboOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedFarewellId === f.id ? "opacity-100" : "opacity-0")} />
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate">{displayName}</p>
                                  <p className="text-xs text-muted-foreground line-clamp-1">{f.message}</p>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {selectedFarewellId && (() => {
                  const selected = farewells.find((f) => f.id === selectedFarewellId);
                  return selected ? (
                    <div className="rounded-md border border-border bg-muted/40 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{tE("farewellPreview")}</p>
                      <p className="text-sm whitespace-pre-wrap">{selected.message}</p>
                    </div>
                  ) : null;
                })()}
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleFarewellConfirm} disabled={farewellLoading}>
              {tE("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Avaliação automática: perguntar se quer fechar forçado (envia avaliação + encerra agora) */}
      <Dialog open={evalCloseOpen} onOpenChange={(o) => { if (!o && !evalCloseBusy) setEvalCloseOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tE("evalForceCloseTitle")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <span className="block">{tE("evalForceCloseIntro")}</span>
                <span className="block">{tE("evalForceCloseForceInfo")}</span>
                {evalCloseWindowMs != null ? (
                  <span className="block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {tE("evalForceCloseWindowNote", { time: formatRatingWindow(evalCloseWindowMs) })}
                  </span>
                ) : (
                  <span className="block text-xs font-medium text-amber-600 dark:text-amber-400">
                    {tE("evalForceCloseNoWindowNote")}
                  </span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEvalCloseOpen(false)} disabled={evalCloseBusy}>
              {tE("cancel")}
            </Button>
            <Button variant="secondary" onClick={handleEvalKeepOpen} disabled={evalCloseBusy}>
              {tE("evalForceCloseKeepOpen")}
            </Button>
            <Button onClick={handleEvalForceClose} disabled={evalCloseBusy}>
              {evalCloseBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : tE("evalForceCloseConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProfilePicPreviewDialog preview={profilePicPreview} onClose={() => setProfilePicPreview(null)} blur={isLiveMode} />
    </>
  );
}

// SMS Modal Component
function SmsModal({
  open,
  onOpenChange,
  phoneNumber,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber?: string;
  onSend: (message: string, service: string) => void;
}) {
  const t = useTranslations("atendimentoModalSMS");
  const [message, setSmsMessage] = useState("");
  const [service, setSmsService] = useState("");
  const SMS_LIMIT = 160;
  const segments = Math.ceil((message.length || 1) / SMS_LIMIT);
  const services = [
    { label: "Comtele", value: "comtele" },
    { label: "ConectaStartup", value: "conecta" },
    { label: "BHI / Livson", value: "livson" },
  ];

  const handleSend = () => {
    if (!service) { toast.warning(t("noServiceSelected")); return; }
    if (!message.trim()) { toast.warning(t("typeMessageSMS")); return; }
    onSend(message, service);
    setSmsMessage("");
    setSmsService("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" /> {t("title")}
          </DialogTitle>
          <DialogDescription>
            {phoneNumber ? t("to", { phone: phoneNumber }) : t("sendSMSMessage")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("messageLabelText")}</Label>
            <Textarea
              value={message}
              onChange={(e) => setSmsMessage(e.target.value)}
              placeholder={t("messagePlaceholder")}
              rows={4}
              className="resize-none"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("characters", { count: message.length })}</span>
              <span>{t("smsCount", { count: segments })} {segments > 1 ? t("multiple") : ""}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("serviceLabel")}</Label>
            <Select value={service} onValueChange={setSmsService}>
              <SelectTrigger><SelectValue placeholder={t("selectServiceLabel")} /></SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={handleSend} disabled={!message.trim() || !service}>
            <Smartphone className="mr-2 h-4 w-4" /> {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChatArea({
  ticket,
  messages,
  loading,
  messagesLoading = false,
  hasMore,
  onLoadMore,
  onSendText,
  onSendMedia,
  onSendLocation,
  onDeleteMessage,
  onForwardMessage,
  onForwardPrivateMessage,
  onForwardOtherChannelMessage,
  onReactMessage,
  onEditMessage,
  onStarMessage,
  onPinMessage,
  pinnedMessages = [],
  multiForwardActive = false,
  multiForwardSelected = [],
  onToggleMultiForward,
  onToggleMultiForwardMsg,
  onTransfer,
  onToggleDetail,
  onOpenDetailTab,
  detailOpen,
  onRefresh,
  queues,
  users,
  autoScrollEnabled = true,
  onToggleAutoScroll,
  onOpenEmailModal,
  userName,
  signatureEnabled = true,
  onToggleSignature,
  allowPause,
  forceReason,
  controlFeatures,
  userProfile,
  convitesCount = 0,
  onOpenConvites,
  availableWhatsapps,
  clearReplySignal = 0,
  onSearchHistory,
  searchingHistory = false,
  searchNav = null,
  onCloseChat,
  unreadAtOpen = 0,
  onAcceptTicket,
  onRetryMessage,
}: {
  ticket: Ticket | null;
  messages: Message[];
  loading: boolean;
  messagesLoading?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSendText: (text: string, quotedMsg?: Message, opts?: { forceLinked?: boolean }) => void;
  onSendMedia: (file: File, caption: string, quotedMsg?: Message, isSticker?: boolean) => void;
  onSendLocation: (lat: number, lng: number, name?: string, address?: string) => void;
  onDeleteMessage: (msg: Message) => void;
  onForwardMessage: (msg: Message) => void;
  onForwardPrivateMessage?: (msg: Message) => void;
  onForwardOtherChannelMessage?: (msg: Message) => void;
  onReactMessage: (msg: Message, emoji: string) => void;
  onEditMessage: (msg: Message, newBody: string) => void;
  onStarMessage?: (msg: Message) => void;
  onPinMessage?: (msg: Message) => void;
  pinnedMessages?: Message[];
  multiForwardActive?: boolean;
  multiForwardSelected?: Message[];
  onToggleMultiForward?: () => void;
  onToggleMultiForwardMsg?: (msg: Message, checked: boolean) => void;
  onTransfer: (queueId: number | null, userId?: number) => void;
  onToggleDetail: () => void;
  onOpenDetailTab?: (tab: DetailTab) => void;
  detailOpen: boolean;
  onRefresh: () => void;
  queues: { id: number; name: string; color: string; isActive?: boolean }[];
  users: { id: number; name: string; queues?: { id: number }[] }[];
  autoScrollEnabled?: boolean;
  onToggleAutoScroll?: () => void;
  onOpenEmailModal?: () => void;
  userName?: string | null;
  signatureEnabled?: boolean;
  onToggleSignature?: (enabled: boolean) => void;
  allowPause?: boolean;
  forceReason?: boolean;
  controlFeatures?: boolean;
  userProfile?: string;
  convitesCount?: number;
  onOpenConvites?: () => void;
  availableWhatsapps?: { id: number; name: string; type?: string }[];
  clearReplySignal?: number;
  onSearchHistory?: (term: string, direction?: "older" | "newer") => void | Promise<void>;
  searchingHistory?: boolean;
  searchNav?: SearchNavState | null;
  onCloseChat?: () => void;
  /** Não-lidas no momento em que o ticket foi aberto (unreadMessages é zerado na seleção) */
  unreadAtOpen?: number;
  /** CTA "Atender" no rodapé do pendente — mesma visibilidade do botão aceitar do card */
  onAcceptTicket?: (ticket: Ticket) => void;
  /** Reenvio de bolha falhada (ack -1) — repassado ao MessageBubble */
  onRetryMessage?: (msg: Message) => void;
}) {
  const { isRestrictedUser } = useAuthStore();
  const isRestricted = isRestrictedUser();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  useEffect(() => { setReplyTo(null); }, [clearReplySignal]);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<number | null>(null);
  // Gate do auto-scroll: ticket cujo salto incondicional para o fundo JÁ aconteceu.
  // Só é marcado num render que tem mensagens — a abertura de ticket passa por um
  // render intermediário vazio (handleSelectTicket faz setMessages([]) antes do
  // fetch) e marcar ali queimaria o salto, deixando o ticket abrir no meio.
  const initialPinDoneForRef = useRef<number | null>(null);
  // Badge "novas" no botão de descer: mensagens recebidas com o usuário longe do fundo
  const [newBelowCount, setNewBelowCount] = useState(0);
  const lastMsgIdRef = useRef<string | number | null>(null);
  // CTA "Atender" do pendente (rodapé) — spinner enquanto o aceite roda
  const [ctaAccepting, setCtaAccepting] = useState(false);
  // Infinite scroll do histórico: sentinel no TOPO do container + observer.
  // Guards: in-flight, cooldown 2s, ready-flag ~800ms pós-troca de ticket e
  // rearme somente após o número de mensagens ter crescido desde o último load.
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const infLoadInFlightRef = useRef(false);
  const infLoadLastAtRef = useRef(0);
  const infReadyRef = useRef(false);
  const infLastTriggerCountRef = useRef(-1);
  const messagesLenRef = useRef(0);
  messagesLenRef.current = messages.length;
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  const handleChatScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 60);
    setIsAtTop(scrollTop < 60);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const firstUnreadMsgId = messages.find((m) => !m.read && !m.fromMe)?.id ?? null;
  const t = useTranslations("atendimentoChat");
  const tReply = useTranslations("replyViaChannel");
  const { locale } = useLocale();
  // Separador de data no locale ativo + rótulos Hoje/Ontem
  const dateSepToday = new Date().toLocaleDateString(locale);
  const dateSepYesterdayBase = new Date();
  dateSepYesterdayBase.setDate(dateSepYesterdayBase.getDate() - 1);
  const dateSepYesterday = dateSepYesterdayBase.toLocaleDateString(locale);
  const router = useRouter();
  const scrollEnabled = autoScrollEnabled !== false;
  const channel = (ticket?.channel || "").toLowerCase();
  const isSmsChannel = channel === "sms";
  const isWooChannel = channel === "woocommerce" || channel === "nuvemshop";
  const ticketId = ticket?.id;

  const [igCommentRedirectOpen, setIgCommentRedirectOpen] = useState(false);
  const [replyChannelOpen, setReplyChannelOpen] = useState(false);

  const handleReply = useCallback((msg: Message) => {
    if (channel.includes("instagram")) {
      const body = msg.body || "";
      if (
        body.startsWith("💬 Comentário em") ||
        body.startsWith("↩️ Resposta a comentário em")
      ) {
        setIgCommentRedirectOpen(true);
        return;
      }
    }
    setReplyTo(msg);
  }, [channel]);

  const handleLoadMoreClick = () => {
    if (scrollRef.current) {
      // Save distance from current scrollTop to scrollHeight; after older
      // messages are prepended we restore scrollTop so the same visible
      // content stays in view (works whether the user was at the top of
      // the list or anywhere in between).
      scrollAnchorRef.current = scrollRef.current.scrollHeight - scrollRef.current.scrollTop;
    }
    onLoadMore();
  };

  // Ready-flag do infinite scroll: quem arma é o pin inicial no fundo (layout effect
  // do auto-scroll abaixo) — enquanto a conversa não está posicionada, o sentinel do
  // topo fica visível e dispararia "carregar anteriores" sozinho. O timer é só
  // fallback para caminhos que não passam pelo pin (ex.: abrir ticket sem mensagens).
  useEffect(() => {
    infReadyRef.current = false;
    infLastTriggerCountRef.current = -1;
    infLoadInFlightRef.current = false;
    infLoadLastAtRef.current = 0;
    const timer = setTimeout(() => { infReadyRef.current = true; }, 2500);
    return () => clearTimeout(timer);
  }, [ticketId]);

  // Observer do sentinel do topo: mesmo caminho do botão "Carregar anteriores"
  // (seta scrollAnchorRef ANTES do load — paridade com handleLoadMoreClick) e a
  // mesma função de load-more. O botão permanece como fallback visível.
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (!infReadyRef.current || infLoadInFlightRef.current) return;
      const now = Date.now();
      if (now - infLoadLastAtRef.current < 2000) return;
      // Rearme: só dispara de novo depois que o total de mensagens cresceu desde o
      // último load — evita rajada quando a conversa é curta e o sentinel fica visível.
      if (infLastTriggerCountRef.current !== -1 && messagesLenRef.current <= infLastTriggerCountRef.current) return;
      infLoadLastAtRef.current = now;
      infLoadInFlightRef.current = true;
      infLastTriggerCountRef.current = messagesLenRef.current;
      if (scrollRef.current) {
        scrollAnchorRef.current = scrollRef.current.scrollHeight - scrollRef.current.scrollTop;
      }
      Promise.resolve(onLoadMoreRef.current()).finally(() => { infLoadInFlightRef.current = false; });
    }, { root });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, ticketId]);

  // Id da última mensagem: entra nas deps do auto-scroll porque nem toda troca de
  // conversa muda `messages.length` (o fluxo de convites substitui a lista sem
  // passar por vazia — dois tickets com 20 mensagens não disparariam o efeito).
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  // Scroll to bottom when ticket changes or new messages arrive.
  // ResizeObserver re-scrolls as images/media load and expand the container.
  // Layout effect (antes do paint): o pin inicial não pode depender de o
  // ResizeObserver ganhar a corrida contra o flush dos efeitos passivos —
  // era daí que vinha o "às vezes o ticket abre no meio da conversa".
  useIsoLayoutEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;

    // Anchor restoration after "Carregar anteriores" must run regardless of
    // whether autoscroll is enabled — otherwise disabling autoscroll would
    // cause the view to jump to the top of the prepended block.
    if (scrollAnchorRef.current !== null) {
      const distanceFromTop = scrollAnchorRef.current;
      scrollAnchorRef.current = null;
      el.scrollTop = el.scrollHeight - distanceFromTop;
      return;
    }

    if (!scrollEnabled) return;

    // Gate do salto automático: rola incondicionalmente só no primeiro render COM
    // mensagens de cada ticket (pin inicial) ou quando a última mensagem é envio
    // próprio otimista; caso contrário só rola se o usuário já está perto do fundo
    // — não "rouba" a leitura de mensagens antigas quando chega mensagem nova.
    // A lista vazia (troca de ticket, antes do fetch) NÃO consome o pin: rearma o
    // gate, senão a conversa entraria com o salto já gasto e abriria no meio.
    const hasMsgs = messages.length > 0;
    if (!hasMsgs) initialPinDoneForRef.current = null;
    const isInitialPin = hasMsgs && initialPinDoneForRef.current !== (ticketId ?? null);
    if (isInitialPin) initialPinDoneForRef.current = ticketId ?? null;
    const lastMsg = hasMsgs ? messages[messages.length - 1] : null;
    const isOwnOptimistic = !!lastMsg?.fromMe && String(lastMsg.id).startsWith("front-");
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    const shouldStick = isInitialPin || isOwnOptimistic || nearBottom;
    if (shouldStick) el.scrollTop = el.scrollHeight;
    // Infinite scroll só é liberado depois do pin inicial: com a conversa ainda no
    // topo o sentinel fica visível e dispararia "carregar anteriores" sozinho,
    // empilhando histórico acima e deixando o usuário parado no meio.
    if (isInitialPin) infReadyRef.current = true;

    // Track whether the user wants to stay at the bottom.
    // Set from the gate above; set false if user scrolls up.
    let wantsBottom = shouldStick;
    const onUserScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      wantsBottom = scrollHeight - scrollTop - clientHeight < 80;
    };
    el.addEventListener("scroll", onUserScroll, { passive: true });

    // Re-scroll whenever the messages container grows (images / media loading in).
    const msgsContainer = el.querySelector<HTMLElement>("[data-msgs-container]");
    const observer = msgsContainer
      ? new ResizeObserver(() => { if (wantsBottom) el.scrollTop = el.scrollHeight; })
      : null;
    if (observer && msgsContainer) observer.observe(msgsContainer);

    // Stop observing after 5 s — media should be loaded by then. Na abertura do
    // ticket a janela é maior: imagens/áudios/PDFs não têm altura reservada e, ao
    // carregarem, empurram o conteúdo para baixo tirando a conversa do fundo.
    // (o `wantsBottom` acima já para de agir assim que o usuário rola para cima)
    const stop = setTimeout(() => observer?.disconnect(), isInitialPin ? 15000 : 5000);

    return () => {
      el.removeEventListener("scroll", onUserScroll);
      observer?.disconnect();
      clearTimeout(stop);
    };
  }, [messages.length, lastMessageId, scrollEnabled, ticketId]);

  // Badge "novas" no botão de descer: incrementa quando chega mensagem recebida
  // (!fromMe) e o usuário NÃO está perto do fundo (o gate acima não rolou).
  // Roda depois do efeito de auto-scroll — a posição lida já é pós-salto.
  useEffect(() => {
    const last = messages.length > 0 ? messages[messages.length - 1] : null;
    const lastId = last ? last.id : null;
    const prevId = lastMsgIdRef.current;
    lastMsgIdRef.current = lastId;
    if (lastId == null || prevId == null || lastId === prevId) return;
    if (!last || last.fromMe) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) return;
    setNewBelowCount((c) => c + 1);
  }, [messages]);

  // Zera a badge na troca de ticket e ao chegar ao fundo
  useEffect(() => { setNewBelowCount(0); }, [ticketId]);
  useEffect(() => { if (isAtBottom) setNewBelowCount(0); }, [isAtBottom]);

  const handleSearchMessages = useCallback((term: string, direction?: "older" | "newer") => {
    if (onSearchHistory) {
      onSearchHistory(term, direction);
    }
  }, [onSearchHistory]);

  const handleSmsSend = useCallback(async (message: string, smsService: string) => {
    if (!ticket) return;
    const phoneNumber = ticket.contact?.number;
    try {
      const smsModule = await import("@/services/sms").catch(() => null);
      if (smsModule) {
        const dados = { phoneNumber, message };
        if (smsService === "comtele") await smsModule.sendSMS(dados);
        else if (smsService === "conecta") await smsModule.sendSMSConecta(dados);
        else if (smsService === "livson") await smsModule.sendSMSLivson(dados);
        toast.success(t("smsSentSuccess"));
      } else {
        // Fallback: send via normal text message API
        await onSendText(message);
        toast.success(t("messageSentSimple"));
      }
    } catch {
      toast.error(t("errorSendingSms"));
    }
  }, [ticket, onSendText]);

  if (!ticket) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <MessageSquare className="h-16 w-16 mb-4 opacity-20" />
        <h3 className="text-lg font-medium">{t("selectTicket") || "Selecione um atendimento"}</h3>
        <p className="text-sm mt-1">{t("chooseTicket")}</p>
      </div>
    );
  }

  // For pending/closed tickets show header + messages read-only (no input) — like Vue behavior
  const isReadOnly = ticket.status !== "open";

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <ChatHeader
        key={ticket.id}
        ticket={ticket}
        onToggleDetail={onToggleDetail}
        onOpenDetailTab={onOpenDetailTab}
        detailOpen={detailOpen}
        onRefresh={onRefresh}
        onTransfer={onTransfer}
        queues={queues}
        users={users}
        searchMessages={handleSearchMessages}
        searchNav={searchNav}
        autoScrollEnabled={autoScrollEnabled}
        onToggleAutoScroll={onToggleAutoScroll}
        allowPause={allowPause}
        forceReason={forceReason}
        controlFeatures={controlFeatures}
        userProfile={userProfile}
        convitesCount={convitesCount}
        onOpenConvites={onOpenConvites}
        availableWhatsapps={availableWhatsapps}
        searching={searchingHistory}
        userName={userName}
        signatureEnabled={signatureEnabled}
        onCloseChat={onCloseChat}
      />

      {pinnedMessages.length > 0 && (
        <div className="border-b divide-y divide-info/10">
          {pinnedMessages.map((pm) => (
            <div
              key={pm.id}
              className="flex items-center gap-2 bg-info/10 px-4 py-1.5 cursor-pointer hover:bg-info/20 transition-colors"
              onClick={() => {
                const el = document.querySelector(`[data-msg-id="${pm.id}"]`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.classList.add("msg-highlight");
                  setTimeout(() => el.classList.remove("msg-highlight"), 1800);
                }
              }}
            >
              <Pin className="h-3.5 w-3.5 text-info shrink-0" />
              <span className="text-xs text-info font-medium shrink-0">{t("pinnedMessage")}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">{pm.body || t("mediaMessage")}</span>
              {onPinMessage && (
                <button
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); onPinMessage(pm); }}
                  title={t("unpin")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} data-chat-scroll className="flex-1 overflow-y-auto p-4 relative [background-image:url('/wa-background.png')] [background-size:400px] [background-repeat:repeat] dark:[background-blend-mode:multiply] dark:bg-black/60" onScroll={handleChatScroll}>
        {/* Sentinel do infinite scroll — precisa ser o primeiro elemento do fluxo do scroll */}
        <div ref={topSentinelRef} className="h-px w-full" aria-hidden />
        {/* Overlay de carregamento da conversa — cobre a área do chat enquanto as
            mensagens do ticket recém-aberto são buscadas. Mais visível em grupos,
            cujo histórico é maior e demora mais para carregar. */}
        {messagesLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/75 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="flex flex-col items-center gap-1 px-6 text-center">
              <p className="text-sm font-medium text-foreground">{t("loadingConversation")}</p>
              {ticket?.isGroup && (
                <p className="max-w-xs text-xs text-muted-foreground">{t("loadingGroupHint")}</p>
              )}
            </div>
          </div>
        )}
        {isReadOnly && (
          <div className="flex items-center justify-center mb-4">
            <div className="flex items-center gap-2 rounded-full bg-muted/60 px-4 py-1.5 text-xs text-muted-foreground">
              {ticket.status === "pending" ? (
                <><Clock className="h-3.5 w-3.5 text-warning" /> {t("pendingReadOnly")}</>
              ) : (
                <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> {t("closedReadOnly")}</>
              )}
            </div>
          </div>
        )}
        {hasMore && (
          <div className="flex justify-center mb-4">
            <Button variant="ghost" size="sm" onClick={handleLoadMoreClick} disabled={loading}>
              {loading ? t("loading") : t("loadPrevious")}
            </Button>
          </div>
        )}
        {/* #5 — unread banner (unreadAtOpen: capturado na seleção, pois o
            handleSelectTicket zera ticket.unreadMessages antes de abrir) */}
        {unreadAtOpen > 0 && firstUnreadMsgId && (
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current?.querySelector(`[data-msg-id="${firstUnreadMsgId}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="mx-auto mb-3 flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs text-primary hover:bg-primary/20 transition-colors"
          >
            <ChevronsDown className="h-3.5 w-3.5" />
            {unreadAtOpen > 1
              ? t("unreadMessagePlural", { count: unreadAtOpen })
              : t("unreadMessageSingular", { count: unreadAtOpen })}
          </button>
        )}
        {messages.length === 0 && !loading && !messagesLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageCircle className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">{t("noMessagesYet")}</p>
          </div>
        )}
        <div data-msgs-container className="w-full">
          {messages.map((msg, idx) => {
            const isSystemMsg = ["notes", "transfer", "callNotes", "transcription"].includes(msg.mediaType || "");
            const nextMsg = messages[idx + 1];
            const isLastInIncomingGroup = !msg.fromMe && !isSystemMsg && (
              !nextMsg ||
              nextMsg.fromMe ||
              ["notes", "transfer", "callNotes", "transcription"].includes(nextMsg.mediaType || "") ||
              (ticket?.isGroup && (nextMsg.contact?.id ?? nextMsg.contact?.name) !== (msg.contact?.id ?? msg.contact?.name))
            );
            const isLastInOutgoingGroup = msg.fromMe && !isSystemMsg && (
              !nextMsg ||
              !nextMsg.fromMe ||
              ["notes", "transfer", "callNotes", "transcription"].includes(nextMsg.mediaType || "") ||
              (nextMsg.user?.id ?? nextMsg.user?.name) !== (msg.user?.id ?? msg.user?.name)
            );
            const contactName = msg.contact?.name || ticket?.contact?.name || "?";
            const contactPic = msg.contact?.profilePicUrl || ticket?.contact?.profilePicUrl;
            const avatarCol = getAvatarColor(contactName);
            const isSystemAgent = msg.fromMe && !msg.user && !ticket?.user;
            const userName = isSystemAgent ? t("systemAgent") : (msg.user?.name || ticket?.user?.name || "?");
            const userAvatarCol = getAvatarColor(userName);
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const isNewTicket = !prevMsg || msg.ticketId !== prevMsg.ticketId;
            const msgDateStr = msg.createdAt ? new Date(msg.createdAt).toLocaleDateString(locale) : "";
            const prevMsgDateStr = prevMsg?.createdAt ? new Date(prevMsg.createdAt).toLocaleDateString(locale) : "";
            const isNewDate = !prevMsg || msgDateStr !== prevMsgDateStr;
            const msgDateLabel = msgDateStr === dateSepToday
              ? t("today")
              : msgDateStr === dateSepYesterday
              ? t("yesterday")
              : msgDateStr;
            // Agrupamento de bolhas: margem apertada (mt-0.5) DENTRO de um run do
            // mesmo autor; mt-2 quando a mensagem inicia um run (autor/fromMe
            // diferente da anterior, mensagem de sistema, ou separador de data/
            // ticket entre elas). Espelha os critérios de autor dos flags de fim
            // de run (incoming compara contato só em grupo; outgoing compara user).
            const prevIsSystem = prevMsg ? ["notes", "transfer", "callNotes", "transcription"].includes(prevMsg.mediaType || "") : false;
            const sameRunAsPrev = !!prevMsg && !isNewDate && !isNewTicket && !isSystemMsg && !prevIsSystem &&
              prevMsg.fromMe === msg.fromMe &&
              (msg.fromMe
                ? (prevMsg.user?.id ?? prevMsg.user?.name) === (msg.user?.id ?? msg.user?.name)
                : (!ticket?.isGroup || (prevMsg.contact?.id ?? prevMsg.contact?.name) === (msg.contact?.id ?? msg.contact?.name)));
            const bubbleIsGroupEnd = isSystemMsg ? true : (msg.fromMe ? isLastInOutgoingGroup : isLastInIncomingGroup);
            return (
              <React.Fragment key={`frag-${msg.stableKey ?? msg.id}`}>
                {isNewTicket && msg.ticketId && (
                  <div className="flex items-center gap-3 my-4 mx-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap font-medium px-2 bg-background">
                      {t("ticket")} #{msg.ticketId}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {isNewDate && (
                  <div className="flex items-center gap-3 my-3 mx-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap px-2 bg-background">
                      {msgDateLabel}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
              <motion.div
                data-msg-id={msg.id}
                className={cn("flex items-start gap-2", sameRunAsPrev ? "mt-0.5" : "mt-2")}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.13, ease: "easeOut" }}
              >
                {/* Contact avatar on the left of incoming message groups */}
                {!isSystemMsg && !msg.fromMe && (
                  isLastInIncomingGroup ? (
                    <Avatar className="h-7 w-7 shrink-0 mt-1">
                      {isValidAvatarUrl(contactPic) && <AvatarImage src={contactPic!} />}
                      <AvatarFallback className="text-[9px] font-semibold" style={{ backgroundColor: avatarCol.background, color: avatarCol.color }}>
                        {getInitials(contactName)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="w-7 shrink-0" />
                  )
                )}
                {multiForwardActive && !isReadOnly && !NON_FORWARDABLE_TYPES.has(msg.mediaType || "") && !isRestricted && (
                  <input
                    type="checkbox"
                    className="mt-3 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                    checked={multiForwardSelected.some((m) => m.id === msg.id)}
                    onChange={(e) => onToggleMultiForwardMsg?.(msg, e.target.checked)}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <MessageBubble
                    message={msg}
                    allMessages={messages}
                    onReply={isReadOnly ? undefined : handleReply}
                    onDelete={isReadOnly || ["waba", "gupshup", "dialog360"].includes((ticket?.channel ?? "").toLowerCase()) ? undefined : onDeleteMessage}
                    onForward={isReadOnly ? undefined : onForwardMessage}
                    onForwardPrivate={isReadOnly ? undefined : onForwardPrivateMessage}
                    onForwardOtherChannel={isReadOnly ? undefined : onForwardOtherChannelMessage}
                    onReact={isReadOnly ? undefined : onReactMessage}
                    onEdit={isReadOnly || (ticket?.channel ?? "").toLowerCase().includes("waba") ? undefined : onEditMessage}
                    onStar={isReadOnly ? undefined : onStarMessage}
                    onPin={isReadOnly ? undefined : onPinMessage}
                    whatsapp={ticket?.whatsapp as { chatgptApiKey?: string; chatgptModel?: string; type?: string; hybridMode?: string } | undefined}
                    ticketId={ticket?.id}
                    onQuickSend={isReadOnly ? undefined : (text) => onSendText(text)}
                    onRetryMessage={onRetryMessage}
                    isGroupEnd={bubbleIsGroupEnd}
                  />
                </div>
                {/* User avatar on the right of outgoing message groups */}
                {!isSystemMsg && msg.fromMe && (
                  isLastInOutgoingGroup ? (
                    <div className="flex flex-col items-center gap-0.5 shrink-0 mt-1">
                      <Avatar className="h-7 w-7" title={isSystemAgent ? t("systemAgentHint") : undefined}>
                        {!isSystemAgent && isValidAvatarUrl(msg.user?.profilePicture) && <AvatarImage src={msg.user!.profilePicture!} />}
                        {isSystemAgent ? (
                          <AvatarFallback className="bg-slate-600 text-white">
                            <Bot className="h-3.5 w-3.5" />
                          </AvatarFallback>
                        ) : (
                          <AvatarFallback className="text-[9px] font-semibold" style={{ backgroundColor: userAvatarCol.background, color: userAvatarCol.color }}>
                            {getInitials(userName)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="text-[9px] text-muted-foreground max-w-[40px] truncate text-center leading-tight">
                        {userName}
                      </span>
                    </div>
                  ) : (
                    <div className="w-7 shrink-0" />
                  )
                )}
              </motion.div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Sentinel: always sits at the very bottom — scrollIntoView targets this */}
        <div ref={bottomRef} style={{ height: 0, opacity: 0, pointerEvents: "none" }} aria-hidden />

        {/* #1 — scroll-to-top / scroll-to-bottom floating buttons (stacked) */}
        <div className="sticky bottom-4 ml-auto w-fit flex flex-col items-end gap-2 pointer-events-none z-10">
          <AnimatePresence>
            {!isAtTop && (
              <motion.button
                key="scroll-top-btn"
                type="button"
                onClick={scrollToTop}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
              >
                <ChevronsUp className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {!isAtBottom && (
              <motion.button
                key="scroll-bottom-btn"
                type="button"
                onClick={() => { setNewBelowCount(0); scrollToBottom(); }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
              >
                <ChevronsDown className="h-4 w-4" />
                {newBelowCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center px-1 pointer-events-none">
                    {formatCount(newBelowCount)}
                  </span>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* Multi-forward action bar — fora do scroll para ficar sempre visível enquanto o usuário seleciona mensagens */}
      {multiForwardActive && !isReadOnly && (
        <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-2 w-full">
          <span className="text-xs text-muted-foreground">{t("selectedCount", { count: multiForwardSelected.length })}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onToggleMultiForward}>{t("cancel")}</Button>
            <Button size="sm" disabled={multiForwardSelected.length === 0} onClick={() => multiForwardSelected[0] && onForwardMessage(multiForwardSelected[0])}>
              {t("forwardSelected")}
            </Button>
          </div>
        </div>
      )}

      {!isReadOnly && (
        <>
          {isSmsChannel ? (
            <div className="border-t p-3">
              <div className="flex items-center justify-center max-w-3xl mx-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setSmsModalOpen(true)}
                >
                  <Smartphone className="h-4 w-4" />
                  {t("sendSMSMessage")}
                </Button>
              </div>
            </div>
          ) : isWooChannel ? (
            // WooCommerce nao tem canal de resposta direto. Substituimos o input
            // pelo gatilho do modal cross-channel reply: cria ticket no canal alvo
            // (WhatsApp, email...) com cross-ref pro pedido WC e redireciona pra
            // ele, onde o admin compoe a mensagem real.
            <div className="border-t p-3">
              <div className="flex flex-col items-center justify-center max-w-3xl mx-auto gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setReplyChannelOpen(true)}
                >
                  <ShoppingBag className="h-4 w-4" />
                  {tReply("title")}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {tReply("description")}
                </p>
              </div>
            </div>
          ) : (
            <MessageInput
              key={ticket.id}
              ticketId={ticket.id}
              ticket={ticket as unknown as Record<string, unknown>}
              ticketStatus={ticket.status}
              channelType={ticket.channel}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              onSendText={onSendText}
              onSendMedia={onSendMedia}
              onSendLocation={onSendLocation}
              disabled={ticket.status !== "open"}
              onOpenEmailModal={onOpenEmailModal}
              onMultiForward={onToggleMultiForward}
              userName={userName}
              signatureEnabled={signatureEnabled}
              onToggleSignature={onToggleSignature}
              detailOpen={detailOpen}
            />
          )}
        </>
      )}

      {isReadOnly && ticket.status === "pending" && (
        <div className="border-t p-3">
          {onAcceptTicket ? (
            // CTA "Atender": mesma visibilidade do botão aceitar do card de pendente
            // (onAcceptTicket vem do mesmo handler handleAcceptTicket, com todos os
            // pré-checks cross-canal preservados).
            <div className="flex flex-col items-center justify-center gap-1.5 max-w-3xl mx-auto">
              <Button
                type="button"
                className="gap-2"
                disabled={ctaAccepting}
                onClick={() => {
                  setCtaAccepting(true);
                  Promise.resolve(onAcceptTicket(ticket)).finally(() => setCtaAccepting(false));
                }}
              >
                {ctaAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {t("attendThisTicket")}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {t("pendingAcceptHint")}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center max-w-3xl mx-auto">
              <p className="text-xs text-muted-foreground">
                {t("pendingAcceptHint")}
              </p>
            </div>
          )}
        </div>
      )}

      <SmsModal
        open={smsModalOpen}
        onOpenChange={setSmsModalOpen}
        phoneNumber={ticket.contact?.number}
        onSend={handleSmsSend}
      />

      <ReplyViaChannelDialog
        open={replyChannelOpen}
        onOpenChange={setReplyChannelOpen}
        sourceTicketId={ticket.id}
        contactName={ticket.contact?.name}
        contactNumber={ticket.contact?.number}
        contactEmail={(ticket.contact as any)?.email}
      />

      <Dialog open={igCommentRedirectOpen} onOpenChange={setIgCommentRedirectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("igCommentRedirectTitle")}</DialogTitle>
            <DialogDescription>{t("igCommentRedirectDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIgCommentRedirectOpen(false)}>
              {t("igCommentRedirectCancel")}
            </Button>
            <Button onClick={() => { setIgCommentRedirectOpen(false); router.push("/instagram-comentarios"); }}>
              {t("igCommentRedirectConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Filter persistence helpers ──────────────────────────────────────────────
interface SavedFilters {
  showAll: boolean;
  includeClosed: boolean;
  status: string[];
  withUnreadMessages: boolean;
  /** null = seguir o reverseOrder do tenant; true/false = override explícito do usuário */
  orderAsc: boolean | null;
  /** Marcador de versão do blob salvo: ausente => legado (orderAsc:false = seguir o tenant, não override) */
  filtersV2?: boolean;
  queuesIds: number[];
  whatsappIds: number[];
  selectedUsers: string[];
  selectedTagIds: string[];
  selectedKanbanIds: string[];
  isReversed: boolean;
  sortByAnswered: boolean;
  density: "compact" | "comfortable";
  dateFrom: string;
  dateTo: string;
}

/** Aceita formato novo (array) e legado (string única, com "all"/"none" como "sem filtro"). */
function normalizeIdArray(value: unknown, legacyEmptyTokens: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (v == null ? "" : String(v)))
      .filter((v) => v !== "" && !legacyEmptyTokens.includes(v));
  }
  if (typeof value === "string" && value !== "" && !legacyEmptyTokens.includes(value)) {
    return [value];
  }
  if (typeof value === "number") return [String(value)];
  return [];
}

function getSavedFilters(): SavedFilters {
  if (typeof window === "undefined") return getDefaultSavedFilters();
  try {
    const raw = localStorage.getItem("filtrosAtendimento");
    if (!raw) return getDefaultSavedFilters();
    const parsed = JSON.parse(raw);
    return {
      showAll: parsed.showAll ?? false,
      includeClosed: parsed.includeClosed ?? false,
      status: Array.isArray(parsed.status) ? parsed.status : ["open", "pending"],
      withUnreadMessages: parsed.withUnreadMessages ?? false,
      // Blob novo (filtersV2): honra o boolean salvo (inclui false = override DESC).
      // Blob legado: false/ausente era o padrão antigo => null (seguir tenant); só true legado vira override.
      orderAsc: parsed.filtersV2 === true
        ? (typeof parsed.orderAsc === "boolean" ? parsed.orderAsc : null)
        : (parsed.orderAsc === true ? true : null),
      queuesIds: Array.isArray(parsed.queuesIds) ? parsed.queuesIds : [],
      whatsappIds: Array.isArray(parsed.whatsappIds) ? parsed.whatsappIds : [],
      selectedUsers: normalizeIdArray(parsed.selectedUsers ?? parsed.selectedUser, ["all"]),
      selectedTagIds: normalizeIdArray(parsed.selectedTagIds ?? parsed.selectedTagId, ["none"]),
      selectedKanbanIds: normalizeIdArray(parsed.selectedKanbanIds ?? parsed.selectedKanbanId, ["none"]),
      isReversed: parsed.isReversed ?? false,
      sortByAnswered: parsed.sortByAnswered ?? false,
      density: "comfortable",
      dateFrom: typeof parsed.dateFrom === "string" ? parsed.dateFrom : "",
      dateTo: typeof parsed.dateTo === "string" ? parsed.dateTo : "",
    };
  } catch {
    return getDefaultSavedFilters();
  }
}

function getDefaultSavedFilters(): SavedFilters {
  return {
    showAll: false,
    includeClosed: false,
    status: ["open", "pending"],
    withUnreadMessages: false,
    orderAsc: null,
    queuesIds: [],
    whatsappIds: [],
    selectedUsers: [],
    selectedTagIds: [],
    selectedKanbanIds: [],
    isReversed: false,
    sortByAnswered: false,
    density: "comfortable",
    dateFrom: "",
    dateTo: "",
  };
}

export default function AtendimentoPage() {
  const t = useTranslations("atendimentoChat");
  const tMixin = useTranslations("atendimentoMixinAtualizar");
  const tErrors = useTranslations("errors");
  const tMsgInput = useTranslations("messageInput");
  const tNC = useTranslations("layoutHeader.newConversation");
  const tE = useTranslations("atendimentoChatExtra");
  const tBubble = useTranslations("messageBubble");
  const tOrder = useTranslations("orderDetails");
  const searchParams = useSearchParams();
  const router = useRouter();
  const statusTabs = useStatusTabs();
  const { user, supervisorAdmin, configuracoes, getConfigValue, isRestrictedUser: checkRestrictedUser, tenantConfigsLoaded, setPinnedTickets } = useAuthStore();

  // supervisorAdmin === 'enabled' → super age como supervisor limitado (não admin)
  // supervisorAdmin === 'disabled' → super age como admin
  const supervisorIsAdmin = user?.profile === "super" && supervisorAdmin !== "enabled";
  // Perfis admin "clássicos". Separado do isAdminLike de propósito: nem toda isenção de
  // admin vale para o custom com tickets_view_all (ver forceSignature logo abaixo).
  const isLegacyAdminProfile = user?.profile === "admin" || supervisorIsAdmin || user?.profile === "superadmin";
  // Perfil custom com tickets_view_all é admin-like para ESCOPO DE TICKETS — espelha
  // ListTicketsServiceFrontNovoZPRO.ts:119-121 (isAdmin/isAdminShowAll) e o guard
  // CanUserAccessTicketServiceZPRO.ts:47-56. Nenhum dos dois exige customProfileEnabled,
  // então aqui também não exigimos: sem este espelho a lista escondia tickets que o
  // próprio REST devolveu para esse perfil.
  const customCanViewAllTickets =
    user?.profile === "custom" &&
    (user?.customProfile?.customPermissions as unknown as { tickets_view_all?: boolean } | undefined)
      ?.tickets_view_all === true;
  const isAdminLike = isLegacyAdminProfile || customCanViewAllTickets;

  // Configuracoes de visibilidade de tickets
  // notViewTicketsChatBot / notViewAssignedTickets kept for local chatbot badge logic
  const notViewTicketsChatBot = getConfigValue("NotViewTicketsChatBot") === "enabled";
  const notViewAssignedTickets = getConfigValue("NotViewAssignedTickets") === "enabled";
  // supervisorViewDept: supervisor (super) vê apenas tickets das suas filas
  const supervisorViewDept = user?.profile === "super" && user?.configs?.supervisorViewDept === "enabled";
  const supervisorQueueIds = React.useMemo(() => {
    if (!supervisorViewDept) return null;
    const q = user?.queues as { id: number }[] | undefined;
    return Array.isArray(q) ? q.map((x) => x.id) : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supervisorViewDept, user?.queues]);
  const showChatBotLane = getConfigValue("chatbotLane") === "enabled";
  const allowPause = getConfigValue("allowPause") === "enabled";
  const isRestricted = checkRestrictedUser();
  // Filtros avançados (Conexões, Users, Tags, Kanban): admin-like sempre; user comum quando
  // o tenant não isola tickets por atribuição e o usuário não é restrito (privacidade de nomes).
  const canUseAdvancedFilters = isAdminLike || (!notViewAssignedTickets && !isRestricted);
  const controlFeatures = getConfigValue("controlFeatures") === "enabled";
  const forceReason = getConfigValue("forceReason") === "enabled";
  // Assinatura obrigatória isenta só os perfis admin clássicos: tickets_view_all é
  // permissão de ESCOPO de lista, não de isenção de regra de envio (nenhum espelho no backend).
  const forceSignature = getConfigValue("signed") === "enabled" && !isLegacyAdminProfile;
  const fixarConexao = getConfigValue("fixarConexao") === "enabled";
  const universalCounter = getConfigValue("universalCounter") === "enabled";
  // Aviso cross-canal em Pendentes (flag por-tenant crossChannelTicketCheck):
  // badge nos cards + pré-check ao aceitar (PLANO_CROSS_CHANNEL_TICKET_CHECK, Extensão 1)
  const crossChannelCheckEnabled = getConfigValue("crossChannelTicketCheck") === "enabled";
  const [crossSiblingsByTicketId, setCrossSiblingsByTicketId] = useState<Record<number, CrossChannelSibling[]>>({});
  const [acceptCrossTicket, setAcceptCrossTicket] = useState<ExistingOpenTicket | null>(null);
  const [acceptPendingTicket, setAcceptPendingTicket] = useState<Ticket | null>(null);

  const pinnedTickets: number[] = user?.configs?.pinnedTickets ?? [];

  const togglePin = useCallback(async (ticket: Ticket) => {
    const current: number[] = user?.configs?.pinnedTickets ?? [];
    const newPinned = current.includes(ticket.id)
      ? current.filter((id) => id !== ticket.id)
      : [...current, ticket.id];
    setPinnedTickets(newPinned);
    try {
      await updateUserConfigs(user!.userId, { pinnedTickets: newPinned });
    } catch {
      setPinnedTickets(current);
    }
  }, [user, setPinnedTickets]);

  const tickets = useTicketStore((s) => s.tickets);
  const setTickets = useTicketStore((s) => s.setTickets);
  const currentTicket = useTicketStore((s) => s.currentTicket);
  const setCurrentTicket = useTicketStore((s) => s.setCurrentTicket);
  // Stale-fetch guard: armazena o ticket.id selecionado no momento do clique.
  // Resolucoes async de fetchTicket so devem aplicar setCurrentTicket se o id ainda
  // for o ativo. Evita corrida tipo "clica A -> clica B -> fetch(A) chega tarde e
  // sobrescreve B" — sintoma: UI mostra ticket X mas mensagem vai pro contato Y.
  const selectionRef = useRef<number | null>(null);
  // Cache de validação de destinatário Baileys: blinda contra envio cruzado caso o snapshot
  // local de currentTicket.contact.number divirja do que está no banco (ex.: contato editado
  // em outra sessão, merge, race com socket). Populado em handleSelectTicket (sem custo extra,
  // já fazemos fetchTicket lá) e consultado em handleSendText/Media antes do /noRedis.
  // TTL curto para tolerar mudanças legítimas; tamanho contido para não acumular memória.
  const baileysSendNumberCacheRef = useRef<Map<number, { number: string; ts: number }>>(new Map());
  const BAILEYS_SEND_CACHE_TTL_MS = 60_000;
  const messages = useTicketStore((s) => s.messages);
  const setMessages = useTicketStore((s) => s.setMessages);
  const hasMore = useTicketStore((s) => s.hasMore);
  const setHasMore = useTicketStore((s) => s.setHasMore);
  const loading = useTicketStore((s) => s.loading);
  const setLoading = useTicketStore((s) => s.setLoading);
  const addMessage = useTicketStore((s) => s.addMessage);
  const updateMessage = useTicketStore((s) => s.updateMessage);
  const updateTicketInStore = useTicketStore((s) => s.updateTicket);
  const ticketListRefreshSignal = useTicketStore((s) => s.ticketListRefreshSignal);
  const currentTicketRefreshSignal = useTicketStore((s) => s.currentTicketRefreshSignal);
  const markNotificationAsRead = useNotificationStore((s) => s.markAsRead);
  const addTicketNotification = useNotificationStore((s) => s.addNotification);
  const setTicketNotifications = useNotificationStore((s) => s.setNotifications);

  const { settings: sysSettings, loading: settingsLoading } = useSettings(["ignoreGroupMsg", "copilotAutoSentiment"]);
  const ignoreGroupMsg = sysSettings["ignoreGroupMsg"] === "enabled";
  const copilotAutoSentiment = sysSettings["copilotAutoSentiment"] === "enabled";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [pageNumber, setPageNumber] = useState(1);
  // Loading da conversa aberta (mensagens do ticket atual) — separado do `loading`
  // da store, que reflete a LISTA de tickets. Cobre a abertura de tickets com
  // histórico grande (ex.: grupos), mostrando um indicador no container do chat.
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [tabType, setTabType] = useState<"private" | "groups" | "chatbot">("private");
  const [queues, setQueues] = useState<{ id: number; name: string; color: string; isActive?: boolean; autoDistributeEnabled?: boolean }[]>([]);
  const [allQueues, setAllQueues] = useState<{ id: number; name: string; color: string }[]>([]);
  const [usersList, setUsersList] = useState<{ id: number; name: string; queues?: { id: number }[] }[]>([]);
  const [whatsappsList, setWhatsappsList] = useState<{ id: number; name: string; type?: string; tokenAPI?: string; status?: string; bmToken?: string; wabaId?: string; wabaVersion?: string; number?: string }[]>([]);
  const [chatFlowsList, setChatFlowsList] = useState<{ id: number; name: string }[]>([]);
  const lastDeepLinkRef = useRef<number | null>(null);

  // ── Iniciar conversa avulsa ────────────────────────────────────────────────
  const [avulsaOpen, setAvulsaOpen] = useState(false);
  const [avulsaWhatsappId, setAvulsaWhatsappId] = useState("");
  const [avulsaNumber, setAvulsaNumber] = useState("");
  const [avulsaMessage, setAvulsaMessage] = useState("");
  const [avulsaDesiredStatus, setAvulsaDesiredStatus] = useState<"open" | "pending">("open");
  // Fila opcional (segmentacao da conversa avulsa). "none" = nenhuma (backend decide).
  const [avulsaQueue, setAvulsaQueue] = useState("none");
  // Email avulso (canais email/webmail): destino e subject separados do body.
  const [avulsaEmail, setAvulsaEmail] = useState("");
  const [avulsaEmailSubject, setAvulsaEmailSubject] = useState("");
  const [avulsaSending, setAvulsaSending] = useState(false);
  // Aviso "ticket aberto em outro operador" antes do envio avulso (espelho do Vue)
  const [avulsaExistingTicket, setAvulsaExistingTicket] = useState<ExistingOpenTicket | null>(null);
  // WABA template state for avulsa
  const [avulsaWabaTemplates, setAvulsaWabaTemplates] = useState<WabaTemplate[]>([]);
  const [avulsaLoadingTemplates, setAvulsaLoadingTemplates] = useState(false);
  const [avulsaSelectedTemplate, setAvulsaSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [avulsaTemplateSearch, setAvulsaTemplateSearch] = useState("");
  const [avulsaTemplateVars, setAvulsaTemplateVars] = useState<{ key: string; label: string; value: string; filename?: string }[]>([]);
  // Cobranca (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md D0.
  // Ficha propria: nao existe variavel de template para o botao de cobranca.
  const [avulsaOrderDetails, setAvulsaOrderDetails] = useState<OrderDetailsValue>(() => emptyOrderDetails());
  const [avulsaTplGalleryOpen, setAvulsaTplGalleryOpen] = useState(false);
  const [avulsaConnectionFilter, setAvulsaConnectionFilter] = useState<null | "official" | "unofficial" | "email">(null);
  // Regra do 9o digito BR: opcional (mesma UX do NewConversationDialog do toolbar). Default aplica.
  const [avulsaApplyBrPhoneCorrection, setAvulsaApplyBrPhoneCorrection] = useState(true);
  // Busca/preload de contato para facilitar preenchimento (igual ao envio de cartão de contato)
  const [avulsaContactSearch, setAvulsaContactSearch] = useState("");
  const [avulsaContactResults, setAvulsaContactResults] = useState<Contact[]>([]);
  const [avulsaContactLoading, setAvulsaContactLoading] = useState(false);

  const [showAll, setShowAll] = useState(() => getSavedFilters().showAll);
  const [includeClosed, setIncludeClosed] = useState(() => getSavedFilters().includeClosed);
  const [statusFilters, setStatusFilters] = useState<string[]>(() => getSavedFilters().status);
  const [withUnreadMessages, setWithUnreadMessages] = useState(() => getSavedFilters().withUnreadMessages);
  // orderAsc tri-state: true/false = override explícito do usuário; null = seguir o tenant (reverseOrder).
  const [orderAsc, setOrderAsc] = useState<boolean | null>(() => getSavedFilters().orderAsc);
  // reverseOrder do tenant (Config Geral) é injetado em configuracoes pelo layout do dashboard;
  // default DESC (mais novos primeiro). effectiveOrderAsc = override local OU, se ausente, o tenant.
  const tenantReverseOrder = getConfigValue("reverseOrder") === "enabled";
  const effectiveOrderAsc = orderAsc ?? tenantReverseOrder;
  const [selectedQueueIds, setSelectedQueueIds] = useState<number[]>(() => getSavedFilters().queuesIds);
  const [selectedWhatsappIds, setSelectedWhatsappIds] = useState<number[]>(() => getSavedFilters().whatsappIds);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => getSavedFilters().selectedUsers);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => getSavedFilters().selectedTagIds);
  const [selectedKanbanIds, setSelectedKanbanIds] = useState<string[]>(() => getSavedFilters().selectedKanbanIds);

  const toggleId = useCallback((setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setter((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);
  const [dateFrom, setDateFrom] = useState<string>(() => getSavedFilters().dateFrom);
  const [dateTo, setDateTo] = useState<string>(() => getSavedFilters().dateTo);
  const [tagsList, setTagsList] = useState<{ id: number; tag?: string; name?: string; color?: string; isActive?: boolean }[]>([]);
  const [kanbansList, setKanbansList] = useState<{ id: number; name: string }[]>([]);
  const [pageReasonsList, setPageReasonsList] = useState<Reason[]>([]);
  const [clearReplySignal, setClearReplySignal] = useState(0);
  const [ticketsPageNumber, setTicketsPageNumber] = useState(1);
  const [hasMoreTickets, setHasMoreTickets] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "monitor">("list");
  const [loadingMoreTickets, setLoadingMoreTickets] = useState(false);
  const [isReversed, setIsReversed] = useState(() => getSavedFilters().isReversed);
  const [sortByAnswered, setSortByAnswered] = useState(() => getSavedFilters().sortByAnswered);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<number>>(new Set());
  const [bulkTransferUserOpen, setBulkTransferUserOpen] = useState(false);
  const [bulkTransferUserId, setBulkTransferUserId] = useState("");
  const [bulkTransferChannelOpen, setBulkTransferChannelOpen] = useState(false);
  const [bulkTransferChannelId, setBulkTransferChannelId] = useState("");
  const [bulkTransferChatbotOpen, setBulkTransferChatbotOpen] = useState(false);
  const [bulkTransferChatbotId, setBulkTransferChatbotId] = useState("");
  const [bulkTransferQueueOpen, setBulkTransferQueueOpen] = useState(false);
  const [bulkTransferQueueId, setBulkTransferQueueId] = useState("");
  const [bulkChatFlows, setBulkChatFlows] = useState<{ id: number; name: string }[]>([]);
  const [density, setDensity] = useState<"compact" | "comfortable">(() => getSavedFilters().density);
  const lastBulkSelectedIdRef = useRef<number | null>(null);
  const filteredTicketsRef = useRef<Ticket[]>([]);
  // ── Retry de envio (P0-1) ──────────────────────────────────────────────────
  // retryExecRef: por idFront, a MESMA chamada de service com os MESMOS dados —
  // registrada logo antes do await de cada envio; removida no sucesso.
  // hadResponse distingue falha com resposta do servidor (retry direto) de
  // timeout/rede (desfecho desconhecido — verificar antes de reenviar).
  const retryExecRef = useRef(new Map<string, { exec: () => Promise<unknown>; hadResponse?: boolean; kind: "text" | "media" }>());
  // failedByTicketRef: bolhas falhadas (ack -1) por ticket — re-anexadas quando o
  // usuário re-seleciona o ticket (o fetch inicial apagaria a bolha otimista).
  const failedByTicketRef = useRef(new Map<number, Message[]>());
  // Último pct de upload reportado por idFront (throttle ≥5 pontos ou 100).
  const uploadPctRef = useRef(new Map<string, number>());
  // Mirror do handleSelectTicket p/ o listener global de atalhos (função não é memoizada).
  const handleSelectTicketRef = useRef<((ticket: Ticket) => Promise<void>) | null>(null);
  // Pill "Reconectando..." — só UI; o resync de dados já existe nos hooks de socket.
  const { reconnecting } = useSocketStatus();
  const channelScrollRef = useRef<HTMLDivElement>(null);
  const [channelCanScrollLeft, setChannelCanScrollLeft] = useState(false);
  const [channelCanScrollRight, setChannelCanScrollRight] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  // Não-lidas no momento da seleção do ticket — o banner "novas mensagens" do
  // ChatArea usa este valor, pois handleSelectTicket zera unreadMessages na abertura
  const [unreadAtOpen, setUnreadAtOpen] = useState(0);
  const [convitesOpen, setConvitesOpen] = useState(false);
  const [closeConfirmTicket, setCloseConfirmTicket] = useState<Ticket | null>(null);
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false);
  const [convitesList, setConvitesList] = useState<{ id: number; ticketId?: number; ticket?: { id: number; contact?: { name?: string } }; contact?: { name?: string } }[]>([]);
  const [loadingConvites, setLoadingConvites] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [pausedPanelOpen, setPausedPanelOpen] = useState(false);
  const [pausedTickets, setPausedTickets] = useState<Ticket[]>([]);
  const [loadingPaused, setLoadingPaused] = useState(false);
  const [quickCloseForceReasonOpen, setQuickCloseForceReasonOpen] = useState(false);
  const [quickCloseForceReasonTicket, setQuickCloseForceReasonTicket] = useState<Ticket | null>(null);
  const [quickCloseReasonsList, setQuickCloseReasonsList] = useState<Reason[]>([]);
  const [quickCloseReasonsLoading, setQuickCloseReasonsLoading] = useState(false);
  const [quickCloseSelectedReasonId, setQuickCloseSelectedReasonId] = useState<number | null>(null);
  const [spyOpen, setSpyOpen] = useState(false);
  const [spyTicket, setSpyTicket] = useState<Ticket | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogTarget, setPinDialogTarget] = useState<Message | null>(null);
  const [webmailModalOpen, setWebmailModalOpen] = useState(false);
  const [webmailTo, setWebmailTo] = useState("");
  const [webmailSubject, setWebmailSubject] = useState("");
  const [webmailBody, setWebmailBody] = useState("");
  const [webmailCc, setWebmailCc] = useState("");
  const [webmailBcc, setWebmailBcc] = useState("");
  const [webmailLoading, setWebmailLoading] = useState(false);
  const [webmailFiles, setWebmailFiles] = useState<File[]>([]);
  const [signatureEnabled, setSignatureEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("signatureEnabled");
    return saved === null ? true : saved === "true";
  });
  const webmailFileInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const infiniteScrollReadyRef = useRef(false);
  const loadMoreCooldownRef = useRef(0);
  const loadMoreScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTicketsInFlightRef = useRef(false);
  const lastAutoReloadAtRef = useRef(0);
  // Ref espelhando ticketsPageNumber pra que o resync (handler de visibilidade) leia
  // a paginação atual sem depender do closure.
  const ticketsPageNumberRef = useRef(1);

  // Base filtrada com todas as regras de visibilidade aplicadas, SEM filtro por tipo de aba.
  // É a fonte de verdade tanto para visibleTicketsAllStatuses quanto para o contador de
  // não-lidas por aba (badges Privados/Grupos/Chatbot). Garante que o badge só conta tickets
  // que o usuário poderia de fato ver na lista — independente da config "Filtro de tickets no socket".
  const baseFilteredTickets = React.useMemo(() => {
    const dbg = process.env.NEXT_PUBLIC_DEBUG === "true";
    const unique = tickets.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);

    // Respeita o filtro de status selecionado: tickets atualizados via socket para um status
    // não incluso nos filtros ativos não devem aparecer na lista.
    const allowedStatuses = statusFilters.length > 0 ? statusFilters : ["open", "pending"];
    let list = unique.filter((t) => allowedStatuses.includes(t.status));

    if (dbg) {
      const removedByStatus = unique.filter((t) => !allowedStatuses.includes(t.status));
      console.debug("[baseFiltered] após status", {
        allowedStatuses,
        total: list.length,
        removidosPorStatus: removedByStatus.map((t) => ({ id: t.id, status: t.status })),
      });
    }

    // Supervisor restrito ao canal (Tenant.supervisorChannelScoped): super admin-like mantém a
    // visão ampla (filas/atendentes de todos), mas só enxerga tickets dos canais (whatsappAllowed)
    // atribuídos a ele — espelha o ListTicketsServiceFrontNovo + canUserSeeTicket. Cobre o caso de
    // socket empurrar um ticket de outro canal antes do próximo refetch REST. Flag off (default)
    // ou supervisor sem canais atribuídos => não filtra nada.
    if (
      getConfigValue("supervisorChannelScoped") === "enabled" &&
      user?.profile === "super" &&
      supervisorAdmin !== "enabled"
    ) {
      const allowedChannelIds = Array.isArray(user?.whatsappAllowed)
        ? (user!.whatsappAllowed as Array<{ id?: number } | number>)
            .map((w) => (typeof w === "number" ? w : Number(w?.id)))
            .filter((n) => Number.isFinite(n))
        : [];
      if (allowedChannelIds.length > 0) {
        const before = list;
        list = list.filter((t) => {
          const chId = t.whatsapp?.id ?? (t as unknown as { whatsappId?: number | null }).whatsappId ?? null;
          return chId != null && allowedChannelIds.includes(Number(chId));
        });
        if (dbg) {
          const removed = before.filter((t) => !list.includes(t));
          console.debug("[baseFiltered] filtro supervisor restrito ao canal", {
            allowedChannelIds,
            removidos: removed.map((t) => ({ id: t.id, whatsappId: t.whatsapp?.id })),
            restam: list.length,
          });
        }
      }
    }

    // whatsappAllowed para não-admin — espelha o filtro SQL do REST (/tickets-frontnovo,
    // ListTicketsServiceFrontNovo): o backend já esconde tickets de canais fora da lista
    // do usuário; sem este espelho, ticket empurrado via socket (ticket:create/update de
    // ausente) ficava visível até o próximo refetch. Mesma semântica do backend: lista
    // vazia = sem restrição; pulado quando receptivo apenas por fila (inboundByQueueOnly)
    // está ligado. Ticket sem whatsappId no store NÃO é removido (payload parcial).
    // Usa isAdminLike (que inclui custom com tickets_view_all) e NÃO a versão legada de perfis:
    // o backend pula o filtro de canal para todo isAdmin === 'S', o que abrange esse custom
    // (shouldApplyWhatsappAllowed, ListTicketsServiceFrontNovoZPRO:244-245). Como o gate do
    // sino (can-user-see-ticket.ts) retorna no isAdminLike ANTES da regra de canal, manter a
    // lista no critério antigo faria sino liberar e lista esconder para esse perfil.
    const isNonAdminForChannel = !isAdminLike;
    if (isNonAdminForChannel && getConfigValue("inboundByQueueOnly") !== "enabled") {
      const allowedChannelIdsUser = Array.isArray(user?.whatsappAllowed)
        ? (user!.whatsappAllowed as Array<{ id?: number } | number>)
            .map((w) => (typeof w === "number" ? w : Number(w?.id)))
            .filter((n) => Number.isFinite(n))
        : [];
      if (allowedChannelIdsUser.length > 0) {
        const before = list;
        list = list.filter((t) => {
          const chId = t.whatsapp?.id ?? (t as unknown as { whatsappId?: number | null }).whatsappId ?? null;
          return chId == null || allowedChannelIdsUser.includes(Number(chId));
        });
        if (dbg) {
          const removed = before.filter((t) => !list.includes(t));
          console.debug("[baseFiltered] filtro whatsappAllowed (não-admin)", {
            allowedChannelIdsUser,
            removidos: removed.map((t) => ({ id: t.id, whatsappId: t.whatsapp?.id })),
            restam: list.length,
          });
        }
      }
    }

    // NotViewTicketsChatBot — esconde APENAS o ticket órfão ainda no bot (sem atendente, sem fila
    // e com chatFlowId), espelhando ListTicketsServiceFrontNovoZPRO.ts:402-404
    // (`AND NOT (t."userId" IS NULL AND t."queueId" IS NULL AND t."chatFlowId" IS NOT NULL)`).
    // Antes o filtro derrubava TODO ticket com chatbot=true: como o nó TransferField do
    // flow-builder não zera chatFlowId ao transferir, ticket já roteado para a fila do atendente
    // sumia da lista. Usa isTicketInBotFlow (lib/can-user-see-ticket.ts:340) para lista e sino
    // não poderem divergir. Vale para TODOS os perfis (inclusive admin/superadmin/custom):
    // no backend essa condição é um AND de topo da query, sem nenhum guard de perfil — admin
    // também não recebe esses tickets pelo REST. NÃO regatear por perfil (nada de !isAdminLike):
    // isso faria a lista mostrar, via socket, ticket que o REST nunca devolve.
    if (notViewTicketsChatBot) {
      const myId = user?.userId;
      const before = list;
      list = list.filter((t) => {
        // Membro do grupo (groupUserIdArray) sempre passa — exceção preservada do filtro anterior.
        if (myId != null && (t as unknown as { groupUserIdArray?: number[] }).groupUserIdArray?.includes(myId)) return true;
        return !isTicketInBotFlow({
          chatFlowId: (t as unknown as { chatFlowId?: number | null }).chatFlowId ?? null,
          queueId: t.queue?.id ?? null,
          userId: t.user?.id ?? null,
        });
      });
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro notViewTicketsChatBot", {
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name })),
          restam: list.length,
        });
      }
    }

    // Filtro fila do usuário — espelha nullCondition do backend (ListTicketsServiceFrontNovoZPRO).
    // Sem isto, sockets propagam tickets de filas alheias (transferências, redistribuição, automações)
    // até o F5 recarregar via REST.
    if (!isAdminLike) {
      const myId = user?.userId;
      const userQueueIds = Array.isArray(user?.queues)
        ? (user!.queues as Array<{ id?: number } | number>).map((q) =>
            typeof q === "number" ? q : Number(q?.id),
          ).filter((n) => Number.isFinite(n))
        : [];
      const nullTicketsDisabled = getConfigValue("nullTickets") === "disabled";
      if (userQueueIds.length > 0 && myId != null) {
        const before = list;
        list = list.filter((t) => {
          const queueId = t.queue?.id ?? null;
          // Ticket SEM fila NAO libera geral: espelha o nullCondition do backend
          // (ListTicketsServiceFrontNovo). Cai nas regras de vinculo abaixo —
          // atribuido a mim / grupo / shared / wallet, ou unassigned quando nullTickets
          // NAO esta desabilitado (linha mais abaixo). Sem isto, ticket transitorio sem
          // fila (recem-criado, antes do roteamento) pingava na lista de TODOS via socket
          // mesmo com "Ver tickets sem fila" desligado — divergindo do que o F5/REST mostra.
          if (queueId != null && userQueueIds.includes(queueId)) return true; // fila do user
          if (t.isGroup) return true; // grupos seguem a Regra 1 do canUserSeeTicket
          const assignedId = t.user?.id ?? null;
          if (assignedId === myId) return true; // atribuído a mim
          const groupArr = (t as unknown as { groupUserIdArray?: number[] }).groupUserIdArray;
          if (Array.isArray(groupArr) && groupArr.includes(myId)) return true;
          // Convite (shared) exige a flag `shared` ALÉM do userIdArray — espelha o
          // sharedCondition do backend (ListTicketsServiceFrontNovoZPRO.ts:305) e o guard
          // CanUserAccessTicketServiceZPRO.ts:92. Com convite revogado sobra o id no array
          // com shared=false: o ticket aparecia na lista e o clique tomava 403.
          const userArr = (t as unknown as { userIdArray?: number[] }).userIdArray;
          const sharedFlagOn = (t as unknown as { shared?: boolean }).shared === true;
          if (sharedFlagOn && Array.isArray(userArr) && userArr.includes(myId)) return true; // convite ativo
          // Carteira INCONDICIONAL (não olha o setting DirectTicketsToWallets): o dono da carteira
          // do contato sempre fura o gate de fila — espelha o `exists (select 1 from "ContactWallets"
          // ...)` do nullCondition (ListTicketsServiceFrontNovoZPRO.ts:335/340/346) e o guard de
          // clique (CanUserAccessTicketServiceZPRO.ts:248-255), que entram no SQL/no gate sem
          // consultar setting nenhum. Carteira é só INCLUSÃO de visibilidade.
          const wallets = (t.contact as unknown as { wallets?: Array<{ id?: number | string } | number> } | undefined)?.wallets;
          if (Array.isArray(wallets)) {
            const walletIds = wallets.map((w) =>
              typeof w === "number" ? w : Number((w as { id?: number | string })?.id),
            ).filter((n) => Number.isFinite(n));
            if (walletIds.includes(myId)) return true;
          }
          if (assignedId == null && !nullTicketsDisabled) return true; // null com nullTickets habilitado
          return false;
        });
        if (dbg) {
          const removed = before.filter((t) => !list.includes(t));
          console.debug("[baseFiltered] filtro fila do usuário", {
            userQueueIds,
            nullTicketsDisabled,
            removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, queueId: t.queue?.id, assignedId: t.user?.id })),
            restam: list.length,
          });
        }
      }
    }

    if (notViewAssignedTickets) {
      // Admins with showAll active or with an active queue filter bypass this rule
      const isAdminWithQueueFilter = isAdminLike && selectedQueueIds.length > 0;
      const isAdminShowingAll = isAdminLike && showAll;
      if (!isAdminWithQueueFilter && !isAdminShowingAll) {
        const myId = user?.userId;
        const showClosedForAll = getConfigValue("showClosedForAll") === "enabled";
        const showGroupsForAll = getConfigValue("showGroupsForAll") === "enabled";
        const before = list;
        list = list.filter((t) => {
          if (myId != null && (t as unknown as { groupUserIdArray?: number[] }).groupUserIdArray?.includes(myId)) return true;
          if (showClosedForAll && t.status === "closed") return true;
          // Grupo atribuído a outro atendente é tratado como ticket atribuído mesmo com
          // showGroupsForAll ligado: só o dono (ou eu) vê — espelha a Regra 1 de canUserSeeTicket.
          if (showGroupsForAll && t.isGroup && (!t.user?.id || t.user?.id === myId)) return true;
          // Shared (convite): user convidado vê mesmo com NotViewAssignedTickets ativo.
          // Exige a flag `shared` junto do userIdArray, igual ao sharedCondition do backend
          // (ListTicketsServiceFrontNovoZPRO.ts:305) e ao CanUserAccessTicketServiceZPRO.ts:92.
          if (myId != null && (t as unknown as { shared?: boolean }).shared === true) {
            const sharedArr = (t as unknown as { userIdArray?: number[] }).userIdArray;
            if (Array.isArray(sharedArr) && sharedArr.includes(myId)) return true;
          }
          // Check both t.user.id and raw userId (ticket may have userId without populated user object)
          const assignedId = t.user?.id;
          return !assignedId || assignedId === myId;
        });
        if (dbg) {
          const removed = before.filter((t) => !list.includes(t));
          console.debug("[baseFiltered] filtro notViewAssignedTickets", {
            myId,
            showClosedForAll,
            showGroupsForAll,
            removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, assignedUserId: t.user?.id })),
            restam: list.length,
          });
        }
      }
    }

    // supervisorViewDept — espelha ListTicketsServiceFrontNovoZPRO.ts:428, que só aplica o
    // `AND t."queueId" IN (...)` quando o supervisor TEM filas (`queuesIdsUser.length > 0`).
    // Supervisor com ZERO filas => backend não restringe nada; antes o useMemo montava `[]`
    // (page.tsx:4145-4150) e este filtro derrubava a lista inteira, divergindo do REST.
    if (supervisorViewDept && supervisorQueueIds !== null && supervisorQueueIds.length > 0) {
      const myId = user?.userId;
      const before = list;
      list = list.filter((t) => {
        if (myId != null && (t as unknown as { groupUserIdArray?: number[] }).groupUserIdArray?.includes(myId)) return true;
        // Vínculo direto fura o departamento: ticket atribuído ao próprio supervisor.
        if (myId != null && (t.user?.id ?? null) === myId) return true;
        // Convite (shared): exige a flag `shared` ALÉM do userIdArray, mesma regra dos outros
        // pontos deste arquivo, do sharedCondition (ListTicketsServiceFrontNovoZPRO.ts:305) e do
        // guard CanUserAccessTicketServiceZPRO.ts:92.
        if (myId != null && (t as unknown as { shared?: boolean }).shared === true) {
          const sharedArr = (t as unknown as { userIdArray?: number[] }).userIdArray;
          if (Array.isArray(sharedArr) && sharedArr.includes(myId)) return true;
        }
        const queueId = t.queue?.id ?? null;
        return queueId != null && supervisorQueueIds.includes(queueId);
      });
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro supervisorViewDept", {
          supervisorQueueIds,
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, queueId: t.queue?.id })),
          restam: list.length,
        });
      }
    }

    // Client-side mirror do filtro de canal (selectedWhatsappIds): o backend
    // filtra no fetch inicial, mas tickets entrando via socket (ticket:create/update)
    // sao adicionados ao store sem checar o filtro ativo. Sem este espelho,
    // nova mensagem de canal nao filtrado aparece na lista filtrada.
    if (selectedWhatsappIds.length > 0) {
      const before = list;
      list = list.filter((t) => {
        const wid = t.whatsapp?.id ?? (t as unknown as { whatsappId?: number | null }).whatsappId;
        return wid != null && selectedWhatsappIds.includes(Number(wid));
      });
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro selectedWhatsappIds", {
          selectedWhatsappIds,
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, whatsappId: t.whatsapp?.id })),
          restam: list.length,
        });
      }
    }

    // Espelhos client-side para os demais filtros de UI — mesma razão do bloco acima:
    // sockets (ticket:create/update, chat:create) injetam tickets no store sem checar filtro,
    // causando entradas que "aparecem do nada" e somem no próximo re-fetch.
    if (selectedQueueIds.length > 0) {
      const myId = user?.userId;
      const queueIdSet = new Set(selectedQueueIds);
      const before = list;
      list = list.filter((t) => {
        const qid = t.queue?.id;
        if (qid != null && queueIdSet.has(qid)) return true;
        // Não-admin: ticket atribuído ao próprio usuário passa mesmo fora da fila filtrada
        // (espelha o "OR t.userId = :userId" do backend quando NotViewAssignedTickets não é estrito).
        if (!isAdminLike && !notViewAssignedTickets && myId != null && t.user?.id === myId) return true;
        return false;
      });
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro selectedQueueIds", {
          selectedQueueIds,
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, queueId: t.queue?.id })),
          restam: list.length,
        });
      }
    }

    if (selectedUserIds.length > 0) {
      const userIdSet = new Set(selectedUserIds.map(Number).filter(Number.isFinite));
      const before = list;
      list = list.filter((t) => t.user?.id != null && userIdSet.has(t.user.id));
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro selectedUserIds", {
          selectedUserIds,
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, assignedUserId: t.user?.id })),
          restam: list.length,
        });
      }
    }

    if (selectedTagIds.length > 0) {
      const tagIdSet = new Set(selectedTagIds.map(Number).filter(Number.isFinite));
      const before = list;
      list = list.filter((t) => {
        const tags = (t.tags || []) as { id?: number }[];
        return tags.some((tag) => tag.id != null && tagIdSet.has(tag.id));
      });
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro selectedTagIds", {
          selectedTagIds,
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, tags: t.tags })),
          restam: list.length,
        });
      }
    }

    if (selectedKanbanIds.length > 0) {
      const kanbanIdSet = new Set(selectedKanbanIds.map(Number).filter(Number.isFinite));
      const before = list;
      list = list.filter((t) => {
        const k = (t.contact as { kanban?: number | string } | undefined)?.kanban;
        const n = typeof k === "number" ? k : (k != null ? Number(k) : NaN);
        return Number.isFinite(n) && kanbanIdSet.has(n);
      });
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro selectedKanbanIds", {
          selectedKanbanIds,
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, kanban: (t.contact as { kanban?: number | string } | undefined)?.kanban })),
          restam: list.length,
        });
      }
    }

    if (withUnreadMessages) {
      const before = list;
      list = list.filter((t) => (t.unreadMessages ?? 0) > 0);
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro withUnreadMessages", {
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, unreadMessages: t.unreadMessages })),
          restam: list.length,
        });
      }
    }

    if (dateFrom || dateTo) {
      const fromMs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
      const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;
      const before = list;
      list = list.filter((t) => {
        const created = t.createdAt ? new Date(t.createdAt).getTime() : NaN;
        if (!Number.isFinite(created)) return true; // se sem data, deixa passar (espelha leniência do REST)
        return created >= fromMs && created <= toMs;
      });
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        console.debug("[baseFiltered] filtro dateFrom/dateTo", {
          dateFrom,
          dateTo,
          removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, createdAt: t.createdAt })),
          restam: list.length,
        });
      }
    }

    if (dbg) {
      console.debug("[baseFiltered] resultado final", {
        total: list.length,
        tickets: list.map((t) => ({ id: t.id, status: t.status, isGroup: t.isGroup, chatbot: t.chatbot, contact: t.contact?.name, queue: t.queue?.name, userId: t.user?.id })),
      });
    }

    return list;
  }, [tickets, notViewTicketsChatBot, notViewAssignedTickets, isAdminLike, showAll, user?.userId, user?.profile, user?.queues, user?.whatsappAllowed, supervisorAdmin, configuracoes, getConfigValue, supervisorViewDept, supervisorQueueIds, statusFilters, selectedQueueIds, selectedWhatsappIds, selectedUserIds, selectedTagIds, selectedKanbanIds, withUnreadMessages, dateFrom, dateTo]);

  // Aplica o filtro por tipo de aba (privado/grupos/chatbot) sobre a base já filtrada.
  const visibleTicketsAllStatuses = React.useMemo(() => {
    if (tabType === "groups") return baseFilteredTickets.filter((t) => t.isGroup);
    if (tabType === "chatbot") return baseFilteredTickets.filter((t) => !t.isGroup && t.chatbot);
    return baseFilteredTickets.filter((t) => !t.isGroup);
  }, [baseFilteredTickets, tabType]);

  const ticketCounts = React.useMemo(() => {
    const counts: Record<string, number> = { open: 0, pending: 0, closed: 0 };

    counts.closed = visibleTicketsAllStatuses.filter((t) => t.status === "closed").length;

    // Para open/pending: aplica a mesma deduplicação por contato usada na listagem
    const active = visibleTicketsAllStatuses.filter((t) => t.status === "open" || t.status === "pending");
    const deduped = dedupeActiveTicketsByContactChannel(active);
    for (const t of deduped) {
      if (counts[t.status] !== undefined) counts[t.status]++;
    }

    return counts;
  }, [visibleTicketsAllStatuses]);

  // Contagem de mensagens não lidas por tipo de tab (para universalCounter).
  // Usa baseFilteredTickets para que o badge respeite as mesmas regras de visibilidade
  // da listagem (queue do usuário, NotViewAssignedTickets, NotViewTicketsChatBot,
  // supervisorViewDept, selectedWhatsappIds, status). Evita o badge "fantasma":
  // antes mostrava 1 unread mesmo quando o ticket era invisível ao usuário.
  const tabUnreadCounts = React.useMemo(() => {
    const privateUnread = baseFilteredTickets.filter((t) => !t.isGroup && (t.unreadMessages ?? 0) > 0).length;
    const groupsUnread = baseFilteredTickets.filter((t) => t.isGroup && (t.unreadMessages ?? 0) > 0).length;
    const chatbotUnread = baseFilteredTickets.filter((t) => !t.isGroup && t.chatbot && (t.unreadMessages ?? 0) > 0).length;
    return { private: privateUnread, groups: groupsUnread, chatbot: chatbotUnread };
  }, [baseFilteredTickets]);

  // Equivalente ao cSessionsOptions do Vue — filtra sessões por whatsappAllowed para não-admins
  // supervisorAdmin === 'enabled' → super é limitado, vê apenas suas sessões permitidas
  const availableWhatsapps = React.useMemo(() => {
    const isAdminOrSuperAdmin = user?.profile === "admin" ||
      (user?.profile === "super" && supervisorAdmin !== "enabled");
    const sort = (list: typeof whatsappsList) => list.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    if (isAdminOrSuperAdmin) return sort(whatsappsList);
    const allowed = user?.whatsappAllowed;
    if (!allowed || !Array.isArray(allowed) || allowed.length === 0) return sort(whatsappsList);
    const allowedIds = (allowed as { id: number }[]).map((a) => a.id);
    return sort(whatsappsList.filter((w) => allowedIds.includes(w.id)));
  }, [whatsappsList, user?.profile, user?.whatsappAllowed, supervisorAdmin]);

  // Status helpers para canais — usado tanto na ordenação quanto nos badges
  // de monitoramento. offline=0, connecting=1, online=2.
  const getChannelStatusRank = React.useCallback((status?: string): number => {
    if (!status || status === "CONNECTED") return 2;
    if (status === "qrcode" || status === "OPENING" || status === "PAIRING" || status === "CONNECTING") return 1;
    return 0;
  }, []);

  // Modo do toggle de saúde de canais: cicla online → connecting → offline.
  // Determina ícone, cor e prioridade de ordenação dos chips.
  const [channelHealthMode, setChannelHealthMode] = useState<"offline" | "online" | "connecting">("online");

  // Lista ordenada conforme o modo selecionado: o grupo do modo vem primeiro.
  const sortedAvailableWhatsapps = React.useMemo(() => {
    const priorityFor = (rank: number): number => {
      if (channelHealthMode === "offline") return rank; // 0 (off) primeiro
      if (channelHealthMode === "online") return -rank; // 2 (on) primeiro
      // connecting: 1 (conn) primeiro, depois 0, depois 2
      return rank === 1 ? 0 : rank === 0 ? 1 : 2;
    };
    return [...availableWhatsapps].sort((a, b) => priorityFor(getChannelStatusRank(a.status)) - priorityFor(getChannelStatusRank(b.status)));
  }, [availableWhatsapps, getChannelStatusRank, channelHealthMode]);

  // Contagens de canais por categoria — usadas no badge de saúde da barra de
  // busca (que cicla entre offline / online / connecting).
  const channelHealth = React.useMemo(() => {
    let offline = 0;
    let connecting = 0;
    let online = 0;
    for (const w of availableWhatsapps) {
      const rank = getChannelStatusRank(w.status);
      if (rank === 0) offline++;
      else if (rank === 1) connecting++;
      else online++;
    }
    return { offline, connecting, online };
  }, [availableWhatsapps, getChannelStatusRank]);

  const activeFiltersCount = React.useMemo(() => {
    let c = 0;
    if (showAll) c++;
    if (withUnreadMessages) c++;
    if (orderAsc !== null) c++; // conta só override explícito do usuário (não o default do tenant); "Limpar filtros" zera
    if (selectedQueueIds.length > 0) c++;
    if (selectedWhatsappIds.length > 0) c++;
    if (selectedUserIds.length > 0) c++;
    if (selectedTagIds.length > 0) c++;
    if (selectedKanbanIds.length > 0) c++;
    if (showAll && includeClosed) c++;
    if (statusFilters.length !== 2 || !statusFilters.includes("open") || !statusFilters.includes("pending")) c++;
    if (dateFrom) c++;
    if (dateTo) c++;
    return c;
  }, [showAll, includeClosed, withUnreadMessages, orderAsc, selectedQueueIds, selectedWhatsappIds, selectedUserIds, selectedTagIds, selectedKanbanIds, statusFilters, dateFrom, dateTo]);

  // Debounce search — fires loadTickets 300ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // "Fechados" no STATUS é subordinado a "Incluir tickets fechados" no modo Ver Todos
  // (admin/super): nesse modo o backend ignora o array de status e inclui fechados apenas
  // quando includeClosed=true. Mantemos a UI coerente desmarcando "closed" do filtro quando
  // "Incluir tickets fechados" está desmarcado (cobre estado salvo e ativação do Ver Todos).
  useEffect(() => {
    if (isAdminLike && showAll && !includeClosed && statusFilters.includes("closed")) {
      setStatusFilters((prev) => prev.filter((s) => s !== "closed"));
    }
  }, [isAdminLike, showAll, includeClosed, statusFilters]);

  // Persist filter state to localStorage + backend (debounced 800ms)
  const filterPersistInitialized = useRef(false);
  useEffect(() => {
    // skip the very first render to avoid overwriting saved values
    if (!filterPersistInitialized.current) {
      filterPersistInitialized.current = true;
      return;
    }
    const filtersToSave: SavedFilters = {
      showAll,
      includeClosed,
      status: statusFilters,
      withUnreadMessages,
      orderAsc,
      filtersV2: true,
      queuesIds: selectedQueueIds,
      whatsappIds: selectedWhatsappIds,
      selectedUsers: selectedUserIds,
      selectedTagIds,
      selectedKanbanIds,
      isReversed,
      sortByAnswered,
      density,
      dateFrom,
      dateTo,
    };
    localStorage.setItem("filtrosAtendimento", JSON.stringify(filtersToSave));
    const timer = setTimeout(() => {
      const userId = user?.userId;
      if (!userId) return;
      updateUserConfigs(userId, { filtrosAtendimento: filtersToSave })
        .catch(() => {/* silent — localStorage already saved */});
    }, 800);
    return () => clearTimeout(timer);
  }, [showAll, includeClosed, statusFilters, withUnreadMessages, orderAsc, selectedQueueIds, selectedWhatsappIds, selectedUserIds, selectedTagIds, selectedKanbanIds, isReversed, sortByAnswered, density, dateFrom, dateTo]);

  // Sincroniza filtros ativos → ticket-filter-store. Hooks de socket (use-socket-tickets
  // e use-socket-tickets-otm) leem dessa store via getState() para gatear addTicket
  // quando o ticket recebido nao casa com o filtro ativo — evita poluicao do store
  // com tickets que o usuario explicitamente filtrou.
  useEffect(() => {
    const active =
      selectedQueueIds.length > 0 ||
      selectedUserIds.length > 0 ||
      selectedTagIds.length > 0 ||
      selectedKanbanIds.length > 0 ||
      selectedWhatsappIds.length > 0 ||
      withUnreadMessages ||
      !!dateFrom ||
      !!dateTo;
    useTicketFilterStore.getState().setFilterSnapshot({
      selectedQueueIds,
      selectedUserIds,
      selectedTagIds,
      selectedKanbanIds,
      selectedWhatsappIds,
      withUnreadMessages,
      dateFrom,
      dateTo,
      showAll,
      active,
    });
  }, [selectedQueueIds, selectedUserIds, selectedTagIds, selectedKanbanIds, selectedWhatsappIds, withUnreadMessages, dateFrom, dateTo, showAll]);

  // Ao sair de /atendimento o gate de socket nao deve mais filtrar — senao tickets
  // legitimamente recebidos enquanto o usuario esta em outra pagina (sino/notificacoes)
  // seriam descartados por causa de filtros stale.
  useEffect(() => {
    return () => {
      useTicketFilterStore.getState().resetFilterSnapshot();
    };
  }, []);

  // Active filter chips for display below search bar
  const activeFilterChips = React.useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (showAll) chips.push({ label: "Ver todos", onRemove: () => setShowAll(false) });
    if (withUnreadMessages) chips.push({ label: "Não lidos", onRemove: () => setWithUnreadMessages(false) });
    selectedQueueIds.forEach((id) => {
      const q = queues.find((q) => q.id === id);
      if (q) chips.push({ label: q.name, onRemove: () => toggleQueueId(id) });
    });
    selectedWhatsappIds.forEach((id) => {
      const w = availableWhatsapps.find((w) => w.id === id);
      if (w) chips.push({ label: w.name, onRemove: () => toggleWhatsappId(id) });
    });
    selectedUserIds.forEach((id) => {
      const u = usersList.find((u) => u.id === Number(id));
      if (u) chips.push({ label: u.name, onRemove: () => toggleId(setSelectedUserIds, id) });
    });
    selectedTagIds.forEach((id) => {
      const tag = tagsList.find((t) => t.id === Number(id));
      const name = tag?.tag || tag?.name || id;
      chips.push({ label: String(name), onRemove: () => toggleId(setSelectedTagIds, id) });
    });
    selectedKanbanIds.forEach((id) => {
      const k = kanbansList.find((k) => k.id === Number(id));
      if (k) chips.push({ label: k.name, onRemove: () => toggleId(setSelectedKanbanIds, id) });
    });
    if (dateFrom) chips.push({ label: `De: ${dateFrom}`, onRemove: () => setDateFrom("") });
    if (dateTo) chips.push({ label: `Até: ${dateTo}`, onRemove: () => setDateTo("") });
    return chips;
  }, [showAll, withUnreadMessages, selectedQueueIds, selectedWhatsappIds, selectedUserIds, selectedTagIds, selectedKanbanIds, queues, availableWhatsapps, usersList, tagsList, kanbansList, dateFrom, dateTo, toggleId]);

  // ESC key → deselect current ticket
  // Colisão resolvida: com bulkMode ativo, Escape SÓ cancela a seleção múltipla
  // (listener dedicado abaixo) — aqui early-return para não desselecionar junto.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && currentTicket) {
        if (bulkMode) return;
        selectionRef.current = null;
        setCurrentTicket(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [currentTicket, setCurrentTicket, bulkMode]);

  // Atalhos globais de teclado: Alt+↓/↑ navega entre tickets da lista filtrada;
  // Alt+R resolve o ticket atual reusando o botão Resolver do header (mesmos
  // guards/confirm/fluxo de avaliação — botão oculto/disabled ⇒ atalho no-op).
  // Guard: ignora foco em campos editáveis e dentro de dialogs Radix abertos.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const isNav = e.key === "ArrowDown" || e.key === "ArrowUp";
      const isResolve = e.key === "r" || e.key === "R";
      if (!isNav && !isResolve) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (el && typeof el.closest === "function" && el.closest('[role="dialog"]')) return;
      if (isNav) {
        e.preventDefault();
        const list = filteredTicketsRef.current;
        if (!list.length) return;
        const cur = useTicketStore.getState().currentTicket;
        const idx = cur ? list.findIndex((tk) => tk.id === cur.id) : -1;
        const next = idx === -1
          ? list[0]
          : e.key === "ArrowDown"
          ? list[Math.min(idx + 1, list.length - 1)]
          : list[Math.max(idx - 1, 0)];
        if (next && next.id !== cur?.id) void handleSelectTicketRef.current?.(next);
        return;
      }
      // Alt+R — dispara o MESMO handler do botão Resolver (via click no DOM)
      e.preventDefault();
      document.querySelector<HTMLButtonElement>("[data-resolve-ticket-btn]")?.click();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    fetchQueues().then(({ data }) => {
      const rawQueues = (data || []).slice().sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setAllQueues(rawQueues);
      if (!isAdminLike) {
        const userQueueIds = new Set(
          (user?.queues as { id: number }[] | undefined || []).map((q) => q.id)
        );
        setQueues(rawQueues.filter((q) => userQueueIds.has(q.id)));
      } else {
        setQueues(rawQueues);
      }
    }).catch(() => { toast.error(tErrors("loadFailed")); });
    fetchAllUsers().then(({ data }) => {
      const arr = data?.users || [];
      setUsersList(
        arr
          .filter((u: { profile?: string; inactive?: boolean }) => u.profile !== "superadmin" && !u.inactive)
          .map((u: { id: number; name: string; queues?: { id: number }[] }) => ({ id: u.id, name: u.name, queues: u.queues || [] }))
          .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      );
    }).catch(() => { toast.error(tErrors("loadFailed")); });
    fetchWhatsapps().then(({ data }) => {
      const arr = Array.isArray(data) ? data : [];
      const all = arr
        .map((w: { id: number; name: string; type?: string; tokenAPI?: string; status?: string; bmToken?: string; wabaId?: string; wabaVersion?: string; number?: string }) => ({
          id: w.id,
          name: w.name,
          type: w.type,
          tokenAPI: w.tokenAPI,
          status: w.status,
          bmToken: w.bmToken,
          wabaId: w.wabaId,
          wabaVersion: w.wabaVersion,
          number: w.number,
        }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setWhatsappsList(all);
      // Popula o store global (usado pelo badge híbrido do item de ticket, pelo message-input
      // e pelo handoff). Objetos COMPLETOS: outras telas leem credenciais deste store
      // (ex.: /configuracoes/meta usa wabaId/bmToken/appId para criar template) — um map
      // reduzido aqui envenena o store e quebra essas ações até um F5.
      useWhatsappStore.getState().setWhatsapps(
        arr.map((w: { id: number; name: string; status?: string }) => ({
          ...w,
          status: w.status || "",
        }))
      );
    }).catch(() => { toast.error(tErrors("loadFailed")); });
    fetchTags().then(({ data }) => {
      const arr = Array.isArray(data) ? data : [];
      setTagsList(
        arr
          .map((t: { id: number; tag?: string; name?: string; color?: string; isActive?: boolean }) => ({ id: t.id, tag: t.tag ?? t.name, name: t.name ?? t.tag, color: t.color, isActive: t.isActive }))
          .sort((a: { tag?: string }, b: { tag?: string }) => (a.tag ?? "").localeCompare(b.tag ?? "", undefined, { sensitivity: "base" }))
      );
    }).catch(() => { toast.error(tErrors("loadFailed")); });
    // Kanban é gated por plano. Como esta carga é automática (abrir o atendimento),
    // um plano sem funil não pode virar "Falha ao carregar" + "recurso fora do plano":
    // a lista simplesmente fica vazia e os badges de kanban não aparecem.
    fetchKanbans({ background: true }).then(({ data }) => {
      const arr = Array.isArray(data) ? data : [];
      setKanbansList(
        (Array.isArray(arr) ? arr : []).slice().sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      );
    }).catch((err) => { if (!isFeatureNotInPlanError(err)) toast.error(tErrors("loadFailed")); });
    // ChatFlows: usado pelo dialog "Transferir para Chatbot" dentro do TicketDetail (aba Gestão).
    // Mesmo endpoint usado pelo bulk-transfer e pelo header do ticket.
    fetchChatFlows().then(({ data }) => {
      const raw = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.chatFlow as { id: number; name: string }[]) || [];
      const list = Array.isArray(raw) ? raw : [];
      setChatFlowsList(
        list
          .map((cf) => ({ id: cf.id, name: cf.name }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      );
    }).catch(() => { /* silent — recarregado sob demanda quando o user abre o modal */ });
    fetchReasons().then(({ data }) => {
      const raw = data as unknown as { reasons?: Reason[] } | Reason[];
      const list = Array.isArray(raw) ? raw : (Array.isArray((raw as { reasons?: Reason[] }).reasons) ? (raw as { reasons: Reason[] }).reasons : []);
      setPageReasonsList(list);
    }).catch(() => { /* silencioso: lista de motivos é opcional para a sidebar */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminLike, user?.queues]);

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

  useEffect(() => {
    if (convitesOpen) loadConvites();
  }, [convitesOpen, loadConvites]);

  useEffect(() => {
    loadConvites();
  }, [loadConvites]);

  useTicketSharedSocket({
    onCreate: () => { loadConvites(); },
    onDelete: (p) => {
      setConvitesList((prev) => prev.filter((c) => c.id !== p.id && c.ticketId !== p.ticketId));
    },
  });

  // Lê params de entrada vindos do header:
  // ?status=pending → muda para aba pendente
  useEffect(() => {
    const statusParam = searchParams.get("status");
    if (statusParam === "pending") setStatusFilter("pending");
  // Só executa uma vez no mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * fetchTicket com 1 retry curto p/ falha transitoria (rede/timeout/5xx).
   * Sem isto, uma falha unica na hidratacao deixa o currentTicket PARCIAL —
   * o catch dos callers mantem o item da lista, que nao traz whatsapp.tokenAPI
   * — travando envio WABA ("wabaDataUnavailable") e sumindo o numero do header
   * ate um F5. 4xx e definitivo (403 sem acesso / 404 inexistente) e repropaga
   * na hora pro caller tratar (handleTicketAccessDenied). O interceptor do
   * axios rejeita com error.response (tem .status) ou o erro cru de rede (sem
   * .status) — status ausente conta como transitorio.
   */
  const fetchTicketWithRetry = useCallback(async (ticketId: number) => {
    try {
      return await fetchTicket(ticketId);
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (typeof status === "number" && status < 500) throw err;
      // Usuario ja trocou de ticket durante a 1a tentativa? Nao vale re-tentar.
      if (selectionRef.current !== null && selectionRef.current !== ticketId) throw err;
      await new Promise((r) => setTimeout(r, 700));
      if (selectionRef.current !== null && selectionRef.current !== ticketId) throw err;
      return fetchTicket(ticketId);
    }
  }, []);

  const handleOpenConviteTicket = useCallback(async (ticketId: number) => {
    setConvitesOpen(false);
    selectionRef.current = ticketId;
    setMessagesLoading(true);
    const ticket = tickets.find((x) => x.id === ticketId);
    if (ticket) {
      // Set immediately for responsive UI, but still fetch full data below
      // (list query does not include whatsapp.tokenAPI needed for WABA sends)
      setCurrentTicket(ticket);
      setDetailOpen(false);
    }
    try {
      const { data } = await fetchTicketWithRetry(ticketId);
      if (!data) return;
      // Stale-fetch guard
      if (selectionRef.current !== ticketId) return;
      const normalized = normalizeTicket(data as Record<string, unknown>);
      setCurrentTicket(normalized);
      setDetailOpen(false);
      setTickets([normalized, ...tickets.filter((x) => x.id !== ticketId)]);
      const res = await fetchMessages(ticketId, { pageNumber: 1 });
      if (selectionRef.current !== ticketId) return;
      const msgs = res.data?.messages || [];
      setMessages(msgs);
      setHasMore(res.data?.hasMore ?? msgs.length >= 20);
    } catch {
      toast.error(t("ticketNotFound"));
    } finally {
      if (selectionRef.current === ticketId) setMessagesLoading(false);
    }
  }, [tickets, setTickets, setMessages, setHasMore, fetchTicketWithRetry]);

  const handleRemoveConvite = useCallback(async (id: number) => {
    try {
      await deleteTicketShared(id);
      setConvitesList((prev) => prev.filter((c) => c.id !== id));
      toast.success(t("inviteRemoved"));
    } catch {
      toast.error(t("errorRemovingInvite"));
    }
  }, []);

  const loadTickets = useCallback(async (opts?: { upToPage?: number }) => {
    if (loadTicketsInFlightRef.current) return;
    loadTicketsInFlightRef.current = true;
    setLoading(true);
    // Captura a página corrente ANTES do reset eager: em falha de fetch o estado
    // é restaurado no catch — senão o ref degradaria pra 1 e o próximo refresh
    // (sinal de socket/resync) perderia a paginação do "carregar mais".
    const prevPageNumber = ticketsPageNumberRef.current;
    setTicketsPageNumber(1);
    // upToPage > 1 é usado pelo resync (visibilitychange/online): refaz fetch
    // de todas as páginas que o usuário já tinha carregado via "carregar mais",
    // preservando a paginação para o diff before/after ser honesto.
    const upToPage = Math.max(1, opts?.upToPage ?? 1);
    try {
      const statusList = statusFilters.length > 0 ? statusFilters : ["open", "pending"];
      const baseParams: Record<string, unknown> = {
        status: statusList,
        searchParam: debouncedSearch,
        showAll: isAdminLike ? showAll : false,
        includeClosed: isAdminLike && showAll ? includeClosed : undefined,
        withUnreadMessages,
        orderAsc: effectiveOrderAsc,
      };
      if (selectedQueueIds.length > 0) baseParams.queuesIds = selectedQueueIds;
      if (selectedWhatsappIds.length > 0) baseParams.whatsappIds = selectedWhatsappIds;
      if (selectedUserIds.length > 0) baseParams.selectedUser = selectedUserIds.map(Number).filter(Number.isFinite);
      if (selectedTagIds.length > 0) baseParams.tagIds = selectedTagIds.map(Number).filter(Number.isFinite);
      if (selectedKanbanIds.length > 0) baseParams.kanbanIds = selectedKanbanIds.map(Number).filter(Number.isFinite);
      if (supervisorViewDept) baseParams.supervisorViewDept = "true";
      if (dateFrom) baseParams.dateFrom = dateFrom;
      if (dateTo) baseParams.dateTo = dateTo;

      let merged: Record<string, unknown>[] = [];
      let lastHasMore = false;
      let lastFetchedPage = 0;
      for (let page = 1; page <= upToPage; page++) {
        const params = { ...baseParams, pageNumber: page };
        if (process.env.NEXT_PUBLIC_DEBUG === "true") {
          console.debug("[loadTickets] chamando fetchTickets", { params });
        }
        const { data } = await fetchTickets(params);
        const raw = (data?.tickets || []) as Record<string, unknown>[];
        merged = merged.concat(raw);
        lastHasMore = !!data?.hasMore;
        lastFetchedPage = page;
        if (process.env.NEXT_PUBLIC_DEBUG === "true") {
          console.debug("[loadTickets] resultado da API", {
            page,
            total: raw.length,
            hasMore: lastHasMore,
          });
        }
        if (!lastHasMore) break;
      }
      // Dedupe por id (ordem do servidor pode trazer um mesmo ticket em duas páginas se
      // a lista mudar entre fetches).
      const seen = new Set<unknown>();
      const deduped = merged.filter((tk) => {
        const id = (tk as { id?: unknown }).id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setTickets(deduped.map((tk) => normalizeTicket(tk)));
      setHasMoreTickets(lastHasMore);
      setTicketsPageNumber(lastFetchedPage || 1);
    } catch {
      // setTickets não rodou (all-or-nothing): a lista segue intacta — restaura
      // o contador de páginas pra casar com o conteúdo real do store.
      setTicketsPageNumber(prevPageNumber);
      toast.error(t("errorLoadingTickets"));
    } finally {
      setLoading(false);
      loadTicketsInFlightRef.current = false;
    }
  }, [statusFilters, debouncedSearch, setTickets, setLoading, showAll, includeClosed, withUnreadMessages, effectiveOrderAsc, selectedQueueIds, selectedWhatsappIds, selectedUserIds, selectedTagIds, selectedKanbanIds, isAdminLike, supervisorViewDept, dateFrom, dateTo]);

  /** Recarrega o ticket atual pelo ID e sincroniza currentTicket + item na lista */
  const refreshCurrentTicket = useCallback(async (ticketId: number) => {
    try {
      const { data } = await fetchTicketWithRetry(ticketId);
      if (!data) return;
      // Stale-fetch guard: nao sobrescrever currentTicket se o usuario ja
      // mudou pra outro ticket durante o fetch.
      if (selectionRef.current !== null && selectionRef.current !== ticketId) return;
      const updated = normalizeTicket(data as Record<string, unknown>);
      // Lista lida do store NO MOMENTO da escrita (nao da closure): um loadTickets
      // concluido durante o await nao pode ser atropelado por um snapshot antigo.
      const listNow = useTicketStore.getState().tickets;
      if (updated.status === "closed") {
        setCurrentTicket(null);
        setTickets(listNow.filter((t) => t.id !== ticketId));
        return;
      }
      const prev = listNow.find((t) => t.id === ticketId);
      const prevTags = prev?.tags;
      const prevContactTags = prev?.contact?.tags;
      let withTags = !updated.tags?.length && prevTags?.length
        ? { ...updated, tags: prevTags }
        : updated;
      // Defensiva: se o backend voltar contact.tags vazio mas tinhamos tags otimistas
      // (e.g. usuario acabou de adicionar uma tag), preserva pra evitar piscar.
      if (!updated.contact?.tags?.length && prevContactTags?.length) {
        withTags = { ...withTags, contact: { ...withTags.contact, tags: prevContactTags } };
      }
      setCurrentTicket(withTags);
      setTickets(listNow.map((t) => t.id === ticketId ? withTags : t));
    } catch { /* silently ignore */ }
  }, [setCurrentTicket, setTickets, fetchTicketWithRetry]);

  const loadPausedTickets = useCallback(async () => {
    setLoadingPaused(true);
    try {
      const { data } = await fetchTickets({ status: ["open", "pending"], isPaused: "true", pageNumber: 1 });
      const raw = data?.tickets || [];
      setPausedTickets(raw.map((t: Record<string, unknown>) => normalizeTicket(t)));
    } catch { /* silently ignore */ }
    finally { setLoadingPaused(false); }
  }, []);

  const loadMoreTickets = useCallback(async () => {
    if (loadingMoreTickets || !hasMoreTickets) return;
    setLoadingMoreTickets(true);
    try {
      const nextPage = ticketsPageNumber + 1;
      const statusList = statusFilters.length > 0 ? statusFilters : ["open", "pending"];
      const params: Record<string, unknown> = {
        status: statusList,
        searchParam: debouncedSearch,
        pageNumber: nextPage,
        showAll: isAdminLike ? showAll : false,
        includeClosed: isAdminLike && showAll ? includeClosed : undefined,
        withUnreadMessages,
        orderAsc: effectiveOrderAsc,
      };
      if (selectedQueueIds.length > 0) params.queuesIds = selectedQueueIds;
      if (selectedWhatsappIds.length > 0) params.whatsappIds = selectedWhatsappIds;
      if (selectedUserIds.length > 0) params.selectedUser = selectedUserIds.map(Number).filter(Number.isFinite);
      if (selectedTagIds.length > 0) params.tagIds = selectedTagIds.map(Number).filter(Number.isFinite);
      if (selectedKanbanIds.length > 0) params.kanbanIds = selectedKanbanIds.map(Number).filter(Number.isFinite);
      if (supervisorViewDept) params.supervisorViewDept = "true";
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const { data } = await fetchTickets(params);
      const raw = data?.tickets || [];
      const newTickets = raw.map((t: Record<string, unknown>) => normalizeTicket(t));
      const current = useTicketStore.getState().tickets;
      const merged = [...current, ...newTickets];
      setTickets(merged.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i));
      setHasMoreTickets(!!data?.hasMore);
      setTicketsPageNumber(nextPage);
    } catch {
      toast.error(t("errorLoadingMoreTickets"));
    } finally {
      setLoadingMoreTickets(false);
    }
  }, [ticketsPageNumber, hasMoreTickets, loadingMoreTickets, statusFilters, debouncedSearch, showAll, includeClosed, withUnreadMessages, effectiveOrderAsc, selectedQueueIds, selectedWhatsappIds, selectedUserIds, selectedTagIds, selectedKanbanIds, isAdminLike, setTickets, supervisorViewDept, dateFrom, dateTo]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    ticketsPageNumberRef.current = ticketsPageNumber;
  }, [ticketsPageNumber]);

  // Resync ao voltar de background ou recuperar conexão: evita ticket "sumido" quando
  // eventos de socket foram perdidos enquanto a aba estava oculta ou offline.
  // Cooldown de 30s entre refreshes automáticos: o socket continua atualizando a lista
  // por eventos; um refetch completo só se justifica se a janela de ausência foi longa.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const AUTO_RELOAD_COOLDOWN_MS = 30_000;
    const VISIBILITY_HIDDEN_THRESHOLD_MS = 300_000;
    const maybeAutoReload = async () => {
      const now = Date.now();
      if (now - lastAutoReloadAtRef.current < AUTO_RELOAD_COOLDOWN_MS) return;
      lastAutoReloadAtRef.current = now;
      // Resync preserva a paginação carregada: refaz fetch das páginas 1..N que
      // o usuário já tinha (via "carregar mais"), pra não jogar fora a lista
      // expandida. O diff before/after então só conta tickets que realmente
      // saíram da visão do usuário (encerrados ou transferidos por outro operador).
      const beforeTickets = useTicketStore.getState().tickets;
      const upToPage = Math.max(1, ticketsPageNumberRef.current);
      await loadTickets({ upToPage });
      const afterIds = new Set(useTicketStore.getState().tickets.map((tk) => tk.id));
      const vanishedTickets = beforeTickets.filter((tk) => !afterIds.has(tk.id));
      if (vanishedTickets.length > 0) {
        // Enumera TODOS os atendimentos que saíram (nome + #id) pra o operador
        // saber exatamente o que sumiu durante a ausência, não só a contagem.
        // Usuário restrito (restrictedUser) tem o nome truncado igual ao resto da UI.
        const ticketLabel = (tk: (typeof beforeTickets)[number]) => {
          const rawName = tk.contact?.name?.trim() || t("ticketResyncNoName");
          const name = isRestricted ? `${rawName.slice(0, 5)}...` : rawName;
          return `${name} (#${tk.id})`;
        };
        const description = vanishedTickets.map(ticketLabel).join(", ");
        toast.info(t("ticketsResyncedAfterAbsence", { count: vanishedTickets.length }), {
          description,
          duration: 8000,
        });
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > VISIBILITY_HIDDEN_THRESHOLD_MS) {
        hiddenAt = null;
        maybeAutoReload();
      }
    };
    const onOnline = () => maybeAutoReload();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [loadTickets, isRestricted]);

  // When the socket signals a ticket-list refresh, debounce loadTickets() to evitar reload em cada evento
  const prevSignalRef = React.useRef(0);
  const signalDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalMaxWaitRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (ticketListRefreshSignal === 0) return; // skip initial mount
    if (ticketListRefreshSignal === prevSignalRef.current) return;
    prevSignalRef.current = ticketListRefreshSignal;

    const now = Date.now();
    if (signalMaxWaitRef.current === null) signalMaxWaitRef.current = now;

    const fire = () => {
      signalDebounceRef.current = null;
      signalMaxWaitRef.current = null;
      // Preserva a paginação do "carregar mais": refaz as páginas 1..N já
      // carregadas, igual ao resync de visibilidade/online. Sem isto, qualquer
      // sinal de socket resetava a lista pra página 1 (~30 tickets) segundos
      // depois do usuário expandir a listagem.
      loadTickets({ upToPage: ticketsPageNumberRef.current });
    };

    // Se sinais chegam há mais de 5s seguidos, dispara imediatamente (maxWait)
    if (now - signalMaxWaitRef.current >= 5000) {
      if (signalDebounceRef.current) clearTimeout(signalDebounceRef.current);
      fire();
      return;
    }

    // Debounce: aguarda 1500ms após o último sinal antes de recarregar
    if (signalDebounceRef.current) clearTimeout(signalDebounceRef.current);
    signalDebounceRef.current = setTimeout(fire, 1500);
  }, [ticketListRefreshSignal, loadTickets]);

  // Ref inicializado com o valor corrente do sinal: apos remount de /atendimento
  // um sinal antigo (>0) nao pode disparar refetch espurio.
  const prevCurrentTicketSignalRef = React.useRef(useTicketStore.getState().currentTicketRefreshSignal);
  useEffect(() => {
    if (currentTicketRefreshSignal === 0) return; // skip initial mount
    if (currentTicketRefreshSignal === prevCurrentTicketSignalRef.current) return;
    prevCurrentTicketSignalRef.current = currentTicketRefreshSignal;
    const currentTicketNow = useTicketStore.getState().currentTicket;
    if (currentTicketNow) {
      refreshCurrentTicket(currentTicketNow.id);
    }
  }, [currentTicketRefreshSignal, refreshCurrentTicket]);

  // Auto-fetch: busca próximas páginas automaticamente enquanto tickets carregados < limite e há mais páginas.
  // Usa tickets.length (total bruto do store) como critério — o limite de 30 se aplica ao conjunto completo:
  // abertos + pendentes + grupos + privados, independente da aba/tipo ativo no momento.
  useEffect(() => {
    if (loading || loadingMoreTickets || !hasMoreTickets) return;
    if (tickets.length >= 30) return;
    loadMoreTickets();
  }, [loading, loadingMoreTickets, hasMoreTickets, tickets.length, loadMoreTickets]);

  // Habilitar infinite scroll só após a lista inicial ter carregado (evita disparo ao abrir a página)
  useEffect(() => {
    if (loading) {
      infiniteScrollReadyRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      infiniteScrollReadyRef.current = true;
    }, 800);
    return () => clearTimeout(t);
  }, [loading]);

  // Infinite scroll: ao rolar até o final da lista, carregar mais (com delay e cooldown para evitar loop)
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const root = listScrollRef.current;
    if (!sentinel || !root || !hasMoreTickets || loadingMoreTickets) return;
    const viewport = root.querySelector("[data-radix-scroll-area-viewport]") ?? root.firstElementChild;
    if (!viewport || !(viewport instanceof Element)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || !hasMoreTickets || loadingMoreTickets) return;
        if (!infiniteScrollReadyRef.current) return;
        if (Date.now() < loadMoreCooldownRef.current) return;

        if (loadMoreScheduledRef.current) clearTimeout(loadMoreScheduledRef.current);
        loadMoreScheduledRef.current = setTimeout(() => {
          loadMoreScheduledRef.current = null;
          if (loadingMoreTickets || !hasMoreTickets) return;
          loadMoreCooldownRef.current = Date.now() + 2000;
          loadMoreTickets();
        }, 400);
      },
      { root: viewport, rootMargin: "200px 0px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      if (loadMoreScheduledRef.current) {
        clearTimeout(loadMoreScheduledRef.current);
        loadMoreScheduledRef.current = null;
      }
    };
  }, [hasMoreTickets, loadingMoreTickets, loadMoreTickets]);

  useEffect(() => {
    if (!tickets.length) return;
    // Aceita ?ticketId=ID e ?ticket=ID (vindo de protocolos, notas, etc.)
    const ticketIdParam = searchParams.get("ticketId") || searchParams.get("ticket");
    if (!ticketIdParam) {
      lastDeepLinkRef.current = null;
      return;
    }
    const id = Number(ticketIdParam);
    if (!id || lastDeepLinkRef.current === id) return;
    const tabParam = searchParams.get("tab");
    const found = tickets.find((t) => t.id === id);
    if (found) {
      lastDeepLinkRef.current = id;
      if (tabParam === "groups" || found.isGroup) setTabType("groups");
      else setTabType("private");
      setStatusFilter(found.status || "open");
      handleSelectTicket(found);
    } else if (!loading) {
      import("@/services/tickets").then(({ fetchTicket }) =>
        fetchTicket(id).then(({ data }) => {
          if (data) {
            lastDeepLinkRef.current = id;
            const normalized = normalizeTicket(data as Record<string, unknown>);
            if (tabParam === "groups" || normalized.isGroup) setTabType("groups");
            else setTabType("private");
            setStatusFilter(normalized.status || "open");
            setTickets([normalized, ...tickets.filter((t) => t.id !== normalized.id)]);
            handleSelectTicket(normalized);
          }
        }).catch(() => {})
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, loading, searchParams]);

  // Handler para ?spy=ID (vindo de protocolos)
  const spyDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (spyDeepLinkHandled.current) return;
    const spyParam = searchParams.get("spy");
    if (!spyParam) return;
    const id = Number(spyParam);
    if (!id) return;
    spyDeepLinkHandled.current = true;
    import("@/services/tickets").then(({ fetchTicket }) =>
      fetchTicket(id).then(({ data }) => {
        if (data) {
          const normalized = normalizeTicket(data as Record<string, unknown>);
          setSpyTicket(normalized);
          setSpyOpen(true);
        }
      }).catch(() => {})
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSelectTicket = async (ticket: Ticket) => {
    // Marca esta selecao como a atual; resolucoes async de clicks anteriores
    // ficam invalidadas pelo guard logo abaixo apos o fetchTicket.
    selectionRef.current = ticket.id;
    // Captura as não-lidas ANTES de zerar — alimenta o banner "novas mensagens"
    // do chat (limpo/substituído a cada troca de ticket)
    setUnreadAtOpen(ticket.unreadMessages ?? 0);
    // Zerar unreadMessages otimisticamente ao abrir o ticket — remove o bubble imediatamente
    const ticketWithRead = { ...ticket, unreadMessages: 0 };
    setCurrentTicket(ticketWithRead);
    if ((ticket.unreadMessages ?? 0) > 0) {
      updateTicketInStore({ id: ticket.id, unreadMessages: 0 });
    }
    // Marcar notificação correspondente como lida no badge do header
    markNotificationAsRead(ticket.id);
    setDetailOpen(false);
    setClearReplySignal((n) => n + 1);
    setPageNumber(1);
    const saved = localStorage.getItem(`autoScrollEnabled_${ticket.id}`);
    setAutoScrollEnabled(saved === null ? true : saved === "true");
    setMessages([]);
    setHasMore(false);
    setMessagesLoading(true);
    try {
      const { data: ticketData } = await fetchTicketWithRetry(ticket.id);
      // Stale-fetch guard: descarta se o usuario ja clicou em outro ticket enquanto
      // este fetch estava pendente — evita sobrescrever a selecao atual.
      if (selectionRef.current !== ticket.id) return;
      const normalized = ticketData ? normalizeTicket(ticketData as Record<string, unknown>) : ticket;
      const fullTicket = !normalized.tags?.length && ticket.tags?.length
        ? { ...normalized, tags: ticket.tags }
        : normalized;
      // Preserva unreadMessages: 0 — o ticket já foi aberto, não restaurar o valor antigo
      const fullTicketRead = { ...fullTicket, unreadMessages: 0 };
      setCurrentTicket(fullTicketRead);
      // Popula o cache de validação Baileys com o número fresco do banco — primeiro send
      // depois disso não precisa de round-trip extra (vide handleSendText/handleSendMedia).
      const freshNumber = fullTicketRead.contact?.number;
      if (freshNumber) {
        baileysSendNumberCacheRef.current.set(ticket.id, { number: freshNumber, ts: Date.now() });
      }
      // Atualiza só o queue no item da lista para pegar a cor correta
      if (fullTicketRead.queue) {
        updateTicketInStore({ id: ticket.id, queue: fullTicketRead.queue });
      }
    } catch (err) {
      // Guard de acesso do backend (403 ERR_NO_TICKET_ACCESS): ticket de fila alheia.
      // O socket pode ter injetado o card (push pro tenant inteiro) — fecha, remove e
      // avisa, sem abrir a conversa. handleTicketAccessDenied detecta pelo code do erro
      // (o interceptor do axios rejeita com error.response, que nao tem .response).
      if (handleTicketAccessDenied(err, ticket.id, t("noTicketAccess"))) {
        if (selectionRef.current === ticket.id) setMessagesLoading(false);
        return;
      }
      // mantém o ticket da lista se falhar o detalhe (outros erros)
    }
    setPinnedMessages([]);
    let loadedMsgs: Message[] = [];
    try {
      const { data } = await fetchMessages(ticket.id, { pageNumber: 1 });
      loadedMsgs = data?.messages || [];
      // Persistência das bolhas falhadas (ack -1): o fetch inicial substituiria a
      // lista e apagaria a bolha otimista falhada — re-anexa as guardadas em
      // failedByTicketRef que não vieram do backend (dedupe por id), no fim da
      // lista ordenadas por createdAt.
      const failedForTicket = failedByTicketRef.current.get(ticket.id);
      if (failedForTicket?.length) {
        const loadedIds = new Set(loadedMsgs.map((m) => m.id));
        const missingFailed = failedForTicket
          .filter((m) => !loadedIds.has(m.id))
          .sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
        setMessages(missingFailed.length ? [...loadedMsgs, ...missingFailed] : loadedMsgs);
      } else {
        setMessages(loadedMsgs);
      }
      setHasMore(data?.hasMore ?? loadedMsgs.length >= 20);
    } catch {
      toast.error(t("errorLoadingMessages"));
    } finally {
      // Só o handler do ticket atualmente selecionado apaga o loading — evita que
      // uma resolução tardia zere o indicador de um clique mais recente.
      if (selectionRef.current === ticket.id) setMessagesLoading(false);
    }
    try {
      const { data: pinnedData } = await fetchPinnedMessages(ticket.id);
      const now = new Date();
      const fromApi = (pinnedData?.messages ?? []).filter((p) => {
        const expiry = p.pinnedExpiry ? new Date(p.pinnedExpiry) : null;
        return !expiry || expiry > now;
      });
      // Também extrair fixadas que vieram no batch de mensagens normais
      const fromMsgs = loadedMsgs.filter((m) => {
        if (!m.isPinned) return false;
        const expiry = m.pinnedExpiry ? new Date(m.pinnedExpiry) : null;
        return !expiry || expiry > now;
      });
      // Mesclar, deduplificando por id (API tem prioridade para dados mais recentes)
      const seen = new Set<string>(fromApi.map((p) => p.id));
      const merged = [...fromApi, ...fromMsgs.filter((m) => !seen.has(m.id))];
      setPinnedMessages(merged);
    } catch {
      // fallback: usar só o que veio no batch normal
      const now = new Date();
      const fromMsgs = loadedMsgs.filter((m) => {
        if (!m.isPinned) return false;
        const expiry = m.pinnedExpiry ? new Date(m.pinnedExpiry) : null;
        return !expiry || expiry > now;
      });
      setPinnedMessages(fromMsgs);
    }
  };
  // Mirror p/ o listener global de atalhos (Alt+↑/↓) — atualizado a cada render.
  handleSelectTicketRef.current = handleSelectTicket;

  const handleLoadMore = async () => {
    if (!currentTicket || !hasMore) return;
    const nextPage = pageNumber + 1;
    setPageNumber(nextPage);
    try {
      const { data } = await fetchMessages(currentTicket.id, { pageNumber: nextPage });
      const msgs = data?.messages || [];
      const existingIds = new Set(messages.map((m) => m.id));
      const uniqueMsgs = msgs.filter((m: Message) => !existingIds.has(m.id));
      setMessages([...uniqueMsgs, ...messages]);
      setHasMore(data?.hasMore ?? msgs.length >= 20);
    } catch {
      toast.error(t("errorLoadingMoreMessages"));
    }
  };

  // Ref para o scroll container do chat (usado para highlight na busca)
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [searching, setSearching] = useState(false);

  // Navegação da busca: lembra o termo e a última ocorrência destacada para
  // permitir andar entre as ocorrências (▲ mais antiga / ▼ mais recente).
  const searchNavRef = useRef<{ term: string; lastId: string | null }>({ term: "", lastId: null });
  const [searchNav, setSearchNav] = useState<SearchNavState | null>(null);
  useEffect(() => {
    searchNavRef.current = { term: "", lastId: null };
    setSearchNav(null);
  }, [currentTicket?.id]);

  const handleSearchMessagesInHistory = useCallback(async (term: string, direction: "older" | "newer" = "older") => {
    if (!term.trim() || !currentTicket || searching) return;
    const lower = term.trim().toLowerCase();

    const highlightEl = (el: Element) => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-1");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-1"), 2500);
    };

    const matchesOf = (list: Message[]) => list.filter((m) => m.body?.toLowerCase().includes(lower));

    // Destaca a ocorrência e atualiza o contador (current 1 = mais recente)
    const goTo = (msg: Message, list: Message[], moreOlder: boolean, delayMs = 0) => {
      searchNavRef.current = { term: lower, lastId: msg.id };
      const ids = matchesOf(list).map((m) => m.id);
      const idx = ids.indexOf(msg.id);
      setSearchNav({ term: lower, current: ids.length - idx, total: ids.length, hasMoreOlder: moreOlder });
      const run = () => {
        const container = document.querySelector("[data-chat-scroll]");
        const el = container?.querySelector(`[data-msg-id="${msg.id}"]`);
        if (el) highlightEl(el);
      };
      if (delayMs) setTimeout(run, delayMs);
      else requestAnimationFrame(run);
    };

    const sameTerm = searchNavRef.current.term === lower && !!searchNavRef.current.lastId;
    const matches = matchesOf(messages); // ordem: mais antiga → mais recente

    // 1. Navegar entre as ocorrências em memória
    if (sameTerm) {
      const idx = matches.findIndex((m) => m.id === searchNavRef.current.lastId);
      if (idx === -1) {
        // ocorrência anterior sumiu (ex.: mensagem apagada) — recomeça da mais recente
        if (matches.length) { goTo(matches[matches.length - 1], messages, hasMore); return; }
      } else if (direction === "newer") {
        if (idx + 1 < matches.length) goTo(matches[idx + 1], messages, hasMore);
        else toast.info(t("searchNoNewerMatches"));
        return;
      } else if (idx > 0) {
        goTo(matches[idx - 1], messages, hasMore);
        return;
      }
      // direction "older" já na ocorrência mais antiga em memória → paginar histórico
    } else if (matches.length) {
      // termo novo — começa da ocorrência mais recente
      goTo(matches[matches.length - 1], messages, hasMore);
      return;
    }

    // 2. Sem (mais) ocorrências em memória — carregar páginas anteriores até encontrar
    if (!hasMore) {
      toast.info(sameTerm ? t("searchNoOlderMatches") : t("noMessagesFound"));
      return;
    }

    setSearching(true);

    let localPage = pageNumber;
    let localHasMore: boolean = hasMore;
    let allMsgs = [...messages];
    let found: Message | undefined;
    let attempts = 0;
    const MAX_ATTEMPTS = 50;

    while (!found && localHasMore && attempts < MAX_ATTEMPTS) {
      attempts++;
      localPage++;
      try {
        const { data } = await fetchMessages(currentTicket.id, { pageNumber: localPage, markAsRead: false });
        const newMsgs: Message[] = data?.messages || [];
        if (newMsgs.length === 0) {
          localHasMore = false;
          break;
        }
        const existingIds = new Set(allMsgs.map((m) => m.id));
        const uniqueMsgs = newMsgs.filter((m) => !existingIds.has(m.id));
        allMsgs = [...uniqueMsgs, ...allMsgs];
        localHasMore = data?.hasMore ?? newMsgs.length >= 20;
        // andando do presente para o passado: pega a ocorrência mais RECENTE da página
        found = [...uniqueMsgs].reverse().find((m) => m.body?.toLowerCase().includes(lower));
      } catch {
        break;
      }
    }

    // Atualizar estado com todas as mensagens carregadas
    setMessages(allMsgs);
    setPageNumber(localPage);
    setHasMore(localHasMore);
    setSearching(false);

    if (found) {
      // Aguardar renderização e scroll
      goTo(found, allMsgs, localHasMore, 400);
    } else {
      setSearchNav((prev) => (prev && prev.term === lower ? { ...prev, hasMoreOlder: false } : prev));
      toast.info(sameTerm ? t("searchNoOlderMatches") : t("noMessagesFound"));
    }
  }, [currentTicket, messages, pageNumber, hasMore, searching, t]);

  // Busca uma mensagem por id. Se não estiver no DOM, carrega histórico
  // (paginação) até encontrá-la, depois dá scroll + highlight. Usado
  // quando o usuário clica em uma mensagem citada antiga.
  const handleScrollToMessageInHistory = useCallback(async (msgId: string) => {
    if (!currentTicket || !msgId) return;

    const highlightEl = (el: Element) => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("msg-highlight");
      setTimeout(() => el.classList.remove("msg-highlight"), 1800);
    };

    // 1. Tenta no DOM (mensagem já renderizada)
    const container = document.querySelector("[data-chat-scroll]");
    const elInDom = container?.querySelector(`[data-msg-id="${msgId}"]`) ?? document.querySelector(`[data-msg-id="${msgId}"]`);
    if (elInDom) {
      highlightEl(elInDom);
      return;
    }

    // 2. Tenta no estado em memória (renderização ainda não ocorreu)
    const inMem = messages.find((m) => m.id === msgId);
    if (inMem) {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (el) highlightEl(el);
      });
      return;
    }

    // 3. Não está em memória — paginar histórico até encontrar
    if (!hasMore) {
      toast.info(t("noMessagesFound"));
      return;
    }
    if (searching) return;

    setSearching(true);
    const loadingToast = toast.loading(t("loading"));

    let localPage = pageNumber;
    let localHasMore: boolean = hasMore;
    let allMsgs = [...messages];
    let found = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 50;

    while (!found && localHasMore && attempts < MAX_ATTEMPTS) {
      attempts++;
      localPage++;
      try {
        const { data } = await fetchMessages(currentTicket.id, { pageNumber: localPage, markAsRead: false });
        const newMsgs: Message[] = data?.messages || [];
        if (newMsgs.length === 0) {
          localHasMore = false;
          break;
        }
        const existingIds = new Set(allMsgs.map((m) => m.id));
        const uniqueMsgs = newMsgs.filter((m) => !existingIds.has(m.id));
        allMsgs = [...uniqueMsgs, ...allMsgs];
        localHasMore = data?.hasMore ?? newMsgs.length >= 20;
        if (uniqueMsgs.some((m) => m.id === msgId)) found = true;
      } catch {
        break;
      }
    }

    setMessages(allMsgs);
    setPageNumber(localPage);
    setHasMore(localHasMore);
    setSearching(false);
    toast.dismiss(loadingToast);

    if (found) {
      setTimeout(() => {
        const el = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (el) highlightEl(el);
      }, 400);
    } else {
      toast.info(t("noMessagesFound"));
    }
  }, [currentTicket, messages, pageNumber, hasMore, searching, t]);

  // Listener global: QuotedMessageBlock dispara este evento quando o usuário
  // clica numa mensagem citada que não está renderizada na tela.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) handleScrollToMessageInHistory(detail.id);
    };
    window.addEventListener("chat:scroll-to-message", handler);
    return () => window.removeEventListener("chat:scroll-to-message", handler);
  }, [handleScrollToMessageInHistory]);

  // PA-15/PA-16: auto-análise de sentimento ao abrir um ticket.
  //  - Se nunca foi analisado: roda automático.
  //  - Se já tem análise mas cache (5min) venceu: pergunta antes de re-rodar
  //    (toast com ação) — não dispara IA sem confirmação.
  //  - Se cache fresco: nada a fazer (badge já reflete o último resultado).
  // Quando "frustrated", emite toast proativo com botão pra abrir o copilot.
  const runSentimentAnalysis = useCallback((tid: number) => {
    const urgencyStore = useUrgencyStore.getState();
    if (urgencyStore.isAnalyzing(tid)) return;
    urgencyStore.setAnalyzing(tid, true);
    const toastId = toast.loading(t("analyzingSentiment"), { description: t("analyzingSentimentDesc") });
    let cancelled = false;
    (async () => {
      try {
        const result = await analyzeSentiment(tid, { background: true });
        if (cancelled) { toast.dismiss(toastId); return; }
        useUrgencyStore.getState().setSentiment(tid, result.sentiment);
        updateTicketInStore({
          id: tid,
          sentiment: result.sentiment,
          sentimentSummary: result.summary,
          sentimentAnalyzedAt: new Date().toISOString(),
        });
        if (result.sentiment === "frustrated") {
          toast.warning(t("urgentDetected"), {
            id: toastId,
            description: result.summary || t("urgentDetectedDesc"),
            action: { label: t("openCopilot"), onClick: () => window.dispatchEvent(new CustomEvent("copilot:open")) },
            duration: 8000,
          });
        } else {
          toast.dismiss(toastId);
        }
      } catch (err) {
        toast.dismiss(toastId);
        const e = err as { response?: { status?: number; data?: { error?: string } } };
        if (e.response?.status !== 422) {
          process.env.NODE_ENV === "development" && console.warn("auto-sentiment failed:", err);
        }
      } finally {
        if (!cancelled) useUrgencyStore.getState().setAnalyzing(tid, false);
      }
    })();
    return () => { cancelled = true; toast.dismiss(toastId); };
  }, [t, updateTicketInStore]);

  useEffect(() => {
    if (!copilotAutoSentiment) return;
    // Plano sem IA: não dispara a análise automática (evita o toast de "analisando"
    // seguido de falha 402 a cada ticket aberto). Ação manual segue avisando normalmente.
    if (!useAuthStore.getState().hasFeature("aiIntegrations")) return;
    const tid = currentTicket?.id;
    if (!tid) return;
    // Aguarda os campos de sentimento chegarem do back. Sem essa guarda
    // tratamos "ainda não chegou" como "nunca analisado" e disparamos IA sem
    // perguntar (race entre setCurrentTicket e o fetch dos campos novos).
    const sentimentLoaded = currentTicket && "sentimentAnalyzedAt" in currentTicket;
    if (!sentimentLoaded) return;
    const urgencyStore = useUrgencyStore.getState();
    // Hidrata o store a partir do ticket persistido (badge sem re-análise).
    if (!urgencyStore.getSentiment(tid) && currentTicket?.sentiment) {
      const ts = currentTicket.sentimentAnalyzedAt
        ? new Date(currentTicket.sentimentAnalyzedAt).getTime()
        : Date.now();
      urgencyStore.setSentimentWithTimestamp(tid, currentTicket.sentiment, ts);
    }
    const STALE_MS = 5 * 60 * 1000;
    const persistedAt = currentTicket?.sentimentAnalyzedAt
      ? new Date(currentTicket.sentimentAnalyzedAt).getTime()
      : 0;
    const persistedFresh = persistedAt > 0 && Date.now() - persistedAt <= STALE_MS;
    const memoryFresh = !urgencyStore.shouldReanalyze(tid);
    if (persistedFresh || memoryFresh) return;
    if (urgencyStore.isAnalyzing(tid)) return;
    const hasPrevious = !!currentTicket?.sentiment || !!urgencyStore.getSentiment(tid);
    if (hasPrevious) {
      // Já existe análise prévia mas cache venceu — não roda IA sem perguntar.
      toast.info(t("reanalyzePrompt"), {
        description: t("reanalyzePromptDesc"),
        action: { label: t("reanalyzeAction"), onClick: () => runSentimentAnalysis(tid) },
        duration: 10000,
      });
      return;
    }
    // Sem análise prévia → roda automaticamente.
    runSentimentAnalysis(tid);
  }, [currentTicket?.id, currentTicket?.sentiment, currentTicket?.sentimentAnalyzedAt, copilotAutoSentiment, t, runSentimentAnalysis]);

  // Pega o número canônico do contato do ticket diretamente do backend, com cache curto.
  // Retorna null se o fetch falhar — o caller decide se aborta o envio (paranoia) ou prossegue.
  // Cache hit dispensa round-trip; miss faz UM fetchTicket(ticketId) e armazena para os próximos sends.
  const getValidatedBaileysNumber = useCallback(async (ticketId: number): Promise<string | null> => {
    const cache = baileysSendNumberCacheRef.current;
    const cached = cache.get(ticketId);
    if (cached && (Date.now() - cached.ts) < BAILEYS_SEND_CACHE_TTL_MS) {
      return cached.number;
    }
    try {
      const { data } = await fetchTicket(ticketId);
      const fresh = (data as { contact?: { number?: string } } | undefined)?.contact?.number;
      if (!fresh) return null;
      cache.set(ticketId, { number: fresh, ts: Date.now() });
      return fresh;
    } catch {
      return null;
    }
  }, []);

  /**
   * Heal on-demand pro envio WABA: o currentTicket pode estar PARCIAL — setado
   * a partir do item da lista (que nao traz whatsapp.tokenAPI) quando o
   * fetchTicket de hidratacao do handleSelectTicket falhou. Em vez de abortar
   * com "wabaDataUnavailable" pedindo re-selecao manual, rebusca o detalhe e
   * aplica via updateTicket — que ja tem as defensivas de merge do store e SO
   * toca o currentTicket se o id ainda for o ativo (stale-safe por construcao).
   * Retorna tokenApi/number frescos pro envio prosseguir; null se nao curou.
   */
  const hydrateWabaSendData = async (ticketId: number): Promise<{ tokenApi?: string; contactNumber?: string } | null> => {
    try {
      const { data } = await fetchTicket(ticketId);
      if (!data) return null;
      const fresh = normalizeTicket(data as Record<string, unknown>);
      // Preserva tags otimistas (ticket e contato) — mesmo cuidado do
      // refreshCurrentTicket: o detalhe pode voltar sem tags e o spread do
      // updateTicket as apagaria ate o proximo refresh.
      const st = useTicketStore.getState();
      const prev = st.currentTicket?.id === ticketId
        ? st.currentTicket
        : st.tickets.find((tk) => tk.id === ticketId);
      let healed = !fresh.tags?.length && prev?.tags?.length ? { ...fresh, tags: prev.tags } : fresh;
      if (!fresh.contact?.tags?.length && prev?.contact?.tags?.length) {
        healed = { ...healed, contact: { ...healed.contact, tags: prev.contact.tags } };
      }
      // O atendente esta com o ticket aberto enviando — nao ressuscitar badge.
      updateTicketInStore({ ...healed, unreadMessages: 0 });
      const whatsapp = fresh.whatsapp as { tokenAPI?: string; token_api?: string } | undefined;
      return {
        tokenApi: whatsapp?.tokenAPI ?? whatsapp?.token_api,
        contactNumber: fresh.contact?.number || undefined,
      };
    } catch {
      return null;
    }
  };

  const handleSendText = async (text: string, quotedMsg?: Message, opts?: { forceLinked?: boolean }) => {
    // Snapshot do ticket no momento do disparo. Toda a funcao usa `ticket.*`,
    // nao `currentTicket.*`, pra garantir que callbacks/closures concorrentes
    // nao desviem o destino entre o addMessage otimista e a chamada de envio.
    const ticket = currentTicket;
    if (!ticket) return;
    // Live-check: a UI deve estar mostrando o mesmo ticket que disparou este send.
    // Se o usuario ja mudou de ticket (clique em outro item, socket auto-switch, etc.),
    // o envio e abortado — evita "respondi A mas foi pra B".
    const live = useTicketStore.getState().currentTicket;
    if (!live || live.id !== ticket.id) {
      toast.warning(t("ticketChangedAbort"));
      return;
    }
    const ch = (ticket.channel || "").toLowerCase();
    if (ch === "webmail" || ch === "hub_email") {
      toast.info(t("useEmailButton"));
      return;
    }
    const idFront = `front-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addMessage({
      id: idFront,
      stableKey: idFront,
      body: text,
      read: true,
      fromMe: true,
      // ACK honesto: nasce 0 (relógio "enviando"); flip para 1 só após o HTTP confirmar
      ack: 0,
      createdAt: new Date().toISOString(),
      mediaType: "chat",
      ...(quotedMsg ? { quotedMsg } : {}),
    });
    try {
      if (ch === "waba") {
        const whatsapp = (ticket as { whatsapp?: { tokenAPI?: string; token_api?: string } }).whatsapp;
        let tokenApi = whatsapp?.tokenAPI ?? (whatsapp as { token_api?: string })?.token_api;
        let contactNumber: string | undefined = ticket.contact?.number;
        if (!tokenApi || !contactNumber) {
          // Ticket parcial (item da lista sem whatsapp.tokenAPI; a hidratacao do
          // handleSelectTicket falhou) — heal on-demand em vez de abortar pedindo
          // re-selecao manual. Vide hydrateWabaSendData.
          const freshData = await hydrateWabaSendData(ticket.id);
          tokenApi = tokenApi || freshData?.tokenApi;
          contactNumber = contactNumber || freshData?.contactNumber;
        }
        if (!tokenApi || !contactNumber) {
          // Remove a bolha otimista (addMessage acima) — sem isto ela fica orfa na
          // tela sem marcar falha, fazendo o atendente achar que enviou.
          setMessages(useTicketStore.getState().messages.filter((m: Message) => m.id !== idFront));
          toast.error(t("wabaDataUnavailable"));
          return;
        }
        const payload: Record<string, unknown> = {
          read: 1, fromMe: true, mediaUrl: "", body: text,
          from: contactNumber, tokenApi, ticketId: ticket.id, idFront,
        };
        if (quotedMsg) payload.quotedMsg = quotedMsg;
        // Janela 24h fechada + modo híbrido: força o envio pela conexão vinculada.
        if (opts?.forceLinked) payload.forceLinked = true;
        retryExecRef.current.set(idFront, { exec: () => sendTextWaba(payload), kind: "text" });
        await sendTextWaba(payload);
      } else if (ch === "whatsapp" || ch === "baileys" || ch === "zapo") {
        // Baileys/WhatsApp/Zapo: usa endpoint /noRedis (sem fila Redis).
        // Defesa anti-cross-recipient: confirma com o backend que o número do snapshot ainda
        // corresponde ao contato real do ticket. Cache de 60s evita round-trip por send.
        // Grupos: o "número" é o GroupId (sem @g.us no banco) — também validado.
        const validated = await getValidatedBaileysNumber(ticket.id);
        if (!validated) {
          setMessages(useTicketStore.getState().messages.filter((m: Message) => m.id !== idFront));
          toast.error(t("errorSendingMessage"));
          return;
        }
        if (validated !== ticket.contact?.number) {
          setMessages(useTicketStore.getState().messages.filter((m: Message) => m.id !== idFront));
          toast.warning(t("recipientMismatchAbort"));
          return;
        }
        const tc = ticket as unknown as Record<string, unknown>;
        const msgPayload: Record<string, unknown> = {
          body: text, read: 1, fromMe: true, mediaUrl: "",
          sendType: "chat", scheduleDate: null, idFront,
        };
        if (quotedMsg) msgPayload.quotedMsg = quotedMsg;
        const noRedisPayload = {
          whatsappId: tc.whatsappId ?? ticket.whatsapp?.id,
          whatsappType: ticket.channel,
          number: validated,
          message: msgPayload,
          sticker: false,
          voice: false,
          ticket,
          group: !!(tc.isGroup),
          quotedMsg: quotedMsg ?? null,
        };
        retryExecRef.current.set(idFront, { exec: () => sendNoRedis(noRedisPayload), kind: "text" });
        await sendNoRedis(noRedisPayload);
      } else if (ch === "gupshup") {
        // Gupshup: chama direto o BSP endpoint (não usa fila /messages/:ticketId).
        // Service spread req.body — manda from, message, ticketId, whatsappId, idFront.
        const whatsapp = (ticket as { whatsapp?: { id?: number; tokenAPI?: string } }).whatsapp;
        const payload: Record<string, unknown> = {
          from: ticket.contact?.number,
          message: text,
          ticketId: ticket.id,
          whatsappId: whatsapp?.id,
          tokenApi: whatsapp?.tokenAPI,
          idFront,
          fromMe: true,
          read: 1,
        };
        if (quotedMsg) payload.quotedMsg = quotedMsg;
        retryExecRef.current.set(idFront, { exec: () => sendGupshupText(payload), kind: "text" });
        await sendGupshupText(payload);
      } else if (ch === "dialog360") {
        const whatsapp = (ticket as { whatsapp?: { id?: number; tokenAPI?: string } }).whatsapp;
        const payload: Record<string, unknown> = {
          body: text,
          ticketId: ticket.id,
          whatsappId: whatsapp?.id,
          tokenApi: whatsapp?.tokenAPI,
          idFront,
          fromMe: true,
          read: 1,
        };
        if (quotedMsg) payload.quotedMsg = quotedMsg;
        retryExecRef.current.set(idFront, { exec: () => sendDialog360Text(payload), kind: "text" });
        await sendDialog360Text(payload);
      } else {
        const payload: Record<string, unknown> = {
          body: text, read: 1, fromMe: true, mediaUrl: "",
          sendType: "chat", scheduleDate: null, idFront,
        };
        if (quotedMsg) payload.quotedMsg = quotedMsg;
        retryExecRef.current.set(idFront, { exec: () => sendMessageApi(ticket.id, payload, { channel: ticket.channel }), kind: "text" });
        await sendMessageApi(ticket.id, payload, { channel: ticket.channel });
      }
      // HTTP confirmado: flip da bolha otimista para ack 1 (enviado). Guard
      // ack === 0 — se o socket já substituiu a bolha (merge coage ack 0 →
      // undefined/valor real), não sobrescreve o ack verdadeiro.
      setMessages(useTicketStore.getState().messages.map((m: Message) =>
        m.id === idFront && m.ack === 0 ? { ...m, ack: 1 } : m
      ));
      retryExecRef.current.delete(idFront);
    } catch (sendErr: any) {
      // Falha de envio NÃO apaga a bolha: marca ack -1 (ícone de erro) — o
      // atendente vê o que digitou e pode copiar pelo action do toast.
      setMessages(useTicketStore.getState().messages.map((m: Message) =>
        m.id === idFront ? { ...m, ack: -1 } : m
      ));
      // Bookkeeping do retry: hadResponse distingue erro do servidor (retry direto)
      // de timeout/rede (verificar entrega antes de reenviar); a bolha falhada é
      // guardada por ticket p/ sobreviver à re-seleção (dedupe por id).
      const retryEntry = retryExecRef.current.get(idFront);
      if (retryEntry) retryEntry.hadResponse = !!sendErr?.response;
      const failedMsg = useTicketStore.getState().messages.find((m: Message) => m.id === idFront);
      if (failedMsg) {
        const failedList = failedByTicketRef.current.get(ticket.id) ?? [];
        failedByTicketRef.current.set(ticket.id, [...failedList.filter((m) => m.id !== idFront), failedMsg]);
      }
      // Guard de acesso do backend (403 ERR_NO_TICKET_ACCESS): ticket de fila alheia —
      // fecha a conversa, remove o card e avisa (uniforme em todos os envios).
      if (handleTicketAccessDenied(sendErr, ticket.id, t("noTicketAccess"))) return;
      const copyAction = text
        ? { action: { label: tBubble("copyText"), onClick: () => { navigator.clipboard.writeText(text); } } }
        : undefined;
      const errCode = String(sendErr?.response?.data?.error || sendErr?.data?.error || "");
      if (errCode.startsWith("ERR_NUMBER_RESOLVED_MISMATCH")) {
        toast.error(tErrors("numberResolvedMismatch"), copyAction);
      } else if (errCode === "ERR_INSTAGRAM_THREAD_NOT_OWNED") {
        toast.error(t("errInstagramThreadNotOwned"), copyAction);
      } else if (errCode === "ERR_ML_NO_REPLY_CONTEXT") {
        toast.error(t("errMlNoReplyContext"), copyAction);
      } else if (errCode === "ERR_ML_SEND_FAILED") {
        toast.error(t("errMlSendFailed"), copyAction);
      } else if (["ERR_OLX_SEND_FAILED", "ERR_LINKEDIN_SEND_FAILED", "ERR_YOUTUBE_SEND_FAILED"].includes(errCode)) {
        toast.error(t("errChannelSendFailed"), copyAction);
      } else {
        toast.error(t("errorSendingMessage"), copyAction);
      }
    }
  };

  const handleSendMedia = async (file: File, caption: string, quotedMsg?: Message, isSticker?: boolean) => {
    // Snapshot — vide handleSendText (mesma protecao contra envio cruzado).
    const ticket = currentTicket;
    if (!ticket) return;
    const live = useTicketStore.getState().currentTicket;
    if (!live || live.id !== ticket.id) {
      toast.warning(t("ticketChangedAbort"));
      return;
    }
    const ch = (ticket.channel || "").toLowerCase();
    if (ch === "webmail" || ch === "hub_email") {
      toast.info(t("useEmailButtonAttachment"));
      return;
    }
    const mimePrefix = file.type.split("/")[0];
    // Instagram nao suporta documentos (job SendInstagramMessages skipa mediaType=application).
    // Bloquear no front evita Message orfa pendente no DB.
    if (ch === "instagram" && !isSticker && !["image", "video", "audio"].includes(mimePrefix)) {
      toast.error(t("instagramDocNotAllowed"));
      return;
    }
    const idFront = `front-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const mediaType = isSticker ? "sticker" : (mimePrefix === "image" ? "image" : mimePrefix === "video" ? "video" : mimePrefix === "audio" ? "audio" : "document");
    const blobUrl = URL.createObjectURL(file);
    addMessage({
      id: idFront,
      stableKey: idFront,
      body: caption || file.name,
      read: true,
      fromMe: true,
      // ACK honesto: nasce 0 (relógio "enviando"); flip para 1 só após o HTTP confirmar
      ack: 0,
      createdAt: new Date().toISOString(),
      mediaUrl: blobUrl,
      mediaType,
      fileName: file.name,
      ...(quotedMsg ? { quotedMsg } : {}),
    });
    // Progresso de upload na bolha otimista: throttle de ≥5 pontos (ou 100) p/ não
    // re-renderizar a lista a cada chunk. e.total pode ser undefined → não seta.
    const onUploadProgress = (e: AxiosProgressEvent) => {
      if (!e.total) return;
      const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
      const prev = uploadPctRef.current.get(idFront) ?? -1;
      if (pct === prev || (pct < 100 && pct - prev < 5)) return;
      uploadPctRef.current.set(idFront, pct);
      setMessages(useTicketStore.getState().messages.map((m: Message) =>
        m.id === idFront ? { ...m, uploadProgress: pct } : m
      ));
    };
    try {
      // Transliteracao de acento + garantia de basename (vide normalizeUploadFilename):
      // o strip antigo APAGAVA acento e podia deixar so a extensao, virando dotfile no
      // multer — que o express.static recusa com 403. `body` segue com o nome original.
      const normalizedName = normalizeUploadFilename(file.name);
      if (ch === "waba") {
        const whatsapp = (ticket as { whatsapp?: { tokenAPI?: string; token_api?: string } }).whatsapp;
        let tokenApi = whatsapp?.tokenAPI ?? (whatsapp as { token_api?: string })?.token_api;
        let contactNumber: string | undefined = ticket.contact?.number;
        if (!tokenApi || !contactNumber) {
          // Ticket parcial — mesmo heal on-demand do handleSendText.
          const freshData = await hydrateWabaSendData(ticket.id);
          tokenApi = tokenApi || freshData?.tokenApi;
          contactNumber = contactNumber || freshData?.contactNumber;
        }
        if (!tokenApi || !contactNumber) {
          // Remove a bolha otimista e libera o blob — sem isto a previa fica orfa
          // na tela sem marcar falha (vide handleSendText).
          URL.revokeObjectURL(blobUrl);
          setMessages(useTicketStore.getState().messages.filter((m: Message) => m.id !== idFront));
          toast.error(t("wabaDataUnavailable"));
          return;
        }
        const fd = new FormData();
        fd.append("medias", file, normalizedName);
        fd.append("body", file.name);
        fd.append("fromMe", "true");
        fd.append("idFront", idFront);
        fd.append("tokenApi", tokenApi);
        fd.append("from", contactNumber);
        fd.append("ticketId", String(ticket.id));
        if (caption) fd.append("caption", caption);
        if (quotedMsg) fd.append("quotedMsg", JSON.stringify(quotedMsg));
        // Figurinha (image/webp) tem endpoint dedicado /wabametaSticker —
        // /wabametaFile so aceita image/jpeg|png + audio/video/doc.
        if (isSticker) {
          retryExecRef.current.set(idFront, { exec: () => sendStickerWaba(fd), kind: "media" });
          await sendStickerWaba(fd);
        } else {
          retryExecRef.current.set(idFront, { exec: () => sendMediaWaba(fd, { onUploadProgress }), kind: "media" });
          await sendMediaWaba(fd, { onUploadProgress });
        }
      } else if (ch === "whatsapp" || ch === "baileys" || ch === "zapo") {
        // Baileys/WhatsApp/Zapo: usa /noRedis com FormData. Mesma defesa anti-cross-recipient
        // do handleSendText (vide comentário lá).
        // IMPORTANT: backend verifica literalmente message === 'null' para saber que é mídia
        const validated = await getValidatedBaileysNumber(ticket.id);
        if (!validated) {
          URL.revokeObjectURL(blobUrl);
          setMessages(useTicketStore.getState().messages.filter((m: Message) => m.id !== idFront));
          toast.error(t("errorSendingMedia"));
          return;
        }
        if (validated !== ticket.contact?.number) {
          URL.revokeObjectURL(blobUrl);
          setMessages(useTicketStore.getState().messages.filter((m: Message) => m.id !== idFront));
          toast.warning(t("recipientMismatchAbort"));
          return;
        }
        const tc = ticket as unknown as Record<string, unknown>;
        const fd = new FormData();
        fd.append("fromMe", "true");
        fd.append("medias", file, normalizedName);
        fd.append("body", file.name);
        fd.append("idFront", idFront);
        fd.append("isSticker", isSticker ? "true" : "false");
        fd.append("whatsappId", String(tc.whatsappId ?? ticket.whatsapp?.id ?? ""));
        fd.append("whatsappType", ticket.channel || "");
        fd.append("number", validated);
        fd.append("message", "null"); // backend checks: message === 'null' to process media
        fd.append("file", "true");
        fd.append("voice", "false");
        fd.append("group", String(!!(tc.isGroup)));
        fd.append("ticket", JSON.stringify(ticket));
        if (caption) fd.append("caption", caption);
        if (quotedMsg) fd.append("quotedMsg", JSON.stringify(quotedMsg));
        retryExecRef.current.set(idFront, { exec: () => sendNoRedis(fd, { onUploadProgress }), kind: "media" });
        await sendNoRedis(fd, { onUploadProgress });
      } else if (ch === "gupshup" || ch === "dialog360") {
        // BSPs (Gupshup / Dialog360): rota dedicada por tipo de mídia. FormData
        // com `file` + ticketId + whatsappId. Backend sobe pro filemanager
        // do BSP e envia via API V3/Cloud passthrough.
        const whatsapp = (ticket as { whatsapp?: { id?: number; tokenAPI?: string } }).whatsapp;
        const fd = new FormData();
        fd.append("file", file, normalizedName);
        fd.append("ticketId", String(ticket.id));
        fd.append("whatsappId", String(whatsapp?.id ?? ""));
        if (whatsapp?.tokenAPI) fd.append("tokenApi", whatsapp.tokenAPI);
        if (caption) fd.append("caption", caption);
        fd.append("idFront", idFront);
        // fromMe: sem isso a Message persistida pelo backend fica fromMe=false
        // e o front renderiza como incoming. Espelha o pattern WABA/Baileys.
        fd.append("fromMe", "true");
        fd.append("read", "1");
        if (quotedMsg) fd.append("quotedMsg", JSON.stringify(quotedMsg));
        const senderMap = ch === "gupshup"
          ? { image: sendGupshupImage, video: sendGupshupVideo, audio: sendGupshupAudio, document: sendGupshupDocument, sticker: sendGupshupSticker }
          : { image: sendDialog360Image, video: sendDialog360Video, audio: sendDialog360Audio, document: sendDialog360Doc, sticker: sendDialog360Sticker };
        const fn = senderMap[mediaType as keyof typeof senderMap] || senderMap.document;
        retryExecRef.current.set(idFront, { exec: () => fn(fd), kind: "media" });
        await fn(fd);
      } else {
        const fd = new FormData();
        fd.append("medias", file, normalizedName);
        fd.append("body", file.name);
        fd.append("caption", caption || "");
        fd.append("read", "1");
        fd.append("fromMe", "true");
        fd.append("mediaUrl", "");
        fd.append("sendType", "chat");
        fd.append("idFront", idFront);
        // Figurinha em uazapi/zapi/evo/etc: precisa explicitar isSticker pro backend
        // setar payload.type='sticker' na chamada da API do canal. Sem isso o backend
        // detecta mime image/webp e manda como foto normal.
        fd.append("isSticker", isSticker ? "true" : "false");
        if (quotedMsg) fd.append("quotedMsg", String(quotedMsg.id ?? ""));
        retryExecRef.current.set(idFront, { exec: () => sendMessageApi(ticket.id, fd, { channel: ticket.channel, onUploadProgress }), kind: "media" });
        await sendMessageApi(ticket.id, fd, { channel: ticket.channel, onUploadProgress });
      }
      // HTTP confirmado: flip da bolha otimista para ack 1 (enviado) e limpeza do
      // progresso de upload. Guard ack === 0 — não sobrescreve se o socket já
      // trouxe o ack real (mas o uploadProgress é limpo de qualquer forma).
      setMessages(useTicketStore.getState().messages.map((m: Message) =>
        m.id === idFront ? { ...m, ...(m.ack === 0 ? { ack: 1 } : {}), uploadProgress: undefined } : m
      ));
      retryExecRef.current.delete(idFront);
      uploadPctRef.current.delete(idFront);
    } catch (sendErr: any) {
      // Falha de envio NÃO apaga a bolha: marca ack -1 (ícone de erro). NÃO
      // revogar o blobUrl — a prévia da bolha falhada ainda depende dele.
      setMessages(useTicketStore.getState().messages.map((m: Message) =>
        m.id === idFront ? { ...m, ack: -1, uploadProgress: undefined } : m
      ));
      uploadPctRef.current.delete(idFront);
      // Bookkeeping do retry — vide handleSendText (mesma lógica).
      const retryEntry = retryExecRef.current.get(idFront);
      if (retryEntry) retryEntry.hadResponse = !!sendErr?.response;
      const failedMsg = useTicketStore.getState().messages.find((m: Message) => m.id === idFront);
      if (failedMsg) {
        const failedList = failedByTicketRef.current.get(ticket.id) ?? [];
        failedByTicketRef.current.set(ticket.id, [...failedList.filter((m) => m.id !== idFront), failedMsg]);
      }
      if (handleTicketAccessDenied(sendErr, ticket.id, t("noTicketAccess"))) return;
      const copyAction = caption
        ? { action: { label: tBubble("copyText"), onClick: () => { navigator.clipboard.writeText(caption); } } }
        : undefined;
      const errCode = String(sendErr?.response?.data?.error || sendErr?.data?.error || "");
      if (errCode.startsWith("ERR_NUMBER_RESOLVED_MISMATCH")) {
        toast.error(tErrors("numberResolvedMismatch"), copyAction);
      } else if (errCode === "ERR_ML_MEDIA_ON_QUESTION") {
        toast.error(t("errMlMediaOnQuestion"), copyAction);
      } else if (errCode === "ERR_ML_NO_REPLY_CONTEXT") {
        toast.error(t("errMlNoReplyContext"), copyAction);
      } else if (errCode === "ERR_ML_SEND_FAILED") {
        toast.error(t("errMlSendFailed"), copyAction);
      } else if (["ERR_OLX_SEND_FAILED", "ERR_LINKEDIN_SEND_FAILED", "ERR_YOUTUBE_SEND_FAILED"].includes(errCode)) {
        toast.error(t("errChannelSendFailed"), copyAction);
      } else {
        toast.error(t("errorSendingMedia"), copyAction);
      }
    }
  };

  /**
   * Retry de bolha falhada (ack -1). Reusa o MESMO idFront — a bolha nunca troca
   * de id, então o matcher por idFront do socket reconcilia o eco normalmente.
   * Falha original SEM response (timeout/rede — desfecho desconhecido): antes de
   * reenviar, confere na página 1 do histórico se já existe mensagem fromMe com o
   * mesmo body criada nos últimos ~10min (texto) — se sim, trata como JÁ ENTREGUE
   * (remove a bolha falhada em vez de duplicar o envio).
   */
  const handleRetryMessage = useCallback(async (msg: Message) => {
    const idFront = String(msg.id);
    const entry = retryExecRef.current.get(idFront);
    if (!entry) {
      toast.error(t("retryUnavailable"));
      return;
    }
    const ticketId = useTicketStore.getState().currentTicket?.id;
    if (!ticketId) return;
    const clearFailed = () => {
      retryExecRef.current.delete(idFront);
      uploadPctRef.current.delete(idFront);
      const list = failedByTicketRef.current.get(ticketId);
      if (list) failedByTicketRef.current.set(ticketId, list.filter((m) => m.id !== idFront));
    };
    if (!entry.hadResponse && entry.kind === "text") {
      try {
        const { data } = await fetchMessages(ticketId, { pageNumber: 1 });
        const recent: Message[] = data?.messages || [];
        const cutoff = Date.now() - 10 * 60 * 1000;
        const delivered = recent.some((m) =>
          m.fromMe &&
          !String(m.id).startsWith("front-") &&
          (m.body || "") === (msg.body || "") &&
          !!m.createdAt && new Date(m.createdAt).getTime() >= cutoff
        );
        if (delivered) {
          setMessages(useTicketStore.getState().messages.filter((m: Message) => m.id !== idFront));
          clearFailed();
          toast.info(t("alreadyDelivered"));
          return;
        }
      } catch { /* verificação falhou — segue para o reenvio normal */ }
    }
    // Bolha volta a "enviando" (ack 0) — mesmo id, o matcher do socket reconcilia.
    uploadPctRef.current.delete(idFront);
    setMessages(useTicketStore.getState().messages.map((m: Message) =>
      m.id === idFront ? { ...m, ack: 0 } : m
    ));
    try {
      await entry.exec();
      setMessages(useTicketStore.getState().messages.map((m: Message) =>
        m.id === idFront ? { ...m, ...(m.ack === 0 ? { ack: 1 } : {}), uploadProgress: undefined } : m
      ));
      clearFailed();
    } catch (err: any) {
      entry.hadResponse = !!err?.response;
      setMessages(useTicketStore.getState().messages.map((m: Message) =>
        m.id === idFront ? { ...m, ack: -1, uploadProgress: undefined } : m
      ));
      uploadPctRef.current.delete(idFront);
      const failedMsg = useTicketStore.getState().messages.find((m: Message) => m.id === idFront);
      if (failedMsg) {
        const list = failedByTicketRef.current.get(ticketId) ?? [];
        failedByTicketRef.current.set(ticketId, [...list.filter((m) => m.id !== idFront), failedMsg]);
      }
      toast.error(entry.kind === "media" ? t("errorSendingMedia") : t("errorSendingMessage"));
    }
  }, [t, setMessages]);

  const handleSendLocation = async (lat: number, lng: number, name?: string, address?: string) => {
    if (!currentTicket) return;
    const tid = currentTicket.id;
    try {
      await sendLocation(tid, { latitude: lat, longitude: lng, name, address });
    } catch (err) {
      if (handleTicketAccessDenied(err, tid, t("noTicketAccess"))) return;
      toast.error(t("errorSendingLocation"));
    }
  };

  const handleOpenEmailModal = useCallback(() => {
    const contactEmail = currentTicket?.contact?.email;
    setWebmailTo(contactEmail || "");
    // Pré-preenche subject como "Re: <último assunto>" para preservar thread SMTP.
    const replyInfo = buildEmailReplyInfo(useTicketStore.getState().messages);
    setWebmailSubject(replyInfo.subject || "");
    setWebmailBody("");
    setWebmailCc("");
    setWebmailBcc("");
    setWebmailFiles([]);
    setWebmailModalOpen(true);
  }, [currentTicket?.contact?.email]);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        resolve(base64 || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSendEmailWebmail = async () => {
    if (!currentTicket) return;
    const whatsappId = (currentTicket as { whatsappId?: number }).whatsappId ?? (currentTicket as { whatsapp?: { id: number } }).whatsapp?.id;
    if (!whatsappId) {
      toast.error(t("emailConnectionNotFound"));
      return;
    }
    if (!webmailTo.trim() || !webmailSubject.trim() || !webmailBody.trim()) {
      toast.error(t("fillEmailFields"));
      return;
    }
    setWebmailLoading(true);
    try {
      const cc = webmailCc.trim() ? webmailCc.split(",").map((e) => e.trim()).filter(Boolean) : undefined;
      const bcc = webmailBcc.trim() ? webmailBcc.split(",").map((e) => e.trim()).filter(Boolean) : undefined;
      const attachments =
        webmailFiles.length > 0
          ? await Promise.all(
              webmailFiles.map(async (file) => ({
                filename: file.name.replace(/\s+/g, "_"),
                content: await readFileAsBase64(file),
                contentType: file.type || undefined,
              }))
            )
          : undefined;
      // Headers de threading: usa o último email recebido para preencher In-Reply-To/References,
      // mantendo a conversa unificada no cliente do destinatário (Gmail, Outlook, etc).
      const replyInfo = buildEmailReplyInfo(useTicketStore.getState().messages);
      await sendEmailWebmail(whatsappId, {
        to: webmailTo.trim(),
        subject: webmailSubject.trim(),
        text: webmailBody.trim(),
        ticketId: currentTicket.id,
        ...(cc?.length && { cc }),
        ...(bcc?.length && { bcc }),
        ...(attachments?.length && { attachments }),
        ...(replyInfo.inReplyTo && { inReplyTo: replyInfo.inReplyTo }),
        ...(replyInfo.references && { references: replyInfo.references }),
      });
      toast.success(t("emailSent"));
      setWebmailModalOpen(false);
      setWebmailFiles([]);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ?? (e as Error).message ?? "Erro ao enviar e-mail";
      toast.error(String(msg));
    } finally {
      setWebmailLoading(false);
    }
  };

  const handleDeleteMessage = async (msg: Message) => {
    try {
      await deleteMessage({ id: msg.id, messageId: msg.messageId });
      // Reflect DB state: mark as deleted rather than removing from list
      updateMessage(msg.id, { isDeleted: true });
      toast.success(t("messageRemoved"));
    } catch {
      toast.error(t("errorRemovingMessage"));
    }
  };

  // O backend grava mediaName na coluna crua Message.mediaUrl (apenas a key/filename;
  // o getter do model prefixa /public/<tenant>/). Mandar a URL completa como fallback
  // duplica o prefixo no destino e a mídia sai 404 no canal (ex.: WABA 131053).
  const deriveForwardMediaName = (msg: Message): string | undefined => {
    if (msg.mediaName) return msg.mediaName;
    const src = msg.mediaUrl;
    if (!src) return undefined;
    if (!/^https?:\/\//i.test(src)) {
      // blob:/data: (preview otimista) não referenciam arquivo no servidor —
      // omite e deixa o backend resolver pela Message original no banco
      if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return undefined;
      return src;
    }
    let path = src.replace(/[?#].*$/, "");
    try {
      path = decodeURIComponent(path);
    } catch { /* filename com % literal — mantém */ }
    const match = path.match(/.*\/public\/\d+\/(.+)$/);
    return match?.[1] || path.split("/").pop() || undefined;
  };

  const buildForwardMsg = (msg: Message) => ({
    ...msg,
    mediaName: deriveForwardMediaName(msg),
    ticketId: msg.ticketId ?? currentTicket?.id,
    ticket: { channel: currentTicket?.channel ?? "" },
  });

  // ── Forward to contact (opens contact search modal) ──────────────────────
  const [forwardContactMsg, setForwardContactMsg] = useState<Message | null>(null);
  const [forwardContactSearch, setForwardContactSearch] = useState("");
  const [forwardContactList, setForwardContactList] = useState<{ id: number; name: string; number: string }[]>([]);
  const [forwardContactLoading, setForwardContactLoading] = useState(false);
  const [forwardContactSelected, setForwardContactSelected] = useState<Set<number>>(new Set());
  const [forwardContactMap, setForwardContactMap] = useState<Map<number, { id: number; name: string; number: string }>>(new Map());
  const [forwardContactSending, setForwardContactSending] = useState(false);

  const openForwardContact = (msg: Message) => {
    setForwardContactMsg(msg);
    setForwardContactSelected(new Set());
    setForwardContactMap(new Map());
    setForwardContactSearch("");
    setForwardContactList([]);
  };

  const toggleForwardContact = (c: { id: number; name: string; number: string }) => {
    setForwardContactSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
    setForwardContactMap((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  };

  const searchForwardContacts = async (q: string) => {
    setForwardContactSearch(q);
    setForwardContactLoading(true);
    try {
      const { data } = await fetchContacts({ searchParam: q, pageNumber: 1 });
      setForwardContactList((data?.contacts || []).slice(0, 20));
    } catch { setForwardContactList([]); }
    finally { setForwardContactLoading(false); }
  };

  const confirmForwardContact = async () => {
    if (!forwardContactMsg || forwardContactSelected.size === 0) return;
    const msgsToFwd = multiForwardSelected.length > 0 ? multiForwardSelected : [forwardContactMsg];
    setForwardContactSending(true);
    try {
      await Promise.all(
        Array.from(forwardContactSelected).map((contactId) => {
          const contact = forwardContactMap.get(contactId)!;
          return forwardMessage({
            messages: msgsToFwd.map((m) => buildForwardMsg(m) as Record<string, unknown>),
            contact: contact as unknown as Record<string, unknown>,
          });
        })
      );
      toast.success(t("messageForwarded"));
      setForwardContactMsg(null);
      setMultiForwardSelected([]);
      setMultiForwardActive(false);
    } catch {
      toast.error(t("errorForwardingMessage"));
    } finally {
      setForwardContactSending(false);
    }
  };

  const handleForwardMessage = (msg: Message) => openForwardContact(msg);

  // ── Multi-forward ─────────────────────────────────────────────────────────
  const [multiForwardActive, setMultiForwardActive] = useState(false);
  const [multiForwardSelected, setMultiForwardSelected] = useState<Message[]>([]);

  const toggleMultiForwardMsg = (msg: Message, checked: boolean) => {
    setMultiForwardSelected((prev) =>
      checked ? [...prev, msg] : prev.filter((m) => m.id !== msg.id)
    );
  };

  // Forward to private chat
  const [forwardPrivateMsg, setForwardPrivateMsg] = useState<Message | null>(null);
  const [forwardPrivateUsers, setForwardPrivateUsers] = useState<{ id: number; name: string }[]>([]);
  const [forwardPrivateSelectedUsers, setForwardPrivateSelectedUsers] = useState<Set<number>>(new Set());
  const [forwardPrivateSearch, setForwardPrivateSearch] = useState("");
  const [forwardPrivateLoading, setForwardPrivateLoading] = useState(false);

  const openForwardPrivate = async (msg: Message) => {
    setForwardPrivateMsg(msg);
    setForwardPrivateSelectedUsers(new Set());
    setForwardPrivateSearch("");
    setForwardPrivateLoading(true);
    try {
      const { data } = await fetchAllUsers();
      const myId = user?.userId;
      const list = (data?.users || []).filter((u: { id: number; profile?: string; inactive?: boolean }) => u.id !== myId && u.profile !== "superadmin" && !u.inactive);
      setForwardPrivateUsers(list);
    } catch {
      setForwardPrivateUsers([]);
    } finally {
      setForwardPrivateLoading(false);
    }
  };

  const confirmForwardPrivate = async () => {
    if (!forwardPrivateMsg || forwardPrivateSelectedUsers.size === 0) return;
    setForwardPrivateLoading(true);
    try {
      const myId = user?.userId;
      const date = new Date();
      const msg = forwardPrivateMsg;

      if (msg.mediaUrl && !msg.mediaUrl.includes("nullextension")) {
        // Fetch media blob once, then send to each selected user.
        // Prefer storageUrl (S3/R2 público) quando existir — evita 404 em deploy com keepLocalCopy=false.
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const sourceUrl = msg.storageUrl || msg.mediaUrl;
        const isExternalMedia = sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")
        let mediaPath = sourceUrl;
        try { mediaPath = new URL(sourceUrl).pathname; } catch { /* keep as-is */ }
        const fetchUrl = isExternalMedia ? sourceUrl : `${apiUrl}${mediaPath}`
        const resp = await fetch(fetchUrl, { credentials: isExternalMedia ? "omit" : "include" });
        const blob = resp.ok ? await resp.blob() : null;

        for (const receiverId of forwardPrivateSelectedUsers) {
          const headerText = currentTicket
            ? `📎 Mensagem encaminhada do Ticket #${currentTicket.id}\n👤 Contato: ${currentTicket.contact?.name || ""}`
            : "📎 Mensagem encaminhada";
          await sendPrivateMessage({
            text: headerText,
            timestamp: date.getTime(),
            receiverId,
            isGroup: false,
          });

          if (blob) {
            const fileName = msg.fileName || `arquivo_${Date.now()}`;
            const file = new File([blob], fileName, { type: blob.type });
            const fd = new FormData();
            fd.append("id", `${Date.now()}_media`);
            fd.append("medias", file);
            fd.append("text", msg.body || fileName);
            fd.append("read", "false");
            fd.append("isGroup", "false");
            fd.append("tenantId", String(user?.tenantId || ""));
            fd.append("receiverId", String(receiverId));
            fd.append("sender", String(myId || ""));
            fd.append("timestamp", String(date.getTime() + 1));
            await sendPrivateMessage(fd);
          }
        }
      } else {
        const bodyText = msg.body || "";
        const header = currentTicket
          ? `📎 Ticket #${currentTicket.id} — ${currentTicket.contact?.name || ""}\n`
          : "";
        for (const receiverId of forwardPrivateSelectedUsers) {
          await sendPrivateMessage({
            text: header + bodyText,
            timestamp: date.getTime(),
            receiverId,
            isGroup: false,
          });
        }
      }

      toast.success(t("messageForwarded"));
      setForwardPrivateMsg(null);
    } catch {
      toast.error(t("errorForwardingToPrivate"));
    } finally {
      setForwardPrivateLoading(false);
    }
  };

  // Forward to other channel
  const [forwardOtherChannelMsg, setForwardOtherChannelMsg] = useState<Message | null>(null);
  const [forwardOtherChannelWhatsappId, setForwardOtherChannelWhatsappId] = useState<string>("");

  const confirmForwardOtherChannel = async () => {
    if (!forwardOtherChannelMsg || !forwardOtherChannelWhatsappId || !currentTicket?.contact) return;
    // Find selected channel info to determine channel type
    const selectedWa = whatsappsList.find((w) => w.id === Number(forwardOtherChannelWhatsappId));
    const channelType = selectedWa?.type ?? (selectedWa as any)?.channel ?? currentTicket!.channel ?? "baileys";
    try {
      await forwardToOtherChannel({
        messages: [buildForwardMsg(forwardOtherChannelMsg) as Record<string, unknown>],
        contact: currentTicket.contact as unknown as Record<string, unknown>,
        channel: channelType,
        channelId: Number(forwardOtherChannelWhatsappId),
      });
      toast.success(t("messageForwardedToOtherChannel"));
      setForwardOtherChannelMsg(null);
    } catch {
      toast.error(t("errorForwardingToOtherChannel"));
    }
  };

  const handleReactMessage = async (msg: Message, emoji: string) => {
    const ch = currentTicket?.channel ?? "";
    const wa = currentTicket?.whatsapp as ({ tokenAPI?: string; fbPageId?: string } & Record<string, unknown>) | undefined;
    const ticketId = currentTicket?.id ?? msg.ticketId ?? 0;
    const messageId = msg.messageId ?? msg.id;
    try {
      if (ch === "waba") {
        await sendReactionWaba({
          read: 1, fromMe: true, quotedMsg: null,
          from: currentTicket?.contact?.number,
          tokenApi: wa?.tokenAPI,
          ticketId,
          idFront: crypto.randomUUID(),
          emojiReaction: emoji,
          messageId,
        });
      } else if (ch === "instagram") {
        await sendReactionInstagram({
          read: 1, fromMe: true, quotedMsg: null,
          from: currentTicket?.contact?.number,
          tokenApi: wa?.tokenAPI ?? wa?.fbPageId,
          ticketId,
          idFront: crypto.randomUUID(),
          emojiReaction: emoji,
          messageId,
        });
      } else if (ch === "messenger") {
        const contact = currentTicket?.contact as ({ messengerId?: string; number?: string } & Record<string, unknown>) | undefined;
        await sendReactionMessenger({
          read: 1, fromMe: true, quotedMsg: null,
          from: contact?.messengerId ?? contact?.number,
          tokenApi: wa?.tokenAPI ?? wa?.fbPageId,
          ticketId,
          idFront: crypto.randomUUID(),
          emojiReaction: emoji,
          messageId,
        });
      } else if (ch === "meow") {
        await sendReactionMeow(ticketId, { ticketId, reaction: emoji, messageId, whatsapp: currentTicket?.whatsapp });
      } else if (ch === "evo") {
        await sendReactionEvo(ticketId, { ticketId, reaction: emoji, messageId, whatsapp: currentTicket?.whatsapp });
      } else if (ch === "evogo") {
        await sendReactionEvoGo(ticketId, { ticketId, reaction: emoji, messageId, whatsapp: currentTicket?.whatsapp });
      } else if (ch === "uazapi") {
        await sendReactionUazapi(ticketId, { ticketId, reaction: emoji, messageId, whatsapp: currentTicket?.whatsapp });
      } else if (ch === "zapi") {
        await sendReactionZapi(ticketId, { ticketId, reaction: emoji, messageId, whatsapp: currentTicket?.whatsapp });
      } else if (ch === "dialog360") {
        await sendDialog360Reaction({
          read: 1, fromMe: true,
          from: currentTicket?.contact?.number,
          tokenApi: wa?.tokenAPI,
          whatsappId: (currentTicket?.whatsapp as { id?: number } | undefined)?.id,
          ticketId,
          idFront: crypto.randomUUID(),
          messageId,
          emoji,
        });
      } else if (ch === "gupshup") {
        await sendGupshupReaction({
          read: 1, fromMe: true,
          from: currentTicket?.contact?.number,
          tokenApi: wa?.tokenAPI,
          whatsappId: (currentTicket?.whatsapp as { id?: number } | undefined)?.id,
          ticketId,
          idFront: crypto.randomUUID(),
          messageId,
          emoji,
        });
      } else {
        await sendReaction({ messageId, ticketId, reaction: emoji });
      }
      // reactionFromMe = my reaction on a message; reaction = received reaction on my message
      // updateMessage (atomico, estado fresco do store) — NAO setMessages(messages.map(...))
      // com o snapshot do render: closure obsoleto fazia reagir numa msg sumir a reacao
      // anterior e ate dropar mensagens recem-chegadas por socket.
      updateMessage(msg.id, { reactionFromMe: emoji });
    } catch (err) {
      if (handleTicketAccessDenied(err, Number(ticketId), t("noTicketAccess"))) return;
      toast.error(t("errorReacting"));
    }
  };

  const handleEditMessage = async (msg: Message, newBody: string) => {
    const ch = currentTicket?.channel ?? "";
    const ticketId = currentTicket?.id ?? msg.ticketId ?? 0;
    const messageId = msg.messageId ?? msg.id;
    const isScheduled = !!msg.scheduleDate && msg.status !== "sended";
    try {
      if (isScheduled) {
        await updateScheduledMessageBody(Number(msg.id), newBody);
        updateMessage(msg.id, { body: newBody });
      } else if (ch === "meow") {
        await editMessageMeow(ticketId, { ticketId, newText: newBody, messageId, whatsapp: currentTicket?.whatsapp });
        updateMessage(msg.id, { edition: newBody, isEdited: true });
      } else if (ch === "evo") {
        await editMessageEvo(ticketId, { ticketId, newText: newBody, messageId, whatsapp: currentTicket?.whatsapp });
        updateMessage(msg.id, { edition: newBody, isEdited: true });
      } else if (ch === "evogo") {
        await editMessageEvoGo(ticketId, { ticketId, newText: newBody, messageId, whatsapp: currentTicket?.whatsapp });
        updateMessage(msg.id, { edition: newBody, isEdited: true });
      } else if (ch === "uazapi") {
        await editMessageUazapi(ticketId, { ticketId, newText: newBody, messageId, whatsapp: currentTicket?.whatsapp });
        updateMessage(msg.id, { edition: newBody, isEdited: true });
      } else if (ch === "zapi") {
        await editMessageZapi(ticketId, { ticketId, newText: newBody, messageId, whatsapp: currentTicket?.whatsapp });
        updateMessage(msg.id, { edition: newBody, isEdited: true });
      } else if (ch === "dialog360" || ch === "gupshup" || ch === "waba") {
        // Meta Cloud API nao suporta edicao outbound — apenas inbound (cliente
        // edita, recebemos via webhook). Salva so o registro local pra o
        // atendente ter referencia, mas o destinatario ve a msg original.
        await editMessage({ messageId, ticketId, body: msg.body, newBody });
        updateMessage(msg.id, { edition: newBody, isEdited: true });
        toast.warning(t("editLocalOnlyBspMeta"));
        return;
      } else {
        await editMessage({ messageId, ticketId, body: msg.body, newBody });
        updateMessage(msg.id, { edition: newBody, isEdited: true });
      }
      toast.success(t("messageEdited"));
    } catch (err) {
      if (handleTicketAccessDenied(err, Number(ticketId), t("noTicketAccess"))) return;
      toast.error(t("errorEditingMessage"));
    }
  };

  const handleStarMessage = async (msg: Message) => {
    try {
      await toggleStarMessage(msg.id);
      updateMessage(msg.id, { isStarred: !msg.isStarred });
    } catch {
      toast.error(t("errorStarMessage"));
    }
  };

  const handleOpenPinDialog = (msg: Message) => {
    if (msg.isPinned) {
      handleUnpinMessage(msg);
    } else {
      setPinDialogTarget(msg);
      setPinDialogOpen(true);
    }
  };

  const handlePinMessage = async (msg: Message, duration: PinDuration) => {
    try {
      await pinMessage(msg.id, duration);
      const updatedMsg = { ...msg, isPinned: true };
      updateMessage(msg.id, { isPinned: true });
      setPinnedMessages((prev) => prev.some((p) => p.id === msg.id) ? prev : [updatedMsg, ...prev]);
    } catch {
      toast.error(t("errorPinMessage"));
    }
  };

  const handleUnpinMessage = async (msg: Message) => {
    try {
      await unpinMessage(msg.id);
      updateMessage(msg.id, { isPinned: false, pinnedAt: null, pinnedExpiry: null });
      setPinnedMessages((prev) => prev.filter((p) => p.id !== msg.id));
    } catch {
      toast.error(t("errorUnpinMessage"));
    }
  };

  const handleTransfer = async (ticketId: number, queueId: number | null, userId?: number) => {
    const prev = tickets.find((tk) => tk.id === ticketId);
    updateTicketInStore({
      id: ticketId,
      ...(queueId ? { queue: { id: queueId, name: "", color: "" } } : {}),
      user: userId ? { id: userId, name: "" } : undefined,
      ...(userId ? {} : { status: "pending" as const }),
    });
    try {
      // isTransference: 1 sinaliza ao backend (UpdateTicketService) que é uma transferência —
      // dispara CreateLogTicketService(type="transfered"/"receivedTransfer") e a mensagem-divisória
      // via CreateMessageSystemService(sendType="transfer"). Sem essa flag, a transferência muda
      // queueId/userId mas não gera log nem o bubble visível no chat.
      const payload: Record<string, unknown> = { queueId: queueId ?? null, isTransference: 1 };
      if (userId) {
        payload.userId = userId;
      } else {
        payload.userId = null;
        payload.status = "pending";
      }
      await updateTicket(ticketId, payload);
      toast.success(t("ticketTransferred"));
      if (currentTicket?.id === ticketId) setCurrentTicket(null);
    } catch (err: unknown) {
      if (prev) updateTicketInStore({ id: ticketId, queue: prev.queue, user: prev.user, status: prev.status });
      // O interceptor (lib/api.ts) rejeita com error.response, entao o codigo vem
      // em err.data.error; alguns chamadores recebem o AxiosError cru
      // (err.response.data.error). Ler os dois shapes.
      const errorCode =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as { data?: { error?: string } })?.data?.error;
      if (errorCode === "ERR_QUEUE_INACTIVE") {
        toast.error(t("errorQueueInactive"));
      } else if (errorCode === "ERR_TRANSFER_NO_WHATSAPP_ACCESS") {
        toast.error(t("errorTransferNoWhatsappAccess"));
      } else {
        toast.error(t("errorTransferring"));
      }
    }
  };

  const handleHeaderTransfer = async (queueId: number | null, userId?: number) => {
    if (!currentTicket) return;
    await handleTransfer(currentTicket.id, queueId, userId);
  };

  const acceptTicketNow = async (ticket: Ticket) => {
    try {
      await updateTicket(ticket.id, { status: "open", userId: user?.userId });
      toast.success(t("ticketAccepted", { id: ticket.id }));
      const openTicket = { ...ticket, status: "open" as const };
      setStatusFilter("open");
      selectionRef.current = ticket.id;
      setCurrentTicket(openTicket);
      // O card da lista nao traz whatsapp.tokenAPI (ListTicketsService devolve so
      // {id,name}) e aqui so buscavamos as mensagens — aceitar pelo card deixava o
      // ticket aberto sem token, e os envios WABA (template/botoes/lista) abortavam
      // com "wabaTokenNotFound" ate re-clicar o ticket. Re-hidrata via
      // ShowTicketService em paralelo ao load das mensagens.
      void refreshCurrentTicket(ticket.id);
      try {
        const { data } = await fetchMessages(ticket.id, { pageNumber: 1 });
        // Stale-fetch guard: se o usuario ja mudou de ticket, nao injetar mensagens erradas
        if (selectionRef.current !== ticket.id) return;
        const msgs = data?.messages || [];
        setMessages(msgs);
        setHasMore(data?.hasMore ?? msgs.length >= 20);
      } catch { /* ignore message load error */ }
    } catch {
      toast.error(t("errorAcceptingTicket"));
    }
  };

  const handleAcceptTicket = async (ticket: Ticket) => {
    // Pré-check cross-canal ao ACEITAR pendente (defense in depth do badge; gated
    // pela flag do tenant dentro do helper): se o contato já está em atendimento em
    // OUTRO canal, abre o dialog compartilhado com "Assumir mesmo assim". Best-effort:
    // falha do check nunca bloqueia o aceite.
    if (crossChannelCheckEnabled && !ticket.isGroup && ticket.contact?.number) {
      const cross = await findCrossChannelSiblingForTicket({
        ticketId: ticket.id,
        number: ticket.contact.number,
        whatsappId: (ticket as unknown as { whatsappId?: number }).whatsappId ?? ticket.whatsapp?.id,
      });
      if (cross) {
        setAcceptCrossTicket(cross);
        setAcceptPendingTicket(ticket);
        return;
      }
    }
    await acceptTicketNow(ticket);
  };

  const handleCloseTicket = (ticket: Ticket) => {
    setCloseConfirmTicket(ticket);
  };

  const confirmCloseTicket = async () => {
    if (!closeConfirmTicket) return;
    setCloseConfirmLoading(true);
    const tk = closeConfirmTicket;
    try {
      // Encerramento DIRETO, exatamente como o dialog promete: sem pesquisa de
      // satisfação, sem demanda obrigatória e sem despedida. A configuração de
      // comportamento ao resolver (fechar na hora / aguardar resposta / timer)
      // vale só para o "Resolver" do topo do atendimento e para o painel do
      // contato — o (x) da lista é o atalho administrativo (fecha atendimento de
      // outro atendente ou sem dono) e não deve disparar avaliação.
      await updateTicketForce(tk.id, "closed", user?.userId ?? 0);
      toast.success(t("ticketResolved", { id: tk.id }));
      if (currentTicket?.id === tk.id) setCurrentTicket(null);
      setCloseConfirmTicket(null);
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code !== "ECONNABORTED" && !err?.message?.includes("timeout")) {
        toast.error(t("closeTicketError"));
      }
    } finally {
      setCloseConfirmLoading(false);
    }
  };

  const handleClearFilters = () => {
    setShowAll(false);
    setIncludeClosed(false);
    setStatusFilters(["open", "pending"]);
    setWithUnreadMessages(false);
    setOrderAsc(null);
    setSelectedQueueIds([]);
    setSelectedWhatsappIds([]);
    setSelectedUserIds([]);
    setSelectedTagIds([]);
    setSelectedKanbanIds([]);
    setDateFrom("");
    setDateTo("");
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const toggleTicketSelect = useCallback((ticket: Ticket, checked: boolean, shiftKey?: boolean) => {
    if (shiftKey && lastBulkSelectedIdRef.current !== null) {
      const list = filteredTicketsRef.current;
      const lastIdx = list.findIndex((t) => t.id === lastBulkSelectedIdRef.current);
      const currIdx = list.findIndex((t) => t.id === ticket.id);
      if (lastIdx !== -1 && currIdx !== -1) {
        const [start, end] = [Math.min(lastIdx, currIdx), Math.max(lastIdx, currIdx)];
        setSelectedTicketIds((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            if (checked) next.add(list[i].id);
            else next.delete(list[i].id);
          }
          return next;
        });
        if (checked) lastBulkSelectedIdRef.current = ticket.id;
        return;
      }
    }
    lastBulkSelectedIdRef.current = checked ? ticket.id : null;
    setSelectedTicketIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ticket.id);
      else next.delete(ticket.id);
      return next;
    });
  }, []);

  const cancelBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedTicketIds(new Set());
  }, []);

  // ESC cancela seleção múltipla
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && bulkMode) cancelBulkMode(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bulkMode, cancelBulkMode]);

  const handleIniciarConversaAvulsa = useCallback(() => {
    setAvulsaWhatsappId("");
    setAvulsaNumber("");
    setAvulsaMessage("");
    setAvulsaContactSearch("");
    setAvulsaContactResults([]);
    setAvulsaApplyBrPhoneCorrection(true);
    setAvulsaOrderDetails(emptyOrderDetails());
    setAvulsaOpen(true);
  }, []);

  // Debounce: busca de contato no dialog avulsa (similar ao vcard)
  useEffect(() => {
    if (!avulsaContactSearch.trim()) { setAvulsaContactResults([]); return; }
    const timer = setTimeout(async () => {
      setAvulsaContactLoading(true);
      try {
        const res = await fetchContacts({ searchParam: avulsaContactSearch.trim(), pageNumber: 1 });
        const contacts: Contact[] = (res.data as { contacts?: Contact[] })?.contacts ?? (res.data as Contact[]) ?? [];
        setAvulsaContactResults(contacts.slice(0, 8));
      } catch { setAvulsaContactResults([]); }
      finally { setAvulsaContactLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [avulsaContactSearch]);

  // Carrega templates quando um canal oficial (WABA/Dialog360/Gupshup) é escolhido na avulsa.
  // Usa getTemplatesForChannel para despachar ao BSP certo (não só WABA via tokenAPI).
  // Recarrega SEMPRE que o modal abre (não só quando a sessão muda) para evitar
  // lista de templates em cache/stale — ex.: template editado para incluir {{2}}
  // que não aparecia porque a lista antiga só tinha {{1}}.
  useEffect(() => {
    if (!avulsaOpen) return;
    const wp = whatsappsList.find((w) => String(w.id) === avulsaWhatsappId);
    const tp = (wp?.type ?? "").toLowerCase();
    const isWabaLike = tp.includes("waba") || tp === "dialog360" || tp === "gupshup";
    // WABA precisa de tokenAPI; Dialog360/Gupshup resolvem pelo id do canal.
    if (!wp || !isWabaLike || (tp.includes("waba") && !wp.tokenAPI)) {
      setAvulsaWabaTemplates([]);
      setAvulsaSelectedTemplate(null);
      return;
    }
    setAvulsaLoadingTemplates(true);
    getTemplatesForChannel({ id: wp.id, type: wp.type, tokenAPI: wp.tokenAPI, appId: (wp as { appId?: string }).appId })
      .then((res) => {
        const list = (Array.isArray(res) ? res : (res as { data?: WabaTemplate[] })?.data || []) as WabaTemplate[];
        setAvulsaWabaTemplates([...list].sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())));
      })
      .catch(() => {})
      .finally(() => setAvulsaLoadingTemplates(false));
  }, [avulsaWhatsappId, whatsappsList, avulsaOpen]);

  // Parse variables when avulsa template changes
  useEffect(() => {
    // Zera a ficha de cobranca ao trocar/limpar o template — valores do template
    // anterior nunca podem vazar para a proxima cobranca.
    setAvulsaOrderDetails(emptyOrderDetails());
    if (!avulsaSelectedTemplate) { setAvulsaTemplateVars([]); return; }
    const vars: { key: string; label: string; value: string }[] = [];
    avulsaSelectedTemplate.components?.forEach((comp) => {
      if (comp.type === "HEADER" && comp.format && comp.format !== "TEXT" && comp.format !== "NONE")
        vars.push({ key: "header_link", label: `Header (${comp.format})`, value: "" });
      if ((comp.type === "BODY" || comp.type === "HEADER") && comp.text) {
        // Variáveis WABA têm numeração independente por componente — prefixar key com header_/body_.
        const keyPrefix = comp.type === "HEADER" ? "header_" : "body_";
        const labelPrefix = comp.type === "HEADER" ? "Header — " : "";
        [...comp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].forEach((m) => {
          const k = `${keyPrefix}named_variable_${m[1]}`;
          if (!vars.some((v) => v.key === k))
            vars.push({ key: k, label: `${labelPrefix}{{${m[1]}}}`, value: "" });
        });
        [...comp.text.matchAll(/\{\{(\d+)\}\}/g)].forEach((m) => {
          const k = `${keyPrefix}variable_${m[1]}`;
          if (!vars.some((v) => v.key === k))
            vars.push({ key: k, label: `${labelPrefix}{{${m[1]}}}`, value: "" });
        });
      }
    });
    setAvulsaTemplateVars(vars);
  }, [avulsaSelectedTemplate]);

  // Template de cobranca: exige a ficha de pagamento no envio (sub_category/display_format/botao).
  const isAvulsaOrderDetails = React.useMemo(
    () => isOrderDetailsTemplate(avulsaSelectedTemplate),
    [avulsaSelectedTemplate]
  );

  const handleSendAvulsa = useCallback(async (skipPrecheck = false) => {
    const wp = whatsappsList.find((w) => String(w.id) === avulsaWhatsappId);
    if (!wp) return;
    const tp = (wp.type ?? "").toLowerCase();
    const isDialog360 = tp === "dialog360";
    const isGupshup = tp === "gupshup";
    const isWabaLike = tp.includes("waba") || isDialog360 || isGupshup;
    const isAvulsaEmail = ["email", "webmail"].includes(tp);

    // Rota email/webmail: envia via sendEmailWebmail e cria ticket no backend.
    if (isAvulsaEmail) {
      if (!avulsaEmail.trim() || !avulsaEmailSubject.trim() || !avulsaMessage.trim()) return;
      setAvulsaSending(true);
      try {
        const { sendEmailWebmail } = await import("@/services/messages");
        const { data: emailRes } = await sendEmailWebmail(wp.id, {
          to: avulsaEmail.trim(),
          subject: avulsaEmailSubject.trim(),
          text: avulsaMessage.trim(),
        });
        const ticketId = (emailRes as { ticketId?: number })?.ticketId;
        toast.success(t("messageSent"));
        setAvulsaOpen(false);
        setAvulsaWhatsappId(""); setAvulsaNumber(""); setAvulsaMessage("");
        setAvulsaEmail(""); setAvulsaEmailSubject(""); setAvulsaQueue("none");
        if (ticketId) {
          router.push(`/atendimento?ticketId=${ticketId}`);
        }
      } catch {
        toast.error(t("errorSending"));
      } finally {
        setAvulsaSending(false);
      }
      return;
    }

    if (!avulsaNumber.trim()) return;
    if (!isWabaLike && !avulsaMessage.trim()) return;
    if (isWabaLike && !avulsaSelectedTemplate) return;
    // Regra do 9o digito BR e opcional: respeita a escolha do usuario no aviso (Aplicar/Manter original).
    const avulsaRawDigits = avulsaNumber.replace(/\D/g, "");
    const cleanNumber = avulsaApplyBrPhoneCorrection ? normalizeBrPhone(avulsaRawDigits) : avulsaRawDigits;

    // Pre-check: ticket aberto/pending no MESMO canal com OUTRO operador.
    // Se houver, abre dialog (Cancelar/Abrir/Assumir) e aborta o envio. Espelha
    // `abrirAtendimentoExistente` do Vue (MainLayout.vue:2076-2129).
    // Pula o pre-check quando o operador escolheu "Enviar mesmo assim" no dialog.
    const preTicket = skipPrecheck
      ? null
      : await findExistingOpenTicket({
          number: cleanNumber,
          whatsappId: wp.id,
          currentUserId: user?.userId ?? null,
        }).catch(() => null);
    if (preTicket) {
      setAvulsaExistingTicket(preTicket);
      return;
    }

    if (isWabaLike && avulsaSelectedTemplate) {
      const headerLinkCheck = avulsaTemplateVars.find((v) => v.key === "header_link");
      if (headerLinkCheck && !isValidHttpUrl(headerLinkCheck.value)) {
        toast.error(tErrors("invalidMediaHeaderUrl"));
        return;
      }
      // Bloqueia envio com variável de texto vazia — a Meta rejeita parâmetro de
      // texto sem valor (erro 131008 "Parameter of type text is missing text value").
      // header_link é validado à parte (URL) acima.
      const emptyVar = avulsaTemplateVars.find((v) => v.key !== "header_link" && !v.value.trim());
      if (emptyVar) {
        toast.warning(t("fillVariables"));
        return;
      }
      // Cobranca: valida antes de criar o ticket — evita ticket orfao com envio 400.
      if (isAvulsaOrderDetails) {
        const orderError = validateOrderDetails(avulsaOrderDetails);
        if (orderError) {
          toast.warning(tOrder(orderError));
          return;
        }
      }
    }

    setAvulsaSending(true);
    try {
      const signName = (typeof window !== "undefined" ? (user?.username ?? localStorage.getItem("username")) : (user?.username ?? null)) || "";
      const useSignature = forceSignature ? true : signatureEnabled;
      const signedMessage = useSignature && signName.trim() && avulsaMessage.trim()
        ? buildSignedBody(signName, avulsaMessage, wp.type)
        : avulsaMessage;
      const { data: indRes } = await sendIndividualMessage({
        whatsappId: wp.id,
        whatsappType: (wp.type ?? "").toLowerCase(),
        number: cleanNumber,
        message: isWabaLike ? "" : signedMessage,
        desiredStatus: avulsaDesiredStatus,
        ...(avulsaQueue && avulsaQueue !== "none" ? { queueId: Number(avulsaQueue) } : {}),
      });

      if (isWabaLike && avulsaSelectedTemplate) {
        const ticketId = (indRes as { ticketId?: number })?.ticketId;
        const components: Record<string, unknown>[] = [];
        const headerComp = avulsaSelectedTemplate.components?.find((c) => c.type === "HEADER");
        if (headerComp) {
          if (headerComp.format === "TEXT") {
            const headerPositional = avulsaTemplateVars.filter((v) => v.key.startsWith("header_variable_"));
            const headerNamed = avulsaTemplateVars.filter((v) => v.key.startsWith("header_named_variable_"));
            if (headerPositional.length > 0) {
              const variables: string[] = [];
              headerPositional.sort((a, b) => parseInt(a.key.replace("header_variable_", "")) - parseInt(b.key.replace("header_variable_", "")))
                .forEach((v, i) => { variables[i] = v.value; });
              components.push({ type: "HEADER", format: "TEXT", variables });
            } else if (headerNamed.length > 0) {
              components.push({ type: "HEADER", format: "TEXT", parameters: headerNamed.map((v) => ({ type: "text", text: v.value, name: v.key.replace("header_named_variable_", "") })) });
            }
          } else {
            const hlv = avulsaTemplateVars.find((v) => v.key === "header_link");
            if (hlv?.value) components.push({
              type: "HEADER",
              format: headerComp.format,
              value: hlv.value,
              // filename só é usado no header de DOCUMENT (título do arquivo no WhatsApp);
              // ausente → backend deriva do basename da URL.
              ...(headerComp.format === "DOCUMENT" && hlv.filename ? { filename: hlv.filename } : {}),
            });
          }
        }
        const positionalVars = avulsaTemplateVars.filter((v) => v.key.startsWith("body_variable_"));
        const namedVars = avulsaTemplateVars.filter((v) => v.key.startsWith("body_named_variable_"));
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
        // componente no BUTTONS. Sem cobranca o spread vira {} (no-op) e o
        // template comum sai byte-identico ao de hoje.
        const orderDetailsField = isAvulsaOrderDetails
          ? { orderDetails: buildOrderDetailsPayload(avulsaOrderDetails) }
          : {};
        if (isGupshup) {
          const { sendGupshupTemplateMsg } = await import("@/services/gupshup-messages");
          await sendGupshupTemplateMsg({
            from: cleanNumber,
            ticketId,
            whatsappId: wp.id,
            tokenApi: wp.tokenAPI,
            idFront,
            fromMe: true,
            read: 1,
            name: avulsaSelectedTemplate.name,
            language: avulsaSelectedTemplate.language,
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
            whatsappId: wp.id,
            tokenApi: wp.tokenAPI,
            idFront,
            fromMe: true,
            read: 1,
            templateName: avulsaSelectedTemplate.name,
            templateLanguage: avulsaSelectedTemplate.language,
            components,
            // Mesmo array de components do ramo WABA (contrato do dataJson):
            // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
            dataJson: JSON.stringify(components),
            ...orderDetailsField,
          });
        } else {
          await sendWabaTemplateComponents({
            from: cleanNumber,
            tokenApi: wp.tokenAPI,
            ticketId,
            phone_number_id: wp.tokenAPI,
            language: avulsaSelectedTemplate.language,
            templateName: avulsaSelectedTemplate.name,
            body: JSON.stringify(avulsaSelectedTemplate.components || []),
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

      toast.success(t("messageSentTo", { number: avulsaNumber }));
      setAvulsaOpen(false);
      setAvulsaSelectedTemplate(null);
      setAvulsaTemplateVars([]);
      setAvulsaOrderDetails(emptyOrderDetails());
      setAvulsaDesiredStatus("open");
      setAvulsaQueue("none");
    } catch (e: unknown) {
      const errCode = String((e as { response?: { data?: { error?: string } } })?.response?.data?.error || "");
      // Cobranca: o interceptor de api.ts rejeita com a RESPOSTA (nao com o
      // AxiosError), entao o codigo pode chegar em `data.error`. Le as duas
      // formas — sem isso o motivo da recusa some no toast generico.
      const chargeErrCode = String(
        (e as { data?: { error?: string } })?.data?.error ||
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        ""
      );
      if (errCode.startsWith("ERR_NUMBER_RESOLVED_MISMATCH")) {
        toast.error(tErrors("numberResolvedMismatch"));
      } else if (errCode === "ERR_QUEUE_NOT_ALLOWED") {
        toast.error(tNC("queueNotAllowed"));
      } else if (errCode === "ERR_SESSION_NOT_ALLOWED") {
        toast.error(tNC("sessionNotAllowed"));
      } else if (chargeErrCode === "ERR_ORDER_DETAILS_NOT_SUPPORTED") {
        toast.error(tOrder("errorNotSupportedHere"));
      } else if (isAvulsaOrderDetails && chargeErrCode === "ERR_NO_PERMISSION") {
        toast.error(tOrder("errorNotAllowed"));
      } else if (chargeErrCode.startsWith("ERR_ORDER_DETAILS")) {
        // A validacao do formulario espelha a do backend, entao um codigo aqui e
        // divergencia real — mostra o codigo para o suporte em vez de engolir.
        toast.error(`${tOrder("errorSendFailed")}: ${chargeErrCode}`);
      } else if (isAvulsaOrderDetails && chargeErrCode === "ERR_FEATURE_NOT_IN_PLAN") {
        // O interceptor global ja avisa "recurso fora do plano" — nao duplicar.
      } else {
        const msg = errCode || (e as { message?: string })?.message || "Erro desconhecido";
        toast.error(t("errorSendingAvulsa", { msg }));
      }
    } finally {
      setAvulsaSending(false);
    }
  }, [avulsaWhatsappId, avulsaNumber, avulsaMessage, avulsaEmail, avulsaEmailSubject, avulsaSelectedTemplate, avulsaTemplateVars, avulsaOrderDetails, isAvulsaOrderDetails, avulsaQueue, avulsaApplyBrPhoneCorrection, whatsappsList, signatureEnabled, forceSignature, user, t, tErrors, tNC, tOrder, router]);

  const pickAvulsaTplGalleryItem = (item: GalleryItem) => {
    setAvulsaTemplateVars((prev) => prev.map((v) => v.key === "header_link" ? { ...v, value: item.url, filename: item.name } : v));
    setAvulsaTplGalleryOpen(false);
  };

  const handleBulkAction = useCallback(async (
    action: "open" | "pending" | "closed",
    extra?: { userId?: number }
  ) => {
    const ids = Array.from(selectedTicketIds);
    if (!ids.length) return;
    try {
      for (const id of ids) {
        await updateTicket(id, { status: action, ...extra });
      }
      toast.success(t("bulkUpdated", { count: ids.length }));
      cancelBulkMode();
      loadTickets({ upToPage: ticketsPageNumberRef.current });
    } catch {
      toast.error(t("errorBulkUpdate"));
    }
  }, [selectedTicketIds, cancelBulkMode, loadTickets]);

  const handleBulkTransferUser = useCallback(async () => {
    const ids = Array.from(selectedTicketIds);
    if (!ids.length || !bulkTransferUserId) return;
    try {
      for (const id of ids) {
        // isTransference: 1 — alem de gerar o log/divisoria de transferencia, faz o
        // backend validar acesso ao numero (senao a transferencia em massa p/ atendente
        // escaparia do guard e poderia atribuir a quem nao ve o ticket).
        await updateTicket(id, { userId: parseInt(bulkTransferUserId), status: "open", isTransference: 1 });
      }
      toast.success(t("bulkUpdated", { count: ids.length }));
      setBulkTransferUserOpen(false);
      setBulkTransferUserId("");
      cancelBulkMode();
      loadTickets({ upToPage: ticketsPageNumberRef.current });
    } catch (err) {
      const errorCode =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as { data?: { error?: string } })?.data?.error;
      if (errorCode === "ERR_TRANSFER_NO_WHATSAPP_ACCESS") {
        toast.error(t("errorTransferNoWhatsappAccess"));
      } else {
        toast.error(t("errorBulkUpdate"));
      }
    }
  }, [selectedTicketIds, bulkTransferUserId, cancelBulkMode, loadTickets]);

  const handleBulkTransferChannel = useCallback(async () => {
    const ids = Array.from(selectedTicketIds);
    if (!ids.length || !bulkTransferChannelId) return;
    const selectedWa = whatsappsList.find((w) => w.id === parseInt(bulkTransferChannelId));
    if (!selectedWa) return;
    try {
      for (const id of ids) {
        await transferTicketChannel(id, { channel: selectedWa.type || "baileys", whatsappId: parseInt(bulkTransferChannelId) });
      }
      toast.success(t("bulkUpdated", { count: ids.length }));
      setBulkTransferChannelOpen(false);
      setBulkTransferChannelId("");
      cancelBulkMode();
      loadTickets({ upToPage: ticketsPageNumberRef.current });
    } catch { toast.error(t("errorBulkUpdate")); }
  }, [selectedTicketIds, bulkTransferChannelId, whatsappsList, cancelBulkMode, loadTickets]);

  const handleOpenBulkChatbot = useCallback(async () => {
    try {
      const { data } = await fetchChatFlows();
      const flows = Array.isArray(data) ? data : (data as Record<string, unknown>)?.chatFlow as { id: number; name: string }[] || [];
      setBulkChatFlows(Array.isArray(flows) ? flows : []);
    } catch { setBulkChatFlows([]); }
    setBulkTransferChatbotOpen(true);
  }, []);

  const handleBulkTransferChatbot = useCallback(async () => {
    const ids = Array.from(selectedTicketIds);
    if (!ids.length || !bulkTransferChatbotId) return;
    try {
      for (const id of ids) {
        await transferToChatbot(id, parseInt(bulkTransferChatbotId));
      }
      toast.success(t("bulkUpdated", { count: ids.length }));
      setBulkTransferChatbotOpen(false);
      setBulkTransferChatbotId("");
      cancelBulkMode();
      loadTickets({ upToPage: ticketsPageNumberRef.current });
    } catch { toast.error(t("errorBulkUpdate")); }
  }, [selectedTicketIds, bulkTransferChatbotId, cancelBulkMode, loadTickets]);

  const handleBulkTransferQueue = useCallback(async () => {
    const ids = Array.from(selectedTicketIds);
    if (!ids.length || !bulkTransferQueueId) return;
    try {
      for (const id of ids) {
        await updateTicket(id, {
          queueId: parseInt(bulkTransferQueueId),
          userId: null,
          status: "pending",
          isTransference: 1,
        });
      }
      toast.success(t("bulkUpdated", { count: ids.length }));
      setBulkTransferQueueOpen(false);
      setBulkTransferQueueId("");
      cancelBulkMode();
      loadTickets({ upToPage: ticketsPageNumberRef.current });
    } catch (err) {
      const errorCode =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as { data?: { error?: string } })?.data?.error;
      if (errorCode === "ERR_TRANSFER_NO_WHATSAPP_ACCESS") {
        toast.error(t("errorTransferNoWhatsappAccess"));
      } else {
        toast.error(t("errorBulkUpdate"));
      }
    }
  }, [selectedTicketIds, bulkTransferQueueId, cancelBulkMode, loadTickets]);

  const toggleQueueId = (id: number) => {
    setSelectedQueueIds((prev) =>
      prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]
    );
  };

  const toggleWhatsappId = (id: number) => {
    setSelectedWhatsappIds((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const filteredTickets = React.useMemo(() => {
    const dbg = process.env.NEXT_PUBLIC_DEBUG === "true";
    // Parte da base já filtrada por regras de visibilidade (visibleTicketsAllStatuses)
    let list: Ticket[];
    if (statusFilter === "closed") {
      list = visibleTicketsAllStatuses.filter((t) => t.status === "closed");
    } else {
      // Deduplicação por contato+canal no pool ativo (open + pending): um contato com
      // dois atendimentos ativos no mesmo canal aparecia duplicado na lista.
      // Tickets do mesmo contato em canais distintos são mantidos separadamente.
      // A regra de desempate (e o caso em que NADA é escondido, quando há mais de um
      // responsável envolvido) vive no helper — ver lib/dedupe-active-tickets.
      const active = visibleTicketsAllStatuses.filter((t) => t.status === "open" || t.status === "pending");
      // Após deduplicar, filtra pelo status da aba atual para manter as abas separadas
      const deduped = dedupeActiveTicketsByContactChannel(active);
      if (dbg) {
        const removedByDedup = active.filter((t) => !deduped.includes(t));
        if (removedByDedup.length > 0) {
          console.debug("[filteredTickets] deduplicação por contato+canal", {
            removidos: removedByDedup.map((t) => ({ id: t.id, contact: t.contact?.name, contactId: t.contact?.id, whatsappId: t.whatsapp?.id, status: t.status })),
          });
        }
      }
      list = deduped.filter((t) => t.status === statusFilter);
    }

    if (dbg) {
      console.debug("[filteredTickets] após filtro de aba", {
        aba: statusFilter,
        total: list.length,
        tickets: list.map((t) => ({ id: t.id, status: t.status, contact: t.contact?.name, unreadMessages: t.unreadMessages, answered: (t as Ticket & { answered?: boolean }).answered, pinned: pinnedTickets.includes(t.id) })),
      });
    }

    // Reordena por updatedAt para refletir atualizações via socket sem full refresh
    // Respeita a ordem efetiva (override do usuário ou reverseOrder do tenant): asc = mais antigos primeiro
    list = [...list].sort((a, b) =>
      effectiveOrderAsc
        ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (sortByAnswered) {
      list = [...list].sort((a, b) => {
        const aAnswered = (a as Ticket & { answered?: boolean }).answered === true;
        const bAnswered = (b as Ticket & { answered?: boolean }).answered === true;
        if (aAnswered === bAnswered) return 0;
        return aAnswered ? 1 : -1;
      });
    }
    if (isReversed) list = [...list].reverse();

    // Pinned tickets always at the top, preserving pin insertion order
    if (pinnedTickets.length > 0) {
      list = [...list].sort((a, b) => {
        const aIdx = pinnedTickets.indexOf(a.id);
        const bIdx = pinnedTickets.indexOf(b.id);
        const aPinned = aIdx !== -1;
        const bPinned = bIdx !== -1;
        if (aPinned && bPinned) return aIdx - bIdx;
        if (aPinned) return -1;
        if (bPinned) return 1;
        return 0;
      });
    }

    // Client-side mirror of withUnreadMessages server filter:
    // when active, hide tickets that no longer have unread messages
    if (withUnreadMessages) {
      const before = list;
      list = list.filter((t) => (t.unreadMessages ?? 0) > 0);
      if (dbg) {
        const removed = before.filter((t) => !list.includes(t));
        if (removed.length > 0) {
          console.debug("[filteredTickets] filtro withUnreadMessages", {
            removidos: removed.map((t) => ({ id: t.id, contact: t.contact?.name, unreadMessages: t.unreadMessages })),
            restam: list.length,
          });
        }
      }
    }

    if (dbg) {
      console.debug("[filteredTickets] lista final exibida", {
        total: list.length,
        tickets: list.map((t, i) => ({ posicao: i + 1, id: t.id, contact: t.contact?.name, status: t.status, unreadMessages: t.unreadMessages, pinned: pinnedTickets.includes(t.id) })),
      });
    }

    return list;
  }, [visibleTicketsAllStatuses, statusFilter, sortByAnswered, isReversed, effectiveOrderAsc, pinnedTickets, withUnreadMessages]);

  // Keep ref in sync so toggleTicketSelect (defined before filteredTickets) can use it
  filteredTicketsRef.current = filteredTickets;

  // Aviso de atendimento duplicado no card (badge âmbar): busca BATELADA dos irmãos
  // open/pending do mesmo contato para os tickets visíveis.
  //  - Aba Pendentes: só OUTROS canais, gated pela flag crossChannelTicketCheck.
  //  - Aba Fechados: também o MESMO canal (`includeSameChannel`) — é o aviso de que
  //    reabrir aquele fechado criaria uma segunda conversa no mesmo canal; não
  //    depende da flag (é duplicidade objetiva, não cross-canal).
  //  - Aba Abertos: SOMENTE o mesmo canal. Desde que a deduplicação parou de
  //    esconder atendimento com responsável, dois tickets do mesmo contato podem
  //    aparecer lado a lado aqui — o badge explica por quê. Irmão cross-canal fica
  //    de fora de propósito: é a aba de trabalho, e esse aviso já existe no aceite.
  // A chave é uma STRING derivada — o efeito só dispara quando o CONTEÚDO muda,
  // nunca por mera troca de identidade do array (evita loop de render). Fora
  // dessas abas → chave vazia, nada roda (zero regressão).
  // Em Pendentes/Fechados a chave inclui updatedAt. Em Abertos NÃO: ali o
  // updatedAt muda a cada mensagem trocada, e re-buscar 50 irmãos a cada mensagem
  // encheria a aba mais usada do sistema de requisições. O gatilho que importa
  // nessa aba é o surgimento de um segundo ticket do contato — e esse entra na
  // lista com id novo, o que já muda a chave.
  const crossSiblingsTabStatus =
    statusFilter === "closed"
      ? "closed"
      : statusFilter === "open"
      ? "open"
      : statusFilter === "pending" && crossChannelCheckEnabled
      ? "pending"
      : "";
  // Abertos só interessa a duplicata direta; Fechados precisa dela junto do cross-canal.
  const crossSiblingsSameChannelOnly = crossSiblingsTabStatus === "open";

  const crossSiblingsQueryKey = React.useMemo(() => {
    if (!crossSiblingsTabStatus) return "";
    const withUpdatedAt = crossSiblingsTabStatus !== "open";
    return filteredTickets
      .filter((tk) => tk.status === crossSiblingsTabStatus && !tk.isGroup && tk.contact?.number)
      .slice(0, 50)
      .map((tk) => {
        const base = `${tk.id}:${Number((tk as unknown as { whatsappId?: number }).whatsappId ?? tk.whatsapp?.id ?? 0)}`;
        return withUpdatedAt ? `${base}:${tk.updatedAt}` : base;
      })
      .join(",");
  }, [crossSiblingsTabStatus, filteredTickets]);

  useEffect(() => {
    if (!crossSiblingsTabStatus) {
      setCrossSiblingsByTicketId((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    const buildItems = () => filteredTicketsRef.current
      .filter((tk) => tk.status === crossSiblingsTabStatus && !tk.isGroup && tk.contact?.number)
      .map((tk) => ({
        ticketId: tk.id,
        number: String(tk.contact?.number || "").replace(/\D/g, ""),
        whatsappId: Number((tk as unknown as { whatsappId?: number }).whatsappId ?? tk.whatsapp?.id ?? 0),
      }))
      .filter((i) => !!i.number && i.whatsappId > 0)
      .slice(0, 50); // cap alinhado ao MAX_ITEMS do backend
    const items = crossSiblingsQueryKey ? buildItems() : [];
    if (!items.length) {
      // Idempotente: preserva a referência quando já está vazio (não realimenta render)
      setCrossSiblingsByTicketId((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    let cancelled = false;
    fetchCrossChannelSiblings(items, { includeSameChannel: crossSiblingsTabStatus !== "pending" })
      .then(({ data }) => {
        if (cancelled) return;
        const siblings = data?.siblings || {};
        if (!crossSiblingsSameChannelOnly) {
          setCrossSiblingsByTicketId(siblings);
          return;
        }
        // Aba Abertos: descarta os irmãos cross-canal do payload (o backend não tem
        // um "somente mesmo canal"; pedir includeSameChannel traz os dois escopos).
        const sameChannelOnly: Record<number, CrossChannelSibling[]> = {};
        for (const [ticketId, list] of Object.entries(siblings)) {
          const filtered = (list || []).filter((s) => s.sameChannel === true);
          if (filtered.length) sameChannelOnly[Number(ticketId)] = filtered;
        }
        setCrossSiblingsByTicketId(sameChannelOnly);
      })
      .catch(() => { /* best-effort: sem badge nesta carga */ });
    return () => { cancelled = true; };
  }, [crossSiblingsQueryKey, crossSiblingsTabStatus, crossSiblingsSameChannelOnly]);

  const groupedByChannel = React.useMemo(() => {
    if (viewMode !== "monitor") return {} as Record<string, { name: string; type?: string; tickets: Ticket[] }>;
    return filteredTickets.reduce((acc, ticket) => {
      const key = String(ticket.whatsapp?.id ?? (ticket as unknown as { whatsappId?: number | null }).whatsappId ?? "null");
      if (!acc[key]) acc[key] = { name: ticket.whatsapp?.name || t("noChannel"), type: ticket.whatsapp?.type, tickets: [] };
      acc[key].tickets.push(ticket);
      return acc;
    }, {} as Record<string, { name: string; type?: string; tickets: Ticket[] }>);
  }, [filteredTickets, viewMode, t]);

  // Monitor view KPIs — computed from visibleTicketsAllStatuses so they ignore
  // the status tab filter (gestor sempre vê o quadro completo).
  const monitorKpis = React.useMemo(() => {
    if (viewMode !== "monitor") return null;
    let open = 0;
    let pending = 0;
    let unread = 0;
    let oldestPendingAt: number | null = null;
    const activeAgents = new Set<number>();
    for (const tk of visibleTicketsAllStatuses) {
      if (tk.status === "open") {
        open++;
        if (tk.user?.id != null) activeAgents.add(tk.user.id);
      }
      if (tk.status === "pending") {
        pending++;
        const created = new Date(tk.createdAt).getTime();
        if (Number.isFinite(created)) {
          if (oldestPendingAt == null || created < oldestPendingAt) oldestPendingAt = created;
        }
      }
      unread += tk.unreadMessages || 0;
    }
    return { open, pending, unread, oldestPendingAt, activeAgents: activeAgents.size };
  }, [visibleTicketsAllStatuses, viewMode]);

  return (
    <TooltipProvider>
      {/* absolute inset-0 fills the main's relative container — no overflow, no margin tricks */}
      <div className="absolute inset-0 flex bg-background">
        {/* Collapsed toggle — visible only on md when panel is collapsed and a ticket is open */}
        {panelCollapsed && currentTicket && viewMode !== "monitor" && (
          <button
            className="hidden md:flex lg:hidden items-center justify-center border-r bg-background hover:bg-accent w-10 shrink-0 transition-colors"
            onClick={() => setPanelCollapsed(false)}
            title={t("showTicketList")}
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        {/* Ticket List — on mobile: full width when no ticket open; hidden when ticket open */}
        <div className={viewMode === "monitor"
          ? "flex flex-col w-full min-h-0"
          : cn(
              "border-r flex flex-col shrink-0",
              "md:w-[360px] md:flex",
              currentTicket ? "hidden md:flex" : "flex w-full",
              panelCollapsed && "md:hidden lg:flex"
            )
        }>
          {/* Dialogs de transferência em massa */}
          <Dialog open={bulkTransferUserOpen} onOpenChange={setBulkTransferUserOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("bulkTransferToUser")}</DialogTitle>
                <DialogDescription>{t("bulkTicketsSelected", { count: selectedTicketIds.size })}</DialogDescription>
              </DialogHeader>
              <SearchableSelect
                options={usersList.map((u) => ({ value: String(u.id), label: u.name }))}
                value={bulkTransferUserId}
                onValueChange={setBulkTransferUserId}
                placeholder={t("bulkSelectUser")}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkTransferUserOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleBulkTransferUser} disabled={!bulkTransferUserId}>{t("bulkTransfer")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={bulkTransferChannelOpen} onOpenChange={setBulkTransferChannelOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("bulkTransferToChannel")}</DialogTitle>
                <DialogDescription>{t("bulkTicketsSelected", { count: selectedTicketIds.size })}</DialogDescription>
              </DialogHeader>
              <SearchableSelect
                options={whatsappsList.map((w) => ({ value: String(w.id), label: w.name }))}
                value={bulkTransferChannelId}
                onValueChange={setBulkTransferChannelId}
                placeholder={t("bulkSelectChannel")}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkTransferChannelOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleBulkTransferChannel} disabled={!bulkTransferChannelId}>{t("bulkTransfer")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={bulkTransferChatbotOpen} onOpenChange={setBulkTransferChatbotOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("bulkTransferToChatbot")}</DialogTitle>
                <DialogDescription>{t("bulkTicketsSelected", { count: selectedTicketIds.size })}</DialogDescription>
              </DialogHeader>
              <SearchableSelect
                options={bulkChatFlows.map((cf) => ({ value: String(cf.id), label: cf.name }))}
                value={bulkTransferChatbotId}
                onValueChange={setBulkTransferChatbotId}
                placeholder={t("bulkSelectChatbot")}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkTransferChatbotOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleBulkTransferChatbot} disabled={!bulkTransferChatbotId}>{t("bulkTransfer")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={bulkTransferQueueOpen} onOpenChange={setBulkTransferQueueOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("bulkTransferToQueue")}</DialogTitle>
                <DialogDescription>{t("bulkTicketsSelected", { count: selectedTicketIds.size })}</DialogDescription>
              </DialogHeader>
              <SearchableSelect
                options={allQueues.map((q) => ({ value: String(q.id), label: q.name }))}
                value={bulkTransferQueueId}
                onValueChange={setBulkTransferQueueId}
                placeholder={t("bulkSelectQueue")}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkTransferQueueOpen(false)}>{t("cancel")}</Button>
                <Button onClick={handleBulkTransferQueue} disabled={!bulkTransferQueueId}>{t("bulkTransfer")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className={viewMode === "monitor" ? "px-3 pt-5 pb-2 flex items-center gap-2 min-w-0 overflow-visible" : "p-3 space-y-2 min-w-0 overflow-hidden"}>
            <div className={viewMode === "monitor" ? "contents" : "flex flex-col gap-2 min-w-0 overflow-hidden"}>
              <div className={viewMode === "monitor" ? "contents" : "flex items-center gap-2"}>
                <div className="flex items-center gap-1.5 shrink-0">
                  <h2 className="font-semibold text-sm shrink-0">{t("sidebarTitle")}</h2>
                  {currentTicket && (
                    <button
                      className="hidden md:inline-flex lg:hidden items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      onClick={() => setPanelCollapsed(true)}
                      title={t("hideTicketList")}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {isAdminLike && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={viewMode === "monitor" ? "default" : "outline"}
                            size="sm"
                            className="h-9 w-9 shrink-0"
                            onClick={() => setViewMode(v => v === "list" ? "monitor" : "list")}
                          >
                            {viewMode === "monitor" ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{viewMode === "monitor" ? t("viewList") : t("viewMonitor")}</TooltipContent>
                      </Tooltip>
                    )}
                    <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 gap-1.5 shrink-0 relative"
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                              {t("filters")}
                              {activeFiltersCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center px-1">
                                  {activeFiltersCount}
                                </span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-3" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1 pb-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium">{t("filters")}</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        aria-label={t("filtersHelpTitle")}
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" align="start" className="max-w-xs space-y-1.5 p-3">
                                      <p className="text-xs font-medium">{t("filtersHelpTitle")}</p>
                                      <p className="text-xs leading-snug">{t("filtersHelpSameFilter")}</p>
                                      <p className="text-xs leading-snug">{t("filtersHelpCrossFilter")}</p>
                                      <p className="mt-1 rounded-md bg-muted px-2 py-1.5 text-[11px] leading-snug text-foreground">
                                        {t("filtersHelpExample")}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                {activeFiltersCount > 0 && (
                                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearFilters}>
                                    {t("clearFilters")}
                                  </Button>
                                )}
                              </div>
                              {isAdminLike && (
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                  <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(!!v)} />
                                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                  {t("showAll")}
                                </label>
                              )}
                              {isAdminLike && showAll && (
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                  <Checkbox
                                    checked={includeClosed}
                                    onCheckedChange={(v) => {
                                      const checked = !!v;
                                      setIncludeClosed(checked);
                                      setStatusFilters((prev) =>
                                        checked
                                          ? (prev.includes("closed") ? prev : [...prev, "closed"])
                                          : prev.filter((s) => s !== "closed")
                                      );
                                    }}
                                  />
                                  <span>{t("includeClosed")}</span>
                                </label>
                              )}
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox checked={withUnreadMessages} onCheckedChange={(v) => setWithUnreadMessages(!!v)} />
                                <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                {t("onlyUnread")}
                              </label>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox checked={effectiveOrderAsc} onCheckedChange={(v) => setOrderAsc(!!v)} />
                                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                                {t("reverseAllOrder")}
                              </label>
                              <div className="space-y-1.5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("statusLabel")}</span>
                                {(["open", "pending", "closed"] as const).map((s) => {
                                  // "Fechados" só é controlável via "Incluir tickets fechados" no modo Ver Todos.
                                  const closedDisabled = s === "closed" && isAdminLike && showAll && !includeClosed;
                                  return (
                                    <label
                                      key={s}
                                      className={cn(
                                        "flex items-center gap-2 text-sm",
                                        closedDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                                      )}
                                    >
                                      <Checkbox
                                        checked={statusFilters.includes(s)}
                                        disabled={closedDisabled}
                                        onCheckedChange={() => toggleStatusFilter(s)}
                                      />
                                      <span>{s === "open" ? t("tabOpen") : s === "pending" ? t("tabPending") : t("tabClosed")}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <Separator />
                              <div className="space-y-1.5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("periodLabel")}</span>
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground w-8 shrink-0">{t("dateFromLabel")}</span>
                                    <input
                                      type="date"
                                      value={dateFrom}
                                      onChange={(e) => setDateFrom(e.target.value)}
                                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground w-8 shrink-0">{t("dateToLabel")}</span>
                                    <input
                                      type="date"
                                      value={dateTo}
                                      onChange={(e) => setDateTo(e.target.value)}
                                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                  </div>
                                </div>
                              </div>
                              <Separator />
                              {queues.length > 0 && (
                                <div className="space-y-1.5">
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("queuesLabel")}</span>
                                  <div className="max-h-28 overflow-y-auto space-y-1">
                                    {queues.map((q) => (
                                      <label key={q.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox checked={selectedQueueIds.includes(q.id)} onCheckedChange={() => toggleQueueId(q.id)} />
                                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: q.color }} />
                                        <span className="truncate">{q.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {canUseAdvancedFilters && (
                                <>
                                  <Separator />
                                  {availableWhatsapps.length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("connectionsLabel")}</span>
                                      <div className="max-h-28 overflow-y-auto space-y-1">
                                        {availableWhatsapps.map((w) => (
                                          <label key={w.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Checkbox checked={selectedWhatsappIds.includes(w.id)} onCheckedChange={() => toggleWhatsappId(w.id)} />
                                            <span className="truncate">{w.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {usersList.length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("userLabel")}</span>
                                      <div className="max-h-28 overflow-y-auto space-y-1">
                                        {usersList.map((u) => (
                                          <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Checkbox
                                              checked={selectedUserIds.includes(String(u.id))}
                                              onCheckedChange={() => toggleId(setSelectedUserIds, String(u.id))}
                                            />
                                            <span className="truncate">{u.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {tagsList.length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("tagLabel")}</span>
                                      <div className="max-h-28 overflow-y-auto space-y-1">
                                        {tagsList.map((tag) => (
                                          <label key={tag.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Checkbox
                                              checked={selectedTagIds.includes(String(tag.id))}
                                              onCheckedChange={() => toggleId(setSelectedTagIds, String(tag.id))}
                                            />
                                            <span className="truncate">{tag.tag ?? tag.name ?? ""}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {kanbansList.length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kanban</span>
                                      <div className="max-h-28 overflow-y-auto space-y-1">
                                        {kanbansList.map((k) => (
                                          <label key={k.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Checkbox
                                              checked={selectedKanbanIds.includes(String(k.id))}
                                              onCheckedChange={() => toggleId(setSelectedKanbanIds, String(k.id))}
                                            />
                                            <span className="truncate">{k.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                        {viewMode !== "monitor" && <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                              {t("bulkActions")}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => setConvitesOpen(true)}>
                              <MailOpen className="h-4 w-4 mr-2" />
                              {t("invites")}
                              {convitesList.length > 0 && (
                                <span className="ml-auto h-5 min-w-[20px] rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center px-1.5">
                                  {convitesList.length}
                                </span>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => (bulkMode ? cancelBulkMode() : setBulkMode(true))}>
                              {bulkMode ? <XCircle className="h-4 w-4 mr-2 text-destructive" /> : <CheckSquare className="h-4 w-4 mr-2" />}
                              {bulkMode ? t("cancelSelection") : t("selectMultiple")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {!isRestricted && (
                              <DropdownMenuItem onClick={handleIniciarConversaAvulsa}>
                                <SendIcon className="h-4 w-4 mr-2" />
                                {t("startAvulsa")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {hasMoreTickets && (
                              <DropdownMenuItem onClick={loadMoreTickets} disabled={loadingMoreTickets}>
                                {loadingMoreTickets ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                                {loadingMoreTickets ? t("loading") : t("loadMore")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setIsReversed(!isReversed)}>
                              <ArrowUpDown className="h-4 w-4 mr-2" />
                              {t("reverseOrder")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSortByAnswered(!sortByAnswered)}>
                              <CheckCircle2 className={cn("h-4 w-4 mr-2", sortByAnswered && "text-primary")} />
                              {t("sortByUnanswered")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                              <HelpCircle className="h-4 w-4 mr-2" />
                              {t("help")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>}
                </div>
              </div>
            </div>

            {viewMode !== "monitor" && (!tenantConfigsLoaded || settingsLoading ? (
              <div className="flex gap-1 items-center">
                <Skeleton className="h-7 flex-1 rounded-md" />
                <Skeleton className="h-7 flex-1 rounded-md" />
                <Skeleton className="h-7 flex-1 rounded-md" />
              </div>
            ) : (
              <div className="flex gap-1 items-center">
                <Button
                  variant={tabType === "private" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs flex-1 relative"
                  onClick={() => setTabType("private")}
                >
                  {t("private")}
                  {universalCounter && tabUnreadCounts.private > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center px-1 pointer-events-none">
                      {tabUnreadCounts.private}
                    </span>
                  )}
                </Button>
                {!ignoreGroupMsg && (
                  <Button
                    variant={tabType === "groups" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs flex-1 relative"
                    onClick={() => setTabType("groups")}
                  >
                    <Users className="mr-1 h-3 w-3" /> {t("groups")}
                    {universalCounter && tabUnreadCounts.groups > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center px-1 pointer-events-none">
                        {tabUnreadCounts.groups}
                      </span>
                    )}
                  </Button>
                )}
                {showChatBotLane && (
                  <Button
                    variant={tabType === "chatbot" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs flex-1 relative"
                    onClick={() => setTabType("chatbot")}
                  >
                    <Bot className="mr-1 h-3 w-3" /> {t("chatbot")}
                    {universalCounter && tabUnreadCounts.chatbot > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center px-1 pointer-events-none">
                        {tabUnreadCounts.chatbot}
                      </span>
                    )}
                  </Button>
                )}
              </div>
            ))}

            {/* Barra de ações em massa */}
            {bulkMode && selectedTicketIds.size > 0 && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-primary/10 border-b">
                <span className="text-sm font-medium">
                  {t("bulkTicketsSelected", { count: selectedTicketIds.size })}
                </span>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="secondary" className="h-7 text-xs">
                        {t("bulkActions")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => handleBulkAction("open", { userId: user?.userId })}>
                        {t("bulkStart")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkAction("pending")}>
                        {t("bulkReturnQueue")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setBulkTransferUserOpen(true)}>
                        {t("bulkTransferToUser")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setBulkTransferQueueOpen(true)}>
                        {t("bulkTransferToQueue")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setBulkTransferChannelOpen(true)}>
                        {t("bulkTransferToChannel")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleOpenBulkChatbot}>
                        {t("bulkTransferToChatbot")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleBulkAction("closed")}>
                        {t("bulkResolve")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleBulkAction("closed")}>
                        {t("bulkClose")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={cancelBulkMode}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {tenantConfigsLoaded && fixarConexao && availableWhatsapps.length > 0 && (
              <div className="relative -mx-1">
                {/* Desktop left arrow */}
                {channelCanScrollLeft && (
                  <button
                    type="button"
                    className="hidden md:flex absolute left-0 top-0 bottom-0 z-10 items-center justify-center w-5 bg-gradient-to-r from-background to-transparent"
                    onClick={() => { channelScrollRef.current?.scrollBy({ left: -120, behavior: "smooth" }); }}
                  >
                    <ChevronLeft className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
                {/* Desktop right arrow */}
                {channelCanScrollRight && (
                  <button
                    type="button"
                    className="hidden md:flex absolute right-0 top-0 bottom-0 z-10 items-center justify-center w-5 bg-gradient-to-l from-background to-transparent"
                    onClick={() => { channelScrollRef.current?.scrollBy({ left: 120, behavior: "smooth" }); }}
                  >
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
                <div
                  ref={(el) => {
                    (channelScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                    if (el) {
                      setChannelCanScrollLeft(el.scrollLeft > 4);
                      setChannelCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
                    }
                  }}
                  className="flex gap-1 overflow-x-auto py-1.5 px-1 scrollbar-none"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setChannelCanScrollLeft(el.scrollLeft > 4);
                    setChannelCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
                  }}
                >
                  {sortedAvailableWhatsapps.map((w) => {
                    const logo = getChannelLogo(w.type);
                    const isActive = selectedWhatsappIds.includes(w.id);
                    const status = w.status;
                    const isConnected = !status || status === "CONNECTED";
                    const isConnecting = status === "qrcode" || status === "OPENING" || status === "PAIRING" || status === "CONNECTING";
                    const isOffline = !!status && !isConnected && !isConnecting;
                    const dotClass = isOffline
                      ? "bg-destructive"
                      : isConnecting
                        ? "bg-warning"
                        : "";
                    const tooltipStatus = isOffline
                      ? t("statusDisconnected")
                      : isConnecting
                        ? t("statusConnecting")
                        : "";
                    return (
                      <Tooltip key={w.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => toggleWhatsappId(w.id)}
                            className={cn(
                              "relative flex items-center gap-1.5 shrink-0 h-8 px-2.5 rounded-full border-2 text-xs transition-colors",
                              isActive
                                ? "bg-primary text-primary-foreground border-primary"
                                : isOffline
                                  ? "bg-background text-foreground border-red-500 ring-2 ring-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  : isConnecting
                                    ? "bg-background text-foreground border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                    : "bg-background text-muted-foreground border-border hover:bg-accent"
                            )}
                          >
                            {logo && (
                              <img
                                src={logo}
                                alt={w.type}
                                className="h-5 w-5 object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            )}
                            <span className="max-w-[100px] truncate">{w.name}</span>
                            {dotClass && (
                              <span
                                className={cn(
                                  "absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                                  dotClass,
                                  "animate-pulse"
                                )}
                              />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {w.name}
                          {tooltipStatus && <span className="opacity-70"> — {tooltipStatus}</span>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            )}
            <div className={viewMode === "monitor" ? "flex items-center gap-1 flex-1 min-w-0" : "flex items-center gap-1"}>
              {viewMode !== "monitor" && <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="pl-8 pr-7 h-8 text-sm"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>}
              {viewMode !== "monitor" && <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => setGlobalSearchOpen(true)}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("searchMessageGlobal")}</TooltipContent>
              </Tooltip>}
              {availableWhatsapps.length > 0 && (() => {
                const modeConfig = channelHealthMode === "offline"
                  ? {
                      Icon: WifiOff,
                      count: channelHealth.offline,
                      rank: 0,
                      // !important nas classes de cor de texto p/ vencer o
                      // hover:text-accent-foreground do variant="outline".
                      btnClass: "border-red-500 !text-red-600 dark:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-950/40 hover:!text-red-700 dark:hover:!text-red-300",
                      dotClass: "bg-destructive",
                      label: t("statusDisconnected"),
                      pulse: channelHealth.offline > 0,
                      iconExtra: "",
                    }
                  : channelHealthMode === "online"
                    ? {
                        Icon: Wifi,
                        count: channelHealth.online,
                        rank: 2,
                        btnClass: "border-emerald-500 !text-emerald-600 dark:!text-emerald-400 hover:!bg-emerald-50 dark:hover:!bg-emerald-950/40 hover:!text-emerald-700 dark:hover:!text-emerald-300",
                        dotClass: "bg-success",
                        label: t("statusConnected"),
                        pulse: false,
                        iconExtra: "",
                      }
                    : {
                        Icon: Loader2,
                        count: channelHealth.connecting,
                        rank: 1,
                        btnClass: "border-amber-500 !text-amber-600 dark:!text-amber-400 hover:!bg-amber-50 dark:hover:!bg-amber-950/40 hover:!text-amber-700 dark:hover:!text-amber-300",
                        dotClass: "bg-warning",
                        label: t("statusConnecting"),
                        pulse: channelHealth.connecting > 0,
                        iconExtra: "animate-spin",
                      };
                const matching = availableWhatsapps.filter((w) => getChannelStatusRank(w.status) === modeConfig.rank);
                const Icon = modeConfig.Icon;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "relative h-8 px-2 shrink-0 gap-1",
                          modeConfig.btnClass
                        )}
                        onClick={() => {
                          setChannelHealthMode((prev) =>
                            prev === "online" ? "connecting" : prev === "connecting" ? "offline" : "online"
                          );
                        }}
                      >
                        <Icon className={cn("h-3.5 w-3.5", modeConfig.iconExtra)} />
                        <span className="text-xs font-semibold">{modeConfig.count}</span>
                        {modeConfig.pulse && (
                          <span className={cn("absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-background animate-pulse", modeConfig.dotClass)} />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[260px]">
                      <p className="font-medium mb-1">
                        {modeConfig.count} · {modeConfig.label}
                      </p>
                      {matching.length > 0 ? (
                        <ul className="text-xs space-y-0.5 opacity-90">
                          {matching.slice(0, 6).map((w) => (
                            <li key={w.id}>• {w.name}</li>
                          ))}
                          {matching.length > 6 && (
                            <li className="opacity-70">+ {matching.length - 6}</li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-xs opacity-70">—</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn((loadingMoreTickets || !hasMoreTickets) && "cursor-not-allowed")}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={loadMoreTickets}
                      disabled={loadingMoreTickets || !hasMoreTickets}
                      style={(loadingMoreTickets || !hasMoreTickets) ? { pointerEvents: "none" } : undefined}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", loadingMoreTickets && "animate-spin")} />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {loadingMoreTickets ? t("loadMoreLoading") : !hasMoreTickets ? t("loadMoreNoMore") : t("loadMore")}
                </TooltipContent>
              </Tooltip>
              {allowPause && (
                <Popover open={pausedPanelOpen} onOpenChange={(open) => { setPausedPanelOpen(open); if (open) loadPausedTickets(); }}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          variant={pausedPanelOpen ? "secondary" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0 shrink-0 relative"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          {pausedTickets.length > 0 && !pausedPanelOpen && (
                            <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] rounded-full bg-warning text-[9px] text-warning-foreground font-bold flex items-center justify-center px-0.5 leading-none">
                              {pausedTickets.length}
                            </span>
                          )}
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("pausedPanelTitle")}</TooltipContent>
                  </Tooltip>
                  <PopoverContent side="bottom" align="end" className="w-80 p-0">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="text-sm font-semibold">{t("pausedPanelTitle")}</span>
                      {!loadingPaused && (
                        <Badge variant="secondary" className="text-xs">{pausedTickets.length}</Badge>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {loadingPaused ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">{t("loading")}</div>
                      ) : pausedTickets.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">{t("noPausedTickets")}</div>
                      ) : (
                        <div className="p-1 space-y-0.5">
                          {pausedTickets.map((pt) => {
                            const ac = getAvatarColor(pt.contact?.name);
                            return (
                              <div key={pt.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors group">
                                <Avatar className="h-8 w-8 shrink-0">
                                  {isValidAvatarUrl(pt.contact?.profilePicUrl) && <AvatarImage src={pt.contact!.profilePicUrl!} />}
                                  <AvatarFallback className="text-xs font-semibold" style={{ backgroundColor: ac.background, color: ac.color }}>
                                    {getInitials(pt.contact?.name || "?")}
                                  </AvatarFallback>
                                </Avatar>
                                <button
                                  className="min-w-0 flex-1 text-left"
                                  onClick={() => { handleSelectTicket(pt); setPausedPanelOpen(false); }}
                                >
                                  <p className="text-xs font-medium truncate">{pt.contact?.name || tE("noName")}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">#{pt.id}{pt.queue?.name ? ` · ${pt.queue.name}` : ""}</p>
                                </button>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={async () => {
                                        try {
                                          await resumeTicket(pt.id);
                                          setPausedTickets((prev) => prev.filter((x) => x.id !== pt.id));
                                          toast.success(tE("ticketResumed"));
                                          const resumed = { ...pt, isPaused: false };
                                          handleSelectTicket(resumed);
                                          setPausedPanelOpen(false);
                                        } catch { toast.error(tE("errorPause")); }
                                      }}
                                    >
                                      <Play className="h-3.5 w-3.5 text-emerald-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{tE("resumeTicket")}</TooltipContent>
                                </Tooltip>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {/* In monitor mode: type tabs group + status tabs group (separate) */}
              {viewMode === "monitor" && (
                <div className="flex items-center gap-2 shrink-0">
                  {/* Group 1: Privados / Grupos / Chatbot */}
                  {tenantConfigsLoaded && !settingsLoading && (() => {
                    const lastType = showChatBotLane ? "chatbot" : !ignoreGroupMsg ? "groups" : "private";
                    return (
                      <div className="flex items-center border rounded-md overflow-visible">
                        <button type="button" onClick={() => setTabType("private")} className={cn("relative h-8 px-2.5 text-xs flex items-center gap-1 transition-colors border-r rounded-l-md", lastType === "private" && "rounded-r-md last:border-r-0", tabType === "private" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground")}>
                          {t("private")}
                          {universalCounter && tabUnreadCounts.private > 0 && (
                            <span className="absolute -top-2 -right-2 h-4 min-w-[16px] rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center px-1 pointer-events-none z-10">{tabUnreadCounts.private}</span>
                          )}
                        </button>
                        {!ignoreGroupMsg && (
                          <button type="button" onClick={() => setTabType("groups")} className={cn("relative h-8 px-2.5 text-xs flex items-center gap-1 transition-colors border-r", !showChatBotLane && "rounded-r-md border-r-0", tabType === "groups" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground")}>
                            <Users className="h-3 w-3" />{t("groups")}
                            {universalCounter && tabUnreadCounts.groups > 0 && (
                              <span className="absolute -top-2 -right-2 h-4 min-w-[16px] rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center px-1 pointer-events-none z-10">{tabUnreadCounts.groups}</span>
                            )}
                          </button>
                        )}
                        {showChatBotLane && (
                          <button type="button" onClick={() => setTabType("chatbot")} className={cn("relative h-8 px-2.5 text-xs flex items-center gap-1 transition-colors rounded-r-md", tabType === "chatbot" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground")}>
                            <Bot className="h-3 w-3" />{t("chatbot")}
                            {universalCounter && tabUnreadCounts.chatbot > 0 && (
                              <span className="absolute -top-2 -right-2 h-4 min-w-[16px] rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center px-1 pointer-events-none z-10">{tabUnreadCounts.chatbot}</span>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {/* Group 2: Abertos / Pendentes / Fechados */}
                  <div className="flex items-center border rounded-md overflow-visible">
                    {statusTabs.map((tab, idx) => (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setStatusFilter(tab.value)}
                        className={cn(
                          "relative h-8 px-2.5 text-xs flex items-center gap-1 transition-colors border-r",
                          idx === 0 && "rounded-l-md",
                          idx === statusTabs.length - 1 && "rounded-r-md border-r-0",
                          statusFilter === tab.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <tab.icon className={cn("h-3 w-3", statusFilter === tab.value ? "" : tab.color)} />
                        {tab.label}
                        {ticketCounts[tab.value] > 0 && (
                          <span className="absolute -top-2 -right-2 h-4 min-w-[16px] rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center px-1 pointer-events-none z-10">
                            {ticketCounts[tab.value]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap gap-1 min-w-0 -mt-1 max-h-16 overflow-y-auto pr-1 shrink-0">
                {activeFilterChips.map((chip, i) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] border border-primary/20 shrink-0">
                    <span className="truncate max-w-[140px]">{chip.label}</span>
                    <button type="button" onClick={chip.onRemove} className="hover:text-destructive leading-none shrink-0">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {viewMode !== "monitor" && (
            <Tabs
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
              }}
            >
              <TabsList className="w-full h-8 overflow-visible">
                {statusTabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="flex-1 text-xs h-6 gap-1 relative overflow-visible">
                    <tab.icon className={cn("h-3 w-3", tab.color)} />
                    {tab.label}
                    {tab.value === "pending" && (() => {
                      const autoDistQueues = queues.filter((q) => q.autoDistributeEnabled && q.isActive !== false);
                      return (
                        <Popover>
                          <Tooltip>
                            <PopoverTrigger asChild>
                              <TooltipTrigger asChild>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}
                                  className="inline-flex items-center justify-center text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer"
                                  aria-label={t("pendingTabAutoDistBanner")}
                                >
                                  <Info className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                            </PopoverTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
                              {t("pendingTabAutoDistBanner")}
                            </TooltipContent>
                          </Tooltip>
                          <PopoverContent side="bottom" align="center" className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-start gap-2 mb-2">
                              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                              <p className="text-xs leading-snug text-foreground">
                                {t("pendingTabAutoDistBanner")}
                              </p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-border">
                              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                                {t("pendingTabAutoDistPopoverTitle")}
                              </p>
                              {autoDistQueues.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic">
                                  {t("pendingTabAutoDistPopoverEmpty")}
                                </p>
                              ) : (
                                <ul className="space-y-1 max-h-40 overflow-y-auto">
                                  {autoDistQueues.map((q) => (
                                    <li key={q.id} className="flex items-center gap-2 text-xs">
                                      <span
                                        className="inline-block h-2 w-2 rounded-full shrink-0"
                                        style={{ backgroundColor: q.color }}
                                      />
                                      <span className="truncate">{q.name}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })()}
                    {ticketCounts[tab.value] > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center px-1 pointer-events-none z-10">
                        {formatCount(ticketCounts[tab.value])}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            )}
          </div>
          <Separator />
          {/* Pill "Reconectando..." — discreta, no topo da lista (abaixo da busca).
              Só UI: o resync de dados pós-reconexão já existe nos hooks de socket. */}
          {reconnecting && (
            <div className="sticky top-0 z-20 flex items-center justify-center gap-1.5 shrink-0 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/70 dark:border-amber-900/60 px-3 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("reconnecting")}
            </div>
          )}
          {viewMode === "monitor" ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {monitorKpis && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                  {[
                    { icon: MessageSquare, label: t("monitorKpiOpen"), tooltip: t("monitorKpiOpenTooltip"), value: monitorKpis.open, color: "text-success", bg: "bg-success/10" },
                    { icon: Clock, label: t("monitorKpiPending"), tooltip: t("monitorKpiPendingTooltip"), value: monitorKpis.pending, color: "text-warning", bg: "bg-warning/10" },
                    { icon: MessageCircle, label: t("monitorKpiUnread"), tooltip: t("monitorKpiUnreadTooltip"), value: monitorKpis.unread, color: "text-info", bg: "bg-info/10" },
                    { icon: Hourglass, label: t("monitorKpiOldestWait"), tooltip: t("monitorKpiOldestWaitTooltip"), value: monitorKpis.oldestPendingAt != null ? (timeAgo(new Date(monitorKpis.oldestPendingAt).toISOString()) || "<1m") : "—", color: "text-orange-500", bg: "bg-orange-500/10" },
                    { icon: Users, label: t("monitorKpiActiveAgents"), tooltip: t("monitorKpiActiveAgentsTooltip"), value: monitorKpis.activeAgents, color: "text-purple-500", bg: "bg-purple-500/10" },
                  ].map((kpi, i) => {
                    const Icon = kpi.icon;
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <Card className="p-2.5 min-w-0 cursor-help">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-7 w-7 items-center justify-center rounded-md ${kpi.bg} shrink-0`}>
                                <Icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                              </div>
                              <span className="text-[10px] text-muted-foreground truncate leading-tight">{kpi.label}</span>
                            </div>
                            <div className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</div>
                          </Card>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-snug">
                          {kpi.tooltip}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
              {Object.keys(groupedByChannel).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
                  <Wifi className="h-14 w-14 mb-3 opacity-30" />
                  <p className="text-sm">{t("sidebarEmpty")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Object.entries(groupedByChannel).map(([key, { name, tickets: items }]) => {
                    const openCount = items.filter(tk => tk.status === "open").length;
                    const pendingCount = items.filter(tk => tk.status === "pending").length;
                    const unreadTotal = items.reduce((sum, tk) => sum + (tk.unreadMessages || 0), 0);
                    let oldestPendingTs = Infinity;
                    for (const tk of items) {
                      if (tk.status !== "pending") continue;
                      const ts = new Date(tk.createdAt).getTime();
                      if (Number.isFinite(ts) && ts < oldestPendingTs) oldestPendingTs = ts;
                    }
                    const oldestPendingLabel = oldestPendingTs !== Infinity
                      ? (timeAgo(new Date(oldestPendingTs).toISOString()) || "<1m")
                      : null;
                    return (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="min-w-0"
                      >
                        <Card className="h-[380px] flex flex-col min-w-0 overflow-hidden">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                                <Wifi className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-sm font-semibold truncate">{name}</CardTitle>
                                <div className="flex gap-1.5 mt-1 flex-wrap">
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {t("tabOpen")}: {openCount}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {t("tabPending")}: {pendingCount}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {t("monitorChannelTotal")}: {items.length}
                                  </Badge>
                                  {unreadTotal > 0 && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-info hover:bg-info" title={t("monitorKpiUnread")}>
                                      <MessageCircle className="h-2.5 w-2.5 mr-0.5" />{unreadTotal}
                                    </Badge>
                                  )}
                                  {oldestPendingLabel && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500/40 text-orange-600 dark:text-orange-400" title={t("monitorKpiOldestWait")}>
                                      <Hourglass className="h-2.5 w-2.5 mr-0.5" />{oldestPendingLabel}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <Separator />
                          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                            <div className="p-3 space-y-2">
                              {items.map((ticket) => (
                                <div
                                  key={ticket.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => { handleSelectTicket(ticket); setViewMode("list"); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") { handleSelectTicket(ticket); setViewMode("list"); } }}
                                  className={`flex items-center gap-2 rounded-lg border p-2.5 hover:bg-muted/50 transition-colors cursor-pointer ${currentTicket?.id === ticket.id ? "bg-muted border-primary/40" : ""}`}
                                >
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold shrink-0">
                                    {ticket.contact?.name?.charAt(0)?.toUpperCase() || "#"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium truncate">{ticket.contact?.name || `#${ticket.id}`}</span>
                                      {ticket.unreadMessages > 0 && (
                                        <Badge className="text-[10px] px-1 py-0 h-4 bg-success shrink-0">{ticket.unreadMessages}</Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {(getSyntheticBodyLabel(ticket.lastMessage, tE) ?? getTicketLastMessagePreview(ticket.lastMessage)) || ""}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                                      {ticket.user?.name || "—"}
                                    </p>
                                    {/* Fila e Canal sempre visíveis no card — mantém paridade com painel-atendimentos
                                        e com o painel Vue legado, onde clientes usam essas infos pra distribuir pendentes. */}
                                    <div className="flex gap-1 mt-1 flex-wrap">
                                      {ticket.queue?.name ? (() => {
                                        const queueColor = ticket.queue.color || "#64748b";
                                        return (
                                          <Badge
                                            variant="secondary"
                                            className="text-[9px] h-4 px-1 leading-none border-0"
                                            style={{ backgroundColor: queueColor, color: getReadableTextColor(queueColor) }}
                                            title={ticket.queue.name}
                                          >
                                            {ticket.queue.name}
                                          </Badge>
                                        );
                                      })() : null}
                                      {ticket.whatsapp?.name && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1 leading-none" title={ticket.whatsapp.name}>
                                          {ticket.whatsapp.name}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7"
                                            onClick={() => { setSpyTicket(ticket); setSpyOpen(true); }}
                                          >
                                            <Eye className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t("spyConversation")}</TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <Badge
                                      variant={ticket.status === "open" ? "default" : ticket.status === "pending" ? "secondary" : "outline"}
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      {ticket.status === "open" ? t("tabOpen") : ticket.status === "pending" ? t("tabPending") : t("tabClosed")}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">#{ticket.id}</span>
                                    <span className={`text-[10px] ${timeAgoColor(ticketBadgeDate(ticket))}`}>{timeAgo(ticketBadgeDate(ticket))}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
          <ScrollArea ref={listScrollRef} className="flex-1 min-h-0 min-w-0 overflow-x-hidden">
            {loading && tickets.length === 0 ? (
              <div className="p-1 space-y-0.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border-l-[3px] border-l-muted">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-3 w-[85%]" />
                      <div className="flex gap-1">
                        <Skeleton className="h-[18px] w-16 rounded-full" />
                        <Skeleton className="h-[18px] w-12 rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground min-w-0">
                {(search || activeFiltersCount > 0) ? (
                  <Filter className="h-10 w-10 mb-2 opacity-40" />
                ) : (
                  <Inbox className="h-10 w-10 mb-2 opacity-40" />
                )}
                <p className="text-sm text-center px-4">
                  {search
                    ? t("noResultsFor", { term: search })
                    : activeFiltersCount > 0
                    ? t("noTicketsWithFilters")
                    : t("sidebarEmpty")}
                </p>
                {(search || activeFiltersCount > 0) && (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); handleClearFilters(); }}
                    className="text-xs text-primary mt-1.5 hover:underline"
                  >
                    {t("clearSearchAndFilters")}
                  </button>
                )}
                {hasMoreTickets && !loading && (
                  <div className="mt-4 flex justify-center w-full min-w-0 px-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-w-[7.5rem] shrink-0"
                      onClick={loadMoreTickets}
                      disabled={loadingMoreTickets}
                    >
                      {loadingMoreTickets ? t("loading") : t("loadMore")}
                    </Button>
                  </div>
                )}
                {hasMoreTickets && <div ref={loadMoreSentinelRef} className="h-1 shrink-0" aria-hidden />}
              </div>
            ) : (
              <div className="p-1 min-w-0 w-full max-w-full overflow-hidden box-border flex flex-col">
                <AnimatePresence initial={false}>
                {filteredTickets.map((ticket) => (
                  <motion.div
                    key={ticket.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20, scaleY: 0.8, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{ overflow: "hidden" }}
                  >
                  <TicketListItem
                    ticket={ticket}
                    active={currentTicket?.id === ticket.id}
                    onClick={() => handleSelectTicket(ticket)}
                    onAccept={handleAcceptTicket}
                    onClose={(controlFeatures && user?.profile === "user") ? undefined : handleCloseTicket}
                    onSpy={(controlFeatures && user?.profile === "user") ? undefined : (t) => { setSpyTicket(t); setSpyOpen(true); }}
                    bulkMode={bulkMode}
                    selected={selectedTicketIds.has(ticket.id)}
                    onToggleSelect={toggleTicketSelect}
                    isRestricted={isRestricted}
                    kanbansList={kanbansList}
                    reasonsList={pageReasonsList}
                    density={density}
                    isPinned={pinnedTickets.includes(ticket.id)}
                    onPin={togglePin}
                    crossSiblings={crossSiblingsByTicketId[ticket.id]}
                    onMarkRead={async (t) => {
                      try {
                        await updateTicket(t.id, { unreadMessages: 0 });
                        updateTicketInStore({ id: t.id, unreadMessages: 0 });
                        markNotificationAsRead(t.id);
                      } catch { /* ignore */ }
                    }}
                    onMarkUnread={async (t) => {
                      try {
                        await updateTicket(t.id, { unreadMessages: 1 });
                        updateTicketInStore({ id: t.id, unreadMessages: 1 });
                        // Sync notification badge: add/restore notification as unread
                        const { notifications: prevNotifs } = useNotificationStore.getState();
                        const existing = prevNotifs.find((n) => n.ticketId === t.id);
                        if (existing) {
                          setTicketNotifications(prevNotifs.map((n) =>
                            n.ticketId === t.id ? { ...n, read: false } : n
                          ));
                        } else {
                          addTicketNotification({
                            id: t.id,
                            message: `${t.contact?.name || ""}: `,
                            read: false,
                            createdAt: t.updatedAt ?? new Date().toISOString(),
                            ticketId: t.id,
                          });
                        }
                      } catch { /* ignore */ }
                    }}
                  />
                  </motion.div>
                ))}
                </AnimatePresence>
                {hasMoreTickets && !loading && (
                  <div className="p-2 w-full flex justify-center items-center shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-w-[7.5rem] shrink-0"
                      onClick={loadMoreTickets}
                      disabled={loadingMoreTickets}
                    >
                      {loadingMoreTickets ? t("loading") : t("loadMore")}
                    </Button>
                  </div>
                )}
                {hasMoreTickets && <div ref={loadMoreSentinelRef} className="h-1 shrink-0" aria-hidden />}
              </div>
            )}
          </ScrollArea>
          )}
        </div>

        {/* Chat — on mobile: only shown when a ticket is selected; hidden in monitor mode */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0 min-h-0",
          viewMode === "monitor" ? "hidden" : (!currentTicket ? "hidden md:flex" : "flex")
        )}>
          {/* Mobile back button */}
          {currentTicket && (
            <button
              className="md:hidden flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border-b bg-background shrink-0"
              onClick={() => setCurrentTicket(null)}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> <span>{tNC("back")}</span>
            </button>
          )}
        <ChatArea
          ticket={currentTicket}
          messages={messages}
          loading={loading}
          messagesLoading={messagesLoading}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onSendText={handleSendText}
          onSendMedia={handleSendMedia}
          onSendLocation={handleSendLocation}
          onDeleteMessage={handleDeleteMessage}
          onForwardMessage={handleForwardMessage}
          onForwardPrivateMessage={openForwardPrivate}
          onForwardOtherChannelMessage={(msg) => { setForwardOtherChannelMsg(msg); setForwardOtherChannelWhatsappId(""); }}
          onReactMessage={handleReactMessage}
          onEditMessage={handleEditMessage}
          onStarMessage={handleStarMessage}
          onPinMessage={handleOpenPinDialog}
          pinnedMessages={pinnedMessages}
          multiForwardActive={multiForwardActive}
          multiForwardSelected={multiForwardSelected}
          onToggleMultiForward={() => { setMultiForwardActive((v) => !v); setMultiForwardSelected([]); }}
          onToggleMultiForwardMsg={toggleMultiForwardMsg}
          onTransfer={handleHeaderTransfer}
          onToggleDetail={() => setDetailOpen(!detailOpen)}
          onCloseChat={() => { selectionRef.current = null; setCurrentTicket(null); }}
          onOpenDetailTab={(tab) => { setDetailTab(tab); setDetailOpen(true); }}
          detailOpen={detailOpen}
          onRefresh={async () => {
            const ticketId = currentTicket?.id;
            if (!ticketId) return;
            try {
              const { data: tData } = await fetchTicket(ticketId);
              if (!tData) return;
              // Stale-fetch guard: descarta se o usuario trocou de ticket no meio do refresh
              if (selectionRef.current !== null && selectionRef.current !== ticketId) return;
              const updated = normalizeTicket(tData as Record<string, unknown>);
              if (updated.status === "closed") {
                setCurrentTicket(null);
                setTickets(tickets.filter((t) => t.id !== ticketId));
                return;
              }
              setCurrentTicket(updated);
              if (updated.status === "open") {
                const { data } = await fetchMessages(ticketId, { pageNumber: 1 });
                if (selectionRef.current !== null && selectionRef.current !== ticketId) return;
                const msgs = data?.messages || [];
                setMessages(msgs);
                setHasMore(data?.hasMore ?? msgs.length >= 20);
              }
            } catch { /* ignore */ }
          }}
          queues={allQueues}
          users={usersList}
          autoScrollEnabled={autoScrollEnabled}
          onToggleAutoScroll={() => {
            if (currentTicket) {
              localStorage.setItem(`autoScrollEnabled_${currentTicket.id}`, String(!autoScrollEnabled));
            }
            setAutoScrollEnabled((p) => !p);
          }}
          onOpenEmailModal={handleOpenEmailModal}
          userName={typeof window !== "undefined" ? (user?.username ?? localStorage.getItem("username")) : (user?.username ?? null)}
          signatureEnabled={forceSignature ? true : signatureEnabled}
          onToggleSignature={forceSignature ? undefined : (v) => {
            localStorage.setItem("signatureEnabled", String(v));
            setSignatureEnabled(v);
          }}
          allowPause={allowPause}
          forceReason={forceReason}
          controlFeatures={controlFeatures}
          userProfile={user?.profile}
          convitesCount={convitesList.length}
          onOpenConvites={() => setConvitesOpen(true)}
          availableWhatsapps={availableWhatsapps}
          clearReplySignal={clearReplySignal}
          onSearchHistory={handleSearchMessagesInHistory}
          searchingHistory={searching}
          searchNav={searchNav}
          unreadAtOpen={unreadAtOpen}
          onAcceptTicket={handleAcceptTicket}
          onRetryMessage={handleRetryMessage}
        />
        </div>

        {/* Detail Panel */}
        {currentTicket && (
          <TicketDetail
            ticket={currentTicket}
            open={detailOpen}
            onClose={() => setDetailOpen(false)}
            defaultTab={detailTab}
            queues={allQueues}
            users={usersList}
            tags={tagsList.map((t) => ({ id: t.id, name: t.name ?? t.tag ?? "", color: t.color ?? "#3B82F6", isActive: t.isActive }))}
            whatsapps={whatsappsList}
            chatFlows={chatFlowsList}
            kanbans={kanbansList}
            onTransfer={handleTransfer}
            onRefresh={() => {
              if (currentTicket) refreshCurrentTicket(currentTicket.id);
            }}
            onScrollToMessage={(msgId) => {
              setDetailOpen(false);
              setTimeout(() => {
                handleScrollToMessageInHistory(msgId);
              }, 300);
            }}
          />
        )}

        {/* Convites (tickets compartilhados com o usuário) */}
        <Dialog open={convitesOpen} onOpenChange={setConvitesOpen}>
          <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MailOpen className="h-5 w-5" /> {t("sharedInvites")}
              </DialogTitle>
              <DialogDescription>{t("sharedInvitesDesc")}</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 min-h-[200px] pr-3">
              {loadingConvites ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : convitesList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {t("noInvites")}
                </div>
              ) : (
                <div className="space-y-2">
                  {convitesList.map((c) => {
                    const ticketId = c.ticketId ?? (c.ticket as { id?: number })?.id ?? 0;
                    const name = (c.ticket as { contact?: { name?: string } })?.contact?.name ?? c.contact?.name ?? `Ticket #${ticketId}`;
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <button
                          type="button"
                          className="flex-1 text-left text-sm font-medium truncate"
                          onClick={() => ticketId && handleOpenConviteTicket(ticketId)}
                        >
                          {name}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveConvite(c.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Encaminhar para Contato */}
        <Dialog open={!!forwardContactMsg} onOpenChange={(o) => { if (!o) { setForwardContactMsg(null); setMultiForwardActive(false); setMultiForwardSelected([]); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("forwardMessage")}</DialogTitle>
              <DialogDescription>{t("forwardContactDesc")}</DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <Input
                placeholder={t("searchContact")}
                value={forwardContactSearch}
                onChange={(e) => searchForwardContacts(e.target.value)}
                autoFocus
              />
              {forwardContactLoading && <p className="text-xs text-muted-foreground text-center">{t("searching")}</p>}
              <div className="max-h-52 overflow-y-auto space-y-1">
                {forwardContactList.map((c) => {
                  const checked = forwardContactSelected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 hover:bg-muted transition-colors ${checked ? "bg-primary/10" : ""}`}
                      onClick={() => toggleForwardContact(c)}
                    >
                      <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center text-[10px] ${checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"}`}>
                        {checked && "✓"}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{c.number}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {forwardContactSelected.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("forwardSelectedContacts", { count: forwardContactSelected.size })}
                  {multiForwardSelected.length > 0 && ` · ${multiForwardSelected.length} ${t("messages")}`}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setForwardContactMsg(null); setMultiForwardActive(false); setMultiForwardSelected([]); }}>{t("cancel")}</Button>
              <Button onClick={confirmForwardContact} disabled={forwardContactSelected.size === 0 || forwardContactSending}>
                {forwardContactSending ? t("sending") : t("forward")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Encaminhar para Chat Privado */}
        <Dialog open={!!forwardPrivateMsg} onOpenChange={(o) => { if (!o) setForwardPrivateMsg(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Encaminhar para Chat Privado</DialogTitle>
              <DialogDescription>{t("forwardPrivateChatDesc")}</DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-2">
              {forwardPrivateLoading ? (
                <div className="flex justify-center py-4"><RefreshCw className="h-5 w-5 animate-spin" /></div>
              ) : (
                <>
                  <Input
                    placeholder={t("searchUserPlaceholder")}
                    value={forwardPrivateSearch}
                    onChange={(e) => setForwardPrivateSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="max-h-52 overflow-y-auto space-y-0.5 rounded-md border p-1">
                    {forwardPrivateUsers
                      .filter((u) => u.name.toLowerCase().includes(forwardPrivateSearch.toLowerCase()))
                      .map((u) => (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted text-sm select-none"
                        >
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={forwardPrivateSelectedUsers.has(u.id)}
                            onChange={(e) => {
                              setForwardPrivateSelectedUsers((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(u.id); else next.delete(u.id);
                                return next;
                              });
                            }}
                          />
                          {u.name}
                        </label>
                      ))
                    }
                    {forwardPrivateUsers.filter((u) => u.name.toLowerCase().includes(forwardPrivateSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">{t("noUserFound")}</p>
                    )}
                  </div>
                  {forwardPrivateSelectedUsers.size > 0 && (
                    <p className="text-xs text-muted-foreground">{forwardPrivateSelectedUsers.size} {t("usersSelected")}</p>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForwardPrivateMsg(null)}>{t("cancel")}</Button>
              <Button onClick={confirmForwardPrivate} disabled={forwardPrivateSelectedUsers.size === 0 || forwardPrivateLoading}>
                {forwardPrivateLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
                {t("forward")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmar Encerramento Forçado */}
        <Dialog open={!!closeConfirmTicket} onOpenChange={(o) => { if (!o && !closeConfirmLoading) setCloseConfirmTicket(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{tMixin("titles.encerrarAtendimento")}</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-1">
                  <p>{closeConfirmTicket ? tMixin("dialogs.encerrarForcado", { id: closeConfirmTicket.id }) : ""}</p>
                  <p className="text-xs text-muted-foreground">{tMixin("dialogs.encerrarForcadoDesc")}</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCloseConfirmTicket(null)} disabled={closeConfirmLoading}>
                {t("cancel")}
              </Button>
              <Button onClick={confirmCloseTicket} disabled={closeConfirmLoading}>
                {closeConfirmLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t("confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Encaminhar para Outro Canal */}
        <Dialog open={!!forwardOtherChannelMsg} onOpenChange={(o) => { if (!o) setForwardOtherChannelMsg(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Encaminhar para Outro Canal</DialogTitle>
              <DialogDescription>{t("selectDestinationDesc")}</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <SearchableSelect
                options={whatsappsList.map((w) => ({ value: String(w.id), label: w.name }))}
                value={forwardOtherChannelWhatsappId}
                onValueChange={setForwardOtherChannelWhatsappId}
                placeholder={t("selectChannelPlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForwardOtherChannelMsg(null)}>{t("cancel")}</Button>
              <Button onClick={confirmForwardOtherChannel} disabled={!forwardOtherChannelWhatsappId}>
                {t("forward")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Webmail: escrever email */}
        <Dialog open={webmailModalOpen} onOpenChange={setWebmailModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> {t("webmailTitle")}</DialogTitle>
              <DialogDescription>{t("webmailDesc")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="webmail-to">{t("webmailTo")}</Label>
                <Input id="webmail-to" value={webmailTo} onChange={(e) => setWebmailTo(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="webmail-cc">{t("webmailCcOpt")}</Label>
                <Input id="webmail-cc" value={webmailCc} onChange={(e) => setWebmailCc(e.target.value)} placeholder={t("separatedByComma")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="webmail-bcc">{t("webmailBccOpt")}</Label>
                <Input id="webmail-bcc" value={webmailBcc} onChange={(e) => setWebmailBcc(e.target.value)} placeholder={t("separatedByComma")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="webmail-subject">{t("webmailSubjectLabel")}</Label>
                <Input id="webmail-subject" value={webmailSubject} onChange={(e) => setWebmailSubject(e.target.value)} placeholder="Assunto do e-mail" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="webmail-body">{t("webmailMessageLabel")}</Label>
                <Textarea id="webmail-body" value={webmailBody} onChange={(e) => setWebmailBody(e.target.value)} placeholder="Corpo do e-mail" rows={6} className="resize-none" />
              </div>
              <div className="grid gap-2">
                <Label>{t("webmailAttachOpt")}</Label>
                <input
                  ref={webmailFileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    const list = e.target.files ? Array.from(e.target.files) : [];
                    setWebmailFiles((prev) => [...prev, ...list].slice(0, 10));
                    e.target.value = "";
                  }}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => webmailFileInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Paperclip className="h-4 w-4" />
                    {t("attachFiles")}
                  </Button>
                  {webmailFiles.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("filesCountMax", { count: webmailFiles.length })}
                    </span>
                  )}
                </div>
                {webmailFiles.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {webmailFiles.map((file, i) => (
                      <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 bg-muted/50">
                        <span className="truncate flex-1 min-w-0">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => setWebmailFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWebmailModalOpen(false)}>{t("cancel")}</Button>
              <Button onClick={handleSendEmailWebmail} disabled={webmailLoading || !webmailTo.trim() || !webmailSubject.trim() || !webmailBody.trim()}>
                {webmailLoading ? t("sending") : t("send")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Quick-close Force Reason Dialog (for TicketListItem quick-close button) */}
        <Dialog open={quickCloseForceReasonOpen} onOpenChange={(o) => { if (!o) { setQuickCloseForceReasonOpen(false); setQuickCloseForceReasonTicket(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("demandTitle")}</DialogTitle>
              <DialogDescription>{t("demandDesc")}</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {quickCloseReasonsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-y-auto max-h-60">
                  <div className="space-y-1.5 pr-2">
                    <button
                      type="button"
                      onClick={() => setQuickCloseSelectedReasonId(null)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md border text-sm transition-colors",
                        quickCloseSelectedReasonId === null
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border hover:bg-accent"
                      )}
                    >
                      {t("noneOption")}
                    </button>
                    {quickCloseReasonsList.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setQuickCloseSelectedReasonId(r.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md border text-sm transition-colors flex items-center gap-2",
                          quickCloseSelectedReasonId === r.id
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border hover:bg-accent"
                        )}
                      >
                        {r.color && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full border border-black/10 shrink-0"
                            style={{ backgroundColor: r.color }}
                          />
                        )}
                        <span className="truncate">{r.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setQuickCloseForceReasonOpen(false); setQuickCloseForceReasonTicket(null); }}>{t("cancel")}</Button>
              <Button
                disabled={quickCloseReasonsLoading}
                onClick={async () => {
                  if (quickCloseSelectedReasonId === null) { toast.error(t("selectReason")); return; }
                  if (!quickCloseForceReasonTicket) return;
                  const ticket = quickCloseForceReasonTicket;
                  setQuickCloseForceReasonOpen(false);
                  setQuickCloseForceReasonTicket(null);
                  try {
                    await updateTicket(ticket.id, { reasons: quickCloseSelectedReasonId });
                    toast.success(t("demandSaved"));
                    loadTickets({ upToPage: ticketsPageNumberRef.current });
                  } catch {
                    toast.error(t("errorSavingDemand"));
                  }
                }}
              >
                {t("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Iniciar conversa avulsa ──────────────────────────────────── */}
        <Dialog open={avulsaOpen} onOpenChange={(o) => { if (!avulsaSending) { setAvulsaOpen(o); if (!o) { setAvulsaSelectedTemplate(null); setAvulsaTemplateVars([]); setAvulsaTemplateSearch(""); setAvulsaConnectionFilter(null); setAvulsaContactSearch(""); setAvulsaContactResults([]); setAvulsaEmail(""); setAvulsaEmailSubject(""); setAvulsaQueue("none"); setAvulsaApplyBrPhoneCorrection(true); setAvulsaOrderDetails(emptyOrderDetails()); } } }}>
          <DialogContent className="sm:max-w-lg w-full" style={{ maxHeight: "90dvh", display: "flex", flexDirection: "column" }}>
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                {t("avulsaTitle")}
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        tabIndex={-1}
                        onFocus={(e) => e.currentTarget.blur()}
                        aria-label={t("avulsaHelpAria")}
                        className="text-muted-foreground hover:text-foreground transition-colors outline-none"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                      <p className="font-semibold mb-1">{t("avulsaHelpTitle")}</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>{t("avulsaHelpItem1")}</li>
                        <li>{t("avulsaHelpItem2")}</li>
                        <li>{t("avulsaHelpItem3")}</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </DialogTitle>
              <DialogDescription>
                {t("avulsaDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto min-h-0 flex-1 space-y-4 py-2 pr-1">
              <div className="space-y-2">
                <Label>{t("connectionLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={avulsaConnectionFilter === null ? "default" : "outline"}
                    onClick={() => setAvulsaConnectionFilter(null)}
                  >
                    {t("filterAll")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={avulsaConnectionFilter === "official" ? "default" : "outline"}
                    onClick={() => setAvulsaConnectionFilter("official")}
                  >
                    {t("filterApiOfficial")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={avulsaConnectionFilter === "unofficial" ? "default" : "outline"}
                    onClick={() => setAvulsaConnectionFilter("unofficial")}
                  >
                    {t("filterApiUnofficial")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={avulsaConnectionFilter === "email" ? "default" : "outline"}
                    onClick={() => setAvulsaConnectionFilter("email")}
                  >
                    Email
                  </Button>
                </div>
                <SearchableSelect
                  options={availableWhatsapps
                    .filter((w) => w.status === "CONNECTED" && ["whatsapp", "baileys", "zapo", "meow", "evo", "evogo", "uazapi", "zapi", "waba", "dialog360", "gupshup", "email", "webmail"].includes((w.type ?? "").toLowerCase()))
                    .filter((w) => {
                      const tp = (w.type ?? "").toLowerCase();
                      const isEmailType = tp === "email" || tp === "webmail";
                      const isOfficialType = tp === "waba" || tp === "dialog360" || tp === "gupshup";
                      if (avulsaConnectionFilter === "official") return isOfficialType;
                      if (avulsaConnectionFilter === "email") return isEmailType;
                      if (avulsaConnectionFilter === "unofficial") return !isOfficialType && !isEmailType;
                      return true;
                    })
                    .map((w) => ({ value: String(w.id), label: `${w.name}${w.type ? ` (${w.type})` : ""}` }))}
                  value={avulsaWhatsappId}
                  onValueChange={setAvulsaWhatsappId}
                  placeholder={t("selectConnectionPlaceholder")}
                />
                {(() => {
                  const wp = whatsappsList.find((w) => String(w.id) === avulsaWhatsappId);
                  const isWaba = (wp?.type ?? "").toLowerCase() === "waba";
                  if (!isWaba || !wp) return null;
                  return (
                    <WabaConnectionQualityBadge
                      bmToken={wp.bmToken}
                      tokenAPI={wp.tokenAPI}
                      wabaId={wp.wabaId}
                      phoneHint={wp.number}
                      wabaVersion={wp.wabaVersion}
                      loadingLabel={t("qualityLoading")}
                      tooltipTitle={t("qualityTitle")}
                      tooltipBody={t("qualityBody")}
                    />
                  );
                })()}
              </div>
              {(() => {
                const wpQ = whatsappsList.find((w) => String(w.id) === avulsaWhatsappId);
                const isAvulsaEmailQ = ["email", "webmail"].includes((wpQ?.type ?? "").toLowerCase());
                const activeQueues = queues.filter((q) => q.isActive !== false);
                if (isAvulsaEmailQ || activeQueues.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <Label>{tNC("queueLabel")}</Label>
                    <Select value={avulsaQueue} onValueChange={setAvulsaQueue}>
                      <SelectTrigger><SelectValue placeholder={tNC("queuePlaceholder")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tNC("queueNone")}</SelectItem>
                        {activeQueues.map((q) => (
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
                );
              })()}
              {(() => {
                const wpAv = whatsappsList.find((w) => String(w.id) === avulsaWhatsappId);
                const isAvulsaEmail = ["email", "webmail"].includes((wpAv?.type ?? "").toLowerCase());
                return (
                  <div className="space-y-2">
                    <Label>
                      {isAvulsaEmail ? "Email do destinatario *" : <>{t("phoneNumberLabel")} <span className="text-muted-foreground text-xs">{t("phoneDdiHint")}</span></>}
                    </Label>
                    {/* Busca de contato no sistema — pré-seleciona email/número conforme canal */}
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={avulsaContactSearch}
                        onChange={(e) => setAvulsaContactSearch(e.target.value)}
                        placeholder={tMsgInput("vcardSearchPlaceholder")}
                        className="h-8 text-sm pl-7"
                      />
                      {avulsaContactLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>
                    {avulsaContactResults.length > 0 && (
                      <div className="max-h-40 overflow-y-auto rounded border divide-y">
                        {avulsaContactResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                            onClick={() => {
                              setAvulsaNumber((c.number || "").replace(/[^\d+]/g, ""));
                              if ((c as { email?: string }).email) {
                                setAvulsaEmail((c as { email?: string }).email || "");
                              }
                              setAvulsaContactSearch("");
                              setAvulsaContactResults([]);
                            }}
                          >
                            <div className="font-medium leading-none">{c.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {c.number}
                              {(c as { email?: string }).email ? ` · ${(c as { email?: string }).email}` : ""}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {avulsaContactSearch.trim() && !avulsaContactLoading && avulsaContactResults.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-1">{tMsgInput("vcardNoResults")}</p>
                    )}
                    {isAvulsaEmail ? (
                      <>
                        <Input
                          value={avulsaEmail}
                          onChange={(e) => setAvulsaEmail(e.target.value)}
                          placeholder="contato@exemplo.com"
                          type="email"
                        />
                        <Label className="pt-2">Assunto *</Label>
                        <Input
                          value={avulsaEmailSubject}
                          onChange={(e) => setAvulsaEmailSubject(e.target.value)}
                          placeholder="Assunto do e-mail"
                        />
                      </>
                    ) : (
                      <>
                        <Input
                          value={avulsaNumber}
                          onChange={(e) => setAvulsaNumber(e.target.value.replace(/[^\d+]/g, ""))}
                          placeholder="5511999999999"
                        />
                        {(() => {
                          const raw = avulsaNumber.replace(/\D/g, "");
                          const normalized = normalizeBrPhone(raw);
                          if (raw.length >= 12 && raw.startsWith("55") && normalized !== raw) {
                            return (
                              <div className="text-xs rounded border border-amber-300 bg-amber-50 p-2 space-y-1.5 dark:bg-amber-900/20 dark:border-amber-800">
                                <p className="font-medium text-amber-700 dark:text-amber-400">
                                  {tNC("brPhoneAdjusted")}
                                </p>
                                <p className="font-mono text-amber-900 dark:text-amber-300">
                                  <span className={cn(!avulsaApplyBrPhoneCorrection ? "font-semibold" : "line-through opacity-60")}>{raw}</span>
                                  <span className="mx-1">→</span>
                                  <span className={cn(avulsaApplyBrPhoneCorrection ? "font-semibold" : "line-through opacity-60")}>{normalized}</span>
                                </p>
                                <div className="flex gap-1.5 pt-0.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={avulsaApplyBrPhoneCorrection ? "default" : "outline"}
                                    className="h-7 text-[11px] px-2"
                                    onClick={() => setAvulsaApplyBrPhoneCorrection(true)}
                                  >
                                    {tNC("brPhoneApplyCorrection")}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={!avulsaApplyBrPhoneCorrection ? "default" : "outline"}
                                    className="h-7 text-[11px] px-2"
                                    onClick={() => setAvulsaApplyBrPhoneCorrection(false)}
                                  >
                                    {tNC("brPhoneKeepOriginal")}
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
                );
              })()}
              {(() => {
                const wp = whatsappsList.find((w) => String(w.id) === avulsaWhatsappId);
                const tpType = (wp?.type ?? "").toLowerCase();
                const isWabaLike = tpType.includes("waba") || tpType === "dialog360" || tpType === "gupshup";
                const filteredAvulsaTemplates = avulsaWabaTemplates.filter(
                  (tp) => !avulsaTemplateSearch || tp.name.toLowerCase().includes(avulsaTemplateSearch.toLowerCase())
                );
                if (isWabaLike) {
                  return (
                    <div className="space-y-2 w-full min-w-0 overflow-hidden">
                      <Label>{t("wabaTemplateLabel")}</Label>
                      {avulsaLoadingTemplates ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
                        </div>
                      ) : !avulsaSelectedTemplate ? (
                        <>
                          <Input
                            placeholder={t("searchTemplatePlaceholder")}
                            value={avulsaTemplateSearch}
                            onChange={(e) => setAvulsaTemplateSearch(e.target.value)}
                            className="h-8 text-sm"
                          />
                          {filteredAvulsaTemplates.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">{t("noTemplatesFound")}</p>
                          ) : (
                            <div className="max-h-[200px] overflow-y-auto" style={{ overflowX: "hidden" }}>
                              <div className="space-y-1" style={{ width: "100%", maxWidth: "100%" }}>
                                {filteredAvulsaTemplates.map((tp) => (
                                  <div
                                    key={`${tp.name}-${tp.language}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setAvulsaSelectedTemplate(tp)}
                                    onKeyDown={(e) => e.key === "Enter" && setAvulsaSelectedTemplate(tp)}
                                    className="w-full text-left p-2.5 rounded-lg border text-sm transition-colors hover:bg-accent border-transparent cursor-pointer overflow-hidden"
                                    style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
                                  >
                                    <p className="font-medium" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tp.name}</p>
                                    <p className="text-xs text-muted-foreground" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {tp.language}
                                      {tp.status && <span className="ml-2 text-emerald-600">{tp.status}</span>}
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
                            <button onClick={() => setAvulsaSelectedTemplate(null)} className="text-xs text-primary hover:underline">{t("back")}</button>
                            <span className="text-sm font-semibold truncate">{avulsaSelectedTemplate.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">{avulsaSelectedTemplate.language}</span>
                          </div>
                          <div className="overflow-y-auto space-y-2" style={{ maxHeight: "42vh" }}>
                            {/* Preview */}
                            <div className="bg-[#e5ddd5] rounded-lg p-3">
                              <div className="bg-white rounded-lg shadow-sm p-3 max-w-[90%] ml-auto space-y-1.5">
                                {avulsaSelectedTemplate.components?.find((c) => c.type === "HEADER") && (() => {
                                  const hdr = avulsaSelectedTemplate.components!.find((c) => c.type === "HEADER")!;
                                  if (hdr.format === "TEXT" && hdr.text) {
                                    let rendered = hdr.text;
                                    avulsaTemplateVars.filter((v) => v.key.startsWith("header_variable_") || v.key.startsWith("header_named_variable_")).forEach((v) => {
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
                                {avulsaSelectedTemplate.components?.find((c) => c.type === "BODY")?.text && (() => {
                                  let text = avulsaSelectedTemplate.components!.find((c) => c.type === "BODY")!.text!;
                                  avulsaTemplateVars.filter((v) => v.key.startsWith("body_variable_") || v.key.startsWith("body_named_variable_")).forEach((v) => {
                                    const n = v.key.startsWith("body_variable_") ? v.key.replace("body_variable_", "") : v.key.replace("body_named_variable_", "");
                                    text = text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
                                  });
                                  return <p className="text-sm whitespace-pre-wrap text-gray-800">{text}</p>;
                                })()}
                                {avulsaSelectedTemplate.components?.find((c) => c.type === "FOOTER")?.text && (
                                  <p className="text-xs text-gray-400">{avulsaSelectedTemplate.components.find((c) => c.type === "FOOTER")!.text}</p>
                                )}
                                {avulsaSelectedTemplate.components?.find((c) => c.type === "BUTTONS")?.buttons && (
                                  <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
                                    {avulsaSelectedTemplate.components!.find((c) => c.type === "BUTTONS")!.buttons!.map((btn, i) => (
                                      <div key={i} className="text-center text-xs text-blue-500 py-0.5 border border-gray-200 rounded">{btn.text}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Variables */}
                            {avulsaTemplateVars.length > 0 ? (
                              <div className="space-y-2 mt-1">
                                <p className="text-xs font-medium text-muted-foreground">{t("fillVariables")}</p>
                                {avulsaTemplateVars.map((v) => (
                                  <div key={v.key} className="flex items-center gap-2">
                                    <Label className="text-xs w-28 shrink-0">{v.label}</Label>
                                    <Input
                                      value={v.value}
                                      onChange={(e) => setAvulsaTemplateVars((prev) => prev.map((tv) => tv.key === v.key ? { ...tv, value: e.target.value, ...(tv.key === "header_link" ? { filename: undefined } : {}) } : tv))}
                                      className="h-7 text-sm flex-1"
                                      placeholder={v.label}
                                    />
                                    {v.key === "header_link" && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 shrink-0"
                                        title={t("pickFromGallery")}
                                        onClick={() => setAvulsaTplGalleryOpen(true)}
                                      >
                                        <Images className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {/* Ficha de cobranca — so aparece em template ORDER_DETAILS.
                                Coexiste com as variaveis acima (header de midia + {{1}} no body). */}
                            {isAvulsaOrderDetails && (
                              <div className="space-y-2 border-t pt-2 mt-1">
                                <div>
                                  <Label className="text-xs mb-0.5 block">{tOrder("sectionTitle")}</Label>
                                  <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                                </div>
                                <OrderDetailsFields
                                  key={`${avulsaSelectedTemplate.name}-${avulsaSelectedTemplate.language}`}
                                  value={avulsaOrderDetails}
                                  onChange={setAvulsaOrderDetails}
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>{t("messageLabel")}</Label>
                      {(user?.username || (typeof window !== "undefined" && localStorage.getItem("username"))) && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Switch
                            id="avulsa-sig-toggle"
                            checked={forceSignature ? true : signatureEnabled}
                            onCheckedChange={forceSignature ? undefined : (v) => {
                              localStorage.setItem("signatureEnabled", String(v));
                              setSignatureEnabled(v);
                            }}
                            disabled={forceSignature}
                            className="scale-90"
                          />
                          <Label htmlFor="avulsa-sig-toggle" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                            {(forceSignature ? true : signatureEnabled) ? tMsgInput("signatureEnabled") : tMsgInput("signatureDisabled")}
                          </Label>
                        </div>
                      )}
                    </div>
                    <Textarea
                      value={avulsaMessage}
                      onChange={(e) => setAvulsaMessage(e.target.value)}
                      placeholder={t("typeMessageAvulsa")}
                      rows={4}
                      className="resize-none"
                    />
                  </div>
                );
              })()}
              {/* Status selector — última escolha antes de Enviar (logo acima do botão).
                  Garante que pending/open seja confirmado depois do texto/template. */}
              {(() => {
                const wp = whatsappsList.find((w) => String(w.id) === avulsaWhatsappId);
                const isAvulsaEmail = (wp?.type ?? "").toLowerCase() === "email" || (wp?.type ?? "").toLowerCase() === "webmail";
                if (isAvulsaEmail) return null;
                return (
                  <div className="space-y-2">
                    <Label>{t("avulsaStatusLabel")}</Label>
                    <RadioGroup
                      value={avulsaDesiredStatus}
                      onValueChange={(v) => setAvulsaDesiredStatus(v as "open" | "pending")}
                      className="grid grid-cols-2 gap-2"
                    >
                      <label className={cn(
                        "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                        avulsaDesiredStatus === "open" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      )}>
                        <RadioGroupItem value="open" id="avulsa-status-open" className="mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium leading-none">{t("avulsaStatusOpen")}</div>
                          <p className="text-[11px] text-muted-foreground leading-tight">{t("avulsaStatusOpenDesc")}</p>
                        </div>
                      </label>
                      <label className={cn(
                        "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                        avulsaDesiredStatus === "pending" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      )}>
                        <RadioGroupItem value="pending" id="avulsa-status-pending" className="mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium leading-none">{t("avulsaStatusPending")}</div>
                          <p className="text-[11px] text-muted-foreground leading-tight">{t("avulsaStatusPendingDesc")}</p>
                        </div>
                      </label>
                    </RadioGroup>
                  </div>
                );
              })()}
            </div>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setAvulsaOpen(false)} disabled={avulsaSending}>
                {t("cancel")}
              </Button>
              <Button
                onClick={() => handleSendAvulsa()}
                disabled={
                  avulsaSending ||
                  !avulsaWhatsappId ||
                  (() => {
                    const wp = whatsappsList.find((w) => String(w.id) === avulsaWhatsappId);
                    const tpType = (wp?.type ?? "").toLowerCase();
                    const isWabaLike = tpType.includes("waba") || tpType === "dialog360" || tpType === "gupshup";
                    const isAvulsaEmail = ["email", "webmail"].includes(tpType);
                    if (isAvulsaEmail) {
                      return !avulsaEmail.trim() || !avulsaEmailSubject.trim() || !avulsaMessage.trim();
                    }
                    if (!avulsaNumber.trim()) return true;
                    return isWabaLike ? !avulsaSelectedTemplate : !avulsaMessage.trim();
                  })()
                }
              >
                {avulsaSending ? t("avulsaSending") : t("send")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Gallery picker for avulsa template header ──────────────── */}
        <GalleryPickerWithUploadDialog
          open={avulsaTplGalleryOpen}
          onOpenChange={setAvulsaTplGalleryOpen}
          onPick={pickAvulsaTplGalleryItem}
          {...wabaHeaderFormatToGalleryParams(
            avulsaSelectedTemplate?.components?.find((c) => c.type === "HEADER")?.format
          )}
        />

        {/* Pin message dialog */}
        <PinMessageDialog
          open={pinDialogOpen}
          message={pinDialogTarget}
          onClose={() => { setPinDialogOpen(false); setPinDialogTarget(null); }}
          onPin={handlePinMessage}
        />

        {/* Espiar conversa (tickets pendentes) */}
        <EspiarConversaDialog
          open={spyOpen}
          onOpenChange={(open) => { setSpyOpen(open); if (!open) setSpyTicket(null); }}
          ticket={spyTicket ? { id: spyTicket.id, contact: spyTicket.contact, status: spyTicket.status } : null}
          onAtender={async (t) => {
            if (!t) return;
            const full = tickets.find((x) => x.id === t.id) ?? spyTicket;
            if (full) await handleAcceptTicket(full);
            setSpyOpen(false);
            setSpyTicket(null);
            loadTickets({ upToPage: ticketsPageNumberRef.current });
          }}
          onResolve={(controlFeatures && user?.profile === "user") ? undefined : (t) => {
            if (!t) return;
            const full = tickets.find((x) => x.id === t.id) ?? spyTicket;
            setSpyOpen(false);
            setSpyTicket(null);
            if (full) handleCloseTicket(full);
          }}
        />

        {/* Busca global de mensagens (em todos os tickets) */}
        <GlobalMessageSearchDialog
          open={globalSearchOpen}
          onOpenChange={setGlobalSearchOpen}
          onSpy={async (ticket) => {
            const found = tickets.find((x) => x.id === ticket.id);
            if (found) {
              setSpyTicket(found);
              setSpyOpen(true);
              return;
            }
            try {
              const { data } = await fetchTicket(ticket.id);
              if (data) {
                const normalized = normalizeTicket(data as Record<string, unknown>);
                setSpyTicket(normalized);
                setSpyOpen(true);
              }
            } catch {
              toast.error(t("ticketNotFound"));
            }
          }}
          onAtender={async (ticket) => {
            const found = tickets.find((x) => x.id === ticket.id);
            if (found) {
              await handleSelectTicket(found);
            } else {
              try {
                const { data } = await fetchTicket(ticket.id);
                if (data) {
                  const normalized = normalizeTicket(data as Record<string, unknown>);
                  await handleSelectTicket(normalized);
                }
              } catch {
                toast.error(t("ticketNotFound"));
              }
            }
            setGlobalSearchOpen(false);
          }}
        />

        {/* Help Dialog */}
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" /> {t("help")}
              </DialogTitle>
              <DialogDescription>{t("helpDesc")}</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto max-h-72 space-y-3 text-sm">
              {[
                { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
                { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
                { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")] },
                { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1")] },
                { title: t("helpShortcutsT"), items: [t("helpShortcutEsc"), t("helpShortcutAltNav"), t("helpShortcutAltR"), t("helpShortcutEnterSpace"), t("helpShortcutPaste")] },
                { title: t("helpAiT"), items: [t("helpAiI0"), t("helpAiI1"), t("helpAiI2"), t("helpAiI3")] },
              ].map((section, i) => (
                <div key={i}>
                  <Separator className="mb-3" />
                  <p className="font-medium text-foreground mb-2">{section.title}</p>
                  <ul className="space-y-1.5">
                    {section.items.map((item, j) => (
                      <li key={j} className="flex gap-2 text-muted-foreground leading-snug">
                        <span className="text-primary shrink-0">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        <ExistingTicketDialog
          open={!!avulsaExistingTicket}
          onOpenChange={(o) => { if (!o) setAvulsaExistingTicket(null); }}
          ticket={avulsaExistingTicket}
          isRestrictedUser={checkRestrictedUser()}
          notViewAssignedTickets={notViewAssignedTickets}
          targetWhatsappId={Number(avulsaWhatsappId) || null}
          onProceed={() => handleSendAvulsa(true)}
        />
        {/* Pré-check cross-canal ao ACEITAR pendente (flag crossChannelTicketCheck):
            dialog compartilhado com "Assumir mesmo assim" */}
        <ExistingTicketDialog
          open={!!acceptCrossTicket}
          onOpenChange={(o) => { if (!o) { setAcceptCrossTicket(null); setAcceptPendingTicket(null); } }}
          ticket={acceptCrossTicket}
          isRestrictedUser={checkRestrictedUser()}
          notViewAssignedTickets={notViewAssignedTickets}
          targetWhatsappId={acceptPendingTicket
            ? Number((acceptPendingTicket as unknown as { whatsappId?: number }).whatsappId ?? acceptPendingTicket.whatsapp?.id ?? 0) || null
            : null}
          proceedMode="accept"
          onProceed={() => {
            const pend = acceptPendingTicket;
            setAcceptCrossTicket(null);
            setAcceptPendingTicket(null);
            if (pend) void acceptTicketNow(pend);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
