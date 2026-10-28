/**
 * sip-ringback.ts
 *
 * "Chamando" das ligações que o WebPhone SIP faz (a ligação normal e a de consulta da
 * transferência). Até 27/10/2026 a ligação ficava muda até o outro lado atender: o sip.js
 * descarta por padrão o áudio que chega antes do atendimento (183 com SDP, "early media"),
 * o alto-falante só era ligado no atendimento e nada tocava quando o PABX só avisava
 * "tocando" (180 sem áudio). Os avisos da operadora ("número não existe", "fora da área")
 * também não eram ouvidos: a ligação só caía.
 *
 * Regra (o `Inviter` é criado com `earlyMedia: true`, salvo a chave de emergência abaixo):
 * - A cada resposta provisória com mídia, o áudio do outro lado vai para o alto-falante: o
 *   chamando e os avisos da operadora tocam como num telefone comum. O sip.js trata a 1ª
 *   descrição de mídia recebida como a resposta definitiva (RFC 3261 §13.2.1) e ignora a do
 *   200, então o `earlyMedia` só ANTECIPA o uso da mesma mídia que o atendimento usaria.
 * - Enquanto nenhum áudio chega, toque de reserva no navegador (o mesmo das ligações de saída
 *   do WhatsApp oficial): 180/181/182 sem mídia começam na hora; resposta com mídia espera até
 *   `EARLY_MEDIA_GRACE_MS` pelo áudio (ICE + DTLS levam até ~1 s) e só então toca. 183 sem
 *   mídia não toca nada (é "andamento", não "tocando").
 * - "Chegou áudio" = as estatísticas do receptor contam pacote RTP recebido. Não usa o
 *   `unmute` da faixa: há navegador que o dispara quando a mídia é negociada, antes de qualquer
 *   pacote, e o toque pararia num PABX que manda 183 sem áudio. Daí em diante o toque não
 *   volta: quem manda no som é a operadora (silêncio dela é silêncio, como num aparelho de mesa).
 * - Atendeu, desligou, caiu ou a tela fechou: `stop()` encerra tudo e é idempotente. A troca de
 *   estado da ligação já chama `stop()` sozinha.
 *
 * Risco aceito (decisão do Pedro, 27/10/2026): com `earlyMedia` o sip.js derruba a ligação (488)
 * quando quem atende não é quem mandou o áudio antecipado — INVITE bifurcado ou proxy que troca de
 * rota no meio (operadora A dá o 183 e falha, a B atende). PABX que atende como intermediário único
 * (Asterisk, FreeSWITCH, softswitch) não faz isso. Saída de emergência sem versão nova: a chave
 * `SIP_EARLY_MEDIA_STORAGE_KEY` = "off" no localStorage desliga o áudio antecipado só naquele
 * navegador (o toque de reserva continua), e o caso sai no console como aviso `[SIP]`.
 *
 * `watchOutgoingInvite` cobre os dois encerramentos que o sip.js faz sozinho com o áudio antecipado:
 * o 183 com SDP que o navegador recusa (ele encerra sem CANCEL e o destino seguiria tocando) e o
 * 488 do atendimento acima.
 */

import { SessionState } from "sip.js";
import { startCallRingtone } from "./call-ringtone";

/** Espera pelo áudio depois de uma resposta com mídia, antes do toque de reserva. */
export const EARLY_MEDIA_GRACE_MS = 2500;
/** Intervalo da conferência de "chegou áudio" enquanto o outro lado não atende. */
export const AUDIO_POLL_MS = 300;

/** 180 tocando, 181 desviada, 182 na fila: o outro lado está sendo chamado. */
const RINGING_STATUS_CODES = new Set([180, 181, 182]);

/** localStorage: "off" desliga o áudio antecipado neste navegador (saída de emergência do suporte). */
export const SIP_EARLY_MEDIA_STORAGE_KEY = "zproSipEarlyMedia";

