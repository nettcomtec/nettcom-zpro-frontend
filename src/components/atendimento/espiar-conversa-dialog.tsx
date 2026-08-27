"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "@/components/atendimento/message-bubble";
import { fetchMessages } from "@/services/messages";
import type { Message } from "@/stores/ticket-store";
import { LogIn, XCircle, Loader2, ChevronsDown, ChevronsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";

export interface TicketForSpy {
  id: number;
  contact?: { name?: string };
  status?: string;
}

function normalizeMessage(m: Record<string, unknown>): Message {
  // Spread original payload so renderers that depend on fields like dataJson,
  // user, mediaName, isStarred, albumId, channel, emailMetadata, etc.
  // (template/album/webmail/etc.) keep working in the spy dialog.
  return {
    ...(m as unknown as Message),
    id: String(m.id ?? m.messageId ?? ""),
    body: String(m.body ?? ""),
    read: !!(m.read ?? m.ack !== undefined),
    createdAt: (m.createdAt ?? m.timestamp ?? new Date().toISOString()) as string,
    fromMe: !!m.fromMe,
    quotedMsg: (m.quotedMsg as Message["quotedMsg"]) ?? null,
  };
}

export function EspiarConversaDialog({
  open,
  onOpenChange,
  ticket,
  onAtender,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketForSpy | null;
  onAtender?: (t: TicketForSpy) => void;
  onResolve?: (t: TicketForSpy) => void;
}) {
  const t = useTranslations("espiarConversa");
  const { isLiveMode } = useLiveMode();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1);
  // Invalidates in-flight "carregar anteriores" quando o dialog troca de ticket/fecha
  const loadSeqRef = useRef(0);
  // Distância do fundo salva antes de prepender mensagens antigas (mesmo padrão do ChatArea)
  const scrollAnchorRef = useRef<number | null>(null);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 60);
    setIsAtTop(scrollTop < 60);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    loadSeqRef.current += 1;
    pageRef.current = 1;
    scrollAnchorRef.current = null;
    setHasMore(false);
    setLoadingMore(false);
    if (!open || !ticket?.id) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        const { data } = await fetchMessages(ticket.id, { pageNumber: 1, markAsRead: false });
        if (cancelled) return;
        const list = ((data?.messages ?? []) as Record<string, unknown>[]).map(normalizeMessage);
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(list);
        setHasMore(!!data?.hasMore);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, ticket?.id]);

  const handleLoadPrevious = async () => {
    if (!ticket?.id || loading || loadingMore || !hasMore) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    if (scrollRef.current) {
      scrollAnchorRef.current = scrollRef.current.scrollHeight - scrollRef.current.scrollTop;
    }
    const nextPage = pageRef.current + 1;
    try {
      const { data } = await fetchMessages(ticket.id, { pageNumber: nextPage, markAsRead: false });
      if (loadSeqRef.current !== seq) return;
      const list = ((data?.messages ?? []) as Record<string, unknown>[]).map(normalizeMessage);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id).filter(Boolean));
        const merged = [...prev, ...list.filter((m) => !m.id || !seen.has(m.id))];
        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return merged;
      });
      setHasMore(!!data?.hasMore && list.length > 0);
      pageRef.current = nextPage;
    } catch {
      if (loadSeqRef.current === seq) scrollAnchorRef.current = null;
    } finally {
      if (loadSeqRef.current === seq) setLoadingMore(false);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Restaura a âncora depois de prepender mensagens antigas: o mesmo conteúdo
    // visível permanece em vista em vez de pular para o fim.
    if (scrollAnchorRef.current !== null) {
      const distanceFromBottom = scrollAnchorRef.current;
      scrollAnchorRef.current = null;
      el.scrollTop = el.scrollHeight - distanceFromBottom;
      handleScroll();
      return;
    }
    if (!loading && messages.length > 0) {
      el.scrollTop = el.scrollHeight;
      handleScroll();
    }
  }, [loading, messages.length]);

  // Escuta socket para novas mensagens do ticket sendo espionado
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  useEffect(() => {
    if (!open || !ticket?.id || !tenantId) return;
    const socket = getSocket();
    const channel = `${tenantId}:ticketList`;

    const handler = (data: { type: string; payload: Record<string, unknown> }) => {
      if (data.type !== "chat:create") return;
      const payload = data.payload as {
        ticketId?: number;
        ticket?: { id?: number };
        id?: string | number;
        body?: string;
        fromMe?: boolean;
        mediaUrl?: string;
        storageUrl?: string;
        mediaType?: string;
        fileName?: string;
        quotedMsg?: unknown;
        ack?: number;
        isForwarded?: boolean;
        isStatusReply?: boolean;
        createdAt?: string;
      };
      const msgTicketId = payload.ticketId ?? (payload.ticket as { id?: number } | undefined)?.id;
      if (msgTicketId !== ticket.id) return;

      const newMsg: Message = normalizeMessage({
        id: payload.id,
        body: payload.body,
        fromMe: payload.fromMe,
        mediaUrl: payload.mediaUrl,
        storageUrl: payload.storageUrl,
        mediaType: payload.mediaType,
        fileName: payload.fileName,
        quotedMsg: payload.quotedMsg,
        ack: payload.ack,
        isForwarded: payload.isForwarded,
        isStatusReply: payload.isStatusReply,
        createdAt: payload.createdAt ?? new Date().toISOString(),
      });

      setMessages((prev) => {
        if (prev.some((m) => m.id && m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      // Auto-scroll se já estava no final
      if (isAtBottom) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        });
      }
    };

    socket.on(channel, handler);
    return () => { socket.off(channel, handler); };
  }, [open, ticket?.id, tenantId, isAtBottom]);

  const handleAtender = () => {
    if (ticket && onAtender) onAtender(ticket);
    onOpenChange(false);
  };

  const handleResolve = () => {
    if (ticket && onResolve) onResolve(ticket);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle>
              {t("title")} #{ticket?.id ?? ""}
              {ticket?.contact?.name && (
                <span className={cn("text-muted-foreground font-normal ml-1", isLiveMode && "live-blur-text")}>
                  — {ticket.contact.name}
                </span>
              )}
            </DialogTitle>
            {ticket?.status === "pending" && (onResolve || onAtender) && (
              <div className="flex items-center gap-2 shrink-0">
                {onResolve && (
                  <Button size="sm" variant="destructive" onClick={handleResolve}>
                    <XCircle className="h-4 w-4 mr-1.5" />
                    {t("resolve")}
                  </Button>
                )}
                {onAtender && (
                  <Button size="sm" onClick={handleAtender}>
                    <LogIn className="h-4 w-4 mr-1.5" />
                    {t("attend")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative flex-1 min-h-[200px] max-h-[50vh] rounded-md border p-3 overflow-y-auto"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">{t("loading")}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm">{t("noMessages")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {hasMore && (
                <div className="flex justify-center pb-1">
                  <Button variant="ghost" size="sm" onClick={handleLoadPrevious} disabled={loadingMore}>
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    {t("loadPrevious")}
                  </Button>
                </div>
              )}
              {messages.map((msg, index) => {
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const msgDateStr = msg.createdAt ? new Date(msg.createdAt).toLocaleDateString("pt-BR") : "";
                const prevMsgDateStr = prevMsg?.createdAt ? new Date(prevMsg.createdAt).toLocaleDateString("pt-BR") : "";
                const isNewDate = !prevMsg || msgDateStr !== prevMsgDateStr;
                return (
                  <React.Fragment key={msg.id ? `${msg.id}-${index}` : `msg-${index}`}>
                    {isNewDate && msgDateStr && (
                      <div className="flex items-center gap-3 my-3 mx-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap px-2 bg-background">
                          {msgDateStr}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      onDelete={undefined}
                      onForward={undefined}
                      onReact={undefined}
                      onEdit={undefined}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {(!isAtTop || !isAtBottom) && messages.length > 0 && (
            <div className="sticky bottom-2 ml-auto w-fit flex flex-col items-end gap-2 pointer-events-none z-10">
              {!isAtTop && (
                <button
                  type="button"
                  onClick={scrollToTop}
                  className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-opacity"
                >
                  <ChevronsUp className="h-4 w-4" />
                </button>
              )}
              {!isAtBottom && (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-opacity"
                >
                  <ChevronsDown className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
