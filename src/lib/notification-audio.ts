/**
 * notification-audio.ts
 *
 * Usa Web Audio API (AudioContext) em vez de HTMLAudioElement para tocar sons de
 * notificação. A vantagem principal é que um AudioContext criado/desbloqueado via
 * gesto do usuário (click/keydown) pode continuar tocando áudio mesmo quando a tab
 * está em background, contornando a Autoplay Policy dos navegadores modernos.
 *
 * Uso:
 *   - Chamar `unlockAudioContext()` dentro de um event listener de click/keydown
 *   - Substituir `new Audio(url).play()` por `playNotificationSound(url)`
 */

let ctx: AudioContext | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const fetchingUrls = new Set<string>();

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Chamar no primeiro gesto do usuário para desbloquear o AudioContext. */
export function unlockAudioContext(): void {
  const context = getContext();
  if (!context) return;
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
}

async function fetchBuffer(url: string): Promise<AudioBuffer | null> {
  const context = getContext();
  if (!context) return null;

  if (bufferCache.has(url)) return bufferCache.get(url)!;
  if (fetchingUrls.has(url)) return null; // já em fetch, ignora duplicata

  fetchingUrls.add(url);
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    bufferCache.set(url, audioBuffer);
    return audioBuffer;
  } catch {
    return null;
  } finally {
    fetchingUrls.delete(url);
  }
}

/**
 * Toca o som de notificação via AudioContext.
 * Se o contexto ainda estiver suspenso, tenta fazer resume primeiro.
 * Fallback para HTMLAudioElement se AudioContext não estiver disponível.
 */
export async function playNotificationSound(url: string): Promise<void> {
  const context = getContext();

  // Fallback para HTMLAudioElement se AudioContext não disponível
  if (!context) {
    try {
      const audio = new Audio(url);
      await audio.play();
    } catch {
      // silencioso
    }
    return;
  }

  // Resume se suspenso (pode acontecer em algumas situações)
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      // fallback
      try {
        const audio = new Audio(url);
        await audio.play();
      } catch {
        // silencioso
      }
      return;
    }
  }

  const buffer = await fetchBuffer(url);
  if (!buffer) {
    // Fallback se não conseguiu decodificar
    try {
      const audio = new Audio(url);
      await audio.play();
    } catch {
      // silencioso
    }
    return;
  }

  try {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  } catch {
    // silencioso
  }
}
