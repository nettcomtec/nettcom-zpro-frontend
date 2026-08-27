import { create } from "zustand";

const ENV_ENABLED = process.env.NEXT_PUBLIC_LIVE_MODE_ENABLED === "true";
const STORAGE_KEY = "zpro-live-mode-active";

interface LiveModeState {
  envEnabled: boolean;
  active: boolean;
  setActive: (v: boolean) => void;
  toggle: () => void;
  hydrate: () => void;
}

export const useLiveModeStore = create<LiveModeState>((set, get) => ({
  envEnabled: ENV_ENABLED,
  active: false,
  setActive: (v) => {
    if (!get().envEnabled) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, String(v));
      } catch {}
    }
    set({ active: v });
  },
  toggle: () => get().setActive(!get().active),
  hydrate: () => {
    if (!get().envEnabled) return;
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      set({ active: raw === "true" });
    } catch {}
  },
}));
