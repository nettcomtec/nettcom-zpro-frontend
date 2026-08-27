"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  CheckCircle2,
  Info,
  Clock,
  Wifi,
  WifiOff,
  Plus,
  Minus,
  Ticket,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { fetchMyAuditLogs, type AuditLog } from "@/services/audit-log";

interface ActivityLogProps {
  open: boolean;
  onClose: () => void;
}

function getIconAndColor(action: string, method: string): { Icon: React.ElementType; color: string } {
  if (action === "session_connected" || (method === "POST" && action?.includes("connect")))
    return { Icon: Wifi, color: "text-emerald-500" };
  if (action === "session_disconnected" || action?.includes("disconnect"))
    return { Icon: WifiOff, color: "text-red-500" };
  if (method === "DELETE")
    return { Icon: Minus, color: "text-red-400" };
  if (method === "POST")
    return { Icon: Plus, color: "text-sky-500" };
  if (action?.includes("ticket") && method === "PUT")
    return { Icon: Ticket, color: "text-amber-500" };
  if (action?.includes("close") || action?.includes("resolv"))
    return { Icon: CheckCircle2, color: "text-emerald-500" };
  return { Icon: Info, color: "text-muted-foreground" };
}

function formatActivity(log: AuditLog): { title: string; description: string } {
  const entity = log.entity || log.path?.split("/").filter(Boolean)[0] || "—";
  const id = log.entityId ? ` #${log.entityId}` : "";
  const title = `${log.method} ${entity}${id}`;
  const description = log.path;
  return { title, description };
}

const PAGE_SIZE = 20;

export function ActivityLog({ open, onClose }: ActivityLogProps) {
  const t = useTranslations("activityLog");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchMyAuditLogs(1, PAGE_SIZE);
      setLogs(data.logs);
      setCount(data.count);
      setPage(1);
      setHasMore(data.hasMore);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async (nextPage: number) => {
    setLoadingMore(true);
    try {
      const { data } = await fetchMyAuditLogs(nextPage, PAGE_SIZE);
      setLogs((prev) => [...prev, ...data.logs]);
      setPage(nextPage);
      setHasMore(data.hasMore);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
    else { setLogs([]); setPage(1); setHasMore(false); }
  }, [open, load]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore(page + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, page, loadMore]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.div
            className="fixed right-0 top-0 z-50 h-full w-80 bg-background border-l shadow-2xl flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-sm">{t("title")}</h2>
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={load}
                        disabled={loading}
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", loading && "animate-spin")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("refresh")}</TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onClose}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TooltipProvider>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Clock className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs">{t("empty")}</p>
                </div>
              ) : (
                <div className="p-3 space-y-1">
                  {logs.map((log) => {
                    const { Icon, color } = getIconAndColor(log.action, log.method);
                    const { title, description } = formatActivity(log);
                    return (
                      <div
                        key={log.id}
                        className="flex gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className={cn("mt-0.5 shrink-0", color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{description}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {/* Sentinel para infinite scroll */}
                  <div ref={sentinelRef} className="h-1" />
                  {loadingMore && (
                    <div className="flex items-center justify-center py-3 text-muted-foreground gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="text-[11px]">{t("loadingMore")}</span>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
            <div className="p-3 border-t">
              <p className="text-[10px] text-center text-muted-foreground">
                {t("footer", { count })}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
