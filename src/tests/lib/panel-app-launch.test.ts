import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Painel lateral das apps (lib/panel-app-launch.ts): só o ÚLTIMO clique abre. A resposta que
 * chega depois de outro clique, de outra página ou de outro atendimento na tela é
 * descartada — nunca a app com os dados de um cliente por cima da tela de outro.
 */

const launchMock = vi.fn();
vi.mock("@/services/panel-apps", () => ({
  launchPanelApp: (appId: number, body: unknown) => launchMock(appId, body),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

type LaunchLib = typeof import("@/lib/panel-app-launch");
type AppsStore = typeof import("@/stores/panel-apps-store");
type TicketStore = typeof import("@/stores/ticket-store");
let lib: LaunchLib;
let apps: AppsStore;
let tickets: TicketStore;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const app = {
  id: 7,
  scope: "tenant" as const,
  name: "CRM",
  url: "https://crm.example.com/c/{{contactId}}",
  icon: "app-window",
  category: "ferramentas",
  position: 0,
  openMode: "embed" as const,
  embedCheck: null,
  placements: ["contact" as const, "ticket" as const],
  needsLaunch: true,
};

const linkFor = (id: number) => ({ url: `https://crm.example.com/c/${id}?t=a.b`, expiresAt: Date.now() + 300_000 });
const t = (key: string) => key;
const setTicketOnScreen = (id: number | null) =>
  tickets.useTicketStore.setState({ currentTicket: id === null ? null : ({ id } as never) });

beforeEach(async () => {
  // O número do clique é do módulo: cada teste começa do zero.
  vi.resetModules();
  launchMock.mockReset();
  window.history.replaceState({}, "", "/contatos");
  lib = await import("@/lib/panel-app-launch");
  apps = await import("@/stores/panel-apps-store");
  tickets = await import("@/stores/ticket-store");
  apps.usePanelAppsStore.setState({ sheet: null });
  setTicketOnScreen(null);
});

describe("painel lateral: só o último clique abre", () => {
  it("abre com o link do contato clicado", async () => {
    launchMock.mockResolvedValueOnce(linkFor(1));
    const result = await lib.openPanelAppLaunch({ app, placement: "contact", contactId: 1, t });
    expect(result).toBe("sheet");
    expect(apps.usePanelAppsStore.getState().sheet?.contactId).toBe(1);
    expect(apps.usePanelAppsStore.getState().sheet?.url).toBe(linkFor(1).url);
  });

  it("resposta atrasada do contato A não substitui o painel do contato B", async () => {
    const slowA = deferred<ReturnType<typeof linkFor>>();
    launchMock.mockImplementationOnce(() => slowA.promise).mockResolvedValueOnce(linkFor(2));

    const pendingA = lib.openPanelAppLaunch({ app, placement: "contact", contactId: 1, t });
    const resultB = await lib.openPanelAppLaunch({ app, placement: "contact", contactId: 2, t });
    expect(resultB).toBe("sheet");

    slowA.resolve(linkFor(1));
    expect(await pendingA).toBe("busy");
    expect(apps.usePanelAppsStore.getState().sheet?.contactId).toBe(2);
    expect(apps.usePanelAppsStore.getState().sheet?.url).toBe(linkFor(2).url);
  });

  it("página trocada antes da resposta: não abre", async () => {
    const slow = deferred<ReturnType<typeof linkFor>>();
    launchMock.mockImplementationOnce(() => slow.promise);

    const pending = lib.openPanelAppLaunch({ app, placement: "contact", contactId: 1, t });
    window.history.pushState({}, "", "/atendimento");
    slow.resolve(linkFor(1));

    expect(await pending).toBe("busy");
    expect(apps.usePanelAppsStore.getState().sheet).toBeNull();
  });

  it("no /atendimento, outro atendimento na tela antes da resposta: não abre", async () => {
    window.history.replaceState({}, "", "/atendimento");
    setTicketOnScreen(10);
    const slow = deferred<ReturnType<typeof linkFor>>();
    launchMock.mockImplementationOnce(() => slow.promise);

    const pending = lib.openPanelAppLaunch({ app, placement: "ticket", ticketId: 10, t });
    setTicketOnScreen(11);
    slow.resolve(linkFor(10));

    expect(await pending).toBe("busy");
    expect(apps.usePanelAppsStore.getState().sheet).toBeNull();
  });

  it("no /atendimento, mesmo atendimento na tela: abre", async () => {
    window.history.replaceState({}, "", "/atendimento");
    setTicketOnScreen(10);
    launchMock.mockResolvedValueOnce(linkFor(10));

    const result = await lib.openPanelAppLaunch({ app, placement: "ticket", ticketId: 10, t });
    expect(result).toBe("sheet");
    expect(apps.usePanelAppsStore.getState().sheet?.ticketId).toBe(10);
  });

  it("contato aberto a partir de um atendimento leva a dica, e o Recarregar repete", async () => {
    launchMock.mockResolvedValue(linkFor(1));
    await lib.openPanelAppLaunch({ app, placement: "contact", contactId: 1, ticketIdHint: 99, t });
    expect(launchMock).toHaveBeenLastCalledWith(7, expect.objectContaining({ placement: "contact", contactId: 1, ticketIdHint: 99 }));
    expect(apps.usePanelAppsStore.getState().sheet?.ticketIdHint).toBe(99);

    await lib.relaunchPanelAppSheet(t);
    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(launchMock).toHaveBeenLastCalledWith(7, expect.objectContaining({ placement: "contact", ticketIdHint: 99 }));
  });

  it("pelo atendimento a dica não vai", async () => {
    window.history.replaceState({}, "", "/atendimento");
    setTicketOnScreen(10);
    launchMock.mockResolvedValueOnce(linkFor(10));
    await lib.openPanelAppLaunch({ app, placement: "ticket", ticketId: 10, ticketIdHint: 99, t });
    const body = launchMock.mock.calls[launchMock.mock.calls.length - 1][1] as Record<string, unknown>;
    expect(body.ticketIdHint).toBeUndefined();
    expect(body.ticketId).toBe(10);
  });

  it("app sem variável aberta depois passa à frente do lançamento pendente", async () => {
    const slow = deferred<ReturnType<typeof linkFor>>();
    launchMock.mockImplementationOnce(() => slow.promise);
    const plain = { ...app, id: 8, url: "https://outra.example.com/", needsLaunch: false };

    const pending = lib.openPanelAppLaunch({ app, placement: "contact", contactId: 1, t });
    expect(await lib.openPanelAppLaunch({ app: plain, placement: "contact", contactId: 2, t })).toBe("sheet");
    slow.resolve(linkFor(1));

    expect(await pending).toBe("busy");
    expect(apps.usePanelAppsStore.getState().sheet?.app.id).toBe(8);
  });
});
