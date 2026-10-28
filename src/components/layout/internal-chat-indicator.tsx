"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCheck, Loader2, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePageAccess } from "@/hooks/use-page-access";
import { useChatStore } from "@/stores/chat-store";
import { INTERNAL_CHAT_PATH, internalChatHref } from "@/lib/internal-chat-link";
import {
  fetchChatUnreadTotal,
  fetchUnreadPreview,
  markAsRead,
  type UnreadPreviewItem,
} from "@/services/private-chat";
import { InternalChatUnreadList, internalChatItemKey } from "@/components/layout/internal-chat-unread-list";

/** Quantas conversas a lista do ícone mostra (teto da rota de prévia). */
const PREVIEW_LIMIT = 20;

/**
 * Ícone do Chat Privado no topo: contador azul (separado do sino, que continua somando o
 * chat) e lista das conversas com não lidas. Sem acesso ao Chat Privado (inclusive
 * superadmin) não renderiza nada — a casca existe para os hooks ficarem no componente de
 * dentro: o acesso muda no meio da sessão pelo refresh de 30 s do usuário.
 */
export function InternalChatIndicator({ className }: { className?: string }) {
  const canAccess = usePageAccess("chat-privado");
  if (!canAccess) return null;
  return <InternalChatIndicatorContent className={className} />;
}

