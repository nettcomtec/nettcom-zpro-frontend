import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "../utils/dom-testing";
import { NextIntlClientProvider } from "next-intl";
import ptMessages from "@/i18n/locales/pt.json";
import { parseSipMessage } from "@/lib/sip-diagnostics";
import { useWebphoneStore } from "@/stores/webphone-store";

const connectivity = vi.fn();
const resolveHost = vi.fn();
vi.mock("@/services/users", () => ({
  checkSipConnectivity: (...args: unknown[]) => connectivity(...args),
  resolveSipHost: (...args: unknown[]) => resolveHost(...args),
}));

import { SipConnectionTest } from "@/components/webphone/sip-connection-test";
import { AsteriskWebphone } from "@/components/webphone/asterisk-webphone";

type Reply = (raw: string, method: string, ruri: string, headers: Record<string, string[]>) => string | null;
let serverReply: Reply = () => null;
let failOpen = false;

const respond = (raw: string, status: string, extra: string[] = []) => {
  const p = parseSipMessage(raw)!;
  const h = (n: string) => (p.headers[n] || [])[0] || "";
  return [`SIP/2.0 ${status}`, `Via: ${h("via")}`, `From: ${h("from")}`, `To: ${h("to")};tag=t`, `Call-ID: ${h("call-id")}`, `CSeq: ${h("cseq")}`, ...extra, "Content-Length: 0", "", ""].join("\r\n");
};

class FakeWebSocket {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  constructor(public url: string) {
    setTimeout(() => (failOpen ? (this.onerror?.(), this.onclose?.()) : this.onopen?.()), 1);
  }
  send(raw: string) {
    const p = parseSipMessage(raw)!;
    const reply = serverReply(raw, p.method, raw.split(" ")[1], p.headers);
    if (reply) setTimeout(() => this.onmessage?.({ data: reply }), 1);
  }
  close() {}
}

beforeAll(() => {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// A espera entre testes vive no módulo e no localStorage: cada caso começa num
// relógio 10 min à frente do anterior, sem a espera do caso de antes.
let clock = Date.UTC(2026, 9, 9, 12, 0, 0);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock += 10 * 60 * 1000;
  vi.setSystemTime(clock);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  connectivity.mockReset();
  resolveHost.mockReset();
  failOpen = false;
});

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="pt" messages={ptMessages}>
    {ui}
  </NextIntlClientProvider>
);

const cfg = {
  server: "webrtc-oratrix.dazsoft.com",
  port: 8080,
  username: "oratrix-212",
  password: "x",
  domain: "pabx.oratrixtelecom.com.br",
  transport: "wss" as const,
};

