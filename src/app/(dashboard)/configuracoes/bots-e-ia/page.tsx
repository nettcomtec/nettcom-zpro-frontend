"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain, Info } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantAiDefaultLanguage } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";
import { useRegion } from "@/hooks/use-region";
import { regionStateFromTenant, type RegionState } from "@/lib/region";
import { localeNames, type Locale } from "@/i18n/config";

const AI_LANGUAGES = [
  { value: "pt", label: "Português" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語 (Japanese)" },
  { value: "zh", label: "中文 (Chinese)" },
  { value: "ar", label: "العربية (Arabic)" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "ru", label: "Русский (Russian)" },
  { value: "tr", label: "Türkçe (Turkish)" },
];

/**
 * Opção "Seguir a Região" (aiDefaultLanguage vazio → NULL no banco): a IA usa o idioma
 * das mensagens ao cliente da empresa. O Select não aceita valor vazio, por isso o
 * marcador; no save ele vira "".
 */
const FOLLOW_REGION = "__region__";

export default function BotsEIaPage() {
  const t = useTranslations("botsEIaPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [aiDefaultLanguage, setAiDefaultLanguage] = useState("pt");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Região da própria leitura da página (mais fresca); antes dela, a do store.
  const storeRegion = useRegion().region;
  const [pageRegion, setPageRegion] = useState<RegionState | null>(null);
  const region = pageRegion || storeRegion;
  // Backend antigo (sem Região): sem a opção, e vazio segue aparecendo como Português.
  const followSupported = region.supported;
  // Sem idioma definido na Região, o backend responde em Português (como hoje).
  const effectiveLanguage = region.languageConfigured ? region.language : "pt";
  const followLabel = t("followRegion", {
    language: localeNames[effectiveLanguage as Locale] || effectiveLanguage,
  });

  useEffect(() => {
    fetchTenantById(tenantId)
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        const row = (d || {}) as Record<string, unknown>;
        const ownRegion = regionStateFromTenant(row);
        setPageRegion(ownRegion);
        const saved = typeof row.aiDefaultLanguage === "string" ? row.aiDefaultLanguage.trim() : "";
        // Campo vazio: com backend que conhece a Região é a opção "Seguir a Região"
        // (nunca "pt"); sem ela, "pt" como sempre foi.
        setAiDefaultLanguage(saved || (ownRegion ? FOLLOW_REGION : "pt"));
      })
      .catch(() => toast.error(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const saveDebounced = useCallback(
    (lang: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          await updateTenantAiDefaultLanguage(tenantId, lang);
          toast.success(t("successSave"));
        } catch {
          toast.error(t("errorSave"));
        }
      }, 700);
    },
    [tenantId]
  );

  // A ajuda precisa existir tambem no skeleton: sem isso o botao de ajuda
  // some da pagina enquanto os dados carregam.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), followSupported ? t("helpS0I2Region") : t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" /> {t("sectionTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>{t("languageLabel")}</Label>
              {followSupported && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("followRegionTooltip")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs font-normal">
                      {t("followRegionTooltip")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t("languageDescription")}</p>
            <Select
              value={aiDefaultLanguage}
              onValueChange={(v) => {
                setAiDefaultLanguage(v);
                // "Seguir a Região" grava vazio (NULL): a IA acompanha o idioma da empresa.
                saveDebounced(v === FOLLOW_REGION ? "" : v);
              }}
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder={t("languagePlaceholder")} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {followSupported && <SelectItem value={FOLLOW_REGION}>{followLabel}</SelectItem>}
                {AI_LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {followSupported && (
              <p className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
                {t("followRegionNote")}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("autoSave")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
