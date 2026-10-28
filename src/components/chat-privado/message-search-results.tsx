"use client";

import React from "react";
import { FileText, Image as ImageIcon, Loader2, Mic, Users2, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/format";
import { splitFoldedMatches } from "@/lib/text-search";
import type { PrivateChatSearchResult } from "@/services/private-chat";
import type { PrivateChatSearchError } from "@/hooks/use-private-chat-message-search";

interface MessageSearchResultsProps {
  results: PrivateChatSearchResult[];
  tokens: string[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: PrivateChatSearchError;
  myUserId?: number;
  /** Lista global: mostra de qual conversa/equipe é cada resultado. */
  showConversation: boolean;
  /** Título da seção (só na lista global). */
  title?: string;
  onSelect: (result: PrivateChatSearchResult) => void;
  onLoadMore: () => void;
}

function resultTime(r: PrivateChatSearchResult): string {
  const d = new Date(r.createdAt || (r.timestamp ? Number(r.timestamp) : 0));
  if (isNaN(d.getTime()) || d.getTime() === 0) return "";
  if (d.toDateString() === new Date().toDateString()) return formatTime(d, { hour: "2-digit", minute: "2-digit" });
  return formatDate(d, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function MediaIcon({ type }: { type: string | null }) {
  if (!type || type === "chat") return null;
  const cls = "inline h-3 w-3 mr-1 -mt-0.5 shrink-0";
  if (type === "image") return <ImageIcon className={cls} />;
  if (type === "audio") return <Mic className={cls} />;
  if (type === "video") return <Video className={cls} />;
  return <FileText className={cls} />;
}

/** Resultados da busca nas mensagens do chat interno (lista lateral e busca dentro da conversa). */
export function MessageSearchResults({
  results, tokens, loading, loadingMore, hasMore, error, myUserId, showConversation, title, onSelect, onLoadMore,
}: MessageSearchResultsProps) {
  const t = useTranslations("chatPrivadoPage");

  return (
    <div className="p-1">
      {title && (
        <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
      )}
      {loading && results.length === 0 ? (
        !title && (
          <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("searchMessagesLoading")}
          </div>
        )
      ) : results.length === 0 && !error ? (
        <p className="px-2.5 py-3 text-xs text-muted-foreground">{t("searchMessagesEmpty")}</p>
      ) : (
        results.map((r) => {
          const isMe = myUserId != null && r.senderId === myUserId;
          const senderLabel = isMe ? t("you") : (r.conversation.isGroup || !showConversation ? (r.senderName || "") : "");
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r)}
              className="w-full flex items-start gap-3 p-2.5 rounded-lg transition-colors hover:bg-accent/50 text-left overflow-hidden"
            >
              {showConversation && (
                <Avatar className="h-9 w-9 shrink-0">
                  {r.conversation.profilePicture && <AvatarImage src={r.conversation.profilePicture} alt={r.conversation.name} />}
                  <AvatarFallback className={cn("text-xs", r.conversation.isGroup && "bg-primary/10 text-primary")}>
                    {r.conversation.isGroup ? <Users2 className="h-4 w-4" /> : getInitials(r.conversation.name || "?")}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {showConversation ? (
                    <p className="text-sm font-medium truncate flex-1 min-w-0">{r.conversation.name}</p>
                  ) : (
                    <p className="text-xs font-medium truncate flex-1 min-w-0">{senderLabel}</p>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">{resultTime(r)}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                  {showConversation && senderLabel && <span className="font-medium text-foreground/80">{senderLabel}: </span>}
                  <MediaIcon type={r.mediaType} />
                  {splitFoldedMatches(r.text, tokens).map((part, i) =>
                    part.match ? (
                      <mark key={i} className="rounded-sm bg-primary/15 font-semibold text-foreground">{part.value}</mark>
                    ) : (
                      <React.Fragment key={i}>{part.value}</React.Fragment>
                    )
                  )}
                </p>
              </div>
            </button>
          );
        })
      )}
      {error && (
        <p className="px-2.5 py-2 text-xs text-destructive">
          {error === "timeout" ? t("searchMessagesTimeout") : t("searchMessagesError")}
        </p>
      )}
      {hasMore && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("searchMessagesLoadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
