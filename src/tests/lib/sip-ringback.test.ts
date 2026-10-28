import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionState } from "sip.js";
import {
  AUDIO_POLL_MS,
  EARLY_MEDIA_GRACE_MS,
  SIP_EARLY_MEDIA_STORAGE_KEY,
  attachSessionAudio,
  cancelUnansweredInvite,
  createOutgoingRingback,
  isSipEarlyMediaEnabled,
  responseHasSdp,
  watchOutgoingInvite,
  type SipProgressResponse,
} from "@/lib/sip-ringback";

/**
 * "Chamando" das ligações de saída do WebPhone SIP. A ligação é um emissor de estado falso,
 * a PeerConnection devolve estatísticas com a contagem de pacotes que o teste controla e o
 * toque de reserva é injetado (contamos quando começa e quando para).
 */

function createSession() {
  const listeners: ((state: SessionState) => void)[] = [];
  return {
    stateChange: {
      addListener: vi.fn((listener: (state: SessionState) => void) => {
        listeners.push(listener);
      }),
      removeListener: vi.fn((listener: (state: SessionState) => void) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      }),
    },
    emit(state: SessionState) {
      listeners.slice().forEach((listener) => listener(state));
    },
    listenerCount: () => listeners.length,
  };
}

function createPeerConnection() {
  let packets = 0;
  let failStats = false;
  const getStats = vi.fn(async () => {
    if (failStats) throw new Error("closed");
    return new Map([["in", { type: "inbound-rtp", kind: "audio", packetsReceived: packets }]]);
  });
  const pc = {
    getReceivers: () => [{ track: { kind: "audio" }, getStats }],
  } as unknown as RTCPeerConnection;
  return {
    pc,
    getStats,
    setPackets: (n: number) => {
      packets = n;
    },
    setFailStats: (fail: boolean) => {
      failStats = fail;
    },
  };
}

function response(statusCode: number, sdp = false): SipProgressResponse {
  return {
    message: {
      statusCode,
      body: sdp ? "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n" : "",
      getHeader: (name: string) => (sdp && name.toLowerCase() === "content-type" ? "application/sdp" : undefined),
    },
  };
}

function setup() {
  const session = createSession();
  const peer = createPeerConnection();
  const stopTone = vi.fn();
  const startTone = vi.fn(() => stopTone);
  const attachRemoteAudio = vi.fn();
  const ringback = createOutgoingRingback({
    session,
    getPeerConnection: () => peer.pc,
    attachRemoteAudio,
    startTone,
  });
  return { session, peer, startTone, stopTone, attachRemoteAudio, ringback };
}

