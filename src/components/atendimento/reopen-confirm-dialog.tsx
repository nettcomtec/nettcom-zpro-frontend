"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, UserPlus, X, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { updateTicket } from "@/services/tickets";
import type { ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import type { ReopenNotices } from "@/lib/reopen-notices";

/**
 * Confirmação de reabertura de um ticket fechado.
 *
 * O chamador só abre este diálogo quando há ALGO a dizer — um atendimento aberto
 * do mesmo contato, a posse indo para outro lugar, ou a janela de 24h fechada.
 * Sem nenhum desses, reabrir continua sendo um clique só, como sempre foi.
 *
 * Quando o atendimento em aberto está no MESMO canal, "Ir para o atendimento em
 * curso" vira a ação primária: reabrir ali cria a segunda conversa paralela com a
 * mesma pessoa, e na prática o que se queria era a conversa que já existe. Ainda
 * assim reabrir continua disponível — o aviso é consultivo, nunca bloqueia.
 */
export function ReopenConfirmDialog({
  open,
  onOpenChange,
  sibling,
  notices,
  isRestrictedUser,
  notViewAssignedTickets,
  targetWhatsappId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Atendimento aberto do mesmo contato que torna a reabertura uma duplicata. */
  sibling: ExistingOpenTicket | null;
  notices: ReopenNotices;
  isRestrictedUser: boolean;
  notViewAssignedTickets: boolean;
  /** Canal do ticket que está sendo reaberto (para classificar o irmão). */
  targetWhatsappId?: number | null;
  onConfirm: () => void;
}) {
  const t = useTranslations("existingTicket");
  const router = useRouter();
  const { user } = useAuthStore();
  const [taking, setTaking] = React.useState(false);

  const profile = user?.profile ?? "";
  const isAdminLike = profile === "admin" || profile === "super" || profile === "superadmin";
  const restricted = isRestrictedUser || (notViewAssignedTickets && profile === "user");
  const canOpen = Boolean(sibling) && !restricted;
  const canTake = Boolean(sibling) && isAdminLike;

  // `sameChannel` vem do backend (pré-check batelado) e é a fonte primária; o
  // comparativo com targetWhatsappId cobre payloads que não populam a flag.
  const isSameChannel =
    sibling != null &&
    (sibling.sameChannel === true ||
      (sibling.whatsappId != null &&
        targetWhatsappId != null &&
        Number(sibling.whatsappId) === Number(targetWhatsappId)));
  const isOtherChannel = sibling != null && !isSameChannel;

  // Duplicata no mesmo canal: ir para a conversa que já existe é o caminho certo
  // na maioria das vezes, então ela ganha o destaque e reabrir vira a alternativa.
  const goToIsPrimary = canOpen && isSameChannel;

  const handleGoTo = (ticketId: number) => {
    onOpenChange(false);
    router.push(`/atendimento?ticketId=${ticketId}`);
  };

  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };

  const handleTake = async () => {
    if (!user?.userId || !sibling) return;
    setTaking(true);
    try {
      await updateTicket(sibling.ticketId, { userId: user.userId, status: "open" });
      toast.success(t("takeSuccess"));
      onOpenChange(false);
      router.push(`/atendimento?ticketId=${sibling.ticketId}`);
    } catch {
      toast.error(t("takeError"));
    } finally {
      setTaking(false);
    }
  };

  const ownershipNotice = notices.ownership;
  const channelLabel = sibling?.whatsappName || t("noChannel");
  const confirmLabel = sibling ? t("reopenAnyway") : t("reopenConfirm");
  const confirmFootnote = sibling
    ? t(isSameChannel ? "footnoteProceedReopenSameChannel" : "footnoteProceedReopen")
    : t("footnoteReopenPlain");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!taking) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <span className="truncate">{t("confirmReopenTitle")}</span>
          </DialogTitle>
          {/* Chips escaneáveis do atendimento já aberto: #id + status real + canal */}
          {sibling && (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 leading-none font-mono shrink-0">
                #{sibling.ticketId}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] h-5 px-1.5 leading-none font-semibold shrink-0",
                  sibling.status === "open"
                    ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/50"
                    : "text-muted-foreground"
                )}
              >
                {t(sibling.status === "open" ? "statusOpen" : "statusPending")}
              </Badge>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 leading-none max-w-[160px] truncate" title={channelLabel}>
                {channelLabel}
              </Badge>
            </div>
          )}
          <DialogDescription className="space-y-2 pt-2 break-words">
            {sibling && (
              <span className="block">
                {t("message", {
                  contact: sibling.contactName || "",
                  ticketId: String(sibling.ticketId),
                  owner: sibling.ownerName || t("noOwner"),
                  queue: sibling.queueName || t("noQueue"),
                })}
              </span>
            )}
            {isOtherChannel && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("otherChannelNotice", { channel: channelLabel })}
              </span>
            )}
            {isSameChannel && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("sameChannelNotice", { channel: channelLabel })}
              </span>
            )}
            {/* Para onde a posse vai — o front manda só o status, quem decide o dono
                é a config de tenant reopenTicketAssignsToActor. */}
            {ownershipNotice && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {ownershipNotice.mode === "actor"
                  ? t("reopenOwnerToActor", { owner: ownershipNotice.ownerName || t("noOwner") })
                  : ownershipNotice.mode === "previous"
                  ? t("reopenOwnerToPrevious", { owner: ownershipNotice.ownerName || t("noOwner") })
                  : t("reopenOwnerUnassigned")}
              </span>
            )}
            {notices.windowClosed && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("reopenWindowClosedNotice")}
              </span>
            )}
            {restricted && sibling && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("restrictedHint")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Demais atendimentos em aberto do MESMO contato (além do principal): a
            decisão deve ser tomada vendo o quadro inteiro. div nativa com overflow —
            não usar ScrollArea (Viewport 100% não resolve dentro de card flex). */}
        {Boolean(sibling?.siblings?.length) && (
          <div className="rounded-md border">
            <p className="px-3 pt-2 text-[11px] font-semibold text-foreground">
              {t("moreOpenTickets")} ({sibling!.siblings!.length})
            </p>
            <div className="max-h-36 overflow-y-auto px-3 py-2 space-y-1.5">
              {sibling!.siblings!.map((s) => (
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
                      onClick={() => handleGoTo(s.ticketId)}
                    >
                      {t("open")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Nota de rodapé: explica o efeito de cada ação visível (Cancelar é autoevidente) */}
        <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1">
          {canOpen && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">{t("goToActiveTicket")}:</span>{" "}
              {t("footnoteGoToActive", { ticketId: String(sibling!.ticketId) })}
            </p>
          )}
          {canTake && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">{t("take")}:</span>{" "}
              {t("footnoteTake", { ticketId: String(sibling!.ticketId) })}
            </p>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">{confirmLabel}:</span>{" "}
            {confirmFootnote}
          </p>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={taking} className="w-full sm:w-auto">
            <X className="h-4 w-4 mr-1 shrink-0" />
            <span className="truncate">{t("cancel")}</span>
          </Button>
          <Button
            variant={goToIsPrimary ? "outline" : "default"}
            onClick={handleConfirm}
            disabled={taking}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="h-4 w-4 mr-1 shrink-0" />
            <span className="truncate">{confirmLabel}</span>
          </Button>
          {canTake && (
            <Button variant="secondary" onClick={handleTake} disabled={taking} className="w-full sm:w-auto">
              {taking
                ? <Loader2 className="h-4 w-4 mr-1 shrink-0 animate-spin" />
                : <UserPlus className="h-4 w-4 mr-1 shrink-0" />}
              <span className="truncate">{t("take")}</span>
            </Button>
          )}
          {canOpen && (
            <Button
              variant={goToIsPrimary ? "default" : "secondary"}
              onClick={() => handleGoTo(sibling!.ticketId)}
              disabled={taking}
              className="w-full sm:w-auto"
            >
              <ExternalLink className="h-4 w-4 mr-1 shrink-0" />
              <span className="truncate">{t("goToActiveTicket")}</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
