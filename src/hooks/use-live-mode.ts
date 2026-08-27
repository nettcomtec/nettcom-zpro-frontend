import { useLiveModeStore } from "@/stores/live-mode-store";

export function useLiveMode() {
  const envEnabled = useLiveModeStore((s) => s.envEnabled);
  const active = useLiveModeStore((s) => s.active);
  const setActive = useLiveModeStore((s) => s.setActive);
  const toggle = useLiveModeStore((s) => s.toggle);
  return {
    envEnabled,
    active,
    isLiveMode: envEnabled && active,
    setActive,
    toggle,
  };
}
