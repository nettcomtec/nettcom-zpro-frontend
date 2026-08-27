"use client";

import { ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Componente exibido quando o usuário não tem permissão para acessar a página.
 * Equivalente ao banner vermelho do Vue: v-if="pageAllowed" / <q-banner class="bg-red">
 */
export function AccessDenied() {
  const t = useTranslations("accessDenied");

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive mt-4">
      <ShieldX className="h-5 w-5 shrink-0" />
      <p className="text-sm font-medium">
        {t("message")}
      </p>
    </div>
  );
}
