"use client";

import React, { useState, useEffect, lazy, Suspense } from "react";
import { useTranslations } from "next-intl";
import { fetchLoginVariantNovoPublic } from "@/services/superadmin";
import { Skeleton } from "@/components/ui/skeleton";
import { isNativeApp, getNativePlugin } from "@/lib/native";
import api from "@/lib/api";

// Controles exclusivos do app nativo (PLANO_APP_MOBILE §6.2): botão "Trocar
// servidor" (volta à tela nativa de configuração) + aviso quando o backend
// conectado não tem as rotas do app (capability-check). No navegador comum
// isNativeApp() é false e nada renderiza.
function NativeAppControls() {
  const t = useTranslations("login");
  const [visible, setVisible] = useState(false);
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    setVisible(true);
    api.get("/mobile/capabilities").catch((e) => {
      if (e?.response?.status === 404) setOutdated(true);
    });
  }, []);

  if (!visible) return null;

  const handleChangeServer = async () => {
    try {
      await getNativePlugin("ZproServer")?.clearServerUrl();
    } catch { /* plugin ausente: ignora */ }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-1.5 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {outdated && (
        <p className="pointer-events-auto max-w-md rounded-md bg-amber-500/15 px-3 py-1.5 text-center text-xs text-amber-600 dark:text-amber-400">
          {t("appOutdatedBackend")}
        </p>
      )}
      <button
        type="button"
        onClick={handleChangeServer}
        className="pointer-events-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t("changeServer")}
      </button>
    </div>
  );
}

// Variants carregadas dinamicamente para não aumentar o bundle inicial
const variants: Record<string, React.LazyExoticComponent<() => React.ReactElement>> = {
  "variant-1": lazy(() => import("@/components/login/login-variant-1")),
  "variant-2": lazy(() => import("@/components/login/login-variant-2")),
  "variant-3": lazy(() => import("@/components/login/login-variant-3")),
  "variant-4": lazy(() => import("@/components/login/login-variant-4")),
  "variant-5": lazy(() => import("@/components/login/login-variant-5")),
  "variant-6": lazy(() => import("@/components/login/login-variant-6")),
  "variant-7": lazy(() => import("@/components/login/login-variant-7")),
  "variant-8": lazy(() => import("@/components/login/login-variant-8")),
};

// Skeleton do form de login: mesma aparência durante o fetch da variante e o
// lazy-load do componente — evita duplo spinner/"pulo" no cold start
function LoginFormSkeleton() {
  return (
    <div aria-busy="true" className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-4">
        <div className="rounded-xl bg-card text-card-foreground shadow-2xl shadow-black/5 p-6">
          <div className="flex flex-col items-center gap-2 pb-6 text-center">
            <Skeleton className="h-14 w-40 max-w-full" />
            <Skeleton className="h-6 w-44 max-w-full" />
            <Skeleton className="h-4 w-60 max-w-full" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [variant, setVariant] = useState<string | null>(null);
  const [showSideText, setShowSideText] = useState<boolean>(true);
  const [showRegister, setShowRegister] = useState<boolean>(true);
  const [showMasterKey, setShowMasterKey] = useState<boolean>(true);

  useEffect(() => {
    const cached = typeof window !== "undefined" ? localStorage.getItem("loginVariantNovo") : null;
    if (cached && variants[cached]) {
      setVariant(cached);
      // Inicializa botões a partir do cache para evitar flash antes da API responder
      setShowRegister(localStorage.getItem("loginShowRegisterButton") !== "0");
      setShowMasterKey(localStorage.getItem("loginShowMasterKeyButton") !== "0");
    }

    fetchLoginVariantNovoPublic()
      .then(({ data }) => {
        const v = data?.variant ?? "variant-1";
        const st = data?.showSideText !== false;
        const srb = data?.showRegisterButton !== false;
        const smkb = data?.showMasterKeyButton !== false;
        if (variants[v]) {
          localStorage.setItem("loginVariantNovo", v);
          localStorage.setItem("loginSideText", st ? "1" : "0");
          localStorage.setItem("loginShowRegisterButton", srb ? "1" : "0");
          localStorage.setItem("loginShowMasterKeyButton", smkb ? "1" : "0");
          setVariant(v);
          setShowSideText(st);
          setShowRegister(srb);
          setShowMasterKey(smkb);
        }
      })
      .catch(() => {
        if (!cached) setVariant("variant-1");
      });
  }, []);

  if (!variant) {
    return <LoginFormSkeleton />;
  }

  const VariantComponent = variants[variant];

  return (
    <>
      <Suspense fallback={<LoginFormSkeleton />}>
        <VariantComponent key={`${variant}-${showSideText}-${showRegister}-${showMasterKey}`} />
      </Suspense>
      <NativeAppControls />
    </>
  );
}
