"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { GlobalProviderNotice } from "@/components/configuracoes/global-provider-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantGroqCloud } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";

const WHISPER_LANGUAGES = [
  { value: "af", label: "Afrikaans" },
  { value: "ar", label: "العربية (Arabic)" },
  { value: "hy", label: "Հայերեն (Armenian)" },
  { value: "az", label: "Azərbaycan (Azerbaijani)" },
  { value: "be", label: "Беларуская (Belarusian)" },
  { value: "bs", label: "Bosanski (Bosnian)" },
  { value: "bg", label: "Български (Bulgarian)" },
  { value: "ca", label: "Català (Catalan)" },
  { value: "zh", label: "中文 (Chinese)" },
  { value: "hr", label: "Hrvatski (Croatian)" },
  { value: "cs", label: "Čeština (Czech)" },
  { value: "da", label: "Dansk (Danish)" },
  { value: "nl", label: "Nederlands (Dutch)" },
  { value: "en", label: "English" },
  { value: "et", label: "Eesti (Estonian)" },
  { value: "fi", label: "Suomi (Finnish)" },
  { value: "fr", label: "Français (French)" },
  { value: "gl", label: "Galego (Galician)" },
  { value: "de", label: "Deutsch (German)" },
  { value: "el", label: "Ελληνικά (Greek)" },
  { value: "he", label: "עברית (Hebrew)" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "hu", label: "Magyar (Hungarian)" },
  { value: "is", label: "Íslenska (Icelandic)" },
  { value: "id", label: "Bahasa Indonesia (Indonesian)" },
  { value: "it", label: "Italiano (Italian)" },
  { value: "ja", label: "日本語 (Japanese)" },
  { value: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { value: "kk", label: "Қазақша (Kazakh)" },
  { value: "ko", label: "한국어 (Korean)" },
  { value: "lv", label: "Latviešu (Latvian)" },
  { value: "lt", label: "Lietuvių (Lithuanian)" },
  { value: "mk", label: "Македонски (Macedonian)" },
  { value: "ms", label: "Bahasa Melayu (Malay)" },
  { value: "mr", label: "मराठी (Marathi)" },
  { value: "mi", label: "Māori" },
  { value: "ne", label: "नेपाली (Nepali)" },
  { value: "no", label: "Norsk (Norwegian)" },
  { value: "fa", label: "فارسی (Persian)" },
  { value: "pl", label: "Polski (Polish)" },
  { value: "pt", label: "Português" },
  { value: "ro", label: "Română (Romanian)" },
  { value: "ru", label: "Русский (Russian)" },
  { value: "sr", label: "Српски (Serbian)" },
  { value: "sk", label: "Slovenčina (Slovak)" },
  { value: "sl", label: "Slovenščina (Slovenian)" },
  { value: "es", label: "Español (Spanish)" },
  { value: "sw", label: "Kiswahili (Swahili)" },
  { value: "sv", label: "Svenska (Swedish)" },
  { value: "tl", label: "Tagalog (Filipino)" },
  { value: "ta", label: "தமிழ் (Tamil)" },
  { value: "th", label: "ภาษาไทย (Thai)" },
  { value: "tr", label: "Türkçe (Turkish)" },
  { value: "uk", label: "Українська (Ukrainian)" },
  { value: "ur", label: "اردو (Urdu)" },
  { value: "vi", label: "Tiếng Việt (Vietnamese)" },
  { value: "cy", label: "Cymraeg (Welsh)" },
];

const GROQ_SPEECH_MODELS = [
  { value: "whisper-large-v3", label: "Whisper Large v3" },
  { value: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo" },
  { value: "distil-whisper-large-v3-en", label: "Distil Whisper Large v3 (EN only)" },
];

export default function GroqCloudPage() {
  const t = useTranslations("groqcloudPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [groqCloud, setGroqCloud] = useState("disabled");
  const [groqCloudApiKey, setGroqCloudApiKey] = useState("");
  const [groqCloudLanguage, setGroqCloudLanguage] = useState("");
  const [groqCloudModel, setGroqCloudModel] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTenantById(tenantId)
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        setGroqCloud((d as Record<string, string>)?.groqCloud || "disabled");
        setGroqCloudApiKey((d as Record<string, string>)?.groqCloudApiKey || "");
        setGroqCloudLanguage((d as Record<string, string>)?.groqCloudLanguage || "");
        setGroqCloudModel((d as Record<string, string>)?.groqCloudModel || "");
      })
      .catch(() => toast.error(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const saveDebounced = useCallback(
    (enabled: string, apiKey: string, language: string, model: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          await updateTenantGroqCloud(tenantId, {
            groqCloud: enabled,
            groqCloudApiKey: apiKey,
            groqCloudLanguage: language,
            groqCloudModel: model,
          });
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
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <Skeleton className="h-80" />
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

      <GlobalProviderNotice providerType="groqcloud" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" /> GroqCloud
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>{t("enableLabel")}</Label>
              <p className="text-sm text-muted-foreground">{t("enableDescription")}</p>
            </div>
            <Switch
              checked={groqCloud === "enabled"}
              onCheckedChange={(v) => {
                const val = v ? "enabled" : "disabled";
                setGroqCloud(val);
                saveDebounced(val, groqCloudApiKey, groqCloudLanguage, groqCloudModel);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("apiKeyLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? "text" : "password"}
                value={groqCloudApiKey}
                onChange={(e) => {
                  setGroqCloudApiKey(e.target.value);
                  saveDebounced(groqCloud, e.target.value, groqCloudLanguage, groqCloudModel);
                }}
                placeholder="gsk_..."
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("languageLabel")}</Label>
            <Select
              value={groqCloudLanguage}
              onValueChange={(v) => {
                setGroqCloudLanguage(v);
                saveDebounced(groqCloud, groqCloudApiKey, v, groqCloudModel);
              }}
            >
              <SelectTrigger><SelectValue placeholder={t("languagePlaceholder")} /></SelectTrigger>
              <SelectContent>
                {WHISPER_LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("modelLabel")}</Label>
            <Select
              value={groqCloudModel}
              onValueChange={(v) => {
                setGroqCloudModel(v);
                saveDebounced(groqCloud, groqCloudApiKey, groqCloudLanguage, v);
              }}
            >
              <SelectTrigger><SelectValue placeholder={t("modelPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {GROQ_SPEECH_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
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
