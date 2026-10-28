/**
 * Conexão do WebPhone SIP: abre o WebSocket, registra o ramal e se recupera sozinha.
 *
 * Antes daqui a queda do WebSocket (1006: proxy/gateway que fecha conexão parada, aba
 * minimizada, computador que dormiu) deixava o WebPhone em "A conexão caiu, recarregue
 * a página": o sip.js 0.21 não reconecta por padrão e, mesmo reconectando, não refaz o
 * REGISTER. Regras:
 *
 * - Um UserAgent só por configuração: a reconexão usa o MESMO UA, então o Contact não
 *   muda e o PABX não vê dois telefones (Asterisk com `max_contacts=1` recusaria o
 *   segundo até o primeiro vencer). A chamada em curso também sobrevive à troca do socket.
 * - Espera progressiva (2 s, 5 s, 10 s, 30 s e depois 1 min) sem desistir. Ao voltar à aba,
 *   a internet voltar ou o computador acordar, tenta na hora.
 * - Senha, ramal ou domínio recusados param de vez: insistir aciona o fail2ban do
 *   provedor, que bloqueia a rede inteira do escritório.
 * - "Registrado" só com o 200 do servidor, nunca porque o socket abriu.
 * - REGISTER que fica sem resposta (408) ou registro que cai sem motivo = socket morto
 *   que o navegador ainda acha aberto: fecha e reconecta.
 * - Keep-alive CRLF (RFC 7118 §6) só em WS/WSS. No UDP a ponte do backend já pinga.
 * - Log `[SIP]` no console, sem senha, token nem a URL da ponte (que leva o token).
 */
import {
  Registerer,
  RegistererState,
  UserAgent,
  UserAgentState,
  Web,
  type Invitation,
  type UserAgentOptions,
} from "sip.js";
import type { SipRegisterFailure } from "@/lib/sip-diagnostics";

export type SipLinkState = "idle" | "connecting" | "registering" | "registered" | "reconnecting" | "error";

export interface SipLinkStatus {
  state: SipLinkState;
  /** Motivo da última falha (mostrado enquanto reconecta e no erro definitivo). */
  failure: SipRegisterFailure | null;
  /** Tentativas desde a última vez que o registro ficou estável. */
  attempt: number;
}

export interface SipLinkConfig {
  server: string;
  username: string;
  password: string;
  domain?: string;
  port?: number | null;
  transport: "wss" | "ws" | "udp";
  /** Segundos. null/undefined = padrão (25), 0 = desligado. */
  keepAliveInterval?: number | null;
}

export interface SipLinkOptions {
  config: SipLinkConfig;
  onStatus: (status: SipLinkStatus) => void;
  onInvite: (invitation: Invitation) => void;
  /** Opções extras do UA (fábrica de mídia do microfone etc.). */
  userAgentOptions?: Partial<UserAgentOptions>;
  /** URL da ponte UDP, montada de novo a cada conexão (o token do login vence). */
  buildBridgeUrl?: () => string;
  /** Origem do painel (mixed content). Padrão: `window.location.protocol`. */
  pageProtocol?: string;
  /**
   * Há chamada em curso. Com ela o motor não fecha o socket por suspeita (conferência ao
   * voltar à aba, registro que cai sem código): fechar a sinalização no meio da ligação
   * pode fazer o PABX derrubá-la.
   */
  isCallActive?: () => boolean;
}

export const SIP_KEEPALIVE_DEFAULT_SECONDS = 25;
export const SIP_KEEPALIVE_MIN_SECONDS = 10;
export const SIP_KEEPALIVE_MAX_SECONDS = 300;
export const SIP_RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000] as const;
/** REGISTER de conferência (ao voltar à aba) sem resposta neste prazo = socket morto. */
export const SIP_REGISTER_PROBE_TIMEOUT_MS = 10_000;
/** Registro de pé por este tempo zera a espera progressiva. */
export const SIP_STABLE_REGISTRATION_MS = 60_000;
/**
 * REGISTER nosso sem desfecho neste prazo = o sip.js engoliu a resposta (200 sem o nosso
 * Contact quando o registro já estava "não registrado": ele não chama retorno nenhum nem
 * troca de estado). Sem resposta de verdade o Timer F já daria 408 em 32 s.
 */
