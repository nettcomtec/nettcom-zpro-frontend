import api, { BACKGROUND_REQUEST } from "@/lib/api";

/**
 * Validade do acesso dos canais Instagram (login pelo Instagram), mantida pela
 * renovação automática do servidor. Uma linha por canal que o servidor já viu;
 * canal sem linha = estado desconhecido (nada a mostrar).
 */
export interface InstagramTokenState {
  whatsappId: number;
  expiresAt: string | null;
  fatal: boolean;
  lastErrorCode: string | number | null;
  lastRefreshAt: string | null;
  lastAttemptAt: string | null;
}

/**
 * `GET /instagram-token-states` → `{ states: [...] }`.
 * - Backend antigo (404), rede ou resposta inesperada → `null` (a tela não mostra nada
 *   e entende que o servidor não tem a renovação nem a reconexão no mesmo canal).
 * - Falha da própria rota (`500 ERR_INSTAGRAM_TOKEN_STATES`) → `[]`: o servidor tem o
 *   recurso, só não há estados para mostrar agora.
 * Chamada automática: sem toast.
 */
export async function fetchInstagramTokenStates(): Promise<InstagramTokenState[] | null> {
  try {
    const { data } = await api.get<{ states?: InstagramTokenState[] }>(
      "/instagram-token-states",
      { ...BACKGROUND_REQUEST }
    );
    const states = (data as { states?: unknown })?.states;
    if (!Array.isArray(states)) return null;
    return states.filter(
      (s): s is InstagramTokenState =>
        !!s && typeof s === "object" && Number.isFinite(Number((s as InstagramTokenState).whatsappId))
    );
  } catch (err: any) {
    // api.ts rejeita com o Response (status/data na raiz) ou com o erro do axios.
    const status = err?.status ?? err?.response?.status;
    const body = err?.data ?? err?.response?.data;
    if (status === 500 && body && typeof body === "object" && body.error === "ERR_INSTAGRAM_TOKEN_STATES") {
      return [];
    }
    return null;
  }
}
