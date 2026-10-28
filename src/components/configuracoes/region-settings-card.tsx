"use client";

import React, { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { HelpCircle, Languages, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { localeNames, type Locale } from "@/i18n/config";
import { useRegion } from "@/hooks/use-region";
import {
  REGION_LANGUAGES, countryName, countryOptions, currencyName, currencyOptions,
  defaultCurrencyFor, normalizeSearch,
} from "@/lib/region";
import { REGION_APPLY_ACTION_KEY, REGION_SETTING_KEYS } from "@/lib/settings-catalog";

/**
 * Card "Região e idioma" de /configuracoes/geral: país, moeda e idioma das mensagens
 * ao cliente da empresa, mais a ação "aplicar textos padrão no idioma".
 *
 * Só RENDERIZA as linhas: o valor de cada campo vem do `getValue` da página e toda
 * troca vai para o `changed` dela (`onChange`), então salvar, descartar, barra de
 * pendências e guard de saída funcionam como nos outros campos. `""` = herdar o
 * padrão geral (o save manda `""` e o backend grava NULL).
 *
 * O que é "herdado" vem da Região do store (colunas próprias + padrão geral), que a
 * página atualiza depois de carregar e depois de salvar.
 */

const INHERIT = "__inherit__";
const ROW_CLASS =
  "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40 rounded-sm transition-colors duration-500";
const ROW_HIGHLIGHT_CLASS = "bg-yellow-100/70 dark:bg-yellow-800/25";
const NOTE_CLASS =
  "js-setting-hint text-xs text-muted-foreground ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50";

/** Nome do idioma no próprio idioma ("Español"), como no seletor de idioma da tela. */
export function regionLanguageName(lang: string | null | undefined): string {
  if (!lang) return "";
  return localeNames[lang as Locale] || lang;
}

function InfoTip({ text, label }: { text: string; label: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" collisionPadding={16} className="max-w-[18rem] whitespace-normal leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface RegionSettingsCardProps {
  /** Valor atual do campo (pendente ou gravado), mesma função da página. */
  getValue: (key: string) => string;
  /** Marca a troca como pendente no `changed` da página (não salva sozinho). */
  onChange: (key: string, value: string) => void;
  highlightedKey: string | null;
  /** Idioma trocado e ainda não salvo: o "aplicar" usa o idioma GRAVADO, então espera o save. */
  languagePending: boolean;
  applying: boolean;
  onApplyDefaults: () => void;
}

export function RegionSettingsCard({
  getValue,
  onChange,
  highlightedKey,
  languagePending,
  applying,
  onApplyDefaults,
}: RegionSettingsCardProps) {
  const tr = useTranslations("regionSettings");
  const uiLocale = useLocale();
  const { region } = useRegion();

  const countryKey = REGION_SETTING_KEYS.country;
  const currencyKey = REGION_SETTING_KEYS.currency;
  const languageKey = REGION_SETTING_KEYS.language;

  const countryValue = getValue(countryKey);
  const currencyValue = getValue(currencyKey);
  const languageValue = getValue(languageKey);

  // O que vale quando o campo fica em "Usar o padrão geral": sem valor próprio
  // GRAVADO, a efetiva já é a herdada; com valor próprio (e troca pendente para
  // herdar), o melhor palpite é o padrão geral.
  const inheritedCountry = region.own.regionCountry == null ? region.country : region.defaults.country;
  // Padrão geral SEM moeda: a herdada segue o país que vai valer (o do formulário,
  // mesmo antes de salvar), como no backend. Sem `has` (backend sem o campo): como antes.
  const inheritedCurrency = region.defaults.has
    ? region.defaults.has.currency
      ? region.defaults.currency
      : defaultCurrencyFor(countryValue || inheritedCountry)
    : region.own.regionCurrency == null
      ? region.currency
      : region.defaults.currency;
  const inheritedLanguage = region.own.regionLanguage == null ? region.language : region.defaults.language;

  const currencyLabel = (code: string) => `${currencyName(code, uiLocale)} (${code})`;

  // Busca sem acento: o texto normalizado vai no `description` (que a busca do
  // SearchableSelect também olha) e o `renderOption` mostra só o nome.
  const countrySelectOptions = useMemo<SearchableSelectOption[]>(() => {
    const list: SearchableSelectOption[] = [
      { value: INHERIT, label: tr("useDefault"), description: normalizeSearch(tr("useDefault")) },
      ...countryOptions(uiLocale).map((c) => ({
        value: c.iso,
        label: c.name,
        description: `${normalizeSearch(c.name)} ${c.iso.toLowerCase()} +${c.dial}`,
      })),
    ];
    return list;
  }, [uiLocale, tr]);

  const currencySelectOptions = useMemo<SearchableSelectOption[]>(() => {
    const list: SearchableSelectOption[] = [
      { value: INHERIT, label: tr("useDefault"), description: normalizeSearch(tr("useDefault")) },
      ...currencyOptions(uiLocale).map((c) => ({
        value: c.code,
        label: `${c.name} (${c.code})`,
        description: `${normalizeSearch(c.name)} ${c.code.toLowerCase()}`,
      })),
    ];
    return list;
  }, [uiLocale, tr]);

  // Valor gravado fora da lista (moeda que o navegador não conhece): continua visível.
  const withCurrent = (options: SearchableSelectOption[], value: string) =>
    value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;

  const renderPlainOption = (option: SearchableSelectOption) => (
    <div className="flex-1 min-w-0 text-left">
      <div className="truncate">{option.label}</div>
    </div>
  );

  // Moeda sugerida: país próprio escolhido + moeda herdada que não é a do país.
  // Só sugere (botão); nada é gravado sem o "Salvar".
  const suggestedCurrency =
    countryValue && !currencyValue ? defaultCurrencyFor(countryValue) : null;
  const showCurrencySuggestion = !!suggestedCurrency && suggestedCurrency !== inheritedCurrency;

  const savedLanguageName = regionLanguageName(region.language);

  const rowClass = (key: string) => cn(ROW_CLASS, highlightedKey === key && ROW_HIGHLIGHT_CLASS);

  return (
    <div>
      <p id={`note-${countryKey}`} className={cn(NOTE_CLASS, "mt-1 mb-3")}>
        {tr("note")}
      </p>

      {/* País */}
      <div id={`row-${countryKey}`} className={rowClass(countryKey)}>
        <div className="flex-1 min-w-0 sm:pr-4">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium break-words">{tr("countryLabel")}</Label>
            <InfoTip text={tr("countryTooltip")} label={tr("moreInfo")} />
          </div>
          <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{tr("countryDesc")}</p>
          {!countryValue && (
            <p className="text-xs text-muted-foreground mt-1 break-words">
              {tr("inheritedFrom", { value: countryName(inheritedCountry, uiLocale) })}
            </p>
          )}
        </div>
        <div className="w-full sm:w-[260px] min-w-0 shrink-0">
          <SearchableSelect
            options={withCurrent(countrySelectOptions, countryValue)}
            value={countryValue || INHERIT}
            onValueChange={(v) => onChange(countryKey, !v || v === INHERIT ? "" : v)}
            renderOption={renderPlainOption}
            alwaysShowSearch
          />
        </div>
      </div>

      {/* Moeda */}
      <div id={`row-${currencyKey}`} className={rowClass(currencyKey)}>
        <div className="flex-1 min-w-0 sm:pr-4">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium break-words">{tr("currencyLabel")}</Label>
            <InfoTip text={tr("currencyTooltip")} label={tr("moreInfo")} />
          </div>
          <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{tr("currencyDesc")}</p>
          {!currencyValue && (
            <p className="text-xs text-muted-foreground mt-1 break-words">
              {tr("inheritedFrom", { value: currencyLabel(inheritedCurrency) })}
            </p>
          )}
          {showCurrencySuggestion && suggestedCurrency && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-200/90">
              <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 break-words">
                {tr("currencySuggestion", {
                  country: countryName(countryValue, uiLocale),
                  currency: currencyLabel(suggestedCurrency),
                })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange(currencyKey, suggestedCurrency)}
              >
                {tr("currencySuggestionUse")}
              </Button>
            </div>
          )}
        </div>
        <div className="w-full sm:w-[260px] min-w-0 shrink-0">
          <SearchableSelect
            options={withCurrent(currencySelectOptions, currencyValue)}
            value={currencyValue || INHERIT}
            onValueChange={(v) => onChange(currencyKey, !v || v === INHERIT ? "" : v)}
            renderOption={renderPlainOption}
            alwaysShowSearch
          />
        </div>
      </div>
      <p id={`note-${currencyKey}`} className={cn(NOTE_CLASS, "-mt-2 mb-3")}>
        {tr("currencyNotConvertedNote")}
      </p>

      {/* Idioma das mensagens ao cliente */}
      <div id={`row-${languageKey}`} className={rowClass(languageKey)}>
        <div className="flex-1 min-w-0 sm:pr-4">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium break-words">{tr("languageLabel")}</Label>
            <InfoTip text={tr("languageTooltip")} label={tr("moreInfo")} />
          </div>
          <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{tr("languageDesc")}</p>
          {!languageValue && (
            <p className="text-xs text-muted-foreground mt-1 break-words">
              {tr("inheritedFrom", { value: regionLanguageName(inheritedLanguage) })}
            </p>
          )}
        </div>
        <div className="w-full sm:w-[260px] min-w-0 shrink-0">
          <Select
            value={languageValue || INHERIT}
            onValueChange={(v) => onChange(languageKey, v === INHERIT ? "" : v)}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT}>{tr("useDefault")}</SelectItem>
              {REGION_LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>{regionLanguageName(lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p id={`note-${languageKey}`} className={cn(NOTE_CLASS, "-mt-2 mb-3")}>
        {tr("languageNote")}
      </p>

      {/* Aplicar textos padrão no idioma gravado */}
      <div
        id={`row-${REGION_APPLY_ACTION_KEY}`}
        className={cn(rowClass(REGION_APPLY_ACTION_KEY), "last:border-0")}
      >
        <div className="flex-1 min-w-0 sm:pr-4">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium break-words">{tr("applyDefaultsTitle")}</Label>
            <InfoTip text={tr("applyDefaultsTooltip")} label={tr("moreInfo")} />
          </div>
          <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">
            {tr("applyDefaultsDesc", { language: savedLanguageName })}
          </p>
          {languagePending && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 break-words">
              {tr("applyDefaultsSaveFirst")}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onApplyDefaults}
          disabled={applying || languagePending}
          className="w-full sm:w-auto shrink-0"
        >
          {applying ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Languages className="h-4 w-4 mr-2" />
          )}
          <span className="truncate">{tr("applyDefaultsButton")}</span>
        </Button>
      </div>
    </div>
  );
}

export default RegionSettingsCard;
