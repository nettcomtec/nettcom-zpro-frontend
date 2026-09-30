/**
 * Mapa único código -> chave i18n (namespace "sessoesPage") dos erros de
 * criação de canal que o backend devolve como `{ error: CODIGO }` (400):
 * limite geral de conexões, limite por tipo e tipo não permitido pelo plano.
 *
 * Aceita tanto o `errorCode` estruturado do popup OAuth quanto a string `error`
 * crua (os popups de Instagram nativo e WABA já mandam o código como mensagem),
 * por isso funciona com proxy novo ou antigo. Códigos desconhecidos -> null
 * (o caller cai no texto que já mostrava).
 */
export type ChannelCreateErrorKey =
  | "errorConnectionsLimit"
  | "errorChannelTypeLimit"
  | "errorChannelTypeNotAllowed";

const CHANNEL_CREATE_ERROR_KEYS: Record<string, ChannelCreateErrorKey> = {
  ERR_NO_PERMISSION_CONNECTIONS_LIMIT: "errorConnectionsLimit",
  ERR_NO_PERMISSION_CHANNEL_TYPE_LIMIT: "errorChannelTypeLimit",
  ERR_CHANNEL_TYPE_NOT_ALLOWED: "errorChannelTypeNotAllowed",
};

export function channelCreateErrorKey(
  codeOrMessage?: string | null
): ChannelCreateErrorKey | null {
  if (!codeOrMessage) return null;
  const code = String(codeOrMessage).trim();
  return CHANNEL_CREATE_ERROR_KEYS[code] ?? null;
}
