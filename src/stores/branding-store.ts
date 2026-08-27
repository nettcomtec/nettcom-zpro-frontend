import { create } from "zustand";

export interface SoundTimestamps {
  ticket: number;
  chat: number;
  support: number;
}

export interface TenantBranding {
  tenantId: number;
  customAppName: string | null;
  customLogoTimestamp: number;
  customLogoDarkTimestamp: number;
  customFaviconTimestamp: number;
}

export type FontSource = "cdn" | "selfhost";
export type AvatarShape = "circle" | "rounded-square";

export interface TypographyConfig {
  fontFamily: string;
  fontWeights: string;
  fontSource: FontSource;
  avatarShape: AvatarShape;
}

interface BrandingState {
  appName: string;
  logoTimestamp: number;
  soundTimestamps: SoundTimestamps;
  socketModelOptimized: boolean;
  tenantBranding: TenantBranding | null;
  typography: TypographyConfig;
  setAppName: (name: string) => void;
  setLogoTimestamp: (ts: number) => void;
  setSoundTimestamps: (ts: SoundTimestamps) => void;
  setSocketModelOptimized: (optimized: boolean) => void;
  setTenantBranding: (tb: TenantBranding | null) => void;
  setTypography: (cfg: Partial<TypographyConfig>) => void;
  reset: () => void;
}

const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  fontFamily: "Inter",
  fontWeights: "400,500,600,700",
  fontSource: "cdn",
  avatarShape: "circle"
};

export const useBrandingStore = create<BrandingState>()((set) => ({
  appName: "",
  logoTimestamp: 0,
  soundTimestamps: { ticket: 0, chat: 0, support: 0 },
  socketModelOptimized: typeof window !== "undefined"
    ? localStorage.getItem("socketModelNovo") === "optimized"
    : false,
  tenantBranding: null,
  typography: DEFAULT_TYPOGRAPHY,
  setAppName: (appName) => set({ appName }),
  setLogoTimestamp: (logoTimestamp) => set({ logoTimestamp }),
  setSoundTimestamps: (soundTimestamps) => set({ soundTimestamps }),
  setSocketModelOptimized: (socketModelOptimized) => set({ socketModelOptimized }),
  setTenantBranding: (tenantBranding) => set({ tenantBranding }),
  setTypography: (cfg) => set((s) => ({ typography: { ...s.typography, ...cfg } })),
  reset: () => set({
    appName: "",
    logoTimestamp: 0,
    soundTimestamps: { ticket: 0, chat: 0, support: 0 },
    tenantBranding: null,
    typography: DEFAULT_TYPOGRAPHY,
  }),
}));
