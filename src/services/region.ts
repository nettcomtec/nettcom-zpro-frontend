import api from "@/lib/api";

/**
 * Região da empresa (país, moeda, idioma dos textos ao cliente) e padrão geral da
 * instalação. Contratos em docs/PLANO_REGIAO_MOEDA_IDIOMA.md §5.0.1.
 */

export interface RegionEffectivePayload {
  country: string;
  currency: string;
  language: string;
  languageConfigured: boolean;
}

export interface RegionDefaultsPayload {
  country: string;
  currency: string;
  language: string;
  configured: boolean;
}

export interface RegionTextsResponse {
  language: string;
  languageConfigured: boolean;
  texts: Record<string, string>;
}

export interface TenantRegionResponse {
  regionCountry: string | null;
  regionCurrency: string | null;
  regionLanguage: string | null;
  regionEffective: RegionEffectivePayload;
  regionDefaults: RegionDefaultsPayload;
}

/** Chave ausente = não mexe; "" ou null = herdar o padrão geral. */
export interface TenantRegionPatch {
  regionCountry?: string | null;
  regionCurrency?: string | null;
  regionLanguage?: string | null;
}

export interface ApplyRegionTextsResponse {
  language: string;
  /** Itens trocados (ex.: "rating", "queues:3", "setting:callRejectMessage"). */
  updated: string[];
  /** Textos personalizados que não foram tocados. */
  keptCustom: number;
}

export interface RegionDefaultsAdminResponse {
  country: string;
  currency: string;
  language: string;
  configured: boolean;
  /** Quais campos o padrão geral define (ausente = backend sem o campo). */
  has?: { country: boolean; currency: boolean; language: boolean };
  /** Empresas com o campo NULL (herdam o padrão), por campo. */
  inheriting: { country: number; currency: number; language: number };
}

/** "" = remove o campo do padrão geral (volta a BR/BRL/pt). */
export interface RegionDefaultsPatch {
  country?: string;
  currency?: string;
  language?: string;
}

export interface ApplyInheritingResponse {
  tenants: number;
  updatedTenants: number;
  failed: Array<{ tenantId: number; error?: string }>;
}

export interface PublicRegionDefaults {
  country: string;
  currency: string;
  language: string;
  /** O padrão geral define idioma (só então o /login usa a dica). Ausente = backend antigo. */
  languageConfigured?: boolean;
}

/** Textos ao cliente montados na tela, no idioma da empresa (própria empresa). */
export async function fetchRegionTexts() {
  return api.get<RegionTextsResponse>("/tenantsRegion/texts");
}

export async function updateTenantRegion(tenantId: number, patch: TenantRegionPatch) {
  return api.put<TenantRegionResponse>(`/tenantsRegion/${tenantId}`, patch);
}

export async function applyRegionDefaultTexts(tenantId: number) {
  return api.post<ApplyRegionTextsResponse>(`/tenantsRegion/${tenantId}/apply-default-texts`, {});
}

/** Superadmin (/customizar > Região). */
export async function fetchRegionDefaults() {
  return api.get<RegionDefaultsAdminResponse>("/custom/getRegionDefaultsNovo");
}

export async function updateRegionDefaults(patch: RegionDefaultsPatch) {
  return api.post<RegionDefaultsAdminResponse>("/custom/updateRegionDefaultsNovo", patch);
}

/** Lote nas empresas que herdam o idioma (uma por vez no backend). */
export async function applyRegionDefaultsToInheriting() {
  return api.post<ApplyInheritingResponse>("/custom/regionDefaultsNovo/apply-default-texts", {}, { timeout: 120000 });
}

/** Rota pública: usada SÓ no /login (dica de idioma da tela). */
export async function fetchPublicRegionDefaults() {
  return api.get<PublicRegionDefaults>("/publicRegionDefaultsNovo");
}
