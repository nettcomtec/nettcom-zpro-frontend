import api from "@/lib/api";
import type { FontSource, AvatarShape } from "@/lib/load-app-font";

export interface TypographyConfig {
  fontFamily: string;
  fontWeights: string;
  fontSource: FontSource;
  avatarShape: AvatarShape;
}

export interface EffectiveTypography extends TypographyConfig {
  inheritsFromGlobal: {
    fontFamily: boolean;
    fontWeights: boolean;
    fontSource: boolean;
    avatarShape: boolean;
  };
}

export interface TypographyPatch {
  fontFamily?: string | null;
  fontWeights?: string | null;
  fontSource?: FontSource | null;
  avatarShape?: AvatarShape | null;
}

export async function listAllowedFonts() {
  return api.get<{ fonts: string[] }>("/custom/typography/fonts");
}

export async function fetchGlobalTypography() {
  return api.get<TypographyConfig>("/custom/typography/global");
}

export async function saveGlobalTypography(patch: Partial<TypographyConfig>) {
  return api.put<TypographyConfig>("/custom/typography/global", patch);
}

export async function syncGlobalFont() {
  return api.post("/custom/typography/global/sync-font");
}

export async function fetchTenantTypography(tenantId: number) {
  return api.get<EffectiveTypography>(`/custom/tenant/${tenantId}/typography`);
}

export async function saveTenantTypography(tenantId: number, patch: TypographyPatch) {
  return api.put<EffectiveTypography>(`/custom/tenant/${tenantId}/typography`, patch);
}
