/**
 * Pausa do disparo AUTOMÁTICO do Copiloto nesta aba.
 *
 * A análise de sentimento roda sozinha ao abrir atendimento nunca analisado e a
 * sugestão a cada mensagem recebida. Com o provedor de IA recusando (sem saldo,
 * chave inválida, modelo desligado, servidor próprio fora do ar), cada abertura e
 * cada mensagem viravam uma chamada com falha — repetida sem fim. Depois de uma
 * falha (que não seja 422 = Copiloto sem chave configurada, que já é tratado como
 * "desligado", nem 403/404 = recusa daquele atendimento — sem acesso ou inexistente —,
 * que não diz nada do provedor), o disparo automático daquele recurso fica suspenso
 * por 10 minutos nesta aba. O clique manual continua funcionando; quem chama encerra
 * a pausa quando uma chamada der certo (`clearCopilotAutoPause`).
 *
 * Estado em memória do módulo, com cópia em sessionStorage (por aba, sobrevive ao
 * recarregar); toda leitura/escrita do storage é protegida — sem ele a pausa vale
 * só até recarregar a página.
 */

export type CopilotAutoFeature = "sentiment" | "suggest";

const PAUSE_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = "copilotAutoPauseUntil:";

const pausedUntil: Partial<Record<CopilotAutoFeature, number>> = {};

const readStored = (feature: CopilotAutoFeature): number => {
  try {
    if (typeof window === "undefined") return 0;
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + feature);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const writeStored = (feature: CopilotAutoFeature, until: number | null): void => {
  try {
    if (typeof window === "undefined") return;
    if (until === null) window.sessionStorage.removeItem(STORAGE_PREFIX + feature);
    else window.sessionStorage.setItem(STORAGE_PREFIX + feature, String(until));
  } catch {
    // storage indisponível: fica só a memória
  }
};

/** Status HTTP do erro de request (o interceptor rejeita com o `response`). */
const errorStatus = (err: unknown): number | undefined => {
  const e = err as { status?: unknown; response?: { status?: unknown } } | null;
  const status = e?.status ?? e?.response?.status;
  return typeof status === "number" ? status : undefined;
};

/** Código de erro do corpo da resposta (`{ error }`), nos dois formatos de rejeição. */
const errorCode = (err: unknown): string => {
  const e = err as { data?: { error?: unknown }; response?: { data?: { error?: unknown } } } | null;
  const code = e?.data?.error ?? e?.response?.data?.error;
  return typeof code === "string" ? code : "";
};

// 403/404 são do atendimento (sem acesso a ele, ou ele não existe mais): outro
// atendimento funciona, então não pausa o recurso. Exceção: o 403 da IA da plataforma
// (recurso desligado para a empresa) vale para todos os atendimentos e pausa.
const isTicketScopedRefusal = (err: unknown): boolean => {
  const status = errorStatus(err);
  if (status === 404) return true;
  if (status === 403) return !errorCode(err).startsWith("ERR_AI_PLATFORM_");
  return false;
};

const isCanceled = (err: unknown): boolean => {
  const e = err as { name?: unknown; code?: unknown } | null;
  return e?.name === "CanceledError" || e?.code === "ERR_CANCELED";
};

export function isCopilotAutoPaused(feature: CopilotAutoFeature): boolean {
  const until = Math.max(pausedUntil[feature] ?? 0, readStored(feature));
  if (!until) return false;
  if (Date.now() >= until) {
    delete pausedUntil[feature];
    writeStored(feature, null);
    return false;
  }
  pausedUntil[feature] = until;
  return true;
}

/** Registra a falha de uma chamada do recurso; 422, 403/404 do atendimento e cancelamento não pausam. */
export function noteCopilotAutoFailure(feature: CopilotAutoFeature, err: unknown): void {
  if (isCanceled(err)) return;
  if (errorStatus(err) === 422) return;
  if (isTicketScopedRefusal(err)) return;
  const until = Date.now() + PAUSE_MS;
  pausedUntil[feature] = until;
  writeStored(feature, until);
}

/** Uma chamada que deu certo encerra a pausa do recurso. */
export function clearCopilotAutoPause(feature: CopilotAutoFeature): void {
  delete pausedUntil[feature];
  writeStored(feature, null);
}
