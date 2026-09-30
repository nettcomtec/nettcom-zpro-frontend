import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * O módulo guarda o resultado da sonda em memória (module scope), então cada
 * teste reimporta com `vi.resetModules()` para começar de uma sessão limpa.
 */

type FakeOscillator = {
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type FakeSource = {
  buffer: unknown;
  loop: boolean;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

function createFakeContext(state: AudioContextState = "running") {
  const oscillators: FakeOscillator[] = [];
  const sources: FakeSource[] = [];
  const gains: { gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn> } }[] = [];

  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => {
      const osc: FakeOscillator = {
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),
    createBufferSource: vi.fn(() => {
      const source: FakeSource = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    }),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 3 } as unknown as AudioBuffer),
  };

  return { ctx, oscillators, sources, gains };
}

function headers(contentType: string) {
  return { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) };
}

function okResponse() {
  return {
    ok: true,
    redirected: false,
    headers: headers("audio/mpeg"),
    arrayBuffer: async () => new ArrayBuffer(64),
  };
}

/** Arquivo ausente: o Next devolve 404 com a página de erro. */
function notFoundResponse() {
  return {
    ok: false,
    redirected: false,
    headers: headers("text/html; charset=utf-8"),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

/** Sessão sem o cookie de auth: o middleware manda para /login, que responde 200. */
function loginRedirectResponse() {
  return {
    ok: true,
    redirected: true,
    headers: headers("text/html; charset=utf-8"),
    arrayBuffer: async () => new ArrayBuffer(4096),
  };
}

async function loadModule(ctx: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/notification-audio", () => ({
    getSharedAudioContext: () => ctx,
    unlockAudioContext: () => {},
    playNotificationSound: async () => {},
  }));
  return import("@/lib/call-ringtone");
}

describe("call-ringtone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/notification-audio");
  });

  it("sem arquivo em public, toca o beep sintetizado de sempre", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFoundResponse()));
    const { ctx, oscillators, gains } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);

    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.value).toBe(480);
    expect(oscillators[0].stop).toHaveBeenCalledWith(0.6);
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.3, 0);
    expect(ctx.createBufferSource).not.toHaveBeenCalled();

    stop();
  });

  it("beep repete a cada 1,8 s e para no stop()", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFoundResponse()));
    const { ctx, oscillators } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1800);
    expect(oscillators).toHaveLength(2);

    stop();
    await vi.advanceTimersByTimeAsync(1800 * 3);
    expect(oscillators).toHaveLength(2);
    // O contexto é compartilhado com o som de notificação: jamais fechado aqui.
    expect(ctx.close).not.toHaveBeenCalled();
  });

  it("com arquivo em public, toca o arquivo em loop e nenhum beep", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const { ctx, sources } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);

    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    expect(sources[0].start).toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();

    stop();
    expect(sources[0].stop).toHaveBeenCalled();
  });

  it("usa o primeiro candidato que existir (mp3 ausente, ogg presente)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { ctx, sources } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/ringtone.mp3");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/ringtone.ogg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sources).toHaveLength(1);

    stop();
  });

  it("redirect para /login não é aceito como toque e não interrompe a busca", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(loginRedirectResponse())
      .mockResolvedValueOnce(loginRedirectResponse())
      .mockResolvedValueOnce(loginRedirectResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { ctx, oscillators, sources } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);

    // Os 3 candidatos foram tentados e nenhum HTML virou "arquivo de toque".
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(ctx.decodeAudioData).not.toHaveBeenCalled();
    expect(sources).toHaveLength(0);
    expect(oscillators).toHaveLength(1);

    stop();
  });

  it("arquivo que não decodifica cai no beep", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const { ctx, oscillators } = createFakeContext();
    ctx.decodeAudioData.mockRejectedValue(new Error("EncodingError"));
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);

    expect(oscillators).toHaveLength(1);
    stop();
  });

  it("sonda lenta não segura o toque: começa pelo beep depois do teto de espera", async () => {
    let releaseFetch: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        await pending;
        return okResponse();
      })
    );
    const { ctx, oscillators, sources } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(700);
    expect(oscillators).toHaveLength(1);

    // A sonda chegando atrasada não troca o toque no meio do episódio.
    releaseFetch();
    await vi.advanceTimersByTimeAsync(0);
    expect(sources).toHaveLength(0);

    stop();
  });

  it("stop() antes da sonda resolver não toca nada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const { ctx, oscillators, sources } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    stop();
    await vi.advanceTimersByTimeAsync(2000);

    expect(oscillators).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });

  it("respeita o ganho próprio de cada tela no beep", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFoundResponse()));
    const { ctx, gains } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone({ beepGain: 0.25 });
    await vi.advanceTimersByTimeAsync(0);

    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.25, 0);
    stop();
  });

  it("respeita o volume próprio do arquivo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const { ctx, gains } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone({ fileVolume: 0.85 });
    await vi.advanceTimersByTimeAsync(0);

    expect(gains[0].gain.value).toBe(0.85);
    stop();
  });

  it("sonda uma única vez por sessão, mesmo com vários toques", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { ctx, sources } = createFakeContext();
    const { startCallRingtone } = await loadModule(ctx);

    const first = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);
    first();

    const second = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
    second();
  });

  it("contexto suspenso é retomado, nunca fechado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFoundResponse()));
    const { ctx } = createFakeContext("suspended");
    const { startCallRingtone } = await loadModule(ctx);

    const stop = startCallRingtone();
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.close).not.toHaveBeenCalled();
    stop();
  });

  it("sem Web Audio API devolve um stop inerte e não quebra", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const { startCallRingtone } = await loadModule(null);

    const stop = startCallRingtone();
    expect(() => stop()).not.toThrow();
  });
});
