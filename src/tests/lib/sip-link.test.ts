import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SipLink,
  classifyRegisterFailure,
  closeCodeFromError,
  nextReconnectDelay,
  parseSipKeepAliveField,
  resolveKeepAliveSeconds,
  type SipLinkConfig,
  type SipLinkStatus,
} from "@/lib/sip-link";
import { useWebphoneStore } from "@/stores/webphone-store";

// ── registrador SIP falso sobre um WebSocket falso ──────────────────────────

/** "foreign" = 200 com o Contact de outro aparelho (servidor fora do padrão). */
type RegisterReply = "ok" | "silent" | "foreign" | number;

class FakeServer {
  /** false = o WebSocket não abre (servidor fora). */
  up = true;
  registerReply: RegisterReply = "ok";
  /** Respostas usadas antes do `registerReply`, na ordem. */
  queue: RegisterReply[] = [];
  sockets: FakeWs[] = [];
  registers: string[] = [];
  keepAlives = 0;
  urls: string[] = [];

  get open(): FakeWs[] {
    return this.sockets.filter((s) => s.readyState === 1);
  }

  /** Derruba a conexão como um proxy que fecha socket parado (1006). */
  drop(): void {
    this.open.forEach((s) => s.fireClose(1006));
  }
}

const server = new FakeServer();

const header = (raw: string, name: string): string => {
  const line = raw.split("\r\n").find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line ? line.slice(name.length + 1).trim() : "";
};

const reply = (raw: string, status: string, extra: string[] = []): string =>
  [
    `SIP/2.0 ${status}`,
    `Via: ${header(raw, "Via")}`,
    `From: ${header(raw, "From")}`,
    `To: ${header(raw, "To")};tag=srv${Math.floor(Math.random() * 1e6)}`,
    `Call-ID: ${header(raw, "Call-ID")}`,
    `CSeq: ${header(raw, "CSeq")}`,
    ...extra,
    "Content-Length: 0",
    "",
    "",
  ].join("\r\n");

class FakeWs {
  readyState = 0;
  binaryType = "blob";
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};

  constructor(public url: string) {
    server.sockets.push(this);
    server.urls.push(url);
    setTimeout(() => {
      if (!server.up) {
        this.fireClose(1006);
        return;
      }
      this.readyState = 1;
      this.emit("open", {});
    }, 5);
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    (this.listeners[type] ||= []).push(fn);
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error("not open");
    if (/^(\r\n)+$/.test(data)) {
      server.keepAlives += 1;
      return;
    }
    if (!data.startsWith("REGISTER ")) return;
    server.registers.push(data);
    const mode = server.queue.length ? server.queue.shift()! : server.registerReply;
    if (mode === "silent") return;
    const response =
      mode === "ok"
        ? reply(data, "200 OK", [`Contact: ${header(data, "Contact")}`])
        : mode === "foreign"
          ? reply(data, "200 OK", ["Contact: <sip:outro@outro.invalid;transport=ws>;expires=600"])
          : reply(data, `${mode} Falha`);
    setTimeout(() => this.emit("message", { data: response }), 5);
  }

  close(code = 1000): void {
    setTimeout(() => this.fireClose(code), 1);
  }

  fireClose(code: number): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", { code });
  }

  private emit(type: string, ev: unknown): void {
    (this.listeners[type] || []).forEach((fn) => fn(ev));
  }
}

const baseConfig: SipLinkConfig = {
  server: "sbc.provedor.com.br",
  username: "1000",
  password: "segredo",
  port: 8089,
  transport: "wss",
};

let statuses: SipLinkStatus[] = [];
let link: SipLink | null = null;
let visibility: DocumentVisibilityState = "visible";

const startLink = (
  config: Partial<SipLinkConfig> = {},
  extra: { buildBridgeUrl?: () => string; isCallActive?: () => boolean } = {}
) => {
  link = new SipLink({
    config: { ...baseConfig, ...config },
    onStatus: (s) => statuses.push(s),
    onInvite: () => {},
    pageProtocol: "https:",
    ...extra,
  });
  link.start();
  return link;
};

const last = () => statuses[statuses.length - 1];
const contactOf = (raw: string) => header(raw, "Contact").replace(/;expires=\d+/, "");

