/**
 * Deduplicação do pool ativo (open + pending) por contato+canal.
 *
 * Existe porque um contato normalmente NÃO deveria ter dois atendimentos ativos
 * no mesmo canal (FindOrCreateTicket reaproveita open/pending), então quando isso
 * acontece a lista mostrava a mesma pessoa duas vezes. O critério antigo era
 * "vence o maior updatedAt", e isso escondia o atendimento errado: reabrir um
 * ticket fechado carimba updatedAt=agora, então o reaberto ganhava do atendimento
 * VIVO que outro operador estava tocando — o operador simplesmente perdia a
 * conversa de vista, sem nenhum aviso.
 *
 * Regra atual:
 * 1. Grupo com MAIS DE UM ticket com responsável → não deduplica, mostra todos.
 *    São dois atendimentos reais, cada um com um dono que responde por ele;
 *    esconder qualquer um deles perde trabalho de alguém.
 * 2. Caso contrário, vence: com dono > sem dono → open > pending → updatedAt.
 *    (o antigo "maior updatedAt" sozinho podia eleger um pendente órfão residual
 *    em cima do atendimento que está de fato em curso)
 *
 * A ordem de entrada é preservada — quem ordena a lista é o chamador.
 */

/** Forma mínima exigida pelo dedupe. `Ticket` do ticket-store satisfaz. */
export interface DedupableTicket {
  id: number;
  status: string;
  updatedAt: string;
  contact?: { id?: number | null } | null;
  user?: { id?: number | null } | null;
  whatsapp?: { id?: number | null } | null;
}

/** Dono do ticket: o objeto `user` da lista, com fallback no `userId` cru do payload. */
function ownerIdOf(ticket: DedupableTicket): number | null {
  const fromUser = ticket.user?.id;
  if (fromUser != null) return Number(fromUser);
  const raw = (ticket as unknown as { userId?: number | null }).userId;
  return raw != null ? Number(raw) : null;
}

function channelIdOf(ticket: DedupableTicket): number | string {
  return (
    ticket.whatsapp?.id ??
    (ticket as unknown as { whatsappId?: number | null }).whatsappId ??
    ""
  );
}

function timeOf(ticket: DedupableTicket): number {
  const ms = new Date(ticket.updatedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** >0 quando `a` deve prevalecer sobre `b`. */
function comparePriority(a: DedupableTicket, b: DedupableTicket): number {
  const aOwned = ownerIdOf(a) != null ? 1 : 0;
  const bOwned = ownerIdOf(b) != null ? 1 : 0;
  if (aOwned !== bOwned) return aOwned - bOwned;

  const aOpen = a.status === "open" ? 1 : 0;
  const bOpen = b.status === "open" ? 1 : 0;
  if (aOpen !== bOpen) return aOpen - bOpen;

  return timeOf(a) - timeOf(b);
}

/**
 * Recebe SOMENTE tickets ativos (open/pending) e devolve os que devem aparecer.
 * Tickets sem contato identificável passam direto (não há como agrupá-los).
 */
export function dedupeActiveTicketsByContactChannel<T extends DedupableTicket>(
  active: T[]
): T[] {
  const groups = new Map<string, T[]>();
  const kept = new Set<T>();

  for (const ticket of active) {
    const contactId = ticket.contact?.id;
    if (contactId == null) {
      kept.add(ticket);
      continue;
    }
    const key = `${contactId}-${channelIdOf(ticket)}`;
    const group = groups.get(key);
    if (group) group.push(ticket);
    else groups.set(key, [ticket]);
  }

  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.add(group[0]);
      continue;
    }
    // Duplicidade com mais de um responsável: mostra todos (regra 1).
    if (group.filter((tk) => ownerIdOf(tk) != null).length > 1) {
      for (const ticket of group) kept.add(ticket);
      continue;
    }
    let winner = group[0];
    for (let i = 1; i < group.length; i += 1) {
      if (comparePriority(group[i], winner) > 0) winner = group[i];
    }
    kept.add(winner);
  }

  return active.filter((ticket) => kept.has(ticket));
}
