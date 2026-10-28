import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  buildDigestAuthorization,
  connectivityToStep,
  describeRegisterFailure,
  isIpAddress,
  maskSipTranscript,
  parseDigestChallenge,
  parseSipMessage,
  runSipConnectionTest,
  validateSipTestConfig,
  type SipTestConfig,
  type SipTestDeps,
} from "@/lib/sip-diagnostics";

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

type Handler = (req: { raw: string; method: string; ruri: string; headers: Record<string, string[]> }) => string | null;

/** Servidor SIP falso sobre um WebSocket falso: cada pedido vira resposta(s) do handler. */
class FakeSipSocket {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];
  binaryType = "blob";
  constructor(public url: string, private handler: Handler, failOpen: boolean, private binary = false) {
    setTimeout(() => {
      if (failOpen) {
        this.onerror?.();
        this.onclose?.();
      } else {
        this.onopen?.();
      }
    }, 1);
  }
  send(raw: string) {
    this.sent.push(raw);
    const parsed = parseSipMessage(raw)!;
    const ruri = raw.split("\r\n")[0].split(" ")[1];
    const reply = this.handler({ raw, method: parsed.method, ruri, headers: parsed.headers });
    if (!reply) return;
    const data = this.binary ? (new TextEncoder().encode(reply).buffer as unknown as string) : reply;
    setTimeout(() => this.onmessage?.({ data }), 1);
  }
  close() {}
}

const responseFor = (raw: string, status: string, extra: string[] = []) => {
  const p = parseSipMessage(raw)!;
  const h = (n: string) => (p.headers[n] || [])[0] || "";
  return [
    `SIP/2.0 ${status}`,
    `Via: ${h("via")}`,
    `From: ${h("from")}`,
    `To: ${h("to")};tag=srv`,
    `Call-ID: ${h("call-id")}`,
    `CSeq: ${h("cseq")}`,
    ...extra,
    "Content-Length: 0",
    "",
    "",
  ].join("\r\n");
};

const baseCfg: SipTestConfig = {
  server: "sbc.provedor.com.br",
  port: 8089,
  username: "oratrix-212",
  password: "segredo",
  domain: "",
  transport: "wss",
};

const run = (
  cfg: SipTestConfig,
  handler: Handler,
  opts: { failOpen?: boolean; deps?: Partial<SipTestDeps> } = {}
) => {
  const sockets: FakeSipSocket[] = [];
  const calls = { connectivity: [] as unknown[], resolve: [] as string[] };
  const promise = runSipConnectionTest(cfg, {
    checkConnectivity: async (input) => {
      calls.connectivity.push(input);
      return null;
    },
    resolveHost: async (host) => {
      calls.resolve.push(host);
      return null;
    },
    createWebSocket: (url) => {
      const s = new FakeSipSocket(url, handler, !!opts.failOpen);
      sockets.push(s);
      return s as unknown as WebSocket;
    },
    pageProtocol: "https:",
    pageOrigin: "https://painel.exemplo.com.br",
    timeouts: { open: 300, request: 150 },
    ...opts.deps,
  });
  return { promise, sockets, calls };
};

const registers = (s: FakeSipSocket) => s.sent.filter((m) => m.startsWith("REGISTER "));

