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

// ── Tipo canônico (espelho de backend/src/helpers/IsChannelTypeAllowedZPRO.ts) ─────────
// As chaves da UI (`*_oauth`, `hub`) diferem do `Whatsapp.type` real gravado pelo backend
// (`instagram`, `messenger`, `waba`, `hub_whatsapp`...). Limites e contagens por tipo
// comparam sempre no canônico. Plano: docs/PLANO_LIMITES_CANAL_ALIAS_OAUTH.md.
export const CHANNEL_TYPE_ALIASES: Record<string, string> = {
  waba_oauth: "waba",
  wabaoauth: "waba",
  instagram_oauth: "instagram",
  instagramoauth: "instagram",
  facebook_oauth: "messenger",
  facebookoauth: "messenger",
  messenger_oauth: "messenger",
};

function normalizeChannelType(rawType: string | null | undefined): string {
  return String(rawType ?? "").trim().toLowerCase();
}

/** Só apelidos (lado das chaves do mapa): não colapsa `hub_*`. */
function aliasCanonicalChannelType(rawType: string | null | undefined): string {
  const type = normalizeChannelType(rawType);
  return CHANNEL_TYPE_ALIASES[type] || type;
}

/** Tipo canônico de um `Whatsapp.type` ou de uma chave da UI: apelidos e `hub_*` -> `hub`. */
export function canonicalChannelType(rawType: string | null | undefined): string {
  const type = normalizeChannelType(rawType);
  if (type.startsWith("hub_")) return "hub";
  return CHANNEL_TYPE_ALIASES[type] || type;
}

// Uma linha por tipo REAL para a seção "Limites por Tipo de Canal" (/tenants e /planos).
// Derivada de CHANNEL_TYPES: canal novo entra sozinho. "WhatsApp Oficial" (manual ou via
// login) é uma linha só; Instagram/Facebook Oficial só existem via login.
export const CHANNEL_LIMIT_TYPES: ChannelType[] = [
  ...CHANNEL_TYPES.filter((c) => canonicalChannelType(c.value) === c.value).map((c) =>
    c.value === "waba" ? { ...c, labelKey: "channelLimitWabaAll" } : c
  ),
  { labelKey: "channelInstagramOauth", value: "instagram" },
  { labelKey: "channelFacebookOauth", value: "messenger" },
];

/** Chaves da UI (CHANNEL_TYPES) que representam o mesmo tipo real de `type`. */
export function keysForType(type: string): string[] {
  const canon = canonicalChannelType(type);
  return CHANNEL_TYPES.filter((c) => canonicalChannelType(c.value) === canon).map((c) => c.value);
}

function finitePositive(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Limite efetivo de um tipo real (0 = ilimitado). Chave do tipo real vence (inclusive 0
 * explícito); sem ela, o maior valor > 0 entre os apelidos; nenhuma chave = ilimitado.
 */
export function getEffectiveTypeLimit(
  limits: Record<string, number> | null | undefined,
  type: string
): number {
  if (!limits || typeof limits !== "object") return 0;
  const canon = canonicalChannelType(type);
  if (Object.prototype.hasOwnProperty.call(limits, canon)) return finitePositive(limits[canon]);
  let best = 0;
  for (const [key, value] of Object.entries(limits)) {
    if (aliasCanonicalChannelType(key) === canon) best = Math.max(best, finitePositive(value));
  }
  return best;
}

/**
 * Grava `value` para um tipo real em TODAS as chaves da UI daquele tipo (ex.: `waba` e
 * `waba_oauth`) e em toda chave já existente no mapa com o mesmo canônico. Nunca cria a
 * chave canônica (`instagram`/`messenger`) — front e backend antigos continuam lendo o
 * mesmo número. `0` = ilimitado.
 */
export function setTypeLimit(
  limits: Record<string, number> | null | undefined,
  type: string,
  value: number
): Record<string, number> {
  const canon = canonicalChannelType(type);
  const next: Record<string, number> = { ...(limits || {}) };
  const v = Math.max(0, Math.floor(Number(value) || 0));
  for (const key of keysForType(canon)) next[key] = v;
  for (const key of Object.keys(next)) {
    if (aliasCanonicalChannelType(key) === canon) next[key] = v;
  }
  return next;
}

/** Soma dos limites efetivos por tipo real DISTINTO (waba e waba_oauth contam uma vez). */
export function limitsSumForTypes(
  limits: Record<string, number> | null | undefined,
  types: string[]
): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const t of types) {
    const canon = canonicalChannelType(t);
    if (seen.has(canon)) continue;
    seen.add(canon);
    sum += getEffectiveTypeLimit(limits, canon);
  }
  return sum;
}
