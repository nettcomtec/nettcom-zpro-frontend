"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { NextIntlClientProvider } from "next-intl";
import { MotionConfig } from "framer-motion";
import { defaultLocale, type Locale, locales } from "./config";
import { getMessages } from "./get-messages";

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: defaultLocale,
  setLocale: () => {},
});

export function useLocale() {
  return useContext(LocaleContext);
}

interface LocaleProviderProps {
  children: React.ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [messages, setMessages] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);

  const loadMessages = useCallback(async (loc: Locale) => {
    const msgs = await getMessages(loc);
    setMessages(msgs);
    setReady(true);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("language") as Locale | null;
    const initial = stored && locales.includes(stored) ? stored : defaultLocale;
    setLocaleState(initial);
    loadMessages(initial);
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SET_LOCALE", locale: initial });
    }
  }, [loadMessages]);

  // Mantém o atributo lang do <html> sincronizado com o idioma ativo (a11y/leitores de tela).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (newLocale: Locale) => {
      localStorage.setItem("language", newLocale);

      const label =
        (messages as Record<string, unknown> & { layoutSidebar?: { loadingLanguage?: string } })
          ?.layoutSidebar?.loadingLanguage ?? "Carregando nova linguagem...";

      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:var(--background);";
      overlay.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;color:var(--muted-foreground)"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>' +
        `<span style="font-size:14px;color:var(--muted-foreground)">${label}</span>` +
        "</div>" +
        "<style>@keyframes spin{to{transform:rotate(360deg)}}</style>";
      document.body.appendChild(overlay);

      setTimeout(() => window.location.reload(), 300);
    },
    [messages]
  );

  if (!ready) return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    // MotionConfig fica aqui (e não no app/layout.tsx) porque o layout raiz é
    // server component; este é o provider client mais alto da árvore.
    // reducedMotion="user" respeita prefers-reduced-motion do sistema em todas
    // as animações framer-motion do app.
    <MotionConfig reducedMotion="user">
      <LocaleContext.Provider value={{ locale, setLocale }}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </LocaleContext.Provider>
    </MotionConfig>
  );
}
