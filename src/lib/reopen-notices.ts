import { useAuthStore } from "@/stores/auth-store";

/**
 * Avisos calculados ANTES de reabrir um ticket fechado.
 *
 * Reabrir parece uma ação de um clique só, mas tem duas consequências que o
 * operador não vê e costumam surpreender:
 *
 * 1. POSSE — para quem o ticket vai. O front manda só `{ status: "open" }`, e o
 *    destino depende da config de tenant `reopenTicketAssignsToActor`: ligada,
 *    o ticket passa para quem clicou; desligada, o Sequelize ignora o `userId`
 *    ausente e ele VOLTA para o atendente anterior (o efeito relatado como
 *    "reabriu pro outro"). Nenhum dos dois é óbvio na tela.
 * 2. JANELA DE 24h — em canais Meta (WABA/BSP, Hub, Instagram, Messenger),
 *    reabrir um ticket antigo entrega uma conversa em que não dá para digitar:
 *    só template aprovado até o cliente responder.
 *
 * Ressalva conhecida da posse: com a config ligada existe o guard D12 no backend
 * — se a fila do ticket usa Distribuição Automática, ele NÃO vai para quem
 * reabriu, e sim para o drain da fila. O front não tem esse dado aqui, então o
 * aviso de posse descreve o caminho comum.
 */

export type ReopenOwnershipMode = "actor" | "previous" | "unassigned";

export interface ReopenOwnershipNotice {
  mode: ReopenOwnershipMode;
  /** Nome do atendente atual do ticket. Vazio quando não há (modo "unassigned"). */
  ownerName: string;
}

export interface ReopenNotices {
  ownership: ReopenOwnershipNotice | null;
  windowClosed: boolean;
}

/** Forma mínima do ticket exigida pelos avisos. `Ticket` do ticket-store satisfaz. */
export interface ReopenNoticeTicket {
  channel?: string;
  user?: { id?: number | null; name?: string } | null;
  lastMessageReceived?: string | number;
}

/**
 * Canais sujeitos à janela de 24h da Meta.
 * Espelha `windowChannels` em components/atendimento/message-input.tsx — os dois
 * precisam concordar, senão o aviso promete uma coisa e a caixa de texto faz outra.
 */
function isWindowChannel(channel: string | undefined): boolean {
  const ch = (channel || "").toLowerCase();
  const isWabaLike = ch === "waba" || ch === "gupshup" || ch === "dialog360";
  return isWabaLike || ch.includes("hub") || ch === "instagram" || ch === "messenger";
}

/**
 * true quando a janela de 24h já fechou para este ticket.
 * Sem `lastMessageReceived` assume fechada — mesmo fail-closed do message-input
 * (nunca prometer envio livre que a Meta vai recusar).
 */
export function isWindowClosedForTicket(ticket: ReopenNoticeTicket): boolean {
  if (!isWindowChannel(ticket.channel)) return false;
  const raw = ticket.lastMessageReceived;
  if (!raw) return true;
  const lastMs = new Date(typeof raw === "number" ? raw : Number(raw)).getTime();
  if (!Number.isFinite(lastMs)) return false;
  return Date.now() - lastMs >= 24 * 60 * 60 * 1000;
}

function ownerOf(ticket: ReopenNoticeTicket): { id: number | null; name: string } {
  const rawId =
    ticket.user?.id ?? (ticket as unknown as { userId?: number | null }).userId ?? null;
  return {
    id: rawId != null ? Number(rawId) : null,
    name: ticket.user?.name || "",
  };
}

/**
 * Monta os avisos da reabertura. `ownership` fica null quando o ticket já é de
 * quem está clicando (ou vai ser, sem tirar de ninguém) — nesse caso não há nada
 * a dizer e o chamador reabre direto, sem diálogo.
 */
export function buildReopenNotices(
  ticket: ReopenNoticeTicket,
  currentUserId: number | null
): ReopenNotices {
  const windowClosed = isWindowClosedForTicket(ticket);
  const { getConfigValue } = useAuthStore.getState();
  const assignsToActor = getConfigValue("reopenTicketAssignsToActor") === "enabled";
  const owner = ownerOf(ticket);
  const isMine = owner.id != null && currentUserId != null && owner.id === currentUserId;

  let ownership: ReopenOwnershipNotice | null = null;
  if (!isMine) {
    if (assignsToActor) {
      // Só avisa quando a posse sai de alguém. Ticket sem dono indo para quem
      // reabriu é o resultado esperado — não precisa de confirmação.
      if (owner.id != null) ownership = { mode: "actor", ownerName: owner.name };
    } else if (owner.id != null) {
      ownership = { mode: "previous", ownerName: owner.name };
    } else {
      ownership = { mode: "unassigned", ownerName: "" };
    }
  }

  return { ownership, windowClosed };
}
