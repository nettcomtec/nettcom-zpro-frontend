"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OpenAIBaseUrlTooltip } from "./openai-base-url-tooltip";

interface Props {
  value: string;
  onChange: (value: string) => void;
  context: "copilot" | "channel";
  disabled?: boolean;
}

const URL_REGEX = /^https?:\/\//i;

export function OpenAIBaseUrlField({ value, onChange, context, disabled }: Props) {
  const t = useTranslations("openaiBaseUrl");
  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !URL_REGEX.test(trimmed);
  const hasCustom = trimmed.length > 0 && !invalid;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label>{t("label")}</Label>
        <OpenAIBaseUrlTooltip context={context} />
        {hasCustom && (
          <Badge variant="secondary" className="text-[10px] font-normal">
            {t("customBadge")}
          </Badge>
        )}
      </div>
      <Input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://api.openai.com/v1"
        disabled={disabled}
        aria-invalid={invalid || undefined}
      />
      {invalid && (
        <p className="text-xs text-destructive">{t("invalid")}</p>
      )}
      {!invalid && (
        <p className="text-xs text-muted-foreground">{t("help")}</p>
      )}
    </div>
  );
}
