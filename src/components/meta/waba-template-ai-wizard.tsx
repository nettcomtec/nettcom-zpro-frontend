"use client";

import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2, Settings, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface WizardAiForm {
  prompt: string;
  category: string;
  language: string;
  includeHeader: boolean;
  headerType: string;
  includeFooter: boolean;
  includeButtons: boolean;
  buttonTypes: string[];
  aiSource: "canal" | "copilot";
}

interface WabaTemplateAiWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generating: boolean;
  /** Disponibilidade do Copilot (null = ainda carregando) — define o default e habilita a opção */
  copilotAvailable: boolean | null;
  onGenerate: (form: WizardAiForm) => void;
}

const SEGMENTS = [
  "segEcommerce", "segHealth", "segEducation", "segServices",
  "segFinance", "segFood", "segBeauty", "segRealEstate", "segOther",
] as const;

const CAMPAIGNS: { key: string; category: string }[] = [
  { key: "campPromo", category: "MARKETING" },
  { key: "campWelcome", category: "MARKETING" },
  { key: "campCartRecovery", category: "MARKETING" },
  { key: "campSeasonal", category: "MARKETING" },
  { key: "campOrderConfirm", category: "UTILITY" },
  { key: "campReminder", category: "UTILITY" },
  { key: "campBilling", category: "UTILITY" },
  { key: "campStatusUpdate", category: "UTILITY" },
];

const LANGUAGES = [
  { value: "pt_BR", label: "Português (BR)" },
  { value: "en_US", label: "English (US)" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "zh_CN", label: "中文" },
  { value: "ar", label: "العربية" },
  { value: "hi", label: "हिन्दी" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "ru", label: "Русский" },
  { value: "tr", label: "Türkçe" },
];

export function WabaTemplateAiWizard({
  open,
  onOpenChange,
  generating,
  copilotAvailable,
  onGenerate,
}: WabaTemplateAiWizardProps) {
  const t = useTranslations("wabaTemplateAiWizard");
  // Chaves compartilhadas com o dialog de IA da página Meta (aiSourceLabel/Copilot/Canal...)
  const tMeta = useTranslations("metaPage");

  const [step, setStep] = useState(1);
  const [aiSource, setAiSource] = useState<"canal" | "copilot">("canal");

  React.useEffect(() => {
    if (open) setAiSource(copilotAvailable ? "copilot" : "canal");
  }, [open, copilotAvailable]);
  const [segment, setSegment] = useState<string>("");
  const [campaign, setCampaign] = useState<string>("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("pt_BR");
  const [includeHeader, setIncludeHeader] = useState(false);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [includeButtons, setIncludeButtons] = useState(false);
  const [details, setDetails] = useState("");

  const reset = () => {
    setStep(1);
    setSegment("");
    setCampaign("");
    setCategory("MARKETING");
    setLanguage("pt_BR");
    setIncludeHeader(false);
    setIncludeFooter(true);
    setIncludeButtons(false);
    setDetails("");
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const pickCampaign = (key: string) => {
    setCampaign(key);
    const def = CAMPAIGNS.find((c) => c.key === key);
    if (def) setCategory(def.category);
  };

  const handleGenerate = () => {
    const prompt = [
      `${t("promptSegment")}: ${t(segment)}.`,
      `${t("promptCampaign")}: ${t(campaign)}.`,
      details.trim() ? `${t("promptDetails")}: ${details.trim()}` : "",
    ].filter(Boolean).join(" ");
    onGenerate({
      prompt,
      category,
      language,
      includeHeader,
      headerType: "TEXT",
      includeFooter,
      includeButtons,
      buttonTypes: includeButtons ? ["QUICK_REPLY"] : [],
      aiSource,
    });
  };

  const canNext =
    (step === 1 && !!segment) ||
    (step === 2 && !!campaign) ||
    step === 3;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t(`stepLabel${step}`)} ({step}/4)</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-3 gap-2 py-2">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSegment(s)}
                className={cn(
                  "rounded-lg border p-3 text-xs font-medium text-center transition-colors hover:bg-accent",
                  segment === s && "border-primary bg-primary/10 text-primary"
                )}
              >
                {t(s)}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 gap-2 py-2">
            {CAMPAIGNS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => pickCampaign(c.key)}
                className={cn(
                  "rounded-lg border p-3 text-xs font-medium text-center transition-colors hover:bg-accent",
                  campaign === c.key && "border-primary bg-primary/10 text-primary"
                )}
              >
                {t(c.key)}
                <span className="block mt-1 text-[10px] text-muted-foreground">{c.category}</span>
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{tMeta("aiSourceLabel")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={copilotAvailable === false}
                  onClick={() => setAiSource("copilot")}
                  title={copilotAvailable === false ? tMeta("aiCopilotNoApiKey") : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors",
                    copilotAvailable === false
                      ? "border-border opacity-40 cursor-not-allowed"
                      : aiSource === "copilot"
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300"
                        : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="font-medium">{tMeta("aiSourceCopilot")}</span>
                  <span className="text-xs text-muted-foreground text-center leading-tight">
                    {copilotAvailable === false ? tMeta("aiCopilotInactive") : tMeta("aiSourceCopilotDesc")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiSource("canal")}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors",
                    aiSource === "canal"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-medium">{tMeta("aiSourceCanal")}</span>
                  <span className="text-xs text-muted-foreground text-center leading-tight">{tMeta("aiSourceCanalDesc")}</span>
                </button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("categoryLabel")}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">MARKETING</SelectItem>
                    <SelectItem value="UTILITY">UTILITY</SelectItem>
                    <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("languageLabel")}</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("includeHeaderLabel")}</Label>
                <Switch checked={includeHeader} onCheckedChange={setIncludeHeader} />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("includeFooterLabel")}</Label>
                <Switch checked={includeFooter} onCheckedChange={setIncludeFooter} />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("includeButtonsLabel")}</Label>
                <Switch checked={includeButtons} onCheckedChange={setIncludeButtons} />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2 py-2">
            <Label>{t("detailsLabel")}</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t("detailsPlaceholder")}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {t(segment)} • {t(campaign)} • {category}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={generating}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("back")}
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              {t("next")}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {generating ? t("generating") : t("generate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
