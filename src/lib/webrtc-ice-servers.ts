import api from "@/lib/api";

const FALLBACK_STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

function configFromIceServers(iceServers: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}

let cachedRtcConfiguration: RTCConfiguration | null = null;
let loadPromise: Promise<RTCConfiguration> | null = null;

/**
 * Configuração WebRTC para chamadas do chat privado.
 * Busca STUN/TURN do backend (credenciais TURN ficam só no servidor).
 * Se a API falhar, usa STUN públicos redundantes (ainda pode falhar entre ISPs sem TURN).
 */
export async function getPrivateChatRtcConfiguration(): Promise<RTCConfiguration> {
  if (cachedRtcConfiguration) return cachedRtcConfiguration;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const { data } = await api.get<{ iceServers?: RTCIceServer[] }>(
          "/chat-privado/webrtc/ice-servers"
        );
        const iceServers = data?.iceServers;
        if (Array.isArray(iceServers) && iceServers.length > 0) {
          cachedRtcConfiguration = configFromIceServers(iceServers);
          return cachedRtcConfiguration;
        }
      } catch {
        /* usar fallback */
      }
      cachedRtcConfiguration = configFromIceServers(FALLBACK_STUN);
      return cachedRtcConfiguration;
    })();
  }
  return loadPromise;
}

/** Para testes ou após logout (evita reuso de config entre sessões). */
export function clearPrivateChatRtcConfigurationCache(): void {
  cachedRtcConfiguration = null;
  loadPromise = null;
}