describe("sip-ringback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("180 sem áudio toca o reserva na hora e para quando atendem", () => {
    const { session, startTone, stopTone, ringback } = setup();
    ringback.onProgress(response(180));
    expect(startTone).toHaveBeenCalledTimes(1);
    // 180 repetido não abre um segundo toque.
    ringback.onProgress(response(180));
    expect(startTone).toHaveBeenCalledTimes(1);

    session.emit(SessionState.Established);
    expect(stopTone).toHaveBeenCalledTimes(1);
    expect(session.listenerCount()).toBe(0);
  });

  it("181 e 182 também são chamando; 183 sem áudio não toca nada", () => {
    const a = setup();
    a.ringback.onProgress(response(181));
    expect(a.startTone).toHaveBeenCalledTimes(1);

    const b = setup();
    b.ringback.onProgress(response(182));
    expect(b.startTone).toHaveBeenCalledTimes(1);

    const c = setup();
    c.ringback.onProgress(response(183));
    vi.advanceTimersByTime(EARLY_MEDIA_GRACE_MS * 2);
    expect(c.startTone).not.toHaveBeenCalled();
    expect(c.attachRemoteAudio).not.toHaveBeenCalled();
  });

  it("183 com áudio liga o alto-falante e, chegando pacote, nunca toca o reserva", async () => {
    const { peer, startTone, attachRemoteAudio, ringback } = setup();
    ringback.onProgress(response(183, true));
    expect(attachRemoteAudio).toHaveBeenCalledTimes(1);

    peer.setPackets(12);
    await vi.advanceTimersByTimeAsync(AUDIO_POLL_MS);
    await vi.advanceTimersByTimeAsync(EARLY_MEDIA_GRACE_MS * 2);
    expect(startTone).not.toHaveBeenCalled();

    // Um 180 depois do áudio da operadora não traz o reserva de volta.
    ringback.onProgress(response(180));
    expect(startTone).not.toHaveBeenCalled();
  });

  it("183 com mídia mas sem pacote: reserva depois da espera, e para quando o áudio chega", async () => {
    const { peer, startTone, stopTone, ringback } = setup();
    ringback.onProgress(response(183, true));

    await vi.advanceTimersByTimeAsync(EARLY_MEDIA_GRACE_MS - 10);
    expect(startTone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(startTone).toHaveBeenCalledTimes(1);

    peer.setPackets(1);
    await vi.advanceTimersByTimeAsync(AUDIO_POLL_MS);
    expect(stopTone).toHaveBeenCalledTimes(1);

    // Daqui em diante quem manda é a operadora: nada volta a tocar.
    ringback.onProgress(response(180));
    ringback.onProgress(response(183, true));
    await vi.advanceTimersByTimeAsync(EARLY_MEDIA_GRACE_MS * 2);
    expect(startTone).toHaveBeenCalledTimes(1);
  });

  it("180 e depois 183 com áudio: o reserva toca até os pacotes chegarem", async () => {
    const { peer, startTone, stopTone, ringback } = setup();
    ringback.onProgress(response(180));
    expect(startTone).toHaveBeenCalledTimes(1);

    ringback.onProgress(response(183, true));
    await vi.advanceTimersByTimeAsync(AUDIO_POLL_MS);
    expect(stopTone).not.toHaveBeenCalled();

    peer.setPackets(3);
    await vi.advanceTimersByTimeAsync(AUDIO_POLL_MS);
    expect(stopTone).toHaveBeenCalledTimes(1);
    expect(startTone).toHaveBeenCalledTimes(1);
  });

  it("183 com áudio e depois 180 sem pacote: o 180 não antecipa a espera", async () => {
    const { startTone, ringback } = setup();
    ringback.onProgress(response(183, true));
    ringback.onProgress(response(180));
    expect(startTone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(EARLY_MEDIA_GRACE_MS);
    expect(startTone).toHaveBeenCalledTimes(1);
  });

  it("respostas com mídia repetidas não multiplicam conferência nem espera", async () => {
    const { peer, startTone, ringback } = setup();
    ringback.onProgress(response(183, true));
    await vi.advanceTimersByTimeAsync(1000);
    ringback.onProgress(response(183, true));
    ringback.onProgress(response(183, true));
    const callsBefore = peer.getStats.mock.calls.length;
    await vi.advanceTimersByTimeAsync(AUDIO_POLL_MS * 4);
    // Uma conferência por intervalo (sem um intervalo novo a cada resposta).
    expect(peer.getStats.mock.calls.length - callsBefore).toBe(4);
    // A espera conta da 1ª resposta com mídia, não da última.
    await vi.advanceTimersByTimeAsync(EARLY_MEDIA_GRACE_MS - 1000 - AUDIO_POLL_MS * 4);
    expect(startTone).toHaveBeenCalledTimes(1);
  });

  it("estatística que falha não derruba nada e o reserva toca na espera", async () => {
    const { peer, startTone, ringback } = setup();
    peer.setFailStats(true);
    ringback.onProgress(response(183, true));
    await vi.advanceTimersByTimeAsync(EARLY_MEDIA_GRACE_MS);
    expect(startTone).toHaveBeenCalledTimes(1);
  });

  it("CANCEL (Terminating), queda ou stop() encerram tudo, e nada toca depois", async () => {
    const { session, peer, startTone, stopTone, ringback } = setup();
    ringback.onProgress(response(180));
    session.emit(SessionState.Terminating);
    expect(stopTone).toHaveBeenCalledTimes(1);

    ringback.onProgress(response(183, true));
    ringback.onProgress(response(180));
    await vi.advanceTimersByTimeAsync(EARLY_MEDIA_GRACE_MS * 2);
    expect(startTone).toHaveBeenCalledTimes(1);
    expect(peer.getStats).not.toHaveBeenCalled();

    ringback.stop();
    session.emit(SessionState.Terminated);
    expect(stopTone).toHaveBeenCalledTimes(1);
  });

  it("stop() no meio da espera cancela o reserva agendado", async () => {
    const { startTone, ringback } = setup();
    ringback.onProgress(response(183, true));
    ringback.stop();
    await vi.advanceTimersByTimeAsync(EARLY_MEDIA_GRACE_MS * 2);
    expect(startTone).not.toHaveBeenCalled();
  });

  it("estados de antes do atendimento não encerram", () => {
    const { session, stopTone, ringback } = setup();
    ringback.onProgress(response(180));
    session.emit(SessionState.Initial);
    session.emit(SessionState.Establishing);
    expect(stopTone).not.toHaveBeenCalled();
  });
});