const REGISTER_OUTCOME_TIMEOUT_MS = 40_000;
/** Portas que o navegador recusa abrir (lista de portas inseguras): nunca conectariam. */
const BROWSER_BLOCKED_PORTS = new Set([5060, 5061]);
/** Aba escondida por menos que isto não confere o registro ao voltar. */
const WAKE_PROBE_MIN_HIDDEN_MS = 30_000;
const WAKE_PROBE_THROTTLE_MS = 30_000;

/** Intervalo efetivo do keep-alive (segundos; 0 = desligado). */
export const resolveKeepAliveSeconds = (
  transport: SipLinkConfig["transport"],
  raw: number | null | undefined
): number => {
  if (transport === "udp") return 0;
  if (raw === null || raw === undefined) return SIP_KEEPALIVE_DEFAULT_SECONDS;
  const n = Number(raw);
  if (!Number.isInteger(n)) return SIP_KEEPALIVE_DEFAULT_SECONDS;
  if (n === 0) return 0;
  return n >= SIP_KEEPALIVE_MIN_SECONDS && n <= SIP_KEEPALIVE_MAX_SECONDS ? n : SIP_KEEPALIVE_DEFAULT_SECONDS;
};

/**
 * Campo "Manter conexão ativa" da Config SIP (/usuarios): vazio = padrão (null), 0 =
 * desligado, 10 a 300 segundos. Espelho do `normalizeSipKeepAliveInput` do backend
 * (helpers/UserSipKeepAliveZPRO.ts) — mudar um exige o outro.
 */
export const parseSipKeepAliveField = (raw: string): number | null | "invalid" => {
  const value = raw.trim();
  if (value === "") return null;
  if (!/^\d{1,4}$/.test(value)) return "invalid";
  const n = Number(value);
  if (n === 0) return 0;
  return n >= SIP_KEEPALIVE_MIN_SECONDS && n <= SIP_KEEPALIVE_MAX_SECONDS ? n : "invalid";
};

/** Espera antes da tentativa `attempt` (1 = primeira), com ±20% para os ramais de um escritório não voltarem juntos. */
export const nextReconnectDelay = (attempt: number, random: () => number = Math.random): number => {
  const index = Math.min(Math.max(attempt, 1), SIP_RECONNECT_DELAYS_MS.length) - 1;
  const base = SIP_RECONNECT_DELAYS_MS[index];
  return Math.round(base * (0.8 + 0.4 * random()));
};

export type RegisterFailureAction = "fatal" | "reconnect" | "retry";

/**
 * O que fazer quando o REGISTER falha. `code` null = registro caiu sem resposta de
 * erro (renovação interna do sip.js, registro vencido, 200 sem o nosso Contact).
 */
export const classifyRegisterFailure = (code: number | null, everRegistered: boolean): RegisterFailureAction => {
  if (code === null) return everRegistered ? "reconnect" : "fatal";
  // Sem resposta do servidor: o socket pode estar morto.
  if (code === 408) return "reconnect";
  // Indisponibilidade passageira do servidor (0 = sem código conhecido).
  if (code === 0 || code === 480 || code === 500 || code === 502 || code === 503 || code === 504) return "retry";
  // 401/407 depois da senha, 403, 404, 483, redirecionamento, 501/505, 6xx: configuração.
  return "fatal";
};

/** Código de fechamento do WebSocket a partir do erro do sip.js (a mensagem leva a URL, nunca logar). */
export const closeCodeFromError = (error: unknown): number | null => {
  const match = /\(code: (\d+)\)/.exec(String((error as { message?: unknown } | null)?.message ?? ""));
  return match ? Number(match[1]) : null;
};

export const buildSipServerUrl = (config: SipLinkConfig): string => {
  const defaultPort = config.transport === "wss" ? 8089 : 5066;
  return `${config.transport}://${config.server}:${config.port ?? defaultPort}/ws`;
};

