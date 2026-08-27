import { toast } from "sonner";
import { useTicketStore } from "@/stores/ticket-store";

/**
 * Detecta o 403 ERR_NO_TICKET_ACCESS do guard de acesso a ticket de fila alheia
 * (backend: ticketAccessGuard / CanUserAccessTicketService). Aceita tanto o erro
 * cru do axios (response.status/response.data.error) quanto formatos ja extraidos.
 */
export function isTicketAccessDenied(err: unknown): boolean {
  // Detecta SÓ pelo código do erro — não por status 403 genérico. As rotas de envio
  // têm outros 403 (sendChannelGuard=LICENSE_INVALID, requirePermission, license) que
  // NÃO devem fechar o ticket. Cobre os 2 shapes: AxiosError cru (response.data.error)
  // e o objeto rejeitado pelo interceptor (api.ts:290 rejeita error.response → data.error).
  const code = String(
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      (err as { data?: { error?: string } })?.data?.error ??
      ""
  );
  return code === "ERR_NO_TICKET_ACCESS";
}

/**
 * Trata o 403 de acesso negado a um ticket de fila alheia, de forma uniforme em
 * qualquer ponto de envio do front (texto, midia, interativos, reacao, edicao...).
 * Espelha o handler de abrir ticket: fecha a conversa se for o ticket bloqueado,
 * remove o card da lista (o socket pode te-lo reinjetado via push pro tenant) e
 * avisa. Opera direto no store, entao serve para componentes-filho tambem.
 *
 * Retorna true se TRATOU (era 403 de acesso) — o caller deve abortar seu fluxo de
 * erro normal (return). Retorna false caso contrario — o caller segue com o seu
 * tratamento especifico (ex.: toast "erro ao enviar X").
 */
export function handleTicketAccessDenied(
  err: unknown,
  ticketId: number,
  message: string
): boolean {
  if (!isTicketAccessDenied(err)) return false;
  const store = useTicketStore.getState();
  if (store.currentTicket?.id === ticketId) store.setCurrentTicket(null);
  store.setTickets(store.tickets.filter((t) => t.id !== ticketId));
  toast.error(message);
  return true;
}
