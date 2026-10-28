import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";

// Servidor simulado pelo adaptador do axios: cada teste diz o que cada rota responde.
type Reply = { status: number; data?: unknown } | "network";
type Route = (config: InternalAxiosRequestConfig) => Reply;

const OLD = "velho.token.jwt";
const NEW = "novo.token.jwt";
const CSRF_STORED = "c".repeat(64);
const CSRF_NEW = "d".repeat(64);

async function loadApi(routes: Record<string, Route>) {
  vi.resetModules();
  const { logger } = await import("@/lib/logger");
  const loggerError = vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  const { useAuthStore } = await import("@/stores/auth-store");
  const { default: api } = await import("@/lib/api");
  const calls: Call[] = [];
  api.defaults.adapter = async (config) => {
    const url = String(config.url);
    const headers = config.headers as unknown as Record<string, string>;
    calls.push({ url, auth: headers?.Authorization, csrf: headers?.["X-CSRF-Token"], timeout: config.timeout });
    const route = routes[url];
    const reply: Reply = route ? route(config) : { status: 404 };
    if (reply === "network") throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
    const response = { data: reply.data ?? {}, status: reply.status, statusText: "", headers: {}, config };
    if (reply.status >= 400) {
      throw new AxiosError("fail", AxiosError.ERR_BAD_REQUEST, config, null, response as never);
    }
    return response;
  };
  return { api, calls, loggerError, useAuthStore };
}

type LogoutReason = { code?: string; status?: number };
const forcedLogouts = (spy: { mock: { calls: unknown[][] } }): LogoutReason[] =>
  spy.mock.calls
    .filter((args: unknown[]) => args[0] === "[auth] forced logout")
    .map((args: unknown[]) => args[1] as LogoutReason);

type Call = { url: string; auth?: string; csrf?: string; timeout?: number };
const refreshCalls = (calls: Call[]) => calls.filter((c) => c.url === "/auth/refresh_token");

const expired401: Route = () => ({ status: 401, data: { error: "ERR_TOKEN_EXPIRED" } });
const okWithNewToken: Route = (c) =>
  (c.headers as unknown as Record<string, string>).Authorization === `Bearer ${NEW}`
    ? { status: 200, data: { ok: true } }
    : { status: 401, data: { error: "ERR_TOKEN_EXPIRED" } };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("token", JSON.stringify(OLD));
  localStorage.setItem("zproCsrfToken", CSRF_STORED);
  vi.stubGlobal("fetch", async () => ({ ok: true }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("renovação do login", () => {
  it("renova com o código guardado, guarda o novo código, o cookie e o token do store, e refaz o pedido", async () => {
    const { api, calls, loggerError, useAuthStore } = await loadApi({
      "/tickets": okWithNewToken,
      "/auth/refresh_token": () => ({ status: 200, data: { token: NEW, csrfToken: CSRF_NEW } }),
    });

    const res = await api.get("/tickets");

    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls(calls)[0]?.csrf).toBe(CSRF_STORED);
    expect(refreshCalls(calls)[0]?.timeout).toBe(7000);
    expect(JSON.parse(localStorage.getItem("token")!)).toBe(NEW);
    expect(useAuthStore.getState().token).toBe(NEW);
    expect(localStorage.getItem("zproCsrfToken")).toBe(CSRF_NEW);
    expect(document.cookie).toContain("zpro_auth=1");
    expect(forcedLogouts(loggerError)).toHaveLength(0);
  });

  it("rede caindo na renovação não desloga: tenta 2 vezes e depois pausa", async () => {
    const { api, calls, loggerError } = await loadApi({
      "/tickets": expired401,
      "/contacts": expired401,
      "/auth/refresh_token": () => "network",
    });

    await expect(api.get("/tickets")).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls(calls)).toHaveLength(2);
    expect(forcedLogouts(loggerError)).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("token")!)).toBe(OLD);

    // Dentro da pausa: o pedido falha sem nova tentativa de renovação e sem deslogar.
    await expect(api.get("/contacts")).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls(calls)).toHaveLength(2);
    expect(forcedLogouts(loggerError)).toHaveLength(0);
  }, 10000);

  it("servidor fora (503) na 1ª tentativa e de volta na 2ª: renova sem deslogar", async () => {
    let attempts = 0;
    const { api, loggerError } = await loadApi({
      "/tickets": okWithNewToken,
      "/auth/refresh_token": () => (++attempts === 1 ? { status: 503 } : { status: 200, data: { token: NEW } }),
    });

    const res = await api.get("/tickets");
    expect(res.data).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(forcedLogouts(loggerError)).toHaveLength(0);
    // Backend antigo (sem código no corpo): o guardado continua.
    expect(localStorage.getItem("zproCsrfToken")).toBe(CSRF_STORED);
  }, 10000);

  it("renovação que falha 4 vezes seguidas com o servidor no ar desloga", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { api, loggerError } = await loadApi({
      "/tickets": expired401,
      "/auth/refresh_token": () => ({ status: 500 }),
    });

    for (let i = 1; i <= 3; i++) {
      await expect(api.get("/tickets")).rejects.toMatchObject({ status: 401 });
      expect(forcedLogouts(loggerError)).toHaveLength(0);
      vi.setSystemTime(Date.now() + 16000); // passa a pausa
    }
    await expect(api.get("/tickets")).rejects.toBeTruthy();
    expect(forcedLogouts(loggerError)).toHaveLength(1);
  }, 20000);

  it("\"Sair\" em outra aba (sem token guardado) não renova e desloga esta aba", async () => {
    const { api, calls, loggerError } = await loadApi({
      "/tickets": expired401,
      "/auth/refresh_token": () => ({ status: 200, data: { token: NEW, csrfToken: CSRF_NEW } }),
    });
    localStorage.removeItem("token");

    // O pedido sai com o token em memória do componente; aqui, sem nenhum.
    await expect(api.get("/tickets", { headers: { Authorization: `Bearer ${OLD}` } })).rejects.toBeTruthy();
    expect(refreshCalls(calls)).toHaveLength(0);
    expect(localStorage.getItem("token")).toBeNull();
    expect(forcedLogouts(loggerError)[0]?.code).toBe("ERR_NO_LOCAL_SESSION");
  });

  it("sessão recusada pelo servidor desloga sem 2ª tentativa e registra o código real", async () => {
    const { api, calls, loggerError } = await loadApi({
      "/tickets": expired401,
      "/auth/refresh_token": () => ({ status: 403, data: { error: "OUT_RANGE" } }),
    });

    await expect(api.get("/tickets")).rejects.toBeTruthy();
    expect(refreshCalls(calls)).toHaveLength(1);
    const reasons = forcedLogouts(loggerError);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({ status: 403, code: "OUT_RANGE" });
  });
});
