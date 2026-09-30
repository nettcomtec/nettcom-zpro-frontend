/**
 * call-ringtone.ts
 *
 * Toque das chamadas do app: chat privado (interna, áudio e vídeo), WABA,
 * Dialog360, Gupshup e webphone SIP.
 *
 * Regra: se o front servir um arquivo de toque (`ringtone.mp3`, `.ogg` ou
 * `.wav` na pasta `public/`), ele toca em loop; sem arquivo — que é o padrão,
 * porque o repositório não distribui nenhum — cai no beep sintetizado via Web
 * Audio API, exatamente como sempre foi: 480 Hz por 0,6 s, repetindo a cada
 * 1,8 s. Trocar o toque é só soltar o arquivo em `public/`, sem rebuild.
 *
 * A sonda do arquivo é PREGUIÇOSA (dispara no primeiro toque da sessão, nunca
 * no boot) e o resultado fica em memória: quem nunca recebe chamada não paga
 * request nenhum. Enquanto ela não resolve vale um teto de espera curto —
 * estourado, o episódio inteiro vai de beep e a decisão não muda no meio dele.
 *
 * O AudioContext é o MESMO do som de notificação (`notification-audio.ts`).
 * Por isso `stop()` derruba só os nós criados aqui e NUNCA fecha o contexto:
 * fechá-lo silenciaria as notificações de mensagem pelo resto da sessão.
 */

import { getSharedAudioContext } from "./notification-audio";

/** Ordem de preferência do arquivo em `public/` — o primeiro que existir vence. */
const RINGTONE_URLS = ["/ringtone.mp3", "/ringtone.ogg", "/ringtone.wav"];

/** Beep sintetizado — os valores são os que as telas de chamada sempre usaram. */
const BEEP_FREQUENCY_HZ = 480;
const BEEP_DURATION_S = 0.6;
const BEEP_INTERVAL_MS = 1800;
const DEFAULT_BEEP_GAIN = 0.3;

/** Teto de espera pela sonda antes de começar pelo beep. */
const PROBE_TIMEOUT_MS = 700;

let probePromise: Promise<AudioBuffer | null> | null = null;
let probedBuffer: AudioBuffer | null = null;
let probeDone = false;

/**
 * Procura o arquivo de toque. Só vale como candidato o que REALMENTE decodifica
 * como áudio: sem isso, uma resposta HTML seria aceita como se fosse o toque e
 * a busca pararia nela, sem nunca chegar aos outros formatos.
 *
 * As duas respostas HTML que aparecem aqui: arquivo ausente devolve 404 e
 * sessão sem o cookie de auth é redirecionada pelo middleware para `/login`
 * (que responde 200) — nenhuma das duas é áudio.
 */
async function probeRingtoneFile(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (typeof fetch === "undefined") return null;
  for (const url of RINGTONE_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok || response.redirected) continue;
      if ((response.headers?.get("content-type") ?? "").includes("text/html")) continue;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength === 0) continue;
      return await ctx.decodeAudioData(bytes);
    } catch {
      // Rede fora do ar, formato não suportado, arquivo corrompido: próximo.
    }
  }
  return null;
}

function ensureProbe(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (!probePromise) {
    probePromise = probeRingtoneFile(ctx)
      .catch(() => null)
      .then((buffer) => {
        probedBuffer = buffer;
        probeDone = true;
        return buffer;
      });
  }
  return probePromise;
}

export type CallRingtoneOptions = {
  /** Ganho do beep sintetizado — preserva o volume próprio de cada tela. */
  beepGain?: number;
  /** Volume do arquivo de toque (0..1). */
  fileVolume?: number;
};

/**
 * Começa o toque e devolve a função que o para. A assinatura já é a do cleanup
 * de `useEffect`, então o call site é `return startCallRingtone()`.
 */
export function startCallRingtone(options: CallRingtoneOptions = {}): () => void {
  const beepGain = options.beepGain ?? DEFAULT_BEEP_GAIN;
  const fileVolume = options.fileVolume ?? 1;

  const ctx = getSharedAudioContext();
  // Sem Web Audio API a chamada fica muda — mesmo comportamento de sempre.
  if (!ctx) return () => {};

  let stopped = false;
  let beepTimer: ReturnType<typeof setTimeout> | null = null;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let source: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (beepTimer) {
      clearTimeout(beepTimer);
      beepTimer = null;
    }
    if (probeTimer) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    if (source) {
      try { source.stop(); } catch { /* já terminou */ }
      try { source.disconnect(); } catch { /* ignore */ }
      source = null;
    }
    if (gainNode) {
      try { gainNode.disconnect(); } catch { /* ignore */ }
      gainNode = null;
    }
    // Contexto compartilhado com o som de notificação: nunca fechar aqui.
  };

  const beep = (): void => {
    if (stopped) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = BEEP_FREQUENCY_HZ;
      gain.gain.setValueAtTime(beepGain, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + BEEP_DURATION_S);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + BEEP_DURATION_S);
    } catch { /* ignore */ }
    beepTimer = setTimeout(() => { if (!stopped) beep(); }, BEEP_INTERVAL_MS);
  };

  const playFile = (buffer: AudioBuffer): void => {
    if (stopped) return;
    try {
      gainNode = ctx.createGain();
      gainNode.gain.value = fileVolume;
      gainNode.connect(ctx.destination);
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gainNode);
      source.start(0);
    } catch {
      // Não conseguiu tocar o arquivo: cai no beep para a chamada não ficar muda.
      source = null;
      gainNode = null;
      beep();
    }
  };

  // Contexto criado fora de um gesto nasce suspenso — mesmo resume que o
  // playNotificationSound faz. Não bloqueia: o que já foi agendado toca assim
  // que o contexto volta.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  // Sonda já resolvida numa chamada anterior: decisão síncrona.
  if (probeDone) {
    if (probedBuffer) playFile(probedBuffer);
    else beep();
    return stop;
  }

  // Primeiro toque da sessão: a sonda ainda está em voo.
  let decided = false;
  probeTimer = setTimeout(() => {
    if (decided || stopped) return;
    decided = true;
    beep();
  }, PROBE_TIMEOUT_MS);
  void ensureProbe(ctx).then((buffer) => {
    if (decided || stopped) return;
    decided = true;
    if (probeTimer) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    if (buffer) playFile(buffer);
    else beep();
  });

  return stop;
}
