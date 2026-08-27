"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, UserPlus, X, Loader2, Send, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { updateTicket } from "@/services/tickets";
import type { ExistingOpenTicket } from "@/lib/check-existing-open-ticket";

/**
 * Dialog exibido quando o operador tenta iniciar conversa avulsa para contato
 * que já possui ticket aberto/pending com OUTRO operador — no mesmo canal ou,
 * quando o tenant tem crossChannelTicketCheck ligado, em QUALQUER canal WhatsApp.
 *
 * Regras:
 * - admin/super/superadmin → Cancelar + Abrir + Assumir
 * - user comum não restrito → Cancelar + Abrir (somente visualizar)
 * - user comum restrito (NotViewAssignedTickets || restrictedUser) → só Cancelar + aviso
 * - Quando o ticket está em OUTRO canal (cross-canal) e onProceed é fornecido,
 *   exibe também "Enviar mesmo assim neste canal" (prossegue no canal alvo).
 * - proceedMode muda o rótulo/ícone do botão de prosseguir conforme o fluxo:
 *   "send" (avulsa/criação, default) e "accept" (aceitar pendente).
 * - O MESMO canal nunca ganha botão de prosseguir aqui: nesses dois fluxos o
 *   backend recusa a duplicata com 409 antes de criar. A reabertura, que é o
 *   único caso em que a duplicata no mesmo canal é decisão do operador, tem
 *   diálogo próprio (components/atendimento/reopen-confirm-dialog).
 */
