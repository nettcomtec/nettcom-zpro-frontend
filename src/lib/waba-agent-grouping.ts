// Juntar os textos do atendente no WhatsApp oficial (WABA) — gerente com estado.
// docs/PLANO_WABA_JUNTAR_MENSAGENS.md (Passo 6; D9–D13, D17; R6–R8, R12, O8–O12).
//
// A tela segura o texto do atendente por alguns segundos num balão que cresce e
// manda os textos seguidos numa mensagem só (a Meta cobra cada mensagem). Um grupo
// ABERTO por atendimento, em três estados:
//   collecting → esperando o próximo texto (timer reinicia a cada texto, teto 30 s);
//   sending    → POST no ar; texto novo abre OUTRO grupo, com outro idFront (R8);
//   done       → saiu (ou falhou e o balão ganhou o "Tentar novamente").
// O envio vai direto por `api.post("/wabametaText")` com `groupedSend: true`, nunca
// pelas funções de services que soltam o grupo antes (recursão). O servidor descarta
// a repetição do mesmo idFront (Passo 7). Regras sem estado: `lib/waba-text-grouping`.
import api from "@/lib/api";
import {
  fitsGroupedText,
  joinGroupedText,
  mergeGroupedCaption,
  nextFlushDelayMs,
  normalizeAgentSeconds,
  shouldGroupAgentText,
} from "@/lib/waba-text-grouping";

/** Teto da espera de quem precisa que o texto guardado saia antes (R6/O11). */
export const FLUSH_PENDING_MAX_WAIT_MS = 8000;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

/** Retrato do destino, tirado no 1º texto do grupo (o grupo sai por ele mesmo depois de trocar de atendimento). */
export interface WabaGroupBase {
  from: string;
  tokenApi: string;
  ticketId: number;
}

/** O que a página precisa para desenhar/atualizar o balão do grupo. */
export interface WabaGroupSnapshot {
  ticketId: number;
  idFront: string;
  body: string;
  quotedMsg?: unknown;
  createdAt: string;
}

/** Avisos do gerente para a página (balão e "Tentar novamente"). Nenhum pode lançar para cá. */
export interface WabaGroupCallbacks {
  /** O grupo começou a sair: o balão deixa de mostrar "juntando". */
  onSending?: (snap: WabaGroupSnapshot) => void;
  /** O servidor confirmou o envio (inclui a repetição descartada, `{ duplicate: true }`). */
  onSent?: (snap: WabaGroupSnapshot) => void;
  /** O envio falhou. `retry` reenvia o MESMO corpo com o MESMO idFront, sem `groupedSend` (como o envio de hoje). */
  onFailed?: (snap: WabaGroupSnapshot, err: unknown, retry: () => Promise<unknown>) => void;
  /** O texto virou legenda de um arquivo: o balão do texto sai da tela. */
  onRemove?: (snap: WabaGroupSnapshot) => void;
}

export interface AppendOrStartInput {
  ticketId: number;
  /** Texto já com a assinatura aplicada (a repetida sai na junção). */
  text: string;
  quotedMsg?: unknown;
  /** Segundos do canal (`wabaGroupAgentSeconds`). */
  seconds: number;
  base: WabaGroupBase;
  callbacks: WabaGroupCallbacks;
}

export interface AppendOrStartResult extends WabaGroupSnapshot {
  /** true = o texto entrou num balão que já estava na tela. */
  appended: boolean;
}

type GroupState = "collecting" | "sending" | "done";

interface Group {
  ticketId: number;
  idFront: string;
  state: GroupState;
  parts: string[];
  quotedMsg?: unknown;
  firstAt: number;
  createdAt: string;
  deadline: number;
  base: WabaGroupBase;
  callbacks: WabaGroupCallbacks;
  timer: ReturnType<typeof setTimeout> | null;
  sending: Promise<void> | null;
}

// Grupo em espera por atendimento (no máximo um) e os envios em andamento por atendimento.
const openGroups = new Map<number, Group>();
const inFlight = new Map<number, Set<Promise<void>>>();