describe("responseHasSdp", () => {
  it("só conta corpo com Content-Type application/sdp (com ou sem parâmetros)", () => {
    const make = (body: string, contentType?: string): SipProgressResponse => ({
      message: { statusCode: 183, body, getHeader: () => contentType },
    });
    expect(responseHasSdp(make("v=0", "application/sdp"))).toBe(true);
    expect(responseHasSdp(make("v=0", "Application/SDP; charset=utf-8"))).toBe(true);
    expect(responseHasSdp(make("", "application/sdp"))).toBe(false);
    expect(responseHasSdp(make("v=0", "multipart/mixed;boundary=x"))).toBe(false);
    expect(responseHasSdp(make("v=0", undefined))).toBe(false);
    expect(responseHasSdp(null)).toBe(false);
  });
});

describe("attachSessionAudio", () => {
  class FakeMediaStream {
    private tracks: unknown[];
    constructor(tracks: unknown[]) {
      this.tracks = tracks;
    }
    getTracks() {
      return this.tracks;
    }
  }

  beforeEach(() => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("liga a faixa recebida e não troca o srcObject quando a faixa já está lá", () => {
    const track = { kind: "audio" };
    const session = {
      sessionDescriptionHandler: { peerConnection: { getReceivers: () => [{ track }] } },
    };
    const audio = { srcObject: null as unknown } as unknown as HTMLAudioElement;

    attachSessionAudio(session, audio);
    const first = audio.srcObject;
    expect(first).toBeInstanceOf(FakeMediaStream);

    attachSessionAudio(session, audio);
    expect(audio.srcObject).toBe(first);
  });

  it("prefere a faixa de áudio quando a 1ª é de vídeo", () => {
    const video = { kind: "video" };
    const audioTrack = { kind: "audio" };
    const session = {
      sessionDescriptionHandler: { peerConnection: { getReceivers: () => [{ track: video }, { track: audioTrack }] } },
    };
    const audio = { srcObject: null as unknown } as unknown as HTMLAudioElement;
    attachSessionAudio(session, audio);
    expect((audio.srcObject as unknown as FakeMediaStream).getTracks()).toEqual([audioTrack]);
  });

  it("sem PeerConnection, sem faixa ou sem <audio> não faz nada", () => {
    const audio = { srcObject: null as unknown } as unknown as HTMLAudioElement;
    attachSessionAudio({}, audio);
    attachSessionAudio({ sessionDescriptionHandler: { peerConnection: { getReceivers: () => [] } } }, audio);
    expect(audio.srcObject).toBeNull();
    expect(() => attachSessionAudio({ sessionDescriptionHandler: { peerConnection: { getReceivers: () => [] } } }, null)).not.toThrow();
  });
});

describe("watchOutgoingInvite", () => {
  function createInviter() {
    const session = createSession();
    const inviter = {
      state: SessionState.Initial as SessionState,
      stateChange: session.stateChange,
      outgoingInviteRequest: { cancel: vi.fn() },
      go(state: SessionState) {
        inviter.state = state;
        session.emit(state);
      },
      listenerCount: session.listenerCount,
    };
    return inviter;
  }

  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
  });

  it("183 recusado pelo navegador (Establishing direto a Terminated, sem resposta final): manda CANCEL", async () => {
    const inviter = createInviter();
    watchOutgoingInvite(inviter, { earlyMedia: true, sawEarlyMedia: () => true });
    inviter.go(SessionState.Establishing);
    inviter.go(SessionState.Terminated);
    expect(inviter.outgoingInviteRequest.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(inviter.outgoingInviteRequest.cancel).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(inviter.listenerCount()).toBe(0);
  });

  it("recusa do destino (resposta final logo depois da troca de estado) não manda CANCEL", async () => {
    const inviter = createInviter();
    const watch = watchOutgoingInvite(inviter, { earlyMedia: true, sawEarlyMedia: () => false });
    inviter.go(SessionState.Establishing);
    inviter.go(SessionState.Terminated);
    watch.onFinalResponse();
    await vi.advanceTimersByTimeAsync(0);
    expect(inviter.outgoingInviteRequest.cancel).not.toHaveBeenCalled();
  });

  it("desligar (CANCEL nosso passa por Terminating) e microfone negado (sai de Initial) não mandam outro CANCEL", async () => {
    const a = createInviter();
    watchOutgoingInvite(a, { earlyMedia: true, sawEarlyMedia: () => true });
    a.go(SessionState.Establishing);
    a.go(SessionState.Terminating);
    a.go(SessionState.Terminated);

    const b = createInviter();
    watchOutgoingInvite(b, { earlyMedia: true, sawEarlyMedia: () => false });
    b.go(SessionState.Terminated);

    await vi.advanceTimersByTimeAsync(0);
    expect(a.outgoingInviteRequest.cancel).not.toHaveBeenCalled();
    expect(b.outgoingInviteRequest.cancel).not.toHaveBeenCalled();
  });

  it("sem áudio antecipado (chave de emergência) não manda CANCEL nem avisa", async () => {
    const inviter = createInviter();
    const watch = watchOutgoingInvite(inviter, { earlyMedia: false, sawEarlyMedia: () => true });
    inviter.go(SessionState.Establishing);
    inviter.go(SessionState.Terminated);
    watch.onAccept();
    await vi.advanceTimersByTimeAsync(0);
    expect(inviter.outgoingInviteRequest.cancel).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("200 de quem não mandou o áudio antecipado (488): avisa com a chave e não manda CANCEL", async () => {
    const inviter = createInviter();
    const watch = watchOutgoingInvite(inviter, { earlyMedia: true, sawEarlyMedia: () => true });
    inviter.go(SessionState.Establishing);
    inviter.go(SessionState.Terminated);
    // O sip.js chama o onAccept do requestDelegate por promessa, antes do próximo ciclo.
    await Promise.resolve();
    watch.onAccept();
    await vi.advanceTimersByTimeAsync(0);
    expect(inviter.outgoingInviteRequest.cancel).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(SIP_EARLY_MEDIA_STORAGE_KEY);
  });

  it("atendimento normal não avisa nem cancela", async () => {
    const inviter = createInviter();
    const watch = watchOutgoingInvite(inviter, { earlyMedia: true, sawEarlyMedia: () => true });
    inviter.go(SessionState.Establishing);
    inviter.go(SessionState.Established);
    watch.onAccept();
    inviter.go(SessionState.Terminating);
    inviter.go(SessionState.Terminated);
    await vi.advanceTimersByTimeAsync(0);
    expect(inviter.outgoingInviteRequest.cancel).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("cancelUnansweredInvite e chave de emergência", () => {
  it("cancelUnansweredInvite tolera INVITE que nem saiu e cancel que lança", () => {
    expect(() => cancelUnansweredInvite({})).not.toThrow();
    expect(() => cancelUnansweredInvite(null)).not.toThrow();
    expect(() =>
      cancelUnansweredInvite({
        outgoingInviteRequest: {
          cancel: () => {
            throw new Error("x");
          },
        },
      })
    ).not.toThrow();
  });

  it("isSipEarlyMediaEnabled: ligado por padrão, \"off\" desliga, localStorage que lança = ligado", () => {
    localStorage.removeItem(SIP_EARLY_MEDIA_STORAGE_KEY);
    expect(isSipEarlyMediaEnabled()).toBe(true);
    localStorage.setItem(SIP_EARLY_MEDIA_STORAGE_KEY, "off");
    expect(isSipEarlyMediaEnabled()).toBe(false);
    localStorage.setItem(SIP_EARLY_MEDIA_STORAGE_KEY, "on");
    expect(isSipEarlyMediaEnabled()).toBe(true);
    localStorage.removeItem(SIP_EARLY_MEDIA_STORAGE_KEY);

    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(isSipEarlyMediaEnabled()).toBe(true);
    spy.mockRestore();
  });

  it("sawEarlyMedia acompanha a 1ª resposta com mídia", () => {
    vi.useFakeTimers();
    const { ringback } = setup();
    expect(ringback.sawEarlyMedia()).toBe(false);
    ringback.onProgress(response(180));
    expect(ringback.sawEarlyMedia()).toBe(false);
    ringback.onProgress(response(183, true));
    expect(ringback.sawEarlyMedia()).toBe(true);
    ringback.stop();
    vi.useRealTimers();
  });
});
