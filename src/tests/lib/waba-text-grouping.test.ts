import { describe, it, expect, afterEach, vi } from "vitest";
import { AxiosError } from "axios";
import {
  AGENT_GROUP_MAX_WAIT_MS,
  WABA_CAPTION_MAX,
  WABA_TEXT_MAX,
  fitsGroupedText,
  joinGroupedText,
  mergeGroupedCaption,
  nextFlushDelayMs,
  normalizeAgentSeconds,
  shouldGroupAgentText,
  signaturePrefixOf,
  stripRepeatedSignature,
} from "@/lib/waba-text-grouping";

// Textos do atendente no WhatsApp oficial (WABA) que esperam para sair juntos
// (docs/PLANO_WABA_JUNTAR_MENSAGENS.md, Passo 6). A assinatura é a de lib/signature.ts.
const SIG = "*Ana*:\n ";

describe("normalizeAgentSeconds", () => {
  it("aceita 0 ou de 2 a 15, inteiro; o resto vira 0", () => {
    expect(normalizeAgentSeconds(0)).toBe(0);
    expect(normalizeAgentSeconds(2)).toBe(2);
    expect(normalizeAgentSeconds(5)).toBe(5);
    expect(normalizeAgentSeconds(15)).toBe(15);
    expect(normalizeAgentSeconds(1)).toBe(0);
    expect(normalizeAgentSeconds(16)).toBe(0);
    expect(normalizeAgentSeconds(2.5)).toBe(0);
    expect(normalizeAgentSeconds(-3)).toBe(0);
  });

  it("texto numérico vale; vazio, nulo e lixo viram 0", () => {
    expect(normalizeAgentSeconds("7")).toBe(7);
    expect(normalizeAgentSeconds(" 10 ")).toBe(10);
    expect(normalizeAgentSeconds("")).toBe(0);
    expect(normalizeAgentSeconds("abc")).toBe(0);
    expect(normalizeAgentSeconds(null)).toBe(0);
    expect(normalizeAgentSeconds(undefined)).toBe(0);
    expect(normalizeAgentSeconds(NaN)).toBe(0);
  });
});

describe("assinatura repetida", () => {
  it("reconhece o prefixo da assinatura", () => {
    expect(signaturePrefixOf(`${SIG}Olá`)).toBe(SIG);
    expect(signaturePrefixOf("Olá")).toBe("");
    expect(signaturePrefixOf("*negrito* no meio")).toBe("");
  });

  it("tira do 2º texto a assinatura igual à do 1º; diferente fica", () => {
    expect(stripRepeatedSignature(`${SIG}Olá`, `${SIG}Tudo bem?`)).toBe("Tudo bem?");
    expect(stripRepeatedSignature(`${SIG}Olá`, "*Bruno*:\n Oi")).toBe("*Bruno*:\n Oi");
    expect(stripRepeatedSignature("Olá", `${SIG}Tudo bem?`)).toBe(`${SIG}Tudo bem?`);
  });

  it("a mensagem juntada tem a assinatura 1 vez, no começo, e linha em branco entre as partes", () => {
    expect(joinGroupedText([`${SIG}Olá`, `${SIG}Tudo bem?`, `${SIG}Posso ajudar?`])).toBe(
      `${SIG}Olá\n\nTudo bem?\n\nPosso ajudar?`
    );
  });

  it("parte vazia ou só com espaços não entra", () => {
    expect(joinGroupedText(["a", "", "   ", "b"])).toBe("a\n\nb");
    expect(joinGroupedText([])).toBe("");
    expect(joinGroupedText(["  "])).toBe("");
  });
});

describe("limites", () => {
  it("texto: até 4.096 caracteres com os separadores", () => {
    const first = "a".repeat(WABA_TEXT_MAX - 3);
    expect(fitsGroupedText([first], "b")).toBe(true); // 4093 + 2 + 1 = 4096
    expect(fitsGroupedText([first], "bc")).toBe(false); // 4097
    expect(fitsGroupedText([], "x".repeat(WABA_TEXT_MAX))).toBe(true);
    expect(fitsGroupedText([], "x".repeat(WABA_TEXT_MAX + 1))).toBe(false);
  });

  it("a assinatura repetida não conta no limite", () => {
    const first = `${SIG}${"a".repeat(WABA_TEXT_MAX - SIG.length - 3)}`;
    expect(fitsGroupedText([first], `${SIG}b`)).toBe(true);
  });

  it("legenda: texto que esperava + linha em branco + legenda própria, até 1.024", () => {
    expect(mergeGroupedCaption(["Segue a foto"], "Modelo azul")).toBe("Segue a foto\n\nModelo azul");
    expect(mergeGroupedCaption(["Segue a foto"], "")).toBe("Segue a foto");
    expect(mergeGroupedCaption([], "Modelo azul")).toBe("Modelo azul");
    expect(mergeGroupedCaption([`${SIG}Segue`], `${SIG}Modelo azul`)).toBe(`${SIG}Segue\n\nModelo azul`);
    const exact = "a".repeat(WABA_CAPTION_MAX - 3);
    expect(mergeGroupedCaption([exact], "b")).toBe(`${exact}\n\nb`);
    expect(mergeGroupedCaption([exact], "bc")).toBeNull();
    expect(WABA_CAPTION_MAX).toBe(1024);
  });
});

