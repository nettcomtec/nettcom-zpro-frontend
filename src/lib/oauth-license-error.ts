/**
 * Detecta erros estruturados retornados pelos controllers OAuth do backend
 * (RespondOAuthProxyErrorZPRO.ts): IP_TEMPORARILY_BANNED (429) ou
 * LICENSE_INVALID/EXPIRED/NOT_FOUND/REVOKED (403). Retorna shape uniforme para
 * o caller decidir entre toast + cooldown OU tratamento generico de erro.
 */

export type OAuthLicenseErrorKind = "banned" | "license" | null;

export interface OAuthLicenseErrorInfo {
  kind: OAuthLicenseErrorKind;
  /** Codigo bruto do backend (IP_TEMPORARILY_BANNED, LICENSE_INVALID, ...) */
  code: string | null;
  /** Mensagem human-readable do backend, se houver */
  message: string | null;
}

const LICENSE_CODES = new Set([
  "LICENSE_INVALID",
  "LICENSE_EXPIRED",
  "LICENSE_NOT_FOUND",
  "LICENSE_REVOKED",
]);

export function parseOAuthLicenseError(error: unknown): OAuthLicenseErrorInfo {
  const noInfo: OAuthLicenseErrorInfo = { kind: null, code: null, message: null };
  if (!error) return noInfo;

  const err = error as { response?: { status?: number; data?: { errorCode?: string; error?: string; message?: string } } };
  const status = err.response?.status;
  const data = err.response?.data;
  const code = (data?.errorCode || data?.error || "").toString();
  const message = (data?.message || data?.error || "").toString() || null;

  if (status === 429 || code === "IP_TEMPORARILY_BANNED") {
    return { kind: "banned", code: code || "IP_TEMPORARILY_BANNED", message };
  }
  if (status === 403 && LICENSE_CODES.has(code)) {
    return { kind: "license", code, message };
  }
  // Fallback: string match no payload bruto (ex.: controllers que ainda nao
  // foram migrados para o helper estruturado)
  const raw = JSON.stringify(data || "");
  if (raw.includes("IP_TEMPORARILY_BANNED")) {
    return { kind: "banned", code: "IP_TEMPORARILY_BANNED", message };
  }
  for (const c of LICENSE_CODES) {
    if (raw.includes(c)) return { kind: "license", code: c, message };
  }
  return noInfo;
}

/** TTL do cooldown local (alinhado com o circuit breaker do backend) */
export const OAUTH_LICENSE_COOLDOWN_MS = 2 * 60 * 1000;
