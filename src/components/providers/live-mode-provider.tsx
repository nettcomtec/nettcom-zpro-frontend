"use client";
import { useEffect } from "react";
import { useLiveModeStore } from "@/stores/live-mode-store";

export function LiveModeProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useLiveModeStore((s) => s.hydrate);
  const envEnabled = useLiveModeStore((s) => s.envEnabled);
  const toggle = useLiveModeStore((s) => s.toggle);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!envEnabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [envEnabled, toggle]);

  return <>{children}</>;
}