/** Áudio antecipado ligado, salvo a chave de emergência deste navegador. */
export function isSipEarlyMediaEnabled(): boolean {
  try {
    return window.localStorage.getItem(SIP_EARLY_MEDIA_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

const log = (message: string): void => {
  try {
    console.warn(`[SIP] ${message}`);
  } catch {
    /* console indisponível */
  }
};

/** Resposta provisória do INVITE, no formato do `requestDelegate.onProgress` do sip.js. */
export type SipProgressResponse = {
  message: {
    statusCode?: number;
    body?: string;
    getHeader?: (name: string) => string | undefined;
  };
};

type StateChangeEmitter = {
  addListener: (listener: (state: SessionState) => void) => void;
  removeListener: (listener: (state: SessionState) => void) => void;
};

export type OutgoingRingbackOptions = {
  /** A ligação de saída (`Inviter`): a troca de estado encerra o toque sozinha. */
  session: { stateChange: StateChangeEmitter };
  /** PeerConnection da ligação; pode ainda não existir. */
  getPeerConnection: () => RTCPeerConnection | undefined;
  /** Liga o áudio do outro lado no alto-falante. Precisa ser idempotente. */
  attachRemoteAudio: () => void;
  /** Toque de reserva; devolve a função que o para. Padrão: o das ligações do WhatsApp oficial. */
  startTone?: () => () => void;
};

export type OutgoingRingback = {
  /** Repassar cada resposta provisória do INVITE (`requestDelegate.onProgress`). */
  onProgress: (response: SipProgressResponse) => void;
  /** Encerra o toque e as conferências. Idempotente. */
  stop: () => void;
  /** Já chegou resposta provisória com mídia (183 com SDP). */
  sawEarlyMedia: () => boolean;
};

/** PeerConnection da sessão do sip.js (o `SessionDescriptionHandler` web a expõe). */
export function getSessionPeerConnection(session: unknown): RTCPeerConnection | undefined {
  const sdh = (session as { sessionDescriptionHandler?: unknown } | null | undefined)?.sessionDescriptionHandler;
  return (sdh as { peerConnection?: RTCPeerConnection } | undefined)?.peerConnection;
}

/**
 * Liga a faixa recebida da ligação no `<audio>`. Não troca o `srcObject` quando a faixa já
 * está lá: trocar reinicia a reprodução e daria um corte a cada resposta provisória.
 */
export function attachSessionAudio(session: unknown, audio: HTMLAudioElement | null): void {
  const pc = getSessionPeerConnection(session);
  if (!pc || !audio) return;
  const receivers = pc.getReceivers?.() ?? [];
  // Oferta com vídeo antes do áudio deixaria o alto-falante com a faixa de vídeo.
  const track = (receivers.find((r) => r.track?.kind === "audio") ?? receivers[0])?.track;
  if (!track) return;
  const current = audio.srcObject as MediaStream | null;
  if (current && typeof current.getTracks === "function" && current.getTracks().includes(track)) return;
  audio.srcObject = new MediaStream([track]);
}

/** A resposta traz descrição de mídia (o que o sip.js aplica como áudio antecipado). */
export function responseHasSdp(response: SipProgressResponse | null | undefined): boolean {
  const message = response?.message;
  if (!message?.body) return false;
  const contentType = (message.getHeader?.("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return contentType === "application/sdp";
}

/** Soma os pacotes RTP de áudio recebidos que as estatísticas contam. */
async function receivedAudioPackets(pc: RTCPeerConnection): Promise<number> {
  const receiver = pc.getReceivers?.().find((r) => r.track?.kind === "audio") ?? pc.getReceivers?.()[0];
  const report = receiver?.getStats ? await receiver.getStats() : await pc.getStats();
  let packets = 0;
  report.forEach((stat: { type?: string; kind?: string; mediaType?: string; packetsReceived?: number }) => {
    if (stat.type !== "inbound-rtp") return;
    if ((stat.kind ?? stat.mediaType) === "video") return;
    packets += Number(stat.packetsReceived) || 0;
  });
  return packets;
}

export function createOutgoingRingback(options: OutgoingRingbackOptions): OutgoingRingback {
  const startTone = options.startTone ?? (() => startCallRingtone({ beepGain: 0.25, fileVolume: 0.85 }));
  let stopped = false;
  let audioArrived = false;
  let sawSdp = false;
  let stopTone: (() => void) | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let checking = false;

  const silenceTone = (): void => {
    const stopCurrent = stopTone;
    stopTone = null;
    if (!stopCurrent) return;
    try {
      stopCurrent();
    } catch {
      /* ignore */
    }
  };

  const playTone = (): void => {
    if (stopped || audioArrived || stopTone) return;
    try {
      stopTone = startTone();
    } catch {
      stopTone = null;
    }
  };

  const clearTimers = (): void => {
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const onAudioArrived = (): void => {
    if (stopped || audioArrived) return;
    audioArrived = true;
    clearTimers();
    silenceTone();
  };

  const checkAudio = (): void => {
    if (stopped || audioArrived || checking) return;
    const pc = options.getPeerConnection();
    if (!pc) return;
    checking = true;
    receivedAudioPackets(pc)
      .then((packets) => {
        if (packets > 0) onAudioArrived();
      })
      .catch(() => {
        /* PeerConnection fechada: a ligação está acabando e o stop() vem pela troca de estado. */
      })
      .finally(() => {
        checking = false;
      });
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearTimers();
    silenceTone();
    options.session.stateChange.removeListener(onState);
  };

  function onState(state: SessionState): void {
    if (state !== SessionState.Initial && state !== SessionState.Establishing) stop();
  }

  options.session.stateChange.addListener(onState);

  const onProgress = (response: SipProgressResponse): void => {
    if (stopped || audioArrived) return;
    if (responseHasSdp(response)) {
      sawSdp = true;
      try {
        options.attachRemoteAudio();
      } catch {
        /* ignore */
      }
      if (!pollTimer) pollTimer = setInterval(checkAudio, AUDIO_POLL_MS);
      checkAudio();
      // Já tocando (veio um 180 antes): continua até o áudio chegar.
      if (!stopTone && !graceTimer) {
        graceTimer = setTimeout(() => {
          graceTimer = null;
          playTone();
        }, EARLY_MEDIA_GRACE_MS);
      }
      return;
    }
    // Depois de uma resposta com mídia, quem decide é a espera pelo áudio.
    if (!sawSdp && RINGING_STATUS_CODES.has(response?.message?.statusCode ?? 0)) playTone();
  };

  return { onProgress, stop, sawEarlyMedia: () => sawSdp };
}

type WatchedInviter = {
  state: SessionState;
  stateChange: StateChangeEmitter;
};

export type OutgoingInviteWatch = {
  /** Repassar do `requestDelegate.onReject` e `onRedirect`. */
  onFinalResponse: () => void;
  /** Repassar do `requestDelegate.onAccept` (o sip.js chama também quando recusa o 200). */
  onAccept: () => void;
};

/**
 * Manda o CANCEL do INVITE pelo pedido guardado no `Inviter` (privado no sip.js, lido por cast).
 * Sem resposta provisória o próprio sip.js espera uma antes de mandar; depois da resposta final
 * não manda nada.
 */
export function cancelUnansweredInvite(inviter: unknown): void {
  const request = (inviter as { outgoingInviteRequest?: { cancel?: () => unknown } } | null | undefined)
    ?.outgoingInviteRequest;
  try {
    request?.cancel?.();
  } catch {
    /* ignore */
  }
}

/**
 * Encerramentos que o sip.js faz sozinho numa ligação de saída com áudio antecipado:
 * - 183 com SDP que o navegador recusa: vai de Establishing direto a Terminated, sem resposta final e
 *   sem CANCEL, e o destino seguiria tocando (se atendesse, o 200 ficaria sem ACK). O CANCEL nosso
 *   passa por Terminating, e sem INVITE no fio a sessão sai de Initial — nenhum dos dois entra aqui.
 *   A resposta final chega ao `requestDelegate` DEPOIS da troca de estado (o 200 por promessa), então
 *   a conferência fica para o próximo ciclo.
 * - 200 de quem não mandou o áudio antecipado: o sip.js responde ACK + BYE 488. Sai o aviso `[SIP]`
 *   com a chave de emergência.
 */
export function watchOutgoingInvite(
  inviter: WatchedInviter,
  options: { earlyMedia: boolean; sawEarlyMedia: () => boolean }
): OutgoingInviteWatch {
  let lastState = inviter.state;
  let finalResponse = false;

  const listener = (state: SessionState): void => {
    const previous = lastState;
    lastState = state;
    if (state !== SessionState.Terminated) return;
    inviter.stateChange.removeListener(listener);
    if (!options.earlyMedia || previous !== SessionState.Establishing) return;
    setTimeout(() => {
      if (finalResponse) return;
      log("ligação encerrada antes de atender: o navegador recusou o áudio antecipado do PABX; CANCEL enviado");
      cancelUnansweredInvite(inviter);
    }, 0);
  };
  inviter.stateChange.addListener(listener);

  return {
    onFinalResponse: () => {
      finalResponse = true;
    },
    onAccept: () => {
      finalResponse = true;
      if (options.earlyMedia && options.sawEarlyMedia() && inviter.state === SessionState.Terminated) {
        log(
          "ligação encerrada no atendimento (488): quem atendeu não é quem mandou o áudio antecipado " +
            "(INVITE bifurcado ou troca de rota no PABX). Para desligar o áudio antecipado neste navegador: " +
            `localStorage.setItem("${SIP_EARLY_MEDIA_STORAGE_KEY}", "off") e recarregar a página.`
        );
      }
    },
  };
}
