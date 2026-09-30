"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRightLeft, ExternalLink, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import type { ExistingOpenTicket } from "@/lib/check-existing-open-ticket";

/**
 * Confirmação de TROCA DE CANAL quando o contato já tem atendimento aberto no
 * canal de destino — antes a transferência criava a segunda conversa em silêncio.
 * Paridade com o ReopenConfirmDialog: o aviso é consultivo, nunca bloqueia.
 *
 * Dois modos:
 * - single (`sibling` preenchido): transferência de um ticket — mostra o
 *   atendimento que já vive no destino e oferece ir até ele ou transferir assim mesmo.
 * - bulk (`bulk` preenchido): transferência em massa — mostra quantos dos
 *   selecionados têm conflito e oferece transferir todos ou apenas os demais.
 */
export function TransferChannelConfirmDialog({
  open,
  onOpenChange,
  sibling,
  bulk,
  targetChannelName,
  isRestrictedUser,
  notViewAssignedTickets,
  onConfirm,
  onTransferClean,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Atendimento já aberto no canal de destino (modo single). */
  sibling: ExistingOpenTicket | null;
  /** Modo massa: quantos selecionados têm conflito no destino. */
  bulk?: { conflictCount: number; total: number } | null;
  targetChannelName: string;
  isRestrictedUser: boolean;
  notViewAssignedTickets: boolean;
  onConfirm: () => void;
  /** Massa: transfere só os sem conflito. */
  onTransferClean?: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("existingTicket");
  const router = useRouter();

  const restricted = isRestrictedUser || notViewAssignedTickets;
  const canOpen = Boolean(sibling) && !restricted;
  const channelLabel = targetChannelName || t("noChannel");
  const cleanCount = bulk ? Math.max(0, bulk.total - bulk.conflictCount) : 0;

  const handleGoTo = (ticketId: number) => {
    onOpenChange(false);
    router.push(`/atendimento?ticketId=${ticketId}`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <span className="truncate">{t("confirmTransferChannelTitle")}</span>
          </DialogTitle>
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
            {sibling && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("transferChannelNotice", { channel: channelLabel })}
              </span>
            )}
            {bulk && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("transferChannelBulkNotice", {
                  count: String(bulk.conflictCount),
                  total: String(bulk.total),
                  channel: channelLabel,
                })}
              </span>
            )}
            {restricted && sibling && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                {t("restrictedHint")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Demais atendimentos em aberto do mesmo contato (informativo). */}
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
                      disabled={busy}
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
        {/* Nota de rodapé: efeito de cada ação visível. */}
        <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1">
          {canOpen && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">{t("goToActiveTicket")}:</span>{" "}
              {t("footnoteGoToActive", { ticketId: String(sibling!.ticketId) })}
            </p>
          )}
          {bulk && onTransferClean && cleanCount > 0 && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">{t("transferOnlyClean")}:</span>{" "}
              {t("footnoteTransferOnlyClean", { count: String(cleanCount), total: String(bulk.total) })}
            </p>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">{t("transferAnyway")}:</span>{" "}
            {t("footnoteProceedTransferChannel")}
          </p>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="w-full sm:w-auto">
            <X className="h-4 w-4 mr-1 shrink-0" />
            <span className="truncate">{t("cancel")}</span>
          </Button>
          <Button variant="outline" onClick={onConfirm} disabled={busy} className="w-full sm:w-auto">
            <ArrowRightLeft className="h-4 w-4 mr-1 shrink-0" />
            <span className="truncate">{t("transferAnyway")}</span>
          </Button>
          {bulk && onTransferClean && cleanCount > 0 && (
            <Button variant="default" onClick={onTransferClean} disabled={busy} className="w-full sm:w-auto">
              <ListChecks className="h-4 w-4 mr-1 shrink-0" />
              <span className="truncate">{t("transferOnlyClean")}</span>
            </Button>
          )}
          {canOpen && (
            <Button variant="default" onClick={() => handleGoTo(sibling!.ticketId)} disabled={busy} className="w-full sm:w-auto">
              <ExternalLink className="h-4 w-4 mr-1 shrink-0" />
              <span className="truncate">{t("goToActiveTicket")}</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
