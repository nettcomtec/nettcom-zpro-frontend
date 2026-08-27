"use client";

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  context: "copilot" | "channel";
}

export function OpenAIBaseUrlTooltip({ context }: Props) {
  const t = useTranslations("openaiBaseUrl");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label={t("tooltipTitle")}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[380px] max-w-[calc(100vw-2rem)] text-xs">
        <div className="space-y-3">
          <div className="font-semibold text-sm">{t("tooltipTitle")}</div>

          <section>
            <div className="font-medium text-green-600 dark:text-green-400 mb-1">
              {t("tooltipCompatible")}
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
              <li>{t("tooltipCompatibleLite")}</li>
              <li>{t("tooltipCompatibleLocal")}</li>
              <li>{t("tooltipCompatibleGateway")}</li>
              <li>{t("tooltipCompatibleProxies")}</li>
            </ul>
          </section>

          <section>
            <div className="font-medium text-yellow-600 dark:text-yellow-400 mb-1">
              {t("tooltipLimitations")}
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
              <li>{t("tooltipLimitWhisper")}</li>
              <li>{t("tooltipLimitAssistants")}</li>
              <li>{t("tooltipLimitAzure")}</li>
              <li>{t("tooltipLimitV1")}</li>
              <li>{t("tooltipLimitAuth")}</li>
            </ul>
          </section>

          <section>
            <div className="font-medium text-red-600 dark:text-red-400 mb-1">
              {t("tooltipIncompatible")}
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
              <li>{t("tooltipNoClaude")}</li>
              <li>{t("tooltipNoGemini")}</li>
            </ul>
          </section>

          <div className="text-muted-foreground italic border-t pt-2">
            {context === "copilot" ? t("tooltipScopeCopilot") : t("tooltipScopeChannel")}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
