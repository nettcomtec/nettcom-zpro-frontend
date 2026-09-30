import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useTicketStore } from "@/stores/ticket-store";
import {
  canUserSeeTicket,
  type TicketVisibilityData,
  type VisibilityConfig,
} from "@/lib/can-user-see-ticket";
import { getTicketLastMessagePreview } from "@/lib/template-preview";

/**
 * Revogação das entradas de atendimento do sino.
 *
 * O sino só checava visibilidade (canUserSeeTicket) no instante em que a entrada NASCIA.
 * Depois disso nada a removia: o atendimento pendente que pingou — legitimamente — no sino de
 * todos da fila continuava lá quando um colega o aceitava (ou quando era transferido). A lista
 * de /atendimento escondia o ticket na hora (NotViewAssignedTickets, fila, canal), mas a entrada
 * ficava clicável até o F5 e abria o atendimento do colega por /atendimento?ticketId=.
 *
 * Aqui mora a regra única usada pelos dois hooks de socket (padrão e otimizado) e pelo header:
 * cada entrada guarda um retrato dos campos de visibilidade do ticket (`visibility`), mantido em
 * dia pelos eventos ticket:update, e é removida quando o MESMO canUserSeeTicket passa a negar.
 *
 * Tudo aqui é fail-open para REMOÇÃO: sem dado suficiente para avaliar, a entrada fica (perder
 * aviso legítimo é pior que manter um a mais — e o clique continua protegido pelo guard do
 * backend, que responde "sem acesso").
 */

const VISIBILITY_KEYS = [
  "userId",
  "userIdArray",
  "shared",
  "whatsappId",
  "queueId",
  "isGroup",
  "groupUserIdArray",
  "chatFlowId",
] as const;

/**
 * Extrai SÓ os campos de visibilidade PRESENTES no objeto — aceita o payload cru do socket
 * (queueId/whatsappId/userId) e o ticket normalizado do store/REST (queue.id/whatsapp.id/user.id).
 * Chave ausente não entra no resultado: o retrato é montado por merge, e um payload parcial
 * (ex.: só `{ id, unreadMessages }`) não pode apagar o que já se sabia do ticket.
 */
export function pickTicketVisibilityPatch(raw: unknown): TicketVisibilityData {
  if (!raw || typeof raw !== "object") return {};
  const tk = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of VISIBILITY_KEYS) {
    if (key in tk && tk[key] !== undefined) out[key] = tk[key];
  }

  // Ticket normalizado: dono em `user.id`, fila em `queue.id`, canal em `whatsapp.id`.
  // Só valem como fallback quando a chave crua NÃO veio — `userId: null` explícito (devolvido
  // à fila) não pode ser sobrescrito por um objeto `user` velho.
  if (!("userId" in out)) {
    const user = tk.user as { id?: number | null } | null | undefined;
    if (user && typeof user === "object" && user.id != null) out.userId = user.id;
  }
  if (!("queueId" in out)) {
    const queue = tk.queue as { id?: number | null } | null | undefined;
    if (queue && typeof queue === "object" && queue.id != null) out.queueId = queue.id;
  }
  if (!("whatsappId" in out)) {
    const whatsapp = tk.whatsapp as { id?: number | null } | null | undefined;
    if (whatsapp && typeof whatsapp === "object" && whatsapp.id != null) out.whatsappId = whatsapp.id;
  }

  // Carteira: só quando o contato TRAZ carteiras de fato. Lista vazia NÃO é dado: o ticket
  // aninhado do chat:create vem com o contato sem carteiras, a lista REST não as devolve e o
  // normalizeTicket sempre grava `wallets: []` — qualquer um deles apagaria as carteiras que o
  // ticket:create/update informou e o dono da carteira perderia o aviso (e o clique) de um
  // atendimento que o backend libera. Carteira retirada depois fica no retrato até o F5:
  // fail-open, o guard do backend continua decidindo o acesso.
  const contact = tk.contact as { wallets?: unknown } | null | undefined;
  if (contact && typeof contact === "object" && Array.isArray(contact.wallets) && contact.wallets.length > 0) {
    out.contact = { wallets: contact.wallets };
  }

  const id = Number(tk.id);
  if (Number.isFinite(id) && id > 0) out.id = id;

  return out as TicketVisibilityData;
}