const log = (level: "info" | "warn", message: string, details?: Record<string, unknown>): void => {
  try {
    const write = level === "warn" ? console.warn : console.info;
    if (details) write(`[SIP] ${message}`, details);
    else write(`[SIP] ${message}`);
  } catch {
    /* console indisponível */
  }
};

/**
 * `waiting`/`waitingChange` são privados na tipagem do sip.js 0.21, mas são o único
 * jeito de saber se há REGISTER sem resposta (o sip.js recusa outro até ele acabar).
 * Ausentes numa versão futura = trata como "sem REGISTER pendente".
 */
type RegistererWaiting = {
  waiting?: boolean;
  waitingChange?: { addListener?: (listener: (waiting: boolean) => void) => void };
};
const isWaiting = (reg: Registerer): boolean => (reg as unknown as RegistererWaiting).waiting === true;
/**
 * Para os timers internos (renovação e vencimento) de um registrador que sai de cena:
 * sem isso a renovação dele dispara depois do `dispose()` e lança "Registerer disposed"
 * solto num setTimeout. Também privado na tipagem.
 */
const clearRegistererTimers = (reg: Registerer): void => {
  try {
    (reg as unknown as { clearTimers?: () => void }).clearTimers?.();
  } catch {
    /* ignore */
  }
};

/** Transporte da ponte UDP: a URL (com o token do login) é refeita a cada conexão. */
const makeBridgeTransport = (buildUrl: () => string) =>
  class BridgeTransport extends Web.Transport {
    get server(): string {
      return buildUrl();
    }
  };

