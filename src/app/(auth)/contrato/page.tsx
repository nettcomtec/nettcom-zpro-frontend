"use client";

import React, { useEffect, useState } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { FileText, Loader2 } from "lucide-react";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { TermsDocRenderer } from "@/components/terms/terms-doc-renderer";
import {
  fetchPublicResellerTerms,
  type PublicResellerTermsResponse,
} from "@/services/reseller-terms";

// PLANO_ACEITE_TERMOS_REVENDA §5.8.5 — página PÚBLICA (sem login) com a versão
// vigente dos termos do revendedor, para o link ser enviado antes da venda.
// Exceção de página nova igual a /termos-de-uso: fora de PlanCapabilities,
// menus, sidebar e PageHelp. Idioma (D31): ?lang= → idioma salvo → navegador
// → português. O texto do contrato é sempre o que o revendedor escreveu; só a
// moldura da tela é traduzida. Provider de mensagens ANINHADO: o `setLocale`
// do LocaleProvider grava a escolha e recarrega a página.

function matchLocale(raw: unknown): Locale | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const list = locales as readonly string[];
  if (list.includes(value)) return value as Locale;
  const prefix = value.split(/[-_]/)[0];
  return list.includes(prefix) ? (prefix as Locale) : null;
}

function resolveContractLang(): Locale {
  try {
    const fromQuery = matchLocale(new URLSearchParams(window.location.search).get("lang"));
    if (fromQuery) return fromQuery;
  } catch { /* ignore */ }
  try {
    const stored = localStorage.getItem("language");
    if (stored && (locales as readonly string[]).includes(stored)) return stored as Locale;
  } catch { /* ignore */ }
  try {
    const candidates = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ];
    for (const candidate of candidates) {
      const found = matchLocale(candidate);
      if (found) return found;
    }
  } catch { /* ignore */ }
  return defaultLocale;
}

function readCachedAppName(): string {
  try {
    const cached = JSON.parse(localStorage.getItem("zpro-branding") || "null") as { appName?: string } | null;
    return typeof cached?.appName === "string" ? cached.appName : "";
  } catch {
    return "";
  }
}

function formatPublishedDate(value: string | undefined, lang: Locale): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return date.toLocaleDateString(lang === "pt" ? "pt-BR" : lang, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date.toLocaleDateString();
  }
}

export default function ContratoPage() {
  const [lang, setLang] = useState<Locale | null>(null);
  const [messages, setMessages] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const resolved = resolveContractLang();
    let cancelled = false;
    getMessages(resolved)
      .then((loaded) => {
        if (cancelled) return;
        setLang(resolved);
        setMessages(loaded);
      })
      .catch(() => {
        if (cancelled) return;
        setLang(resolved);
        setMessages({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!lang || !messages) {
    return (
      <main className="flex w-full max-w-3xl items-center justify-center px-4 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <NextIntlClientProvider locale={lang} messages={messages}>
      <ContratoContent lang={lang} />
    </NextIntlClientProvider>
  );
}

function ContratoContent({ lang }: { lang: Locale }) {
  const t = useTranslations("contratoPage");
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [data, setData] = useState<PublicResellerTermsResponse | null>(null);
  const [appName, setAppName] = useState("");

  useEffect(() => {
    setAppName(readCachedAppName());
    let cancelled = false;
    fetchPublicResellerTerms()
      .then(({ data: payload }) => {
        if (cancelled) return;
        if (payload?.available && Array.isArray(payload.sections) && payload.sections.length > 0) {
          setData(payload);
          setState("ready");
        } else {
          setState("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      })
      .finally(() => {
        // O layout público grava a marca no cache DEPOIS do mount da página na
        // primeira visita — relê quando a busca termina.
        if (!cancelled) setAppName((current) => current || readCachedAppName());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className="w-full max-w-3xl px-4 py-10"
      lang={lang === "pt" ? "pt-BR" : lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <header className="mb-6 border-b pb-6">
        <h1 className="text-2xl font-bold break-words sm:text-3xl">{t("title")}</h1>
        {appName && <p className="mt-2 text-lg font-medium break-words">{appName}</p>}
        {state === "ready" && data?.version != null && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("versionInfo", {
              version: data.version,
              date: formatPublishedDate(data.publishedAt, lang),
            })}
          </p>
        )}
      </header>

      {state === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      )}

      {state === "unavailable" && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <FileText className="h-5 w-5 shrink-0" />
          <p>{t("unavailable")}</p>
        </div>
      )}

      {state === "ready" && data?.sections && <TermsDocRenderer sections={data.sections} />}
    </main>
  );
}
