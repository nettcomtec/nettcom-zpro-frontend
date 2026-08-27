"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { fetchPublicColors, fetchPublicColorsDark } from "@/services/settings";
import { fetchPublicBranding } from "@/services/superadmin";
import { applyBrandColors } from "@/lib/brand-colors";
import { setBaseTitle } from "@/lib/tab-title";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const colorsRef = useRef<Array<Record<string, string>>>([]);
  const colorsDarkRef = useRef<Record<string, string>>({});

  useEffect(() => {
    // Apply cached colors immediately to avoid flash
    const isDark = document.documentElement.classList.contains("dark");
    try {
      const stored = localStorage.getItem("storedColors");
      const storedDark = localStorage.getItem("storedColorsDark");
      if (stored) {
        const cached = JSON.parse(stored) as Array<Record<string, string>>;
        colorsRef.current = cached;
        if (storedDark) colorsDarkRef.current = JSON.parse(storedDark) as Record<string, string>;
        applyBrandColors(cached, isDark, colorsDarkRef.current);
      }
    } catch { /* ignore */ }

    // Apply cached app name immediately (sem flash da default "APP" quando logado/deslogado)
    try {
      const cachedBranding = JSON.parse(localStorage.getItem("zpro-branding") || "null") as { appName?: string } | null;
      if (cachedBranding?.appName) setBaseTitle(cachedBranding.appName);
    } catch { /* ignore */ }

    // Fetch fresh palettes + branding global (appName customizado pelo superadmin)
    Promise.all([
      fetchPublicColors().catch(() => ({ data: [] })),
      fetchPublicColorsDark().catch(() => ({ data: null })),
      fetchPublicBranding().catch(() => ({ data: null })),
    ]).then(([lightRes, darkRes, brandingRes]) => {
      const colors = Array.isArray(lightRes.data) ? lightRes.data : [];
      const darkColors = (darkRes.data as { colors?: Record<string, string> } | null)?.colors ?? null;
      colorsRef.current = colors;
      if (darkColors && Object.values(darkColors).some((v) => !!v)) {
        colorsDarkRef.current = darkColors;
        localStorage.setItem("storedColorsDark", JSON.stringify(darkColors));
      }
      const dark = document.documentElement.classList.contains("dark");
      applyBrandColors(colors, dark, colorsDarkRef.current);
      localStorage.setItem("storedColors", JSON.stringify(colors));

      const branding = brandingRes.data as { appName?: string; logoTimestamp?: number } | null;
      if (branding) {
        localStorage.setItem("zpro-branding", JSON.stringify(branding));
        if (branding.appName) setBaseTitle(branding.appName);
      }
    });
  }, []);

  // Re-apply when theme changes
  useEffect(() => {
    if (!colorsRef.current.length) return;
    const isDark = document.documentElement.classList.contains("dark");
    applyBrandColors(colorsRef.current, isDark, colorsDarkRef.current);
  }, [resolvedTheme]);

  return (
    <div className="min-h-screen flex items-center justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {children}
    </div>
  );
}
