"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { PublicFormRenderer } from "@/components/forms/public-form-renderer";
import { PublicFormFrame } from "@/components/forms/public/public-form-frame";
import { normalizePublicFormTheme, safeHttpsUrl } from "@/components/forms/public/form-theme";
import { useFormEmbedBridge } from "@/components/forms/public/use-form-embed-bridge";
import { getPublicForm, submitPublicForm } from "@/services/forms-public";
import { getFormExtraStrings, getFormStrings, isRtlLang, resolveFormLang } from "@/lib/form-strings";
import {
  FORM_EMBED_MESSAGE_REDIRECT,
  FORM_LIMITS,
  FORM_THEME_DEFAULTS,
  isValidFormSlug,
  toInternationalPhone,
  type FormAnswerInput,
  type FormContactRule,
  type FormFieldErrorCode,
  type FormStringKey,
  type PublicFormView,
} from "@/lib/forms";
import { isCountryIso } from "@/lib/region";

/*
 * Página pública do formulário: /f/<endereço> (D2, D13; §5.8 do
 * docs/PLANO_FORMULARIOS_ATENDIMENTO.md). Liberada no middleware sem login, embutível
 * por iframe (?embed=1, cabeçalhos próprios no next.config.ts), sem o service worker e
 * sem o dicionário do painel. Textos ao visitante: lib/form-strings.ts (?lang= →
 * idioma da Região da empresa → pt).
 */

type Phase = "loading" | "unavailable" | "form" | "sent";

const DEFAULT_THEME = normalizePublicFormTheme(FORM_THEME_DEFAULTS);

const CONTACT_KEY: Record<FormContactRule, FormStringKey> = {
  phone: "contactRequiredPhone",
  email: "contactRequiredEmail",
  phoneOrEmail: "contactRequiredAny",
};

// Código na URL (?error=<código>): só os conhecidos viram texto próprio; o resto, o genérico.
const ERROR_PARAM_KEYS: Record<string, FormStringKey> = {
  ERR_FORM_DAILY_LIMIT: "dailyLimit",
  ERR_LIMIT_MAX: "tooMany",
  ERR_FORM_RENDER_EXPIRED: "expired",
  ERR_FORM_EXTERNAL_DISABLED: "externalDisabled",
};

const errorKeyFromParam = (code: string | null, rule: FormContactRule): FormStringKey | null => {
  if (!code || !/^ERR_[A-Z0-9_]{1,60}$/.test(code)) return null;
  if (code === "ERR_FORM_CONTACT_REQUIRED") return CONTACT_KEY[rule] || "contactRequiredAny";
  return ERROR_PARAM_KEYS[code] || "errorGeneric";
};

// Resposta do backend antigo, proxy ou formato inesperado = indisponível (nunca quebra a tela).
const isUsableView = (data: unknown): data is PublicFormView => {
  const view = data as PublicFormView | null;
  return Boolean(
    view &&
      typeof view === "object" &&
      view.form &&
      typeof view.form === "object" &&
      Array.isArray(view.form.fields) &&
      view.renderToken &&
      typeof view.renderToken === "object" &&
      typeof view.renderToken.sig === "string"
  );
};

interface SubmitFailure {
  status: number;
  code: string;
  fields: Record<string, FormFieldErrorCode> | null;
}

// Erro do axios isolado (sem interceptor): status e corpo em err.response.
const readFailure = (err: unknown): SubmitFailure => {
  const source = (err || {}) as { response?: { status?: unknown; data?: unknown }; status?: unknown };
  const status = Number(source.response?.status ?? source.status ?? 0) || 0;
  const data = (source.response?.data ?? null) as { error?: unknown; message?: unknown; details?: { fields?: unknown } } | null;
  const rawCode =
    data && typeof data === "object"
      ? typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : ""
      : "";
  const code = /^[A-Z][A-Z0-9_]{1,63}$/.test(rawCode) ? rawCode : "";
  let fields: Record<string, FormFieldErrorCode> | null = null;
  const rawFields = data && typeof data === "object" ? data.details?.fields : undefined;
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    const out: Record<string, FormFieldErrorCode> = {};
    Object.entries(rawFields as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === "string" && value.length <= 40) out[key] = value as FormFieldErrorCode;
    });
    fields = Object.keys(out).length > 0 ? out : null;
  }
  return { status, code, fields };
};

