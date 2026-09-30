import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useTicketStore } from "@/stores/ticket-store";
import { normalizeTicket } from "@/lib/normalize-ticket";
import {
  ensurePendingTicketNotification,
  pickTicketVisibilityPatch,
  revokeTicketNotificationOnClick,
  shouldRevokeTicketNotification,
  sweepTicketNotifications,
  syncTicketNotificationVisibility,
} from "@/lib/ticket-notification-visibility";

/**
 * Cenario do report: dois atendentes na MESMA fila, opcao "nao ver atendimentos atribuidos a
 * outros" ligada. O pendente pinga no sino dos dois; quando o colega aceita, a entrada tem de
 * sair do sino de quem nao aceitou.
 */
const FILA_A = 1;
const FILA_B = 2;
const EU = 301;
const COLEGA = 302;

type Cfg = { key: string; value: string };

function setAuth(opts: { configs?: Cfg[]; loaded?: boolean; profile?: string; queues?: { id: number }[] } = {}) {
  useAuthStore.setState({
    user: {
      userId: EU,
      profile: opts.profile ?? "user",
      queues: opts.queues ?? [{ id: FILA_A }],
      whatsappAllowed: [],
    },
    configuracoes: opts.configs ?? [{ key: "NotViewAssignedTickets", value: "enabled" }],
    tenantConfigsLoaded: opts.loaded ?? true,
    supervisorAdmin: "enabled",
  } as never);
}

function addTicketEntry(ticketId: number, visibility?: Record<string, unknown>, read = false) {
  useNotificationStore.getState().addNotification({
    id: ticketId,
    ticketId,
    message: "Contato: oi",
    read,
    createdAt: new Date().toISOString(),
    visibility: visibility as never,
  });
}

beforeEach(() => {
  localStorage.clear();
  useNotificationStore.setState({ notifications: [], internalNotifications: [], unreadCount: 0 });
  useTicketStore.setState({ tickets: [] } as never);
  setAuth();
});

describe("pickTicketVisibilityPatch", () => {
  it("so inclui chaves presentes no payload", () => {
    expect(pickTicketVisibilityPatch({ id: 7, unreadMessages: 0 })).toEqual({ id: 7 });
  });

  it("preserva userId null explicito mesmo com objeto user velho", () => {
    const patch = pickTicketVisibilityPatch({ id: 7, userId: null, user: { id: COLEGA } });
    expect(patch.userId).toBeNull();
  });

  it("le o ticket normalizado (user.id / queue.id / whatsapp.id)", () => {
    const patch = pickTicketVisibilityPatch({
      id: 7,
      user: { id: COLEGA },
      queue: { id: FILA_A },
      whatsapp: { id: 10 },
    });
    expect(patch).toMatchObject({ id: 7, userId: COLEGA, queueId: FILA_A, whatsappId: 10 });
  });

  it("so leva carteira quando o contato traz wallets", () => {
    expect(pickTicketVisibilityPatch({ id: 7, contact: { name: "x" } }).contact).toBeUndefined();
    expect(pickTicketVisibilityPatch({ id: 7, contact: { wallets: [{ id: EU }] } }).contact).toEqual({
      wallets: [{ id: EU }],
    });
  });

  it("lista de carteiras VAZIA nao e dado (normalizeTicket sempre grava wallets: [])", () => {
    expect(pickTicketVisibilityPatch({ id: 7, contact: { wallets: [] } }).contact).toBeUndefined();
    const normalized = normalizeTicket({ id: 7, userId: COLEGA, queueId: FILA_B, status: "open", contact: { id: 1, name: "x" } });
    expect(pickTicketVisibilityPatch(normalized).contact).toBeUndefined();
  });
});

