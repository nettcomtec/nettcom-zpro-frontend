"use client";

import * as React from "react";
import { PhoneInput } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";
import {
  FORM_LIMITS,
  type FormAnswerInput,
  type FormFieldErrorCode,
  type FormStrings,
  type PublicFormField,
} from "@/lib/forms";
import type { FormExtraStrings, FormLang } from "@/lib/form-strings";

/*
 * Um campo do formulário público. Controles NATIVOS (lista, múltipla escolha, caixa e
 * data), sem portal — só o telefone usa o PhoneInput, com a lista de países montada na
 * raiz do formulário (portalContainer). Textos do administrador (rótulo, ajuda, opções,
 * texto da caixa) entram como texto puro, nunca como HTML.
 */

export interface FormFieldControlProps {
  field: PublicFormField;
  /** id do controle (label for / aria-describedby). */
  id: string;
  value: FormAnswerInput;
  error?: FormFieldErrorCode;
  /** Campo de contato marcado pelo "informe o telefone ou o e-mail" (sem texto próprio). */
  highlight?: boolean;
  strings: FormStrings;
  extra: FormExtraStrings;
  lang: FormLang;
  rtl: boolean;
  defaultCountry: string;
  portalContainer: HTMLElement | null;
  onChange: (field: PublicFormField, value: FormAnswerInput) => void;
}

const intlLocaleOf = (lang: FormLang): string => (lang === "pt" ? "pt-BR" : lang === "zh" ? "zh-CN" : lang);

// Faixa do campo numérico no formato do idioma, sem separador de milhar (quem lê
// "1.000" digitaria 1.000, que o envio entende como 1) e com algarismos latinos.
const formatRangeNumber = (n: number, lang: FormLang): string => {
  try {
    return new Intl.NumberFormat(`${intlLocaleOf(lang)}-u-nu-latn`, {
      useGrouping: false,
      maximumFractionDigits: 6,
    }).format(n);
  } catch {
    return String(n);
  }
};

const rangeHintOf = (field: PublicFormField, lang: FormLang): string | null => {
  if (field.type !== "number") return null;
  const hasMin = typeof field.min === "number" && Number.isFinite(field.min);
  const hasMax = typeof field.max === "number" && Number.isFinite(field.max);
  if (hasMin && hasMax) return `${formatRangeNumber(field.min as number, lang)} – ${formatRangeNumber(field.max as number, lang)}`;
  if (hasMin) return `≥ ${formatRangeNumber(field.min as number, lang)}`;
  if (hasMax) return `≤ ${formatRangeNumber(field.max as number, lang)}`;
  return null;
};

export function fieldErrorText(
  field: PublicFormField,
  code: FormFieldErrorCode | string,
  strings: FormStrings,
  extra: FormExtraStrings
): string {
  switch (code) {
    case "required":
      if (field.type === "select") return strings.chooseOne;
      if (field.type === "multiselect") return strings.chooseAtLeastOne;
      if (field.type === "checkbox") return strings.mustAccept;
      return strings.required;
    case "tooLong":
      return strings.tooLong;
    case "invalidEmail":
      return strings.invalidEmail;
    case "invalidPhone":
      return strings.invalidPhone;
    case "invalidNumber":
      return strings.invalidNumber;
    case "outOfRange":
      return strings.outOfRange;
    case "invalidDate":
      return strings.invalidDate;
    case "invalidOption":
      return strings.invalidOption;
    case "mustAccept":
      return strings.mustAccept;
    default:
      return extra.invalidValue;
  }
}

const textValue = (value: FormAnswerInput): string =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

const listValue = (value: FormAnswerInput): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function RequiredMark({ required, strings }: { required: boolean; strings: FormStrings }) {
  return required ? (
    <span className="fr-error" aria-hidden="true">
      {" *"}
    </span>
  ) : (
    <span className="fr-muted font-normal"> {strings.optional}</span>
  );
}