beforeEach(() => {
  vi.useFakeTimers();
  server.up = true;
  server.registerReply = "ok";
  server.queue = [];
  server.sockets = [];
  server.registers = [];
  server.keepAlives = 0;
  server.urls = [];
  statuses = [];
  visibility = "visible";
  vi.stubGlobal("WebSocket", FakeWs);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  link?.dispose();
  link = null;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── regras puras ─────────────────────────────────────────────────────────────

describe("regras do sip-link", () => {
  it("keep-alive: padrão 25 s, 0 desliga, UDP nunca, valor fora da faixa vira padrão", () => {
    expect(resolveKeepAliveSeconds("wss", null)).toBe(25);
    expect(resolveKeepAliveSeconds("wss", undefined)).toBe(25);
    expect(resolveKeepAliveSeconds("ws", 0)).toBe(0);
    expect(resolveKeepAliveSeconds("wss", 40)).toBe(40);
    expect(resolveKeepAliveSeconds("wss", 5)).toBe(25);
    expect(resolveKeepAliveSeconds("wss", 999)).toBe(25);
    expect(resolveKeepAliveSeconds("udp", 40)).toBe(0);
  });

  it("campo da Config SIP espelha o backend: vazio = padrão, 0, 10 a 300", () => {
    expect(parseSipKeepAliveField("")).toBeNull();
    expect(parseSipKeepAliveField("  ")).toBeNull();
    expect(parseSipKeepAliveField("0")).toBe(0);
    expect(parseSipKeepAliveField("10")).toBe(10);
    expect(parseSipKeepAliveField("300")).toBe(300);
    expect(parseSipKeepAliveField("9")).toBe("invalid");
    expect(parseSipKeepAliveField("301")).toBe("invalid");
    expect(parseSipKeepAliveField("2.5")).toBe("invalid");
    expect(parseSipKeepAliveField("-1")).toBe("invalid");
  });

  it("espera progressiva até 1 min, com ±20%", () => {
    expect(nextReconnectDelay(1, () => 0.5)).toBe(2000);
    expect(nextReconnectDelay(2, () => 0.5)).toBe(5000);
    expect(nextReconnectDelay(5, () => 0.5)).toBe(60000);
    expect(nextReconnectDelay(50, () => 0.5)).toBe(60000);
    expect(nextReconnectDelay(1, () => 0)).toBe(1600);
    expect(nextReconnectDelay(1, () => 1)).toBe(2400);
  });

  it("senha/ramal/domínio param de vez; 408 reconecta; 5xx tenta de novo", () => {
    for (const code of [400, 401, 403, 404, 407, 483, 301, 501, 603]) {
      expect(classifyRegisterFailure(code, true)).toBe("fatal");
    }
    expect(classifyRegisterFailure(408, true)).toBe("reconnect");
    for (const code of [0, 480, 500, 502, 503, 504]) {
      expect(classifyRegisterFailure(code, false)).toBe("retry");
    }
    expect(classifyRegisterFailure(null, true)).toBe("reconnect");
    expect(classifyRegisterFailure(null, false)).toBe("fatal");
  });

  it("código de fechamento sai da mensagem do sip.js sem a URL", () => {
    expect(closeCodeFromError(new Error("WebSocket closed wss://x/sip-bridge?token=abc (code: 1006)"))).toBe(1006);
    expect(closeCodeFromError(new Error("outra coisa"))).toBeNull();
    expect(closeCodeFromError(undefined)).toBeNull();
  });
});

// ── comportamento com o sip.js de verdade ───────────────────────────────────

describe("SipLink", () => {
  it("registra só com o 200 do servidor", async () => {
    startLink();
    expect(last().state).toBe("connecting");
    await vi.advanceTimersByTimeAsync(4);
    expect(last().state).not.toBe("registered");
    await vi.advanceTimersByTimeAsync(50);
    expect(server.registers).toHaveLength(1);
    expect(last().state).toBe("registered");
  });

  it("queda 1006: reconecta sozinho, refaz o REGISTER com o MESMO Contact e volta a Registrado", async () => {
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    expect(last().state).toBe("registered");

    server.drop();
    await vi.advanceTimersByTimeAsync(1);
    expect(last().state).toBe("reconnecting");
    expect(last().failure).toEqual({ kind: "disconnected" });

    await vi.advanceTimersByTimeAsync(2500 + 50);
    expect(server.sockets).toHaveLength(2);
    expect(server.open).toHaveLength(1);
    expect(server.registers).toHaveLength(2);
    expect(contactOf(server.registers[1])).toBe(contactOf(server.registers[0]));
    expect(last().state).toBe("registered");
    expect(last().failure).toBeNull();
  });

  it("servidor fora: tenta com espera crescente e nunca abre dois sockets ao mesmo tempo", async () => {
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    server.up = false;
    server.drop();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    // 2 s, 5 s, 10 s, 30 s e depois 1 min: bem menos de uma tentativa por segundo.
    const attempts = server.sockets.length - 1;
    expect(attempts).toBeGreaterThanOrEqual(5);
    expect(attempts).toBeLessThanOrEqual(10);
    expect(server.open.length).toBeLessThanOrEqual(1);
    expect(last().state).toBe("reconnecting");

    server.up = true;
    await vi.advanceTimersByTimeAsync(61_000);
    expect(last().state).toBe("registered");
    expect(server.open).toHaveLength(1);
  });

  it("senha recusada (403) para de vez: nenhum REGISTER a mais, nem depois de outra queda", async () => {
    server.registerReply = 403;
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    expect(last().state).toBe("error");
    expect(last().failure).toEqual({ kind: "status", code: 403 });
    server.drop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.registers).toHaveLength(1);
    expect(server.sockets).toHaveLength(1);
  });

  it("servidor indisponível (503) tenta registrar de novo no mesmo socket", async () => {
    server.registerReply = 503;
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    expect(last().state).toBe("reconnecting");
    expect(last().failure).toEqual({ kind: "status", code: 503 });
    server.registerReply = "ok";
    await vi.advanceTimersByTimeAsync(2500 + 50);
    expect(server.registers).toHaveLength(2);
    expect(server.sockets).toHaveLength(1);
    expect(last().state).toBe("registered");
  });

  it("servidor fora desde o início: mostra 'não conectou' e conecta quando ele volta", async () => {
    server.up = false;
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    expect(last().state).toBe("reconnecting");
    expect(last().failure).toEqual({ kind: "connection" });
    server.up = true;
    await vi.advanceTimersByTimeAsync(2500 + 50);
    expect(last().state).toBe("registered");
  });

  it("voltar à aba reconecta na hora, sem esperar a próxima tentativa", async () => {
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    server.up = false;
    server.drop();
    // Tentativas 1 a 3 falham; a próxima só sairia ~30 s depois.
    await vi.advanceTimersByTimeAsync(20_000);
    const before = server.sockets.length;
    server.up = true;
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(50);
    expect(server.sockets.length).toBe(before + 1);
    expect(last().state).toBe("registered");
  });

  it("socket morto que parece aberto: a conferência ao voltar à aba fica sem resposta e força a reconexão", async () => {
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    expect(last().state).toBe("registered");
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    server.registerReply = "silent";
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(50);
    expect(server.registers).toHaveLength(2); // REGISTER de conferência
    server.registerReply = "ok";
    await vi.advanceTimersByTimeAsync(10_000 + 2500 + 100);
    expect(server.sockets).toHaveLength(2);
    expect(server.open).toHaveLength(1);
    expect(last().state).toBe("registered");
  });

  it("keep-alive CRLF no WSS no intervalo configurado; 0 desliga", async () => {
    startLink({ keepAliveInterval: 20 });
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(server.keepAlives).toBeGreaterThanOrEqual(3);
    link!.dispose();
    link = null;

    server.keepAlives = 0;
    startLink({ keepAliveInterval: 0 });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(server.keepAlives).toBe(0);
  });

  it("UDP: sem keep-alive e a URL da ponte é montada de novo a cada conexão (token renovado)", async () => {
    let token = "t1";
    startLink({ transport: "udp" }, { buildBridgeUrl: () => `wss://api/sip-bridge?token=${token}` });
    await vi.advanceTimersByTimeAsync(50);
    expect(last().state).toBe("registered");
    token = "t2";
    server.drop();
    await vi.advanceTimersByTimeAsync(2500 + 50);
    expect(server.urls[server.urls.length - 1]).toContain("token=t2");
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(server.keepAlives).toBe(0);
  });

  it("ws:// em painel HTTPS para na hora, sem abrir socket", () => {
    startLink({ transport: "ws" });
    expect(last().state).toBe("error");
    expect(last().failure).toEqual({ kind: "connection" });
    expect(server.sockets).toHaveLength(0);
  });

  it("dispose encerra tudo: nenhuma tentativa depois", async () => {
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    server.drop();
    link!.dispose();
    link = null;
    const sockets = server.sockets.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.sockets.length).toBe(sockets);
  });

  it("'Reconectar agora' pula a espera", async () => {
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    server.up = false;
    server.drop();
    await vi.advanceTimersByTimeAsync(20_000);
    const before = server.sockets.length;
    server.up = true;
    link!.reconnectNow();
    await vi.advanceTimersByTimeAsync(50);
    expect(server.sockets.length).toBe(before + 1);
    expect(last().state).toBe("registered");
  });
});