/** Mesma configuração de visibilidade que os hooks de socket e o header montam. */
export function buildTicketVisibilityConfig(): VisibilityConfig {
  const store = useAuthStore.getState();
  return {
    supervisorAdmin: store.supervisorAdmin,
    notViewAssignedTickets: store.getConfigValue("NotViewAssignedTickets") === "enabled",
    notViewTicketsChatBot: store.getConfigValue("NotViewTicketsChatBot") === "enabled",
    showGroupsForAll: store.getConfigValue("showGroupsForAll") !== "disabled",
    nullTickets: store.getConfigValue("nullTickets"),
    inboundByQueueOnly: store.getConfigValue("inboundByQueueOnly"),
    supervisorChannelScoped: store.getConfigValue("supervisorChannelScoped"),
  };
}

/**
 * "Esta entrada tem de sair do sino?" — true só quando dá para afirmar que o usuário perdeu a
 * visibilidade do ticket. Casos em que NÃO revoga (fail-open):
 *  - sem usuário ou com as configurações do tenant ainda carregando (config ausente deixaria o
 *    gate mais permissivo, mas nunca é motivo para mexer no sino);
 *  - ticket atribuído ao PRÓPRIO usuário: regras como canal (whatsappAllowed) derrubam
 *    canUserSeeTicket mesmo no atendimento que é dele — mesma escapatória do handler de
 *    ticket:update que evita fechar a conversa aberta;
 *  - retrato sem o dono do ticket, ou sem fila quando o usuário tem filas: payload parcial não
 *    permite distinguir "atendimento de colega na minha fila" (visível com a opção desligada) de
 *    "atendimento de fila alheia".
 */
export function shouldRevokeTicketNotification(visibility: TicketVisibilityData | null | undefined): boolean {
  if (!visibility) return false;
  const auth = useAuthStore.getState();
  const user = auth.user;
  if (!user || user.userId == null) return false;
  if (!auth.tenantConfigsLoaded) return false;

  if (!("userId" in visibility)) return false;
  if (visibility.userId != null && Number(visibility.userId) === Number(user.userId)) return false;

  const userHasQueues = Array.isArray(user.queues) && user.queues.length > 0;
  const hasQueueInfo = "queueId" in visibility || (visibility.queue != null && typeof visibility.queue === "object");
  if (userHasQueues && !hasQueueInfo) return false;

  return !canUserSeeTicket(
    { ...visibility, chatbot: !!(visibility.chatFlowId ?? visibility.chatbot) },
    user,
    buildTicketVisibilityConfig(),
  );
}