function PublicFormPage() {
  const params = useParams<{ slug?: string | string[] }>();
  const searchParams = useSearchParams();
  const rawSlug = params?.slug;
  // O endereço é gravado em minúsculas: link digitado ou colado com maiúscula abre o mesmo
  // formulário (o código de embutir conversa com o endereço gravado).
  const slug = String((Array.isArray(rawSlug) ? rawSlug[0] : rawSlug) || "").trim().toLowerCase();
  const embed = searchParams.get("embed") === "1";
  const sentParam = searchParams.get("sent") === "1";
  const errorParam = searchParams.get("error");
  const langParam = searchParams.get("lang");
  const refParam = (searchParams.get("ref") || "").trim().slice(0, 500);

  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<PublicFormView | null>(null);
  const [unavailableKey, setUnavailableKey] = useState<FormStringKey>("unavailableBody");
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, FormFieldErrorCode> | undefined>(undefined);
  const [formErrorKey, setFormErrorKey] = useState<FormStringKey | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  // Quando o código de tempo atual chegou (1ª carga ou renovação depois do 409).
  const viewAtRef = useRef(0);
  const sentHeadingRef = useRef<HTMLHeadingElement | null>(null);
  // Foco no "Enviado" só depois de um envio desta tela (num ?sent=1 aberto direto, ainda
  // mais dentro de iframe, o foco seria tirado da página de quem embute).
  const focusSentRef = useRef(false);

  // Idioma: ?lang → idioma da Região (só com languageConfigured) → pt. Até a configuração
  // chegar a tela é só o carregando.
  const lang = resolveFormLang(langParam, view?.region ?? null);
  const strings = getFormStrings(lang);
  const extra = getFormExtraStrings(lang);
  const dir = isRtlLang(lang) ? "rtl" : "ltr";
  const frameMode = embed ? "embed" : "page";
  const theme = useMemo(() => (view ? normalizePublicFormTheme(view.form.theme) : DEFAULT_THEME), [view]);
  const defaultCountry =
    view?.region && isCountryIso(view.region.country) ? view.region.country.toUpperCase() : "BR";

  // Altura para o código de embutir em todos os estados (carregando, enviado...).
  useFormEmbedBridge(slug, embed);

  // Sem "instalar o app" do painel na página do cliente (o layout já tira o manifest;
  // aqui é a garantia para HTML de outra versão em cache).
  useEffect(() => {
    try {
      document.querySelectorAll('link[rel="manifest"]').forEach((link) => link.parentNode?.removeChild(link));
    } catch {
      // nada a remover
    }
  }, []);

  // O Serwist recarrega toda página quando a conexão volta (reloadOnOnline): aqui isso
  // apagaria o que o visitante já digitou num celular com rede instável. O ouvinte em
  // captura na própria janela roda antes do dele e para o evento só nesta página.
  useEffect(() => {
    const keepAnswers = (event: Event) => event.stopImmediatePropagation();
    window.addEventListener("online", keepAnswers, true);
    return () => window.removeEventListener("online", keepAnswers, true);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!isValidFormSlug(slug)) {
      setPhase(sentParam ? "sent" : "unavailable");
      return () => {
        alive = false;
      };
    }
    (async () => {
      try {
        const data = await getPublicForm(slug);
        if (!alive) return;
        if (!isUsableView(data)) throw new Error("invalid public form view");
        setView(data);
        setFormErrorKey(errorKeyFromParam(errorParam, data.form.contactRule));
        setPhase(sentParam ? "sent" : "form");
      } catch {
        // 404 (indisponível/desativado), 402 (licença em recuperação) e falha de rede
        if (alive) setPhase(sentParam ? "sent" : "unavailable");
      }
    })();
    return () => {
      alive = false;
    };
    // errorParam só vale na 1ª carga (não reabre a busca)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, sentParam]);

  useEffect(() => {
    if (view) viewAtRef.current = Date.now();
  }, [view]);

  useEffect(() => {
    try {
      if (phase === "unavailable") document.title = strings.unavailableTitle;
      else if (view?.form?.name) document.title = view.form.name;
      document.documentElement.lang = lang;
    } catch {
      // documento sem título editável
    }
  }, [phase, view, lang, strings.unavailableTitle]);

  useEffect(() => {
    if (phase !== "sent" || !focusSentRef.current) return;
    focusSentRef.current = false;
    try {
      sentHeadingRef.current?.focus({ preventScroll: true });
    } catch {
      // sem foco programático
    }
  }, [phase]);

  // Campos ocultos: o parâmetro da URL (no iframe, repassado pelo código de embutir) ou o padrão.
  const hiddenValues = useMemo(() => {
    const out: Record<string, string> = {};
    (view?.form.fields || []).forEach((field) => {
      if (field.type !== "hidden") return;
      const fromUrl = field.hiddenParam ? (searchParams.get(field.hiddenParam) || "").trim() : "";
      const value = fromUrl || field.hiddenDefault || "";
      if (value) out[field.key] = value.slice(0, FORM_LIMITS.hiddenMax);
    });
    return out;
  }, [view, searchParams]);

  const goTo = useCallback(
    (url: string) => {
      try {
        // No iframe quem navega é a página-mãe (o código de embutir confere a origem):
        // mudar o _top depois de um envio assíncrono pode ser bloqueado pelo navegador.
        if (embed && window.parent !== window) {
          window.parent.postMessage({ type: FORM_EMBED_MESSAGE_REDIRECT, slug, url }, "*");
          return;
        }
        window.location.assign(url);
      } catch {
        // fica o "Continuar" da tela de enviado
      }
    },
    [embed, slug]
  );

  const handleSubmit = useCallback(
    async (answers: Record<string, FormAnswerInput>, trap: string) => {
      const current = view;
      if (!current || inFlightRef.current) return;
      inFlightRef.current = true;
      setSubmitting(true);
      setFormErrorKey(null);
      setServerErrors(undefined);

      // Tempo mínimo de preenchimento contado desde que o código chegou (o servidor confere o
      // mesmo tempo pelo código): enviar antes guardaria o envio como suspeito, sem abrir o
      // atendimento — inclusive logo depois da renovação do código vencido.
      const minFillMs = Math.min(Math.max(Number(current.minFillSeconds) || 0, 0), 60) * 1000;
      const waitMs = minFillMs > 0 ? viewAtRef.current + minFillMs + 400 - Date.now() : 0;
      if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));

      const payloadAnswers: Record<string, FormAnswerInput> = {};
      current.form.fields.forEach((field) => {
        const value = answers[field.key];
        // Telefone sempre com "+": sem ele o servidor aplicaria o país da empresa e um
        // número estrangeiro de 10–11 dígitos viraria brasileiro.
        if (field.type === "phone") payloadAnswers[field.key] = typeof value === "string" ? toInternationalPhone(value) : "";
        else payloadAnswers[field.key] = value;
      });

      try {
        const res = await submitPublicForm(slug, {
          answers: payloadAnswers,
          renderToken: current.renderToken,
          mode: embed ? "embed" : "page",
          hp_website: trap,
          ...(refParam ? { ref: refParam } : {}),
        });
        if (res && res.ok === false) {
          setFormErrorKey("errorGeneric");
          return;
        }
        const target = safeHttpsUrl(res?.redirectUrl) || safeHttpsUrl(current.form.theme?.redirectUrl);
        setRedirectUrl(target);
        focusSentRef.current = true;
        setPhase("sent");
        if (target) goTo(target);
      } catch (err) {
        const failure = readFailure(err);
        if (failure.status === 400) {
          if (failure.fields) {
            const fieldErrors = failure.fields;
            setServerErrors(fieldErrors);
            const visible = current.form.fields.some((field) => field.type !== "hidden" && Boolean(fieldErrors[field.key]));
            if (!visible) setFormErrorKey("errorGeneric");
          } else if (failure.code === "ERR_FORM_CONTACT_REQUIRED") {
            setFormErrorKey(CONTACT_KEY[current.form.contactRule] || "contactRequiredAny");
          } else {
            setFormErrorKey("errorGeneric");
          }
        } else if (failure.status === 409 && failure.code === "ERR_FORM_RENDER_EXPIRED") {
          // Código da página vencido: busca outro e pede para enviar de novo (sem reenviar sozinho).
          try {
            const fresh = await getPublicForm(slug);
            if (isUsableView(fresh)) setView(fresh);
            setFormErrorKey("expired");
          } catch (refreshErr) {
            const refresh = readFailure(refreshErr);
            if (refresh.status === 404 || refresh.status === 402 || refresh.status === 403) {
              setUnavailableKey("unavailableBody");
              setPhase("unavailable");
            } else {
              setFormErrorKey("errorGeneric");
            }
          }
        } else if (failure.status === 429) {
          setFormErrorKey(failure.code === "ERR_FORM_DAILY_LIMIT" ? "dailyLimit" : "tooMany");
        } else if (failure.status === 403) {
          setUnavailableKey(failure.code === "ERR_FORM_EXTERNAL_DISABLED" ? "externalDisabled" : "unavailableBody");
          setPhase("unavailable");
        } else if (failure.status === 404 || failure.status === 402) {
          setUnavailableKey("unavailableBody");
          setPhase("unavailable");
        } else {
          // 413, 5xx, rede, prazo: o envio pode ser repetido (o servidor reconhece a repetição)
          setFormErrorKey("errorGeneric");
        }
      } finally {
        inFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [view, slug, embed, refParam, goTo]
  );

  if (phase === "loading") {
    return (
      <PublicFormFrame theme={theme} mode={frameMode} lang={lang} dir={dir} card={false}>
        <div
          className={embed ? "flex items-center justify-center py-12" : "flex min-h-[60vh] items-center justify-center"}
          role="status"
        >
          <Loader2 className="fr-muted h-6 w-6 animate-spin" aria-hidden="true" />
          <span className="sr-only">{extra.loading}</span>
        </div>
      </PublicFormFrame>
    );
  }

  const unavailable = (
    <PublicFormFrame theme={theme} mode={frameMode} lang={lang} dir={dir}>
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div className="fr-badge flex h-12 w-12 items-center justify-center rounded-full">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold leading-tight">{strings.unavailableTitle}</h1>
        <p className="fr-muted text-sm leading-relaxed">{strings[unavailableKey]}</p>
      </div>
    </PublicFormFrame>
  );

  if (phase === "unavailable") return unavailable;

  if (phase === "sent") {
    return (
      <PublicFormFrame theme={theme} mode={frameMode} lang={lang} dir={dir}>
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" role="status">
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logoUrl}
              alt={view?.form.name || ""}
              className="mb-1 h-12 w-auto max-w-[180px] object-contain"
            />
          ) : null}
          <div className="fr-badge flex h-12 w-12 items-center justify-center rounded-full">
            <Check className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 ref={sentHeadingRef} tabIndex={-1} className="text-lg font-semibold leading-tight outline-none">
            {strings.sentTitle}
          </h1>
          <p className="fr-muted whitespace-pre-line break-words text-sm leading-relaxed">
            {theme.successMessage || strings.sentBody}
          </p>
          {redirectUrl ? (
            <a href={redirectUrl} target={embed ? "_top" : undefined} rel="noreferrer" className="fr-link text-sm">
              {strings.continue}
            </a>
          ) : null}
        </div>
      </PublicFormFrame>
    );
  }

  if (!view) return unavailable;

  return (
    <PublicFormRenderer
      form={view.form}
      strings={strings}
      mode={embed ? "embed" : "page"}
      lang={lang}
      defaultCountry={defaultCountry}
      hiddenValues={hiddenValues}
      serverErrors={serverErrors}
      submitting={submitting}
      formError={formErrorKey ? strings[formErrorKey] : null}
      onSubmitWithTrap={handleSubmit}
    />
  );
}

export default function PublicFormRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      }
    >
      <PublicFormPage />
    </Suspense>
  );
}