describe("nextFlushDelayMs", () => {
  it("cada texto reinicia a espera, com teto de 30 s desde o 1º", () => {
    expect(nextFlushDelayMs(0, 0, 5)).toBe(5000);
    expect(nextFlushDelayMs(0, 10_000, 5)).toBe(5000);
    expect(nextFlushDelayMs(0, 27_000, 5)).toBe(3000);
    expect(nextFlushDelayMs(0, AGENT_GROUP_MAX_WAIT_MS, 5)).toBe(0);
    expect(nextFlushDelayMs(0, 40_000, 5)).toBe(0);
    expect(nextFlushDelayMs(0, 0, -1)).toBe(0);
  });
});

describe("shouldGroupAgentText", () => {
  const base = { channel: "waba", agentSeconds: 5, isHybrid: false };

  it("só no WABA com segundos válidos", () => {
    expect(shouldGroupAgentText(base)).toBe(true);
    expect(shouldGroupAgentText({ ...base, channel: "WABA" })).toBe(true);
    expect(shouldGroupAgentText({ ...base, channel: "dialog360" })).toBe(false);
    expect(shouldGroupAgentText({ ...base, channel: "gupshup" })).toBe(false);
    expect(shouldGroupAgentText({ ...base, channel: null })).toBe(false);
    expect(shouldGroupAgentText({ ...base, agentSeconds: 0 })).toBe(false);
    expect(shouldGroupAgentText({ ...base, agentSeconds: 1 })).toBe(false);
  });

  it("modo híbrido e envio forçado pelo vinculado não esperam (D17)", () => {
    expect(shouldGroupAgentText({ ...base, isHybrid: true })).toBe(false);
    expect(shouldGroupAgentText({ ...base, forceLinked: true })).toBe(false);
  });

  it("janela de 24 h: espera só com folga de segundos + 10 s; sem dado, espera", () => {
    expect(shouldGroupAgentText({ ...base, windowRemainingMs: 15_001 })).toBe(true);
    expect(shouldGroupAgentText({ ...base, windowRemainingMs: 15_000 })).toBe(false);
    expect(shouldGroupAgentText({ ...base, windowRemainingMs: 1_000 })).toBe(false);
    expect(shouldGroupAgentText({ ...base, windowRemainingMs: -5 })).toBe(false);
    expect(shouldGroupAgentText({ ...base, windowRemainingMs: null })).toBe(true);
    expect(shouldGroupAgentText({ ...base, windowRemainingMs: undefined })).toBe(true);
    expect(shouldGroupAgentText({ ...base, windowRemainingMs: NaN })).toBe(true);
  });
});

// ── Gerente (lib/waba-agent-grouping): servidor simulado pelo adaptador do axios ──

type Posted = { url: string; body: Record<string, unknown> };

async function loadManager(reply: (body: Record<string, unknown>) => { status: number; data?: unknown } = () => ({ status: 200, data: {} })) {
  vi.resetModules();
  const { logger } = await import("@/lib/logger");
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  const { default: api } = await import("@/lib/api");
  const posted: Posted[] = [];
  api.defaults.adapter = async (config) => {
    const body = typeof config.data === "string" ? JSON.parse(config.data) : (config.data ?? {});
    posted.push({ url: String(config.url), body });
    const r = reply(body);
    const response = { data: r.data ?? {}, status: r.status, statusText: "", headers: {}, config };
    if (r.status >= 400) throw new AxiosError("fail", AxiosError.ERR_BAD_REQUEST, config, null, response as never);
    return response;
  };
  const manager = await import("@/lib/waba-agent-grouping");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  return { manager, posted };
}

const BASE = { from: "5511999990000", tokenApi: "123456", ticketId: 10 };