describe("SipConnectionTest (tela)", () => {
  it("caso Oratrix: mostra o diagnóstico e o botão que preenche o domínio", async () => {
    serverReply = (raw, method, ruri, headers) => {
      if (method === "OPTIONS") return respond(raw, "200 OK", ["Server: SIPTEK Softswitch"]);
      if (!headers.contact) return respond(raw, "400 Bad Request");
      return ruri === "sip:45.170.138.45"
        ? respond(raw, "401 Unauthorized", ['WWW-Authenticate: Digest realm="discador", nonce="x"'])
        : respond(raw, "404 Not Found");
    };
    resolveHost.mockResolvedValue(["45.170.138.45"]);
    const onUseDomain = vi.fn();
    render(wrap(<SipConnectionTest config={cfg} onUseDomain={onUseDomain} />));

    fireEvent.click(screen.getByRole("button", { name: /Testar conexão/ }));
    expect(await screen.findByText("O servidor aceita o domínio 45.170.138.45")).toBeInTheDocument();
    expect(screen.getByText("O servidor não reconhece o domínio pabx.oratrixtelecom.com.br")).toBeInTheDocument();
    expect(screen.getByText("O servidor respondeu em SIP (SIPTEK Softswitch)")).toBeInTheDocument();
    expect(screen.getByText("Conectou em wss://webrtc-oratrix.dazsoft.com:8080/ws")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Usar 45.170.138.45" }));
    expect(onUseDomain).toHaveBeenCalledWith("45.170.138.45");
    expect(screen.getByRole("button", { name: /Copiar detalhes para o provedor/ })).toBeInTheDocument();
    // Sem senha, mas com REGISTER recusado (pode contar no fail2ban): espera entre testes.
    expect(screen.getByRole("button", { name: "Aguarde 30s" })).toBeDisabled();
    expect(localStorage.getItem("sipTestLastRegisterAt")).toBe(String(Date.now()));
  });

  it("dados não salvos: avisa depois do teste", async () => {
    failOpen = true;
    connectivity.mockResolvedValue({ ok: false, code: "tcpRefused" });
    render(wrap(<SipConnectionTest config={cfg} unsaved />));
    fireEvent.click(screen.getByRole("button", { name: /Testar conexão/ }));
    expect(await screen.findByText("A porta 8080 está fechada no servidor")).toBeInTheDocument();
    expect(screen.getByText(/Os dados testados ainda não foram salvos/)).toBeInTheDocument();
    // Nenhum REGISTER saiu: sem espera.
    expect(screen.getByRole("button", { name: /Testar conexão/ })).toBeEnabled();
  });

  it("WebSocket não abre: mostra o motivo vindo do servidor do sistema", async () => {
    failOpen = true;
    connectivity.mockResolvedValue({ ok: false, code: "tlsCertSelfSigned", cert: { subject: "pbx.local" } });
    render(wrap(<SipConnectionTest config={{ ...cfg, server: "pbx.cliente.com", port: 8089 }} />));
    fireEvent.click(screen.getByRole("button", { name: /Testar conexão/ }));
    expect(await screen.findByText("O certificado do servidor não é de uma autoridade reconhecida")).toBeInTheDocument();
    expect(screen.getByText(/certificado válido \(por exemplo, Let's Encrypt\) para pbx\.cliente\.com/)).toBeInTheDocument();
    expect(connectivity).toHaveBeenCalledWith(expect.objectContaining({ server: "pbx.cliente.com", port: 8089, transport: "wss" }));
  });

  it("senha conferida: mostra os aparelhos e aplica a espera de 30 s", async () => {
    serverReply = (raw, method, _ruri, headers) => {
      if (method === "OPTIONS") return respond(raw, "200 OK");
      if (!headers.authorization) return respond(raw, "401 Unauthorized", ['WWW-Authenticate: Digest realm="r", nonce="n", algorithm=MD5']);
      return respond(raw, "200 OK", ["Contact: <sip:a@1.1.1.1>;expires=60", "Contact: <sip:b@1.1.1.2>;expires=60"]);
    };
    render(wrap(<SipConnectionTest config={{ ...cfg, domain: "45.170.138.45" }} />));
    fireEvent.click(screen.getByRole("button", { name: /Testar conexão/ }));
    expect(await screen.findByText("Usuário, senha e domínio aceitos")).toBeInTheDocument();
    expect(screen.getByText("2 aparelhos registrados neste ramal agora.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Aguarde \d+s/ })).toBeDisabled());
  });

  it("UDP: botão desabilitado com a explicação", () => {
    render(wrap(<SipConnectionTest config={{ ...cfg, transport: "udp" }} />));
    expect(screen.getByRole("button", { name: /Testar conexão|Aguarde/ })).toBeDisabled();
    expect(screen.getByText("O teste funciona com WSS e WS.")).toBeInTheDocument();
  });

  it("ajuda abre com os alertas", async () => {
    render(wrap(<SipConnectionTest config={cfg} />));
    fireEvent.click(screen.getByRole("button", { name: "Como funciona o teste" }));
    expect(await screen.findByText(/Não faz ligação e não testa áudio/)).toBeInTheDocument();
    expect(screen.getByText(/espera de 30 segundos entre testes/)).toBeInTheDocument();
  });
});

describe("WebPhone: motivo da falha de registro", () => {
  it("mostra o motivo e a dica ao administrador", () => {
    useWebphoneStore.getState().setSipRegisterFailure({ kind: "status", code: 483 });
    render(wrap(<AsteriskWebphone server="webrtc-oratrix.dazsoft.com" />));
    expect(screen.getByText("Domínio SIP errado: o servidor entrou em laço (483)")).toBeInTheDocument();
    expect(screen.getByText(/Testar conexão/)).toBeInTheDocument();
    useWebphoneStore.getState().setSipRegistered(true);
  });

  it("UDP: nunca registrou, dica sem o teste de conexão", () => {
    useWebphoneStore.getState().setSipRegisterFailure({ kind: "rejected" });
    render(wrap(<AsteriskWebphone server="x" transport="udp" />));
    expect(screen.getByText("O servidor SIP não aceitou o registro")).toBeInTheDocument();
    expect(screen.getByText(/O teste de conexão não funciona no UDP/)).toBeInTheDocument();
    useWebphoneStore.getState().setSipRegistered(true);
  });

  it("registro aceito some com o aviso", () => {
    useWebphoneStore.getState().setSipRegisterFailure({ kind: "disconnected" });
    useWebphoneStore.getState().setSipRegistered(true);
    render(wrap(<AsteriskWebphone server="x" />));
    expect(screen.queryByText("A conexão com o servidor SIP caiu")).not.toBeInTheDocument();
    expect(useWebphoneStore.getState().callStatus).toBe("registered");
  });

  it("falha durante chamada não muda o estado da chamada", () => {
    useWebphoneStore.getState().startCall({ phone: "123", direction: "outgoing" });
    useWebphoneStore.getState().setSipRegisterFailure({ kind: "disconnected" });
    expect(useWebphoneStore.getState().callStatus).toBe("calling");
    expect(useWebphoneStore.getState().sipRegistered).toBe(false);
    useWebphoneStore.getState().reset();
  });
});
