"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCheck, FileText, Image as ImageIcon, Inbox, Loader2, Mic, Paperclip, Sticker, Users, Video,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/format";
import type { UnreadPreviewItem } from "@/services/private-chat";

/**
 * Lista das conversas do Chat Privado com mensagens não lidas (`GET /chat-privado/unread-preview`).
 * Renderizador único: serve ao ícone do topo (`internal-chat-indicator.tsx`) e à linha do chat
 * dentro do sino. Quem chama busca os itens e decide o que "abrir" e "marcar como lida" fazem.
 */

/** Chave do item: `u:<id>` (conversa direta) ou `g:<id>` (equipe) — a mesma do aviso fixo. */
export function internalChatItemKey(item: Pick<UnreadPreviewItem, "type" | "peerId">): string {
  return `${item.type === "group" ? "g" : "u"}:${item.peerId}`;
}

type MediaKind = "image" | "video" | "audio" | "sticker" | "document" | "file";

const MEDIA_LABEL_KEY: Record<MediaKind, string> = {
  image: "mediaImage",
  video: "mediaVideo",
  audio: "mediaAudio",
  sticker: "mediaSticker",
  document: "mediaDocument",
  file: "mediaFile",
};

const MEDIA_ICON: Record<MediaKind, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Mic,
  sticker: Sticker,
  document: FileText,
  file: Paperclip,
};

// O chat privado grava em `mediaType` o prefixo do mimetype do arquivo enviado
// ("image", "video", "audio", "application", "text"...) e "chat" na mensagem de texto.
// Em mensagem com arquivo o `text` é o nome original do arquivo.
function mediaKindOf(mediaType: string | null | undefined): MediaKind | null {
  const mt = String(mediaType ?? "").trim().toLowerCase();
  if (!mt || mt === "chat") return null;
  if (mt === "sticker") return "sticker";
  if (mt.startsWith("image")) return "image";
  if (mt.startsWith("video")) return "video";
  if (mt.startsWith("audio") || mt === "ptt" || mt === "voice") return "audio";
  if (mt.startsWith("application") || mt.includes("document") || mt.includes("pdf") || mt.startsWith("text")) {
    return "document";
  }
  return "file";
}

/**
 * Texto curto de uma mensagem do Chat Privado: o texto, ou o rótulo da mídia (traduzido por
 * `atendimentoChatExtra`). Documento/arquivo mostram "Rótulo · nome" (o nome ajuda); em foto,
 * vídeo, áudio e figurinha o nome do arquivo é ruído. Serve à lista e ao aviso fixo.
 */
export function internalChatMessagePreview(
  text: string | null | undefined,
  mediaType: string | null | undefined,
  tMedia: (key: string) => string,
): string {
  const kind = mediaKindOf(mediaType);
  const clean = (text || "").trim();
  if (!kind) return clean;
  const label = tMedia(MEDIA_LABEL_KEY[kind]);
  return (kind === "document" || kind === "file") && clean ? `${label} · ${clean}` : label;
}

// Hoje = hora; antes = data curta (com o ano só quando é outro ano). Sempre no idioma da tela.
function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  ) {
    return formatTime(d, { hour: "2-digit", minute: "2-digit" });
  }
  return formatDate(
    d,
    d.getFullYear() === now.getFullYear()
      ? { day: "2-digit", month: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "2-digit" },
  );
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("").toUpperCase();
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
}

export interface InternalChatUnreadListProps {
  items: UnreadPreviewItem[];
  loading?: boolean;
  error?: boolean;
  /** Clique na linha. */
  onOpen: (item: UnreadPreviewItem) => void;
  /** Com ele, cada linha ganha o botão "Marcar como lida" (o clique nele não abre a conversa). */
  onMarkRead?: (item: UnreadPreviewItem) => void;
  /** Chave (`internalChatItemKey`) do item com ação em andamento: botão desabilitado e girando. */
  busyKey?: string | null;
  /** Texto da lista vazia no lugar do padrão ("Nenhuma mensagem não lida"). */
  emptyText?: ReactNode;
  /** Linhas menores (lista aninhada dentro do sino). */
  compact?: boolean;
  className?: string;
}

