"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FieldNote, InfoHint } from "./form-editor-shared";
import { typingFormSlug, type FormSlugState } from "./use-form-slug";

export interface FormSlugFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  state: FormSlugState;
  /** Começo do link, ex.: https://painel.exemplo.com/f/ */
  linkBase: string;
  /** Endereço sugerido a partir do nome (vazio = sem sugestão). */
  suggestion?: string;
  onUseSuggestion?: () => void;
  disabled?: boolean;
}

/** Endereço do formulário (`/f/<endereço>`) com a conferência de disponibilidade. */
export function FormSlugField({
  value,
  onChange,
  onBlur,
  state,
  linkBase,
  suggestion,
  onUseSuggestion,
  disabled,
}: FormSlugFieldProps) {
  const t = useTranslations("formsPage");
  const inputId = useId();
  const showSuggestion = !!suggestion && suggestion !== value && !!onUseSuggestion;

  return (
    <div className="grid gap-1.5 min-w-0">
      <div className="flex items-center gap-1">
        <Label htmlFor={inputId}>{t("share.slug")}</Label>
        <InfoHint text={t("share.slugHint")} />
      </div>
      <div
        className={cn(
          "flex h-9 w-full min-w-0 items-center overflow-hidden rounded-md border border-input bg-transparent text-sm shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
          (state === "taken" || state === "invalid") && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
          disabled && "opacity-50"
        )}
      >
        <span className="flex h-full shrink-0 items-center border-r bg-muted/50 px-2.5 font-mono text-xs text-muted-foreground">
          /f/
        </span>
        <input
          id={inputId}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(typingFormSlug(e.target.value))}
          onBlur={onBlur}
          placeholder={t("share.slugPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          maxLength={80}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>
      <div className="min-h-[1.25rem] text-xs">
        {state === "checking" && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("share.slugChecking")}
          </span>
        )}
        {state === "ok" && (
          <span className="inline-flex items-center gap-1 text-success">
            <Check className="h-3 w-3" />
            {t("share.slugAvailable")}
          </span>
        )}
        {state === "taken" && <FieldNote tone="error">{t("share.slugTaken")}</FieldNote>}
        {state === "invalid" && <FieldNote tone="error">{t("share.slugInvalid")}</FieldNote>}
        {state === "idle" && (
          <span className="block break-all font-mono text-muted-foreground">
            {linkBase}
            {value || "..."}
          </span>
        )}
      </div>
      {showSuggestion && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onUseSuggestion}
            disabled={disabled}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="truncate">{t("share.useSuggestion", { slug: suggestion ?? "" })}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