function toTicketId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function newIdFront(): string {
  return `front-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function snapshotOf(g: Group): WabaGroupSnapshot {
  return {
    ticketId: g.ticketId,
    idFront: g.idFront,
    body: joinGroupedText(g.parts),
    quotedMsg: g.quotedMsg,
    createdAt: g.createdAt,
  };
}

function payloadOf(g: Group): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    read: 1,
    fromMe: true,
    mediaUrl: "",
    body: joinGroupedText(g.parts),
    from: g.base.from,
    tokenApi: g.base.tokenApi,
    ticketId: g.base.ticketId,
    idFront: g.idFront,
    groupedSend: true,
  };
  if (g.quotedMsg) payload.quotedMsg = g.quotedMsg;
  return payload;
}

/**
 * POST do texto juntado. Não solta grupo nenhum antes. A resposta `{ duplicate: true }`
 * (mesmo idFront já gravado) é sucesso: quem chama segue como enviado.
 */
export function postGroupedWabaText(payload: Record<string, unknown>) {
  return api.post("/wabametaText", payload);
}

// Saída da página (pagehide): o XHR não sobrevive ao fechamento, o fetch com keepalive
// sim (melhor esforço; token vencido ou navegador que recusa = texto perdido, risco de D9).
// Mesma base e mesmo token do `lib/api.ts`.
async function postGroupedWabaTextKeepalive(payload: Record<string, unknown>): Promise<void> {
  const base = String(api.defaults.baseURL || "").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  try {
    const raw = localStorage.getItem("token");
    const token = raw ? JSON.parse(raw) : null;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // sem token: o servidor recusa e o texto fica com a falha
  }
  const res = await fetch(`${base}/wabametaText`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    credentials: "include",
    keepalive: true,
  });
  if (!res.ok) throw { status: res.status };
}

function trackInFlight(ticketId: number, p: Promise<void>): void {
  let set = inFlight.get(ticketId);
  if (!set) {
    set = new Set();
    inFlight.set(ticketId, set);
  }
  set.add(p);
  // `p` nunca rejeita (o envio trata o próprio erro), então o `then` não deixa rejeição solta.
  void p.then(() => {
    const current = inFlight.get(ticketId);
    if (!current) return;
    current.delete(p);
    if (current.size === 0) inFlight.delete(ticketId);
  });
}

function startSend(g: Group, transport: "xhr" | "keepalive"): Promise<void> {
  if (g.state !== "collecting") return g.sending ?? Promise.resolve();
  if (g.timer) clearTimeout(g.timer);
  g.timer = null;
  if (openGroups.get(g.ticketId) === g) openGroups.delete(g.ticketId);
  const snap = snapshotOf(g);
  if (!snap.body) {
    g.state = "done";
    try { g.callbacks.onRemove?.(snap); } catch { /* aviso da página nunca derruba o gerente */ }
    return Promise.resolve();
  }
  g.state = "sending";
  const payload = payloadOf(g);
  // "Tentar novamente" vai SEM `groupedSend`: com ele o servidor responderia `duplicate`
  // para uma 1ª tentativa que morreu sem marcar falha (ack 0) e nada sairia.
  const retryPayload: Record<string, unknown> = { ...payload };
  delete retryPayload.groupedSend;
  const retry = () => postGroupedWabaText(retryPayload);
  try { g.callbacks.onSending?.(snap); } catch { /* idem */ }
  const run = (async () => {
    try {
      if (transport === "keepalive") {
        try {
          await postGroupedWabaTextKeepalive(payload);
        } catch {
          // Navegador que recusa o keepalive com CORS, token vencido (o envio normal renova)
          // ou recusa do servidor: tenta pelo envio normal. Sem envio em dobro: com
          // `groupedSend`, a linha já gravada pelo 1º pedido responde `duplicate`.
          await postGroupedWabaText(payload);
        }
      } else {
        await postGroupedWabaText(payload);
      }
      g.state = "done";
      try { g.callbacks.onSent?.(snap); } catch { /* idem */ }
    } catch (err) {
      g.state = "done";
      try { g.callbacks.onFailed?.(snap, err, retry); } catch { /* idem */ }
    }
  })();
  g.sending = run;
  trackInFlight(g.ticketId, run);
  return run;
}

function schedule(g: Group, delayMs: number): void {
  if (g.timer) clearTimeout(g.timer);
  g.deadline = Date.now() + delayMs;
  g.timer = setTimeout(() => { void startSend(g, "xhr"); }, delayMs);
}

/**
 * Texto novo do atendente. Com grupo esperando e sem citação nova, acrescenta e reinicia
 * a espera; texto citando (D12) ou que não cabe em 4.096 solta o que esperava e abre outro
 * grupo. `null` = não junta (o texto sai pelo envio de sempre).
 */
export function appendOrStart(input: AppendOrStartInput): AppendOrStartResult | null {
  const ticketId = toTicketId(input.ticketId);
  const seconds = normalizeAgentSeconds(input.seconds);
  const text = typeof input.text === "string" ? input.text : "";
  if (ticketId == null || seconds <= 0 || !text.trim() || !fitsGroupedText([], text)) return null;
  installPageListeners();
  const now = Date.now();
  const open = openGroups.get(ticketId);
  if (open && open.state === "collecting") {
    if (!input.quotedMsg && fitsGroupedText(open.parts, text)) {
      open.parts.push(text);
      open.callbacks = input.callbacks;
      schedule(open, nextFlushDelayMs(open.firstAt, now, seconds));
      return { ...snapshotOf(open), appended: true };
    }
    void startSend(open, "xhr");
  }
  const g: Group = {
    ticketId,
    idFront: newIdFront(),
    state: "collecting",
    parts: [text],
    quotedMsg: input.quotedMsg || undefined,
    firstAt: now,
    createdAt: new Date(now).toISOString(),
    deadline: now,
    base: { ...input.base, ticketId },
    callbacks: input.callbacks,
    timer: null,
    sending: null,
  };
  openGroups.set(ticketId, g);
  schedule(g, nextFlushDelayMs(now, now, seconds));
  return { ...snapshotOf(g), appended: false };
}

/** Solta agora o grupo que espera neste atendimento (troca de atendimento, "Enviar agora"). */
export function flushNow(ticketId: unknown): Promise<void> {
  const id = toTicketId(ticketId);
  if (id == null) return Promise.resolve();
  const open = openGroups.get(id);
  return open ? startSend(open, "xhr") : Promise.resolve();
}

/** "Enviar agora" do balão: acha o grupo pelo idFront. */
export function flushByIdFront(idFront: unknown): Promise<void> {
  const key = String(idFront ?? "");
  if (!key) return Promise.resolve();
  const found = Array.from(openGroups.values()).find((g) => g.idFront === key);
  return found ? startSend(found, "xhr") : Promise.resolve();
}

/** Há texto do atendente esperando (ou saindo) neste atendimento? */
export function hasPending(ticketId: unknown): boolean {
  const id = toTicketId(ticketId);
  if (id == null) return false;
  return openGroups.has(id) || (inFlight.get(id)?.size ?? 0) > 0;
}

/**
 * Texto que esperava vira a legenda de UM arquivo (D13: imagem, vídeo ou documento,
 * até 1.024). Devolve a legenda juntada e a citação do grupo, e tira o grupo (a página
 * remove o balão do texto). `null` = sem grupo esperando ou não cabe: quem chama solta
 * o grupo antes e usa a legenda própria.
 */
export function takeForCaption(ticketId: unknown, ownCaption: string): { caption: string; quotedMsg?: unknown } | null {
  const id = toTicketId(ticketId);
  if (id == null) return null;
  const open = openGroups.get(id);
  if (!open || open.state !== "collecting") return null;
  const merged = mergeGroupedCaption(open.parts, ownCaption || "");
  if (merged == null) return null;
  if (open.timer) clearTimeout(open.timer);
  open.timer = null;
  open.state = "done";
  openGroups.delete(id);
  try { open.callbacks.onRemove?.(snapshotOf(open)); } catch { /* idem */ }
  return { caption: merged, quotedMsg: open.quotedMsg };
}

/**
 * Antes de outra ação do mesmo atendimento (mídia, botões, encerrar, transferir...): solta
 * o texto que espera e aguarda o envio no ar, no máximo 8 s. Nunca lança e nunca segura a
 * ação além do teto; sem grupo, resolve na hora.
 */
export async function flushPendingWabaText(ticketId: unknown): Promise<void> {
  const id = toTicketId(ticketId);
  if (id == null || !hasPending(id)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const open = openGroups.get(id);
    if (open) void startSend(open, "xhr");
    const pending = Array.from(inFlight.get(id) ?? []);
    if (pending.length === 0) return;
    await Promise.race([
      Promise.all(pending),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, FLUSH_PENDING_MAX_WAIT_MS);
      }),
    ]);
  } catch {
    // a ação segue de qualquer jeito
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Solta todos os grupos que esperam (desmontar a página, aba oculta). */
export function flushAll(): Promise<void> {
  const runs: Promise<void>[] = [];
  Array.from(openGroups.values()).forEach((g) => { runs.push(startSend(g, "xhr")); });
  return Promise.all(runs).then(() => undefined);
}

/** Mensagem do cliente chegou neste atendimento: o texto do atendente sai agora (O8/R12). */
export function notifyInbound(ticketId: unknown): void {
  const id = toTicketId(ticketId);
  if (id == null) return;
  const open = openGroups.get(id);
  if (open) void startSend(open, "xhr");
}

// Aba oculta (inclusive o app indo para segundo plano) solta na hora por keepalive: no F5
// ou ao fechar a aba o navegador avisa "oculta" ANTES do pagehide, e um XHR comum seria
// cortado junto com a página. Navegador que recusa o keepalive cai no envio normal
// (`startSend`). Ao voltar, sai o que passou do prazo com o timer parado.
let listenersInstalled = false;
function installPageListeners(): void {
  if (listenersInstalled || typeof window === "undefined" || typeof document === "undefined") return;
  listenersInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      Array.from(openGroups.values()).forEach((g) => { void startSend(g, "keepalive"); });
      return;
    }
    const now = Date.now();
    Array.from(openGroups.values()).forEach((g) => {
      if (g.deadline <= now) void startSend(g, "xhr");
    });
  });
  window.addEventListener("pagehide", () => {
    Array.from(openGroups.values()).forEach((g) => { void startSend(g, "keepalive"); });
  });
}

/** Resto da janela de 24 h pelo `lastMessageReceived` (mesmo cálculo do campo de mensagem). `null` = sem dado. */
export function agentWindowRemainingMs(lastMessageReceived: unknown, now: number = Date.now()): number | null {
  if (lastMessageReceived == null || lastMessageReceived === "") return null;
  const lastMs = new Date(typeof lastMessageReceived === "number" ? lastMessageReceived : Number(lastMessageReceived)).getTime();
  if (!Number.isFinite(lastMs)) return null;
  return Math.min(lastMs + WINDOW_24H_MS - now, WINDOW_24H_MS);
}

/**
 * Segundos que a tela espera para este texto (0 = sai na hora). Canal do store pelo
 * whatsappId do atendimento; chave ausente (backend antigo) = 0; modo híbrido = 0 (D17).
 */
export function agentGroupSecondsFor(opts: {
  channel: string | null | undefined;
  whatsapp: { hybridMode?: string; linkedChannelId?: number | null; wabaGroupAgentSeconds?: number } | null | undefined;
  lastMessageReceived?: unknown;
  forceLinked?: boolean;
  now?: number;
}): number {
  const w = opts.whatsapp;
  if (!w) return 0;
  const seconds = normalizeAgentSeconds(w.wabaGroupAgentSeconds);
  if (seconds <= 0) return 0;
  const isHybrid = w.hybridMode === "coexistence" && !!w.linkedChannelId;
  const ok = shouldGroupAgentText({
    channel: opts.channel,
    agentSeconds: seconds,
    isHybrid,
    forceLinked: opts.forceLinked,
    windowRemainingMs: agentWindowRemainingMs(opts.lastMessageReceived, opts.now ?? Date.now()),
  });
  return ok ? seconds : 0;
}
