"use client";

import React, { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, ArrowRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTicketListPreview } from "@/lib/template-preview";
import { searchMessages as searchMessagesApi } from "@/services/messages";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";

interface GlobalSearchTicket {
  id: number;
  whatsappId?: number;
  channel?: string;
  status?: string;
  isGroup?: boolean;
  lastMessage?: string;
  contact?: { id?: number; name?: string; number?: string };
}

interface GlobalSearchTicketResult {
  ticket: GlobalSearchTicket;
  lastMessageTimestamp: string;
}

export function GlobalMessageSearchDialog({
  open,
  onOpenChange,
  onSpy,
  onAtender,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpy: (ticket: GlobalSearchTicket) => void;
  onAtender: (ticket: GlobalSearchTicket) => void;
}) {
  const t = useTranslations("globalMessageSearch");
  // Chaves de preview de mídia/noMessages vivem no namespace do atendimento
  const tAtd = useTranslations("atendimentoChatExtra");
  const { isLiveMode } = useLiveMode();
  const [searchTerm, setSearchTerm] = useState("");
  const [tickets, setTickets] = useState<GlobalSearchTicketResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const uniqueTickets = React.useMemo(() => {
    const seen = new Set<number>();
    return (tickets || [])
      .filter((t) => t && t.ticket && t.ticket.whatsappId)
      .filter((t) => {
        if (seen.has(t.ticket.id)) return false;
        seen.add(t.ticket.id);
        return true;
      });
  }, [tickets]);

  const formatTimestamp = (ts: string) => {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const formatStatus = (status?: string) => {
    if (!status) return t("unknown");
    const known = ["open", "pending", "closed", "schedule"];
    if (known.includes(status)) return t(`statusMap.${status}` as never);
    return status;
  };

  const formatIsGroup = (isGroup?: boolean) => (isGroup ? t("isGroup.yes") : t("isGroup.no"));

  const buscar = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    setPageNumber(1);
    setSearched(true);
    try {
      const { data } = await searchMessagesApi({ searchTerm: searchTerm.trim(), pageNumber: 1 });
      setTickets((data?.tickets as GlobalSearchTicketResult[]) || []);
      setHasMore(!!data?.hasMore);
    } catch {
      setTickets([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    const next = pageNumber + 1;
    setLoadingMore(true);
    try {
      const { data } = await searchMessagesApi({ searchTerm: searchTerm.trim(), pageNumber: next });
      setTickets((prev) => [...prev, ...((data?.tickets as GlobalSearchTicketResult[]) || [])]);
      setHasMore(!!data?.hasMore);
      setPageNumber(next);
    } catch {
      // silencioso
    } finally {
      setLoadingMore(false);
    }
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const pct = el.scrollTop / (el.scrollHeight - el.clientHeight);
    if (pct >= 0.85 && hasMore && !loadingMore) {
      loadMore();
    }
  };

  const reset = () => {
    setSearchTerm("");
    setTickets([]);
    setPageNumber(1);
    setHasMore(false);
    setSearched(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl max-w-[95vw] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" /> {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("searchPlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) buscar();
              }}
            />
            <Button onClick={buscar} disabled={loading || !searchTerm.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("searchButton")}
            </Button>
          </div>

          {loading && pageNumber === 1 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <span className="text-sm">{t("loadingMessages")}</span>
            </div>
          ) : (
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="max-h-[400px] overflow-y-auto rounded-md border divide-y"
            >
              {searched && uniqueTickets.length === 0 && !loading && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {t("noResults")}
                </div>
              )}
              {uniqueTickets.map((tx) => (
                <div
                  key={`${tx.ticket.id}-${tx.lastMessageTimestamp}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-medium truncate">
                      {t("atendimento")}#{tx.ticket.id}
                      {tx.ticket.contact?.name ? (
                        <>
                          {" — "}
                          <span className={cn(isLiveMode && "live-blur-text")}>{tx.ticket.contact.name}</span>
                        </>
                      ) : ""}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t("messageDate")}{formatTimestamp(tx.lastMessageTimestamp)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t("channel")} #{tx.ticket.whatsappId} · {tx.ticket.channel || t("unknown")}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t("status")}{formatStatus(tx.ticket.status)} · {t("group")}{formatIsGroup(tx.ticket.isGroup)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t("lastMessage")}
                      <span className={cn(isLiveMode && "live-blur-text")}>{getTicketListPreview(tx.ticket.lastMessage, undefined, tAtd)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("spy")}
                      onClick={() => onSpy(tx.ticket)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("open")}
                      onClick={() => onAtender(tx.ticket)}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {loadingMore && (
                <div className="flex items-center justify-center py-3 text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("loadingMoreMessages")}
                </div>
              )}
              {hasMore && !loadingMore && uniqueTickets.length > 0 && (
                <div className="flex items-center justify-center py-2">
                  <Button variant="ghost" size="sm" onClick={loadMore} className="text-xs">
                    {t("loadMoreButton")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("closeButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