// ── achados da auditoria adversarial ────────────────────────────────────────

describe("SipLink: casos da auditoria", () => {
  it("duas recusas seguidas (503, 503) não deixam a marca de 'tratado' presa: a queda depois do registro reconecta", async () => {
    server.queue = [503, 503];
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    expect(last().state).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(last().state).toBe("registered");
    const sockets = server.sockets.length;
    // A renovação interna (594 s) fica sem resposta: Timer F dá 408 e o motor reconecta.
    server.registerReply = "silent";
    await vi.advanceTimersByTimeAsync(600_000 + 40_000);
    expect(server.sockets.length).toBeGreaterThan(sockets);
    server.registerReply = "ok";
    await vi.advanceTimersByTimeAsync(70_000);
    expect(last().state).toBe("registered");
    expect(server.open).toHaveLength(1);
  });

  it("depois de uma recusa definitiva, a queda do socket não troca o motivo por 'Reconectando'", async () => {
    server.registerReply = 403;
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    expect(last()).toMatchObject({ state: "error", failure: { kind: "status", code: 403 } });
    server.drop();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(last()).toMatchObject({ state: "error", failure: { kind: "status", code: 403 } });
    expect(server.registers).toHaveLength(1);
  });

  it("200 sem o nosso Contact com o registro já 'não registrado' não prende em 'Registrando'", async () => {
    server.queue = [503, "foreign"];
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(server.registers).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(last()).toMatchObject({ state: "error", failure: { kind: "rejected" } });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.registers).toHaveLength(2);
  });

  it("senha trocada no PABX: a renovação interna recusada (403) para de vez sem REGISTER extra", async () => {
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    expect(last().state).toBe("registered");
    server.registerReply = 403;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(last()).toMatchObject({ state: "error", failure: { kind: "status", code: 403 } });
    expect(server.registers).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.registers).toHaveLength(2);
    expect(server.sockets).toHaveLength(1);
  });

  it("registrador descartado não dispara a própria renovação depois (sem erro solto)", async () => {
    startLink();
    await vi.advanceTimersByTimeAsync(50);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    server.registerReply = "silent";
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(50);
    server.registerReply = "ok";
    // conferência sem resposta → reconexão → registrador novo; o antigo some sem lançar
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(last().state).toBe("registered");
    link!.dispose();
    link = null;
    await vi.advanceTimersByTimeAsync(20 * 60_000);
  });

  it("em ligação, voltar à aba não manda REGISTER de conferência (nem fecha o socket por suspeita)", async () => {
    let inCall = false;
    startLink({}, { isCallActive: () => inCall });
    await vi.advanceTimersByTimeAsync(50);
    inCall = true;
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    server.registerReply = "silent";
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(server.registers).toHaveLength(1);
    expect(server.sockets).toHaveLength(1);
    expect(last().state).toBe("registered");
  });

  it("porta 5060 (sem WebSocket, recusada pelo navegador) para na hora, sem abrir socket", () => {
    startLink({ port: 5060 });
    expect(last()).toMatchObject({ state: "error", failure: { kind: "connection" } });
    expect(server.sockets).toHaveLength(0);
  });
});