describe("shouldRevokeTicketNotification", () => {
  it("revoga atendimento aceito por colega com a opcao ligada", () => {
    expect(shouldRevokeTicketNotification({ id: 7, userId: COLEGA, queueId: FILA_A })).toBe(true);
  });

  it("nao revoga pendente sem dono na minha fila", () => {
    expect(shouldRevokeTicketNotification({ id: 7, userId: null, queueId: FILA_A })).toBe(false);
  });

  it("nao revoga atendimento de colega na minha fila com a opcao DESLIGADA", () => {
    setAuth({ configs: [{ key: "NotViewAssignedTickets", value: "disabled" }] });
    expect(shouldRevokeTicketNotification({ id: 7, userId: COLEGA, queueId: FILA_A })).toBe(false);
  });

  it("revoga atendimento de colega em fila alheia mesmo com a opcao desligada", () => {
    setAuth({ configs: [{ key: "NotViewAssignedTickets", value: "disabled" }] });
    expect(shouldRevokeTicketNotification({ id: 7, userId: COLEGA, queueId: FILA_B })).toBe(true);
  });

  it("nunca revoga o atendimento do proprio usuario", () => {
    expect(shouldRevokeTicketNotification({ id: 7, userId: EU, queueId: FILA_B })).toBe(false);
  });

  it("nao revoga convite ativo (shared + userIdArray)", () => {
    expect(
      shouldRevokeTicketNotification({ id: 7, userId: COLEGA, queueId: FILA_A, shared: true, userIdArray: [EU] }),
    ).toBe(false);
  });

  it("fail-open: sem dono conhecido, sem fila conhecida ou com configs carregando", () => {
    expect(shouldRevokeTicketNotification({ id: 7 })).toBe(false);
    expect(shouldRevokeTicketNotification({ id: 7, userId: COLEGA })).toBe(false);
    setAuth({ loaded: false });
    expect(shouldRevokeTicketNotification({ id: 7, userId: COLEGA, queueId: FILA_A })).toBe(false);
  });

  it("admin nunca perde entrada", () => {
    setAuth({ profile: "admin" });
    expect(shouldRevokeTicketNotification({ id: 7, userId: COLEGA, queueId: FILA_B })).toBe(false);
  });
});

