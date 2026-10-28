// Canais que não recebem mensagem encaminhada: e-mail (assunto e destinatário saem da
// janela de e-mail) e as lojas não têm fila de envio, e a mensagem ficava pendente para
// sempre. LinkedIn, OLX, TikTok e YouTube só aceitam texto: mídia encaminhada para eles é
// recusada. Espelho do backend `helpers/ForwardTargetChannelZPRO.ts` (mudar um exige o outro).
export const FORWARD_UNSUPPORTED_CHANNEL_TYPES = new Set(["webmail", "email", "woocommerce", "nuvemshop"]);
export const FORWARD_TEXT_ONLY_CHANNEL_TYPES = new Set(["linkedin", "olx", "tiktok", "youtube"]);

const normalizeType = (type: string | null | undefined) => String(type ?? "").trim().toLowerCase();

export function isForwardTargetChannelSupported(type: string | null | undefined): boolean {
  return !FORWARD_UNSUPPORTED_CHANNEL_TYPES.has(normalizeType(type));
}

export function isForwardTextOnlyChannel(type: string | null | undefined): boolean {
  return FORWARD_TEXT_ONLY_CHANNEL_TYPES.has(normalizeType(type));
}