export function InternalChatUnreadList({
  items,
  loading = false,
  error = false,
  onOpen,
  onMarkRead,
  busyKey = null,
  emptyText,
  compact = false,
  className,
}: InternalChatUnreadListProps) {
  const t = useTranslations("layoutHeader");
  const tMedia = useTranslations("atendimentoChatExtra");
  const tChat = useTranslations("useSocketChat");

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-1", className)} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("flex items-center gap-2", compact ? "px-2 py-1.5" : "px-2 py-2")}>
            <Skeleton className={cn("shrink-0 rounded-full", compact ? "h-7 w-7" : "h-9 w-9")} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p
        role="alert"
        className={cn(
          "text-muted-foreground",
          compact ? "px-2 py-2 text-xs" : "px-3 py-6 text-center text-sm",
          className,
        )}
      >
        {t("internalChat.loadError")}
      </p>
    );
  }

  if (items.length === 0) {
    if (compact) {
      return (
        <p className={cn("px-2 py-2 text-xs text-muted-foreground", className)}>
          {emptyText ?? t("internalChat.empty")}
        </p>
      );
    }
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-8 text-center text-muted-foreground", className)}>
        <Inbox className="h-8 w-8 opacity-40" aria-hidden="true" />
        <span className="text-sm">{emptyText ?? t("internalChat.empty")}</span>
      </div>
    );
  }

  const markReadLabel = t("internalChat.markRead");
  const groupLabel = t("internalChat.groupLabel");

  const list = (
    <ul className={cn("flex flex-col gap-0.5", className)}>
      {items.map((item) => {
        const key = internalChatItemKey(item);
        const isGroup = item.type === "group";
        const name = (item.name || "").trim() || (isGroup ? groupLabel : tChat("defaultSender"));
        const kind = mediaKindOf(item.lastMessage?.mediaType);
        const MediaIcon = kind ? MEDIA_ICON[kind] : null;
        const preview = internalChatMessagePreview(item.lastMessage?.text, item.lastMessage?.mediaType, tMedia);
        const when = formatWhen(item.lastMessage?.createdAt);
        const count = Number(item.unreadCount) || 0;
        const busy = busyKey != null && busyKey === key;

        return (
          <li key={key} className="flex items-center gap-1 rounded-md transition-colors hover:bg-muted/60">
            <button
              type="button"
              onClick={() => onOpen(item)}
              className={cn(
                "flex flex-1 min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                compact ? "px-2 py-1.5" : "px-2 py-2",
              )}
            >
              <Avatar className={cn("shrink-0", compact ? "h-7 w-7" : "h-9 w-9")}>
                {item.avatarUrl && <AvatarImage src={item.avatarUrl} alt={name} />}
                <AvatarFallback className={compact ? "text-[10px]" : "text-xs"}>{initialsOf(name)}</AvatarFallback>
              </Avatar>
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    {isGroup && (
                      <span title={groupLabel} className="inline-flex shrink-0 text-muted-foreground">
                        <Users className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
                        <span className="sr-only">{groupLabel}</span>
                      </span>
                    )}
                    <span className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>{name}</span>
                  </span>
                  {when && (
                    <span className={cn("shrink-0 text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}>
                      {when}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "flex flex-1 min-w-0 items-center gap-1 text-muted-foreground",
                      compact ? "text-[11px]" : "text-xs",
                    )}
                  >
                    {MediaIcon && <MediaIcon className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    <span className="min-w-0 line-clamp-1 break-words">{preview}</span>
                  </span>
                  {count > 0 && (
                    <span className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-blue-500/15 px-1 text-[10px] font-semibold text-blue-500">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </span>
              </span>
            </button>
            {onMarkRead && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={markReadLabel}
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onMarkRead(item);
                    }}
                    className={cn(
                      "mr-1 inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-60",
                      compact ? "h-7 w-7" : "h-8 w-8",
                    )}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCheck className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">{markReadLabel}</TooltipContent>
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>
  );

  // Provider próprio: a lista pode ser montada fora do provider do topo.
  return onMarkRead ? <TooltipProvider delayDuration={300}>{list}</TooltipProvider> : list;
}
