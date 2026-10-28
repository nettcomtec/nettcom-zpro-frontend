/**
 * Mapa único código -> chave i18n (namespace "sessoesPage") dos erros de
 * criação de canal que o backend devolve como `{ error: CODIGO }` (400):
 * limite geral de conexões, limite por tipo e tipo não permitido pelo plano.
 * Também cobre os códigos do `proxy:error` dos popups da Meta (conexão que
 * terminou sem número, conta não identificada, cadastro recusado pela Meta e
 * acesso de longa duração negado).
 *
 * Aceita tanto o `errorCode` estruturado do popup OAuth quanto a string `error`
 * crua (os popups de Instagram nativo e WABA já mandam o código como mensagem),
 * por isso funciona com proxy novo ou antigo. Códigos desconhecidos -> null
 * (o caller cai no texto que já mostrava).
 */
export type ChannelCreateErrorKey =
  | "errorConnectionsLimit"
  | "errorChannelTypeLimit"
  | "errorChannelTypeNotAllowed"
  | "errorNoPhoneNumber"
  | "errorWabaNotFound"
  | "errorPhoneDiscoveryUnavailable"
  | "errorEmbeddedSignup"
  | "errorIgLongTokenFailed"
  | "errorFbLongTokenFailed";

const CHANNEL_CREATE_ERROR_KEYS: Record<string, ChannelCreateErrorKey> = {
  ERR_NO_PERMISSION_CONNECTIONS_LIMIT: "errorConnectionsLimit",
  ERR_NO_PERMISSION_CHANNEL_TYPE_LIMIT: "errorChannelTypeLimit",
  ERR_CHANNEL_TYPE_NOT_ALLOWED: "errorChannelTypeNotAllowed",
  NO_PHONE_NUMBER: "errorNoPhoneNumber",
  WABA_NOT_FOUND: "errorWabaNotFound",
  PHONE_DISCOVERY_UNAVAILABLE: "errorPhoneDiscoveryUnavailable",
  ES_ERROR: "errorEmbeddedSignup",
  IG_LONG_TOKEN_FAILED: "errorIgLongTokenFailed",
  FB_LONG_TOKEN_FAILED: "errorFbLongTokenFailed",
};

// Códigos cuja mensagem crua do popup traz o detalhe da Meta (código do erro e
// id da sessão do cadastro) — vale mostrar junto do texto traduzido, porque é
// o que o suporte da Meta pede para investigar.
const CODES_WITH_DETAIL = new Set(["ES_ERROR"]);

export function channelCreateErrorKey(
  codeOrMessage?: string | null
): ChannelCreateErrorKey | null {
  if (!codeOrMessage) return null;
  const code = String(codeOrMessage).trim();
  return CHANNEL_CREATE_ERROR_KEYS[code] ?? null;
}

/**
 * Detalhe a mostrar abaixo do texto traduzido (ex.: `toast.error(texto, { description })`).
 * Só para códigos em que a mensagem do popup carrega o detalhe da Meta; nos
 * demais (ou quando a mensagem é o próprio código) devolve undefined.
 */
export function channelCreateErrorDetail(
  code?: string | null,
  rawMessage?: string | null
): string | undefined {
  const c = String(code || "").trim();
  if (!CODES_WITH_DETAIL.has(c)) return undefined;
  const msg = String(rawMessage || "").trim();
  if (!msg || msg === c) return undefined;
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
}
