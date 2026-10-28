/**
 * "Testar conexão" da Config SIP (/usuarios) e motivo da falha de registro do WebPhone.
 *
 * O teste roda no NAVEGADOR, como o WebPhone (AsteriskSipProvider): abre o mesmo
 * `wss://<servidor>:<porta>/ws`, manda um OPTIONS e confere usuário, senha e domínio com
 * um REGISTER de CONSULTA (sem Contact e sem Expires, RFC 3261 §10.2.3) — ele não cria nem
 * remove registro. Nunca usar REGISTER com `expires=0` e o usuário de verdade: no chan_sip
 * (Asterisk antigo) isso desregistra o ramal inteiro e derruba o aparelho em uso.
 *
 * Sondas sem senha (domínio): REGISTER com Contact `expires=0` para um usuário INVENTADO,
 * que não existe para ser derrubado. A senha vai no máximo uma vez por teste.
 *
 * Quando o WebSocket não abre, o navegador não diz o motivo: o servidor do sistema repete
 * só a conexão (`POST /users/sip-diagnostics/connectivity`) e devolve um código.
 */

import MD5 from "crypto-js/md5";
import { UserAgent, version as sipJsVersion } from "sip.js";

export type SipTransport = "wss" | "ws" | "udp";

export interface SipTestConfig {
  server: string;
  port: number;
  username: string;
  password: string;
  domain?: string;
  transport: SipTransport;
}

export type SipTestStepId = "config" | "connect" | "sip" | "account" | "domainHint";
export type SipTestStatus = "running" | "ok" | "fail" | "warn";

export interface SipTestStep {
  id: SipTestStepId;
  status: SipTestStatus;
  /** Chave da mensagem em `sipDiagnostics.codes`. */
  code: string;
  params?: Record<string, string | number>;
}

export interface SipTestResult {
  steps: SipTestStep[];
  transcript: string;
  /** Domínio que o servidor aceitou na sonda (para o botão "Usar"). */
  suggestedDomain?: string;
  /** A senha foi enviada ao servidor neste teste. */
  credentialsSent: boolean;
  /** Algum REGISTER saiu (com ou sem senha): conta para a espera entre testes. */
  registerSent: boolean;
}

export interface SipConnectivityResponse {
  ok: boolean;
  code: string;
  step?: string;
  httpStatus?: number;
  cert?: { subject?: string; issuer?: string; validTo?: string; selfSigned?: boolean };
  handshakeCode?: string;
  handshakeHttpStatus?: number;
}

export interface SipTestDeps {
  /** null = rota indisponível (backend antigo, rede). */
  checkConnectivity: (input: {
    server: string;
    port: number;
    transport: "wss" | "ws";
    origin: string;
  }) => Promise<SipConnectivityResponse | null>;
  /** Endereços públicos do nome; null/[] = sem candidato. */
  resolveHost: (host: string) => Promise<string[] | null>;
  onUpdate?: (steps: SipTestStep[]) => void;
  /**
   * Chamado ANTES de cada REGISTER sair (consulta com senha ou sonda sem senha): é
   * daí que conta a espera entre testes, porque toda recusa pode contar no fail2ban.
   */
  onRegisterSent?: () => void;
  isCancelled?: () => boolean;
  createWebSocket?: (url: string) => WebSocket;
  pageProtocol?: string;
  pageOrigin?: string;
  timeouts?: { open?: number; request?: number };
}

// Mesmo prazo de abertura do sip.js (`connectionTimeout` padrão de 5 s): servidor que
// abre em 6 s passaria no teste e falharia no WebPhone.
const OPEN_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;
const SIP_USER_AGENT = `SIP.js/${sipJsVersion}`;

// ── Validação dos campos ────────────────────────────────────────────────────

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export const isIpAddress = (value: string): boolean => {
  const v = value.trim().replace(/^\[|\]$/g, "");
  // IPv6 tem pelo menos 2 ":" — senão "abc:5060" ou "1.2.3.4:5060" (domínio com porta) passariam.
  return IPV4_RE.test(v) || (v.split(":").length >= 3 && /^[0-9a-f:.]+$/i.test(v));
};

