// Fonte única dos tipos de canal — usada em /tenants (allowedChannels + limites por tipo)
// e no editor de plano /planos (features.limits). `value` casa com Whatsapp.type / as
// chaves de Tenant.allowedChannels e channelConnectionLimits. labelKey resolve no
// namespace i18n "tenantsPage" (channelXxx).
export interface ChannelType {
  labelKey: string;
  value: string;
}

export const CHANNEL_TYPES: ChannelType[] = [
  { labelKey: "channelWaba", value: "waba" },
  { labelKey: "channelBaileys", value: "baileys" },
  { labelKey: "channelWhatsapp", value: "whatsapp" },
  { labelKey: "channelMeow", value: "meow" },
  { labelKey: "channelEvo", value: "evo" },
  { labelKey: "channelEvogo", value: "evogo" },
  { labelKey: "channelZapi", value: "zapi" },
  { labelKey: "channelZapo", value: "zapo" },
  { labelKey: "channelUazapi", value: "uazapi" },
  { labelKey: "channelTelegram", value: "telegram" },
  { labelKey: "channelHub", value: "hub" },
  { labelKey: "channelWebchat", value: "webchat" },
  { labelKey: "channelMercadoLivre", value: "mercadolivre" },
  { labelKey: "channelOLX", value: "olx" },
  { labelKey: "channelLinkedIn", value: "linkedin" },
  { labelKey: "channelYouTube", value: "youtube" },
  { labelKey: "channelTikTok", value: "tiktok" },
  { labelKey: "channelWooCommerce", value: "woocommerce" },
  { labelKey: "channelNuvemshop", value: "nuvemshop" },
  { labelKey: "channelWebmail", value: "webmail" },
  { labelKey: "channelEmail", value: "email" },
  { labelKey: "channelWabaOauth", value: "waba_oauth" },
  { labelKey: "channelDialog360", value: "dialog360" },
  { labelKey: "channelGupshup", value: "gupshup" },
  { labelKey: "channelInstagramOauth", value: "instagram_oauth" },
  { labelKey: "channelFacebookOauth", value: "facebook_oauth" },
];

export const BETA_CHANNEL_TYPES = ["mercadolivre", "olx", "linkedin", "youtube", "tiktok", "woocommerce", "nuvemshop"];