// ── store: reconexão nunca mexe na chamada ──────────────────────────────────

describe("webphone-store com o estado da conexão", () => {
  beforeEach(() => useWebphoneStore.getState().reset());

  it("registrar de novo no meio da chamada mantém 'Em chamada'", () => {
    const store = useWebphoneStore.getState();
    store.startCall({ phone: "1001", direction: "outgoing" });
    useWebphoneStore.getState().setCallStatus("established");
    useWebphoneStore.getState().setSipLinkStatus({ state: "reconnecting", failure: { kind: "disconnected" }, attempt: 1 });
    expect(useWebphoneStore.getState().callStatus).toBe("established");
    expect(useWebphoneStore.getState().sipRegistered).toBe(false);
    useWebphoneStore.getState().setSipLinkStatus({ state: "registered", failure: null, attempt: 1 });
    expect(useWebphoneStore.getState().callStatus).toBe("established");
    expect(useWebphoneStore.getState().sipRegistered).toBe(true);
    useWebphoneStore.getState().setSipRegistered(true);
    expect(useWebphoneStore.getState().callStatus).toBe("established");
  });

  it("fora de chamada acompanha a conexão", () => {
    const s = useWebphoneStore.getState;
    s().setSipLinkStatus({ state: "connecting", failure: null, attempt: 0 });
    expect(s().sipLinkState).toBe("connecting");
    expect(s().callStatus).toBe("registering");
    s().setSipLinkStatus({ state: "reconnecting", failure: { kind: "disconnected" }, attempt: 2 });
    expect(s().sipRegisterFailure).toEqual({ kind: "disconnected" });
    s().setSipLinkStatus({ state: "registered", failure: null, attempt: 2 });
    expect(s().callStatus).toBe("registered");
    expect(s().sipRegisterFailure).toBeNull();
    s().setSipLinkStatus({ state: "error", failure: { kind: "status", code: 403 }, attempt: 0 });
    expect(s().callStatus).toBe("error");
  });
});