describe("gerente do texto do atendente (WABA)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("dois textos dentro da espera saem num POST só, com o idFront do balão e groupedSend", async () => {
    const { manager, posted } = await loadManager();
    const onSent = vi.fn();
    const first = manager.appendOrStart({ ticketId: 10, text: "Olá", seconds: 5, base: BASE, callbacks: { onSent } });
    expect(first?.appended).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    const second = manager.appendOrStart({ ticketId: 10, text: "Tudo bem?", seconds: 5, base: BASE, callbacks: { onSent } });
    expect(second?.appended).toBe(true);
    expect(second?.idFront).toBe(first?.idFront);
    expect(second?.body).toBe("Olá\n\nTudo bem?");
    await vi.advanceTimersByTimeAsync(4999);
    expect(posted).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(10);
    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe("/wabametaText");
    expect(posted[0].body).toMatchObject({ body: "Olá\n\nTudo bem?", idFront: first?.idFront, groupedSend: true, ticketId: 10 });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(manager.hasPending(10)).toBe(false);
  });

  it("texto citando solta o que esperava e abre outro grupo com a citação (D12)", async () => {
    const { manager, posted } = await loadManager();
    const first = manager.appendOrStart({ ticketId: 10, text: "Um", seconds: 5, base: BASE, callbacks: {} });
    const quote = { id: "99", messageId: "wamid.X", body: "pergunta" };
    const second = manager.appendOrStart({ ticketId: 10, text: "Dois", quotedMsg: quote, seconds: 5, base: BASE, callbacks: {} });
    expect(second?.appended).toBe(false);
    expect(second?.idFront).not.toBe(first?.idFront);
    await vi.advanceTimersByTimeAsync(0);
    expect(posted).toHaveLength(1);
    expect(posted[0].body).toMatchObject({ body: "Um", idFront: first?.idFront });
    await vi.advanceTimersByTimeAsync(5000);
    expect(posted).toHaveLength(2);
    expect(posted[1].body).toMatchObject({ body: "Dois", quotedMsg: quote });
  });

  it("teto de 30 s desde o 1º texto, mesmo com textos chegando", async () => {
    const { manager, posted } = await loadManager();
    for (let i = 0; i < 8; i++) {
      manager.appendOrStart({ ticketId: 10, text: `parte ${i}`, seconds: 5, base: BASE, callbacks: {} });
      await vi.advanceTimersByTimeAsync(4000);
    }
    // 8 textos a cada 4 s: o grupo sai aos 30 s com os 8 (o 9º abriria outro grupo).
    expect(posted).toHaveLength(1);
    expect(String(posted[0].body.body).split("\n\n")).toHaveLength(8);
  });

  it("o texto que esperava vira legenda de 1 arquivo e não sai sozinho (D13)", async () => {
    const { manager, posted } = await loadManager();
    const onRemove = vi.fn();
    manager.appendOrStart({ ticketId: 10, text: `${SIG}Segue o catálogo`, seconds: 5, base: BASE, callbacks: { onRemove } });
    const taken = manager.takeForCaption(10, `${SIG}Promoção`);
    expect(taken).toEqual({ caption: `${SIG}Segue o catálogo\n\nPromoção`, quotedMsg: undefined });
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(manager.hasPending(10)).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posted).toHaveLength(0);
    expect(manager.takeForCaption(10, "x")).toBeNull();
  });

  it("legenda que não cabe em 1.024 devolve null e o grupo continua esperando", async () => {
    const { manager } = await loadManager();
    manager.appendOrStart({ ticketId: 10, text: "a".repeat(1000), seconds: 5, base: BASE, callbacks: {} });
    expect(manager.takeForCaption(10, "b".repeat(100))).toBeNull();
    expect(manager.hasPending(10)).toBe(true);
  });

  it("flushPendingWabaText solta na hora e espera o envio; sem grupo resolve sem POST", async () => {
    const { manager, posted } = await loadManager();
    await manager.flushPendingWabaText(10);
    expect(posted).toHaveLength(0);
    manager.appendOrStart({ ticketId: 10, text: "Antes da mídia", seconds: 15, base: BASE, callbacks: {} });
    await manager.flushPendingWabaText(10);
    expect(posted).toHaveLength(1);
    expect(posted[0].body.body).toBe("Antes da mídia");
    expect(manager.hasPending(10)).toBe(false);
  });

  it("mensagem do cliente solta o grupo daquele atendimento, não o de outro", async () => {
    const { manager, posted } = await loadManager();
    manager.appendOrStart({ ticketId: 10, text: "do 10", seconds: 5, base: BASE, callbacks: {} });
    manager.appendOrStart({ ticketId: 20, text: "do 20", seconds: 5, base: { ...BASE, ticketId: 20 }, callbacks: {} });
    manager.notifyInbound(10);
    await vi.advanceTimersByTimeAsync(0);
    expect(posted).toHaveLength(1);
    expect(posted[0].body).toMatchObject({ body: "do 10", ticketId: 10 });
    expect(manager.hasPending(20)).toBe(true);
  });

  it("texto novo com o grupo no ar abre outro grupo, com outro idFront (R8)", async () => {
    const { manager, posted } = await loadManager();
    const first = manager.appendOrStart({ ticketId: 10, text: "Um", seconds: 5, base: BASE, callbacks: {} });
    void manager.flushNow(10);
    const second = manager.appendOrStart({ ticketId: 10, text: "Dois", seconds: 5, base: BASE, callbacks: {} });
    expect(second?.appended).toBe(false);
    expect(second?.idFront).not.toBe(first?.idFront);
    await vi.advanceTimersByTimeAsync(5000);
    expect(posted.map((p) => p.body.body)).toEqual(["Um", "Dois"]);
  });

  it("falha avisa a tela e o 'Tentar novamente' reenvia o mesmo texto sem groupedSend", async () => {
    let fail = true;
    const { manager, posted } = await loadManager(() => (fail ? { status: 500, data: { error: "ERR_X" } } : { status: 200, data: {} }));
    const onFailed = vi.fn();
    const g = manager.appendOrStart({ ticketId: 10, text: "Olá", seconds: 5, base: BASE, callbacks: { onFailed } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(onFailed).toHaveBeenCalledTimes(1);
    const retry = onFailed.mock.calls[0][2] as () => Promise<unknown>;
    fail = false;
    await retry();
    expect(posted).toHaveLength(2);
    expect(posted[1].body).toMatchObject({ body: "Olá", idFront: g?.idFront });
    expect(posted[1].body).not.toHaveProperty("groupedSend");
  });

  it("resposta de repetição descartada ({ duplicate: true }) conta como enviada", async () => {
    const { manager } = await loadManager(() => ({ status: 200, data: { duplicate: true } }));
    const onSent = vi.fn();
    const onFailed = vi.fn();
    manager.appendOrStart({ ticketId: 10, text: "Olá", seconds: 2, base: BASE, callbacks: { onSent, onFailed } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("não junta sem segundos válidos ou com texto acima de 4.096", async () => {
    const { manager } = await loadManager();
    expect(manager.appendOrStart({ ticketId: 10, text: "Olá", seconds: 0, base: BASE, callbacks: {} })).toBeNull();
    expect(manager.appendOrStart({ ticketId: 10, text: "x".repeat(WABA_TEXT_MAX + 1), seconds: 5, base: BASE, callbacks: {} })).toBeNull();
    expect(manager.appendOrStart({ ticketId: 0, text: "Olá", seconds: 5, base: BASE, callbacks: {} })).toBeNull();
    expect(manager.hasPending(10)).toBe(false);
  });

  it("segundos do canal: híbrido, chave ausente e fim da janela não esperam", async () => {
    const { manager } = await loadManager();
    const now = Date.now();
    const recent = now - 60_000;
    expect(manager.agentGroupSecondsFor({ channel: "waba", whatsapp: { wabaGroupAgentSeconds: 5 }, lastMessageReceived: recent, now })).toBe(5);
    expect(manager.agentGroupSecondsFor({ channel: "waba", whatsapp: { wabaGroupAgentSeconds: 5 }, lastMessageReceived: String(recent), now })).toBe(5);
    expect(manager.agentGroupSecondsFor({ channel: "waba", whatsapp: {}, lastMessageReceived: recent, now })).toBe(0);
    expect(manager.agentGroupSecondsFor({ channel: "waba", whatsapp: null, now })).toBe(0);
    expect(
      manager.agentGroupSecondsFor({ channel: "waba", whatsapp: { wabaGroupAgentSeconds: 5, hybridMode: "coexistence", linkedChannelId: 3 }, now })
    ).toBe(0);
    expect(manager.agentGroupSecondsFor({ channel: "waba", whatsapp: { wabaGroupAgentSeconds: 5 }, forceLinked: true, now })).toBe(0);
    const almostClosed = now - (24 * 60 * 60 * 1000 - 10_000);
    expect(manager.agentGroupSecondsFor({ channel: "waba", whatsapp: { wabaGroupAgentSeconds: 5 }, lastMessageReceived: almostClosed, now })).toBe(0);
    expect(manager.agentGroupSecondsFor({ channel: "waba", whatsapp: { wabaGroupAgentSeconds: 5 }, now })).toBe(5);
    expect(manager.agentGroupSecondsFor({ channel: "dialog360", whatsapp: { wabaGroupAgentSeconds: 5 }, now })).toBe(0);
  });
});
