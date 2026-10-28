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
 * Botão de som do topo nos dois hooks de tempo real: o som de mensagem recebe se é grupo
 * (quem decide é o playNotificationSound) e o aviso do navegador sai com `silent` para quem
 * desligou aquele som — o aviso continua aparecendo.
 */
const TENANT = 1;
const EU = 18;
const FILA = 63;

function chatCreate(ticketId: number, isGroup: boolean) {
  return {
    type: "chat:create",
    payload: {
      id: `m-${ticketId}`,
      messageId: `m-${ticketId}`,
      ticketId,
      body: "bom dia",
      fromMe: false,
      ticket: {
        id: ticketId,
        status: "open",
        userId: EU,
        queueId: FILA,
        whatsappId: 331,
        isGroup,
        chatFlowId: null,
        contact: { id: 5, name: isGroup ? "Grupo da loja" : "Samuel Vinicius", isGroup },
      },
    },
  };
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const popups: Array<{ title: string; options: Record<string, unknown> }> = [];

function Probe() {
  useSocketTickets();
  useSocketTicketsOtm();
  return null;
}

function setup(optimized: boolean, mode: "none" | "groups" | "all") {
  handlers.clear();
  localStorage.clear();
  popups.length = 0;
  vi.mocked(playNotificationSound).mockClear();
  useNotificationStore.setState({ notifications: [], internalNotifications: [], unreadCount: 0 });
  useTicketStore.setState({ tickets: [], currentTicket: null } as never);
  useBrandingStore.setState({ socketModelOptimized: optimized } as never);
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      userId: EU,
      tenantId: TENANT,
      profile: "user",
      queues: [{ id: FILA }],
      whatsappAllowed: [],
      configs: { notificationSoundMute: mode },
    },
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

describe.each([
  ["padrão", false],
  ["otimizado", true],
])("socket %s: som desligado pelo usuário", (_name, optimized) => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal(
      "Notification",
      class {
        static permission = "granted";
        constructor(title: string, options: Record<string, unknown>) {
          popups.push({ title, options });
        }
      },
    );
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.unstubAllGlobals();
  });

  it("mensagem de grupo avisa que é grupo e o aviso sai sem som para quem silenciou grupos", () => {
    const handle = setup(optimized, "groups");
    act(() => handle(chatCreate(701, true)));
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playNotificationSound).mock.calls[0][1]).toEqual({ group: true });
    expect(popups).toHaveLength(1);
    expect(popups[0].options.silent).toBe(true);
  });

  it("conversa comum com grupos silenciados: aviso com som, como antes", () => {
    const handle = setup(optimized, "groups");
    act(() => handle(chatCreate(702, false)));
    expect(vi.mocked(playNotificationSound).mock.calls[0][1]).toEqual({ group: false });
    expect(popups).toHaveLength(1);
    expect("silent" in popups[0].options).toBe(false);
  });

  it("tudo sem som: o aviso continua aparecendo, sem som", () => {
    const handle = setup(optimized, "all");
    act(() => handle(chatCreate(703, false)));
    expect(popups).toHaveLength(1);
    expect(popups[0].options.silent).toBe(true);
  });

  it("som ligado: aviso igual ao de antes", () => {
    const handle = setup(optimized, "none");
    act(() => handle(chatCreate(704, true)));
    expect(popups).toHaveLength(1);
    expect("silent" in popups[0].options).toBe(false);
  });

  it("atendimento novo de grupo em pendentes: aviso sem som para quem silenciou grupos", () => {
    const handle = setup(optimized, "groups");
    act(() => handle(ticketCreate(705, true)));
    expect(popups).toHaveLength(1);
    expect(popups[0].options.silent).toBe(true);
    // O hook padrão também toca o som no ticket:create; o otimizado só abre o aviso.
    if (!optimized) {
      expect(vi.mocked(playNotificationSound).mock.calls[0][1]).toEqual({ group: true });
    }
  });

  it("atendimento novo comum com grupos silenciados: aviso com som", () => {
    const handle = setup(optimized, "groups");
    act(() => handle(ticketCreate(706, false)));
    expect(popups).toHaveLength(1);
    expect("silent" in popups[0].options).toBe(false);
  });

  it("notification:new informa se o atendimento é de grupo", () => {
    const handle = setup(optimized, "groups");
    act(() => handle({ type: "notification:new", payload: ticketPayload(707, "pending", true) }));
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playNotificationSound).mock.calls[0][1]).toEqual({ group: true });
  });
});

function ticketPayload(id: number, status: string, isGroup: boolean) {
  return {
    id,
    status,
    userId: null,
    queueId: FILA,
    whatsappId: 331,
    isGroup,
    chatFlowId: null,
    createdAt: new Date().toISOString(),
    contact: { id: 9, name: isGroup ? "Grupo da loja" : "Samuel Vinicius", isGroup },
  };
}

function ticketCreate(id: number, isGroup: boolean) {
  return { type: "ticket:create", payload: ticketPayload(id, "pending", isGroup) };
}
