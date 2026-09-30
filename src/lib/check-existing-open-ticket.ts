import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { fetchCrossChannelSiblings, type CrossChannelSibling } from "@/services/tickets";

export interface ExistingOpenTicket {
  ticketId: number;
  status: string;
  ownerId: number | null;
  ownerName: string | null;
  contactName: string | null;
  queueName: string | null;
  whatsappId: number | null;
  whatsappName: string | null;
  /** true = está no MESMO canal do ticket-alvo da ação (duplicata direta). */
  sameChannel?: boolean;
  // Demais open/pending do MESMO contato (além deste, o principal) — o dialog
  // lista todos para a decisão não ser tomada vendo só um. Ausente/vazio quando
  // não há outros ou quando o backend ainda não devolve `tickets` (build antiga).
  siblings?: ExistingOpenTicket[];
}

interface CheckTicketDto {
  id: number;
  status: string;
  userId: number | null;
  user: { id: number; name: string } | null;
  contact: { id: number; name: string; number: string } | null;
  queue: { id: number; queue: string } | null;
  whatsapp: { id: number; name: string } | null;
}

interface CheckResponse {
  found: boolean;
  ticket?: CheckTicketDto;
  tickets?: CheckTicketDto[];
}

function toExistingOpenTicket(t: CheckTicketDto): ExistingOpenTicket {
  return {
    ticketId: Number(t.id),
    status: String(t.status || ""),
    ownerId: t.userId != null ? Number(t.userId) : null,
    ownerName: t.user?.name ?? null,
    contactName: t.contact?.name ?? null,
    queueName: t.queue?.queue ?? null,
    whatsappId: t.whatsapp?.id != null ? Number(t.whatsapp.id) : null,
    whatsappName: t.whatsapp?.name ?? null,
  };
}