// Telefone: o PhoneInput não recebe id nem atributos de acessibilidade no campo
// interno, então eles entram no <input type="tel"> depois de montar (o React não
// gerencia esses atributos ali, então não os desfaz).
function PhoneControl({
  id,
  value,
  invalid,
  describedBy,
  required,
  placeholder,
  strings,
  extra,
  lang,
  defaultCountry,
  portalContainer,
  onValue,
}: {
  id: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  required: boolean;
  placeholder?: string;
  strings: FormStrings;
  extra: FormExtraStrings;
  lang: FormLang;
  defaultCountry: string;
  portalContainer: HTMLElement | null;
  onValue: (value: string) => void;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const input = wrapRef.current?.querySelector<HTMLInputElement>('input[type="tel"]');
    if (!input) return;
    input.id = id;
    input.setAttribute("autocomplete", "tel");
    if (describedBy) input.setAttribute("aria-describedby", describedBy);
    else input.removeAttribute("aria-describedby");
    if (invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    if (required) input.setAttribute("aria-required", "true");
    else input.removeAttribute("aria-required");
  });

  const labels = React.useMemo(
    () => ({
      searchPlaceholder: strings.phoneSearch,
      noResults: strings.phoneNoResults,
      asTyped: extra.phoneAsTyped,
      countryLabel: extra.phoneCountryLabel,
    }),
    [strings.phoneSearch, strings.phoneNoResults, extra.phoneAsTyped, extra.phoneCountryLabel]
  );

  return (
    // Número de telefone é sempre da esquerda para a direita, inclusive em árabe.
    <div ref={wrapRef} dir="ltr">
      <PhoneInput
        value={value}
        onChange={onValue}
        defaultCountry={defaultCountry}
        labels={labels}
        locale={lang}
        portalContainer={portalContainer}
        placeholder={placeholder}
        className={cn("h-10", invalid && "fr-phone-invalid")}
      />
    </div>
  );
}

