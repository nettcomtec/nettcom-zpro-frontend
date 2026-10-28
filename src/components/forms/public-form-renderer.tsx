"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  FORM_LIMITS,
  validateFormAnswers,
  type FormAnswerInput,
  type FormContactRule,
  type FormFieldErrorCode,
  type FormStringKey,
  type PublicFormField,
  type PublicFormRendererProps,
} from "@/lib/forms";
import { formLangFromStrings, getFormExtraStrings, isRtlLang, type FormLang } from "@/lib/form-strings";
import { isCountryIso } from "@/lib/region";
import { FormFieldControl } from "@/components/forms/public/form-field-control";
import { PublicFormFrame } from "@/components/forms/public/public-form-frame";
import { normalizePublicFormTheme } from "@/components/forms/public/form-theme";
import { useFormEmbedBridge } from "@/components/forms/public/use-form-embed-bridge";

/*
 * Formulário público desenhado a partir da configuração pública (docs/PLANO_FORMULARIOS
 * _ATENDIMENTO.md §5.8). O MESMO componente serve a página /f/[slug] ("page"/"embed") e
 * a prévia do editor ("preview", que valida mas nunca envia). Não lê rota nem
 * window.location: tudo vem das props.
 *
 * Visual por variáveis próprias na raiz (public/form-theme.ts), nunca pelos tokens do
 * tema do painel. Valida no cliente com a mesma regra do servidor (validateFormAnswers)
 * e só chama o envio sem erro.
 */

export interface PublicFormRendererExtraProps {
  /** Idioma dos textos (direção, nomes de país). Sem ele: o de `strings` (getFormStrings) ou pt. */
  lang?: FormLang;
  /** Aviso geral acima do botão (limite do dia, página vencida, falha de envio...). */
  formError?: string | null;
  /** Como `onSubmit`, mas recebe também o valor da armadilha (hp_website). Com ela, `onSubmit` não é chamado. */
  onSubmitWithTrap?: (answers: Record<string, FormAnswerInput>, trap: string) => void;
}

export type PublicFormRendererAllProps = PublicFormRendererProps & PublicFormRendererExtraProps;

const CONTACT_MESSAGE: Record<FormContactRule, FormStringKey> = {
  phone: "contactRequiredPhone",
  email: "contactRequiredEmail",
  phoneOrEmail: "contactRequiredAny",
};

const cssEscape = (value: string): string => {
  try {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  } catch {
    // segue para o recorte simples
  }
  return value.replace(/[^A-Za-z0-9_-]/g, "");
};