function sameVisibility(a: TicketVisibilityData | undefined, b: TicketVisibilityData): boolean {
  try {
    return JSON.stringify(a ?? {}) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Chamado pelos hooks de socket a cada ticket:update (ANTES de qualquer retorno antecipado do
 * handler — inclusive o filtro de socket "ticketsRain", que descarta o evento de ticket que o
 * usuário não pode ver, exatamente o caso que precisa revogar a entrada).
 * Atualiza o retrato da entrada do sino desse ticket e a remove se o usuário perdeu a
 * visibilidade. Sem entrada para o ticket = custo de um `find` e nada mais.
 */
export function syncTicketNotificationVisibility(rawTicket: unknown): void {
  const patch = pickTicketVisibilityPatch(rawTicket);
  const ticketId = patch.id;
  if (ticketId == null) return;

  const { notifications, setNotifications, removeTicketNotification } = useNotificationStore.getState();
  const entry = notifications.find((n) => n.ticketId === ticketId);
  if (!entry) return;

  // Entrada sem retrato (criada por versão anterior da tela): parte do ticket do store, se houver.
  const base: TicketVisibilityData =
    entry.visibility ??
    pickTicketVisibilityPatch(useTicketStore.getState().tickets.find((tk) => tk.id === ticketId));
  const merged: TicketVisibilityData = { ...base, ...patch };

  if (shouldRevokeTicketNotification(merged)) {
    removeTicketNotification(ticketId);
    return;
  }
  if (!sameVisibility(entry.visibility, merged)) {
    setNotifications(
      notifications.map((n) => (n.ticketId === ticketId ? { ...n, visibility: merged } : n)),
    );
  }
}

/**
 * Contrapartida da revogação: atendimento que VOLTA a ser pendente (devolvido à fila, transferido
 * para fila) reaparece no sino de quem pode vê-lo. Antes a entrada antiga simplesmente ficava lá;
 * agora que ela é revogada quando o colega assume, sem isto o aviso só voltaria na próxima
 * mensagem do cliente ou no F5 (o backend emite `notification:new`, que só toca som).
 *
 * Só age na TRANSIÇÃO — o ticket já está no store com dono ou com outro status e o evento o traz
 * pendente. Ticket fora do store ou que já era pendente sem dono não gera entrada: ação em massa
 * sobre centenas de pendentes não pode virar centenas de escritas no sino.
 * Chamar ANTES de o handler aplicar o evento no store (é o estado anterior que decide).
 */
export function ensurePendingTicketNotification(
  rawTicket: unknown,
  labels: { contactFallback: string; newMessageFallback: string },
): void {
  if (!rawTicket || typeof rawTicket !== "object") return;
  const tk = rawTicket as Record<string, unknown>;
  if (tk.status !== "pending") return;

  const patch = pickTicketVisibilityPatch(tk);
  const ticketId = patch.id;
  if (ticketId == null) return;
  // Precisa do dono e da fila para avaliar — payload parcial não cria entrada.
  if (!("userId" in patch) || !("queueId" in patch)) return;

  const previous = useTicketStore.getState().tickets.find((t) => t.id === ticketId) as
    | (Record<string, unknown> & { status?: string })
    | undefined;
  if (!previous) return;
  const previousOwner =
    (previous.userId as number | null | undefined) ??
    (previous.user as { id?: number | null } | null | undefined)?.id ??
    null;
  const wasPendingUnowned = previous.status === "pending" && previousOwner == null;
  if (wasPendingUnowned) return;

  const auth = useAuthStore.getState();
  const user = auth.user;
  if (!user || user.userId == null || !auth.tenantConfigsLoaded) return;

  const { notifications, addNotification } = useNotificationStore.getState();
  if (notifications.some((n) => n.ticketId === ticketId)) return;

  const canSee = canUserSeeTicket(
    { ...patch, chatbot: !!patch.chatFlowId },
    user,
    buildTicketVisibilityConfig(),
  );
  if (!canSee) return;

  const contactName = (tk.contact as { name?: string } | null | undefined)?.name || labels.contactFallback;
  const lastMessage = typeof tk.lastMessage === "string" ? tk.lastMessage : "";
  const unread = Number(tk.unreadMessages ?? 0) || 0;
  addNotification({
    id: ticketId,
    ticketId,
    ticketIsGroup: !!tk.isGroup,
    message: `${contactName}: ${getTicketLastMessagePreview(lastMessage) || labels.newMessageFallback}`,
    read: unread === 0,
    createdAt: typeof tk.updatedAt === "string" ? tk.updatedAt : new Date().toISOString(),
    visibility: patch,
  });
}

/**
 * Revalida TODAS as entradas de atendimento do sino contra o estado atual (usuário, filas,
 * configurações do tenant e ticket do store quando existir). Cobre o que o evento de socket não
 * cobre: ticket:update perdido em queda de conexão, opção ligada pelo admin com a aba aberta,
 * fila/canal retirado do usuário. Devolve quantas entradas saíram.
 */
export function sweepTicketNotifications(): number {
  const { notifications, setNotifications } = useNotificationStore.getState();
  if (notifications.length === 0) return 0;
  const tickets = useTicketStore.getState().tickets;

  // Conjunto de ticketId (e não de `id`): a lista também recebe avisos internos, cujo id pode
  // coincidir com o id de um ticket.
  const revoked = new Set<number>();
  for (const n of notifications) {
    if (n.ticketId == null) continue;
    const storeTicket = tickets.find((tk) => tk.id === n.ticketId);
    if (!n.visibility && !storeTicket) continue;
    const visibility: TicketVisibilityData = {
      ...(n.visibility ?? {}),
      ...pickTicketVisibilityPatch(storeTicket),
    };
    if (shouldRevokeTicketNotification(visibility)) revoked.add(n.ticketId);
  }
  if (revoked.size === 0) return 0;
  setNotifications(notifications.filter((n) => n.ticketId == null || !revoked.has(n.ticketId)));
  return revoked.size;
}

/**
 * Revalidação no CLIQUE de uma entrada do sino. true = a entrada foi revogada agora (o caller
 * não navega e avisa "sem acesso"). Quando não há dado local para decidir devolve false e o
 * clique segue — o guard do backend é quem dá a palavra final ao abrir o atendimento.
 */
export function revokeTicketNotificationOnClick(ticketId: number): boolean {
  const { notifications, removeTicketNotification } = useNotificationStore.getState();
  const entry = notifications.find((n) => n.ticketId === ticketId);
  const storeTicket = useTicketStore.getState().tickets.find((tk) => tk.id === ticketId);
  if (!entry?.visibility && !storeTicket) return false;
  const visibility: TicketVisibilityData = {
    ...(entry?.visibility ?? {}),
    ...pickTicketVisibilityPatch(storeTicket),
  };
  if (!shouldRevokeTicketNotification(visibility)) return false;
  removeTicketNotification(ticketId);
  return true;
}
