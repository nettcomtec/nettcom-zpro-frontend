"use client";

/**
 * Pausar / Retomar o agente de IA SÓ neste atendimento — lógica única dos pontos da
 * tela (botão do card pendente da lista, menu ⋯ do cabeçalho da conversa e cartão
 * "Agente de IA" do painel do atendimento). docs/PLANO_AGENTES_IA_BLOQUEIO_INATIVIDADE.md
 * (D2, D12): pausar mantém o agente no atendimento, sem responder nem gastar nada;
 * retomar faz ele voltar. "Desligar" continua no ReleaseAiAgentDialog.
 *
 * API:
 * - `useAiAgentPauseToggle(ticket)` → `{ available, paused, busy, toggle }`
 *   - `ticket`: o atendimento do store (lê `id`, `status`, `aiAgentId`, `chatgptStatus`,
 *     `botStopped`). `null`/`undefined` = inerte (`available: false`).
 *   - `available`: agente respondendo OU pausado e atendimento não fechado — onde
 *     mostrar o controle (e o "Desligar", que vale para os dois estados).
 *   - `paused`: `isAiAgentPaused(ticket)`. `true` = rótulo "Retomar"; `false` = "Pausar".
 *   - `busy`: pedido em andamento (desabilitar o controle).
 *   - `toggle(e?)`: pausa quando o agente responde, retoma quando está pausado. Recebendo o
 *     evento chama `e.stopPropagation()` (o clique no card da lista não abre a conversa).
 *     Clique repetido no mesmo atendimento durante o pedido é ignorado, em qualquer ponto.
 * - `<AiAgentPauseButton ticket className? />`: botão "outline" pequeno do cartão do
 *   painel, com "Pausar"/"Retomar" e ícone; não renderiza nada sem `available`.
 *
 * Efeitos: atualização otimista no ticket-store (`botStopped` + `chatgptStatus`),
 * corrigida pela resposta; o `ticket:update` do socket confirma em seguida. Toasts:
 * sucesso, "sem efeito" (o agente já tinha saído / não há pausa para retomar),
 * "precisa atualizar o servidor" (backend antigo; a pausa é desfeita) e erro. 403 de
 * acesso ao atendimento = `handleTicketAccessDenied`, como no "Desligar".
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setTicketAiAgentPaused } from "@/services/tickets";
import { useTicketStore, type Ticket } from "@/stores/ticket-store";
import { handleTicketAccessDenied } from "@/lib/ticket-access-denied";
import { isAiAgentActiveOrPaused, isAiAgentPaused } from "@/lib/ticket-automations";

export type AiAgentPauseTicket = Pick<Ticket, "id" | "status" | "aiAgentId" | "chatgptStatus" | "botStopped">;

export interface AiAgentPauseToggle {
  available: boolean;
  paused: boolean;
  busy: boolean;
  toggle: (e?: { stopPropagation?: () => void }) => Promise<void>;
}

// Um pedido por atendimento na aba, seja qual for o ponto que clicou (card e menu ⋯
// podem estar na tela ao mesmo tempo).
const inFlight = new Set<number>();

export function useAiAgentPauseToggle(ticket: AiAgentPauseTicket | null | undefined): AiAgentPauseToggle {
  const t = useTranslations("aiAgentRelease");
  const updateTicketInStore = useTicketStore((s) => s.updateTicket);
  const [busy, setBusy] = React.useState(false);

  const available = !!ticket && ticket.status !== "closed" && isAiAgentActiveOrPaused(ticket);
  const paused = !!ticket && isAiAgentPaused(ticket);

  // Valores da última renderização: o clique decide pelo estado que a tela mostra.
  const latest = React.useRef({ ticket, available, paused });
  latest.current = { ticket, available, paused };

  const toggle = React.useCallback(
    async (e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      const { ticket: tk, available: canToggle, paused: wasPaused } = latest.current;
      if (!tk || !canToggle || inFlight.has(tk.id)) return;
      const ticketId = tk.id;
      const pause = !wasPaused;
      const previous = { botStopped: tk.botStopped, chatgptStatus: tk.chatgptStatus };

      inFlight.add(ticketId);
      setBusy(true);
      // Otimista: pausado = IA desligada + botStopped; retomado = IA ligada.
      updateTicketInStore({
        id: ticketId,
        botStopped: pause,
        chatgptStatus: pause ? undefined : "enabled",
      });
      try {
        const result = await setTicketAiAgentPaused(ticketId, pause);
        if (result.status === "ok") {
          updateTicketInStore({
            id: ticketId,
            botStopped: result.botStopped ?? pause,
            chatgptStatus: pause ? undefined : "enabled",
          });
          toast.success(pause ? t("pauseSuccess") : t("resumeSuccess"));
          return;
        }
        // O agente não mudou: a IA fica como estava; o botStopped fica o que foi gravado.
        updateTicketInStore({
          id: ticketId,
          botStopped: result.botStopped ?? previous.botStopped,
          chatgptStatus: previous.chatgptStatus,
        });
        if (result.status === "noEffect") {
          toast.info(pause ? t("pauseNoEffect") : t("resumeNoEffect"));
        } else {
          toast.warning(t("pauseNeedsUpdate"));
        }
      } catch (err) {
        updateTicketInStore({ id: ticketId, ...previous });
        if (handleTicketAccessDenied(err, ticketId, t("noAccess"))) return;
        toast.error(t("pauseError"));
      } finally {
        inFlight.delete(ticketId);
        setBusy(false);
      }
    },
    [t, updateTicketInStore]
  );

  return { available, paused, busy, toggle };
}

export function AiAgentPauseButton({
  ticket,
  className,
}: {
  ticket: AiAgentPauseTicket | null | undefined;
  className?: string;
}) {
  const t = useTranslations("aiAgentRelease");
  const { available, paused, busy, toggle } = useAiAgentPauseToggle(ticket);
  if (!available) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-8 shrink-0", className)}
      disabled={busy}
      onClick={(e) => { void toggle(e); }}
    >
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : paused ? (
        <Play className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <Pause className="mr-1.5 h-3.5 w-3.5" />
      )}
      {paused ? t("resumeButton") : t("pauseButton")}
    </Button>
  );
}