describe("syncTicketNotificationVisibility", () => {
  it("remove a entrada e acerta o contador quando o colega aceita", () => {
    addTicketEntry(7, { id: 7, userId: null, queueId: FILA_A });
    addTicketEntry(8, { id: 8, userId: null, queueId: FILA_A });
    expect(useNotificationStore.getState().unreadCount).toBe(2);

    syncTicketNotificationVisibility({ id: 7, userId: COLEGA, queueId: FILA_A, status: "open" });

    const state = useNotificationStore.getState();
    expect(state.notifications.map((n) => n.ticketId)).toEqual([8]);
    expect(state.unreadCount).toBe(1);
  });

  it("payload parcial nao revoga e nao apaga o retrato", () => {
    addTicketEntry(7, { id: 7, userId: null, queueId: FILA_A });
    syncTicketNotificationVisibility({ id: 7, unreadMessages: 0 });
    const entry = useNotificationStore.getState().notifications[0];
    expect(entry.visibility).toEqual({ id: 7, userId: null, queueId: FILA_A });
  });

  it("payload parcial so com o novo dono revoga usando a fila do retrato", () => {
    addTicketEntry(7, { id: 7, userId: null, queueId: FILA_A });
    syncTicketNotificationVisibility({ id: 7, userId: COLEGA });
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("atualiza o retrato quando o atendimento continua visivel", () => {
    addTicketEntry(7, { id: 7, userId: null, queueId: FILA_A });
    syncTicketNotificationVisibility({ id: 7, userId: EU, queueId: FILA_A });
    expect(useNotificationStore.getState().notifications[0].visibility).toMatchObject({ userId: EU });
  });

  it("nao toca em aviso interno com o mesmo id do ticket", () => {
    useNotificationStore.getState().addNotification({
      id: 7,
      message: "aviso interno",
      read: false,
      createdAt: new Date().toISOString(),
    });
    addTicketEntry(7, { id: 7, userId: null, queueId: FILA_A });
    syncTicketNotificationVisibility({ id: 7, userId: COLEGA, queueId: FILA_A });
    const left = useNotificationStore.getState().notifications;
    expect(left).toHaveLength(1);
    expect(left[0].ticketId).toBeUndefined();
  });

  it("sem entrada para o ticket nao faz nada", () => {
    syncTicketNotificationVisibility({ id: 99, userId: COLEGA, queueId: FILA_A });
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});

describe("sweepTicketNotifications / revokeTicketNotificationOnClick", () => {
  it("varredura tira so as entradas que o usuario nao pode mais ver", () => {
    addTicketEntry(7, { id: 7, userId: COLEGA, queueId: FILA_A });
    addTicketEntry(8, { id: 8, userId: null, queueId: FILA_A });
    addTicketEntry(9); // sem retrato e sem ticket no store: fica
    expect(sweepTicketNotifications()).toBe(1);
    expect(useNotificationStore.getState().notifications.map((n) => n.ticketId).sort()).toEqual([8, 9]);
  });

  it("varredura usa o ticket do store quando a entrada nao tem retrato", () => {
    addTicketEntry(7);
    useTicketStore.setState({ tickets: [{ id: 7, userId: COLEGA, queueId: FILA_A, status: "open" }] } as never);
    expect(sweepTicketNotifications()).toBe(1);
  });

  it("clique em entrada revogavel remove e devolve true; visivel devolve false", () => {
    addTicketEntry(7, { id: 7, userId: COLEGA, queueId: FILA_A });
    addTicketEntry(8, { id: 8, userId: null, queueId: FILA_A });
    expect(revokeTicketNotificationOnClick(7)).toBe(true);
    expect(revokeTicketNotificationOnClick(8)).toBe(false);
    expect(useNotificationStore.getState().notifications.map((n) => n.ticketId)).toEqual([8]);
  });

  it("clique sem dado local segue (backend decide)", () => {
    addTicketEntry(9);
    expect(revokeTicketNotificationOnClick(9)).toBe(false);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("dono da carteira nao perde a entrada quando o store traz o ticket normalizado (wallets: [])", () => {
    // Ticket de fila alheia, atribuido a colega, opcao desligada: visivel SO pela carteira.
    setAuth({ configs: [{ key: "NotViewAssignedTickets", value: "disabled" }] });
    addTicketEntry(7, { id: 7, userId: COLEGA, queueId: FILA_B, contact: { wallets: [{ id: EU }] } });
    // Recarga REST da lista: o store recebe o ticket normalizado, sem carteiras.
    const fromRest = normalizeTicket({ id: 7, userId: COLEGA, queueId: FILA_B, status: "open", contact: { id: 1, name: "x" } });
    useTicketStore.setState({ tickets: [fromRest] } as never);
    expect(sweepTicketNotifications()).toBe(0);
    expect(revokeTicketNotificationOnClick(7)).toBe(false);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });
});

describe("ensurePendingTicketNotification", () => {
  const labels = { contactFallback: "Contato", newMessageFallback: "Nova mensagem" };
  const returned = {
    id: 7,
    status: "pending",
    userId: null,
    queueId: FILA_A,
    unreadMessages: 2,
    lastMessage: "preciso de ajuda",
    contact: { name: "Maria" },
  };

  it("atendimento do colega devolvido a fila volta ao sino", () => {
    useTicketStore.setState({ tickets: [normalizeTicket({ id: 7, status: "open", userId: COLEGA, queueId: FILA_A })] } as never);
    ensurePendingTicketNotification(returned, labels);
    const [entry] = useNotificationStore.getState().notifications;
    expect(entry).toMatchObject({ ticketId: 7, read: false });
    expect(entry.message).toContain("Maria");
    expect(entry.visibility).toMatchObject({ userId: null, queueId: FILA_A });
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it("nao duplica entrada existente", () => {
    useTicketStore.setState({ tickets: [normalizeTicket({ id: 7, status: "open", userId: COLEGA, queueId: FILA_A })] } as never);
    addTicketEntry(7, { id: 7, userId: null, queueId: FILA_A });
    ensurePendingTicketNotification(returned, labels);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("pendente que JA era pendente sem dono nao gera entrada (acao em massa nao inunda o sino)", () => {
    useTicketStore.setState({ tickets: [normalizeTicket({ id: 7, status: "pending", userId: null, queueId: FILA_A })] } as never);
    ensurePendingTicketNotification(returned, labels);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("ticket fora do store, payload parcial ou fila alheia nao geram entrada", () => {
    ensurePendingTicketNotification(returned, labels); // fora do store
    useTicketStore.setState({ tickets: [normalizeTicket({ id: 7, status: "open", userId: COLEGA, queueId: FILA_A })] } as never);
    ensurePendingTicketNotification({ id: 7, status: "pending" }, labels); // parcial
    ensurePendingTicketNotification({ ...returned, queueId: FILA_B }, labels); // fila alheia (nullTickets padrao libera sem dono)
    const state = useNotificationStore.getState();
    // Sem dono + nullTickets nao desabilitado = visivel pela regra do tenant: so este ultimo entra.
    expect(state.notifications.map((n) => n.ticketId)).toEqual([7]);
  });

  it("fila alheia com nullTickets desabilitado nao entra", () => {
    setAuth({ configs: [{ key: "NotViewAssignedTickets", value: "enabled" }, { key: "nullTickets", value: "disabled" }] });
    useTicketStore.setState({ tickets: [normalizeTicket({ id: 7, status: "open", userId: COLEGA, queueId: FILA_B })] } as never);
    ensurePendingTicketNotification({ ...returned, queueId: FILA_B }, labels);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
