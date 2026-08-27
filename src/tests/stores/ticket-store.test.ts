import { describe, it, expect, beforeEach } from "vitest";
import { useTicketStore } from "@/stores/ticket-store";
import { setQueueCache } from "@/lib/queue-cache";

describe("ticket-store", () => {
  beforeEach(() => {
    useTicketStore.setState({
      tickets: [],
      currentTicket: null,
      messages: [],
      hasMore: true,
      loading: false,
    });
  });

  it("starts with empty state", () => {
    const state = useTicketStore.getState();
    expect(state.tickets).toHaveLength(0);
    expect(state.currentTicket).toBeNull();
    expect(state.loading).toBe(false);
  });

  it("setTickets replaces all tickets", () => {
    const { setTickets } = useTicketStore.getState();
    const tickets = [
      {
        id: 1,
        status: "open",
        lastMessage: "",
        unreadMessages: 0,
        isGroup: false,
        contact: { id: 1, name: "Test", number: "123" },
        createdAt: "",
        updatedAt: "",
      },
      {
        id: 2,
        status: "closed",
        lastMessage: "",
        unreadMessages: 0,
        isGroup: false,
        contact: { id: 2, name: "Test", number: "456" },
        createdAt: "",
        updatedAt: "",
      },
    ];
    setTickets(tickets);

    expect(useTicketStore.getState().tickets).toHaveLength(2);
  });

  it("updateTicket updates an existing ticket", () => {
    const { setTickets, updateTicket } = useTicketStore.getState();
    setTickets([
      {
        id: 1,
        status: "open",
        lastMessage: "",
        unreadMessages: 0,
        isGroup: false,
        contact: { id: 1, name: "Test", number: "123" },
        createdAt: "",
        updatedAt: "",
      },
    ]);
    updateTicket({ id: 1, status: "closed" });

    expect(useTicketStore.getState().tickets[0].status).toBe("closed");
  });

  it("setCurrentTicket sets the active ticket", () => {
    const { setCurrentTicket } = useTicketStore.getState();
    setCurrentTicket({
      id: 5,
      status: "open",
      lastMessage: "",
      unreadMessages: 0,
      isGroup: false,
      contact: { id: 5, name: "Test", number: "789" },
      createdAt: "",
      updatedAt: "",
    });

    expect(useTicketStore.getState().currentTicket?.id).toBe(5);
  });

  it("setLoading toggles loading state", () => {
    const { setLoading } = useTicketStore.getState();
    setLoading(true);
    expect(useTicketStore.getState().loading).toBe(true);
    setLoading(false);
    expect(useTicketStore.getState().loading).toBe(false);
  });

  // Bug "ticket na fila X no banco, painel sem fila": um ticket:update "magro"
  // chega so com o queueId escalar (sem o objeto queue). O store resolve nome/cor
  // pelo cache de filas para a badge nao sumir do /atendimento.
  it("updateTicket resolves queue name/color from cache on thin emit", () => {
    setQueueCache([{ id: 11, queue: "Suporte", color: "#ff0000" }]);
    const { setTickets, updateTicket } = useTicketStore.getState();
    setTickets([
      {
        id: 1,
        status: "pending",
        lastMessage: "",
        unreadMessages: 0,
        isGroup: false,
        contact: { id: 1, name: "Test", number: "123" },
        createdAt: "",
        updatedAt: "",
      },
    ]);
    // Emit magro: queueId escalar, sem objeto queue.
    updateTicket({ id: 1, queueId: 11 } as never);

    expect(useTicketStore.getState().tickets[0].queue).toEqual({
      id: 11,
      name: "Suporte",
      color: "#ff0000",
    });
  });

  it("updateTicket keeps queue id on thin emit when queue is unknown to cache", () => {
    const { setTickets, updateTicket } = useTicketStore.getState();
    setTickets([
      {
        id: 1,
        status: "pending",
        lastMessage: "",
        unreadMessages: 0,
        isGroup: false,
        contact: { id: 1, name: "Test", number: "123" },
        createdAt: "",
        updatedAt: "",
      },
    ]);
    updateTicket({ id: 1, queueId: 99 } as never);

    const q = useTicketStore.getState().tickets[0].queue;
    expect(q?.id).toBe(99);
    expect(q?.color).toBe("#666");
  });

  it("updateTicket preserves tags on thin emit (patch sem a chave tags)", () => {
    const { setTickets, updateTicket } = useTicketStore.getState();
    setTickets([
      {
        id: 1,
        status: "open",
        lastMessage: "",
        unreadMessages: 0,
        isGroup: false,
        contact: { id: 1, name: "Test", number: "123", tags: [{ id: 5, name: "VIP", color: "#f00" }] },
        tags: [{ id: 5, tag: "VIP", color: "#f00" }],
        createdAt: "",
        updatedAt: "",
      },
    ]);
    // Patch parcial de chat:create (lastMessage/unread) — nao pode zerar etiquetas.
    updateTicket({ id: 1, lastMessage: "oi", unreadMessages: 2 });

    const tk = useTicketStore.getState().tickets[0];
    expect(tk.tags).toHaveLength(1);
    expect(tk.tags?.[0].id).toBe(5);
  });

  it("updateTicket clears tags when the payload sends an explicit empty list", () => {
    const { setTickets, updateTicket } = useTicketStore.getState();
    setTickets([
      {
        id: 1,
        status: "open",
        lastMessage: "",
        unreadMessages: 0,
        isGroup: false,
        contact: { id: 1, name: "Test", number: "123" },
        tags: [{ id: 5, tag: "VIP", color: "#f00" }],
        createdAt: "",
        updatedAt: "",
      },
    ]);
    // Payload gordo pos-remocao da etiqueta: [] explicito limpa de verdade.
    updateTicket({ id: 1, tags: [] });

    expect(useTicketStore.getState().tickets[0].tags).toEqual([]);
  });

  it("updateTicket preserves contact.tags when the contact patch omits them", () => {
    const { setTickets, updateTicket } = useTicketStore.getState();
    setTickets([
      {
        id: 1,
        status: "open",
        lastMessage: "",
        unreadMessages: 0,
        isGroup: false,
        contact: { id: 1, name: "Test", number: "123", tags: [{ id: 5, name: "VIP", color: "#f00" }] },
        createdAt: "",
        updatedAt: "",
      },
    ]);
    updateTicket({ id: 1, contact: { id: 1, name: "Test", number: "123" } });

    expect(useTicketStore.getState().tickets[0].contact.tags).toHaveLength(1);
  });
});
