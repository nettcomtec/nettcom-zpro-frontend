"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronsDown, ChevronsUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { toast } from "sonner";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";
import { MessageBubble } from "@/components/atendimento/message-bubble";
import type { Message } from "@/stores/ticket-store";

export interface SpyMessage {
  id?: number;
  body?: string;
  fromMe: boolean;
  createdAt: string;
  mediaType?: string;
  mediaUrl?: string;
  storageUrl?: string;
  isDeleted?: boolean;
  ticketId?: number;
}

export interface SpyLastTicket {
  id: number;
  channel?: string;
}

type TicketData = { messages?: SpyMessage[]; messagesOffLine?: SpyMessage[] };
type ChannelData = { tickets: Record<string, TicketData> };

// O painel replica o chat do atendimento: cada mensagem renderiza via MessageBubble
// (mesmos renderers de texto formatado, mídia, template, botões, lista, vcard, álbum,
// PIX etc.), com lightbox de imagem, popup de PDF/HTML e download de arquivo
// idênticos ao ticket.
function toBubbleMessage(msg: SpyMessage): Message {
  return {
    ...msg,
    mediaUrl: msg.storageUrl || msg.mediaUrl,
  } as unknown as Message;
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch {
    return "";
  }
}

function spySortTime(m: SpyMessage) {
  const v = m.createdAt;
  if (!v) return 0;
  const tt = new Date(v).getTime();
  return Number.isFinite(tt) ? tt : 0;
}

function extractSpyPage(data: { messages?: Record<string, ChannelData> } | undefined) {
  const list: SpyMessage[] = [];
  const ticketChannels: Record<number, string> = {};
  if (data?.messages) {
    Object.entries(data.messages).forEach(([channel, channelData]) => {
      Object.entries(channelData.tickets).forEach(([ticketId, ticketData]) => {
        const tid = Number(ticketId);
        ticketChannels[tid] = channel;
        if (ticketData.messages) {
          list.push(...ticketData.messages.map((m) => ({ ...m, ticketId: tid })));
        }
        if (ticketData.messagesOffLine) {
          list.push(...ticketData.messagesOffLine.map((m) => ({ ...m, ticketId: tid })));
        }
      });
    });
  }
  list.sort((a, b) => spySortTime(a) - spySortTime(b));
  return { list, ticketChannels };
}