function digitsOnly(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

/**
 * Pre-check usado pela "Iniciar Conversa Avulsa". Consulta endpoint backend
 * dedicado (`/ticketscheck-by-number`) que IGNORA filtros de visibilidade do
 * operador chamador — necessario porque /tickets-frontnovo aplica visibilidade
 * (whatsappAllowed/userId/queueId) e oculta tickets de outros operadores,
 * justamente o que precisamos detectar.
 *
 * Retorna o ticket open/pending pertencendo a OUTRO operador (ou pendente sem
 * dono). Quando o tenant tem crossChannelTicketCheck ligado, o backend devolve
 * ticket de QUALQUER canal; nesse caso um ticket do PROPRIO operador em canal
 * DIFERENTE do alvo ainda eh retornado (para avisar da conversa cross-canal).
 * Devolve null quando o ticket eh do proprio operador NO MESMO canal, ou se nao ha.
 *
 * Espelha `abrirAtendimentoExistente` do front legado.
 */
export async function findExistingOpenTicket(opts: {
  number: string;
  whatsappId: number;
  currentUserId: number | null;
}): Promise<ExistingOpenTicket | null> {
  const { number, whatsappId, currentUserId } = opts;
  const search = digitsOnly(number);
  if (!search || !whatsappId) return null;

  let payload: CheckResponse | null = null;
  try {
    const { data } = await api.get<CheckResponse>("/ticketscheck-by-number", {
      params: { number: search, whatsappId },
    });
    payload = data;
  } catch {
    return null;
  }

  if (!payload?.found || !payload.ticket) return null;
  const t = payload.ticket;

  // Suprime o aviso apenas quando o ticket eh do PROPRIO operador E no MESMO canal
  // alvo. Com a flag cross-canal ligada o backend pode devolver ticket de OUTRO
  // canal: nesse caso, mesmo sendo do proprio operador, seguimos avisando (evita
  // duplicar a mesma pessoa em 2 canais). Com a flag desligada o backend so devolve
  // ticket do mesmo canal, entao sameChannel eh sempre true e o comportamento fica
  // identico ao legado (suprime quando eh o proprio operador). Se o canal do ticket
  // nao for determinavel, trata como mesmo canal (preserva a supressao legada).
  const sameOwner = t.userId != null && currentUserId != null && Number(t.userId) === Number(currentUserId);
  const sameChannel = t.whatsapp?.id == null || Number(t.whatsapp.id) === Number(whatsappId);
  if (sameOwner && sameChannel) return null;

  const primary = toExistingOpenTicket(t);
  const siblings = (payload.tickets ?? [])
    .map(toExistingOpenTicket)
    .filter((s) => s.ticketId !== primary.ticketId);
  if (siblings.length) primary.siblings = siblings;
  return primary;
}

function siblingToExistingOpenTicket(s: CrossChannelSibling): ExistingOpenTicket {
  return {
    ticketId: Number(s.ticketId),
    status: String(s.status || ""),
    ownerId: s.ownerId != null ? Number(s.ownerId) : null,
    ownerName: s.ownerName ?? null,
    contactName: s.contactName ?? null,
    queueName: s.queueName ?? null,
    whatsappId: s.whatsappId != null ? Number(s.whatsappId) : null,
    whatsappName: s.whatsappName ?? null,
    sameChannel: s.sameChannel === true,
  };
}

/**
 * Pre-check para ações sobre um ticket JÁ existente (aceitar pendente, reabrir
 * fechado): devolve o atendimento open/pending do MESMO contato que torna a ação
 * uma duplicata, ou null quando não há motivo para avisar.
 *
 * `includeSameChannel` define o escopo do GATILHO, não o da lista:
 * - false (aceitar pendente): só irmão em OUTRO canal dispara o aviso — gated pela
 *   flag do tenant crossChannelTicketCheck (desligada → nem consulta).
 * - true (reabrir fechado): irmão no MESMO canal também dispara. É a duplicata
 *   direta (reabrir #A com #B já aberto no mesmo canal = duas conversas paralelas)
 *   e NÃO é gated pela flag, por não ser cross-canal.
 *
 * A LISTA exibida no dialog ("Outros atendimentos em aberto") é sempre a completa:
 * com a flag ligada os irmãos de mesmo canal vêm junto mesmo quando não são o
 * motivo do aviso — o operador decide vendo o quadro inteiro, que é como o
 * /ticketscheck-by-number se comportava antes.
 *
 * Usa o endpoint BATELADO (chaveado por ticketId): ele já exclui o próprio ticket,
 * casa variantes BR e devolve TODOS os irmãos — sem o `limit:1` nem a supressão
 * "mesmo dono" do /ticketscheck-by-number, que aqui esconderiam a duplicata (um
 * segundo atendimento aberto com o PRÓPRIO operador também é duplicata).
 *
 * Nunca lança (best-effort: qualquer erro devolve null e a ação prossegue).
 */
/**
 * Pré-check da TROCA DE CANAL de um ticket: devolve o atendimento open/pending do
 * mesmo contato que JÁ vive no canal de DESTINO (duplicata direta pós-transferência),
 * ou null quando não há motivo para avisar. Passa o canal de destino como
 * `whatsappId` do item — o backend classifica `sameChannel` contra o valor enviado,
 * então "mesmo canal" aqui significa "no canal de destino". NÃO é gated pela flag
 * cross-canal (duplicata direta, espelho do gatilho da reabertura).
 * Nunca lança (best-effort: erro devolve null e a transferência segue).
 */
export async function findOpenTicketOnTargetChannel(opts: {
  ticketId: number;
  number: string | null | undefined;
  targetWhatsappId: number | null | undefined;
}): Promise<ExistingOpenTicket | null> {
  try {
    const ticketId = Number(opts.ticketId);
    const wid = Number(opts.targetWhatsappId ?? 0);
    const num = digitsOnly(opts.number);
    if (!ticketId || !num || !(wid > 0)) return null;

    const { data } = await fetchCrossChannelSiblings(
      [{ ticketId, number: num, whatsappId: wid }],
      { includeSameChannel: true }
    );
    const list = data?.siblings?.[ticketId] || [];
    // Gatilho: só o irmão que JÁ está no canal de destino avisa; os demais entram
    // apenas como informação na lista do dialog (quando a flag cross os devolve).
    if (!list.some((s) => s.sameChannel === true)) return null;

    const ordered = [...list].sort((a, b) => {
      const av = a.sameChannel === true ? 1 : 0;
      const bv = b.sameChannel === true ? 1 : 0;
      return bv - av;
    });
    const [primary, ...rest] = ordered.map(siblingToExistingOpenTicket);
    if (rest.length) primary.siblings = rest;
    return primary;
  } catch {
    return null;
  }
}

/**
 * Variante BATELADA do pré-check de troca de canal (transferência em massa):
 * devolve Map ticketId -> atendimento já aberto no canal de destino, apenas para
 * os tickets em conflito. Nunca lança (erro devolve o que já coletou).
 */
export async function findOpenTicketsOnTargetChannelBulk(
  items: Array<{ ticketId: number; number: string | null | undefined }>,
  targetWhatsappId: number
): Promise<Map<number, ExistingOpenTicket>> {
  const out = new Map<number, ExistingOpenTicket>();
  try {
    const wid = Number(targetWhatsappId ?? 0);
    if (!(wid > 0)) return out;
    const valid = items
      .map((i) => ({ ticketId: Number(i.ticketId), number: digitsOnly(i.number), whatsappId: wid }))
      .filter((i) => i.ticketId > 0 && !!i.number);
    if (!valid.length) return out;
    // O backend corta em 50 itens por request: fatia para cobrir seleções maiores.
    for (let i = 0; i < valid.length; i += 50) {
      const { data } = await fetchCrossChannelSiblings(valid.slice(i, i + 50), {
        includeSameChannel: true,
      });
      const map = data?.siblings || {};
      Object.entries(map).forEach(([tid, list]) => {
        const hit = (list || []).find((s) => s.sameChannel === true);
        if (hit) out.set(Number(tid), siblingToExistingOpenTicket(hit));
      });
    }
    return out;
  } catch {
    return out;
  }
}

export async function findCrossChannelSiblingForTicket(opts: {
  ticketId: number;
  number: string | null | undefined;
  whatsappId: number | null | undefined;
  includeSameChannel?: boolean;
}): Promise<ExistingOpenTicket | null> {
  try {
    const sameChannelTriggers = opts.includeSameChannel === true;
    const { getConfigValue } = useAuthStore.getState();
    const crossEnabled = getConfigValue("crossChannelTicketCheck") === "enabled";
    // Nada a consultar: cross desligado e mesmo canal não dispara nesta ação.
    if (!crossEnabled && !sameChannelTriggers) return null;

    const ticketId = Number(opts.ticketId);
    const wid = Number(opts.whatsappId ?? 0);
    const num = digitsOnly(opts.number);
    if (!ticketId || !num || !(wid > 0)) return null;

    // Pede o mesmo canal sempre que ele for gatilho OU quando a flag está ligada
    // (aí ele entra só como informação na lista do dialog).
    const { data } = await fetchCrossChannelSiblings(
      [{ ticketId, number: num, whatsappId: wid }],
      { includeSameChannel: sameChannelTriggers || crossEnabled }
    );
    const list = data?.siblings?.[ticketId] || [];
    if (!list.length) return null;

    // Gatilho: quando só o outro canal avisa, irmão de mesmo canal sozinho não
    // abre o dialog (o backend já recusa criar/aceitar duplicata no mesmo canal).
    const hasOtherChannel = list.some((s) => s.sameChannel !== true);
    if (!sameChannelTriggers && !hasOtherChannel) return null;

    // Ordena o "principal" do dialog. Reabrir: mesmo canal primeiro (duplicata mais
    // grave). Aceitar: outro canal primeiro — é o que motiva o aviso e o único que
    // libera o botão de prosseguir. sort() estável mantém updatedAt DESC dentro de
    // cada grupo.
    const ordered = [...list].sort((a, b) => {
      const av = a.sameChannel === true ? 1 : 0;
      const bv = b.sameChannel === true ? 1 : 0;
      return sameChannelTriggers ? bv - av : av - bv;
    });
    const [primary, ...rest] = ordered.map(siblingToExistingOpenTicket);
    if (rest.length) primary.siblings = rest;
    return primary;
  } catch {
    return null;
  }
}
