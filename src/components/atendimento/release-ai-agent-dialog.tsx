"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { releaseTicketAiAgent } from "@/services/tickets";
import { useTicketStore } from "@/stores/ticket-store";
import { useAuthStore } from "@/stores/auth-store";
import { handleTicketAccessDenied } from "@/lib/ticket-access-denied";

/**
 * Confirmação do botão "Desligar agente de IA" (menu ⋯ do cabeçalho da conversa e
 * aba Integrações do painel do atendimento). Solta o agente SÓ deste atendimento;
 * a nota interna vai no idioma da tela de quem desligou.
 */
export function ReleaseAiAgentDialog({
  ticketId,
  open,
  onOpenChange,
}: {
  ticketId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("aiAgentRelease");
  const updateTicketInStore = useTicketStore((s) => s.updateTicket);
  const userName = useAuthStore((s) => s.user?.username);
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const name = (userName || "").trim();
      const note = name ? t("note", { name }) : t("noteNoName");
      const { released } = await releaseTicketAiAgent(ticketId, note);
      if (released) {
        // Tira o selo na hora; o ticket:update do servidor confirma em seguida.
        updateTicketInStore({ id: ticketId, aiAgentId: null, chatgptStatus: undefined });
        toast.success(t("success"));
      } else {
        // O servidor já releu e tentou de novo: o agente não está mais no atendimento.
        // Corrige a tela que perdeu o evento (senão o botão seguiria aparecendo).
        updateTicketInStore({ id: ticketId, aiAgentId: null });
        toast.info(t("alreadyOff"));
      }
      onOpenChange(false);
    } catch (err) {
      if (handleTicketAccessDenied(err, ticketId, t("noAccess"))) {
        onOpenChange(false);
        return;
      }
      toast.error(t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={buttonVariants({ variant: "destructive" })}
            onClick={(e) => { e.preventDefault(); void run(); }}
          >
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("confirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