// Asterisk com desafio Digest (qop=auth) e senha "segredo".
const asteriskHandler =
  (opts: { password?: string; stale?: boolean; algorithm?: string; afterAuth?: string; contacts?: number } = {}): Handler => {
    let challenges = 0;
    return (req) => {
      if (req.method === "OPTIONS") return responseFor(req.raw, "200 OK", ["Server: Asterisk PBX 20.5.0"]);
      if (req.method !== "REGISTER") return null;
      const auth = (req.headers.authorization || [])[0];
      if (!auth) {
        challenges++;
        return responseFor(req.raw, "401 Unauthorized", [
          `WWW-Authenticate: Digest realm="asterisk", nonce="n${challenges}", qop="auth", algorithm=${opts.algorithm || "MD5"}`,
        ]);
      }
      const p = parseDigestChallenge(auth)!;
      const ha1 = md5(`${p.username}:${p.realm}:${opts.password ?? "segredo"}`);
      const ha2 = md5(`REGISTER:${p.uri}`);
      const expected = md5(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`);
      if (opts.stale && p.nonce === "n1") {
        challenges++;
        return responseFor(req.raw, "401 Unauthorized", [
          `WWW-Authenticate: Digest realm="asterisk", nonce="n${challenges}", qop="auth", algorithm=MD5, stale=true`,
        ]);
      }
      if (p.response !== expected) {
        challenges++;
        return responseFor(req.raw, "401 Unauthorized", [
          `WWW-Authenticate: Digest realm="asterisk", nonce="n${challenges}", qop="auth", algorithm=MD5`,
        ]);
      }
      if (opts.afterAuth) return responseFor(req.raw, opts.afterAuth);
      const contacts = Array.from({ length: opts.contacts ?? 0 }, (_, i) => `Contact: <sip:dev${i}@1.2.3.4:5060>;expires=300`);
      return responseFor(req.raw, "200 OK", contacts);
    };
  };

describe("sip-diagnostics: digest", () => {
  it("bate com o exemplo da RFC 2617", () => {
    const { value } = buildDigestAuthorization({
      challenge: { realm: "testrealm@host.com", nonce: "dcd98b7102dd2f0e8b11d0f600bfb0c093", qop: "auth,auth-int", opaque: "5ccc069c403ebaf9f0171e9517f40e41" },
      method: "GET",
      uri: "/dir/index.html",
      username: "Mufasa",
      password: "Circle Of Life",
      cnonce: "0a4f113b",
    });
    expect(value).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(value).toContain("qop=auth");
    expect(value).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"');
  });

  it("recusa algoritmo que o sip.js não usa", () => {
    const res = buildDigestAuthorization({ challenge: { realm: "r", nonce: "n", algorithm: "SHA-256" }, method: "REGISTER", uri: "sip:x", username: "u", password: "p" });
    expect(res.unsupported).toBe("SHA-256");
    expect(buildDigestAuthorization({ challenge: { realm: "r", nonce: "n", algorithm: "md5" }, method: "REGISTER", uri: "sip:x", username: "u", password: "p" }).unsupported).toBeUndefined();
  });

  it("aborta como o sip.js: sem realm, sem nonce ou qop desconhecido", () => {
    const base = { method: "REGISTER", uri: "sip:x", username: "u", password: "p" };
    expect(buildDigestAuthorization({ ...base, challenge: { nonce: "n" } }).invalid).toBe(true);
    expect(buildDigestAuthorization({ ...base, challenge: { realm: "r" } }).invalid).toBe(true);
    expect(buildDigestAuthorization({ ...base, challenge: { realm: "r", nonce: "n", qop: "token" } }).invalid).toBe(true);
    const authInt = buildDigestAuthorization({ ...base, challenge: { realm: "r", nonce: "n", qop: "auth-int" }, cnonce: "c" });
    const ha1 = md5("u:r:p");
    const ha2 = md5(`REGISTER:sip:x:${md5("")}`);
    expect(authInt.value).toContain(`response="${md5(`${ha1}:n:00000001:c:auth-int:${ha2}`)}"`);
  });

  it("mascara o que deriva da senha em qualquer formato", () => {
    const text = [
      'Authorization: Digest username="u", response="0123456789abcdef0123456789abcdef"',
      "Proxy-Authorization: Digest username=u, response = 0123456789abcdef0123456789abcdef",
      'Authentication-Info: rspauth="fedcba9876543210fedcba9876543210", qop=auth',
    ].join("\n");
    const masked = maskSipTranscript(text);
    expect(masked).not.toMatch(/[0-9a-f]{32}/);
    expect(masked).toContain('response="***"');
    expect(masked).toContain("response = ***");
    expect(masked).toContain('rspauth="***"');
  });
});

describe("sip-diagnostics: motivo da conexão", () => {
  const ctx = { host: "pbx.x.com", port: 8089, origin: "https://p.com" };
  it("certificado não reconhecido com aperto de mão falho mostra o aperto de mão", () => {
    expect(connectivityToStep({ ok: false, code: "tlsCertUntrusted", handshakeCode: "wsHttpStatus", handshakeHttpStatus: 404 }, ctx).code).toBe("wsHttp404");
    expect(connectivityToStep({ ok: false, code: "tlsCertUntrusted", handshakeCode: "ok" }, ctx).code).toBe("tlsCertUntrusted");
    expect(connectivityToStep({ ok: false, code: "tlsCertSelfSigned", handshakeCode: "wsHttpStatus", handshakeHttpStatus: 404 }, ctx).code).toBe("tlsCertSelfSigned");
  });
  it("própria máquina e endereço do navegador por transporte", () => {
    expect(connectivityToStep({ ok: false, code: "ownMachine" }, ctx).code).toBe("ownMachine");
    expect(connectivityToStep({ ok: true, code: "ok" }, { ...ctx, transport: "ws" }).params?.scheme).toBe("http");
    expect(connectivityToStep({ ok: true, code: "ok" }, ctx).params?.scheme).toBe("https");
  });
});

describe("sip-diagnostics: validação dos campos", () => {
  const v = (patch: Partial<SipTestConfig>, protocol = "https:") => validateSipTestConfig({ ...baseCfg, ...patch }, protocol)?.code;
  it("aponta cada erro comum", () => {
    expect(v({ server: "wss://sbc.x.com" })).toBe("serverHasScheme");
    expect(v({ server: "sip:sbc.x.com" })).toBe("serverHasScheme");
    expect(v({ server: "sbc.x.com/ws" })).toBe("serverHasPath");
    expect(v({ server: "sbc.x.com:8089" })).toBe("serverHasPort");
    expect(v({ domain: "1000@pabx.x.com" })).toBe("domainInvalid");
    expect(v({ domain: "sip:pabx.x.com" })).toBe("domainInvalid");
    expect(v({ password: "" })).toBe("configMissing");
    expect(v({ port: 70000 })).toBe("portInvalid");
    expect(v({ transport: "ws" })).toBe("mixedContent");
    expect(v({ transport: "ws" }, "http:")).toBeUndefined();
    expect(v({ domain: "45.170.138.45" })).toBeUndefined();
    expect(v({ domain: "abc:5060" })).toBe("domainInvalid");
    expect(v({ domain: "1.2.3.4:5060" })).toBe("domainInvalid");
    expect(v({ domain: "cafe.de:5060" })).toBe("domainInvalid");
    expect(v({})).toBeUndefined();
  });

  it("IP: IPv6 exige pelo menos dois ':'", () => {
    expect(isIpAddress("2001:db8::1")).toBe(true);
    expect(isIpAddress("[::1]")).toBe(true);
    expect(isIpAddress("45.170.138.45")).toBe(true);
    expect(isIpAddress("abc:5060")).toBe(false);
    expect(isIpAddress("pabx.x.com")).toBe(false);
  });
});

describe("sip-diagnostics: teste completo", () => {
  it("Asterisk: confere a senha com REGISTER de consulta (sem Contact e sem Expires)", async () => {
    const { promise, sockets } = run(baseCfg, asteriskHandler({ contacts: 2 }));
    const res = await promise;
    expect(res.steps.map((s) => `${s.id}:${s.status}:${s.code}`)).toEqual([
      "config:ok:configOk",
      "connect:ok:connectOk",
      "sip:ok:sipOkAgent",
      "account:ok:accountOk",
    ]);
    expect(res.steps[3].params?.bindings).toBe(2);
    expect(res.credentialsSent).toBe(true);
    const regs = registers(sockets[0]);
    expect(regs).toHaveLength(2);
    for (const r of regs) {
      expect(r).not.toMatch(/\r\nContact:/i);
      expect(r).not.toMatch(/\r\nExpires:/i);
    }
    expect(regs[0].split("\r\n")[0]).toBe("REGISTER sip:sbc.provedor.com.br SIP/2.0");
    expect(sockets[0].url).toBe("wss://sbc.provedor.com.br:8089/ws");
    expect(res.transcript).toContain('response="***"');
    expect(res.transcript).not.toMatch(/response="[0-9a-f]{32}"/);
  });

  it("senha errada: manda a senha uma vez só", async () => {
    const { promise, sockets } = run(baseCfg, asteriskHandler({ password: "outra" }));
    const res = await promise;
    expect(res.steps.at(-1)?.code).toBe("accountWrongPassword");
    expect(registers(sockets[0]).filter((r) => /\r\nAuthorization:/.test(r))).toHaveLength(1);
  });

  it("nonce vencido (stale): repete uma vez e passa", async () => {
    const { promise, sockets } = run(baseCfg, asteriskHandler({ stale: true }));
    const res = await promise;
    expect(res.steps.at(-1)?.code).toBe("accountOk");
    expect(registers(sockets[0]).filter((r) => /\r\nAuthorization:/.test(r))).toHaveLength(2);
  });

  it("algoritmo diferente de MD5: não manda senha", async () => {
    const { promise } = run(baseCfg, asteriskHandler({ algorithm: "SHA-256" }));
    const res = await promise;
    expect(res.steps.at(-1)?.code).toBe("accountAlgorithmUnsupported");
    expect(res.credentialsSent).toBe(false);
  });

  it("404 depois da senha = ramal não encontrado (sem dica de domínio)", async () => {
    const { promise, calls } = run(baseCfg, asteriskHandler({ afterAuth: "404 Not Found" }));
    const res = await promise;
    expect(res.steps.at(-1)?.code).toBe("accountNotFoundAfterAuth");
    expect(calls.resolve).toHaveLength(0);
  });

  it("caso Oratrix: consulta 400, domínio não atendido, IP do PABX aceito", async () => {
    const handler: Handler = (req) => {
      if (req.method === "OPTIONS") return responseFor(req.raw, "200 OK", ["Server: SIPTEK Softswitch"]);
      const hasContact = !!req.headers.contact;
      if (!hasContact) return responseFor(req.raw, "400 Bad Request");
      if (req.ruri === "sip:45.170.138.45") {
        return responseFor(req.raw, "401 Unauthorized", ['WWW-Authenticate: Digest algorithm=MD5, realm="discador", nonce="x"']);
      }
      return responseFor(req.raw, "404 Not Found");
    };
    const cfg = { ...baseCfg, server: "webrtc-oratrix.dazsoft.com", port: 8080, domain: "pabx.oratrixtelecom.com.br" };
    const { promise, sockets, calls } = run(cfg, handler, {
      deps: {
        resolveHost: async (host) => {
          calls.resolve.push(host);
          return host === "pabx.oratrixtelecom.com.br" ? ["45.170.138.45"] : null;
        },
      },
    });
    const res = await promise;
    expect(res.steps.map((s) => s.code)).toEqual(["configOk", "connectOk", "sipOkAgent", "accountNotFound", "domainHintFound"]);
    expect(res.suggestedDomain).toBe("45.170.138.45");
    expect(res.credentialsSent).toBe(false);
    expect(res.registerSent).toBe(true);
    // Invariante de segurança: REGISTER com Contact (expires=0) nunca leva o usuário de verdade.
    for (const r of registers(sockets[0]).filter((m) => /\r\nContact:/.test(m))) {
      expect(r).toMatch(/\r\nTo: <sip:sipdiag[a-z0-9]+@/);
      expect(r).toContain(";expires=0");
      expect(r).not.toContain("oratrix-212");
    }
  });

  it("laço 483 sem candidato de IP: só o diagnóstico", async () => {
    const handler: Handler = (req) =>
      req.method === "OPTIONS" ? responseFor(req.raw, "200 OK") : responseFor(req.raw, "483 Too Many Hops");
    const { promise, calls } = run(baseCfg, handler);
    const res = await promise;
    expect(res.steps.at(-1)?.code).toBe("accountLoop");
    expect(calls.resolve).toEqual(["sbc.provedor.com.br"]);
  });

  it("pedido de senha sem nonce: não manda a senha", async () => {
    const handler: Handler = (req) =>
      req.method === "OPTIONS"
        ? responseFor(req.raw, "200 OK")
        : responseFor(req.raw, "401 Unauthorized", ['WWW-Authenticate: Digest realm="r", algorithm=MD5']);
    const res = await run(baseCfg, handler).promise;
    expect(res.steps.at(-1)?.code).toBe("accountBadChallenge");
    expect(res.credentialsSent).toBe(false);
  });

  it("avisa cada REGISTER antes de sair (a espera conta daí)", async () => {
    let calls = 0;
    const { promise, sockets } = run(baseCfg, asteriskHandler({ contacts: 1 }), { deps: { onRegisterSent: () => calls++ } });
    await promise;
    expect(calls).toBe(registers(sockets[0]).length);
    expect(calls).toBe(2);
  });

  it("frame binário do servidor é lido", async () => {
    let socket: FakeSipSocket | null = null;
    const res = await runSipConnectionTest(baseCfg, {
      checkConnectivity: async () => null,
      resolveHost: async () => null,
      pageProtocol: "https:",
      pageOrigin: "https://p.com",
      timeouts: { open: 300, request: 150 },
      createWebSocket: (url) => {
        socket = new FakeSipSocket(url, asteriskHandler(), false, true);
        return socket as unknown as WebSocket;
      },
    });
    expect((socket as unknown as FakeSipSocket).binaryType).toBe("arraybuffer");
    expect(res.steps.map((st) => st.code)).toEqual(["configOk", "connectOk", "sipOkAgent", "accountOk"]);
  });

  it("servidor aceita sem senha", async () => {
    const handler: Handler = (req) => responseFor(req.raw, "200 OK");
    const res = await run(baseCfg, handler).promise;
    expect(res.steps.at(-1)).toMatchObject({ status: "warn", code: "accountOkNoAuth" });
  });

  it("WebSocket não abre: pergunta o motivo ao servidor do sistema", async () => {
    const certFail = run(baseCfg, () => null, {
      failOpen: true,
      deps: {
        checkConnectivity: async () => ({ ok: false, code: "tlsCertExpired", cert: { validTo: "2015-04-12T23:59:59.000Z", subject: "*.x.com" } }),
      },
    });
    const res = await certFail.promise;
    expect(res.steps.at(-1)).toMatchObject({ id: "connect", status: "fail", code: "tlsCertExpired" });
    expect(res.steps.at(-1)?.params?.validTo).toBe("2015-04-12");

    const http404 = await run(baseCfg, () => null, {
      failOpen: true,
      deps: { checkConnectivity: async () => ({ ok: false, code: "wsHttpStatus", httpStatus: 404 }) },
    }).promise;
    expect(http404.steps.at(-1)?.code).toBe("wsHttp404");

    const onlyBrowser = await run(baseCfg, () => null, {
      failOpen: true,
      deps: { checkConnectivity: async () => ({ ok: true, code: "ok" }) },
    }).promise;
    expect(onlyBrowser.steps.at(-1)?.code).toBe("browserOnly");

    const noBackend = run(baseCfg, () => null, { failOpen: true });
    const res2 = await noBackend.promise;
    expect(res2.steps.at(-1)?.code).toBe("checkUnavailable");
    expect(noBackend.calls.connectivity[0]).toEqual({
      server: "sbc.provedor.com.br",
      port: 8089,
      transport: "wss",
      origin: "https://painel.exemplo.com.br",
    });
  });

  it("OPTIONS sem resposta: para no passo do servidor", async () => {
    const res = await run(baseCfg, () => null).promise;
    expect(res.steps.at(-1)).toMatchObject({ id: "sip", status: "fail", code: "sipNoResponse" });
    expect(res.credentialsSent).toBe(false);
  });

  it("UDP e campos inválidos não abrem conexão", async () => {
    const udp = run({ ...baseCfg, transport: "udp" }, () => null);
    expect((await udp.promise).steps[0].code).toBe("udpNotSupported");
    expect(udp.sockets).toHaveLength(0);
    const bad = run({ ...baseCfg, server: "wss://x.com" }, () => null);
    expect((await bad.promise).steps[0].code).toBe("serverHasScheme");
    expect(bad.sockets).toHaveLength(0);
  });
});

describe("sip-diagnostics: motivo no WebPhone", () => {
  it("traduz o código SIP final", () => {
    expect(describeRegisterFailure({ kind: "status", code: 401 })).toBe("wrongPassword");
    expect(describeRegisterFailure({ kind: "status", code: 404 })).toBe("notFound");
    expect(describeRegisterFailure({ kind: "status", code: 483 })).toBe("loop");
    expect(describeRegisterFailure({ kind: "status", code: 403 })).toBe("forbidden");
    expect(describeRegisterFailure({ kind: "status", code: 408 })).toBe("timeout");
    expect(describeRegisterFailure({ kind: "status", code: 503 })).toBe("serverError");
    expect(describeRegisterFailure({ kind: "status", code: 488 })).toBe("other");
    expect(describeRegisterFailure({ kind: "connection" })).toBe("connection");
    expect(describeRegisterFailure({ kind: "disconnected" })).toBe("disconnected");
  });
});
