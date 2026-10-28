import { getWABAPhoneNumbers } from "@/services/waba-meta";
import { metaRateLimitedUntil } from "@/lib/backend-error-code";

export type WabaQualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

const CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = {
  quality_rating?: string;
  display_phone_number?: string;
  platform_type?: string;
  is_on_biz_app?: boolean;
  status?: string;
  code_verification_status?: string;
  error?: string;
  ts: number;
};

// Cache da LISTA de números por WABA (5 min) + consulta em andamento compartilhada:
// o card, o selo de qualidade e o aviso de registro pendente pedem o mesmo WABA
// quase ao mesmo tempo — uma consulta só serve a todos. Erro não é guardado
// (a próxima chamada tenta de novo).
type PhonesEntry = { phones: WabaPhoneNumberRow[]; ts: number };
const phonesCache = new Map<string, PhonesEntry>();
const phonesInflight = new Map<string, Promise<WabaPhoneNumberRow[]>>();
// Consultas da WABA pausadas pelo limite da Meta (80008): até o horário que o backend
// informou, a tela nem pede (devolve o mesmo erro).
const phonesPausedUntil = new Map<string, number>();

// Campos com info de coexistência (is_on_biz_app indica número ainda no app
// WhatsApp Business). Em versões antigas da Graph API o campo pode não existir
// — nesse caso o fetch cai no retry sem fields (default do backend).
const FIELDS_WITH_COEX =
  "id,cc,country_dial_code,display_phone_number,verified_name,status,quality_rating,search_visibility,platform_type,code_verification_status,is_on_biz_app";

/** Limpa o cache manualmente (útil após reconectar ou trocar sessão). */
export function clearWabaPhoneQualityCache() {
  phonesCache.clear();
  phonesInflight.clear();
  phonesPausedUntil.clear();
}

export interface WabaPhoneNumberRow {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
  throughput?: unknown;
  platform_type?: string;
  is_on_biz_app?: boolean;
  code_verification_status?: string;
}

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Resolve o access token para a Graph API preferindo `bmToken`.
 * `tokenAPI` no CRM pode ser o ID do número de telefone (não um token válido).
 */
export function resolveWabaGraphAccessToken(params: {
  bmToken?: string | null;
  tokenAPI?: string | null;
}): string {
  const bm = (params.bmToken || "").trim();
  if (bm) return bm;
  const ta = (params.tokenAPI || "").trim();
  if (!ta) return "";
  // Phone Number ID é tipicamente 12-22 dígitos — não é access_token válido
  if (/^\d{12,22}$/.test(ta)) return "";
  return ta;
}

/**
 * Retorna classes Tailwind para colorir o badge conforme o quality_rating.
 * GREEN=verde, YELLOW=amarelo, RED=vermelho, UNKNOWN=cinza.
 */
export function qualityRatingBadgeClasses(rating?: string | null): string {
  const r = (rating ?? "").toUpperCase();
  if (r === "GREEN") return "bg-green-500 hover:bg-green-500/90 text-white border-transparent";
  if (r === "YELLOW") return "bg-yellow-400 hover:bg-yellow-400/90 text-black border-transparent";
  if (r === "RED") return "bg-red-500 hover:bg-red-500/90 text-white border-transparent";
  return "bg-muted text-muted-foreground border-transparent";
}

/**
 * Severidade do campo `status` do número (Meta phone number node). É distinto do
 * `quality_rating` (GREEN/YELLOW/RED) — descreve a saúde operacional do número:
 * `BANNED` (banido), `RESTRICTED` (restrito), `FLAGGED`, `RATE_LIMITED`,
 * `DISCONNECTED`, `CONNECTED`. O match é tolerante a variações que a Meta envia
 * via webhook `account_update`/`account_alerts` (ex.: DISABLED_UPDATE, ACCOUNT_VIOLATION).
 */
export type WabaPhoneStatusSeverity =
  | "banned"
  | "restricted"
  | "flagged"
  | "rate_limited"
  | "disconnected"
  | "ok"
  | "other";

