"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Check, CheckCheck, Clock, Trash2, Reply, Forward,
  Download, MapPin, FileText, Contact2, CornerDownRight,
  Pencil, SmilePlus, ExternalLink, ShoppingBag, Package,
  Megaphone, Navigation, Link2, List, Grid2X2, Mail,
  Copy, CornerUpRight, CircleDashed, PlayCircle, X, ChevronLeft, ChevronRight,
  Play, Pause, CalendarDays, CalendarCheck, ZoomIn, ZoomOut, RotateCcw, RotateCw, Printer, Maximize2, Search,
  Star, Bot, Loader2, Pin, BarChart3, Receipt, Copy as CopyIcon, Phone,
  PhoneCall, PhoneOff, ShieldCheck, Languages, X as XIcon, Youtube,
  AudioLines, FolderPlus, Route, RouteOff, CheckCircle2, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitize } from "@/lib/sanitize";
import { linkifyParts } from "@/lib/linkify";
import { getTicketLastMessagePreview, parseNfmEntries } from "@/lib/template-preview";
import { extractOrderDetails, formatMetaAmount } from "@/lib/order-details";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { Message, QuotedMessage } from "@/stores/ticket-store";
import { useAuthStore } from "@/stores/auth-store";
import { useLiveMode } from "@/hooks/use-live-mode";
import { EMOJI_CATEGORIES } from "@/lib/emoji-data";
import { toast } from "sonner";
import api from "@/lib/api";
import { createContact, fetchContacts, type Contact } from "@/services/contacts";
import { createTicket } from "@/services/tickets";
import { fetchWhatsapps, type Whatsapp as WhatsappSession } from "@/services/whatsapp";
import { copilotUiLangPayload, translateMessage, type TranslateTargetLang } from "@/services/copilot";
import {
  listWhatsappPayments, markPaymentAsPaid, cancelPayment,
  type WhatsappPayment,
} from "@/services/whatsapp-payments";
import { uploadGalleryFiles } from "@/services/gallery";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { registerAudioPlay } from "@/lib/audio-manager";
import { useAudioPlayerStore } from "@/stores/audio-player-store";
import { useLocale } from "@/i18n/locale-provider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const downloadingFiles = new Set<string>();

// Força download sem navegar. fetch+blob direto → proxy /api/download se CORS bloquear.
function downloadFile(url: string, filename = "arquivo") {
  if (downloadingFiles.has(url)) return;
  downloadingFiles.add(url);
  const toastId = toast.loading("Baixando arquivo...");
  const isExternal = url.startsWith("http://") || url.startsWith("https://");
  const opts: RequestInit = isExternal ? { credentials: "omit" } : { credentials: "include" };
  fetch(url, opts)
    .then((r) => {
      if (!r.ok) throw new Error("not ok");
      return r.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success("Download realizado com sucesso!", { id: toastId });
    })
    .catch(() => {
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
      const a = document.createElement("a");
      a.href = proxyUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Download iniciado!", { id: toastId });
    })
    .finally(() => {
      downloadingFiles.delete(url);
    });
}

const savingToGalleryUrls = new Set<string>();
async function saveUrlToGallery(url: string, filename: string, successMsg: string, errorMsg: string) {
  if (!url || savingToGalleryUrls.has(url)) return;
  savingToGalleryUrls.add(url);
  const toastId = toast.loading(successMsg);
  try {
    const isExternal = url.startsWith("http://") || url.startsWith("https://");
    const response = await fetch(url, isExternal ? { credentials: "omit" } : { credentials: "include" });
    if (!response.ok) throw new Error("fetch failed");
    const blob = await response.blob();
    const safeName = (filename || `arquivo-${Date.now()}`).split("?")[0] || `arquivo-${Date.now()}`;
    const file = new File([blob], safeName, { type: blob.type || "application/octet-stream" });
    await uploadGalleryFiles([file]);
    toast.success(successMsg, { id: toastId });
  } catch {
    toast.error(errorMsg, { id: toastId });
  } finally {
    savingToGalleryUrls.delete(url);
  }
}

function getMediaUrl(input?: string | { mediaUrl?: string; storageUrl?: string } | null): string {
  if (!input) return "";
  // Aceita Message-like {mediaUrl, storageUrl} e prefere storageUrl (S3/R2 público).
  // Necessário em deployments com keepLocalCopy=false: o /public/... local retorna 404.
  const url = typeof input === "string"
    ? input
    : (input.storageUrl || input.mediaUrl || "");
  const u = (url || "").trim();
  if (!u) return "";
  if (u.includes("@") && !u.startsWith("http") && !u.startsWith("/")) return "";
  if (u.startsWith("http") || u.startsWith("blob:")) return u;
  return `${API_URL}${u.startsWith("/") ? "" : "/"}${u}`;
}

function getAudioUrl(input?: string | { mediaUrl?: string; storageUrl?: string } | null): string {
  const full = getMediaUrl(input);
  return full.replace(/\.ogg$/, ".mp3");
}

// Códigos de erro Meta/BSP com descrição traduzida no tooltip do ack de falha
// NO_SEND_CONTEXT é nosso (backend/helpers/NoSendContextErrorZPRO): ticket sem
// conversa/thread ativa no canal — ML, OLX, LinkedIn, TikTok e YouTube.
// TELEGRAM_UNREACHABLE e TELEGRAM_MEDIA_MISSING também (TbotServices/helpers/
// TelegramSendGuardZPRO): o contato bloqueou o bot ou nunca falou com ele; o
// arquivo da mídia não está mais no servidor.
const ACK_ERROR_KNOWN_CODES = ["100", "131026", "131042", "131047", "131048", "131049", "131051", "132000", "132012", "NO_SEND_CONTEXT", "TELEGRAM_UNREACHABLE", "TELEGRAM_MEDIA_MISSING"];

function AckIcon({
  ack,
  fromMe,
  statusError,
}: {
  ack?: number;
  fromMe: boolean;
  statusError?: { code?: number | string; title?: string; details?: string } | null;
}) {
  const t = useTranslations("messageBubble");
  if (!fromMe) return null;
  // ack -1: status "failed" do webhook WABA/BSP — tooltip com o motivo (statusError)
  if (ack === -1) {
    const code = statusError?.code != null ? String(statusError.code) : "";
    const desc = code && ACK_ERROR_KNOWN_CODES.includes(code)
      ? t(`ackError${code}` as never)
      : [statusError?.title, statusError?.details].filter(Boolean).join(" — ");
    // Código entre parênteses só quando é numérico (erro Meta/BSP); os nossos
    // são slugs e não dizem nada para o atendente.
    const showCode = code && /^\d+$/.test(code);
    const title = desc
      ? `${t("ackFailed")}${showCode ? ` (${code})` : ""}: ${desc}`
      : t("ackFailed");
    return (
      <span title={title}>
        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
      </span>
    );
  }
  // Cores explícitas para sobrescrever a opacidade herdada do container pai.
  // Tamanho 3.5 (14px) para melhor legibilidade.
  switch (ack) {
    case 0:
      return <span title={t("ackWaiting")}><Clock className="h-3.5 w-3.5 opacity-50" /></span>;
    case 1:
      return <span title={t("ackSent")}><Check className="h-3.5 w-3.5 opacity-80" /></span>;
    case 2:
      return <span title={t("ackDelivered")}><CheckCheck className="h-3.5 w-3.5 opacity-100" /></span>;
    case 3:
    case 4:
      return <span title={t("ackRead")}><CheckCheck className="h-3.5 w-3.5 text-blue-300 opacity-100" /></span>;
    default:
      return <Check className="h-3.5 w-3.5 opacity-80" />;
  }
}