export function useSpyMessages(open: boolean, contactId: number | null, onError: () => void) {
  const t = useTranslations("spyContactMessages");
  const [messages, setMessages] = useState<SpyMessage[]>([]);
  const [lastTicket, setLastTicket] = useState<SpyLastTicket | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);
  // Invalidates in-flight "carregar anteriores" quando o alvo troca/fecha
  const loadSeqRef = useRef(0);

  useEffect(() => {
    loadSeqRef.current += 1;
    pageRef.current = 1;
    setHasMore(false);
    setLoadingMore(false);
    if (!open || !contactId) {
      setMessages([]);
      setLastTicket(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/messagesContact/${contactId}`, { params: { pageNumber: 1 } });
        if (cancelled) return;
        const { list, ticketChannels } = extractSpyPage(data);
        setMessages(list);
        setHasMore(!!data?.hasMore);
        // lastTicket vem da página 1 (mais recente) — páginas antigas não mudam isso
        const lastWithTicket = [...list].reverse().find((m) => m.ticketId != null);
        setLastTicket(
          lastWithTicket?.ticketId != null
            ? { id: lastWithTicket.ticketId, channel: ticketChannels[lastWithTicket.ticketId] }
            : null
        );
      } catch {
        if (!cancelled) {
          toast.error(t("errorLoading"));
          onError();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId, t, onError]);

  const loadPrevious = React.useCallback(async () => {
    if (!contactId || loading || loadingMore || !hasMore) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    try {
      const { data } = await api.get(`/messagesContact/${contactId}`, { params: { pageNumber: nextPage } });
      if (loadSeqRef.current !== seq) return;
      const { list } = extractSpyPage(data);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id).filter((id) => id != null));
        const merged = [...prev, ...list.filter((m) => m.id == null || !seen.has(m.id))];
        merged.sort((a, b) => spySortTime(a) - spySortTime(b));
        return merged;
      });
      setHasMore(!!data?.hasMore && list.length > 0);
      pageRef.current = nextPage;
    } catch {
      if (loadSeqRef.current === seq) toast.error(t("errorLoading"));
    } finally {
      if (loadSeqRef.current === seq) setLoadingMore(false);
    }
  }, [contactId, loading, loadingMore, hasMore, t]);

  const appendMessage = React.useCallback((m: SpyMessage) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  return { messages, loading, loadingMore, hasMore, loadPrevious, lastTicket, appendMessage };
}

export function SpyMessagesPanel({
  contactName,
  messages,
  loading,
  loadingMore = false,
  hasMore = false,
  onLoadPrevious,
  compact = false,
}: {
  contactName?: string;
  messages: SpyMessage[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadPrevious?: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("spyContactMessages");
  const { isLiveMode } = useLiveMode();
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Distância do fundo salva antes de prepender mensagens antigas (mesmo padrão do ChatArea)
  const scrollAnchorRef = useRef<number | null>(null);

  const handleLoadPreviousClick = () => {
    const el = scrollRef.current;
    if (el) scrollAnchorRef.current = el.scrollHeight - el.scrollTop;
    onLoadPrevious?.();
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 60);
    setIsAtTop(scrollTop < 60);
  };

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const scrollToTop = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    if (loading) return;
    // Restaura a âncora depois de prepender mensagens antigas: o mesmo conteúdo
    // visível permanece em vista em vez de pular para o fim.
    if (scrollAnchorRef.current !== null) {
      const el = scrollRef.current;
      const distanceFromBottom = scrollAnchorRef.current;
      scrollAnchorRef.current = null;
      if (el) {
        el.scrollTop = el.scrollHeight - distanceFromBottom;
        handleScroll();
      }
      return;
    }
    if (messages.length === 0) return;
    const id = requestAnimationFrame(() => {
      scrollToBottom(false);
      handleScroll();
    });
    return () => cancelAnimationFrame(id);
  }, [loading, messages.length]);

  const ticketIds = React.useMemo(() => {
    const set = new Set<number>();
    for (const m of messages) {
      if (m.ticketId != null) set.add(m.ticketId);
    }
    return Array.from(set);
  }, [messages]);

  // Lista no formato do bubble memoizada: mantém referência estável p/ o memo do
  // MessageBubble e alimenta allMessages (agrupamento de álbum igual ao atendimento).
  const bubbleMessages = React.useMemo(() => messages.map(toBubbleMessage), [messages]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className={compact ? "px-3 pt-2 pb-1.5 border-b" : "pb-2 border-b"}>
        <div className={cn(compact ? "text-sm font-semibold truncate" : "text-base font-semibold", isLiveMode && "live-blur-text")}>
          {t("title", { name: contactName ?? "" })}
          {ticketIds.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t("ticketsCount", { count: ticketIds.length })}
            </span>
          )}
        </div>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 min-h-0 relative">
        {loading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                <Skeleton className={`h-10 rounded-lg ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">{t("noMessages")}</p>
        ) : (
          <>
          {hasMore && onLoadPrevious && (
            <div className="flex justify-center pb-1">
              <Button variant="ghost" size="sm" onClick={handleLoadPreviousClick} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {t("loadPrevious")}
              </Button>
            </div>
          )}
          {messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const showDate = !prev || formatDate(msg.createdAt) !== formatDate(prev.createdAt);
            const showTicket = !prev || prev.ticketId !== msg.ticketId;
            return (
              <React.Fragment key={`${msg.ticketId}-${idx}`}>
                {showDate && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground px-2">{formatDate(msg.createdAt)}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {showTicket && msg.ticketId != null && (
                  <div className="flex items-center justify-center py-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {t("ticketLabel", { id: msg.ticketId })}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={bubbleMessages[idx]}
                  allMessages={bubbleMessages}
                  onDelete={undefined}
                  onForward={undefined}
                  onReact={undefined}
                  onEdit={undefined}
                />
              </React.Fragment>
            );
          })}
          </>
        )}
      </div>
      {!loading && messages.length > 0 && (!isAtTop || !isAtBottom) && (
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
          {!isAtTop && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="pointer-events-auto h-9 w-9 rounded-full shadow-lg"
              onClick={() => scrollToTop(true)}
              title={t("scrollToTop")}
            >
              <ChevronsUp className="h-4 w-4" />
            </Button>
          )}
          {!isAtBottom && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="pointer-events-auto h-9 w-9 rounded-full shadow-lg"
              onClick={() => scrollToBottom(true)}
              title={t("scrollToBottom")}
            >
              <ChevronsDown className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function SpyContactMessagesDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number | null;
  contactName?: string;
}) {
  const handleError = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const { messages, loading, loadingMore, hasMore, loadPrevious } = useSpyMessages(open, contactId, handleError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 overflow-hidden" style={{ maxHeight: "80vh" }}>
        <DialogHeader className="sr-only">
          <DialogTitle>{contactName ?? ""}</DialogTitle>
        </DialogHeader>
        <SpyMessagesPanel
          contactName={contactName}
          messages={messages}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadPrevious={loadPrevious}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SpyContactMessagesPopover({
  contactId,
  contactName,
  children,
  side = "right",
  align = "start",
}: {
  contactId: number | null;
  contactName?: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const handleError = React.useCallback(() => setOpen(false), []);
  const { messages, loading, loadingMore, hasMore, loadPrevious } = useSpyMessages(open, contactId, handleError);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className="p-0 w-[420px] max-w-[95vw] h-[480px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        // Lightbox de imagem, popup de PDF e dropdown do MessageBubble renderizam em
        // portal FORA do popover — sem estes guards, focar/clicar dentro deles conta
        // como "outside" e fecha o popover, desmontando o dialog aberto junto.
        onFocusOutside={(e) => {
          if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"], [role="menu"], [role="alertdialog"]')) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"], [role="menu"], [role="alertdialog"]')) e.preventDefault();
        }}
      >
        <SpyMessagesPanel
          contactName={contactName}
          messages={messages}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadPrevious={loadPrevious}
          compact
        />
      </PopoverContent>
    </Popover>
  );
}
