// Motivo da falha de envio (`Message.statusError`) em texto para o atendente.
// Ponto único da bolha da conversa (ícone de falha) e do relatório de envio em
// massa (resultado por número): os dois leem as chaves `ackError<código>` do
// namespace `messageBubble`.

export interface AckStatusError {
  code?: number | string;
  subcode?: number | string;
  title?: string;
  details?: string;
}

// Códigos de erro Meta/BSP com descrição traduzida no tooltip do ack de falha
// NO_SEND_CONTEXT é nosso (backend/helpers/NoSendContextErrorZPRO): ticket sem
// conversa/thread ativa no canal — ML, OLX, LinkedIn, TikTok e YouTube.
// TELEGRAM_UNREACHABLE e TELEGRAM_MEDIA_MISSING também (TbotServices/helpers/
// TelegramSendGuardZPRO): o contato bloqueou o bot ou nunca falou com ele; o
// arquivo da mídia não está mais no servidor.
// MIGRATION_NOT_SENT: pendente no servidor anterior que a migração de empresa marcou
// como não enviada (para não chegar em dobro ao cliente).
// LOCATION_SEND_FAILED: nó Localização do fluxo que não saiu sem resposta do provedor
// (canal fora do ar, recusa nossa, rede); o fluxo segue.
// CHANNEL_DISCONNECTED: bolha gravada com o canal fora do ar (envio manual WABA/Dialog360).
export const ACK_ERROR_KNOWN_CODES = ["100", "131026", "131042", "131047", "131048", "131049", "131051", "132000", "132012", "133010", "NO_SEND_CONTEXT", "TELEGRAM_UNREACHABLE", "TELEGRAM_MEDIA_MISSING", "MIGRATION_NOT_SENT", "LOCATION_SEND_FAILED", "CHANNEL_DISCONNECTED", "INSTAGRAM_DOCUMENT_NOT_PDF", "INSTAGRAM_STICKER_NOT_SUPPORTED"];
// Código + subcódigo com texto próprio. O subcódigo só vem na recusa síncrona do
// envio WABA (backend novo); sem ele vale o texto do código, como antes.
// 100/33 = a Meta não acha o número do canal (Phone Number ID errado, muitas vezes
// o ID da WABA no lugar) ou o token perdeu o acesso a ele.
export const ACK_ERROR_KNOWN_SUBCODES = ["100_33"];

/**
 * `t` é o tradutor do namespace `messageBubble`. Devolve o código (vazio sem
 * código), se ele deve aparecer entre parênteses (só o numérico, da Meta/BSP: os
 * nossos são slugs e não dizem nada ao atendente) e a descrição (traduzida para
 * código conhecido; senão título e detalhe do provedor; vazia sem nada).
 */
export function describeAckError(
  statusError: AckStatusError | null | undefined,
  t: (key: string) => string
): { code: string; showCode: boolean; desc: string } {
  const code = statusError?.code != null ? String(statusError.code) : "";
  const subKey = code && statusError?.subcode != null ? `${code}_${String(statusError.subcode)}` : "";
  const desc = subKey && ACK_ERROR_KNOWN_SUBCODES.includes(subKey)
    ? t(`ackError${subKey}`)
    : code && ACK_ERROR_KNOWN_CODES.includes(code)
    ? t(`ackError${code}`)
    : [statusError?.title, statusError?.details].filter(Boolean).join(" — ");
  return { code, showCode: !!code && /^\d+$/.test(code), desc };
}