type ConfigIssue = { code: string; params?: Record<string, string | number> } | null;

export const validateSipTestConfig = (
  cfg: SipTestConfig,
  pageProtocol: string
): ConfigIssue => {
  const server = (cfg.server || "").trim();
  const domain = (cfg.domain || "").trim();
  if (!server || !(cfg.username || "").trim() || !cfg.password) return { code: "configMissing" };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(server) || /^sips?:/i.test(server)) return { code: "serverHasScheme" };
  if (server.includes("/")) return { code: "serverHasPath" };
  const hostPort = /^([^:\s]+):(\d{1,5})$/.exec(server);
  if (hostPort) return { code: "serverHasPort", params: { port: hostPort[2] } };
  if (/\s/.test(server) || server.includes("@")) return { code: "serverInvalid" };
  const port = Number(cfg.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { code: "portInvalid" };
  if (domain && (/^sips?:/i.test(domain) || /[@/\s]/.test(domain) || (/:\d+$/.test(domain) && !isIpAddress(domain)))) {
    return { code: "domainInvalid" };
  }
  if (cfg.transport === "ws" && pageProtocol === "https:") return { code: "mixedContent" };
  const user = cfg.username.trim();
  if (!UserAgent.makeURI(`sip:${user}@${domain || server}`)) return { code: "uriInvalid" };
  return null;
};

// ── Mensagens SIP ───────────────────────────────────────────────────────────

const randomToken = (size = 10): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(size);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < size; i++) out += chars[bytes[i] % chars.length];
  return out;
};

export interface ParsedSipMessage {
  isResponse: boolean;
  status: number;
  reason: string;
  method: string;
  headers: Record<string, string[]>;
}

const COMPACT_HEADERS: Record<string, string> = {
  i: "call-id",
  m: "contact",
  f: "from",
  t: "to",
  v: "via",
  l: "content-length",
};

export const parseSipMessage = (raw: string): ParsedSipMessage | null => {
  const headEnd = raw.indexOf("\r\n\r\n");
  const head = (headEnd >= 0 ? raw.slice(0, headEnd) : raw).replace(/\r\n[ \t]+/g, " ");
  const lines = head.split("\r\n");
  const first = lines[0] || "";
  const headers: Record<string, string[]> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    let name = line.slice(0, idx).trim().toLowerCase();
    name = COMPACT_HEADERS[name] || name;
    (headers[name] ||= []).push(line.slice(idx + 1).trim());
  }
  const statusMatch = /^SIP\/2\.0 (\d{3})\s*(.*)$/.exec(first);
  if (statusMatch) {
    return { isResponse: true, status: Number(statusMatch[1]), reason: statusMatch[2] || "", method: "", headers };
  }
  const requestMatch = /^([A-Z]+) \S+ SIP\/2\.0$/.exec(first);
  if (requestMatch) return { isResponse: false, status: 0, reason: "", method: requestMatch[1], headers };
  return null;
};

/**
 * Parâmetros de um `WWW-Authenticate`/`Proxy-Authenticate: Digest ...`. O valor entre
 * aspas fica CRU (escapes incluídos), como o sip.js guarda e devolve no Authorization.
 */
export const parseDigestChallenge = (value: string): Record<string, string> | null => {
  const m = /^\s*Digest\s+(.*)$/i.exec(value || "");
  if (!m) return null;
  const params: Record<string, string> = {};
  const re = /([a-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(m[1]))) {
    params[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3];
  }
  return params;
};

const md5 = (value: string): string => MD5(value).toString();

export interface DigestInput {
  challenge: Record<string, string>;
  method: string;
  uri: string;
  username: string;
  password: string;
  cnonce?: string;
}

/**
 * Cabeçalho de autorização Digest MD5 (RFC 2617), com as mesmas recusas do sip.js
 * (`core/messages/digest-authentication.js`): algoritmo diferente de MD5, desafio sem
 * realm ou sem nonce, e qop sem "auth" nem "auth-int" abortam — o WebPhone falharia.
 */