function whatsappStyle(text: string, wc: string, open: string, close: string): string {
  const indices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === wc) {
      const prev = text[i - 1];
      const next = text[i + 1];
      if (indices.length % 2 === 1) {
        if (prev !== " " && (next === undefined || !/[a-zA-Z0-9]/.test(next))) indices.push(i);
      } else {
        if (next !== undefined && next !== " " && (prev === undefined || !/[a-zA-Z0-9]/.test(prev))) indices.push(i);
      }
    } else if (text.charCodeAt(i) === 10 && indices.length % 2 === 1) {
      indices.pop();
    }
  }
  if (indices.length % 2 !== 0) indices.pop();
  let e = 0;
  indices.forEach((v, i) => {
    const tag = i % 2 === 0 ? open : close;
    const pos = v + e;
    text = text.substring(0, pos) + tag + text.substring(pos + 1);
    e += tag.length - 1;
  });
  return text;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function extractDailymotionId(url: string): string | null {
  const m = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

// Returns embed URL for Spotify track/album/playlist/episode/show, or null
function extractSpotifyEmbed(url: string): string | null {
  const m = url.match(/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/);
  if (!m) return null;
  return `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=oembed`;
}

type EmbedInfo =
  | { type: "youtube"; src: string }
  | { type: "vimeo"; src: string }
  | { type: "dailymotion"; src: string }
  | { type: "spotify"; src: string; isAudio: boolean }
  | null;

function resolveEmbed(url: string): EmbedInfo {
  const ytId = extractYouTubeId(url);
  if (ytId) return { type: "youtube", src: `https://www.youtube.com/embed/${ytId}?autoplay=1` };

  const viId = extractVimeoId(url);
  if (viId) return { type: "vimeo", src: `https://player.vimeo.com/video/${viId}?autoplay=1` };

  const dmId = extractDailymotionId(url);
  if (dmId) return { type: "dailymotion", src: `https://www.dailymotion.com/embed/video/${dmId}?autoplay=1` };

  const spSrc = extractSpotifyEmbed(url);
  if (spSrc) {
    const isAudio = /\/(track|episode|show)\//.test(url);
    return { type: "spotify", src: spSrc, isAudio };
  }

  return null;
}

function ExternalLinkConfirmDialog({ url, onCancel, onConfirm }: { url: string; onCancel: () => void; onConfirm: () => void }) {
  const t = useTranslations("messageBubble");
  let hostname = url;
  try { hostname = new URL(url).hostname; } catch { /* keep raw url */ }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ExternalLink className="h-4 w-4 text-amber-500" />
            {t("externalLinkTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("externalLinkBody")}</p>
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate font-medium">{hostname}</span>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
          <Button onClick={onConfirm} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            {t("externalLinkContinue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkModalBody({ url, onRequestOpen }: { url: string; onRequestOpen: () => void }) {
  const t = useTranslations("messageBubble");
  const [data, setData] = useState<LinkPreviewData | null>(() => readCache(url));
  const [loading, setLoading] = useState(() => readCache(url) === null);

  useEffect(() => {
    const cached = readCache(url);
    if (cached) { setData(cached); setLoading(false); return; }
    let cancelled = false;
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d: LinkPreviewData) => { if (!cancelled) { writeCache(url, d); setData(d); } })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  const openNew = onRequestOpen;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {data?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          className="rounded-lg max-h-52 w-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      {data?.title && (
        <p className="font-semibold text-base text-center leading-snug">{data.title}</p>
      )}
      {data?.description && (
        <p className="text-sm text-muted-foreground text-center line-clamp-4">{data.description}</p>
      )}
      {!data?.title && !data?.image && (
        <p className="text-sm text-muted-foreground text-center break-all">{url}</p>
      )}
      <Button onClick={openNew} className="mt-1 gap-2">
        <ExternalLink className="h-4 w-4" />
        {t("openInNewTab")}
      </Button>
    </div>
  );
}

function LinkModal({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useTranslations("messageBubble");
  const embed = resolveEmbed(url);
  let hostname = url;
  try { hostname = new URL(url).hostname; } catch { /* ignore */ }

  const isSpotifyAudio = embed?.type === "spotify" && embed.isAudio;
  // Spotify audio widgets are short (152px), video players use 16:9
  const isVideo = embed && embed.type !== "spotify";

  // Confirmation state shown before actually opening the URL outside the app.
  const [confirmingExternal, setConfirmingExternal] = useState(false);
  const requestExternalOpen = () => setConfirmingExternal(true);
  const confirmExternalOpen = () => {
    setConfirmingExternal(false);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">{hostname}</DialogTitle>
        {/* Header — pr-12 reserves space for the dialog's built-in close button */}
        <div className="flex items-center gap-2 px-4 pr-12 py-2.5 border-b bg-muted/30 shrink-0">
          <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground truncate flex-1 select-all">{hostname}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); requestExternalOpen(); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("openInNewTab")}
          </button>
        </div>
        {/* Body */}
        {embed ? (
          isSpotifyAudio ? (
            <iframe
              src={embed.src}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              className="w-full border-0"
              style={{ height: 152 }}
              title="Spotify"
            />
          ) : isVideo ? (
            <div className="aspect-video w-full">
              <iframe
                src={embed.src}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
                title={embed.type}
              />
            </div>
          ) : (
            /* Spotify playlist/album — taller */
            <iframe
              src={embed.src}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              className="w-full border-0"
              style={{ height: 352 }}
              title="Spotify"
            />
          )
        ) : (
          <LinkModalBody url={url} onRequestOpen={requestExternalOpen} />
        )}
        {confirmingExternal && (
          <ExternalLinkConfirmDialog
            url={url}
            onCancel={() => setConfirmingExternal(false)}
            onConfirm={confirmExternalOpen}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatWhatsApp(text: string | null | undefined): string {
  if (!text) return "";
  // Escape HTML
  let out = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Code blocks
  // bg/text inherits via translucent overlays — funciona com fromMe (bubble primary) e non-fromMe (bubble muted) sem precisar passar prop.
  out = out.replace(/```([\s\S]+?)```/g, "<pre class='bg-black/20 dark:bg-white/20 text-current px-1.5 py-0.5 rounded text-xs whitespace-pre-wrap font-mono'>$1</pre>");
  out = out.replace(/`([^`\n]+?)`/g, "<code class='bg-black/20 dark:bg-white/20 text-current px-1.5 rounded text-xs font-mono'>$1</code>");
  // Bold+italic combos
  out = out.replace(/\*_(.+?)_\*/g, "<b><i>$1</i></b>");
  out = out.replace(/_\*(.+?)\*_/g, "<i><b>$1</b></i>");
  // WhatsApp styles
  out = whatsappStyle(out, "_", "<i>", "</i>");
  out = whatsappStyle(out, "*", "<b>", "</b>");
  out = whatsappStyle(out, "~", "<s>", "</s>");
  // Links (before \n → <br> so regex stops at newline)
  out = out.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline text-blue-400">$1</a>');
  // Newlines
  out = out.replace(/\n/g, "<br>");
  return out;
}

function QuotedMessageBlock({ msg }: { msg: QuotedMessage }) {
  const t = useTranslations("messageBubble");
  const isMedia = msg.mediaType && !["chat", "extendedTextMessage", "conversation"].includes(msg.mediaType);

  function handleScrollToQuoted() {
    const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("msg-highlight");
      setTimeout(() => el.classList.remove("msg-highlight"), 1800);
      return;
    }
    // Não está no DOM — pede para a página carregar histórico até encontrar.
    window.dispatchEvent(new CustomEvent("chat:scroll-to-message", { detail: { id: msg.id } }));
  }

  return (
    <div
      className="mb-1 rounded-md border-l-4 border-primary/50 bg-muted/50 p-2 text-xs cursor-pointer hover:bg-muted/80 transition-colors"
      onClick={handleScrollToQuoted}
    >
      <p className="font-medium text-primary/80 mb-0.5">
        {msg.fromMe ? t("you") : msg.contact?.name || t("contact")}
      </p>
      {isMedia && msg.mediaUrl && (
        <div className="mb-1">
          {(msg.mediaType?.includes("image") || msg.mediaType === "sticker" || msg.mediaType === "stickerMessage" || msg.mediaType === "lottieStickerMessage") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getMediaUrl(msg)} alt="" className="rounded max-w-[60px] max-h-[60px] object-cover" />
          )}
          {msg.mediaType?.includes("audio") && <span className="text-muted-foreground">🎵 {t("audioEmoji")}</span>}
          {msg.mediaType?.includes("video") && <span className="text-muted-foreground">🎬 {t("videoEmoji")}</span>}
        </div>
      )}
      <p className="line-clamp-2 text-muted-foreground">{getTicketLastMessagePreview(msg.body)}</p>
    </div>
  );
}

function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"]+/);
  return match ? match[0] : null;
}

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  hostname?: string;
}

const CACHE_PREFIX = "lp_cache_";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function readCache(url: string): LinkPreviewData | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + url);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: LinkPreviewData; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + url);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeCache(url: string, data: LinkPreviewData) {
  try {
    localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

function LinkPreview({ url, onOpen }: { url: string; onOpen?: (u: string) => void }) {
  const t = useTranslations("messageBubble");
  const [data, setData] = useState<LinkPreviewData | null>(() => readCache(url));
  const [loading, setLoading] = useState(() => readCache(url) === null);

  useEffect(() => {
    const cached = readCache(url);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Defer fetch slightly so it doesn't block message rendering
    const timer = setTimeout(() => {
      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then((r) => r.json())
        .then((d: LinkPreviewData) => {
          if (!cancelled) {
            writeCache(url, d);
            setData(d);
          }
        })
        .catch(() => {
          if (!cancelled) setData(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2 rounded-lg border bg-muted/20 overflow-hidden max-w-[280px]">
        <div className="relative h-[80px] bg-muted/40 flex flex-col items-center justify-center gap-2">
          {/* spinner */}
          <svg
            className="h-5 w-5 animate-spin text-muted-foreground/50"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-[10px] text-muted-foreground/60">{t("loadingPreview")}</span>
        </div>
        <div className="p-2 space-y-1.5">
          <div className="h-2 bg-muted rounded animate-pulse w-1/3" />
          <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-2 bg-muted rounded animate-pulse w-full" />
        </div>
      </div>
    );
  }

  if (!data || (!data.title && !data.image)) return null;

  const ERROR_TITLE = /^(404|403|500|502|503|page not found|not found|access denied|forbidden|error)/i;
  if (data.title && ERROR_TITLE.test(data.title)) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen ? onOpen(url) : window.open(url, "_blank", "noopener,noreferrer")}
      onKeyDown={(e) => e.key === "Enter" && (onOpen ? onOpen(url) : window.open(url, "_blank", "noopener,noreferrer"))}
      className="mt-2 block rounded-lg border bg-muted/20 overflow-hidden max-w-[280px] hover:bg-muted/30 transition-colors cursor-pointer"
    >
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          className="w-full h-[140px] object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="p-2 space-y-0.5">
        {data.hostname && (
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{data.hostname}</p>
        )}
        {data.title && (
          <p className="text-xs font-semibold line-clamp-2 leading-snug">{data.title}</p>
        )}
        {data.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">{data.description}</p>
        )}
      </div>
    </div>
  );
}

/* Avisos que a Meta gera no lugar da mensagem do cliente. O backend grava um marcador
   fixo em ingles (o body fica no banco e e lido em qualquer idioma) e a traducao acontece
   aqui, no locale de quem esta olhando. Sao duas causas diferentes:
   "type not supported" = tipo que a API nao suporta (erro 131051);
   "currently unavailable" = mensagem comum que a Meta nao conseguiu recuperar (131060). */
type MetaNoticeKey = "metaUnsupportedType" | "metaMessageUnavailable";

const META_NOTICE_KEYS: Record<string, MetaNoticeKey> = {
  "META: Message type not supported.": "metaUnsupportedType",
  "META: This message is currently unavailable.": "metaMessageUnavailable",
};

function getMetaNoticeKey(body?: string | null): MetaNoticeKey | null {
  if (!body) return null;
  return META_NOTICE_KEYS[body.trim()] ?? null;
}

function TextContent({ body, isDeleted, isEdited, originalBody, showLinkPreview }: { body: string; isDeleted?: boolean; isEdited?: boolean; originalBody?: string; showLinkPreview?: boolean }) {
  const t = useTranslations("messageBubble");
  const metaNoticeKey = getMetaNoticeKey(body);
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (a?.href && /^https?:\/\//.test(a.href)) {
      e.preventDefault();
      setModalUrl(a.href);
    }
  };

  if (isDeleted) {
    return (
      <p
        className="italic text-muted-foreground/60 text-sm line-through [overflow-wrap:anywhere] leading-normal"
        dangerouslySetInnerHTML={{ __html: sanitize(formatWhatsApp(body ?? "")) }}
      />
    );
  }
  // Aviso da Meta, nao fala do cliente: texto neutro, sem formatacao nem preview de link.
  if (metaNoticeKey) {
    return (
      <p className="italic text-muted-foreground text-sm [overflow-wrap:anywhere] leading-normal">
        {t(metaNoticeKey)}
      </p>
    );
  }

  const firstUrl = showLinkPreview ? extractFirstUrl(body) : null;
  return (
    <div onClick={handleClick}>
      {/* overflow-wrap:anywhere quebra em espacos por padrao, mas tambem em qualquer
          caractere quando uma "palavra" e maior que o container (nomes de arquivo
          tipo Captura_de_tela_2026-...png sem espaco). break-words sozinho permite
          a string esticar a bolha alem da largura da midia. */}
      <p
        className="[overflow-wrap:anywhere] text-sm leading-normal"
        dangerouslySetInnerHTML={{ __html: sanitize(formatWhatsApp(body)) }}
      />
      {firstUrl && <LinkPreview url={firstUrl} onOpen={setModalUrl} />}
      {originalBody && (
        <div className="mt-1.5 rounded px-2 py-1 bg-black/10 dark:bg-white/10 border-l-2 border-muted-foreground/30">
          <p className="text-[10px] font-medium text-current opacity-50 mb-0.5">{t("edited")}</p>
          <p className="text-[11px] italic text-current opacity-60 [overflow-wrap:anywhere] leading-normal">{originalBody}</p>
        </div>
      )}
      {isEdited && !originalBody && (
        <span className="text-[10px] italic text-muted-foreground/70 ml-1">{t("edited")}</span>
      )}
      {modalUrl && <LinkModal url={modalUrl} onClose={() => setModalUrl(null)} />}
    </div>
  );
}

// Lazy-load lottie-react apenas no cliente
const LottiePlayer = React.lazy(() => import("lottie-react"));

function LottieStickerContent({ msg }: { msg: Message }) {
  const rawUrl = getMediaUrl(msg);
  // Se a URL for .was (formato WhatsApp — ZIP com Lottie), troca pro .json companheiro só pra render
  const url = rawUrl ? rawUrl.replace(/\.was(\?.*)?$/i, ".json$1") : "";
  const [animationData, setAnimationData] = useState<unknown | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => { if (!cancelled) setAnimationData(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url]);

  if (!url || failed) {
    return (
      <div className="flex items-center justify-center w-[100px] h-[100px] rounded-lg bg-muted/40 text-xl">🎨</div>
    );
  }

  if (!animationData) {
    return <div className="w-[100px] h-[100px] rounded-lg bg-muted/20 animate-pulse" />;
  }

  return (
    <div className="w-[100px] h-[100px]">
      <React.Suspense fallback={<div className="w-[100px] h-[100px] rounded-lg bg-muted/20 animate-pulse" />}>
        <LottiePlayer animationData={animationData} loop autoplay style={{ width: 100, height: 100 }} />
      </React.Suspense>
    </div>
  );
}

function StickerContent({ msg }: { msg: Message }) {
  const url = getMediaUrl(msg);
  if (!url) {
    return (
      <div className="flex items-center justify-center w-[100px] h-[100px] rounded-lg bg-muted/40 text-xl">🎨</div>
    );
  }
  return (
    <div className="w-[100px] h-[100px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={msg.body || "sticker"}
        className="w-[100px] h-[100px] object-contain"
      />
    </div>
  );
}

function ImageContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const [lightbox, setLightbox] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const url = getMediaUrl(msg);
  if (!url) return null;

  const closeLightbox = () => { setLightbox(false); setScale(1); setOffset({ x: 0, y: 0 }); setRotation(0); };
  const resetZoom = (e?: React.MouseEvent) => { e?.stopPropagation(); setScale(1); setOffset({ x: 0, y: 0 }); };
  const rotateLeft = (e: React.MouseEvent) => { e.stopPropagation(); setRotation((r) => (r - 90 + 360) % 360); };
  const rotateRight = (e: React.MouseEvent) => { e.stopPropagation(); setRotation((r) => (r + 90) % 360); };
  const handlePrint = (e: React.MouseEvent) => {
    e.stopPropagation();
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000"><img src="${url}" style="max-width:100%;max-height:100vh;transform:rotate(${rotation}deg)" onload="window.print();window.close()"/></body></html>`);
    win.document.close();
  };

  React.useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setScale((s) => Math.min(5, Math.max(1, s * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setOffset({ x: dragRef.current.ox + e.clientX - dragRef.current.startX, y: dragRef.current.oy + e.clientY - dragRef.current.startY });
  };
  const handleMouseUp = () => { dragRef.current = null; };

  const getTouchDist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) pinchRef.current = { dist: getTouchDist(e.touches), scale };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const ratio = getTouchDist(e.touches) / pinchRef.current.dist;
      setScale(Math.min(5, Math.max(1, pinchRef.current.scale * ratio)));
    }
  };
  const handleTouchEnd = () => { pinchRef.current = null; };

  const isSticker = msg.mediaType === "sticker" || msg.mediaType === "stickerMessage" || msg.mediaType === "lottieStickerMessage";

  return (
    <div>
      <button onClick={() => setLightbox(true)} className="block relative group/img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={msg.body || "imagem"}
          // min(...,100%): a bolha e limitada a 70% da largura da lista, entao
          // no celular 280px estouravam a bolha e vazavam para a direita.
          className={cn("rounded-lg object-cover", isSticker ? "max-w-[100px] max-h-[100px]" : "max-w-[min(280px,100%)] max-h-[280px]")}
        />
        {!isSticker && (
          <div className="absolute inset-0 rounded-lg bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center">
            <ExternalLink className="h-6 w-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-md" />
          </div>
        )}
      </button>
      {(msg.edition ?? msg.body) && !isSticker && <TextContent body={msg.edition ?? msg.body} isEdited={msg.isEdited} originalBody={msg.edition ? msg.body : undefined} />}
      <Dialog open={lightbox} onOpenChange={(o) => { if (!o) closeLightbox(); }}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{msg.fileName || "imagem"}</DialogTitle>
          {/* Header — solid background, like document popup */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 pr-12">
            <span className="text-sm font-medium flex items-center gap-2 min-w-0 truncate">
              {(msg.fileName || msg.body) ? (msg.fileName || msg.body) : t("image")}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {scale > 1 && (
                <button className="rounded-full p-1.5 hover:bg-muted transition-colors" onClick={resetZoom} title={t("zoomReset")}>
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              <button className="rounded-full p-1.5 hover:bg-muted transition-colors" onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(5, s + 0.5)); }} title={t("zoomIn")}>
                <ZoomIn className="h-4 w-4" />
              </button>
              <button className="rounded-full p-1.5 hover:bg-muted transition-colors" onClick={(e) => { e.stopPropagation(); setScale((s) => { const next = Math.max(1, s - 0.5); if (next === 1) setOffset({ x: 0, y: 0 }); return next; }); }} title={t("zoomOut")}>
                <ZoomOut className="h-4 w-4" />
              </button>
              <button className="rounded-full p-1.5 hover:bg-muted transition-colors" onClick={rotateLeft} title={t("rotateLeft")}>
                <RotateCcw className="h-4 w-4" />
              </button>
              <button className="rounded-full p-1.5 hover:bg-muted transition-colors" onClick={rotateRight} title={t("rotateRight")}>
                <RotateCw className="h-4 w-4" />
              </button>
              <button className="rounded-full p-1.5 hover:bg-muted transition-colors" onClick={handlePrint} title={t("print")}>
                <Printer className="h-4 w-4" />
              </button>
              <button
                className="rounded-full p-1.5 hover:bg-muted transition-colors"
                title={t("searchOnGoogle")}
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const resp = await fetch(url);
                    const blob = await resp.blob();
                    const pngBlob = blob.type === "image/png" ? blob : await createImageBitmap(blob).then((bmp) => {
                      const canvas = document.createElement("canvas");
                      canvas.width = bmp.width; canvas.height = bmp.height;
                      canvas.getContext("2d")!.drawImage(bmp, 0, 0);
                      return new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
                    });
                    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
                    const toastId = toast.loading(t("searchOnGoogleTip"));
                    setTimeout(() => {
                      toast.dismiss(toastId);
                      window.open("https://lens.google.com/", "_blank", "noopener,noreferrer");
                    }, 2500);
                  } catch {
                    window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-full p-1.5 hover:bg-muted transition-colors text-xs flex items-center gap-1"
                onClick={() => downloadFile(url, msg.fileName || "imagem.jpg")}
                title={t("download")}
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-full p-1.5 hover:bg-muted transition-colors text-xs flex items-center gap-1"
                onClick={() => saveUrlToGallery(url, msg.fileName || "imagem.jpg", t("savedToGallery"), t("errorSaveToGallery"))}
                title={t("saveToGallery")}
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Image area */}
          <div
            className="flex-1 flex items-center justify-center overflow-hidden bg-black/90 relative"
            onClick={() => { if (scale <= 1) closeLightbox(); }}
          >
            {scale !== 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80 select-none pointer-events-none">
                {Math.round(scale * 100)}%
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="object-contain select-none"
              style={{
                maxHeight: scale === 1 ? "100%" : undefined,
                maxWidth: scale === 1 ? "100%" : undefined,
                transform: `rotate(${rotation}deg) scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
                cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
                transition: dragRef.current ? "none" : "transform 0.15s ease",
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => { e.stopPropagation(); resetZoom(); }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              draggable={false}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Seed deterministic waveform from audio URL so bars are stable per message
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function getWaveBars(url: string, count = 40): number[] {
  let hash = 0;
  for (let i = 0; i < url.length; i++) { hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0; }
  const rand = seededRandom(Math.abs(hash));
  return Array.from({ length: count }, () => 0.15 + rand() * 0.85);
}

function WaveAudioContent({ msg, fromMe }: { msg: Message; fromMe?: boolean }) {
  const t = useTranslations("messageBubble");
  const url = getMediaUrl(msg);
  const audioUrl = getAudioUrl(msg) || url;
  const audioRef = useRef<HTMLAudioElement>(null);
  // React 18 clears DOM refs before cleanup effects run on unmount, so we keep
  // a manual ref updated on every play/timeupdate to use in the handoff.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(() =>
    parseFloat(localStorage.getItem("audioPlaybackRate") || "1")
  );
  const bars = getWaveBars(audioUrl);
  const storeRegister = useAudioPlayerStore((s) => s.register);
  // Refs to capture current values in cleanup effect without re-running it
  const urlRef = useRef(url);
  const audioUrlRef = useRef(audioUrl);
  urlRef.current = url;
  audioUrlRef.current = audioUrl;

  // On unmount: if audio is still playing, hand off to the persistent mini player
  useEffect(() => {
    return () => {
      const el = audioElRef.current;
      if (el && !el.paused && !el.ended) {
        useAudioPlayerStore.getState().handoff(el.currentTime, el.duration);
        el.pause();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmtTime = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (playing) {
      el.pause();
    } else {
      // If element is in error state (e.g. .mp3 404d), reload with original url before playing
      if (el.error && url && el.src !== url) {
        el.src = url;
        el.load();
      }
      el.play().catch(() => {});
    }
  }, [playing, audioUrl, url]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * duration;
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    localStorage.setItem("audioPlaybackRate", String(rate));
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="rounded-xl border bg-muted/20 p-3 min-w-[min(280px,100%)] max-w-[360px]">
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="metadata"
        onPlay={() => {
          const el = audioRef.current;
          if (el) {
            audioElRef.current = el;
            registerAudioPlay(el);
            el.playbackRate = playbackRate;
          }
          // Register this audio with the store so the mini player knows the source
          storeRegister(audioUrlRef.current, urlRef.current, t("audioEmoji"));
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (el) { audioElRef.current = el; setCurrentTime(el.currentTime); }
        }}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onError={() => {
          // .mp3 not found — fall back to original url (may be .ogg)
          const el = audioRef.current;
          if (el && url && el.src !== url) { el.src = url; el.load(); }
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
            fromMe
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          )}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          {/* Waveform bars + seek */}
          <div
            className="flex items-end gap-[2px] h-10 cursor-pointer"
            onClick={handleSeek}
          >
            {bars.map((h, i) => {
              const barProgress = i / bars.length;
              const isPast = barProgress < progress;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-full transition-all",
                    isPast
                      ? fromMe ? "bg-white/90" : "bg-primary"
                      : fromMe ? "bg-white/30" : "bg-muted-foreground/30",
                    playing && isPast && "animate-pulse"
                  )}
                  style={{ height: `${h * 100}%`, animationDelay: `${i * 25}ms`, animationDuration: "800ms" }}
                />
              );
            })}
          </div>
          {/* Time + speed */}
          <div className="flex items-center justify-between">
            <span className={cn("text-[10px] font-mono", fromMe ? "text-white/70" : "text-muted-foreground")}>
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
            <div className="flex items-center gap-0.5">
              {[1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={cn(
                    "rounded px-1 py-0.5 text-[9px] font-medium transition-colors",
                    playbackRate === rate
                      ? fromMe ? "bg-white/30 text-white" : "bg-primary text-primary-foreground"
                      : fromMe ? "bg-white/10 text-white/70 hover:bg-white/20" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => downloadFile(audioUrl, "audio.mp3")}
          className={cn(
            "shrink-0 rounded-full p-2 transition-colors",
            fromMe
              ? "text-white/70 hover:bg-white/10 hover:text-white"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          title={t("downloadAudio")}
        >
          <Download className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function AudioContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const url = getMediaUrl(msg);
  const audioUrl = getAudioUrl(msg) || url;
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playbackRate, setPlaybackRate] = useState(() =>
    parseFloat(localStorage.getItem("audioPlaybackRate") || "1")
  );

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    localStorage.setItem("audioPlaybackRate", String(rate));
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  return (
    <div className="rounded-xl border bg-muted/20 p-3 min-w-[min(280px,100%)] max-w-[360px]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            className="w-full h-9 [&::-webkit-media-controls-panel]:bg-muted/50"
            onPlay={() => {
              if (audioRef.current) { registerAudioPlay(audioRef.current); audioRef.current.playbackRate = playbackRate; }
            }}
          >
            <source src={audioUrl} type="audio/mpeg" />
            {url !== audioUrl && <source src={url} />}
          </audio>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {[1, 1.5, 2, 2.5, 3, 4].map((rate) => (
              <button
                key={rate}
                onClick={() => handleRateChange(rate)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  playbackRate === rate
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => downloadFile(audioUrl, "audio.mp3")}
          className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={t("downloadAudio")}
        >
          <Download className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function VideoContent({ msg }: { msg: Message }) {
  const url = getMediaUrl(msg);
  if (url.endsWith(".gif")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="rounded-lg max-w-[min(280px,100%)]" />;
  }
  return (
    <div>
      <video controls preload="metadata" className="w-full max-w-[280px] rounded-lg">
        <source src={url} />
      </video>
      {(msg.edition ?? msg.body) && <TextContent body={msg.edition ?? msg.body} isEdited={msg.isEdited} originalBody={msg.edition ? msg.body : undefined} />}
    </div>
  );
}

function getFileExtIcon(name: string) {
  const parts = name.split(".");
  // só considera extensão se houver ponto E a parte final tiver no máximo 5 chars
  const rawExt = parts.length > 1 ? (parts.pop() || "") : "";
  const ext = rawExt.length <= 5 ? rawExt.toLowerCase() : "";
  if (["pdf"].includes(ext)) return { label: "PDF", color: "text-red-500" };
  if (["doc", "docx"].includes(ext)) return { label: "DOC", color: "text-blue-500" };
  if (["xls", "xlsx"].includes(ext)) return { label: "XLS", color: "text-green-600" };
  if (["ppt", "pptx"].includes(ext)) return { label: "PPT", color: "text-orange-500" };
  if (["zip", "rar", "7z", "tar"].includes(ext)) return { label: "ZIP", color: "text-yellow-600" };
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return { label: "AUD", color: "text-purple-500" };
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) return { label: "VID", color: "text-blue-600" };
  return { label: ext.toUpperCase() || "FILE", color: "text-muted-foreground" };
}

function DocumentContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const [open, setOpen] = useState(false);
  // Preview de PDF é click-to-load: faturas costumam embutir /OpenAction
  // "imprimir ao abrir", que o viewer executa já no carregamento — com N PDFs
  // no ticket, cada entrada abria N diálogos de impressão/download.
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const url = getMediaUrl(msg);
  // Extensao REAL do arquivo vem da URL (mediaUrl/storageUrl) — sempre preserva a
  // extensao original (.pdf, .docx, ...), mesmo quando ha legenda. Ao enviar um
  // documento COM legenda o backend grava a legenda em `body` (nao existe coluna
  // fileName), entao apos o refresh `body` deixa de conter a extensao e a previa/
  // link de PDF sumia ("perde o link"). Derivar a extensao da URL torna a previa
  // robusta a legenda e mantem o render identico antes/depois do refresh.
  const urlName = (() => {
    const base = (url.split(/[?#]/)[0].split("/").pop()) || "";
    try { return decodeURIComponent(base); } catch { return base; }
  })();
  const bodyText = (msg.body || "").trim();
  // Remove o sufixo de data do multer (_ddMMyyyyHHmmssSSS = 17 digitos) p/ exibir um
  // nome limpo quando so resta o nome do servidor (caso legenda + pos-refresh).
  const cleanUrlName = urlName.replace(/_\d{17}(?=\.[^.]+$)/, "");
  // Mesma sanitizacao do multer (uploadZPRO.ts): espacos->_ e [^\w.-] removidos.
  const sanitizeName = (s: string) => s.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
  // `body` e o NOME do arquivo (envio SEM legenda grava originalname) quando, apos a
  // mesma sanitizacao do multer, bate com o nome do arquivo da URL; senao e LEGENDA.
  // Comparacao por NOME-BASE (nao so pela extensao): uma legenda terminada em ".pdf"
  // nao se passa por nome de arquivo, e evita RegExp dinamico (ext com metachar = crash).
  const bodyIsFileName =
    !bodyText || sanitizeName(bodyText).toLowerCase() === sanitizeName(cleanUrlName).toLowerCase();
  const name = msg.fileName || (bodyIsFileName ? bodyText : "") || cleanUrlName || "documento";
  // Legenda exibida separadamente (como nas imagens) quando o body nao e o nome.
  const caption = !bodyIsFileName && bodyText && bodyText !== msg.fileName ? bodyText : "";
  // Fonte autoritativa da extensao p/ previa e icone: fileName explicito senao a URL.
  const extSource = msg.fileName || urlName;
  const { label, color } = getFileExtIcon(extSource || name);
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(extSource) && !!msg.mediaUrl;
  if (isImage) {
    return <ImageContent msg={msg} />;
  }
  const ext = (extSource.split(".").pop() || "").toLowerCase();
  const canPreview = ["pdf", "html", "htm"].includes(ext);

  const cardClass = "flex items-center gap-3 rounded-lg border bg-muted/30 p-3 max-w-[280px] hover:bg-muted/50 transition-colors text-left w-full";
  const cardInner = (
    <>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted font-bold text-xs", color)}>
        {label}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{canPreview ? t("tapToView") : t("tapToDownload")}</p>
      </div>
      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
    </>
  );

  if (!canPreview) {
    // Download direto — sem abrir nova aba
    return (
      <div className="flex flex-col max-w-[280px]">
        <button type="button" onClick={() => downloadFile(url, name)} className={cardClass}>
          {cardInner}
        </button>
        {caption && <TextContent body={caption} />}
      </div>
    );
  }

  const isPdf = ext === "pdf";

  return (
    <>
      <div className="flex flex-col max-w-[280px]">
        {isPdf && (
          <div
            className="overflow-hidden rounded-t-lg border border-b-0 bg-white w-full"
            style={{ height: 240 }}
          >
            {previewLoaded ? (
              <iframe
                src={url}
                className="w-full h-full"
                title={name}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPreviewLoaded(true)}
                className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <FileText className="h-8 w-8" />
                <span className="text-xs font-medium">{t("clickToLoadPdfPreview")}</span>
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(cardClass, isPdf && "rounded-t-none border-t-0")}
        >
          {cardInner}
        </button>
        {caption && <TextContent body={caption} />}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 pr-12">
            <span className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> {name}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => downloadFile(url, name)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Download className="h-3 w-3" /> {t("download2")}
              </button>
              <button type="button" onClick={() => saveUrlToGallery(url, name, t("savedToGallery"), t("errorSaveToGallery"))} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <FolderPlus className="h-3 w-3" /> {t("saveToGallery")}
              </button>
            </div>
          </div>
          <iframe src={url} className="flex-1 w-full rounded-b-lg bg-white" title={name} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function parseVCard(body: string, fallbackName = "Contato"): { name: string; phone: string } {
  // Outbound BSP (Dialog360/Gupshup) salvam body como JSON Meta-native dos
  // contacts. Detecta e extrai name + phone. Senao cai no parser vCard text.
  const trimmed = (body || "").trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      if (first && typeof first === "object") {
        const name =
          first?.name?.formatted_name ||
          [first?.name?.first_name, first?.name?.last_name].filter(Boolean).join(" ").trim() ||
          fallbackName;
        const phone = String(
          first?.phones?.[0]?.phone || first?.phones?.[0]?.wa_id || ""
        ).replace(/[^\d+]/g, "");
        return { name, phone };
      }
    } catch { /* fallback vcard text abaixo */ }
  }
  const name = body.match(/FN:(.*)/)?.[1]?.trim() || fallbackName;
  // Match TEL lines — handles TEL;type=CELL:+55... and TEL:+55...
  const phoneMatch = body.match(/TEL[^:]*:([\d+\s()\-]+)/);
  const phone = phoneMatch?.[1]?.replace(/\D/g, "") || "";
  return { name, phone };
}

const CHAT_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "meow", "waba"];

function VcardContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const { user } = useAuthStore();

  const [sessions, setSessions] = useState<WhatsappSession[]>([]);
  const [sessionDialog, setSessionDialog] = useState(false);
  const [existingDialog, setExistingDialog] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [resolvedContact, setResolvedContact] = useState<Contact | null>(null);
  const [existingTicketId, setExistingTicketId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchWhatsapps()
      .then(({ data }) => {
        const all = Array.isArray(data) ? data : [];
        setSessions(
          all.filter(
            (w: WhatsappSession) =>
              w.status === "CONNECTED" &&
              CHAT_CHANNEL_TYPES.includes(w.type || "")
          )
        );
      })
      .catch(() => {});
  }, []);

  const connectedSessions = sessions;

  const handleStartChat = async (name: string, number: string) => {
    const cleanNumber = number.replace(/\D/g, "");
    if (!cleanNumber) return;
    setStarting(true);
    try {
      let contact: Contact;
      try {
        const { data } = await createContact({ name, number: cleanNumber, email: "" });
        contact = data as Contact;
      } catch {
        const { data } = await fetchContacts({ searchParam: cleanNumber, pageNumber: 1 });
        const list = ((data as { contacts?: Contact[] }).contacts) ?? [];
        if (!list.length) throw new Error("contact_not_found");
        contact = list[0];
      }
      setResolvedContact(contact);
      setSelectedSessionId(connectedSessions[0]?.id?.toString() ?? "");
      setSessionDialog(true);
    } catch {
      toast.error(t("vcardErrorStart"));
    } finally {
      setStarting(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!resolvedContact || !selectedSessionId) return;
    const session = connectedSessions.find((s) => s.id.toString() === selectedSessionId);
    if (!session) return;
    setStarting(true);
    try {
      const { data: ticket } = await createTicket({
        contactId: resolvedContact.id,
        isActiveDemand: true,
        userId: user?.userId,
        channel: session.type,
        channelId: session.id,
        status: "open",
      });
      setSessionDialog(false);
      toast.success(t("vcardTicketStarted"));
      const ticketData = ticket as { id: number };
      window.location.href = `/atendimento?ticketId=${ticketData.id}`;
    } catch (err: unknown) {
      // O interceptor do axios rejeita com o PRÓPRIO response (error.response || error),
      // então status/data ficam na RAIZ do err — ler err.response aqui nunca casava e o
      // dialog de atendimento existente jamais abria (caía no toast genérico). O corpo
      // do 409 é {message, statusCode, ticket}; o id vem de ticket.id (fallback: message).
      const axErr = err as { status?: number; data?: unknown };
      if (axErr.status === 409) {
        let ticketId: number | null = null;
        const d = axErr.data as { ticket?: { id?: number }; message?: string } | undefined;
        if (d?.ticket?.id) {
          ticketId = d.ticket.id;
        } else if (typeof d?.message === "string") {
          try {
            ticketId = JSON.parse(d.message)?.id ?? null;
          } catch { /* ignore */ }
        }
        setExistingTicketId(ticketId);
        setSessionDialog(false);
        setExistingDialog(true);
      } else {
        toast.error(t("vcardErrorStart"));
      }
    } finally {
      setStarting(false);
    }
  };

  function VcardCard({ name, number, phone }: { name: string; number?: string; phone?: string }) {
    const displayNumber = number || phone || "";
    const hasNumber = !!displayNumber;
    return (
      <div className="rounded-lg border bg-muted/30 overflow-hidden min-w-[min(220px,100%)]">
        <div className="flex items-center gap-3 p-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Contact2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{name}</p>
            {hasNumber && <p className="text-xs text-muted-foreground">{displayNumber}</p>}
          </div>
        </div>
        {hasNumber && (
          <div className="border-t px-3 py-2 flex gap-1.5 flex-wrap">
            <a
              href={`tel:${displayNumber}`}
              className="flex-1 text-center text-xs text-primary font-medium hover:underline py-0.5"
            >
              {t("call")}
            </a>
            <span className="text-border self-center">|</span>
            <button
              type="button"
              className="flex-1 text-center text-xs text-primary font-medium hover:underline py-0.5"
              onClick={() => window.open(`https://wa.me/${displayNumber.replace(/\D/g, "")}`, "_blank")}
            >
              WhatsApp
            </button>
            {connectedSessions.length > 0 && (
              <>
                <span className="text-border self-center">|</span>
                <button
                  type="button"
                  disabled={starting}
                  className="flex-1 text-center text-xs text-primary font-medium hover:underline py-0.5 disabled:opacity-50"
                  onClick={() => handleStartChat(name, displayNumber)}
                >
                  {starting ? t("vcardStarting") : t("vcardStartChat")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  const contacts = msg.vcardList || [];

  return (
    <>
      {/* Cards */}
      {contacts.length > 0 ? (
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <VcardCard key={i} name={c.name} number={c.number} />
          ))}
        </div>
      ) : (
        (() => {
          const { name, phone } = parseVCard(msg.body || "", t("contact"));
          return <VcardCard name={name} phone={phone} />;
        })()
      )}

      {/* Session picker dialog */}
      <Dialog open={sessionDialog} onOpenChange={(v) => { if (!v) setSessionDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Contact2 className="h-4 w-4" />
            {t("vcardSelectSession")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground -mt-1">
            {t("vcardSelectSessionDesc", { name: resolvedContact?.name ?? "" })}
          </p>
          <RadioGroup
            value={selectedSessionId}
            onValueChange={setSelectedSessionId}
            className="gap-2 max-h-60 overflow-y-auto pr-1"
          >
            {connectedSessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value={s.id.toString()} id={`session-${s.id}`} />
                <Label htmlFor={`session-${s.id}`} className="flex-1 cursor-pointer">
                  <span className="font-medium">{s.name}</span>
                  {s.type && (
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{s.type}</span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSessionDialog(false)}>
              {t("cancel")}
            </Button>
            <Button size="sm" disabled={!selectedSessionId || starting} onClick={handleCreateTicket}>
              {starting ? t("vcardStarting") : t("vcardStart")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Existing ticket dialog */}
      <Dialog open={existingDialog} onOpenChange={(v) => { if (!v) setExistingDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-base">{t("vcardExistingTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("vcardExistingMessage")}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setExistingDialog(false)}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setExistingDialog(false);
                if (existingTicketId) window.location.href = `/atendimento?ticketId=${existingTicketId}`;
              }}
            >
              {t("vcardOpenExisting")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const OSM_TILE_SIZE = 256;
const OSM_ZOOM = 15;
// Meia largura/altura máximas da miniatura (280 x 120): cobre o maior tamanho do
// balão; em tela estreita o excedente fica fora do overflow-hidden.
const OSM_HALF_W = 140;
const OSM_HALF_H = 60;

// Monta só os tiles que cobrem a área em volta do ponto (2 a 6 imagens) e os
// posiciona em relação ao CENTRO do contêiner, então o ponto fica centrado em
// qualquer largura do balão.
function OsmMapThumbnail({ lat, lng, alt, attribution }: { lat: number; lng: number; alt: string; attribution: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <MapPin className="h-12 w-12 text-muted-foreground" />;
  }

  const n = 2 ** OSM_ZOOM;
  const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const pointX = ((lng + 180) / 360) * n * OSM_TILE_SIZE;
  const pointY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * OSM_TILE_SIZE;

  const tiles: { key: string; src: string; dx: number; dy: number }[] = [];
  const firstY = Math.floor((pointY - OSM_HALF_H) / OSM_TILE_SIZE);
  const lastY = Math.floor((pointY + OSM_HALF_H) / OSM_TILE_SIZE);
  const firstX = Math.floor((pointX - OSM_HALF_W) / OSM_TILE_SIZE);
  const lastX = Math.floor((pointX + OSM_HALF_W) / OSM_TILE_SIZE);
  for (let ty = firstY; ty <= lastY; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = firstX; tx <= lastX; tx++) {
      const wrappedX = ((tx % n) + n) % n;
      tiles.push({
        key: `${tx}-${ty}`,
        src: `https://tile.openstreetmap.org/${OSM_ZOOM}/${wrappedX}/${ty}.png`,
        dx: tx * OSM_TILE_SIZE - pointX,
        dy: ty * OSM_TILE_SIZE - pointY,
      });
    }
  }

  return (
    <div role="img" aria-label={alt} className="absolute inset-0">
      {tiles.map((tile) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tile.key}
          src={tile.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          className="absolute max-w-none select-none"
          style={{
            width: OSM_TILE_SIZE,
            height: OSM_TILE_SIZE,
            left: `calc(50% + ${tile.dx}px)`,
            top: `calc(50% + ${tile.dy}px)`,
          }}
          onError={() => setFailed(true)}
        />
      ))}
      <MapPin
        className="absolute h-6 w-6 -translate-x-1/2 -translate-y-full text-red-600 fill-red-500/40 drop-shadow"
        style={{ left: "50%", top: "50%" }}
        aria-hidden="true"
      />
      <span className="absolute top-1 right-1 rounded bg-background/80 px-1 text-[9px] leading-tight text-muted-foreground">
        {attribution}
      </span>
    </div>
  );
}

function LocationContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const lat = msg.latitude;
  const lng = msg.longitude;
  // Parse coordinates from body if not in fields (some channels send "lat,lng" in body)
  let parsedLat = lat;
  let parsedLng = lng;
  if (!parsedLat || !parsedLng) {
    const coords = msg.body?.match(/([-\d.]+)[,\s]+([-\d.]+)/);
    if (coords) { parsedLat = parseFloat(coords[1]); parsedLng = parseFloat(coords[2]); }
  }
  const mapsUrl = parsedLat && parsedLng
    ? `https://www.google.com/maps?q=${parsedLat},${parsedLng}`
    : msg.body?.startsWith("http") ? msg.body : "#";

  return (
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg border bg-muted/30 overflow-hidden max-w-[280px]">
      {/* Miniatura por tiles do OpenStreetMap (sem chave de API) */}
      <div className="relative h-[120px] w-full bg-muted flex items-center justify-center overflow-hidden">
        {parsedLat && parsedLng ? (
          <OsmMapThumbnail lat={Number(parsedLat)} lng={Number(parsedLng)} alt={t("locationAlt")} attribution={t("mapAttribution")} />
        ) : (
          <MapPin className="h-12 w-12 text-muted-foreground" />
        )}
        <div className="absolute inset-0 flex items-end justify-start p-2">
          <span className="bg-background/80 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1">
            <MapPin className="h-3 w-3 text-red-500" /> {t("viewOnMap")}
          </span>
        </div>
      </div>
      <div className="p-2">
        <p className="text-xs font-medium">{t("locationLabel")}</p>
        {msg.body && !msg.body.startsWith("http") && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{msg.body}</p>
        )}
      </div>
    </a>
  );
}

function LocationRequestContent() {
  const t = useTranslations("messageBubble");
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Navigation className="h-5 w-5 text-blue-500" />
        <span className="text-sm font-medium">{t("locationRequest")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("locationRequestDescription")}</p>
    </div>
  );
}

function CtaUrlContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  let url = "";
  let label = t("accessLink");
  try {
    const parsed = JSON.parse(msg.body);
    url = parsed?.url || parsed?.displayUrl || "";
    label = parsed?.displayText || parsed?.buttonText || label;
  } catch {
    url = msg.body;
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="h-5 w-5 text-blue-500" />
        <span className="text-sm font-medium">{t("link")}</span>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs">
          <ExternalLink className="h-3 w-3" />
          {label}
        </a>
      )}
    </div>
  );
}

function CtaCallContent({ msg }: { msg: Message }) {
  let label = "";
  let phone = "";
  let body = "";
  let footer = "";
  try {
    const parsed = JSON.parse(msg.body || "{}");
    body = parsed?.body || "";
    footer = parsed?.footer || "";
    const btn = Array.isArray(parsed?.buttons) ? parsed.buttons[0] : null;
    label = btn?.text || btn?.displayText || "";
    phone = btn?.phoneNumber || btn?.phone || parsed?.phoneNumber || "";
  } catch {
    body = msg.body || "";
  }
  const href = phone ? `tel:${phone}` : undefined;
  return (
    <div className="min-w-[min(200px,100%)]">
      {body && <TextContent body={body} />}
      {footer && (
        <div className={cn("mt-1 rounded-md px-2 py-1", msg.fromMe ? "bg-white/10" : "bg-muted/60")}>
          <p className={cn("text-[10px]", msg.fromMe ? "text-primary-foreground/80" : "text-muted-foreground")}>{footer}</p>
        </div>
      )}
      {label && (
        <>
          <div className={cn("border-t mt-2", msg.fromMe ? "border-primary-foreground/20" : "border-border/50")} />
          <a href={href} className={cn("flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium rounded-sm mx-1 my-0.5", msg.fromMe ? "bg-white/10 text-primary-foreground" : "bg-primary/8 text-primary")}>
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{label}</span>
          </a>
          {phone && (
            <div className={cn("mt-0.5 mx-1 rounded-sm px-2 py-0.5", msg.fromMe ? "bg-white/5" : "bg-muted/40")}>
              <p className="text-[10px] text-center text-muted-foreground">{phone}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function parseButtonBody(raw: string): { header: string; body: string; footer: string; buttons: { text: string; url?: string; phone?: string }[] } {
  // 1. JSON (WABA interactive / Meta buttons)
  try {
    const parsed = JSON.parse(raw);
    const btnList = parsed?.buttons || parsed?.templateButtons || [];
    return {
      header: parsed?.header || parsed?.headerText || "",
      body: parsed?.body || parsed?.contentText || raw,
      footer: parsed?.footer || "",
      buttons: btnList.map((b: any) => ({
        text: b.text || b.id || "",
        url: b.url,
        phone: b.phone_number || b.phoneNumber,
      })),
    };
  } catch {}

  // 2. Baileys format: [BUTTON]\n\n*contentText*\n\n*id* - displayText
  if (raw.startsWith("[BUTTON]")) {
    const lines = raw.split("\n");
    const btnLines: string[] = [];
    const bodyLines: string[] = [];
    let footer = "";
    for (const line of lines) {
      if (line === "[BUTTON]") continue;
      if (line.startsWith("[FOOTER]")) {
        footer = line.slice("[FOOTER]".length).trim();
        continue;
      }
      if (/^\*[^*]+\*\s*-\s*/.test(line)) {
        btnLines.push(line.replace(/^\*[^*]+\*\s*-\s*/, "").trim());
      } else {
        bodyLines.push(line);
      }
    }
    return { header: "", body: bodyLines.join("\n").trim(), footer, buttons: btnLines.map(t => ({ text: t })) };
  }

  // 3. Multiline format: "Body: text\nBtn1: x\nBtn2: y"
  if (/\nBtn\d+:/i.test(raw)) {
    const buttons: { text: string }[] = [];
    const btnRegex = /\nBtn\d+:\s*(.+)/gi;
    let m: RegExpExecArray | null;
    while ((m = btnRegex.exec(raw)) !== null) buttons.push({ text: m[1].trim() });
    const bodyPart = raw.replace(/\nBtn\d+:[^\n]*/gi, "").trim();
    const body = bodyPart.startsWith("Body: ") ? bodyPart.slice(6) : bodyPart;
    return { header: "", body, footer: "", buttons };
  }

  // 4. Comma-separated: "Body: text, Btn1: x, Btn2: y"
  if (/,\s*Btn\d+:/i.test(raw)) {
    const buttons: { text: string }[] = [];
    const btnRegex = /,\s*Btn\d+:\s*([^,]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = btnRegex.exec(raw)) !== null) buttons.push({ text: m[1].trim() });
    const bodyPart = raw.replace(/,\s*Btn\d+:\s*[^,]+/gi, "").trim();
    const body = bodyPart.startsWith("Body: ") ? bodyPart.slice(6) : bodyPart;
    return { header: "", body, footer: "", buttons };
  }

  // Fallback: plain text, no buttons
  return { header: "", body: raw, footer: "", buttons: [] };
}

function ButtonContent({ msg, onQuickSend }: { msg: Message; onQuickSend?: (text: string) => void }) {
  const { header, body, footer, buttons } = parseButtonBody(msg.body || "");
  const divider = msg.fromMe ? "border-primary-foreground/20" : "border-border/50";
  const clickable = !!onQuickSend;
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  return (
    <div className="w-full min-w-0">
      {header && <p className="text-sm font-semibold mb-1 break-words">{header}</p>}
      <TextContent body={body} />
      {footer && <p className={cn("text-[10px] mt-1 break-words", msg.fromMe ? "text-primary-foreground/60" : "text-muted-foreground")}>{footer}</p>}
      {buttons.length > 0 && (
        <div className="flex flex-col gap-1.5 w-full">
          <div className={cn("border-t mt-2", divider)} />
          {buttons.map((btn, i) => {
            const baseClass = cn(
              "flex w-full items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium rounded-sm select-none",
              msg.fromMe
                ? "bg-white/10 text-primary-foreground"
                : "bg-primary/8 text-primary",
            );
            const linkClass = cn(baseClass, "cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity");
            const renderInner = (icon: React.ReactNode) => (
              <>{icon}<span className="break-words min-w-0 flex-1 text-center">{btn.text}</span></>
            );
            return (
              <React.Fragment key={i}>
                {i > 0 && <div className={cn("border-t", divider)} />}
                {btn.url ? (
                  <button type="button" onClick={() => setModalUrl(btn.url!)} className={linkClass}>
                    {renderInner(<ExternalLink className="h-3 w-3 shrink-0" />)}
                  </button>
                ) : btn.phone ? (
                  <a href={`tel:${btn.phone.replace(/[^\d+]/g, "")}`} className={linkClass}>
                    {renderInner(<Phone className="h-3 w-3 shrink-0" />)}
                  </a>
                ) : (
                  <div
                    role={clickable ? "button" : undefined}
                    onClick={clickable && btn.text ? () => onQuickSend(btn.text) : undefined}
                    className={cn(
                      baseClass,
                      clickable && "cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity",
                      !clickable && "cursor-default",
                    )}
                  >
                    {renderInner(null)}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {modalUrl && <LinkModal url={modalUrl} onClose={() => setModalUrl(null)} />}
    </div>
  );
}

function ListResponseContent({ msg }: { msg: Message }) {
  const isRowId = /^s\d+r\d+$/.test((msg.body || "").trim());
  const displayText = isRowId ? "" : (msg.body || "").trim();
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <List className="h-4 w-4 shrink-0 opacity-70" />
      <span className="text-sm">
        {displayText || <span className="italic opacity-60">Opção selecionada</span>}
      </span>
    </div>
  );
}

function ListContent({ msg, onQuickSend }: { msg: Message; onQuickSend?: (text: string) => void }) {
  const [modalOpen, setModalOpen] = useState(false);

  let sections: { title: string; rows: { title: string; description?: string }[] }[] = [];
  let headerText = "";
  let bodyText = msg.body;
  let footerText = "";
  let buttonText = "";

  const raw = msg.body || "";

  // 1. JSON (WABA list / Meta list)
  try {
    const parsed = JSON.parse(raw);
    sections = parsed?.sections || [];
    headerText = parsed?.header || parsed?.title || "";
    bodyText = parsed?.body || "";
    footerText = parsed?.footer || "";
    buttonText = parsed?.button_text || "";
  } catch {
    // 2. Baileys format: [LIST]\n\n*description*\n\nrow1\nrow2...
    if (raw.startsWith("[LIST]")) {
      const lines = raw.split("\n");
      const rows: { title: string }[] = [];
      let descLines: string[] = [];
      let pastHeader = false;
      for (const line of lines) {
        if (line === "[LIST]") { pastHeader = true; continue; }
        if (!pastHeader) continue;
        const stripped = line.replace(/^\*(.+)\*$/, "$1").trim();
        if (!stripped) continue;
        if (descLines.length === 0 && rows.length === 0) {
          descLines.push(stripped);
        } else {
          rows.push({ title: stripped });
        }
      }
      bodyText = descLines.join("\n");
      if (rows.length > 0) sections = [{ title: "", rows }];
    } else {
      bodyText = raw;
    }
  }

  const hasRows = sections.some(s => s.rows.length > 0);
  const displayButton = buttonText || (hasRows ? "Ver opções" : "");

  const handleRowClick = (rowTitle: string) => {
    if (onQuickSend && rowTitle) {
      onQuickSend(rowTitle);
      setModalOpen(false);
    }
  };

  return (
    <>
      <div className="w-full min-w-0 space-y-1">
        {headerText && <p className="text-sm font-semibold break-words">{headerText}</p>}
        {bodyText && <TextContent body={bodyText} />}
        {footerText && <p className={cn("text-[10px] break-words", msg.fromMe ? "text-primary-foreground/70" : "text-muted-foreground")}>{footerText}</p>}
        {displayButton && (
          <>
            <div className={cn("border-t mt-2", msg.fromMe ? "border-primary-foreground/20" : "border-border/50")} />
            <button
              type="button"
              onClick={hasRows ? () => setModalOpen(true) : undefined}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium select-none transition-opacity rounded-b-lg",
                hasRows ? "cursor-pointer hover:opacity-80 active:opacity-60" : "cursor-default",
                msg.fromMe
                  ? "bg-white/15 text-primary-foreground hover:bg-white/25"
                  : "bg-primary/10 text-primary hover:bg-primary/20",
              )}
            >
              <List className="h-3.5 w-3.5 shrink-0" />
              <span>{displayButton}</span>
            </button>
          </>
        )}
      </div>

      {hasRows && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-sm w-full p-0 gap-0 overflow-hidden rounded-2xl">
            <DialogTitle className="sr-only">{displayButton}</DialogTitle>
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <button type="button" onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
              <span className="font-medium text-sm">{displayButton}</span>
            </div>
            <div className="overflow-y-auto max-h-[70vh] py-2">
              {sections.map((section, si) => (
                <div key={si}>
                  {section.title && (
                    <p className="text-xs font-medium text-muted-foreground px-4 py-2 bg-muted/50">{section.title}</p>
                  )}
                  {section.rows.map((row, ri) => (
                    <button
                      key={ri}
                      type="button"
                      onClick={() => handleRowClick(row.title)}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        onQuickSend ? "cursor-pointer" : "cursor-default",
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-sm font-medium break-words">{row.title}</p>
                        {row.description && <p className="text-xs text-muted-foreground break-words">{row.description}</p>}
                      </div>
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function InteractiveContent({ msg, onQuickSend }: { msg: Message; onQuickSend?: (text: string) => void }) {
  let bodyText = msg.body;
  let footerText = "";
  let buttons: { text: string; id?: string; url?: string; phone?: string }[] = [];

  try {
    const parsed = JSON.parse(msg.body);
    bodyText = parsed?.body?.text || parsed?.body || parsed?.contentText || msg.body;
    buttons = parsed?.action?.buttons?.map((b: { reply?: { title: string; id: string } }) => ({
      text: b.reply?.title || "",
      id: b.reply?.id,
    })) || [];
  } catch {
    // Formato baileys: "<texto>\n\n[Botões]\n• btn1 (id: x)\n• btn2 (id: y)\n[\n_footer_]"
    const raw = msg.body || "";
    const idx = raw.indexOf("[Botões]");
    const idx2 = idx === -1 ? raw.indexOf("[Botoes]") : idx;
    if (idx2 >= 0) {
      bodyText = raw.substring(0, idx2).trim();
      const marker = raw.substring(idx2, idx2 + 8);
      const rest = raw.substring(idx2 + marker.length);
      const lines = rest.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Footer: _texto_
        const footerMatch = trimmed.match(/^_(.+)_$/);
        if (footerMatch) { footerText = footerMatch[1]; continue; }
        // • texto (id: id) | • texto -> url | • texto [Copiar: x] | • texto [Ligar: y]
        const m = trimmed.match(/^[•\-*]\s*(.+?)(?:\s*\(id:\s*([^)]+)\))?(?:\s*->\s*(\S+))?(?:\s*\[(?:Copiar|Ligar):\s*([^\]]+)\])?$/);
        if (m) {
          const text = m[1].trim();
          if (text) buttons.push({ text, id: m[2]?.trim(), url: m[3]?.trim(), phone: m[4]?.trim() });
        }
      }
    } else {
      bodyText = raw;
    }
  }

  const clickable = !!onQuickSend;
  const divider = msg.fromMe ? "border-primary-foreground/20" : "border-border/50";
  return (
    <div className="w-full min-w-0">
      <TextContent body={typeof bodyText === "string" ? bodyText : msg.body} />
      {footerText && <p className={cn("text-[10px] mt-1 break-words", msg.fromMe ? "text-primary-foreground/60" : "text-muted-foreground")}>{footerText}</p>}
      {buttons.length > 0 && (
        <div className="flex flex-col gap-1.5 w-full">
          <div className={cn("border-t mt-2", divider)} />
          {buttons.map((btn, i) => {
            const baseClass = cn(
              "flex w-full items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium rounded-sm select-none",
              msg.fromMe ? "bg-white/10 text-primary-foreground" : "bg-primary/8 text-primary",
            );
            const linkClass = cn(baseClass, "cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity");
            const sep = i > 0 ? <div className={cn("border-t", divider)} /> : null;
            if (btn.url) {
              return (
                <React.Fragment key={i}>
                  {sep}
                  <a href={btn.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="break-words min-w-0 flex-1 text-center">{btn.text}</span>
                  </a>
                </React.Fragment>
              );
            }
            if (btn.phone) {
              return (
                <React.Fragment key={i}>
                  {sep}
                  <a href={`tel:${btn.phone.replace(/[^\d+]/g, "")}`} className={linkClass}>
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="break-words min-w-0 flex-1 text-center">{btn.text}</span>
                  </a>
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={i}>
                {sep}
                <div
                  role={clickable ? "button" : undefined}
                  onClick={clickable && btn.text ? () => onQuickSend(btn.text) : undefined}
                  className={cn(
                    baseClass,
                    clickable && "cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity",
                    !clickable && "cursor-default",
                  )}
                >
                  <span className="break-words min-w-0 flex-1 text-center">{btn.text}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CopyCodeButton({ btn, copyCode, t }: { btn: { text: string }; copyCode: string; t: ReturnType<typeof useTranslations> }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const value = copyCode || btn.text;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast.success(t("codeCopied"));
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-xs w-full hover:bg-muted/50 transition-colors"
    >
      <Copy className="h-3 w-3 shrink-0" />
      <span className="flex-1 text-left">{copied ? t("copied") : btn.text}</span>
      {copyCode && <span className="text-muted-foreground font-mono">{copyCode}</span>}
    </button>
  );
}

// Ficha de cobranca do template ORDER_DETAILS (docs/PLANO_TEMPLATE_ORDER_DETAILS.md).
// D0 — caminho paralelo: este bloco le o dataJson por conta propria e NAO passa pelo
// merge body+dataJson do TemplateContent, que fica intocado. Template comum, marketing,
// auth, carrossel, catalogo e flow continuam renderizando exatamente como antes.
type MetaAmount = { value?: number; offset?: number };

type OrderDetailsPayload = {
  reference_id?: string;
  currency?: string;
  total_amount?: MetaAmount;
  payment_settings?: {
    type?: string;
    pix_dynamic_code?: { code?: string; merchant_name?: string };
    boleto?: { digitable_line?: string };
    payment_link?: { uri?: string };
  }[];
  order?: {
    items?: { name?: string; quantity?: number }[];
    subtotal?: MetaAmount;
    tax?: MetaAmount;
    shipping?: MetaAmount;
    discount?: MetaAmount;
  };
};

// Os 4 metodos de pagamento aceitos pela Meta -> chave i18n do rotulo.
const ORDER_DETAILS_PAYMENT_KEYS: Record<string, string> = {
  pix_dynamic_code: "paymentPix",
  payment_link: "paymentLink",
  boleto: "paymentBoleto",
  offsite_card_pay: "paymentCard",
};

// dataJson pode ser o array de components ou um envelope ({components}/{template}).
// Sem cobranca (mensagem antiga, ou BSP que nao grava dataJson) devolve null e a
// bolha segue igual — nada de erro no console.
function readOrderDetails(dataJson?: string | null): OrderDetailsPayload | null {
  const raw = typeof dataJson === "string" ? dataJson.trim() : "";
  if (!raw.startsWith("[") && !raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw);
    const components = Array.isArray(parsed)
      ? parsed
      : parsed?.components || parsed?.template?.components;
    return extractOrderDetails(components) as OrderDetailsPayload | null;
  } catch {
    return null;
  }
}

// Acao concreta do botao de cobranca, conforme o metodo de pagamento enviado:
// Pix e boleto sao copiaveis (o atendente consegue reenviar o codigo por outro
// canal, conferir, ou colar em conversa); link abre o checkout. Sem metodo
// reconhecido devolve null e o botao volta a ser so um rotulo inerte.
type OrderDetailsAction =
  | { kind: "copy"; value: string; labelKey: "copyPixCode" | "copyBoletoCode" }
  | { kind: "link"; value: string; labelKey: "openPaymentLink" };

function getOrderDetailsAction(details: OrderDetailsPayload | null): OrderDetailsAction | null {
  for (const setting of details?.payment_settings || []) {
    const code = setting?.pix_dynamic_code?.code;
    if (setting?.type === "pix_dynamic_code" && code) {
      return { kind: "copy", value: code, labelKey: "copyPixCode" };
    }
    const line = setting?.boleto?.digitable_line;
    if (setting?.type === "boleto" && line) {
      return { kind: "copy", value: line, labelKey: "copyBoletoCode" };
    }
    const uri = setting?.payment_link?.uri;
    if (setting?.type === "payment_link" && uri) {
      return { kind: "link", value: uri, labelKey: "openPaymentLink" };
    }
  }
  return null;
}

function OrderDetailsActionButton({
  action,
  tOrder,
}: {
  action: OrderDetailsAction;
  tOrder: (key: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const baseClass =
    "flex w-full items-center justify-center gap-1.5 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors px-3 py-1.5 text-xs font-medium text-primary";

  if (action.kind === "link") {
    return (
      <a href={action.value} target="_blank" rel="noopener noreferrer" className={baseClass}>
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="break-words min-w-0 flex-1 text-center">{tOrder("openPaymentLink")}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(action.value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={baseClass}
    >
      <Copy className="h-3 w-3 shrink-0" />
      <span className="break-words min-w-0 flex-1 text-center">
        {copied ? tOrder("copied") : tOrder(action.labelKey)}
      </span>
    </button>
  );
}

// --- Baixa manual da cobranca (F4) ------------------------------------------
// O WhatsApp so copia o codigo: o cliente paga no app do banco e nada volta para
// nos. Sem alguem conferir o extrato e dar baixa, a cobranca fica `pending` para
// sempre. Uma conversa pode ter varias fichas, entao a consulta e feita uma vez
// por ticket e compartilhada entre as bolhas (cache curto — a baixa pode ter sido
// dada por outro atendente).
const PAYMENTS_CACHE_TTL = 20000;
const paymentsCache = new Map<number, { at: number; rows: WhatsappPayment[] }>();
const paymentsInFlight = new Map<number, Promise<WhatsappPayment[]>>();
const paymentsListeners = new Set<() => void>();

function loadTicketPayments(ticketId: number): Promise<WhatsappPayment[]> {
  const hit = paymentsCache.get(ticketId);
  if (hit && Date.now() - hit.at < PAYMENTS_CACHE_TTL) return Promise.resolve(hit.rows);
  const running = paymentsInFlight.get(ticketId);
  if (running) return running;
  const req = listWhatsappPayments({ ticketId })
    .then((rows) => {
      paymentsCache.set(ticketId, { at: Date.now(), rows });
      return rows;
    })
    .finally(() => { paymentsInFlight.delete(ticketId); });
  paymentsInFlight.set(ticketId, req);
  return req;
}

// Apos uma baixa/cancelamento todas as fichas abertas releem o status.
function refreshTicketPayments(ticketId: number) {
  paymentsCache.delete(ticketId);
  paymentsListeners.forEach((fn) => fn());
}

const PAYMENT_STATUS_KEYS: Record<string, string> = {
  pending: "statusPending",
  paid: "statusPaid",
  canceled: "statusCanceled",
  expired: "statusExpired",
  failed: "statusFailed",
};

// Recusas que o operador consegue entender viram texto proprio; o resto mostra o
// codigo para o suporte em vez de sumir num "erro" generico.
const SETTLE_ERROR_KEYS: Record<string, string> = {
  ERR_PAYMENT_INVALID_TRANSITION: "errorInvalidTransition",
  ERR_ORDER_STATUS_INVALID_TRANSITION: "errorInvalidTransition",
  // Recusas da maquina de estados do WhatsappPaymentControllerZPRO (409). Sem elas
  // o operador via o codigo cru ("Falha ao dar baixa: ERR_ORDER_PAYMENT_...") —
  // sendo que as tres sao situacoes normais, nao falha de sistema.
  ERR_ORDER_PAYMENT_ALREADY_PAID: "errorAlreadyPaid",
  ERR_ORDER_PAYMENT_CANCELED: "errorAlreadyCanceled",
  ERR_ORDER_PAYMENT_NOT_SENT: "errorNotSent",
  // 404: a cobranca sumiu entre o carregamento da lista e o clique (outro
  // atendente cancelou, ou a linha e de outro tenant). Mesmo sintoma das acima.
  ERR_ORDER_PAYMENT_NOT_FOUND: "errorPaymentNotFound",
};

function OrderDetailsSettlement({ referenceId, ticketId }: { referenceId: string; ticketId: number }) {
  const t = useTranslations("orderDetails");
  const tCommon = useTranslations("common");
  const [payment, setPayment] = useState<WhatsappPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"paid" | "cancel" | null>(null);
  const mountedRef = useRef(true);

  // Backend sem a rota (instalacao antiga) devolve 404: a ficha simplesmente nao
  // ganha o controle de baixa, sem erro na tela.
  const reload = useCallback(() => {
    loadTicketPayments(ticketId)
      .then((rows) => {
        if (mountedRef.current) {
          setPayment(rows.find((r) => r.referenceId === referenceId) || null);
        }
      })
      .catch(() => {});
  }, [ticketId, referenceId]);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    paymentsListeners.add(reload);
    return () => {
      mountedRef.current = false;
      paymentsListeners.delete(reload);
    };
  }, [reload]);

  const runSettle = async (kind: "paid" | "cancel") => {
    if (!payment || busy) return;
    setBusy(true);
    try {
      const updated = kind === "paid"
        ? await markPaymentAsPaid(payment.id)
        : await cancelPayment(payment.id);
      if (updated && mountedRef.current) setPayment(updated);
      toast.success(kind === "paid" ? t("markedAsPaid") : t("chargeCanceled"));
      refreshTicketPayments(ticketId);
    } catch (err: unknown) {
      // O interceptor de api.ts rejeita com a RESPOSTA, entao o codigo chega em
      // `data.error`. 403 ERR_NO_PERMISSION ja dispara o aviso global — repetir
      // aqui viraria dois toasts para a mesma recusa.
      const status = (err as { status?: number })?.status;
      const code = String(
        (err as { data?: { error?: string } })?.data?.error ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        ""
      );
      if (status === 403 && code === "ERR_NO_PERMISSION") return;
      const mapped = SETTLE_ERROR_KEYS[code];
      if (mapped) toast.error(t(mapped));
      else toast.error(code ? `${t("errorSettleFailed")}: ${code}` : t("errorSettleFailed"));
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setConfirming(null);
      }
    }
  };

  if (!payment) return null;

  if (payment.status === "paid") {
    const paidAt = payment.paidAt
      ? new Date(payment.paidAt).toLocaleString(undefined, {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        })
      : "";
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t pt-1.5 text-[11px] font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>{t("statusPaid")}</span>
        {paidAt && <span className="font-normal text-muted-foreground">{paidAt}</span>}
      </div>
    );
  }

  if (payment.status === "canceled" || payment.status === "expired" || payment.status === "failed") {
    return (
      <div className="flex items-center gap-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
        <Ban className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words">{t(PAYMENT_STATUS_KEYS[payment.status])}</span>
      </div>
    );
  }

  // `creating`: o envio ainda esta em curso — nada a dar baixa por enquanto.
  if (payment.status !== "pending") return null;

  const isCancel = confirming === "cancel";
  const actionClass =
    "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-60";

  return (
    <div className="space-y-1.5 border-t pt-1.5">
      <p
        title={t("noteManualSettlement")}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <Clock className="h-3 w-3 shrink-0" />
        <span className="min-w-0 break-words">{t("statusPending")}</span>
      </p>
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming("paid")}
          className={cn(actionClass, "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20")}
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{t("markAsPaid")}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming("cancel")}
          className={cn(actionClass, "bg-muted/30 text-muted-foreground hover:bg-muted/60")}
        >
          <Ban className="h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{t("cancelCharge")}</span>
        </button>
      </div>
      {confirming && (
        <AlertDialog open onOpenChange={(open) => { if (!open && !busy) setConfirming(null); }}>
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
              <AlertDialogCancel disabled={busy}>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                className={buttonVariants({ variant: isCancel ? "destructive" : "default" })}
                onClick={(e) => { e.preventDefault(); runSettle(isCancel ? "cancel" : "paid"); }}
              >
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {isCancel ? t("cancelCharge") : t("markAsPaid")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// Espelha o que o cliente ve no WhatsApp (validado em aparelho real, §1.2.2):
// numero da cobranca, itens com quantidade, metodos de pagamento e os totais.
// `fromMe` libera a baixa manual: cobranca so existe em mensagem que nos enviamos.
function OrderDetailsCard({
  details,
  fromMe,
  ticketId,
}: {
  details: OrderDetailsPayload;
  fromMe?: boolean;
  ticketId?: number;
}) {
  const t = useTranslations("orderDetails");
  const currency = details.currency || "BRL";
  const money = (amount?: MetaAmount) => formatMetaAmount(amount, currency);
  const hasValue = (amount?: MetaAmount) => typeof amount?.value === "number" && amount.value !== 0;

  const rawItems = details.order?.items;
  const items = Array.isArray(rawItems) ? rawItems : [];
  const methods = (details.payment_settings || [])
    .map((p) => ORDER_DETAILS_PAYMENT_KEYS[String(p?.type || "").toLowerCase()])
    .filter((key, i, arr) => Boolean(key) && arr.indexOf(key) === i)
    .map((key) => t(key));

  // Subtotal/desconto/frete/imposto sao opcionais na Meta: so aparecem quando vieram.
  const rows = [
    { label: t("subtotal"), amount: details.order?.subtotal },
    { label: t("discount"), amount: details.order?.discount },
    { label: t("shipping"), amount: details.order?.shipping },
    { label: t("tax"), amount: details.order?.tax },
  ].filter((r) => hasValue(r.amount));
  const total = money(details.total_amount);

  return (
    <div className="w-full min-w-0 space-y-1.5 rounded-lg border bg-muted/30 p-2 sm:p-3">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="text-xs font-medium uppercase text-emerald-600">{t("chargeTitle")}</span>
      </div>
      {details.reference_id && (
        <p className="text-[11px] text-muted-foreground break-all">
          {t("chargeNumber")}: <span className="font-mono">{details.reference_id}</span>
        </p>
      )}
      {items.length > 0 && (
        <div className="space-y-0.5">
          {items.map((item, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="min-w-0 break-words font-medium">{item.name}</span>
              {typeof item.quantity === "number" && (
                <span className="text-muted-foreground">{t("quantity")}: {item.quantity}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {methods.length > 0 && (
        <p className="text-xs text-muted-foreground break-words">
          {t("payWith")}: {methods.join(" / ")}
        </p>
      )}
      {(rows.length > 0 || total) && (
        <div className="space-y-0.5 border-t pt-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="min-w-0 break-words">{r.label}</span>
              <span className="shrink-0 tabular-nums">{money(r.amount)}</span>
            </div>
          ))}
          {total && (
            <div className="flex items-baseline justify-between gap-2 text-xs font-semibold">
              <span className="min-w-0 break-words">{t("total")}</span>
              <span className="shrink-0 tabular-nums text-emerald-600">{total}</span>
            </div>
          )}
        </div>
      )}
      {/* Baixa manual — so na cobranca que nos enviamos (D1/F4) */}
      {fromMe && details.reference_id && typeof ticketId === "number" && (
        <OrderDetailsSettlement referenceId={details.reference_id} ticketId={ticketId} />
      )}
    </div>
  );
}

function TemplateContent({ msg, onQuickSend }: { msg: Message; onQuickSend?: (text: string) => void }) {
  const t = useTranslations("messageBubble");
  const tOrder = useTranslations("orderDetails");
  const [modalUrl, setModalUrl] = useState<string | null>(null);
  // Cobranca lida direto do dataJson, fora do merge abaixo (D0).
  const orderDetails = readOrderDetails(msg.dataJson);

  type TemplateComp = {
    type: string;
    format?: string;
    text?: string;
    value?: string;
    example?: { header_handle?: string[] };
    parameters?: { type?: string; text?: string }[];
    buttons?: { type: string; text: string; url?: string; phone_number?: string; otp_type?: string; autofill_text?: string; example?: string[]; coupon_code?: string }[];
  };

  const parseComponents = (raw: string | null | undefined): TemplateComp[] => {
    if (!raw) return [];
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s.startsWith("[") && !s.startsWith("{")) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
      return parsed?.components || parsed?.template?.components || [];
    } catch { return []; }
  };

  const headerMediaUrl = (comp: TemplateComp): string => {
    if (comp.value) return comp.value;
    const h = comp.example?.header_handle;
    return Array.isArray(h) && h[0] ? h[0] : "";
  };

  let headerFormat = "";
  let headerText = "";
  let headerMediaSrc = "";
  let body = msg.body;
  let footer = "";
  let buttons: { type: string; text: string; url?: string; phone_number?: string; otp_type?: string; autofill_text?: string; example?: string[]; coupon_code?: string }[] = [];

  try {
 // Merge body + dataJson (same logic as the legacy front's formatarTemplates)
    const fromBody = parseComponents(msg.body);
    const fromDataJson = parseComponents(msg.dataJson);
    const bodyLooksLikeArray = (msg.body ?? "").trim().startsWith("[") && fromBody.length > 0;

    let components: TemplateComp[];
    if (bodyLooksLikeArray) {
      components = fromBody.map((c) => ({ ...c }));
      const dh = fromDataJson.find((c) => c.type === "HEADER");
      if (dh) {
        const idx = components.findIndex((c) => c.type === "HEADER");
        if (idx >= 0) components[idx] = { ...components[idx], ...dh };
        else components = [dh, ...components];
      }
    } else {
      components = fromDataJson.length ? fromDataJson : fromBody;
      if (!bodyLooksLikeArray) body = msg.body; // plain text body
    }

    for (const comp of components) {
      if (comp.type === "HEADER") {
        headerFormat = comp.format || "TEXT";
        if (headerFormat === "TEXT") {
          headerText = comp.text || comp.parameters?.[0]?.text || "";
        } else {
          headerMediaSrc = headerMediaUrl(comp);
        }
      }
      if (comp.type === "BODY") body = comp.text || msg.body;
      if (comp.type === "FOOTER") footer = comp.text || "";
      if (comp.type === "BUTTONS") buttons = comp.buttons || [];
    }

    if (!components.length) {
      const parsed = JSON.parse(msg.body);
      body = parsed?.body || parsed?.text || msg.body;
      headerText = parsed?.header || "";
      footer = parsed?.footer || "";
      buttons = parsed?.buttons || [];
    }
  } catch {
    body = msg.body;
  }

  return (
    <div className="w-full min-w-0 space-y-2 rounded-lg border bg-muted/10 p-2 sm:p-3">
      {/* Header: text */}
      {headerFormat === "TEXT" && headerText && (
        <p className="text-sm font-semibold break-words">{headerText}</p>
      )}
      {/* Header: video */}
      {headerFormat === "VIDEO" && headerMediaSrc && (
        <video controls className="max-w-[min(250px,100%)] rounded" preload="metadata">
          <source src={headerMediaSrc} type="video/mp4" />
        </video>
      )}
      {/* Header: image */}
      {headerFormat === "IMAGE" && headerMediaSrc && (
        <img src={headerMediaSrc} alt="" className="max-w-[min(250px,100%)] rounded" />
      )}
      {/* Header: document */}
      {headerFormat === "DOCUMENT" && headerMediaSrc && (
        <button
          type="button"
          onClick={() => downloadFile(headerMediaSrc, "documento")}
          className="flex items-center gap-1 text-xs text-blue-500 underline hover:text-blue-600"
        >
          <FileText className="h-3 w-3" />
          {t("downloadDocument")}
        </button>
      )}
      {/* Ficha de cobranca: acima do corpo, como o cliente ve no WhatsApp */}
      {orderDetails && (
        <OrderDetailsCard details={orderDetails} fromMe={msg.fromMe} ticketId={msg.ticketId} />
      )}
      <TextContent body={body} />
      {footer && <p className="text-[10px] text-muted-foreground">{footer}</p>}
      {buttons.length > 0 && (
        <div className="flex flex-col gap-1.5 w-full border-t pt-2 mt-2">
          {buttons.map((btn, i) => {
            const copyCode = btn.example?.[0] || btn.coupon_code || btn.autofill_text || "";
            // OTP buttons in AUTHENTICATION templates also act as copy-code (the
            // actual OTP is the autofill_text or comes from a runtime parameter).
            // OTP variants: COPY_CODE (manual copy), ONE_TAP/ZERO_TAP (autofill).
            const isOtpCopyable = btn.type === "OTP" && btn.otp_type !== "ZERO_TAP";
            if (btn.type === "COPY_CODE" || isOtpCopyable) {
              return <CopyCodeButton key={i} btn={btn} copyCode={copyCode} t={t} />;
            }
            const baseClass = "flex w-full items-center justify-center gap-1.5 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors px-3 py-1.5 text-xs font-medium text-primary";
            if (btn.type === "URL" && btn.url) {
              const url = btn.url;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setModalUrl(url)}
                  className={baseClass}
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="break-words min-w-0 flex-1 text-center">{btn.text || t("open")}</span>
                </button>
              );
            }
            if (btn.type === "PHONE_NUMBER" && btn.phone_number) {
              const telHref = `tel:${btn.phone_number.replace(/[^\d+]/g, "")}`;
              return (
                <a key={i} href={telHref} className={baseClass}>
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="break-words min-w-0 flex-1 text-center">{btn.text || t("call")}</span>
                </a>
              );
            }
            // ORDER_DETAILS: botao de cobranca. Quem toca nele e o cliente, no
            // aparelho dele — aqui e so um rotulo. Precisa vir ANTES do fallback:
            // clicar chamaria onQuickSend e mandaria o texto do botao ("Copiar
            // codigo Pix") como mensagem do atendente.
            // O componente montado pelos senders chega no formato final da Meta
            // ({ type: "button", sub_type: "order_details", parameters: [...] }) e SEM
            // `text` — e assim que a cobranca enviada por ChatFlow/Baileys fica gravada
            // no dataJson. Sem casar o sub_type ele escapava deste branch, caia no
            // fallback e virava uma barra cinza vazia embaixo da ficha.
            const btnSubType = String((btn as unknown as { sub_type?: string }).sub_type || "").toLowerCase();
            if (String(btn.type || "").toUpperCase() === "ORDER_DETAILS" || btnSubType === "order_details") {
              // Quando a cobranca traz o codigo (Pix/boleto) ou o link, o botao
              // vira acao util para o atendente: copiar ou abrir. NUNCA chama
              // onQuickSend — isso mandaria o texto do botao como mensagem.
              const action = getOrderDetailsAction(orderDetails);
              if (action) {
                return <OrderDetailsActionButton key={i} action={action} tOrder={tOrder} />;
              }
              return (
                <div
                  key={i}
                  title={tOrder("buttonHint")}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Receipt className="h-3 w-3 shrink-0" />
                  <span className="break-words min-w-0 flex-1 text-center">{btn.text || tOrder("payButton")}</span>
                </div>
              );
            }
            // QUICK_REPLY (and any unknown type with text) — clicking sends the
            // button's text as an outgoing message, like a regular reply.
            if (onQuickSend && btn.text) {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onQuickSend(btn.text)}
                  className={cn(baseClass, "cursor-pointer")}
                >
                  <span className="break-words min-w-0 flex-1 text-center">{btn.text}</span>
                </button>
              );
            }
            return (
              <div key={i} className="flex w-full items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-xs">
                <span className="flex-1 min-w-0 break-words">{btn.text}</span>
              </div>
            );
          })}
        </div>
      )}
      {modalUrl && <LinkModal url={modalUrl} onClose={() => setModalUrl(null)} />}
    </div>
  );
}

// Parsing tolerante de produto/pedido RECEBIDO (inbound). Os canais gravam o body em
// formatos heterogeneos: dataJson normalizado (novo contrato), pipe-base64 do Baileys
// (legado), JSON puro, ou markdown/texto. Normalizamos para um shape unico de exibicao
// para que produto/pedido recebido apareca como ficha em vez de texto cru.
function parseInboundJson(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// priceAmount1000 do WhatsApp = preco x 1000. Valores ja formatados ("R$ ...") passam direto.
function formatWaThousandPrice(raw?: string | number | null): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const s = String(raw).trim();
  if (s.startsWith("R$")) return s;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n === 0) return "";
  return `R$ ${(n / 1000).toFixed(2).replace(".", ",")}`;
}

// data: URIs nao podem passar por getMediaUrl (seria prefixado com API_URL).
function resolveProductImage(imageUrl: string): string {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("data:")) return imageUrl;
  return getMediaUrl(imageUrl);
}

interface ProductCardData {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  url: string;
  videoUrl: string;
}

function parseProductData(msg: Message): ProductCardData {
  // 1) dataJson normalizado (novo contrato dos canais)
  const dj = parseInboundJson(msg.dataJson);
  if (dj && (dj.title || dj.productName || dj.imageUrl || dj.thumbnailUrl)) {
    return {
      name: String(dj.title || dj.productName || ""),
      description: String(dj.description || ""),
      price: dj.price ? String(dj.price) : "",
      imageUrl: String(dj.imageUrl || dj.thumbnailUrl || ""),
      url: String(dj.url || ""),
      videoUrl: String(dj.videoUrl || ""),
    };
  }
  const body = msg.body || "";
  // 2) pipe-base64 legado do Baileys: "data:image/...;base64, <BLOB> | title | price | desc | url"
  //    O base64 historico costuma ser lixo (Buffer interpolado sem toString('base64')),
  //    entao extraimos so os campos de texto e ignoramos a imagem corrompida.
  if (body.startsWith("data:image") && body.includes(" | ")) {
    const parts = body.split(" | ");
    return {
      name: (parts[1] || "").trim(),
      description: (parts[3] || "").trim(),
      price: formatWaThousandPrice((parts[2] || "").trim()),
      imageUrl: "",
      url: (parts[4] || "").trim(),
      videoUrl: "",
    };
  }
  // 3) JSON puro no body (contrato antigo do renderer)
  const pj = parseInboundJson(body);
  if (pj) {
    return {
      name: String(pj.title || pj.productName || ""),
      description: String(pj.description || ""),
      price: pj.price ? String(pj.price) : "",
      imageUrl: String(pj.thumbnailUrl || pj.imageUrl || ""),
      url: String(pj.url || ""),
      videoUrl: String((pj as any).videoUrl || ""),
    };
  }
  // 4) texto puro
  return { name: body, description: "", price: "", imageUrl: "", url: "", videoUrl: "" };
}

interface OrderItem {
  name: string;
  quantity?: number;
  price?: string;
}

function parseOrderData(msg: Message): { items: OrderItem[]; total: string; text: string } {
  // 1) dataJson normalizado
  const dj = parseInboundJson(msg.dataJson);
  if (dj && (dj.productItems || dj.items || dj.totalAmount || dj.total)) {
    return {
      items: (dj.productItems || dj.items || []) as OrderItem[],
      total: String(dj.totalAmount || dj.total || ""),
      text: "",
    };
  }
  // 2) JSON puro no body
  const pj = parseInboundJson(msg.body);
  if (pj && (pj.productItems || pj.items)) {
    return {
      items: (pj.productItems || pj.items || []) as OrderItem[],
      total: String(pj.totalAmount || pj.total || ""),
      text: "",
    };
  }
  // 3) markdown/texto (Baileys/WABA/Uazapi gravam pedido como texto legivel)
  return { items: [], total: "", text: msg.body || "" };
}

function OrderContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const { items, total, text } = parseOrderData(msg);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-5 w-5 text-green-600" />
        <span className="text-sm font-medium">{t("order")}</span>
      </div>
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span>{item.name} {item.quantity ? `x${item.quantity}` : ""}</span>
              {item.price && <span className="text-muted-foreground">{item.price}</span>}
            </div>
          ))}
          {total && <div className="border-t pt-1 text-xs font-medium text-right">{t("orderTotal", { total })}</div>}
        </div>
      ) : (
        <TextContent body={text} />
      )}
    </div>
  );
}

function ProductContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const { name, description, price, imageUrl, url, videoUrl } = parseProductData(msg);
  // Imagem: dataJson.imageUrl tem prioridade; senao usa a midia da propria mensagem
  // (thumbnail persistido em storageUrl/mediaUrl pelos canais).
  const imgSrc = resolveProductImage(imageUrl) || getMediaUrl(msg);

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Package className="h-5 w-5 text-blue-500" />
        <span className="text-sm font-medium">{t("product")}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {imgSrc && <img src={imgSrc} alt={name} className="rounded-lg mb-2 object-cover max-w-[min(200px,100%)] max-h-[120px]" />}
      {name && <p className="text-sm font-medium">{name}</p>}
      {price && <p className="text-sm font-semibold text-green-600">{price}</p>}
      {description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{description}</p>}
      {videoUrl && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-blue-400 hover:bg-muted break-all"
        >
          <PlayCircle className="h-3.5 w-3.5 shrink-0" /> {videoUrl}
        </a>
      )}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline mt-1 inline-block break-all">
          {url}
        </a>
      )}
      {!name && !imgSrc && !price && <TextContent body={msg.body} />}
    </div>
  );
}

function AdsContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  let title = "";
  let bodyText = msg.body;
  let sourceUrl = "";

  try {
    const parsed = JSON.parse(msg.body);
    title = parsed?.title || t("announcement");
    bodyText = parsed?.body || parsed?.sourceTitle || msg.body;
    sourceUrl = parsed?.sourceUrl || "";
  } catch {
    bodyText = msg.body;
  }

  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Megaphone className="h-4 w-4 text-yellow-600" />
        <span className="text-xs font-medium text-yellow-600 uppercase">{t("announcement")}</span>
      </div>
      {title && <p className="text-sm font-medium">{title}</p>}
      <TextContent body={bodyText} />
      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline mt-1 inline-block">
          {t("viewOriginalAd")}
        </a>
      )}
    </div>
  );
}

function AlbumContent({ msg, allMessages }: { msg: Message; allMessages?: Message[] }) {
  const t = useTranslations("messageBubble");
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

 // Filtra áudio e transcrição (igual ao front legado), ordena por albumIndex depois createdAt
  const albumMsgs = (allMessages || [])
    .filter((m) =>
      m.albumId === msg.albumId &&
      m.mediaType !== "audio" &&
      m.mediaType !== "audioMessage" &&
      m.mediaType !== "transcription"
    )
    .sort((a, b) => {
      const ia = (a as Message & { albumIndex?: number }).albumIndex ?? 999;
      const ib = (b as Message & { albumIndex?: number }).albumIndex ?? 999;
      if (ia !== ib) return ia - ib;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const total = albumMsgs.length;
  const gridMsgs = albumMsgs.slice(0, 4); // máximo 4 no grid
  const extra = total - 4; // quantidade de itens além do grid

  // Grid: 1 coluna para 1 item, 2 colunas para 2+
  const gridCols = gridMsgs.length === 1 ? "grid-cols-1" : "grid-cols-2";

  // Fechar com teclado
  React.useEffect(() => {
    if (lightboxIdx < 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIdx(-1);
      if (e.key === "ArrowLeft") { setLightboxIdx((i) => Math.max(0, i - 1)); setRotation(0); setScale(1); setOffset({ x: 0, y: 0 }); }
      if (e.key === "ArrowRight") { setLightboxIdx((i) => Math.min(total - 1, i + 1)); setRotation(0); setScale(1); setOffset({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIdx, total]);

  const currentItem = albumMsgs[lightboxIdx];
  const currentUrl = getMediaUrl(currentItem);
  const isCurrentVideo = currentItem?.mediaType?.includes("video");

  return (
    <div>
      {/* Grid do álbum */}
      <div className={cn("grid gap-1 rounded-xl overflow-hidden shadow-md max-w-[340px]", gridCols)}>
        {gridMsgs.map((am, i) => {
          const url = getMediaUrl(am);
          const isVideo = am.mediaType?.includes("video");
          const showOverlay = i === 3 && extra > 0;
          return (
            <button
              key={am.id}
              type="button"
              onClick={() => setLightboxIdx(i)}
              className={cn(
                "relative overflow-hidden bg-muted",
                gridMsgs.length === 1 ? "aspect-video" : "aspect-square"
              )}
            >
              {isVideo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <PlayCircle className="h-10 w-10 text-white drop-shadow-lg opacity-90" />
                  </div>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="w-full h-full object-cover transition-opacity hover:opacity-95" />
              )}
              {/* Overlay "+N mais" no 4º item */}
              {showOverlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-bold text-2xl">
                  +{extra}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {(msg.edition ?? msg.body) && <TextContent body={msg.edition ?? msg.body} isEdited={msg.isEdited} originalBody={msg.edition ? msg.body : undefined} />}

      {/* Lightbox */}
      <Dialog open={lightboxIdx >= 0} onOpenChange={(o) => { if (!o) { setLightboxIdx(-1); setRotation(0); setScale(1); setOffset({ x: 0, y: 0 }); } }}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{currentItem?.fileName || msg.body || "imagem"}</DialogTitle>
          {/* Header — solid background */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 pr-12">
            <span className="text-sm font-medium flex items-center gap-2 min-w-0 truncate">
              {currentItem?.fileName || msg.body || t("image")}
              {total > 1 && <span className="text-xs text-muted-foreground ml-1 shrink-0">{lightboxIdx + 1} / {total}</span>}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {!isCurrentVideo && (
                <>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(5, s + 0.5)); }} className="rounded-full p-1.5 hover:bg-muted transition-colors" title={t("zoomIn")}>
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setScale((s) => { const next = Math.max(1, s - 0.5); if (next === 1) setOffset({ x: 0, y: 0 }); return next; }); }} className="rounded-full p-1.5 hover:bg-muted transition-colors" title={t("zoomOut")}>
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setRotation((r) => (r - 90 + 360) % 360); }} className="rounded-full p-1.5 hover:bg-muted transition-colors" title={t("rotateLeft")}>
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setRotation((r) => (r + 90) % 360); }} className="rounded-full p-1.5 hover:bg-muted transition-colors" title={t("rotateRight")}>
                    <RotateCw className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); if (!currentUrl) return; const win = window.open("", "_blank"); if (!win) return; win.document.write(`<html><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000"><img src="${currentUrl}" style="max-width:100%;max-height:100vh;transform:rotate(${rotation}deg)" onload="window.print();window.close()"/></body></html>`); win.document.close(); }} className="rounded-full p-1.5 hover:bg-muted transition-colors" title={t("print")}>
                    <Printer className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-full p-1.5 hover:bg-muted transition-colors"
                    title={t("searchOnGoogle")}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!currentUrl) return;
                      try {
                        const resp = await fetch(currentUrl);
                        const blob = await resp.blob();
                        const pngBlob = blob.type === "image/png" ? blob : await createImageBitmap(blob).then((bmp) => {
                          const canvas = document.createElement("canvas");
                          canvas.width = bmp.width; canvas.height = bmp.height;
                          canvas.getContext("2d")!.drawImage(bmp, 0, 0);
                          return new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
                        });
                        await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
                        const toastId = toast.loading(t("searchOnGoogleTip"));
                        setTimeout(() => {
                          toast.dismiss(toastId);
                          window.open("https://lens.google.com/", "_blank", "noopener,noreferrer");
                        }, 2500);
                      } catch {
                        window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(currentUrl)}`, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (currentItem?.mediaUrl) downloadFile(currentUrl, currentItem.fileName || "arquivo"); }}
                className="rounded-full p-1.5 hover:bg-muted transition-colors"
                title={t("download")}
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (currentItem?.mediaUrl) saveUrlToGallery(currentUrl, currentItem.fileName || "arquivo", t("savedToGallery"), t("errorSaveToGallery")); }}
                className="rounded-full p-1.5 hover:bg-muted transition-colors"
                title={t("saveToGallery")}
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content + navigation */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black/90" onClick={() => { setLightboxIdx(-1); setRotation(0); setScale(1); setOffset({ x: 0, y: 0 }); }}>
            <div className="relative flex items-center justify-center w-full h-full px-16" onClick={(e) => e.stopPropagation()}>
              {isCurrentVideo ? (
                <video
                  src={getMediaUrl(currentItem)}
                  controls
                  className="max-h-full max-w-full rounded-lg shadow-2xl"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUrl || undefined}
                  alt=""
                  className="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-200"
                  style={{ transform: `rotate(${rotation}deg) scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)` }}
                  onClick={() => { if (scale <= 1) { setLightboxIdx(-1); setRotation(0); } }}
                />
              )}
            </div>

            {/* Navigation arrows */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => Math.max(0, i - 1)); setRotation(0); setScale(1); setOffset({ x: 0, y: 0 }); }}
              disabled={lightboxIdx === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-3 text-white bg-black/40 hover:bg-black/60 disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => Math.min(total - 1, i + 1)); setRotation(0); setScale(1); setOffset({ x: 0, y: 0 }); }}
              disabled={lightboxIdx === total - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-3 text-white bg-black/40 hover:bg-black/60 disabled:opacity-30 transition-all"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function parseCallNotes(body: string, tFn: (key: string) => string): { title: string; subtitle: string } {
  try {
    const p = JSON.parse(body);
    return {
      title: p.title || tFn("voiceCall"),
      subtitle: p.subtitle || tFn("callDefaultSubtitle"),
    };
  } catch {
    // formato legado "título|||subtítulo"
    if (body.includes("|||")) {
      const [title, s] = body.split("|||");
      return { title: title.trim(), subtitle: s?.trim() || "" };
    }
    return { title: tFn("voiceCall"), subtitle: body };
  }
}

function TranscriptionContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  return (
    <div className="space-y-1">
      <div className={cn(
        "flex items-center gap-1 text-[10px] font-medium uppercase",
        msg.fromMe ? "text-primary-foreground/80" : "text-sky-600 dark:text-sky-400"
      )}>
        <AudioLines className="h-3 w-3 shrink-0" />
        <span>{t("transcription")}</span>
      </div>
      <p className={cn(
        "text-sm whitespace-pre-wrap italic",
        msg.fromMe ? "text-primary-foreground" : "text-foreground"
      )}>
        {msg.body}
      </p>
    </div>
  );
}

// Corpo da nota com URLs/e-mails clicaveis. Nao passa por formatWhatsApp de
// proposito: notas costumam trazer PIX copia-e-cola e linha digitavel, e o
// markdown comeria os "*"/"_" do proprio codigo. Clique em link abre o mesmo
// LinkModal das mensagens (preview + confirmacao antes de sair do app).
function NoteText({ text, className }: { text: string; className?: string }) {
  const [modalUrl, setModalUrl] = useState<string | null>(null);
  const parts = linkifyParts(text);

  return (
    <>
      <p className={className}>
        {parts.map((part, i) => {
          if (part.type === "text") return <React.Fragment key={i}>{part.value}</React.Fragment>;
          const isMail = part.href.startsWith("mailto:");
          return (
            <a
              key={i}
              href={part.href}
              target={isMail ? undefined : "_blank"}
              rel="noopener noreferrer"
              onClick={isMail ? undefined : (e) => { e.preventDefault(); setModalUrl(part.href); }}
              className="underline text-blue-600 dark:text-blue-400 hover:opacity-80"
            >
              {part.value}
            </a>
          );
        })}
      </p>
      {modalUrl && <LinkModal url={modalUrl} onClose={() => setModalUrl(null)} />}
    </>
  );
}

function NotesContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const [noteLightbox, setNoteLightbox] = useState(false);
  const hasMedia = msg.mediaUrl && msg.mediaType && !["notes", "callNotes"].includes(msg.mediaType);
  const isCallNotes = msg.mediaType === "callNotes";
  const { title, subtitle } = isCallNotes ? parseCallNotes(msg.body, t) : { title: "", subtitle: "" };

  // Notes with attached files: mediaType stays "notes" but mediaUrl holds the file path — detect by extension.
  // Prefer storageUrl (S3/R2) quando existir — evita 404 com keepLocalCopy=false.
  const noteAttachedUrl = msg.mediaType === "notes" && msg.mediaUrl ? (msg.storageUrl || msg.mediaUrl) : null;
  const noteIsImage = noteAttachedUrl ? /\.(jpe?g|png|gif|webp|bmp|svg|ico)(\?|$)/i.test(noteAttachedUrl) : false;
  const noteIsVideo = noteAttachedUrl ? /\.(mp4|webm|ogg|mov)(\?|$)/i.test(noteAttachedUrl) : false;
  const noteIsAudio = noteAttachedUrl ? /\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(noteAttachedUrl) : false;
  const noteIsFile = noteAttachedUrl ? !noteIsImage && !noteIsVideo && !noteIsAudio : false;
  const noteFileName = noteAttachedUrl ? (noteAttachedUrl.split("/").pop()?.split("?")[0] ?? noteAttachedUrl) : null;

  const isDeleted = !!msg.isDeleted;
  const authorName = msg.user?.name?.trim();
  const timeLabel = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "";
  const dateLabel = msg.createdAt
    ? new Date(msg.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  return (
    <div className={cn(
      "rounded-lg border p-3",
      isDeleted
        ? "border-muted/40 bg-muted/10 opacity-60"
        : "border-yellow-500/30 bg-yellow-500/5"
    )}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1 min-w-0">
          <FileText className={cn("h-3 w-3 shrink-0", isDeleted ? "text-muted-foreground" : "text-yellow-600")} />
          <span className={cn("text-[10px] font-medium uppercase", isDeleted ? "text-muted-foreground" : "text-yellow-600")}>
            {isCallNotes ? t("callNote") : t("note")}
            {isDeleted && <span className="ml-1 normal-case">({t("deleted")})</span>}
          </span>
        </div>
        {timeLabel && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap" title={dateLabel ? `${dateLabel} ${timeLabel}` : timeLabel}>
            {timeLabel}
          </span>
        )}
      </div>
      {authorName && (
        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground truncate" title={authorName}>
          {authorName}
        </div>
      )}
      {hasMedia && msg.mediaUrl && (
        <div className="mb-2">
          {msg.mediaType?.includes("image") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getMediaUrl(msg)} alt="" className="rounded max-w-[min(200px,100%)] max-h-[120px] object-cover" />
          )}
          {msg.mediaType?.includes("video") && (
            <video controls src={getMediaUrl(msg)} className="max-w-[min(200px,100%)] rounded" />
          )}
          {msg.mediaType?.includes("audio") && (
            <audio controls src={getAudioUrl(msg)} className="max-w-[min(200px,100%)]" />
          )}
        </div>
      )}
      {noteAttachedUrl && (
        <div className="mb-2">
          {noteIsImage && (
            <>
              <button onClick={() => setNoteLightbox(true)} className="block relative group/img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getMediaUrl(noteAttachedUrl)} alt="" className="rounded max-w-[min(200px,100%)] max-h-[120px] object-cover" />
                <div className="absolute inset-0 rounded bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-md" />
                </div>
              </button>
              <Dialog open={noteLightbox} onOpenChange={setNoteLightbox}>
                <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
                  <DialogTitle className="sr-only">{noteFileName || "imagem"}</DialogTitle>
                  <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 pr-12">
                    <span className="text-sm font-medium truncate">{noteFileName || t("image")}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-full p-1.5 hover:bg-muted transition-colors"
                        onClick={() => downloadFile(getMediaUrl(noteAttachedUrl), noteFileName || "imagem.jpg")}
                        title={t("download")}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-1.5 hover:bg-muted transition-colors"
                        onClick={() => saveUrlToGallery(getMediaUrl(noteAttachedUrl), noteFileName || "imagem.jpg", t("savedToGallery"), t("errorSaveToGallery"))}
                        title={t("saveToGallery")}
                      >
                        <FolderPlus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div
                    className="flex-1 flex items-center justify-center overflow-hidden bg-black/90"
                    onClick={() => setNoteLightbox(false)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getMediaUrl(noteAttachedUrl)}
                      alt=""
                      className="object-contain max-h-full max-w-full select-none"
                      onClick={(e) => e.stopPropagation()}
                      draggable={false}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          {noteIsVideo && (
            <video controls src={getMediaUrl(noteAttachedUrl)} className="max-w-[min(200px,100%)] rounded" />
          )}
          {noteIsAudio && (
            <audio controls src={getAudioUrl(noteAttachedUrl)} className="max-w-[min(200px,100%)]" />
          )}
          {noteIsFile && (
            <a href={getMediaUrl(noteAttachedUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary underline break-all">
              <FileText className="h-3 w-3 shrink-0" />{noteFileName}
            </a>
          )}
        </div>
      )}
      {isCallNotes ? (
        <div>
          <p className="text-sm font-medium">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      ) : (
        <NoteText
          text={msg.body}
          className={cn(
            "text-sm whitespace-pre-wrap [overflow-wrap:anywhere]",
            isDeleted && "line-through text-muted-foreground"
          )}
        />
      )}
    </div>
  );
}

function TransferContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 p-2 text-xs text-blue-700 dark:border-blue-300/40 dark:bg-blue-300/15 dark:text-blue-100">
      <CornerDownRight className="h-4 w-4" />
      <span>{msg.body || t("ticketTransferred")}</span>
    </div>
  );
}

// Divisoria de sistema criada no instante em que a mensagem agendada realmente
// sai. O backend nao tem i18n: o body traz SO o trecho da mensagem (ate 140
// chars) — o rotulo e o horario sao montados aqui, a partir do prefixo do
// messageId ("sched_notice") e do createdAt da propria linha.
function ScheduleNoticeContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const { locale } = useLocale();
  const timeLabel = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : "";
  const excerpt = (msg.body || "").trim();

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-300/15 dark:text-emerald-100">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 shrink-0" />
        <span className="font-medium">{t("scheduleNoticeSent")}</span>
        {timeLabel && (
          <span className="ml-auto whitespace-nowrap opacity-70">{timeLabel}</span>
        )}
      </div>
      {excerpt && (
        <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] opacity-90">{excerpt}</p>
      )}
    </div>
  );
}

// Renderiza o HTML do e-mail num iframe e intercepta cliques em links do corpo
// para exibir a mesma confirmação "Você está saindo do app" usada nos links
// externos do chatlist, em vez de navegar/abrir o link direto. Usa srcDoc (não
// blob URL) porque o Safari/WebKit (iOS) não carrega blob: em iframe com
// atributo sandbox — o modal ficava em branco no iPhone. Com allow-same-origin
// o documento srcdoc herda a origem do parent, então o contentDocument segue
// acessível para capturar os cliques antes da navegação. `src` é fallback para
// quando o HTML não pôde ser baixado via fetch (carrega a URL direto).
function EmailIframe({ srcDoc, src, sandbox }: { srcDoc?: string | null; src?: string | null; sandbox: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);

  const handleLoad = useCallback(() => {
    let doc: Document | null = null;
    try { doc = iframeRef.current?.contentDocument ?? null; } catch { doc = null; }
    if (!doc) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      const rawHref = a.getAttribute("href") || "";
      // Âncora interna (#secao): rola dentro do próprio email. Sem isso, como o
      // srcdoc herda a base URL do app, o clique navegaria o iframe para a URL
      // do dashboard (e cairia no confirm de link externo).
      if (rawHref.startsWith("#")) {
        e.preventDefault();
        e.stopPropagation();
        const id = rawHref.slice(1);
        const target = doc.getElementById(id) || doc.querySelector(`a[name="${CSS.escape(id)}"]`);
        target?.scrollIntoView();
        return;
      }
      if (/^https?:\/\//i.test(rawHref)) {
        e.preventDefault();
        e.stopPropagation();
        setExternalUrl(a.href);
      } else if (/^https?:\/\//i.test(a.href)) {
        // href relativo ("/unsubscribe"): resolveria contra a origem do app via
        // base herdada — bloqueia (link morto, como era no blob URL).
        e.preventDefault();
        e.stopPropagation();
      }
    };
    doc.addEventListener("click", onClick, true);
  }, []);

  return (
    <>
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc ?? undefined}
        src={srcDoc != null ? undefined : src ?? undefined}
        onLoad={handleLoad}
        className="flex-1 w-full rounded-b-lg bg-white"
        sandbox={sandbox}
        title="Email"
      />
      {externalUrl && (
        <ExternalLinkConfirmDialog
          url={externalUrl}
          onCancel={() => setExternalUrl(null)}
          onConfirm={() => {
            const target = externalUrl;
            setExternalUrl(null);
            window.open(target, "_blank", "noopener,noreferrer");
          }}
        />
      )}
    </>
  );
}

function WebmailContent({ msg, allMessages }: { msg: Message; allMessages?: Message[] }) {
  const t = useTranslations("messageBubble");
  const [open, setOpen] = useState(false);
  // html → renderiza via srcDoc; url → fallback quando o fetch falhou (iframe carrega direto)
  const [content, setContent] = useState<{ html?: string; url?: string } | null>(null);
  const url = getMediaUrl(msg);

  // Backend cria uma única mensagem por e-mail recebido com body = subject (EmailReceiveServiceZPRO).
  const subject = msg.body?.trim() || null;

  const senderName = msg.contact?.name;
  const senderEmail = msg.contact?.number;

  const handleOpen = useCallback(async () => {
    setOpen(true);
    if (content || !url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) { setContent({ url }); return; }
      const buffer = await res.arrayBuffer();
      // Force UTF-8 decode regardless of server Content-Type charset — srcdoc
      // recebe a string já decodificada, então meta charset do HTML vira inerte
      let html = new TextDecoder("utf-8").decode(buffer);
      // Plain-text email: wrap in HTML and linkify URLs
      if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) {
        const escaped = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const linked = escaped.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;word-break:break-all;">$1</a>');
        html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:monospace;font-size:13px;white-space:pre-wrap;padding:16px;line-height:1.6}</style></head><body>${linked}</body></html>`;
      }
      setContent({ html });
    } catch {
      setContent({ url });
    }
  }, [url, content]);

  return (
    <div className="rounded-lg border border-sky-400/30 bg-sky-500/5 p-2.5 w-[340px] max-w-full">
      <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 mb-1.5">
        <Mail className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{t("emailReceived")}</span>
      </div>
      <div className="space-y-1.5 text-xs">
        {(senderName || senderEmail) && (
          <div className="flex flex-wrap items-start gap-1">
            <span className="text-muted-foreground shrink-0 pt-0.5">{t("emailReceivedFrom")}:</span>
            <span className="inline-flex items-baseline gap-1 rounded-md bg-background/60 border border-border/50 px-1.5 py-0.5 max-w-full">
              {senderName && <span className="font-medium truncate">{senderName}</span>}
              {senderEmail && <span className="text-muted-foreground break-all text-[11px]">{senderEmail}</span>}
            </span>
          </div>
        )}
        {subject && (
          <div className="flex gap-1.5 pt-1.5 border-t border-sky-400/30">
            <span className="text-muted-foreground shrink-0">{t("emailSentSubject")}:</span>
            <span className="break-words min-w-0 flex-1">{subject}</span>
          </div>
        )}
      </div>
      {url && (
        <>
          <Button variant="outline" size="sm" className="mt-2 h-7 text-xs w-full" onClick={handleOpen}>
            <Mail className="mr-1 h-3 w-3" />
            {t("viewOriginalEmail")}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 pr-12">
                <span className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4" /> {t("emailOriginal")}</span>
                <button type="button" onClick={() => downloadFile(url, "email.html")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <Download className="h-3 w-3" /> {t("download2")}
                </button>
              </div>
              {/* Sem allow-scripts: JS embutido em email hostil não executa (com
                  allow-same-origin + CSP unsafe-inline ele alcançaria o parent).
                  A interceptação de cliques roda no parent e não depende disso. */}
              <EmailIframe srcDoc={content?.html} src={content?.url} sandbox="allow-same-origin" />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

// ── email enviado: body gerado pelo backend `E-mail enviado para <to> com assunto: <subject>` ─
function parseEmailRecipients(to: string): { name?: string; email: string }[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = "";
  for (const c of to) {
    if (c === '"') inQuote = !inQuote;
    else if (c === '<') depth++;
    else if (c === '>') depth--;
    else if (c === ',' && !inQuote && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.map((p) => {
    const m = p.match(/^\s*"?(.*?)"?\s*<([^>]+)>\s*$/);
    if (m && m[2]) return { name: m[1].trim() || undefined, email: m[2].trim() };
    return { email: p.trim() };
  });
}

function parseEmailSentBody(body: string): { recipients: { name?: string; email: string }[]; subject?: string } | null {
  const m = body.match(/^E-mail enviado para ([^\n]+?)(?: com assunto: ([\s\S]*))?$/);
  if (!m) return null;
  const recipients = parseEmailRecipients(m[1]);
  if (!recipients.length) return null;
  return { recipients, subject: m[2]?.trim() || undefined };
}

function EmailSentContent({ body, fromMe, emailBody, date }: { body: string; fromMe?: boolean; emailBody?: string | null; date?: string }) {
  const t = useTranslations("messageBubble");
  const [open, setOpen] = useState(false);
  const [emailHtml, setEmailHtml] = useState<string | null>(null);
  const sentBody = emailBody?.trim() || "";
  const parsed = parseEmailSentBody(body);
  const recipients = parsed?.recipients ?? [];
  const subject = parsed?.subject ?? "";

  // Abre o conteudo num popup espelhando o e-mail recebido: cabecalho (Para/Assunto/Data)
  // + corpo, no MESMO template HTML (.email-header/.email-body) — nao infla o bubble.
  const handleOpen = useCallback(() => {
    setOpen(true);
    if (emailHtml || !sentBody) return;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const toStr = recipients.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(", ");
    const dateStr = date ? new Date(date).toLocaleString("pt-BR") : "";
    const linkedBody = esc(sentBody).replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;word-break:break-all;">$1</a>');
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>${esc(subject || "E-mail")}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 16px; max-width: 900px; line-height: 1.5; }
    .email-header { background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
    .email-header p { margin: 4px 0; }
    .email-body { border: 1px solid #eee; border-radius: 8px; padding: 16px; }
  </style>
</head>
<body>
  <div class="email-header">
    ${toStr ? `<p><strong>Para:</strong> ${esc(toStr)}</p>` : ""}
    ${subject ? `<p><strong>Assunto:</strong> ${esc(subject)}</p>` : ""}
    ${dateStr ? `<p><strong>Data:</strong> ${esc(dateStr)}</p>` : ""}
  </div>
  <div class="email-body">
    <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${linkedBody}</pre>
  </div>
</body>
</html>`;
    setEmailHtml(html);
  }, [sentBody, emailHtml, recipients, subject, date]);

  if (!parsed) return <TextContent body={body} />;
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 w-[340px] max-w-full",
        fromMe
          ? "border-white/25 bg-white/10"
          : "border-sky-400/30 bg-sky-500/5",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 mb-1.5",
          fromMe ? "text-white" : "text-sky-600 dark:text-sky-400",
        )}
      >
        <Mail className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{t("emailSent")}</span>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex flex-wrap items-start gap-1">
          <span className={cn("shrink-0 pt-0.5", fromMe ? "text-white/75" : "text-muted-foreground")}>
            {t("emailSentTo")}:
          </span>
          <div className="flex flex-wrap gap-1 min-w-0 flex-1">
            {recipients.map((r, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 max-w-full border",
                  fromMe
                    ? "bg-white/15 border-white/20 text-white"
                    : "bg-background/60 border-border/50",
                )}
              >
                {r.name && <span className="font-medium truncate">{r.name}</span>}
                <span
                  className={cn(
                    "break-all text-[11px]",
                    fromMe ? "text-white/85" : "text-muted-foreground",
                  )}
                >
                  {r.email}
                </span>
              </span>
            ))}
          </div>
        </div>
        {subject && (
          <div
            className={cn(
              "flex gap-1.5 pt-1.5 border-t",
              fromMe ? "border-white/20 text-white" : "border-border/40",
            )}
          >
            <span className={cn("shrink-0", fromMe ? "text-white/75" : "text-muted-foreground")}>
              {t("emailSentSubject")}:
            </span>
            <span className="break-words min-w-0 flex-1">{subject}</span>
          </div>
        )}
      </div>
      {sentBody && (
        <>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "mt-2 h-7 text-xs w-full",
              fromMe ? "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" : "",
            )}
            onClick={handleOpen}
          >
            <Mail className="mr-1 h-3 w-3" />
            {t("viewSentEmail")}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 pr-12">
                <span className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4" /> {t("emailSent")}</span>
                {emailHtml && (
                  <button
                    type="button"
                    onClick={() => {
                      // Blob criado só na hora do download (o iframe usa srcDoc);
                      // downloadFile mantém os toasts de progresso/sucesso.
                      const dl = URL.createObjectURL(new Blob([emailHtml], { type: "text/html;charset=utf-8" }));
                      downloadFile(dl, "email.html");
                      setTimeout(() => URL.revokeObjectURL(dl), 10000);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" /> {t("download2")}
                  </button>
                )}
              </div>
              <EmailIframe srcDoc={emailHtml} sandbox="allow-same-origin allow-popups" />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

// ── button_reply: resposta a um botão interativo ──────────────────────────────
function ButtonReplyContent({ msg }: { msg: Message }) {
  return (
    <p
      className="break-words text-sm leading-normal"
      dangerouslySetInnerHTML={{ __html: sanitize(`➡️ ${formatWhatsApp(msg.body)}`) }}
    />
  );
}

// ── call_permission_request / call_permission_reply ──────────────────────────
function CallPermissionContent({ msg }: { msg: Message }) {
  const body = msg.body || "";

  // Mensagem enviada por nós (solicitação de permissão)
  if (body === "[Permissão de chamada solicitada]") {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex-shrink-0">
          <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Permissão de chamada</span>
          <span className="text-xs text-muted-foreground">Solicitação enviada</span>
        </div>
      </div>
    );
  }

  // Resposta do usuário — accept ou decline
  const acceptMatch = body.match(/\[Permissão de chamada:\s*(accept|decline)\]/i);
  if (acceptMatch) {
    const accepted = acceptMatch[1].toLowerCase() === "accept";
    return (
      <div className="flex items-center gap-2 py-1">
        <span className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0",
          accepted
            ? "bg-green-100 dark:bg-green-900/40"
            : "bg-red-100 dark:bg-red-900/40"
        )}>
          {accepted
            ? <PhoneCall className="w-4 h-4 text-green-600 dark:text-green-400" />
            : <PhoneOff className="w-4 h-4 text-red-600 dark:text-red-400" />
          }
        </span>
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "text-xs font-medium",
            accepted ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
          )}>
            Permissão de chamada
          </span>
          <span className="text-xs text-muted-foreground">
            {accepted ? "Autorizada pelo usuário" : "Recusada pelo usuário"}
          </span>
        </div>
      </div>
    );
  }

  // Fallback para variações não mapeadas
  return <p className="text-sm break-words">{body}</p>;
}

// ── nfm_reply / interactive_nfm_reply: resposta a flow/formulário ─────────────
// Parse compartilhado com o preview de `lastMessage` (lib/template-preview.ts).
function NfmReplyContent({ msg }: { msg: Message }) {
  const entries = parseNfmEntries(msg.body);
  if (!entries?.length) return <TextContent body={msg.body} showLinkPreview />;
  return (
    <div className="space-y-1 rounded-lg border bg-muted/20 p-3">
      {entries.map(({ label, answer }, i) => (
        <div key={i} className="text-xs">
          <span className="font-semibold">{label}: </span>
          <span className="text-muted-foreground">{answer}</span>
        </div>
      ))}
    </div>
  );
}

// ── templateBaileys: template Baileys (*header*, _footer_, [QuickReply], etc.) ─
function TemplateBaileysContent({ msg }: { msg: Message }) {
  let headerHtml = "";
  let bodyLines: string[] = [];
  let footerHtml = "";
  let buttonsHtml = "";

  const lines = msg.body.split("\n");
  lines.forEach((line) => {
    line = line.trim();
    if (!line) return;
    if (line.startsWith("*") && line.endsWith("*") && line.length > 2) {
      headerHtml = `<span class="font-bold">${line.replace(/\*/g, "")}</span>`;
      return;
    }
    if (line.startsWith("_") && line.endsWith("_") && line.length > 2) {
      footerHtml = `<span class="text-[11px] text-muted-foreground">${line.replace(/_/g, "")}</span>`;
      return;
    }
    if (line.includes("[Botões]")) return;
    if (line.includes("[QuickReply]")) {
      const m = line.match(/\[QuickReply\] (.+?) \(id: (.+?)\)/);
      const label = m ? m[1].trim() : line.replace("[QuickReply]", "").trim();
      buttonsHtml += `<div class="rounded-md border bg-muted/20 px-3 py-1.5 text-xs text-center">${label}</div>`;
      return;
    }
    if (line.includes("[Link]")) {
      const m = line.match(/\[Link\] (.+?) -> (.+)/);
      if (m) buttonsHtml += `<a href="${m[2].trim()}" target="_blank" class="block rounded-md border bg-muted/20 px-3 py-1.5 text-xs text-center text-blue-400 underline">${m[1].trim()}</a>`;
      return;
    }
    if (line.includes("[Ligar]")) {
      const m = line.match(/\[Ligar\] (.+?) -> (.+)/);
      if (m) buttonsHtml += `<a href="tel:${m[2].trim()}" class="block rounded-md border bg-muted/20 px-3 py-1.5 text-xs text-center">📞 ${m[1].trim()}</a>`;
      return;
    }
    bodyLines.push(line);
  });

  return (
    <div className="space-y-1">
      {headerHtml && <p dangerouslySetInnerHTML={{ __html: sanitize(headerHtml) }} />}
      {bodyLines.length > 0 && (
        <p
          className="break-words text-sm leading-normal"
          dangerouslySetInnerHTML={{ __html: sanitize(bodyLines.map(formatWhatsApp).join("<br>")) }}
        />
      )}
      {footerHtml && <p dangerouslySetInnerHTML={{ __html: sanitize(footerHtml) }} />}
      {buttonsHtml && (
        <div
          className="flex flex-col gap-1 mt-2 border-t pt-2"
          dangerouslySetInnerHTML={{ __html: sanitize(buttonsHtml) }}
        />
      )}
    </div>
  );
}

// ── FB1 — GenericTemplateContent (Instagram/Messenger generic template) ──────
function GenericTemplateContent({ msg, onQuickSend }: { msg: Message; onQuickSend?: (text: string) => void }) {
  type GenericCard = {
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    image_url?: string;
    buttons?: { type?: string; title?: string; payload?: string; url?: string }[];
  };

  const clickable = !!onQuickSend;

  let cards: GenericCard[] = [];
  let bodyText = "";

  // Estrutura completa (imagem/subtitulo/botoes) vem em dataJson — igual ao WABA.
  const dj = (msg as any).dataJson;
  if (dj) {
    try {
      const parsed = typeof dj === "string" ? JSON.parse(dj) : dj;
      const elements = parsed?.elements || parsed?.template?.elements || parsed?.attachment?.payload?.elements || (Array.isArray(parsed) ? parsed : []);
      if (Array.isArray(elements) && elements.length) cards = elements;
    } catch { /* ignora dataJson invalido, cai no body abaixo */ }
  }

  // Fallback: body "GenericTemplate: Title1, Title2" ou JSON cru
  const rawBody = msg.body || "";
  if (!cards.length) {
    if (rawBody.startsWith("GenericTemplate:")) {
      const rest = rawBody.substring("GenericTemplate:".length).trim();
      let parsedOk = false;
      if (rest.startsWith("[") || rest.startsWith("{")) {
        try {
          const parsed = JSON.parse(rest);
          const elements = Array.isArray(parsed) ? parsed : (parsed?.elements || parsed?.template?.elements || parsed?.attachment?.payload?.elements || []);
          if (Array.isArray(elements) && elements.length) { cards = elements; parsedOk = true; }
        } catch { /* trata como lista de titulos */ }
      }
      if (!parsedOk) {
        bodyText = rest;
        const titles = bodyText.split(",").map((t) => t.trim()).filter(Boolean);
        cards = titles.map((title) => ({ title }));
      }
    } else {
      try {
        const parsed = JSON.parse(rawBody);
        const elements = parsed?.elements || parsed?.template?.elements || parsed?.attachment?.payload?.elements || [];
        cards = elements;
        if (!cards.length && parsed?.title) cards = [parsed];
      } catch {
        bodyText = rawBody;
      }
    }
  }

  if (!cards.length && bodyText) {
    return <TextContent body={bodyText} />;
  }

  return (
    <div className="space-y-2">
      {cards.map((card, i) => (
        <div key={i} className="rounded-lg border bg-muted/30 overflow-hidden max-w-[260px]">
          {(card.imageUrl || card.image_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageUrl || card.image_url}
              alt={card.title || ""}
              className="w-full h-[120px] object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="p-2 space-y-0.5">
            {card.title && <p className="text-sm font-semibold leading-snug">{card.title}</p>}
            {card.subtitle && <p className="text-xs text-muted-foreground line-clamp-2">{card.subtitle}</p>}
          </div>
          {card.buttons && card.buttons.length > 0 && (
            <div className="border-t divide-y">
              {card.buttons.map((btn, bi) => (
                <div
                  key={bi}
                  role={clickable && !btn.url ? "button" : undefined}
                  onClick={clickable && !btn.url && (btn.title || btn.payload) ? () => onQuickSend!(btn.title || btn.payload || "") : undefined}
                  className={cn(
                    "px-3 py-1.5 text-xs text-center text-primary",
                    clickable && !btn.url && "cursor-pointer hover:bg-primary/10 transition-colors",
                    (!clickable || btn.url) && "cursor-default"
                  )}
                >
                  {btn.url ? (
                    <a href={btn.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      {btn.title}
                    </a>
                  ) : (
                    <span>{btn.title || btn.payload}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── FB2 — QuickReplyContent (Instagram/Messenger quick reply) ─────────────────
function QuickReplyContent({ msg, onQuickSend }: { msg: Message; onQuickSend?: (text: string) => void }) {
  type QROption = { content_type?: string; title?: string; payload?: string };

  const rawBody = msg.body || "";
  let messageText = "";
  let options: QROption[] = [];

  if (rawBody.startsWith("QR:")) {
    messageText = rawBody.substring("QR:".length).trim();
    const pipeIdx = messageText.indexOf(" | ");
    if (pipeIdx !== -1) {
      const optsPart = messageText.substring(pipeIdx + 3);
      messageText = messageText.substring(0, pipeIdx).trim();
      options = optsPart.split(", ").map((o) => ({ title: o.trim() }));
    }
  } else {
    try {
      const parsed = JSON.parse(rawBody);
      messageText = parsed?.text || parsed?.message || "";
      options = parsed?.quick_replies || parsed?.options || [];
    } catch {
      messageText = rawBody;
    }
  }

  const clickable = !!onQuickSend;
  const divider = msg.fromMe ? "border-primary-foreground/20" : "border-border/50";

  return (
    <div className="space-y-1">
      {messageText && <TextContent body={messageText} />}
      {options.length > 0 && (
        <>
          <div className={cn("border-t mt-2", divider)} />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {options.map((opt, i) => (
              <div
                key={i}
                role={clickable ? "button" : undefined}
                onClick={clickable && (opt.title || opt.payload) ? () => onQuickSend!(opt.title || opt.payload || "") : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium select-none",
                  msg.fromMe
                    ? "border-primary-foreground/30 text-primary-foreground/80"
                    : "border-primary/40 bg-primary/5 text-primary",
                  clickable && "cursor-pointer hover:bg-primary/15 active:opacity-60 transition-colors",
                  !clickable && "cursor-default"
                )}
              >
                {opt.title || opt.payload}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── FB3 — ButtonTemplateContent (Messenger button template) ──────────────────
function ButtonTemplateContent({ msg, onQuickSend }: { msg: Message; onQuickSend?: (text: string) => void }) {
  type MsgBtn = { type?: string; title?: string; url?: string; payload?: string };

  const rawBody = msg.body || "";
  let messageText = "";
  let buttons: MsgBtn[] = [];

  if (rawBody.startsWith("ButtonTemplate:")) {
    messageText = rawBody.substring("ButtonTemplate:".length).trim();
    const pipeIdx = messageText.indexOf(" | ");
    if (pipeIdx !== -1) {
      const btnPart = messageText.substring(pipeIdx + 3);
      messageText = messageText.substring(0, pipeIdx).trim();
      // Parse: "title" (postback) ou "title>>>>url" (web_url)
      buttons = btnPart.split(" | ").map((b) => {
        const raw = b.trim();
        const urlIdx = raw.indexOf(">>>>");
        if (urlIdx !== -1) {
          return { type: "web_url", title: raw.substring(0, urlIdx).trim(), url: raw.substring(urlIdx + 4).trim() };
        }
        return { title: raw };
      });
    }
  } else {
    try {
      const parsed = JSON.parse(rawBody);
      messageText = parsed?.text || parsed?.template?.text || "";
      buttons = parsed?.buttons || parsed?.template?.buttons || [];
    } catch {
      messageText = rawBody;
    }
  }

  const clickable = !!onQuickSend;
  const divider = msg.fromMe ? "border-primary-foreground/20" : "border-border/50";

  return (
    <div className="w-full min-w-0">
      <TextContent body={messageText} />
      {buttons.length > 0 && (
        <div className="flex flex-col gap-1.5 w-full">
          <div className={cn("border-t mt-2", divider)} />
          {buttons.map((btn, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className={cn("border-t", divider)} />}
              <div
                role={clickable && btn.type !== "web_url" ? "button" : undefined}
                onClick={clickable && btn.type !== "web_url" && (btn.title || btn.payload)
                  ? () => onQuickSend!(btn.title || btn.payload || "")
                  : undefined}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium rounded-sm select-none",
                  msg.fromMe
                    ? "bg-white/10 text-primary-foreground"
                    : "bg-primary/8 text-primary",
                  clickable && btn.type !== "web_url" && "cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity",
                  (!clickable || btn.type === "web_url") && "cursor-default"
                )}
              >
                {btn.type === "web_url" && btn.url ? (
                  <a href={btn.url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-1 min-w-0">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="break-words min-w-0 flex-1 text-center">{btn.title}</span>
                  </a>
                ) : (
                  <span className="break-words min-w-0 flex-1 text-center">{btn.title || btn.payload}</span>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FB4 — MediaTemplateContent (Messenger media template) ────────────────────
function MediaTemplateContent({ msg, onQuickSend }: { msg: Message; onQuickSend?: (text: string) => void }) {
  const rawBody = msg.body || "";
  let mediaType = "image";
  let mediaUrl = "";
  let buttons: { type?: string; title?: string; url?: string; payload?: string }[] = [];

  if (rawBody.startsWith("MediaTemplate:")) {
    // Format: "MediaTemplate: type | url | btn1 | btn2 | btn3"
    const rest = rawBody.substring("MediaTemplate:".length).trim();
    const parts = rest.split(" | ");
    mediaType = parts[0]?.trim() || "image";
    mediaUrl = parts[1]?.trim() || "";
    if (parts.length > 2) buttons = parts.slice(2).map((b) => ({ title: b.trim() }));
  } else {
    try {
      const parsed = JSON.parse(rawBody);
      const element = parsed?.elements?.[0] || parsed;
      mediaType = element?.media_type || "image";
      mediaUrl = element?.url || "";
      buttons = element?.buttons || [];
    } catch {
      // ignore
    }
  }

  const isVideo = mediaType === "video";
  const clickable = !!onQuickSend;

  return (
    <div className="rounded-lg border bg-muted/10 overflow-hidden max-w-[260px]">
      <div className="relative h-[140px] bg-muted flex items-center justify-center">
        {mediaUrl ? (
          isVideo ? (
            <video src={mediaUrl} controls preload="metadata" className="w-full h-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt="media"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            {isVideo ? <PlayCircle className="h-10 w-10" /> : <Grid2X2 className="h-10 w-10" />}
            <span className="text-xs">{isVideo ? "Video" : "Image"} Template</span>
          </div>
        )}
      </div>
      {buttons.length > 0 && (
        <div className={cn("border-t divide-y", msg.fromMe ? "border-primary-foreground/20" : "border-border/50")}>
          {buttons.map((btn, i) => (
            <div
              key={i}
              role={clickable && !btn.url ? "button" : undefined}
              onClick={clickable && !btn.url && (btn.title || btn.payload) ? () => onQuickSend!(btn.title || btn.payload || "") : undefined}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium rounded-sm mx-1 my-0.5 select-none",
                msg.fromMe ? "bg-white/10 text-primary-foreground" : "bg-primary/8 text-primary",
                clickable && !btn.url && "cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity",
                (!clickable || btn.url) && "cursor-default"
              )}
            >
              {btn.url ? (
                <a href={btn.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span>{btn.title}</span>
                </a>
              ) : (
                <span>{btn.title || btn.payload}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FB5 — ReceiptTemplateContent (Messenger receipt template) ────────────────
function ReceiptTemplateContent({ msg }: { msg: Message }) {
  const rawBody = msg.body || "";
  let orderNumber = "";
  let recipientName = "";
  let currency = "";
  let totalCost = "";
  let paymentMethod = "";
  let items: string[] = [];

  if (rawBody.startsWith("Receipt:")) {
    // Format: "Receipt: orderNumber | recipientName | currency totalCost | paymentMethod | items"
    const rest = rawBody.substring("Receipt:".length).trim();
    const parts = rest.split(" | ");
    orderNumber = parts[0]?.trim() || "";
    recipientName = parts[1]?.trim() || "";
    const totalStr = parts[2]?.trim() || "";
    const totalMatch = totalStr.match(/^(\S+)\s+([\d.,]+)$/);
    if (totalMatch) { currency = totalMatch[1]; totalCost = totalMatch[2]; }
    else { totalCost = totalStr; }
    paymentMethod = parts[3]?.trim() || "";
    if (parts[4]) items = parts[4].split(';').map(s => s.trim()).filter(Boolean);
  } else {
    try {
      const parsed = JSON.parse(rawBody);
      const tpl = parsed?.template || parsed;
      orderNumber = tpl?.order_number || tpl?.orderNumber || "";
      recipientName = tpl?.recipient_name || tpl?.recipientName || "";
      currency = tpl?.currency || "";
      totalCost = tpl?.summary?.total_cost || tpl?.totalCost || "";
      paymentMethod = tpl?.payment_method || tpl?.paymentMethod || "";
    } catch {
      orderNumber = rawBody;
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-w-[280px]">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-5 w-5 text-green-600 shrink-0" />
        <span className="text-sm font-medium">Recibo</span>
      </div>
      {recipientName && (
        <p className="text-xs text-muted-foreground">{recipientName}</p>
      )}
      {orderNumber && (
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase font-medium mb-0.5">Pedido</p>
          <p className="text-sm font-bold tracking-wide">{orderNumber}</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="border-t pt-2 space-y-0.5">
          {items.map((it, i) => (
            <p key={i} className="text-xs text-muted-foreground truncate">{it}</p>
          ))}
        </div>
      )}
      {paymentMethod && (
        <p className="text-xs text-muted-foreground">💳 {paymentMethod}</p>
      )}
      {totalCost && (
        <p className="text-sm text-right font-semibold border-t pt-2">
          Total: {currency} {totalCost}
        </p>
      )}
    </div>
  );
}

// ── FB8 — FeedbackResponseContent (resposta do usuario ao feedback) ─────────
function FeedbackResponseContent({ msg }: { msg: Message }) {
  const rawBody = msg.body || "";
  let responses: { type: string; value: string; followUp?: string }[] = [];

  if (rawBody.startsWith("[FeedbackResponse]")) {
    const rest = rawBody.substring("[FeedbackResponse]".length).trim();
    const items = rest.split(" | ");
    for (const item of items) {
      const m = item.match(/^(\S+):\s*([^\(]+?)(?:\s*\(([^)]+)\))?$/);
      if (m) {
        responses.push({ type: m[1], value: m[2].trim(), followUp: m[3] });
      }
    }
  }

  return (
    <div className="rounded-lg border border-green-300 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 p-3 space-y-2 max-w-[280px]">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 fill-green-400" />
        <span className="text-sm font-semibold text-green-900 dark:text-green-100">Avaliação recebida</span>
      </div>
      {responses.map((r, i) => {
        const score = parseInt(r.value, 10);
        const isCsat = r.type === "CSAT";
        const isNps = r.type === "NPS";
        return (
          <div key={i} className="rounded-md bg-white/60 dark:bg-white/5 border border-green-200 dark:border-green-800 p-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-semibold tracking-wide text-green-700 dark:text-green-300">
                {r.type}
              </span>
              <span className="text-lg font-bold text-green-700 dark:text-green-300">
                {isCsat && !isNaN(score) ? "★".repeat(score) + "☆".repeat(5 - score) : r.value}
              </span>
            </div>
            {isNps && !isNaN(score) && (
              <p className="text-[10px] text-muted-foreground">
                {score >= 9 ? "Promotor" : score >= 7 ? "Neutro" : "Detrator"}
              </p>
            )}
            {r.followUp && (
              <p className="text-xs italic border-t border-green-200 dark:border-green-800 pt-1 mt-1">
                &ldquo;{r.followUp}&rdquo;
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── FB7 — CustomerFeedbackContent (Messenger feedback template) ─────────────
function CustomerFeedbackContent({ msg }: { msg: Message }) {
  const rawBody = msg.body || "";
  let title = "";
  let subtitle = "";
  let questionType = "CSAT";
  let questionTitle = "";

  if (rawBody.startsWith("CustomerFeedback:")) {
    const rest = rawBody.substring("CustomerFeedback:".length).trim();
    const parts = rest.split(" | ");
    title = parts[0]?.trim() || "";
    // Detecta se tem subtitle (quando nao comeca com CSAT/NPS/CES)
    let questionPartIdx = 1;
    if (parts[1] && !/^(CSAT|NPS|CES):/.test(parts[1])) {
      subtitle = parts[1].trim();
      questionPartIdx = 2;
    }
    const questionPart = parts[questionPartIdx]?.trim() || "";
    const typeMatch = questionPart.match(/^(CSAT|NPS|CES):\s*(.+)$/);
    if (typeMatch) {
      questionType = typeMatch[1];
      questionTitle = typeMatch[2];
    } else if (questionPart) {
      questionTitle = questionPart;
    }
  }

  const typeLabel: Record<string, { emoji: string; desc: string }> = {
    CSAT: { emoji: "⭐", desc: "5 estrelas" },
    NPS: { emoji: "📊", desc: "0-10" },
    CES: { emoji: "💪", desc: "Esforço do Cliente" },
  };
  const label = typeLabel[questionType] || typeLabel.CSAT;

  return (
    <div className="rounded-lg border bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 p-3 space-y-2 max-w-[280px]">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Pesquisa de Satisfação</span>
      </div>
      {title && (
        <p className="text-sm font-medium leading-snug">{title}</p>
      )}
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
      <div className="rounded-md bg-white/50 dark:bg-white/5 border border-indigo-200 dark:border-indigo-800 p-2 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">{label.emoji}</span>
          <span className="text-[10px] uppercase font-semibold tracking-wide text-indigo-700 dark:text-indigo-300">
            {questionType} · {label.desc}
          </span>
        </div>
        {questionTitle && (
          <p className="text-xs">{questionTitle}</p>
        )}
      </div>
    </div>
  );
}

// ── FB6 — CarouselTemplateContent (Messenger carousel template) ──────────────
function CarouselTemplateContent({ msg }: { msg: Message }) {
  const rawBody = msg.body || "";
  let templateName = "";
  let cards: { title?: string; subtitle?: string; imageUrl?: string; image_url?: string; buttons?: { title?: string; url?: string }[] }[] = [];

  if (rawBody.startsWith("Carousel:")) {
    templateName = rawBody.substring("Carousel:".length).trim();
  } else {
    try {
      const parsed = JSON.parse(rawBody);
      templateName = parsed?.name || parsed?.template_name || "";
      cards = parsed?.elements || parsed?.cards || parsed?.template?.elements || [];
    } catch {
      templateName = rawBody;
    }
  }

  if (cards.length > 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-1">
          <Grid2X2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Carrossel</span>
          {templateName && <span className="text-xs text-muted-foreground">— {templateName}</span>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 max-w-[300px]">
          {cards.map((card, i) => (
            <div key={i} className="rounded-lg border bg-muted/30 min-w-[140px] overflow-hidden shrink-0">
              {(card.imageUrl || card.image_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.imageUrl || card.image_url}
                  alt={card.title || ""}
                  className="w-full h-[80px] object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="p-1.5">
                {card.title && <p className="text-xs font-semibold line-clamp-1">{card.title}</p>}
                {card.subtitle && <p className="text-[10px] text-muted-foreground line-clamp-1">{card.subtitle}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Grid2X2 className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-xs font-medium">Template Carrossel</p>
          {templateName && <p className="text-[10px] text-muted-foreground">{templateName}</p>}
        </div>
      </div>
    </div>
  );
}

function PollContent({ msg }: { msg: Message }) {
  let name = msg.body;
  let options: { optionName: string }[] = [];
  let footer = "";
  let selectableCount = 1;
  try {
    const p = JSON.parse(msg.body);
    name = p?.name || msg.body;
    options = p?.options || [];
    footer = p?.footer || "";
    selectableCount = p?.selectableCount || 1;
  } catch {}
  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex items-start gap-2">
        <BarChart3 className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-sm font-semibold break-words flex-1 min-w-0">{name}</p>
      </div>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className={cn("flex w-full items-start gap-2 rounded-md border px-3 py-2", msg.fromMe ? "border-primary-foreground/20" : "border-border/50")}>
            <div className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", selectableCount > 1 ? "rounded-sm border-2" : "rounded-full border-2", msg.fromMe ? "border-primary-foreground/50" : "border-muted-foreground/50")} />
            <span className="text-xs flex-1 min-w-0 break-words">{opt.optionName}</span>
          </div>
        ))}
      </div>
      {footer && <p className={cn("text-[10px] break-words", msg.fromMe ? "text-primary-foreground/60" : "text-muted-foreground")}>{footer}</p>}
    </div>
  );
}

function CarouselUazContent({ msg }: { msg: Message }) {
  let text = "";
  let cards: { text: string; image?: string; video?: string; document?: string; buttons?: { text: string; type?: string; id?: string }[] }[] = [];
  try {
    const p = JSON.parse(msg.body);
    text = p?.text || "";
    cards = p?.cards || [];
  } catch {}
  const [idx, setIdx] = useState(0);
  const card = cards[idx];
  if (!card) return <TextContent body={msg.body} />;
  return (
    <div className="min-w-[min(240px,100%)] space-y-2">
      {text && <p className="text-sm mb-1">{text}</p>}
      <div className={cn("rounded-lg overflow-hidden border", msg.fromMe ? "border-primary-foreground/20" : "border-border/50")}>
        {card.image && <img src={card.image} alt="" className="w-full max-h-48 object-cover" />}
        <div className="p-2 space-y-1">
          <p className="text-xs whitespace-pre-wrap">{card.text}</p>
          {(card.buttons || []).map((b, i) => (
            <div key={i} className={cn("flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded-sm", msg.fromMe ? "bg-white/10 text-primary-foreground" : "bg-primary/8 text-primary")}>
              {b.type === "URL" && <ExternalLink className="h-3 w-3" />}
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      </div>
      {cards.length > 1 && (
        <div className="flex items-center justify-between">
          <button type="button" disabled={idx === 0} onClick={() => setIdx(i => i - 1)} className="disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[10px] text-muted-foreground">{idx + 1}/{cards.length}</span>
          <button type="button" disabled={idx === cards.length - 1} onClick={() => setIdx(i => i + 1)} className="disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function PixButtonContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const [copied, setCopied] = useState(false);
  let pixKey = "", pixType = "", pixName = "Pix";
  try {
    const p = JSON.parse(msg.body);
    pixKey = p?.pixKey || "";
    pixType = p?.pixType || "";
    pixName = p?.pixName || "Pix";
  } catch {}

  const handleCopy = () => {
    if (!pixKey) return;
    navigator.clipboard.writeText(pixKey).then(() => {
      setCopied(true);
      toast.success(t("pixKeyCopied"));
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="min-w-[min(220px,100%)]">
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-teal-500/15 flex items-center justify-center">
            <span className="text-teal-600 font-bold text-xs">PIX</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{pixName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{pixType}: {pixKey}</p>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className={cn("w-full flex items-center justify-center gap-1.5 py-2 mt-1 text-sm font-medium rounded-sm transition-colors", msg.fromMe ? "bg-white/10 text-primary-foreground hover:bg-white/20" : "bg-primary/8 text-primary hover:bg-primary/15")}
      >
        <CopyIcon className="h-3.5 w-3.5" />
        <span>{copied ? t("copied") : t("payWithPix")}</span>
      </button>
    </div>
  );
}

function RequestPaymentContent({ msg }: { msg: Message }) {
  let p: any = {};
  try { p = JSON.parse(msg.body); } catch {}
  const amount = typeof p.amount === "number" ? p.amount : 0;
  return (
    <div className="min-w-[min(240px,100%)]">
      <div className="rounded-lg border bg-muted/20 overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/40 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-semibold truncate">{p.title || "Solicitação de pagamento"}</p>
        </div>
        <div className="p-3 space-y-1">
          {p.text && <p className="text-xs whitespace-pre-wrap">{p.text}</p>}
          {p.itemName && <p className="text-[11px] text-muted-foreground">{p.itemName}</p>}
          {p.invoiceNumber && <p className="text-[10px] text-muted-foreground">#{p.invoiceNumber}</p>}
          <p className="text-lg font-bold pt-1">R$ {amount.toFixed(2)}</p>
          {p.footer && <p className="text-[10px] text-muted-foreground">{p.footer}</p>}
        </div>
      </div>
      <div className={cn("flex items-center justify-center gap-1.5 py-2 mt-1 text-sm font-medium rounded-sm", msg.fromMe ? "bg-white/10 text-primary-foreground" : "bg-primary/8 text-primary")}>
        <Receipt className="h-3.5 w-3.5" />
        <span>Revisar e pagar</span>
      </div>
    </div>
  );
}

function MediaDownloadLimitedPlaceholder({ icon = "🎨" }: { icon?: React.ReactNode }) {
  const t = useTranslations("messageBubble");
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center w-[100px] h-[100px] rounded-lg bg-muted/40 text-xl cursor-help">
            {icon}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] space-y-1">
          <p className="font-semibold text-xs">{t("mediaDownloadLimitedTitle")}</p>
          <p className="text-[11px] opacity-90 whitespace-normal">{t("mediaDownloadLimitedDesc")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Post/reel do Instagram compartilhado em DM (mediaType 'share'): o asset não é
// baixado (CDN volátil) — o backend persiste texto + link; renderiza card de link.
function SharedPostContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const body = msg.body || "";
  const url = body.match(/https?:\/\/\S+/)?.[0] || "";
  const text = body
    .split("\n")
    .filter((line) => !/https?:\/\//.test(line))
    .join("\n")
    .trim();
  return (
    <div className="flex flex-col gap-1.5 max-w-[280px]">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-base leading-none">📎</span>
        <span className="break-words">{text || t("sharedPost")}</span>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 opacity-90 hover:opacity-100"
        >
          {t("viewSharedPost")} <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function getMessageContent(msg: Message, allMessages?: Message[], useWave?: boolean, onQuickSend?: (text: string) => void) {
  const mt = msg.mediaType || "chat";
  const textTypes = ["chat", "extendedTextMessage", "conversation", ""];
  const imageTypes = ["image", "imageMessage", "media", "sticker", "stickerMessage", "lottieStickerMessage"];
  const audioTypes = ["audio", "audioMessage"];
  const videoTypes = ["video", "videoMessage"];
  const vcardTypes = ["vcard", "contact", "contacts", "contactMessage", "contactsArrayMessage"];
  const locationTypes = ["location", "locationMessage", "liveLocationMessage"];
  const interactiveTypes = ["interactive", "interactiveMessage"];
  const nfmTypes = ["nfm_reply", "interactive_nfm_reply"];
  const buttonTypes = ["button", "reply_buttons", "buttonMessage"];
  const templateTypes = ["templates", "templateMessage"];
  const orderTypes = ["order", "orderMessage"];

  if (mt === "transcription") return <TranscriptionContent msg={msg} />;
  if (mt === "share") return <SharedPostContent msg={msg} />;
  // Aviso de disparo de agendada: chega com mediaType "notes" (por isso ja e
  // centralizado pelo gate isSystem), mas nao e nota do atendente — precisa vir
  // ANTES do branch de notes para nao cair na caixa amarela sem rotulo.
  if (msg.messageId?.startsWith("sched_notice")) return <ScheduleNoticeContent msg={msg} />;
  if (mt === "notes" || mt === "callNotes") return <NotesContent msg={msg} />;
  if (mt === "transfer") return <TransferContent msg={msg} />;
  if (mt === "location_request") return <LocationRequestContent />;
  if (mt === "cta_url") return <CtaUrlContent msg={msg} />;
  if (mt === "cta_call") return <CtaCallContent msg={msg} />;
  if (locationTypes.includes(mt)) return <LocationContent msg={msg} />;
  if (vcardTypes.includes(mt)) return <VcardContent msg={msg} />;
  if (nfmTypes.includes(mt)) return <NfmReplyContent msg={msg} />;
  if (mt === "button_reply") return <ButtonReplyContent msg={msg} />;
  if (msg.body?.startsWith("[FeedbackResponse]")) return <FeedbackResponseContent msg={msg} />;
  if (
    msg.body === "[Permissão de chamada solicitada]" ||
    /\[Permissão de chamada:\s*(accept|decline)\]/i.test(msg.body || "")
  ) return <CallPermissionContent msg={msg} />;
  if (interactiveTypes.includes(mt)) return <InteractiveContent msg={msg} />;
  if (buttonTypes.includes(mt)) {
    // FB2 — QuickReply (Instagram/Messenger)
    if (msg.body?.startsWith("QR:")) return <QuickReplyContent msg={msg} onQuickSend={onQuickSend} />;
    // FB3 — ButtonTemplate (Messenger)
    if (msg.body?.startsWith("ButtonTemplate:")) return <ButtonTemplateContent msg={msg} onQuickSend={onQuickSend} />;
    return <ButtonContent msg={msg} onQuickSend={onQuickSend} />;
  }
  if (mt === "list" || mt === "listMessage") return <ListContent msg={msg} onQuickSend={onQuickSend} />;
  if (mt === "listResponseMessage") return <ListResponseContent msg={msg} />;
  if (mt === "poll" || mt === "pollCreationMessage" || mt === "pollCreationMessageV2" || mt === "pollCreationMessageV3") return <PollContent msg={msg} />;
  if (mt === "carousel") return <CarouselUazContent msg={msg} />;
  if (mt === "pix_button") return <PixButtonContent msg={msg} />;
  if (mt === "request_payment") return <RequestPaymentContent msg={msg} />;
  if (mt === "templateBaileys") return <TemplateBaileysContent msg={msg} />;
  if (templateTypes.includes(mt)) {
    // FB1 — GenericTemplate (Instagram/Messenger)
    if (msg.body?.startsWith("GenericTemplate:")) return <GenericTemplateContent msg={msg} onQuickSend={onQuickSend} />;
    // FB3 — ButtonTemplate (Instagram/Messenger) — mediaType pode ser 'templates' ou 'button'
    if (msg.body?.startsWith("ButtonTemplate:")) return <ButtonTemplateContent msg={msg} onQuickSend={onQuickSend} />;
    // FB4 — MediaTemplate (Messenger)
    if (msg.body?.startsWith("MediaTemplate:")) return <MediaTemplateContent msg={msg} onQuickSend={onQuickSend} />;
    // FB5 — ReceiptTemplate (Messenger)
    if (msg.body?.startsWith("Receipt:")) return <ReceiptTemplateContent msg={msg} />;
    // FB7 — CustomerFeedback (Messenger)
    if (msg.body?.startsWith("CustomerFeedback:")) return <CustomerFeedbackContent msg={msg} />;
    // FB6 — CarouselTemplate (Messenger)
    if (msg.body?.startsWith("Carousel:")) return <CarouselTemplateContent msg={msg} />;
    return <TemplateContent msg={msg} onQuickSend={onQuickSend} />;
  }
  if (orderTypes.includes(mt)) return <OrderContent msg={msg} />;
  if (mt === "productMessage" || mt === "product") return <ProductContent msg={msg} />;
  if (mt === "adsMessage") return <AdsContent msg={msg} />;
  // Album só vale para imagem/vídeo no WhatsApp. Documento/sticker/audio com isAlbum=true
  // são lixo legado (backend marcava por presença de messageSecret) — cai no branch normal
  // de DocumentContent/StickerContent para não renderizar PDF dentro de <img>.
  if (msg.isAlbum && msg.albumId && (imageTypes.includes(mt) || videoTypes.includes(mt))) return <AlbumContent msg={msg} allMessages={allMessages} />;
  // Sticker/lottieSticker sem mediaUrl (download falhou) → render fallback visual de figurinha com tooltip explicando o limite do WhatsApp
  if (["sticker", "stickerMessage", "lottieStickerMessage"].includes(mt) && !msg.mediaUrl) {
    return <MediaDownloadLimitedPlaceholder />;
  }
  // Lottie sticker: .was (ZIP WhatsApp) ou .json → renderiza via lottie-react
  if (
    mt === "lottieStickerMessage" ||
    (["sticker", "stickerMessage"].includes(mt) && /\.(was|json)$/i.test(msg.mediaUrl || ""))
  ) {
    return <LottieStickerContent msg={msg} />;
  }
  // Sticker regular (webp/png): render simples 100x100, sem lightbox
  if (["sticker", "stickerMessage"].includes(mt) && msg.mediaUrl) {
    return <StickerContent msg={msg} />;
  }
  if (imageTypes.includes(mt) && msg.mediaUrl) return <ImageContent msg={msg} />;
  if (audioTypes.includes(mt) && msg.mediaUrl) return useWave ? <WaveAudioContent msg={msg} fromMe={msg.fromMe} /> : <AudioContent msg={msg} />;
  if (videoTypes.includes(mt) && msg.mediaUrl) return <VideoContent msg={msg} />;
  // Webmail: explicit type OR document with .html URL (backend stores email HTML as mediaType='document')
  if (mt === "webmail" || (mt === "document" && msg.mediaUrl?.match(/\.html?/i))) return <WebmailContent msg={msg} allMessages={allMessages} />;
  if (msg.mediaUrl && !textTypes.includes(mt)) return <DocumentContent msg={msg} />;

  // Detecta formato templateBaileys por conteúdo (ex: body com [QuickReply] mas mediaType != templateBaileys)
  if (msg.body && (msg.body.includes("[QuickReply]") || msg.body.includes("[Botões]") || msg.body.includes("[Link]") || msg.body.includes("[Ligar]"))) {
    return <TemplateBaileysContent msg={msg} />;
  }

  // Fallback WABA: body com componentes ([{"type":"BODY"...}]) e mediaType perdido — sem isso o JSON cru vaza no TextContent.
  if (msg.body) {
    const trimmed = msg.body.trimStart();
    if (trimmed.startsWith("[") && /"type"\s*:\s*"(BODY|HEADER|BUTTONS|FOOTER)"/.test(trimmed)) {
      return <TemplateContent msg={msg} onQuickSend={onQuickSend} />;
    }
  }

  // Email enviado (canal email): body gerado pelo backend no formato fixo — renderiza card dedicado
  if (msg.fromMe && msg.body && /^E-mail enviado para /.test(msg.body)) {
    return <EmailSentContent body={msg.body} fromMe={msg.fromMe} emailBody={msg.emailMetadata?.text} date={msg.createdAt} />;
  }

  // Mídia com download falhado (image/video/audio/document) — backend grava body de sistema; troca por placeholder com tooltip
  if (!msg.mediaUrl && msg.body?.includes("Media download limited by the WhatsApp server")) {
    const mediaIcon = videoTypes.includes(mt) ? "🎞️" : audioTypes.includes(mt) ? "🎵" : imageTypes.includes(mt) ? "🖼️" : "📎";
    return <MediaDownloadLimitedPlaceholder icon={mediaIcon} />;
  }

  // Fallback PIX: o echo InfiniteAPI pode chegar com mediaType "chat" + body {pixKey,...}
  // (mediaType perdido na derivação do echo) — sem isso o JSON cru vaza no TextContent.
  // Guard amount===undefined: PixButton não tem amount; request_payment tem (e já roteou em :3965).
  if (msg.body) {
    try {
      const _pix = JSON.parse(msg.body);
      if (_pix?.pixKey && _pix?.amount === undefined) return <PixButtonContent msg={msg} />;
    } catch {}
  }

  // Link preview always on — mesmo mensagens antigas e enviadas por mim
  return <TextContent body={msg.edition ?? msg.body} isDeleted={msg.isDeleted} isEdited={msg.isEdited} originalBody={msg.edition ? msg.body : undefined} showLinkPreview />;
}

// Renderiza apenas o conteúdo da mensagem (template/botões/mídia/etc.) sem o chrome
// do bubble — para uso fora do chat (ex.: /agendamentos).
export function MessageContentView({ message, onQuickSend }: { message: Message; onQuickSend?: (text: string) => void }) {
  return <>{getMessageContent(message, undefined, false, onQuickSend)}</>;
}

export const NON_FORWARDABLE_TYPES = new Set([
  "button", "list", "templates", "vcard", "contactMessage", "contactsArrayMessage",
  "location", "locationMessage", "liveLocationMessage", "location_request", "cta_url", "reply_buttons",
]);

interface MessageBubbleProps {
  message: Message;
  allMessages?: Message[];
  onReply?: (msg: Message) => void;
  onForward?: (msg: Message) => void;
  onForwardPrivate?: (msg: Message) => void;
  onForwardOtherChannel?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
  onReact?: (msg: Message, emoji: string) => void;
  onEdit?: (msg: Message, newBody: string) => void;
  onStar?: (msg: Message) => void;
  onPin?: (msg: Message) => void;
  whatsapp?: { chatgptApiKey?: string; chatgptModel?: string; type?: string; hybridMode?: string };
  ticketId?: number;
  onQuickSend?: (text: string) => void;
  /** Reenvio de mensagem otimista local falhada (id "front-*" com ack -1) — exibe o botão
   *  "Tentar novamente" dentro da bolha. Mensagens reais com statusError de webhook não ganham retry. */
  onRetryMessage?: (msg: Message) => void;
  /** false = bolha "do meio" de um run consecutivo do mesmo remetente: não aplica o canto
   *  lateral reto (rounded-b*-md), ficando rounded-2xl cheio. Default true — visual atual. */
  isGroupEnd?: boolean;
}

// Comparator: re-render somente quando dados visuais da mensagem mudam.
// Ignora identidade das callbacks (pai passa inline arrow functions, refs
// mudam toda render). Sem isso, qualquer re-render do pai (hover, socket,
// scroll, digitação) trocava nós de texto e cancelava seleção do usuário
// mid-drag — quebrava copiar parte da mensagem.
function arePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  const a = prev.message;
  const b = next.message;
  // Campos que afetam o que é renderizado dentro da bolha
  if (
    a.id !== b.id ||
    a.body !== b.body ||
    a.ack !== b.ack ||
    a.uploadProgress !== b.uploadProgress ||
    a.mediaUrl !== b.mediaUrl ||
    a.mediaType !== b.mediaType ||
    a.fileName !== b.fileName ||
    a.isDeleted !== b.isDeleted ||
    a.isStarred !== b.isStarred ||
    a.isPinned !== b.isPinned ||
    a.isEdited !== b.isEdited ||
    a.isForwarded !== b.isForwarded ||
    a.sentVia !== b.sentVia ||
    a.isStatusReply !== b.isStatusReply ||
    a.translatedBody !== b.translatedBody ||
    a.translatedLang !== b.translatedLang ||
    a.reaction !== b.reaction ||
    a.reactionFromMe !== b.reactionFromMe ||
    a.createdAt !== b.createdAt
  ) return false;
  // allMessages só é consumido por álbuns (AlbumContent) e webmail (WebmailContent).
  // Para as demais mensagens (texto, imagem única, áudio, etc.) a referência do array
  // é irrelevante. O array `messages` é recriado a cada update de QUALQUER mensagem
  // (ack/entrega/status), então comparar a ref aqui re-renderizava TODA a lista a cada
  // evento — flashing contínuo. Só observa allMessages quando a mensagem de fato usa.
  const usesAll = (m: Message) =>
    !!m.isAlbum ||
    m.mediaType === "webmail" ||
    (m.mediaType === "document" && /\.html?/i.test(m.mediaUrl ?? ""));
  if ((usesAll(a) || usesAll(b)) && prev.allMessages !== next.allMessages) return false;
  if (prev.ticketId !== next.ticketId) return false;
  // Compara por valor (não por referência): o objeto whatsapp vem de ticket?.whatsapp
  // e é recriado quando o ticket é re-normalizado num ticket:update — comparar a ref
  // re-renderizava todos os bubbles a cada update de ticket.
  if (
    prev.whatsapp?.chatgptApiKey !== next.whatsapp?.chatgptApiKey ||
    prev.whatsapp?.chatgptModel !== next.whatsapp?.chatgptModel ||
    prev.whatsapp?.hybridMode !== next.whatsapp?.hybridMode ||
    prev.whatsapp?.type !== next.whatsapp?.type
  ) return false;
  // isGroupEnd: comparação normalizada — undefined e true são visualmente idênticos
  // (só false remove o canto lateral), então undefined→true não re-renderiza.
  if ((prev.isGroupEnd !== false) !== (next.isGroupEnd !== false)) return false;
  // onRetryMessage é comparado por IDENTIDADE (não só presença): o retry captura o
  // payload de reenvio no closure — um handler stale poderia reenviar contexto errado.
  // O pai DEVE passar ref estável (useCallback), senão todos os bubbles re-renderizam
  // a cada render do pai (reintroduz o bug de seleção descrito acima).
  if (prev.onRetryMessage !== next.onRetryMessage) return false;
  // Compara apenas a presença dos callbacks (defined vs undefined), não a ref.
  // O pai recria as funções a cada render mas o comportamento é o mesmo.
  const callbacks: (keyof MessageBubbleProps)[] = [
    "onReply", "onForward", "onForwardPrivate", "onForwardOtherChannel",
    "onDelete", "onReact", "onEdit", "onStar", "onPin", "onQuickSend",
  ];
  for (const k of callbacks) {
    if ((prev[k] === undefined) !== (next[k] === undefined)) return false;
  }
  return true;
}

export const MessageBubble = React.memo(function MessageBubble({ message: msg, allMessages, onReply, onForward, onForwardPrivate, onForwardOtherChannel, onDelete, onReact, onEdit, onStar, onPin, whatsapp, ticketId, onQuickSend, onRetryMessage, isGroupEnd }: MessageBubbleProps) {
  const t = useTranslations("messageBubble");
  const { locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.body);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [translation, setTranslation] = useState<string | null>(msg.translatedBody ?? null);
  const [translationLang, setTranslationLang] = useState<TranslateTargetLang | null>((msg.translatedLang as TranslateTargetLang) ?? null);
  const [translating, setTranslating] = useState(false);
  const [savingToGallery, setSavingToGallery] = useState(false);
 // Regra do front legado: encaminhar bloqueado para usuário restrito (front legado — restrictedUserRestriction9)
  const { isRestrictedUser, getConfigValue } = useAuthStore();
  const isRestricted = isRestrictedUser();
  const { isLiveMode } = useLiveMode();
  const useWaveAudio = getConfigValue("audioModulo") === "enabled";

  useEffect(() => {
    if (editing && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [editing]);

  const handleSaveToGallery = async () => {
    if (!msg.mediaUrl || savingToGallery) return;
    setSavingToGallery(true);
    const url = getMediaUrl(msg);
    const fallbackName = msg.fileName || (msg.mediaUrl ? msg.mediaUrl.split(/[\\/]/).pop()?.split("?")[0] : undefined) || `arquivo-${Date.now()}`;
    await saveUrlToGallery(url, fallbackName, t("savedToGallery"), t("errorSaveToGallery"));
    setSavingToGallery(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") { setEditing(false); }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEdit?.(msg, editText); setEditing(false); }
  };

  const handleEditInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const handleAskAI = async () => {
    if (!msg.body?.trim()) return;
    setAiLoading(true);
    setAiResult("");
    setAiDialogOpen(true);
    try {
      const { data } = await api.post<{ answer: string }>("/copilot/askAi", {
        body: msg.body,
        ticketId,
        ...copilotUiLangPayload(),
      });
      setAiResult(data.answer);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 422) { setAiResult(t("aiNoConfig")); } else { setAiResult(t("aiError")); }
    } finally {
      setAiLoading(false);
    }
  };

  const handleTranslate = async (targetLang: TranslateTargetLang) => {
    if (!msg.body?.trim() || !ticketId || translating) return;
    setTranslating(true);
    try {
      const result = await translateMessage(msg.body, ticketId, targetLang, msg.id);
      setTranslation(result.translated);
      setTranslationLang(result.targetLang);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 422) {
        toast.error(t("aiNoConfig"));
      } else {
        toast.error(t("errorTranslate"));
      }
    } finally {
      setTranslating(false);
    }
  };

  const isSystem = msg.mediaType === "notes" || msg.mediaType === "transfer" || msg.mediaType === "callNotes";
  // Canal híbrido (WABA com modo híbrido ativo): reagir e responder ficam
  // desabilitados — o roteamento híbrido/transporte não suporta essas ações.
  const isHybridChannel = !!whatsapp?.hybridMode && whatsapp.hybridMode !== "disabled";
  // Mensagem de texto recebida por WABA Meta/Instagram/Messenger/Dialog360/Gupshup e
  // meow chega com mediaType "text" (o mesmo vale para o outbound do webchat) — sem ele
  // aqui, Copiar texto / Pergunte a IA / Traduzir sumiam do menu dessas mensagens,
  // embora aparecessem nas enviadas pelo atendente (que nascem "chat").
  const isTextMessage = ["chat", "text", "extendedTextMessage", "conversation"].includes(msg.mediaType || "chat");
  // Editar mantem a lista ANTIGA de proposito: os canais que gravam "text" nao
  // suportam edicao de mensagem, e incluir o tipo aqui faria surgir um "Editar" que
  // nao funciona (Instagram, Messenger, webchat e echo do gupshup).
  const isEditableTextMessage = ["chat", "extendedTextMessage", "conversation"].includes(msg.mediaType || "chat");
  const isAudio = ["audio", "audioMessage"].includes(msg.mediaType || "");
  const canForward = !NON_FORWARDABLE_TYPES.has(msg.mediaType || "") && !isRestricted;
  const isStickerMsg = msg.mediaType === "sticker" || msg.mediaType === "stickerMessage" || msg.mediaType === "lottieStickerMessage";

  // Itens individuais do álbum não são renderizados separadamente — apenas o master (isAlbum: true) é exibido.
  // Álbum só existe para imagem/vídeo: o gate é restrito a esses tipos para que um albumId espúrio
  // gravado por engano em áudio/documento (ex.: messageSecret E2E do canal Evo) não esconda a bolha.
  const isAlbumCapable = ["image", "imageMessage", "media", "video", "videoMessage"].includes(msg.mediaType || "");
  if (msg.albumId && !msg.isAlbum && isAlbumCapable) return null;

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="max-w-[80%]">{getMessageContent(msg, allMessages, useWaveAudio, onQuickSend)}</div>
      </div>
    );
  }

  return (<>
    <motion.div
      // Animação de entrada removida: o wrapper da página já anima a chegada da
      // mensagem — animar aqui também duplicava o efeito (bolha "pulava" 2x).
      initial={false}
      className={cn("group flex gap-2 items-end", msg.fromMe ? "justify-end" : "justify-start")}
      onDoubleClick={() => { if (!isHybridChannel) onReply?.(msg); }}
    >
      <div
        className={cn(
          "relative max-w-[70%]",
          isStickerMsg
            ? "" // figurinha: sem bolha, sem padding, sem fundo
            : cn(
                "rounded-2xl px-3 py-2",
                msg.fromMe ? "bg-primary text-primary-foreground" : "bg-muted",
                // Agrupamento estilo WhatsApp: só a última bolha do run do mesmo
                // remetente ganha o canto lateral reto; as "do meio" (isGroupEnd
                // === false) ficam rounded-2xl cheias. Sem a prop, visual atual.
                isGroupEnd !== false && (msg.fromMe ? "rounded-br-md" : "rounded-bl-md")
              ),
          isLiveMode && "live-blur-strong"
        )}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {!msg.fromMe && msg.contact && (
          <p className="text-[10px] font-semibold text-primary mb-0.5">{msg.contact.name}</p>
        )}

        {/* YouTube reply indicator — apenas em mensagens enviadas (fromMe) em
            tickets de canal youtube. Sinaliza pro agente que o destino do envio
            e um comentario/live chat no YouTube, nao chat privado. */}
        {msg.fromMe && msg.channel === "youtube" && (
          <p className={cn(
            "flex items-center gap-1 text-[10px] italic mb-0.5",
            "text-primary-foreground/80"
          )}>
            <Youtube className="h-3 w-3" /> {t("youtubeReply")}
          </p>
        )}

        {/* Forwarded indicator */}
        {msg.isForwarded && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground/80 italic mb-0.5">
            <CornerUpRight className="h-3 w-3" /> {t("forwarded")}
          </p>
        )}

        {/* Resposta ao seu status (WABA): context.from = seu numero, sem context.id.
            A Meta nao envia qual status, entao mostramos so a etiqueta. */}
        {msg.isStatusReply && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground/80 italic mb-0.5">
            <CircleDashed className="h-3 w-3" /> {t("statusReply")}
          </p>
        )}

        {/* Mensagem original de campanha injetada (showOriginalOnReply) — mostra
            de qual campanha veio e quando foi enviada, já que o createdAt da
            bolha é o momento da resposta do contato, não o do disparo. */}
        {msg.campaignMeta && (
          <p className={cn(
            "flex items-center gap-1 text-[10px] italic mb-0.5",
            msg.fromMe ? "text-primary-foreground/80" : "text-muted-foreground/80"
          )}>
            <Megaphone className="h-3 w-3 shrink-0" />
            {t("campaignMessage")}
            {msg.campaignMeta.campaignName ? ` · ${msg.campaignMeta.campaignName}` : ""}
            {msg.campaignMeta.sentAt
              ? ` · ${new Date(msg.campaignMeta.sentAt).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </p>
        )}

        {msg.quotedMsg && <QuotedMessageBlock msg={msg.quotedMsg} />}

        {msg.isDeleted && !isTextMessage && (
          <p className={cn(
            "flex items-center gap-1 text-[11px] italic mb-1",
            msg.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            <Trash2 className="h-3 w-3 shrink-0" /> {t("deletedMessage")}
          </p>
        )}

        {editing ? (
          <div className="space-y-2 w-full min-w-[min(220px,100%)]">
            <textarea
              ref={editTextareaRef}
              value={editText}
              onChange={handleEditInput}
              onKeyDown={handleEditKeyDown}
              rows={3}
              // text-base no mobile: fonte < 16px faz o iOS ampliar a pagina ao
              // focar o campo. A partir de sm volta a 14px.
              className="w-full rounded-lg border-2 border-primary/40 focus:border-primary bg-background text-foreground px-3 py-2 text-base sm:text-sm leading-relaxed resize-none outline-none transition-colors shadow-inner min-h-[72px]"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-foreground/70 select-none bg-black/10 dark:bg-white/10 rounded px-1.5 py-0.5">Enter {t("toSave")} · Esc {t("toCancel")}</span>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={() => setEditing(false)}>{t("cancel")}</Button>
                <Button size="sm" className="h-7 px-3 text-xs" onClick={() => { onEdit?.(msg, editText); setEditing(false); }}>{t("save")}</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className={cn(msg.isDeleted && !isTextMessage && "opacity-60 grayscale")}>
            {getMessageContent(msg, allMessages, useWaveAudio, onQuickSend)}
          </div>
        )}

        {(translating || (translation !== null && translationLang)) && (
          <div className={cn(
            "mt-1 rounded-md border-l-2 px-2 py-1 text-xs",
            msg.fromMe
              ? "bg-white/10 border-white/40 text-primary-foreground"
              : "bg-violet-50 border-violet-400 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100"
          )}>
            {translating ? (
              <span className="flex items-center gap-1.5 opacity-70">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("translating")}
              </span>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="flex items-center gap-1 opacity-80 font-medium uppercase text-[9px] tracking-wide">
                    <Languages className="h-2.5 w-2.5" />
                    {t("translatedTo")} {t(`lang${translationLang!.toUpperCase()}`)}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setTranslation(null); setTranslationLang(null); }}
                    className="opacity-60 hover:opacity-100 transition-opacity"
                    title={t("hide")}
                  >
                    <XIcon className="h-2.5 w-2.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{translation}</p>
              </>
            )}
          </div>
        )}

        {(msg.reaction || msg.reactionFromMe) && (
          <span className="absolute -bottom-2 left-2 rounded-full bg-background border px-1.5 text-xs shadow-sm flex items-center gap-0.5">
            {msg.reaction && <span title={t("reactionReceived")}>{msg.reaction}</span>}
            {msg.reactionFromMe && <span title={t("myReaction")}>{msg.reactionFromMe}</span>}
          </span>
        )}

        {(() => {
          const mt = msg.mediaType || "";
          const imageTypes = ["image", "imageMessage", "media"];
          const videoTypes = ["video", "videoMessage"];
          const docTypes = ["document", "documentMessage"];
          // Tipos com renderer dedicado que ja exibem msg.body internamente — nao duplicar como label
          const dedicatedRenderers = [
            "transcription", "notes", "callNotes", "transfer", "location_request",
            "cta_url", "cta_call", "vcard", "contactMessage", "contactsArrayMessage",
            "location", "locationMessage", "liveLocationMessage", "interactive",
            "interactiveMessage", "nfm_reply", "interactive_nfm_reply", "button_reply",
            "button", "reply_buttons", "buttonMessage", "list", "listMessage",
            "listResponseMessage", "poll", "pollCreationMessage", "pollCreationMessageV2",
            "pollCreationMessageV3", "carousel", "pix_button", "request_payment",
            "templates", "templateMessage", "templateBaileys", "order", "orderMessage",
            "productMessage", "product", "adsMessage", "share",
          ];
          if (dedicatedRenderers.includes(mt)) return null;
          const isImg = imageTypes.includes(mt) && msg.mediaUrl;
          const isVid = videoTypes.includes(mt) && msg.mediaUrl;
          const isDoc = docTypes.includes(mt) || (msg.mediaUrl && !imageTypes.includes(mt) && !videoTypes.includes(mt) && !["audio", "audioMessage", "sticker", "chat", "extendedTextMessage", "conversation", ""].includes(mt));
          if (!isImg && !isVid && !isDoc) return null;
          const isWebmail = mt === "webmail" || (mt === "document" && !!msg.mediaUrl?.match(/\.html?/i));
          if (isWebmail) return null;
          const caption = (isImg || isVid || isDoc) ? (msg.body && msg.body !== msg.fileName ? msg.body : null) : null;
          const label = caption || msg.fileName || (isDoc ? (msg.body || null) : null);
          if (!label) return null;
          return (
            <p className="text-[10px] italic text-current opacity-50 mt-0.5 break-all leading-tight max-w-[280px]">
              {label}
            </p>
          );
        })()}
        <div className={cn("flex items-center gap-1 mt-1 justify-end", isStickerMsg || !msg.fromMe ? "text-muted-foreground" : "text-primary-foreground/60")}>
          {msg.scheduleDate && (
            <span
              title={`${t("scheduledMessage")} — ${new Date(msg.scheduleDate).toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              className={msg.status === "pending" ? "text-amber-400" : "text-green-400"}
            >
              <CalendarDays className="h-2.5 w-2.5" />
            </span>
          )}
          {msg.isDelayed && <span title={t("scheduled")}><Clock className="h-2.5 w-2.5" /></span>}
          {msg.isStarred && <Star className="h-2.5 w-2.5 fill-current text-yellow-400" />}
          {msg.isPinned && <Pin className="h-2.5 w-2.5 fill-current text-blue-400" />}
          {msg.fromMe && typeof msg.sentVia === "string" && msg.sentVia.startsWith("linked_") && msg.sentVia !== "linked_pending" && (
            <span title={t("hybridRoutedTooltip")}><Route className="h-2.5 w-2.5" /></span>
          )}
          {msg.fromMe && msg.sentVia === "official_fallback" && (
            <span title={t("hybridFallbackTooltip")}><RouteOff className="h-2.5 w-2.5" /></span>
          )}
          <span className="text-[10px]">
            {new Date(msg.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
            {msg.queue?.queue && ` - ${msg.queue.queue}`}
          </span>
          <AckIcon ack={msg.ack} fromMe={msg.fromMe} statusError={msg.statusError} />
        </div>

        {/* Barra de progresso de upload — só para a mensagem otimista local (id front-*)
            enquanto a mídia sobe. Some quando uploadProgress vira 100/undefined. Cores
            invertidas (primary-foreground) dentro da bolha fromMe para manter contraste
            sobre bg-primary; fora da bolha (sticker) usa o par primary/20 + primary. */}
        {typeof msg.uploadProgress === "number" && msg.uploadProgress < 100 && String(msg.id).startsWith("front-") && (
          <div className="mt-1 flex items-center gap-1.5">
            <div className={cn(
              "h-1 flex-1 rounded-full overflow-hidden",
              !isStickerMsg && msg.fromMe ? "bg-primary-foreground/25" : "bg-primary/20"
            )}>
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300 ease-out",
                  !isStickerMsg && msg.fromMe ? "bg-primary-foreground" : "bg-primary"
                )}
                style={{ width: `${Math.min(100, Math.max(0, msg.uploadProgress))}%` }}
              />
            </div>
            <span className={cn(
              "text-[10px] tabular-nums shrink-0",
              !isStickerMsg && msg.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {Math.round(Math.min(100, Math.max(0, msg.uploadProgress)))}%
            </span>
          </div>
        )}

        {/* Tentar novamente — apenas otimistas locais falhadas (id front-* com ack -1).
            Mensagens reais com statusError de webhook não ganham retry. */}
        {msg.ack === -1 && msg.fromMe && String(msg.id).startsWith("front-") && onRetryMessage && (
          <div className="mt-1 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("retry")}
              onClick={(e) => { e.stopPropagation(); onRetryMessage(msg); }}
              className={cn(
                "h-6 px-2 gap-1 text-[11px] font-medium",
                isStickerMsg
                  ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                  : "bg-destructive/20 text-primary-foreground hover:bg-destructive/30 hover:text-primary-foreground"
              )}
            >
              <RotateCcw className="h-3 w-3" /> {t("retry")}
            </Button>
          </div>
        )}
      </div>

      {!isSystem && <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={msg.fromMe ? "left" : "right"} align="start">
            {onReply && !isSystem && (
              <DropdownMenuItem onClick={() => onReply(msg)} disabled={isHybridChannel}>
                <Reply className="mr-2 h-4 w-4" /> {t("reply")}
              </DropdownMenuItem>
            )}
            {onReact && !isSystem && (
              <DropdownMenuItem onSelect={() => setEmojiPickerOpen(true)} disabled={isHybridChannel}>
                <SmilePlus className="mr-2 h-4 w-4" /> {t("react")}
              </DropdownMenuItem>
            )}
            {onForward && canForward && !isSystem && (
              <DropdownMenuItem onClick={() => onForward(msg)}>
                <Forward className="mr-2 h-4 w-4" /> {t("forward")}
              </DropdownMenuItem>
            )}
            {onForwardOtherChannel && canForward && !isSystem && (
              <DropdownMenuItem onClick={() => onForwardOtherChannel(msg)}>
                <Forward className="mr-2 h-4 w-4" /> {t("forwardOtherChannel")}
              </DropdownMenuItem>
            )}
            {onForwardPrivate && canForward && !isSystem && (
              <DropdownMenuItem onClick={() => onForwardPrivate(msg)}>
                <Forward className="mr-2 h-4 w-4" /> {t("forwardPrivateChat")}
              </DropdownMenuItem>
            )}
            {msg.fromMe && isEditableTextMessage && onEdit && !["dialog360", "gupshup", "waba"].includes(String(msg.channel || "").toLowerCase()) && (
              <DropdownMenuItem onClick={() => { setEditText(msg.body); setEditing(true); }}>
                <Pencil className="mr-2 h-4 w-4" /> {t("edit")}
              </DropdownMenuItem>
            )}
            {isTextMessage && msg.body && (
              <DropdownMenuItem onClick={() => {
                navigator.clipboard?.writeText(msg.body).catch(() => {});
              }}>
                <Copy className="mr-2 h-4 w-4" /> {t("copyText")}
              </DropdownMenuItem>
            )}
            {onStar && !isSystem && (
              <DropdownMenuItem onClick={() => onStar(msg)}>
                <Star className={cn("mr-2 h-4 w-4", msg.isStarred && "fill-yellow-400 text-yellow-400")} />
                {msg.isStarred ? t("unstar") : t("star")}
              </DropdownMenuItem>
            )}
            {onPin && !isSystem && (
              <DropdownMenuItem onClick={() => onPin(msg)}>
                <Pin className={cn("mr-2 h-4 w-4", msg.isPinned && "fill-blue-400 text-blue-400")} />
                {msg.isPinned ? t("unpin") : t("pin")}
              </DropdownMenuItem>
            )}
            {isTextMessage && msg.body && (
              <DropdownMenuItem onClick={handleAskAI}>
                <Bot className="mr-2 h-4 w-4" /> {t("askAI")}
              </DropdownMenuItem>
            )}
            {isTextMessage && msg.body && ticketId && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {translating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Languages className="mr-2 h-4 w-4" />
                  )}
                  {t("translate")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleTranslate("pt")}>{t("langPT")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTranslate("en")}>{t("langEN")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTranslate("es")}>{t("langES")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTranslate("fr")}>{t("langFR")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTranslate("de")}>{t("langDE")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTranslate("it")}>{t("langIT")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTranslate("zh")}>{t("langZH")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTranslate("ar")}>{t("langAR")}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {msg.mediaUrl && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => downloadFile(getMediaUrl(msg), msg.fileName || (msg.mediaUrl ? msg.mediaUrl.split(/[\\/]/).pop() : undefined) || "arquivo")}>
                  <Download className="mr-2 h-4 w-4" /> {t("download")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSaveToGallery} disabled={savingToGallery}>
                  {savingToGallery ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
                  {t("saveToGallery")}
                </DropdownMenuItem>
              </>
            )}
            {onDelete && msg.fromMe && !isSystem && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(msg)} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> {t("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
    </motion.div>

    {/* Emoji picker dialog — opened after dropdown closes to avoid nesting issues */}
    {onReact && (
      <Dialog open={emojiPickerOpen} onOpenChange={(o) => { setEmojiPickerOpen(o); if (!o) setEmojiCategory(0); }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogTitle className="sr-only">{t("chooseReaction")}</DialogTitle>
          {/* Category tabs */}
          <div className="flex border-b overflow-x-auto scrollbar-none pr-10">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={i}
                onClick={() => setEmojiCategory(i)}
                className={`flex-shrink-0 px-2 py-2 text-lg transition-colors ${i === emojiCategory ? "border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {/* Emoji grid */}
          <div className="grid grid-cols-8 gap-0.5 p-2 max-h-64 overflow-y-auto">
            {EMOJI_CATEGORIES[emojiCategory].emojis.map((e) => (
              <button
                key={e}
                onClick={() => { onReact(msg, e); setEmojiPickerOpen(false); }}
                className="h-9 w-9 rounded-md hover:bg-accent text-xl flex items-center justify-center transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    )}

    {/* Ask AI dialog */}
    <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4" /> {t("askAI")}
        </DialogTitle>
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground italic line-clamp-3">
            {msg.body}
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("aiLoading")}
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{aiResult}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}, arePropsEqual);
