import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const handlers = new Map<string, (data: { type: string; payload: Record<string, unknown> }) => void>();
const mockSocket = {
  on: vi.fn((ev: string, fn: never) => handlers.set(ev, fn)),
  off: vi.fn(),
  emit: vi.fn(),
  io: { on: vi.fn(), off: vi.fn() },
};

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/socket", () => ({ getSocket: () => mockSocket }));
vi.mock("@/lib/notification-audio", () => ({ playNotificationSound: vi.fn() }));
vi.mock("@/services/tickets", () => ({ fetchTickets: vi.fn(async () => ({ data: { tickets: [] } })) }));

import { playNotificationSound } from "@/lib/notification-audio";
import { useAuthStore } from "@/stores/auth-store";
import { useBrandingStore } from "@/stores/branding-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useTicketStore } from "@/stores/ticket-store";
import { useSocketTickets } from "@/hooks/use-socket-tickets";
import { useSocketTicketsOtm } from "@/hooks/use-socket-tickets-otm";

/**
 * Cenário do report: "Fechar a conversa na hora" + pesquisa pendente. O backend grava a
 * resposta do cliente no atendimento FECHADO (sem reabrir) e emite chat:create com o
 * atendimento aninhado. A nota não pode tocar som nem entrar no sino do atendente; texto
 * que não é nota continua avisando.
 */
const TENANT = 1;
const EU = 18;
const FILA = 63;

function chatCreate(ticketId: number, body: string, status: string) {
  return {
    type: "chat:create",
    payload: {
      id: `m-${ticketId}-${body}`,
      messageId: `m-${ticketId}-${body}`,
      ticketId,
      body,
      fromMe: false,
      ticket: {
        id: ticketId,
        status,
        userId: EU,
        queueId: FILA,
        whatsappId: 331,
        isGroup: false,
        chatFlowId: null,
        contact: { id: 5, name: "Samuel Vinicius" },
      },
    },
  };
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;

// Os dois hooks são montados de verdade; cada um só assina no seu modo de socket.
function Probe() {
  useSocketTickets();
  useSocketTicketsOtm();
  return null;
}

function setup(optimized: boolean) {
  handlers.clear();
  localStorage.clear();
  vi.mocked(playNotificationSound).mockClear();
  useNotificationStore.setState({ notifications: [], internalNotifications: [], unreadCount: 0 });
  useTicketStore.setState({ tickets: [], currentTicket: null } as never);
  useBrandingStore.setState({ socketModelOptimized: optimized } as never);
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: EU, tenantId: TENANT, profile: "user", queues: [{ id: FILA }], whatsappAllowed: [] },
    configuracoes: [
      { key: "ratingMaxScore", value: "5" },
      { key: "notificationSilenced", value: "enabled" },
    ],
    tenantConfigsLoaded: true,
    supervisorAdmin: "enabled",
  } as never);
  const container = document.createElement("div");
  act(() => {
    root = createRoot(container);
    root.render(<Probe />);
  });
  const handle = handlers.get(`${TENANT}:ticketList`);
  if (!handle) throw new Error("hook não assinou o evento de tickets");
  return handle;
}

const bell = () => useNotificationStore.getState().notifications.map((n) => n.ticketId);

describe.each([
  ["padrão", false],
  ["otimizado", true],
])("socket %s: resposta à pesquisa em atendimento fechado", (_name, optimized) => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  it("nota válida no fechado: sem som e sem sino", () => {
    const handle = setup(optimized);
    act(() => handle(chatCreate(651, "5", "closed")));
    expect(bell()).toEqual([]);
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it("texto do cliente no fechado continua avisando", () => {
    const handle = setup(optimized);
    act(() => handle(chatCreate(652, "ainda não resolveu", "closed")));
    expect(bell()).toEqual([652]);
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("número acima da escala no fechado continua avisando", () => {
    const handle = setup(optimized);
    act(() => handle(chatCreate(653, "7", "closed")));
    expect(bell()).toEqual([653]);
  });

  it("nota em atendimento aberto continua avisando", () => {
    const handle = setup(optimized);
    act(() => handle(chatCreate(654, "5", "open")));
    expect(bell()).toEqual([654]);
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });
});