export const buildDigestAuthorization = (
  input: DigestInput
): { value: string; unsupported?: string; invalid?: boolean } => {
  const { challenge, method, uri, username, password } = input;
  const algorithm = challenge.algorithm || "MD5";
  if (algorithm.toUpperCase() !== "MD5") return { value: "", unsupported: algorithm };
  const realm = challenge.realm || "";
  const nonce = challenge.nonce || "";
  if (!realm || !nonce) return { value: "", invalid: true };
  const qopOptions = (challenge.qop || "").split(",").map((q) => q.trim().toLowerCase()).filter(Boolean);
  const qop = qopOptions.includes("auth") ? "auth" : qopOptions.includes("auth-int") ? "auth-int" : "";
  if (qopOptions.length && !qop) return { value: "", invalid: true };
  const nc = "00000001";
  const cnonce = input.cnonce || randomToken(12);
  const safeUser = username.replace(/["\\]/g, "");
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = qop === "auth-int" ? md5(`${method}:${uri}:${md5("")}`) : md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  let value =
    `Digest algorithm=MD5, username="${safeUser}", realm="${realm}", nonce="${nonce}", ` +
    `uri="${uri}", response="${response}"`;
  if (challenge.opaque !== undefined) value += `, opaque="${challenge.opaque}"`;
  if (qop) value += `, qop=${qop}, cnonce="${cnonce}", nc=${nc}`;
  return { value };
};

/**
 * Texto copiado para o provedor: o que é derivado da senha sai mascarado — `response`
 * do Authorization/Proxy-Authorization e `rspauth` do Authentication-Info, com ou sem
 * aspas e com espaços em volta do "=".
 */
export const maskSipTranscript = (text: string): string =>
  text.replace(/\b(response|rspauth)(\s*=\s*)("?)[^",\s]*/gi, "$1$2$3***");

interface SipRequestSpec {
  method: "OPTIONS" | "REGISTER";
  ruri: string;
  toUri: string;
  fromUri: string;
  callId: string;
  fromTag: string;
  cseq: number;
  extra?: string[];
}

class SipProbeSocket {
  private ws: WebSocket;
  private viaHost = `${randomToken(12)}.invalid`;
  private viaTransport: string;
  private waiters: { callId: string; cseq: number; resolve: (msg: ParsedSipMessage | null) => void }[] = [];
  closed = false;
  transcript: string[] = [];
  private startedAt = Date.now();

  constructor(ws: WebSocket, transport: "wss" | "ws") {
    this.ws = ws;
    this.viaTransport = transport === "wss" ? "WSS" : "WS";
    // Há servidor que responde em frame binário; o sip.js decodifica, o teste também.
    try {
      ws.binaryType = "arraybuffer";
    } catch {
      /* ignore */
    }
    ws.onmessage = (event) => {
      const data: unknown = event.data;
      if (typeof data === "string") {
        this.handle(data);
        return;
      }
      // Por marca de tipo, não instanceof: o buffer pode vir de outro contexto.
      const tag = Object.prototype.toString.call(data);
      if (tag === "[object ArrayBuffer]" || ArrayBuffer.isView(data)) {
        try {
          this.handle(new TextDecoder().decode(data as ArrayBuffer));
        } catch {
          /* frame ilegível: ignora */
        }
      }
    };
    ws.onclose = () => {
      this.closed = true;
      this.log("--", "connection closed by the server");
      this.waiters.splice(0).forEach((w) => w.resolve(null));
    };
  }

  private log(dir: string, text: string) {
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(2);
    this.transcript.push(`[+${elapsed}s] ${dir} ${text.replace(/\r\n$/, "")}`);
  }

  private handle(raw: string) {
    if (!raw.trim()) return; // keep-alive CRLF
    this.log("<<", raw);
    const msg = parseSipMessage(raw);
    if (!msg || !msg.isResponse || msg.status < 200) return;
    const callId = (msg.headers["call-id"] || [])[0] || "";
    const cseq = Number(((msg.headers.cseq || [])[0] || "").split(/\s+/)[0]);
    const idx = this.waiters.findIndex((w) => w.callId === callId && w.cseq === cseq);
    if (idx >= 0) this.waiters.splice(idx, 1)[0].resolve(msg);
  }

  send(spec: SipRequestSpec, timeoutMs: number): Promise<ParsedSipMessage | null> {
    if (this.closed) return Promise.resolve(null);
    const lines = [
      `${spec.method} ${spec.ruri} SIP/2.0`,
      `Via: SIP/2.0/${this.viaTransport} ${this.viaHost};branch=z9hG4bK${randomToken(10)}`,
      "Max-Forwards: 70",
      `To: <${spec.toUri}>`,
      `From: <${spec.fromUri}>;tag=${spec.fromTag}`,
      `Call-ID: ${spec.callId}`,
      `CSeq: ${spec.cseq} ${spec.method}`,
      ...(spec.extra || []),
      `User-Agent: ${SIP_USER_AGENT}`,
      "Content-Length: 0",
      "",
      "",
    ];
    const raw = lines.join("\r\n");
    return new Promise((resolve) => {
      const waiter = { callId: spec.callId, cseq: spec.cseq, resolve };
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) this.waiters.splice(idx, 1);
        this.log("--", `no response after ${Math.round(timeoutMs / 1000)}s (${spec.method})`);
        resolve(null);
      }, timeoutMs);
      waiter.resolve = (msg) => {
        clearTimeout(timer);
        resolve(msg);
      };
      this.waiters.push(waiter);
      this.log(">>", raw);
      try {
        this.ws.send(raw);
      } catch {
        waiter.resolve(null);
      }
    });
  }

  close() {
    try {
      this.ws.onclose = null;
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

const openWebSocket = (
  url: string,
  create: (url: string) => WebSocket,
  timeoutMs: number,
  isCancelled: () => boolean
): Promise<WebSocket | null> =>
  new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = create(url);
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value: WebSocket | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(cancelPoll);
      if (!value) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const cancelPoll = setInterval(() => {
      if (isCancelled()) finish(null);
    }, 200);
    ws.onopen = () => finish(ws);
    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });

