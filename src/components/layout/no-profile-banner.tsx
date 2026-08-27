"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

/**
 * §35.13 Opção A — Banner global para user `custom` sem perfil vinculado
 * OU com `customProfileEnabled` desligado no tenant.
 *
 * Renderizado no topo do (dashboard)/layout.tsx. Não-dispensável (toast seria perdido em refresh).
 */
export function NoProfileBanner() {
  const t = useTranslations("customProfiles.noProfileBanner");
  const user = useAuthStore((s) => s.user);

  if (!user) return null;
  if (user.profile !== "custom") return null;

  const noProfile = !user.customProfileId;
  const flagOff = !user.customProfileEnabled;

  if (!noProfile && !flagOff) return null;

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-900 text-sm flex items-center gap-2 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">
        {flagOff ? t("flagDisabled") : t("noProfile")}
      </span>
    </div>
  );
}
