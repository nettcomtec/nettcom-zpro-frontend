"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantAiDefaultLanguage } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";

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

export default function BotsEIaPage() {
  const t = useTranslations("botsEIaPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [aiDefaultLanguage, setAiDefaultLanguage] = useState("pt");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTenantById(tenantId)
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        setAiDefaultLanguage((d as Record<string, string>)?.aiDefaultLanguage || "pt");
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
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
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
            <Label>{t("languageLabel")}</Label>
            <p className="text-sm text-muted-foreground">{t("languageDescription")}</p>
            <Select
              value={aiDefaultLanguage}
              onValueChange={(v) => {
                setAiDefaultLanguage(v);
                saveDebounced(v);
              }}
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder={t("languagePlaceholder")} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {AI_LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{t("autoSave")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