// ── Mapeamento das respostas ────────────────────────────────────────────────

const CERT_CODES = new Set([
  "tlsCertExpired",
  "tlsCertNotYetValid",
  "tlsCertSelfSigned",
  "tlsCertHostname",
  "tlsCertUntrusted",
]);

const formatCertDate = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  // AAAA-MM-DD: sem ambiguidade de dia/mês em nenhum idioma.
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/** Código da rota de conectividade → mensagem do passo "Conexão". */
export const connectivityToStep = (
  res: SipConnectivityResponse | null,
  ctx: { host: string; port: number; origin: string; transport?: "wss" | "ws" }
): SipTestStep => {
  const base = {
    host: ctx.host,
    port: ctx.port,
    origin: ctx.origin,
    scheme: ctx.transport === "ws" ? "http" : "https",
  };
  if (!res) return { id: "connect", status: "fail", code: "checkUnavailable", params: base };
  if (res.ok) return { id: "connect", status: "fail", code: "browserOnly", params: base };
  // "Não reconhecido" costuma ser cadeia incompleta: o Node não busca o intermediário
  // que falta e o Chrome busca. Se o aperto de mão TAMBÉM falhou, é ele que o
  // navegador provavelmente encontrou — mostra esse.
  if (res.code === "tlsCertUntrusted" && res.handshakeCode && res.handshakeCode !== "ok") {
    return connectivityToStep({ ok: false, code: res.handshakeCode, httpStatus: res.handshakeHttpStatus }, ctx);
  }
  if (CERT_CODES.has(res.code)) {
    return {
      id: "connect",
      status: "fail",
      code: res.code,
      params: {
        ...base,
        validTo: formatCertDate(res.cert?.validTo),
        subject: res.cert?.subject || "",
        issuer: res.cert?.issuer || "",
      },
    };
  }
  if (res.code === "wsHttpStatus") {
    const status = Number(res.httpStatus) || 0;
    const code =
      status === 404 ? "wsHttp404"
      : status === 400 ? "wsHttp400"
      : status === 403 || status === 401 ? "wsHttp403"
      : status >= 300 && status < 400 ? "wsHttpRedirect"
      : "wsHttpOther";
    return { id: "connect", status: "fail", code, params: { ...base, status } };
  }
  const known = new Set([
    "privateNetwork", "ownMachine", "dnsNotFound", "dnsFailed", "tcpRefused", "tcpTimeout", "tcpUnreachable",
    "tcpFailed", "tlsNotTls", "tlsFailed", "wsNoSubprotocol", "wsBadAccept", "wsIsSipTcp",
    "wsNoResponse", "wsBadResponse", "rateLimited", "invalidInput",
  ]);
  const code = known.has(res.code) ? (res.code === "invalidInput" ? "serverInvalid" : res.code) : "checkUnavailable";
  return { id: "connect", status: "fail", code, params: base };
};