export function ExistingTicketDialog({
  open,
  onOpenChange,
  ticket,
  isRestrictedUser,
  notViewAssignedTickets,
  targetWhatsappId,
  onProceed,
  proceedMode = "send",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ticket: ExistingOpenTicket | null;
  isRestrictedUser: boolean;
  notViewAssignedTickets: boolean;
  targetWhatsappId?: number | null;
  onProceed?: () => void;
  proceedMode?: "send" | "accept";
}) {
  const t = useTranslations("existingTicket");
  const router = useRouter();
  const { user } = useAuthStore();
  const [taking, setTaking] = React.useState(false);

  if (!ticket) return null;

  const profile = user?.profile ?? "";
  const isAdminLike = profile === "admin" || profile === "super" || profile === "superadmin";
  const restricted = isRestrictedUser || (notViewAssignedTickets && profile === "user");
  const canOpen = !restricted;
  const canTake = isAdminLike;

  // Canal do ticket encontrado x canal alvo da ação. `sameChannel` vem do backend
  // (pré-check batelado) e é a fonte primária; o comparativo com targetWhatsappId
  // cobre os chamadores que não populam a flag (fluxo de criação/avulsa).
  const isSameChannel =
    ticket.sameChannel === true ||
    (ticket.whatsappId != null &&
      targetWhatsappId != null &&
      Number(ticket.whatsappId) === Number(targetWhatsappId));
  const isOtherChannel =
    !isSameChannel &&
    ticket.whatsappId != null &&
    targetWhatsappId != null &&
    Number(ticket.whatsappId) !== Number(targetWhatsappId);
  // Só o outro canal libera prosseguir: no mesmo canal o backend recusa a
  // duplicata com 409, então oferecer a saída seria mentira.
  const canProceed = Boolean(onProceed) && isOtherChannel;

  const handleOpen = () => {
    onOpenChange(false);
    router.push(`/atendimento?ticketId=${ticket.ticketId}`);
  };

  const handleProceed = () => {
    onOpenChange(false);
    onProceed?.();
  };

  const handleTake = async () => {
    if (!user?.userId) return;
    setTaking(true);
    try {
      await updateTicket(ticket.ticketId, {
        userId: user.userId,
        status: "open",
      });
      toast.success(t("takeSuccess"));
      onOpenChange(false);
      router.push(`/atendimento?ticketId=${ticket.ticketId}`);
    } catch {
      toast.error(t("takeError"));
    } finally {
      setTaking(false);
    }
  };

  const ownerLabel = ticket.ownerName || t("noOwner");
  const queueLabel = ticket.queueName || t("noQueue");
  const contactLabel = ticket.contactName || "";
  const channelLabel = ticket.whatsappName || t("noChannel");
  const proceedLabel = t(proceedMode === "accept" ? "acceptAnyway" : "proceedAnyway");
  const proceedFootnote = t(
    proceedMode === "accept" ? "footnoteProceedAccept" : "footnoteProceedSend"
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!taking) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <span className="truncate">{t("title")}</span>
          </DialogTitle>
          {/* Chips escaneáveis do ticket existente: #id + status real (open ≠ pending) + canal */}
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 leading-none font-mono shrink-0">
              #{ticket.ticketId}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] h-5 px-1.5 leading-none font-semibold shrink-0",
                ticket.status === "open"
                  ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/50"
                  : "text-muted-foreground"
              )}
            >
              {t(ticket.status === "open" ? "statusOpen" : "statusPending")}
            </Badge>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 leading-none max-w-[160px] truncate" title={channelLabel}>
              {channelLabel}
            </Badge>
          </div>
          <DialogDescription className="space-y-2 pt-2 break-words">
            <span className="block">
              {t("message", {
                contact: contactLabel,
                ticketId: String(ticket.ticketId),
                owner: ownerLabel,
                queue: queueLabel,
              })}
            </span>
            {isOtherChannel && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("otherChannelNotice", { channel: channelLabel })}
              </span>
            )}
            {restricted && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("restrictedHint")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Demais atendimentos em aberto do MESMO contato (irmãos além do principal):
            a decisão de assumir/prosseguir deve ser tomada vendo o quadro inteiro.
            div nativa com overflow — não usar ScrollArea (Viewport 100% não resolve
            dentro de card flex; ver padrão scrollarea-flex-overflow). */}
        {Boolean(ticket.siblings?.length) && (
          <div className="rounded-md border">
            <p className="px-3 pt-2 text-[11px] font-semibold text-foreground">
              {t("moreOpenTickets")} ({ticket.siblings!.length})
            </p>
            <div className="max-h-36 overflow-y-auto px-3 py-2 space-y-1.5">
              {ticket.siblings!.map((s) => (
                <div key={s.ticketId} className="flex items-center gap-1.5 min-w-0">
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 leading-none font-mono shrink-0">
                    #{s.ticketId}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] h-5 px-1.5 leading-none font-semibold shrink-0",
                      s.status === "open"
                        ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/50"
                        : "text-muted-foreground"
                    )}
                  >
                    {t(s.status === "open" ? "statusOpen" : "statusPending")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-5 px-1.5 leading-none max-w-[120px] truncate shrink-0"
                    title={s.whatsappName || t("noChannel")}
                  >
                    {s.whatsappName || t("noChannel")}
                  </Badge>
                  <span
                    className="text-xs text-muted-foreground truncate flex-1 min-w-0"
                    title={`${s.ownerName || t("noOwner")} — ${s.queueName || t("noQueue")}`}
                  >
                    {s.ownerName || t("noOwner")}
                  </span>
                  {canOpen && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs shrink-0"
                      disabled={taking}
                      onClick={() => {
                        onOpenChange(false);
                        router.push(`/atendimento?ticketId=${s.ticketId}`);
                      }}
                    >
                      {t("open")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Nota de rodapé: explica o efeito de cada ação visível (o Cancelar é autoevidente) */}
        {(canOpen || canTake || canProceed) && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1">
            {canOpen && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">{t("open")}:</span>{" "}
                {t("footnoteOpen")}
              </p>
            )}
            {canTake && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">{t("take")}:</span>{" "}
                {t("footnoteTake", { ticketId: String(ticket.ticketId) })}
              </p>
            )}
            {canProceed && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">{proceedLabel}:</span>{" "}
                {proceedFootnote}
              </p>
            )}
          </div>
        )}
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={taking} className="w-full sm:w-auto">
            <X className="h-4 w-4 mr-1 shrink-0" />
            <span className="truncate">{t("cancel")}</span>
          </Button>
          {canOpen && (
            <Button variant="secondary" onClick={handleOpen} disabled={taking} className="w-full sm:w-auto">
              <ExternalLink className="h-4 w-4 mr-1 shrink-0" />
              <span className="truncate">{t("open")}</span>
            </Button>
          )}
          {canTake && (
            <Button onClick={handleTake} disabled={taking} className="w-full sm:w-auto">
              {taking
                ? <Loader2 className="h-4 w-4 mr-1 shrink-0 animate-spin" />
                : <UserPlus className="h-4 w-4 mr-1 shrink-0" />}
              <span className="truncate">{t("take")}</span>
            </Button>
          )}
          {canProceed && (
            <Button variant="default" onClick={handleProceed} disabled={taking} className="w-full sm:w-auto">
              {proceedMode === "send"
                ? <Send className="h-4 w-4 mr-1 shrink-0" />
                : <LogIn className="h-4 w-4 mr-1 shrink-0" />}
              <span className="truncate">{proceedLabel}</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
