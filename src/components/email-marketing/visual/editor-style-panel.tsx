"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EMAIL_FONT_KEYS,
  EMAIL_FONT_STACKS,
  type EmailDesignSettings,
  type EmailFontKey,
} from "@/lib/email-design";
import { ColorField, NumberField } from "./editor-fields";

interface EditorStylePanelProps {
  settings: EmailDesignSettings;
  onPatch: (patch: Partial<EmailDesignSettings>, group?: string) => void;
}

const isFontKey = (value: string): value is EmailFontKey => (EMAIL_FONT_KEYS as readonly string[]).includes(value);

/** Nome da fonte = 1ª família da pilha (nome próprio, não se traduz) */
const fontLabel = (key: EmailFontKey): string => EMAIL_FONT_STACKS[key].split(",")[0];

export function EditorStylePanel({ settings, onPatch }: EditorStylePanelProps) {
  const t = useTranslations("emailVisualEditor");
  const uid = useId();

  return (
    <div className="space-y-4">
      <ColorField
        label={t("outerBackground")}
        value={settings.backgroundColor}
        onChange={backgroundColor => onPatch({ backgroundColor }, "backgroundColor")}
      />
      <NumberField
        label={t("emailWidth")}
        value={settings.contentWidth}
        min={320}
        max={700}
        step={10}
        onChange={contentWidth => onPatch({ contentWidth }, "contentWidth")}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-font`} className="text-xs">
          {t("fontFamily")}
        </Label>
        <Select
          value={settings.fontFamily}
          onValueChange={value => {
            if (isFontKey(value) && value !== settings.fontFamily) onPatch({ fontFamily: value });
          }}
        >
          <SelectTrigger id={`${uid}-font`} className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMAIL_FONT_KEYS.map(key => (
              <SelectItem key={key} value={key}>
                <span style={{ fontFamily: EMAIL_FONT_STACKS[key] }}>{fontLabel(key)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-dir`} className="text-xs">
          {t("direction")}
        </Label>
        <Select
          value={settings.direction}
          onValueChange={value => {
            if ((value === "ltr" || value === "rtl") && value !== settings.direction) onPatch({ direction: value });
          }}
        >
          <SelectTrigger id={`${uid}-dir`} className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ltr">{t("directionLtr")}</SelectItem>
            <SelectItem value="rtl">{t("directionRtl")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