export function classifyWabaPhoneStatus(status?: string | null): WabaPhoneStatusSeverity {
  const s = (status ?? "").toUpperCase().trim();
  if (!s) return "other";
  if (s === "CONNECTED") return "ok";
  if (s === "DISCONNECTED") return "disconnected";
  if (s === "FLAGGED") return "flagged";
  if (s === "RATE_LIMITED" || s === "RATELIMITED") return "rate_limited";
  // Substring p/ tolerar strings de evento do webhook (DISABLED_UPDATE, ACCOUNT_VIOLATION, etc.)
  if (s.includes("BAN")) return "banned";
  if (s.includes("RESTRIC") || s.includes("DISABLE") || s.includes("VIOLATION")) return "restricted";
  return "other";
}

/** True quando o status exige atenção do operador (banido/restrito/sinalizado/limitado). */
export function isWabaPhoneStatusProblem(status?: string | null): boolean {
  const sev = classifyWabaPhoneStatus(status);
  return sev === "banned" || sev === "restricted" || sev === "flagged" || sev === "rate_limited";
}

/** Chave i18n (namespace `metaHealth.status`) para o status do número. */
export function wabaPhoneStatusI18nKey(status?: string | null): string {
  switch (classifyWabaPhoneStatus(status)) {
    case "banned": return "banned";
    case "restricted": return "restricted";
    case "flagged": return "flagged";
    case "rate_limited": return "rateLimited";
    case "disconnected": return "disconnected";
    case "ok": return "connected";
    default: return "unknown";
  }
}

/** Classes Tailwind do badge conforme a severidade do status do número. */
export function wabaPhoneStatusBadgeClasses(status?: string | null): string {
  const sev = classifyWabaPhoneStatus(status);
  if (sev === "banned" || sev === "restricted")
    return "bg-red-500 hover:bg-red-500/90 text-white border-transparent";
  if (sev === "flagged" || sev === "rate_limited")
    return "bg-yellow-400 hover:bg-yellow-400/90 text-black border-transparent";
  if (sev === "ok")
    return "bg-green-500 hover:bg-green-500/90 text-white border-transparent";
  return "bg-muted text-muted-foreground border-transparent";
}

const pickPhoneFields = (p: WabaPhoneNumberRow): Omit<CacheEntry, "ts"> => ({
  quality_rating: p.quality_rating,
  display_phone_number: p.display_phone_number,
  platform_type: p.platform_type,
  is_on_biz_app: p.is_on_biz_app,
  status: p.status,
  code_verification_status: p.code_verification_status,
});

/**
 * Lista os números do WABA (`POST /wabametaGetWABAPhoneNumbers`) com cache de 5 min
 * por WABA e consulta em andamento compartilhada. Lança em caso de erro (não guardado).
 */
async function loadWabaPhones(params: {
  wabaId: string;
  token: string;
  wabaVersion?: string | null;
}): Promise<WabaPhoneNumberRow[]> {
  const key = params.wabaId;
  const cached = phonesCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.phones;
  const running = phonesInflight.get(key);
  if (running) return running;
  const pausedUntil = phonesPausedUntil.get(key);
  if (pausedUntil && pausedUntil > Date.now()) {
    throw { data: { error: `ERR_META_RATE_LIMITED:${new Date(pausedUntil).toISOString()}` } };
  }

  // A closure compara com a própria promise no finally (só roda depois do 1º await,
  // com a variável já atribuída): `!` diz isso ao TypeScript.
  let promise!: Promise<WabaPhoneNumberRow[]>;
  promise = (async () => {
    try {
      let data: unknown;
      try {
        ({ data } = await getWABAPhoneNumbers({
          wabaId: params.wabaId,
          businessToken: params.token,
          apiVersion: params.wabaVersion || undefined,
          fields: FIELDS_WITH_COEX,
        }));
      } catch (err) {
        // Limite da Meta (80008): repetir sem fields seria outra chamada à conta bloqueada.
        if (metaRateLimitedUntil(err)) throw err;
        // Versão da Graph API sem is_on_biz_app — retry com os fields default do backend
        ({ data } = await getWABAPhoneNumbers({
          wabaId: params.wabaId,
          businessToken: params.token,
          apiVersion: params.wabaVersion || undefined,
        }));
      }
      const phones: WabaPhoneNumberRow[] = Array.isArray((data as any)?.data)
        ? (data as any).data
        : Array.isArray(data)
          ? (data as any)
          : [];
      phonesCache.set(key, { phones, ts: Date.now() });
      return phones;
    } catch (err) {
      const until = metaRateLimitedUntil(err);
      if (until) phonesPausedUntil.set(key, until.getTime());
      throw err;
    } finally {
      if (phonesInflight.get(key) === promise) phonesInflight.delete(key);
    }
  })();
  phonesInflight.set(key, promise);
  return promise;
}