export class SipLink {
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private disposed = false;
  private fatal = false;
  private connecting = false;
  private registering = false;
  private everConnected = false;
  private everRegistered = false;
  /** Sobe a cada socket aberto; um REGISTER pendente de geração antiga morreu com o socket. */
  private connectionGen = 0;
  private readonly sentGen = new WeakMap<Registerer, number>();
  /**
   * O retorno do REGISTER já tratou a queda de registro que acabou de acontecer. Vale só
   * até o fim do passo atual (`markRejectHandled`): recusa sem troca de estado (já estava
   * "não registrado") não pode deixar a marca ligada e engolir a próxima queda.
   */
  private rejectHandled = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private registerRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private registerOutcomeTimer: ReturnType<typeof setTimeout> | null = null;
  private hiddenSince: number | null = null;
  private lastProbeAt = 0;
  private status: SipLinkStatus = { state: "idle", failure: null, attempt: 0 };
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly opts: SipLinkOptions) {}

  get userAgent(): UserAgent | null {
    return this.ua;
  }

  get currentRegisterer(): Registerer | null {
    return this.registerer;
  }

  get currentStatus(): SipLinkStatus {
    return this.status;
  }

  start(): void {
    if (this.disposed || this.ua) return;
    const cfg = this.opts.config;
    const uri = UserAgent.makeURI(`sip:${cfg.username}@${cfg.domain || cfg.server}`);
    if (!uri) {
      this.fail({ kind: "connection" }, "endereço SIP inválido");
      return;
    }
    const pageProtocol =
      this.opts.pageProtocol ?? (typeof window !== "undefined" ? window.location.protocol : "");
    if (cfg.transport === "ws" && pageProtocol === "https:") {
      // ws:// (texto puro) num painel HTTPS é bloqueado pelo navegador (mixed content) e
      // nunca conecta; tentar de novo só geraria tarefas longas na thread principal.
      this.fail({ kind: "connection" }, "ws:// bloqueado em painel HTTPS; use WSS");
      return;
    }
    const isBridge = cfg.transport === "udp";
    if (!isBridge && BROWSER_BLOCKED_PORTS.has(Number(cfg.port ?? (cfg.transport === "wss" ? 8089 : 5066)))) {
      // 5060/5061 são portas SIP sem WebSocket e o navegador nem tenta abrir.
      this.fail({ kind: "connection" }, "porta recusada pelo navegador; use a porta WebSocket do provedor");
      return;
    }
    if (isBridge && !this.opts.buildBridgeUrl) {
      this.fail({ kind: "connection" }, "ponte UDP sem endereço");
      return;
    }
    const keepAlive = resolveKeepAliveSeconds(cfg.transport, cfg.keepAliveInterval);
    // Construção dentro do try: URL inválida ou transporte antigo lança no construtor.
    try {
      this.ua = new UserAgent({
        ...this.opts.userAgentOptions,
        uri,
        transportOptions: {
          server: isBridge ? this.opts.buildBridgeUrl!() : buildSipServerUrl(cfg),
          ...(keepAlive > 0 ? { keepAliveInterval: keepAlive } : {}),
        },
        ...(isBridge ? { transportConstructor: makeBridgeTransport(this.opts.buildBridgeUrl!) } : {}),
        authorizationUsername: cfg.username,
        authorizationPassword: cfg.password,
        logLevel: "error",
        delegate: {
          onConnect: () => this.handleConnect(),
          onDisconnect: (error?: Error) => this.handleDisconnect(error),
          onInvite: (invitation) => {
            if (!this.disposed) this.opts.onInvite(invitation);
          },
        },
      });
    } catch {
      this.ua = null;
      this.fail({ kind: "connection" }, "configuração SIP recusada pelo sip.js");
      return;
    }
    log("info", "iniciando", {
      transporte: cfg.transport,
      servidor: isBridge ? "ponte UDP" : `${cfg.server}:${cfg.port ?? "padrão"}`,
      keepAliveSegundos: keepAlive,
    });
    this.attachWakeListeners();
    this.setStatus("connecting", null);
    this.connect();
  }

  /** Botão "Reconectar agora": pula a espera, sem mexer na contagem. */
  reconnectNow(): void {
    if (this.disposed || this.fatal || !this.ua) return;
    log("info", "reconexão pedida pelo usuário");
    this.clearTimer("reconnectTimer");
    this.clearTimer("registerRetryTimer");
    if (this.ua.isConnected()) this.registerNow();
    else this.connect();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer("reconnectTimer");
    this.clearTimer("registerRetryTimer");
    this.clearTimer("probeTimer");
    this.clearTimer("stableTimer");
    this.clearTimer("registerOutcomeTimer");
    this.cleanups.splice(0).forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    const registerer = this.registerer;
    const ua = this.ua;
    this.registerer = null;
    this.ua = null;
    try {
      if (registerer) clearRegistererTimers(registerer);
      registerer?.dispose().catch(() => {});
    } catch {
      /* ignore */
    }
    ua?.stop().catch(() => {});
  }

  // ── conexão ───────────────────────────────────────────────────────────────

  private connect(): void {
    const ua = this.ua;
    if (this.disposed || this.fatal || !ua || this.connecting) return;
    if (ua.isConnected()) {
      this.registerNow();
      return;
    }
    this.clearTimer("reconnectTimer");
    this.connecting = true;
    const attempt = ua.state === UserAgentState.Started ? ua.reconnect() : ua.start();
    attempt.then(
      () => {
        this.connecting = false;
      },
      () => {
        this.connecting = false;
        if (this.disposed || this.fatal) return;
        log("warn", "não conectou ao servidor SIP", { tentativa: this.attempt + 1 });
        this.setStatus("reconnecting", this.everConnected ? { kind: "disconnected" } : { kind: "connection" });
        this.scheduleReconnect();
      }
    );
  }

  private handleConnect(): void {
    if (this.disposed) return;
    this.connectionGen += 1;
    const recovered = this.everConnected;
    this.everConnected = true;
    log("info", recovered ? "conexão restabelecida" : "conectado");
    this.registerNow();
  }

  private handleDisconnect(error?: Error): void {
    // Sem erro = fechamento pedido por nós (dispose ou reconexão forçada). Parado de vez
    // (senha/ramal recusados): a queda do socket não troca o motivo real por "Reconectando".
    if (this.disposed || this.fatal || !error) return;
    log("warn", "conexão caiu", { codigo: closeCodeFromError(error) });
    this.registering = false;
    this.clearTimer("registerOutcomeTimer");
    this.clearTimer("probeTimer");
    this.clearTimer("stableTimer");
    this.setStatus("reconnecting", { kind: "disconnected" });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.fatal || this.reconnectTimer || this.connecting) return;
    this.attempt += 1;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    // Sem internet: espera o evento "online" (que tenta na hora), com a espera máxima de reserva.
    const delay = offline
      ? SIP_RECONNECT_DELAYS_MS[SIP_RECONNECT_DELAYS_MS.length - 1]
      : nextReconnectDelay(this.attempt);
    this.setStatus("reconnecting", this.status.failure);
    log("info", "nova tentativa agendada", { tentativa: this.attempt, emSegundos: Math.round(delay / 1000), offline });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Socket que o navegador ainda acha aberto mas não responde: fecha e reconecta. */
  private forceReconnect(reason: string): void {
    const ua = this.ua;
    if (this.disposed || this.fatal || !ua) return;
    log("warn", "reconectando", { motivo: reason });
    this.registering = false;
    this.clearTimer("registerOutcomeTimer");
    this.clearTimer("probeTimer");
    this.clearTimer("stableTimer");
    this.clearTimer("registerRetryTimer");
    this.setStatus("reconnecting", this.status.failure ?? { kind: "lost" });
    // Não espera o fechamento: com o par morto o navegador pode levar muito para concluir o
    // aperto de mão de saída, e o sip.js aceita conectar de novo a partir de "Disconnecting".
    if (ua.isConnected()) ua.transport.disconnect().catch(() => {});
    this.scheduleReconnect();
  }

  // ── registro ──────────────────────────────────────────────────────────────

  private createRegisterer(ua: UserAgent): Registerer {
    const reg = new Registerer(ua);
    // A renovação periódica (e a repetição do 423) o sip.js chama `this.register()` sem
    // retorno: a recusa perdia o código e o motor reconectava só para descobri-lo — um
    // REGISTER a mais com a senha trocada no PABX (fail2ban). Toda chamada sem retorno
    // ganha o mesmo tratamento do nosso REGISTER.
    const original = reg.register.bind(reg);
    (reg as unknown as { register: Registerer["register"] }).register = (options = {}) =>
      original(options.requestDelegate ? options : { ...options, requestDelegate: this.backgroundDelegate(reg) });
    (reg as unknown as RegistererWaiting).waitingChange?.addListener?.((waiting: boolean) => {
      if (waiting) this.sentGen.set(reg, this.connectionGen);
    });
    reg.stateChange.addListener((state: RegistererState) => {
      if (this.disposed || reg !== this.registerer) return;
      if (state === RegistererState.Registered) {
        this.handleRegistered();
      } else if (state === RegistererState.Unregistered) {
        // O delegate do nosso REGISTER roda logo depois desta troca, no mesmo passo:
        // deixa ele classificar o código primeiro.
        Promise.resolve().then(() => this.handleUnregistered(reg));
      }
    });
    return reg;
  }

  /** Retorno das renovações que o próprio sip.js dispara. */
  private backgroundDelegate(reg: Registerer) {
    const reject = (statusCode?: number) => {
      if (this.disposed || reg !== this.registerer) return;
      this.handleRegisterFailure(statusCode ?? 0);
    };
    return {
      onAccept: () => {
        if (!this.disposed && reg === this.registerer) this.handleRegistered();
      },
      onReject: (response: { message: { statusCode?: number } }) => reject(response.message.statusCode),
      onRedirect: (response: { message: { statusCode?: number } }) => reject(response.message.statusCode),
    };
  }

  private registerNow(): void {
    const ua = this.ua;
    if (this.disposed || this.fatal || !ua || !ua.isConnected()) return;
    this.clearTimer("registerRetryTimer");
    let reg = this.registerer;
    if (reg && isWaiting(reg)) {
      if (this.sentGen.get(reg) === this.connectionGen) return; // resposta ainda pode chegar neste socket
      // O REGISTER pendente morreu com o socket anterior (só acaba no prazo de 32 s). Um
      // registrador novo no mesmo UA leva o mesmo Contact; o antigo termina sozinho,
      // sem cancelar o registro (já estará "não registrado" quando o prazo vencer).
      this.registerer = null;
      clearRegistererTimers(reg);
      reg.dispose().catch(() => {});
      reg = null;
    }
    if (!reg) {
      reg = this.createRegisterer(ua);
      this.registerer = reg;
    }
    if (this.status.state !== "registered") this.setStatus("registering", this.status.failure);
    this.registering = true;
    const target = reg;
    const done = () => {
      if (target !== this.registerer) return;
      this.registering = false;
      this.clearTimer("probeTimer");
      this.clearTimer("registerOutcomeTimer");
    };
    this.clearTimer("registerOutcomeTimer");
    this.registerOutcomeTimer = setTimeout(() => {
      this.registerOutcomeTimer = null;
      if (this.disposed || this.fatal || target !== this.registerer) return;
      this.registering = false;
      if (target.state === RegistererState.Registered) {
        this.handleRegistered();
        return;
      }
      this.fail({ kind: "rejected" }, "o servidor respondeu ao REGISTER sem confirmar o ramal");
    }, REGISTER_OUTCOME_TIMEOUT_MS);
    target
      .register({
        requestDelegate: {
          // O 200 é a confirmação: depois de uma reconexão o registrador do sip.js
          // continua "Registered" (a queda do socket não mexe nele) e não avisa troca
          // de estado, então só o stateChange deixaria a tela presa em "Registrando".
          onAccept: () => {
            done();
            if (!this.disposed && target === this.registerer) this.handleRegistered();
          },
          onReject: (response) => {
            done();
            if (target === this.registerer) this.handleRegisterFailure(response.message.statusCode ?? 0);
          },
          onRedirect: (response) => {
            done();
            if (target === this.registerer) this.handleRegisterFailure(response.message.statusCode ?? 0);
          },
        },
      })
      .catch(() => {
        done();
        if (this.disposed || target !== this.registerer) return;
        this.scheduleRegisterRetry();
      });
  }

  private handleRegistered(): void {
    this.registering = false;
    this.clearTimer("probeTimer");
    // Registro acabou de ser confirmado: vale como conferência (voltar à aba logo depois
    // de reconectar não manda outro REGISTER).
    this.lastProbeAt = Date.now();
    // Chega duas vezes no 1º registro (stateChange e o 200) e a cada renovação
    // pedida por nós: já registrado, nada muda.
    if (this.status.state === "registered") return;
    const recovered = this.everRegistered;
    this.everRegistered = true;
    log("info", recovered ? "ramal registrado de novo" : "ramal registrado");
    this.setStatus("registered", null);
    this.clearTimer("stableTimer");
    this.stableTimer = setTimeout(() => {
      this.stableTimer = null;
      this.attempt = 0;
    }, SIP_STABLE_REGISTRATION_MS);
  }

  private markRejectHandled(): void {
    this.rejectHandled = true;
    // A troca de estado (se houver) foi agendada antes desta marca e roda primeiro.
    queueMicrotask(() => {
      this.rejectHandled = false;
    });
  }

  private handleRegisterFailure(code: number): void {
    this.markRejectHandled();
    this.registering = false;
    this.clearTimer("registerOutcomeTimer");
    const action = classifyRegisterFailure(code, this.everRegistered);
    log("warn", "registro recusado", { codigo: code, acao: action });
    if (action === "fatal") {
      this.fail({ kind: "status", code }, `servidor respondeu ${code}`);
      return;
    }
    if (action === "reconnect") {
      this.setStatus("reconnecting", { kind: "status", code });
      this.forceReconnect(`registro sem resposta (${code})`);
      return;
    }
    this.setStatus("reconnecting", { kind: "status", code });
    this.scheduleRegisterRetry();
  }

  private handleUnregistered(reg: Registerer): void {
    if (this.disposed || this.fatal || reg !== this.registerer) return;
    if (this.rejectHandled) {
      this.rejectHandled = false;
      return;
    }
    this.clearTimer("stableTimer");
    const action = classifyRegisterFailure(null, this.everRegistered);
    if (action === "fatal") {
      // Nunca registrou e caiu sem código (ex.: 200 sem o nosso Contact).
      this.fail({ kind: "rejected" }, "registro não aceito");
      return;
    }
    // Renovação interna que falhou ou registro vencido: ninguém tratou, então o socket
    // provavelmente morreu. Se for recusa de verdade (senha trocada), o próximo REGISTER
    // traz o código e para de vez.
    this.setStatus("reconnecting", { kind: "lost" });
    if (this.opts.isCallActive?.()) {
      // Em ligação: tenta registrar no mesmo socket; se ele estiver morto o REGISTER volta
      // 408 e aí reconecta.
      this.registerNow();
      return;
    }
    this.forceReconnect("registro caiu");
  }

  private scheduleRegisterRetry(): void {
    if (this.disposed || this.fatal || this.registerRetryTimer) return;
    this.attempt += 1;
    const delay = nextReconnectDelay(this.attempt);
    log("info", "novo registro agendado", { tentativa: this.attempt, emSegundos: Math.round(delay / 1000) });
    this.registerRetryTimer = setTimeout(() => {
      this.registerRetryTimer = null;
      this.registerNow();
    }, delay);
  }

  /** Volta à aba, internet de volta, computador acordou. */
  private wake(probe: boolean): void {
    const ua = this.ua;
    if (this.disposed || this.fatal || !ua) return;
    if (!ua.isConnected()) {
      if (this.connecting) return;
      log("info", "página ativa de novo: reconectando agora");
      this.clearTimer("reconnectTimer");
      this.connect();
      return;
    }
    if (this.registering) return;
    if (this.status.state !== "registered") {
      if (this.registerRetryTimer) {
        this.clearTimer("registerRetryTimer");
        this.registerNow();
      }
      return;
    }
    if (!probe || this.opts.isCallActive?.()) return;
    const now = Date.now();
    if (now - this.lastProbeAt < WAKE_PROBE_THROTTLE_MS) return;
    // Renovação do próprio sip.js em andamento já serve de conferência.
    if (this.registerer && isWaiting(this.registerer)) return;
    this.lastProbeAt = now;
    log("info", "conferindo o registro depois de a página ficar parada");
    this.clearTimer("probeTimer");
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      this.forceReconnect("conferência do registro sem resposta");
    }, SIP_REGISTER_PROBE_TIMEOUT_MS);
    this.registerNow();
  }

  private attachWakeListeners(): void {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (this.hiddenSince === null) this.hiddenSince = Date.now();
        return;
      }
      const hiddenFor = this.hiddenSince === null ? 0 : Date.now() - this.hiddenSince;
      this.hiddenSince = null;
      this.wake(hiddenFor >= WAKE_PROBE_MIN_HIDDEN_MS);
    };
    const onOnline = () => this.wake(true);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) this.wake(true);
    };
    // Page Lifecycle (Chrome): aba congelada em segundo plano e descongelada.
    const onFreeze = () => {
      if (this.hiddenSince === null) this.hiddenSince = Date.now();
    };
    const onResume = () => this.wake(true);
    if (document.visibilityState === "hidden") this.hiddenSince = Date.now();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    this.cleanups.push(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
    });
  }

  // ── estado ────────────────────────────────────────────────────────────────

  private fail(failure: SipRegisterFailure, reason: string): void {
    this.fatal = true;
    this.registering = false;
    this.clearTimer("reconnectTimer");
    this.clearTimer("registerRetryTimer");
    this.clearTimer("probeTimer");
    this.clearTimer("stableTimer");
    this.clearTimer("registerOutcomeTimer");
    log("warn", "parado: precisa de ajuste na configuração", { motivo: reason });
    this.setStatus("error", failure);
  }

  private setStatus(state: SipLinkState, failure: SipRegisterFailure | null): void {
    if (this.disposed) return;
    const next: SipLinkStatus = { state, failure, attempt: this.attempt };
    const prev = this.status;
    if (
      prev.state === next.state &&
      prev.attempt === next.attempt &&
      prev.failure?.kind === next.failure?.kind &&
      prev.failure?.code === next.failure?.code
    ) {
      return;
    }
    this.status = next;
    this.opts.onStatus(next);
  }

  private clearTimer(
    name: "reconnectTimer" | "registerRetryTimer" | "probeTimer" | "stableTimer" | "registerOutcomeTimer"
  ): void {
    const timer = this[name];
    if (timer) clearTimeout(timer);
    this[name] = null;
  }
}