function InternalChatIndicatorContent({ className }: { className?: string }) {
  const t = useTranslations("layoutHeader");
  const router = useRouter();
  const unreadCount = useChatStore((s) => s.unreadCount);
  const setUnreadCount = useChatStore((s) => s.setUnreadCount);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UnreadPreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // Este componente só existe com acesso (a casca o desmonta quando o acesso cai):
  // montado = com acesso. Resposta que chega depois disso não regrava a contagem.
  const aliveRef = useRef(false);
  // Só a carga mais recente vale (abrir, fechar e abrir de novo antes da resposta).
  const loadSeqRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Total e lista juntos: a decisão "contagem > 0 com lista vazia" usa os dois da mesma carga.
  const load = useCallback(() => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(false);
    Promise.allSettled([fetchChatUnreadTotal(), fetchUnreadPreview(PREVIEW_LIMIT)]).then(([totalRes, previewRes]) => {
      if (!aliveRef.current || seq !== loadSeqRef.current) return;
      if (totalRes.status === "fulfilled") setUnreadCount(totalRes.value);
      if (previewRes.status === "fulfilled") {
        const list = previewRes.value?.data?.items;
        setItems(Array.isArray(list) ? list : []);
      } else {
        setItems([]);
        setError(true);
      }
      setLoading(false);
    });
  }, [setUnreadCount]);

  // Carrega só ao abrir: mensagem nova com a lista aberta atualiza o número, não a lista.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) load();
  };

  const handleOpenItem = (item: UnreadPreviewItem) => {
    setOpen(false);
    router.push(internalChatHref({ type: item.type, peerId: item.peerId }));
  };

  // O servidor avisa a leitura pelo socket: o aviso fixo some e o total é conferido de novo.
  const handleMarkRead = (item: UnreadPreviewItem) => {
    const key = internalChatItemKey(item);
    const remaining = items.filter((i) => internalChatItemKey(i) !== key);
    setItems(remaining);
    const current = useChatStore.getState().unreadCount;
    const nextCount = Math.max(0, current - (Number(item.unreadCount) || 0));
    setUnreadCount(nextCount);
    markAsRead(item.peerId, item.type === "group")
      .then(() => {
        // Lista esgotada com não lidas sobrando (mais de 20 conversas): busca as próximas.
        if (aliveRef.current && remaining.length === 0 && nextCount > 0) load();
      })
      .catch(() => {
        if (!aliveRef.current) return;
        toast.error(t("internalChat.markReadError"));
        load();
      });
  };

  // Conversa por conversa, com a mesma rota de abrir a conversa: a rota "marcar tudo" de
  // backend anterior a 07/10/2026 marcava como lido o chat da EMPRESA inteira, e o front não
  // sabe a versão do backend. Até 5 voltas de 20 conversas; o servidor avisa os outros
  // aparelhos de cada leitura.
  const handleMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    // Carga ainda no ar (clique logo ao abrir) não traz de volta o que está sendo lido.
    loadSeqRef.current++;
    setLoading(false);
    setError(false);
    let batch = items;
    let failed = false;
    try {
      for (let round = 0; round < 5 && batch.length > 0 && !failed; round++) {
        setItems([]);
        const current = useChatStore.getState().unreadCount;
        const batchCount = batch.reduce((sum, i) => sum + (Number(i.unreadCount) || 0), 0);
        setUnreadCount(Math.max(0, current - batchCount));
        for (const item of batch) {
          try {
            await markAsRead(item.peerId, item.type === "group");
          } catch {
            failed = true;
            break;
          }
        }
        if (failed || !aliveRef.current) break;
        const next = await fetchUnreadPreview(PREVIEW_LIMIT).catch(() => null);
        batch = Array.isArray(next?.data?.items) ? next!.data.items : [];
      }
    } finally {
      if (aliveRef.current) {
        setMarkingAll(false);
        if (failed) toast.error(t("internalChat.markReadError"));
        // Total e lista do servidor: o que sobrou (mais de 100 conversas, falha) aparece de novo.
        load();
      }
    }
  };

  const handleOpenAll = () => {
    setOpen(false);
    router.push(INTERNAL_CHAT_PATH);
  };

  const hasUnread = unreadCount > 0;
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  const label = hasUnread
    ? t("internalChat.tooltipUnread", { count: unreadCount })
    : t("internalChat.title");
  const emptyText = hasUnread ? t("internalChat.emptyButCount") : undefined;

  return (
    <TooltipProvider delayDuration={300}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                className={cn("relative h-9 w-9", className)}
              >
                <MessageCircle className={cn("h-4 w-4", hasUnread && "text-blue-500")} />
                {hasUnread && (
                  <span className="pointer-events-none absolute -top-1 -right-1 inline-flex" aria-hidden="true">
                    <span className="absolute inset-0 rounded-full bg-blue-400 opacity-75 motion-safe:animate-ping" />
                    <Badge
                      variant="info"
                      className="relative h-4 min-w-[16px] justify-center rounded-full px-1 text-[9px]"
                    >
                      {badgeText}
                    </Badge>
                  </span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          {!open && <TooltipContent side="bottom">{label}</TooltipContent>}
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="w-[calc(100vw-1rem)] max-w-80 sm:w-80 p-0 overflow-hidden"
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-semibold">{t("internalChat.title")}</span>
              </div>
              {hasUnread && (
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {t("internalChat.unreadSummary", { count: unreadCount })}
                </p>
              )}
              <p className="text-[11px] leading-snug text-muted-foreground">{t("internalChat.help")}</p>
            </div>
            <button
              type="button"
              aria-label={t("notifications.close")}
              onClick={() => setOpen(false)}
              className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Conversas */}
          <div className="max-h-[min(360px,55vh)] overflow-y-auto p-1.5">
            <InternalChatUnreadList
              items={items}
              loading={loading}
              error={error}
              onOpen={handleOpenItem}
              onMarkRead={handleMarkRead}
              emptyText={emptyText}
            />
          </div>

          {/* Rodapé */}
          <div className="flex flex-wrap items-center gap-1 border-t px-2 py-2">
            {/* Marca as conversas da lista; sem lista não há o que marcar. */}
            {hasUnread && (items.length > 0 || markingAll) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAll}
                disabled={markingAll}
                className="h-8 gap-1.5 px-2 text-xs"
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t("internalChat.markAllRead")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenAll}
              className="ml-auto h-8 px-2 text-xs text-primary hover:text-primary"
            >
              {t("internalChat.openAll")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
