// Assinatura de atendente prefixada no corpo da mensagem enviada pelo
// operador (quando a assinatura está ativada na tela de atendimento).
//
// Apenas os canais da FAMÍLIA WHATSAPP interpretam *texto* como negrito
// (sintaxe de formatação do WhatsApp). Em qualquer outro canal (Telegram,
// Instagram, Messenger, Webchat, e-mail, Hub, SMS, ...) os `*` apareceriam
// literais para o destinatário, então a assinatura vai apenas com o nome.
//
// waba, dialog360 e gupshup são BSPs de WhatsApp (enviam via WhatsApp) —
// portanto também usam o negrito com asteriscos.
const WHATSAPP_CHANNEL_TYPES = new Set([
  "whatsapp",
  "baileys",
  "zapo",
  "evo",
  "evogo",
  "meow",
  "zapi",
  "uazapi",
  "waba",
  "dialog360",
  "gupshup",
]);

export function isWhatsappChannel(channel?: string | null): boolean {
  return WHATSAPP_CHANNEL_TYPES.has((channel || "").toLowerCase());
}

export function buildSignedBody(
  name: string,
  message: string,
  channel?: string | null
): string {
  const cleanName = (name || "").trim();
  return isWhatsappChannel(channel)
    ? `*${cleanName}*:\n ${message}`
    : `${cleanName}:\n ${message}`;
}