/**
 * Busca quality_rating do número da WABA via backend (`POST /wabametaGetWABAPhoneNumbers`).
 * Se `phoneHint` for fornecido, escolhe o número correspondente; caso contrário retorna o primeiro.
 */
export async function fetchWabaPhoneQualityRating(params: {
  bmToken?: string | null;
  tokenAPI?: string | null;
  wabaId?: string | null;
  phoneHint?: string | null;
  wabaVersion?: string | null;
}): Promise<{
  quality_rating?: string;
  display_phone_number?: string;
  platform_type?: string;
  is_on_biz_app?: boolean;
  status?: string;
  code_verification_status?: string;
  error?: string;
  /** Consultas pausadas pela Meta (80008) até esta data ISO. */
  rateLimitedUntil?: string;
}> {
  const token = resolveWabaGraphAccessToken({
    bmToken: params.bmToken,
    tokenAPI: params.tokenAPI,
  });
  const wabaId = (params.wabaId ?? "").trim();
  if (!token || !wabaId) return {};

  try {
    const phones = await loadWabaPhones({ wabaId, token, wabaVersion: params.wabaVersion });
    if (phones.length === 0) return {};

    // Seleciona o número correspondente e retorna TODOS os campos dele (quality + status
    // + platform), mesmo sem quality_rating — um número BANIDO pode vir sem rating e ainda
    // precisa propagar `status` para o badge "Banido".
    const hint = (params.phoneHint || "").trim();
    if (hint) {
      const byId = phones.find((p) => p.id && String(p.id) === hint);
      if (byId) {
        return pickPhoneFields(byId);
      }
      const hintDigits = digitsOnly(hint);
      if (hintDigits.length >= 8) {
        const byDisplay = phones.find((p) => {
          const d = digitsOnly(p.display_phone_number);
          return d && (d === hintDigits || d.endsWith(hintDigits) || hintDigits.endsWith(d));
        });
        if (byDisplay) {
          return pickPhoneFields(byDisplay);
        }
      }
    }

    const first = phones[0];
    return first ? pickPhoneFields(first) : {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao buscar qualidade Meta";
    const until = metaRateLimitedUntil(err);
    // Erro comum não é guardado (tentará de novo na próxima); a pausa da Meta, sim.
    return until ? { error: msg, rateLimitedUntil: until.toISOString() } : { error: msg };
  }
}

/**
 * Estado de UM número do WABA, casado SÓ pelo id (phone_number_id) — usa a mesma
 * lista em cache da consulta de qualidade (nenhuma chamada a mais quando o card já
 * consultou o WABA). Sem casamento exato devolve `found: false`: nunca cai no
 * primeiro número da lista (WABA com vários números daria o estado de outro).
 */
export async function fetchWabaPhoneStateById(params: {
  bmToken?: string | null;
  tokenAPI?: string | null;
  wabaId?: string | null;
  wabaVersion?: string | null;
  phoneId?: string | null;
}): Promise<{
  found: boolean;
  status?: string;
  platform_type?: string;
  is_on_biz_app?: boolean;
  code_verification_status?: string;
  error?: string;
}> {
  const token = resolveWabaGraphAccessToken({
    bmToken: params.bmToken,
    tokenAPI: params.tokenAPI,
  });
  const wabaId = (params.wabaId ?? "").trim();
  const phoneId = (params.phoneId ?? "").trim();
  if (!token || !wabaId || !phoneId) return { found: false };
  try {
    const phones = await loadWabaPhones({ wabaId, token, wabaVersion: params.wabaVersion });
    const row = phones.find((p) => p.id && String(p.id) === phoneId);
    if (!row) return { found: false };
    return {
      found: true,
      status: row.status,
      platform_type: row.platform_type,
      is_on_biz_app: row.is_on_biz_app,
      code_verification_status: row.code_verification_status,
    };
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : "phone_state_failed" };
  }
}