export function FormFieldControl({
  field,
  id,
  value,
  error,
  highlight = false,
  strings,
  extra,
  lang,
  rtl,
  defaultCountry,
  portalContainer,
  onChange,
}: FormFieldControlProps) {
  const invalid = Boolean(error) || highlight;
  const required = field.required === true;
  const rangeHint = rangeHintOf(field, lang);
  const helpId = field.helpText ? `${id}-help` : undefined;
  const hintId = rangeHint ? `${id}-range` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, hintId, errorId].filter(Boolean).join(" ") || undefined;
  const ariaInvalid = invalid ? true : undefined;
  const ariaRequired = required ? true : undefined;

  const set = (next: FormAnswerInput) => onChange(field, next);

  const help = (
    <>
      {rangeHint ? (
        <p id={hintId} className="fr-muted mt-1.5 text-xs leading-snug" dir="ltr">
          {rangeHint}
        </p>
      ) : null}
      {field.helpText ? (
        <p id={helpId} className="fr-muted mt-1.5 whitespace-pre-line break-words text-xs leading-snug">
          {field.helpText}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="fr-error mt-1.5 text-xs font-medium leading-snug">
          {fieldErrorText(field, error, strings, extra)}
        </p>
      ) : null}
    </>
  );

  const label = (
    <label htmlFor={id} className="fr-label mb-1.5 block break-words text-sm font-medium leading-snug">
      {field.label}
      <RequiredMark required={required} strings={strings} />
    </label>
  );

  if (field.type === "multiselect") {
    const selected = listValue(value);
    const options = field.options || [];
    const toggle = (optionId: string) => {
      const has = selected.includes(optionId);
      // Mantém a ordem das opções (o que o servidor grava e mostra no cartão).
      const next = options.map((o) => o.id).filter((oid) => (oid === optionId ? !has : selected.includes(oid)));
      set(next);
    };
    return (
      <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={describedBy}>
        <legend className="fr-label mb-1.5 block break-words p-0 text-sm font-medium leading-snug">
          {field.label}
          <RequiredMark required={required} strings={strings} />
        </legend>
        <div className="space-y-2">
          {options.map((option, index) => {
            const optionId = `${id}-o${index}`;
            return (
              <label key={`${option.id}:${index}`} htmlFor={optionId} className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                <input
                  id={optionId}
                  type="checkbox"
                  className="fr-check"
                  name={field.key}
                  value={option.id}
                  checked={selected.includes(option.id)}
                  onChange={() => toggle(option.id)}
                  aria-invalid={ariaInvalid}
                />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            );
          })}
        </div>
        {help}
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    const checked = value === true;
    const boxText = field.checkboxText || "";
    const headingId = boxText ? `${id}-heading` : undefined;
    return (
      <div role={boxText ? "group" : undefined} aria-labelledby={headingId}>
        {boxText ? (
          <p id={headingId} className="fr-label mb-1.5 break-words text-sm font-medium leading-snug">
            {field.label}
            <RequiredMark required={required} strings={strings} />
          </p>
        ) : null}
        <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
          <input
            id={id}
            type="checkbox"
            className="fr-check"
            name={field.key}
            checked={checked}
            onChange={(e) => set(e.target.checked)}
            aria-required={ariaRequired}
            aria-invalid={ariaInvalid}
            aria-describedby={describedBy}
          />
          <span className="min-w-0 whitespace-pre-line break-words">
            {boxText || field.label}
            {!boxText ? <RequiredMark required={required} strings={strings} /> : null}
          </span>
        </label>
        {help}
      </div>
    );
  }

  let control: React.ReactNode;
  if (field.type === "phone") {
    control = (
      <PhoneControl
        id={id}
        value={textValue(value)}
        invalid={invalid}
        describedBy={describedBy}
        required={required}
        placeholder={field.placeholder}
        strings={strings}
        extra={extra}
        lang={lang}
        defaultCountry={defaultCountry}
        portalContainer={portalContainer}
        onValue={(next) => set(next)}
      />
    );
  } else if (field.type === "textarea") {
    control = (
      <textarea
        id={id}
        name={field.key}
        className="fr-control"
        rows={4}
        value={textValue(value)}
        onChange={(e) => set(e.target.value)}
        placeholder={field.placeholder}
        maxLength={field.maxLength || FORM_LIMITS.textareaMax}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy}
      />
    );
  } else if (field.type === "select") {
    control = (
      <select
        id={id}
        name={field.key}
        className="fr-control"
        value={textValue(value)}
        onChange={(e) => set(e.target.value)}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy}
      >
        <option value="">{field.placeholder || strings.selectPlaceholder}</option>
        {(field.options || []).map((option, index) => (
          <option key={`${option.id}:${index}`} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "date") {
    control = (
      <input
        id={id}
        name={field.key}
        type="date"
        className="fr-control"
        value={textValue(value)}
        onChange={(e) => set(e.target.value)}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy}
      />
    );
  } else if (field.type === "email") {
    control = (
      <input
        id={id}
        name={field.key}
        type="email"
        inputMode="email"
        autoComplete="email"
        dir={rtl ? "ltr" : undefined}
        className="fr-control"
        value={textValue(value)}
        onChange={(e) => set(e.target.value)}
        placeholder={field.placeholder}
        maxLength={FORM_LIMITS.emailMax}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy}
      />
    );
  } else if (field.type === "number") {
    // Texto com teclado numérico: o <input type="number"> devolve "" para "1,5" em parte
    // dos navegadores e a resposta sumiria calada. A validação aceita vírgula. Mínimo
    // negativo usa o teclado comum (o numérico do iPhone não tem o sinal de menos).
    const negativeAllowed = typeof field.min === "number" && field.min < 0;
    control = (
      <input
        id={id}
        name={field.key}
        type="text"
        inputMode={negativeAllowed ? "text" : "decimal"}
        className="fr-control"
        value={textValue(value)}
        onChange={(e) => set(e.target.value)}
        placeholder={field.placeholder}
        maxLength={FORM_LIMITS.textMax}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy}
      />
    );
  } else {
    control = (
      <input
        id={id}
        name={field.key}
        type="text"
        className="fr-control"
        value={textValue(value)}
        onChange={(e) => set(e.target.value)}
        placeholder={field.placeholder}
        maxLength={field.maxLength || FORM_LIMITS.textMax}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy}
      />
    );
  }

  return (
    <div>
      {label}
      {control}
      {help}
    </div>
  );
}

export default FormFieldControl;
