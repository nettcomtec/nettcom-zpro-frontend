"use client";
import { useState } from "react";
import { ConfigPage } from "@/components/config/config-section";
import { Button } from "@/components/ui/button";
import { Bot, FlaskConical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { COPILOT_MODELS_BY_PROVIDER } from "@/lib/openai-models";
import { testCopilotCredentials } from "@/services/copilot";
import { OpenAIBaseUrlTooltip } from "@/components/copilot/openai-base-url-tooltip";

const COPILOT_PROVIDERS = [
  { value: "openai", label: "OpenAI (ChatGPT)" },
  { value: "groq", label: "xAI (Grok)" },
  { value: "claude", label: "Anthropic (Claude)" },
  { value: "gemini", label: "Google (Gemini)" },
];

export default function CopilotPage() {
  const t = useTranslations("copilotPage");
  const [testing, setTesting] = useState(false);

  const runTest = async (settings: Record<string, string>) => {
    setTesting(true);
    const provider = settings.copilotProvider || "openai";
    const apiKey = settings.copilotApiKey || "";
    const model = settings.copilotModel || "";
    const baseUrl = settings.copilotBaseUrl || "";
    try {
      if (!apiKey) {
        toast.error(t("testNoApiKey"));
        return;
      }
      const res = await testCopilotCredentials({ provider, apiKey, model, baseUrl });
      if (res.ok) {
        toast.success(t("testSuccess", { provider: res.provider || provider, model: res.model || model || "—" }));
      } else {
        toast.error(t("testFailed", { error: res.error || "Unknown" }), {
          description: `${provider} • ${model || "(default)"}`,
          duration: 10000,
        });
      }
    } catch (err) {
      // O interceptor de api.ts rejeita com `error.response`, então a estrutura é:
      // { data: { error?: string; message?: string }, status: number, ...}
      // Mas se for erro de rede sem response, recebemos o axios error normal.
      const e = err as {
        data?: { error?: string; message?: string } | string;
        status?: number;
        response?: { data?: { error?: string; message?: string } | string; status?: number };
        message?: string;
      };
      let msg = "";
      const data = e.data ?? e.response?.data;
      if (typeof data === "string") msg = data;
      else if (data && typeof data === "object") msg = data.error || data.message || "";
      if (!msg) msg = e.message || `HTTP ${e.status ?? e.response?.status ?? "?"}`;
      toast.error(t("testFailed", { error: msg }), {
        description: `${provider} • ${model || "(default)"}`,
        duration: 10000,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ConfigPage
      title={t("title")}
      description={t("description")}
      icon={Bot}
      headerActions={({ settings }) => (
        <Button size="sm" variant="outline" disabled={testing} onClick={() => runTest(settings)}>
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
          {t("testButton")}
        </Button>
      )}
      help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          {
            title: t("helpS2T"),
            items: [
              t("helpS2I0"),
              t("helpS2I1"),
              t("helpS2I2"),
              t("helpS2I3"),
              t("helpS2I4"),
              t("helpS2I5"),
            ],
          },
        ],
      }}
      sections={[
        {
          title: t("title"),
          fields: [
            {
              key: "copilot",
              label: t("enableLabel"),
              type: "boolean",
              description: t("enableDescription"),
            },
            {
              key: "copilotProvider",
              label: t("providerLabel"),
              type: "select",
              placeholder: t("providerPlaceholder"),
              options: COPILOT_PROVIDERS,
              description: t("providerDescription"),
            },
            {
              key: "copilotApiKey",
              label: t("apiKeyLabel"),
              type: "password",
              placeholder: t("apiKeyPlaceholder"),
              description: t("apiKeyDescription"),
            },
            {
              key: "copilotBaseUrl",
              label: t("baseUrlLabel"),
              type: "url",
              placeholder: "https://api.openai.com/v1",
              description: t("baseUrlDescription"),
              tooltipContent: <OpenAIBaseUrlTooltip context="copilot" />,
              badgeWhenSet: t("baseUrlCustomBadge"),
              visibleWhen: { field: "copilotProvider", value: "openai" },
            },
            {
              key: "copilotModel",
              label: t("modelLabel"),
              type: "datalist",
              placeholder: t("modelPlaceholder"),
              description: t("modelDescription"),
              optionsFromField: "copilotProvider",
              datalistOptionsMap: COPILOT_MODELS_BY_PROVIDER,
            },
            {
              key: "copilotSystemPrompt",
              label: t("systemPromptLabel"),
              type: "textarea",
              placeholder: t("systemPromptPlaceholder"),
              description: t("systemPromptDescription"),
            },
            {
              key: "copilotMaxTokens",
              label: t("maxTokensLabel"),
              type: "number",
              placeholder: t("maxTokensPlaceholder"),
              description: t("maxTokensDescription"),
            },
            {
              key: "copilotRewriteAlwaysVisible",
              label: t("rewriteAlwaysVisibleLabel"),
              type: "boolean",
              description: t("rewriteAlwaysVisibleDescription"),
            },
            {
              key: "copilotAutoSuggest",
              label: t("autoSuggestLabel"),
              type: "boolean",
              description: t("autoSuggestDescription"),
            },
            {
              key: "copilotAutoSentiment",
              label: t("autoSentimentLabel"),
              type: "boolean",
              description: t("autoSentimentDescription"),
            },
          ],
        },
      ]}
    />
  );
}