export function PublicFormRenderer(props: PublicFormRendererAllProps) {
  const {
    form,
    strings,
    mode,
    defaultCountry,
    hiddenValues,
    serverErrors,
    submitting = false,
    onSubmit,
    lang: langProp,
    formError,
    onSubmitWithTrap,
  } = props;

  const lang: FormLang = langProp ?? formLangFromStrings(strings) ?? "pt";
  const extra = getFormExtraStrings(lang);
  const rtl = isRtlLang(lang);
  const theme = React.useMemo(() => normalizePublicFormTheme(form.theme), [form.theme]);
  const fields: PublicFormField[] = React.useMemo(() => (Array.isArray(form.fields) ? form.fields : []), [form.fields]);
  const contactRule = form.contactRule;
  const country = isCountryIso(defaultCountry) ? defaultCountry.toUpperCase() : "BR";

  const [values, setValues] = React.useState<Record<string, FormAnswerInput>>({});
  const [clientErrors, setClientErrors] = React.useState<Record<string, FormFieldErrorCode>>({});
  const [contactMissing, setContactMissing] = React.useState(false);
  // Erro vindo do servidor some quando o campo é editado (até o próximo envio).
  const [dismissed, setDismissed] = React.useState<Record<string, true>>({});
  const [trap, setTrap] = React.useState("");
  const [rootEl, setRootEl] = React.useState<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const fieldsRef = React.useRef(fields);
  fieldsRef.current = fields;

  const rawId = React.useId();
  const baseId = React.useMemo(() => `frf${rawId.replace(/[^A-Za-z0-9_-]/g, "")}`, [rawId]);

  useFormEmbedBridge(form.slug, mode === "embed");

  React.useEffect(() => {
    setDismissed({});
  }, [serverErrors]);

  const setRoot = React.useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
    setRootEl(el);
  }, []);

  // Foco no 1º campo com problema, depois do render (o leitor de tela já lê o erro).
  const focusFirst = React.useCallback((keys: Set<string>) => {
    window.setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      for (const field of fieldsRef.current) {
        if (field.type === "hidden" || !keys.has(field.key)) continue;
        const box = root.querySelector<HTMLElement>(`[data-fr-key="${cssEscape(field.key)}"]`);
        const target = box?.querySelector<HTMLElement>("input, select, textarea");
        if (!target) continue;
        try {
          target.focus();
        } catch {
          // campo saiu da tela no meio do caminho
        }
        return;
      }
    }, 0);
  }, []);

  React.useEffect(() => {
    if (!serverErrors) return;
    const keys = Object.keys(serverErrors);
    if (keys.length > 0) focusFirst(new Set(keys));
  }, [serverErrors, focusFirst]);

  const identityKeys = React.useMemo(() => {
    const set = new Set<string>();
    fields.forEach((field) => {
      if (field.identity === "phone" && contactRule !== "email") set.add(field.key);
      if (field.identity === "email" && contactRule !== "phone") set.add(field.key);
    });
    return set;
  }, [fields, contactRule]);

  const handleChange = React.useCallback((field: PublicFormField, value: FormAnswerInput) => {
    setValues((prev) => ({ ...prev, [field.key]: value }));
    setClientErrors((prev) => {
      if (!(field.key in prev)) return prev;
      const next = { ...prev };
      delete next[field.key];
      return next;
    });
    setDismissed((prev) => (prev[field.key] ? prev : { ...prev, [field.key]: true }));
    if (field.identity) setContactMissing(false);
  }, []);

  const collectAnswers = (): Record<string, FormAnswerInput> => {
    const answers: Record<string, FormAnswerInput> = {};
    fields.forEach((field) => {
      if (field.type === "hidden") {
        const fromPage = hiddenValues?.[field.key];
        const text = typeof fromPage === "string" && fromPage.trim() ? fromPage : field.hiddenDefault || "";
        answers[field.key] = text.slice(0, FORM_LIMITS.hiddenMax);
        return;
      }
      const value = values[field.key];
      if (field.type === "multiselect") answers[field.key] = Array.isArray(value) ? value : [];
      else if (field.type === "checkbox") answers[field.key] = value === true;
      else answers[field.key] = typeof value === "string" ? value : "";
    });
    return answers;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const answers = collectAnswers();
    const result = validateFormAnswers(fields, answers, contactRule);
    setClientErrors(result.errors);
    setContactMissing(result.contactMissing);
    const errorKeys = Object.keys(result.errors);
    if (errorKeys.length > 0) {
      focusFirst(new Set(errorKeys));
      return;
    }
    if (result.contactMissing) {
      focusFirst(identityKeys);
      return;
    }
    if (mode === "preview") return;
    if (onSubmitWithTrap) onSubmitWithTrap(answers, trap);
    else onSubmit?.(answers);
  };

  const errorFor = (key: string): FormFieldErrorCode | undefined =>
    clientErrors[key] ?? (dismissed[key] ? undefined : serverErrors?.[key]);

  const contactText = contactMissing ? strings[CONTACT_MESSAGE[contactRule] || "contactRequiredAny"] : null;
  const alertText = contactText || formError || null;
  const Heading = mode === "preview" ? "h2" : "h1";
  const title = theme.title || form.name;

  return (
    <PublicFormFrame theme={theme} mode={mode} lang={lang} dir={rtl ? "rtl" : "ltr"} rootRef={setRoot}>
      {theme.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.coverUrl} alt="" className="block max-h-48 w-full object-cover" />
      ) : null}
      <div className="p-5 sm:p-6">
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={theme.logoUrl}
            alt={form.name}
            className="mb-4 h-12 w-auto max-w-[180px] object-contain"
          />
        ) : null}
        <Heading className="break-words text-xl font-semibold leading-tight">{title}</Heading>
        {theme.description ? (
          <p className="fr-muted mt-2 whitespace-pre-line break-words text-sm leading-relaxed">{theme.description}</p>
        ) : null}

        <form noValidate onSubmit={handleSubmit} className="mt-6" aria-busy={submitting || undefined}>
          <div className="fr-fields">
            <div className="fr-grid">
              {fields.map((field, index) => {
                if (field.type === "hidden") return null;
                return (
                  <div
                    key={`${field.key}:${index}`}
                    data-fr-key={field.key}
                    className={field.width === "half" ? "min-w-0" : "fr-span-full min-w-0"}
                  >
                    <FormFieldControl
                      field={field}
                      id={`${baseId}-${index}`}
                      value={values[field.key]}
                      error={errorFor(field.key)}
                      highlight={contactMissing && identityKeys.has(field.key)}
                      strings={strings}
                      extra={extra}
                      lang={lang}
                      rtl={rtl}
                      defaultCountry={country}
                      portalContainer={rootEl}
                      onChange={handleChange}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {mode !== "preview" ? (
            // Armadilha para robôs: fora da tela, fora do Tab e fora do preenchimento automático.
            <div
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", top: 0, width: 1, height: 1, overflow: "hidden" }}
            >
              <input
                type="text"
                name="hp_website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
              />
            </div>
          ) : null}

          {alertText ? (
            <div role="alert" className="fr-alert mt-5 px-3 py-2 text-sm leading-snug">
              {alertText}
            </div>
          ) : null}

          <div className="mt-6">
            <button type="submit" className="fr-submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                  <span>{strings.sending}</span>
                </>
              ) : (
                <span className="min-w-0 break-words">{theme.submitLabel || strings.submit}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </PublicFormFrame>
  );
}

export default PublicFormRenderer;