/** Resposta final do REGISTER autenticado (ou sem desafio) → passo "Ramal". */
export const registerStatusToCode = (status: number): string => {
  if (status >= 200 && status < 300) return "accountOk";
  if (status === 401 || status === 407) return "accountWrongPassword";
  if (status === 403) return "accountForbidden";
  if (status === 404) return "accountNotFound";
  if (status === 483) return "accountLoop";
  if (status === 408 || status === 480) return "accountTimeout";
  if (status === 405 || status === 501) return "accountMethodNotAllowed";
  if (status >= 500) return "accountServerError";
  return "accountOther";
};

/**
 * Domínio aceito na sonda sem senha: o servidor pediu senha (ou aceitou). 403 fica fora:
 * pode ser "não atendo esse domínio" (o Kamailio responde 403 "Not relaying").
 */
const domainAcceptedBy = (status: number): boolean =>
  (status >= 200 && status < 300) || status === 401 || status === 407;

const countBindings = (msg: ParsedSipMessage): number =>
  (msg.headers.contact || []).reduce((total, value) => total + (value.match(/<[^>]+>/g)?.length || (value.trim() ? 1 : 0)), 0);

// ── Teste ───────────────────────────────────────────────────────────────────

export const runSipConnectionTest = async (
  cfg: SipTestConfig,
  deps: SipTestDeps
): Promise<SipTestResult> => {
  const steps: SipTestStep[] = [];
  const transcript: string[] = [];
  const isCancelled = deps.isCancelled || (() => false);
  const pageProtocol = deps.pageProtocol ?? (typeof window !== "undefined" ? window.location.protocol : "https:");
  const pageOrigin = deps.pageOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const openTimeout = deps.timeouts?.open ?? OPEN_TIMEOUT_MS;
  const requestTimeout = deps.timeouts?.request ?? REQUEST_TIMEOUT_MS;
  let credentialsSent = false;
  let registerSent = false;
  let suggestedDomain: string | undefined;
  const markRegisterSent = () => {
    registerSent = true;
    deps.onRegisterSent?.();
  };

  const push = (step: SipTestStep) => {
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx >= 0) steps[idx] = step;
    else steps.push(step);
    deps.onUpdate?.([...steps]);
  };
  const result = (): SipTestResult => ({
    steps: [...steps],
    transcript: maskSipTranscript(transcript.join("\n\n")),
    suggestedDomain,
    credentialsSent,
    registerSent,
  });

  if (cfg.transport === "udp") {
    push({ id: "config", status: "fail", code: "udpNotSupported" });
    return result();
  }
  const issue = validateSipTestConfig(cfg, pageProtocol);
  if (issue) {
    push({ id: "config", status: "fail", code: issue.code, params: issue.params });
    return result();
  }
  push({ id: "config", status: "ok", code: "configOk" });

  const server = cfg.server.trim();
  const domain = (cfg.domain || "").trim() || server;
  const username = cfg.username.trim();
  // Mesmas URIs do WebPhone (o sip.js escapa o usuário e monta o registrador como sip:<domínio>).
  const aor = String(UserAgent.makeURI(`sip:${username}@${domain}`));
  const registrar = String(UserAgent.makeURI(`sip:${domain}`) || `sip:${domain}`);
  const transport = cfg.transport as "wss" | "ws";
  const port = Number(cfg.port);
  const url = `${transport}://${server}:${port}/ws`;

  push({ id: "connect", status: "running", code: "connecting", params: { url } });
  const create = deps.createWebSocket || ((u: string) => new WebSocket(u, "sip"));
  const ws = await openWebSocket(url, create, openTimeout, isCancelled);
  if (isCancelled()) {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    return result();
  }
  if (!ws) {
    transcript.push(`-- could not open ${url}`);
    const detail = await deps
      .checkConnectivity({ server, port, transport, origin: pageOrigin })
      .catch(() => null);
    push(connectivityToStep(detail, { host: server, port, origin: pageOrigin, transport }));
    return result();
  }
  push({ id: "connect", status: "ok", code: "connectOk", params: { url } });

  const sock = new SipProbeSocket(ws, transport);
  const finish = (): SipTestResult => {
    sock.close();
    transcript.push(`-- ${url}`, ...sock.transcript);
    return result();
  };

  // 1) OPTIONS: o servidor fala SIP? Qualquer resposta serve (há quem responda 404/405).
  push({ id: "sip", status: "running", code: "sipChecking" });
  const optionsFrom = randomToken(8);
  const options = await sock.send(
    {
      method: "OPTIONS",
      ruri: registrar,
      toUri: registrar,
      fromUri: aor,
      callId: randomToken(20),
      fromTag: optionsFrom,
      cseq: 1,
      extra: ["Accept: application/sdp"],
    },
    requestTimeout
  );
  if (isCancelled()) return finish();
  if (!options) {
    push({ id: "sip", status: "fail", code: sock.closed ? "sipClosed" : "sipNoResponse" });
    return finish();
  }
  const agent = ((options.headers.server || options.headers["user-agent"] || [])[0] || "").slice(0, 80);
  push(agent ? { id: "sip", status: "ok", code: "sipOkAgent", params: { agent } } : { id: "sip", status: "ok", code: "sipOk" });

  // Sonda sem senha com usuário inventado: o domínio é atendido por esse servidor?
  const probeDomain = async (probe: string): Promise<number> => {
    const fake = `sipdiag${randomToken(8)}`;
    markRegisterSent();
    const res = await sock.send(
      {
        method: "REGISTER",
        ruri: `sip:${probe}`,
        toUri: `sip:${fake}@${probe}`,
        fromUri: `sip:${fake}@${probe}`,
        callId: randomToken(20),
        fromTag: randomToken(8),
        cseq: 1,
        extra: [`Contact: <sip:${randomToken(8)}@${randomToken(12)}.invalid;transport=ws>;expires=0`],
      },
      requestTimeout
    );
    return res ? res.status : 0;
  };

  const tryDomainHint = async () => {
    const source = domain;
    if (isIpAddress(source)) return;
    const addresses = await deps.resolveHost(source).catch(() => null);
    const candidate = (addresses || []).find((a) => IPV4_RE.test(a) && a !== source);
    if (!candidate || isCancelled() || sock.closed) return;
    push({ id: "domainHint", status: "running", code: "domainHintChecking", params: { domain: candidate } });
    const status = await probeDomain(candidate);
    if (domainAcceptedBy(status)) {
      suggestedDomain = candidate;
      push({ id: "domainHint", status: "warn", code: "domainHintFound", params: { domain: candidate, from: source } });
    } else {
      push({ id: "domainHint", status: "warn", code: "domainHintNone", params: { domain: candidate } });
    }
  };

  // 2) REGISTER de consulta: sem Contact e sem Expires = não muda registro nenhum.
  push({ id: "account", status: "running", code: "accountChecking" });
  const callId = randomToken(20);
  const fromTag = randomToken(8);
  let cseq = 1;
  const query = (extra: string[] = []) => {
    markRegisterSent();
    return sock.send({ method: "REGISTER", ruri: registrar, toUri: aor, fromUri: aor, callId, fromTag, cseq, extra }, requestTimeout);
  };

  let res = await query();
  if (isCancelled()) return finish();
  if (!res) {
    push({ id: "account", status: "fail", code: sock.closed ? "sipClosed" : "accountTimeout" });
    return finish();
  }

  const params = { domain, user: username, status: res.status, reason: (res.reason || "").slice(0, 60) };

  if (res.status === 400) {
    // Há registrador que exige Contact até na consulta: confere só o domínio, sem senha.
    const probe = await probeDomain(domain);
    if (domainAcceptedBy(probe)) {
      push({ id: "account", status: "warn", code: "accountQueryUnsupported", params });
    } else if (probe === 404 || probe === 483) {
      push({ id: "account", status: "fail", code: probe === 404 ? "accountNotFound" : "accountLoop", params });
      await tryDomainHint();
    } else {
      push({ id: "account", status: "fail", code: "accountBadRequest", params });
    }
    return finish();
  }

  let attempts = 0;
  while ((res.status === 401 || res.status === 407) && attempts < 2) {
    const headerName = res.status === 407 ? "proxy-authenticate" : "www-authenticate";
    const challenge = (res.headers[headerName] || [])
      .map(parseDigestChallenge)
      .find((c): c is Record<string, string> => !!c);
    if (!challenge) {
      push({ id: "account", status: "fail", code: "accountOther", params: { ...params, status: res.status } });
      return finish();
    }
    // Repetição só quando o servidor diz que o nonce venceu (stale): nunca 2 senhas erradas.
    if (attempts === 1 && String(challenge.stale || "").toLowerCase() !== "true") break;
    const auth = buildDigestAuthorization({ challenge, method: "REGISTER", uri: registrar, username, password: cfg.password });
    if (auth.unsupported) {
      push({ id: "account", status: "fail", code: "accountAlgorithmUnsupported", params: { ...params, algorithm: auth.unsupported.slice(0, 20) } });
      return finish();
    }
    if (auth.invalid) {
      push({ id: "account", status: "fail", code: "accountBadChallenge", params });
      return finish();
    }
    attempts++;
    cseq++;
    credentialsSent = true;
    const next = await query([`${res.status === 407 ? "Proxy-Authorization" : "Authorization"}: ${auth.value}`]);
    if (isCancelled()) return finish();
    if (!next) {
      push({ id: "account", status: "fail", code: sock.closed ? "sipClosed" : "accountTimeout" });
      return finish();
    }
    res = next;
  }

  const finalParams = { ...params, status: res.status, reason: (res.reason || "").slice(0, 60) };
  let code = registerStatusToCode(res.status);
  // 404 depois de a senha passar: o domínio respondeu; quem não existe é o ramal.
  if (code === "accountNotFound" && credentialsSent) code = "accountNotFoundAfterAuth";
  if (code === "accountOk") {
    if (!credentialsSent) {
      push({ id: "account", status: "warn", code: "accountOkNoAuth", params: finalParams });
    } else {
      push({ id: "account", status: "ok", code: "accountOk", params: { ...finalParams, bindings: countBindings(res) } });
    }
    return finish();
  }
  push({ id: "account", status: "fail", code, params: finalParams });
  if ((code === "accountNotFound" || code === "accountLoop") && !credentialsSent) {
    await tryDomainHint();
  }
  return finish();
};

// ── Motivo da falha de registro no WebPhone ────────────────────────────────

// "lost" = estava registrado e a renovação falhou; "rejected" = nunca registrou e o
// sip.js não deu código (3xx, 200 sem o nosso Contact) — recarregar não resolve.
export type SipRegisterFailureKind = "status" | "connection" | "disconnected" | "lost" | "rejected";

export interface SipRegisterFailure {
  kind: SipRegisterFailureKind;
  /** Código SIP final quando `kind === "status"`. */
  code?: number;
}

/** Chave em `sipDiagnostics.webphone` para o motivo mostrado no WebPhone. */
export const describeRegisterFailure = (failure: SipRegisterFailure): string => {
  if (failure.kind !== "status") return failure.kind;
  const status = failure.code || 0;
  if (status === 401 || status === 407) return "wrongPassword";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 483) return "loop";
  if (status === 408 || status === 480) return "timeout";
  if (status >= 500) return "serverError";
  return "other";
};
