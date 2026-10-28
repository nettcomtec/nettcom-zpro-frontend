"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye } from "lucide-react";

import { PublicFormRenderer } from "@/components/forms/public-form-renderer";
import { getFormStrings, isFormLang } from "@/lib/form-strings";
import { useRegion } from "@/hooks/use-region";
import { cn } from "@/lib/utils";
import type { FormContactRule, FormField, FormTheme, PublicFormDefinition } from "@/lib/forms";
import { toPreviewFields } from "./form-editor-shared";

export interface FormPreviewProps {
  name: string;
  slug: string;
  fields: FormField[];
  theme: FormTheme;
  contactRule: FormContactRule;
  className?: string;
}

/**
 * Prévia ao vivo: o MESMO componente da página pública, em modo "preview" (nunca envia).
 * Textos ao visitante no idioma da tela; país do telefone pela Região da empresa.
 */
export function FormPreview({ name, slug, fields, theme, contactRule, className }: FormPreviewProps) {
  const t = useTranslations("formsPage");
  const locale = useLocale();
  const { country } = useRegion();

  // Mesmo objeto que getFormStrings devolve (o renderer descobre o idioma por ele).
  const lang = isFormLang(locale) ? locale : "pt";
  const strings = useMemo(() => getFormStrings(lang), [lang]);

  const untitled = t("fields.untitled");
  const optionUntitled = t("fields.optionUntitled");
  const form: PublicFormDefinition = useMemo(
    () => ({
      slug: slug || "preview",
      name: name.trim() || untitled,
      fields: toPreviewFields(fields, { untitled, optionUntitled }),
      theme,
      contactRule,
    }),
    [slug, name, fields, theme, contactRule, untitled, optionUntitled]
  );

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">{t("appearance.preview")}</p>
        <p className="ml-auto truncate text-[11px] text-muted-foreground">{t("appearance.previewNote")}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <PublicFormRenderer form={form} strings={strings} lang={lang} mode="preview" defaultCountry={country} />
      </div>
    </div>
  );
}
