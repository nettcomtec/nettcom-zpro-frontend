"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import api from "@/lib/api";

function GoogleCallbackContent() {
  const t = useTranslations("authGoogleCallback");
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage(t("processing"));
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    if (error) {
      setStatus("error");
      setMessage(t("errorAuth") + error);
      setTimeout(() => router.push("/configuracoes/google-calendar"), 2000);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage(t("errorNoCode"));
      setTimeout(() => router.push("/configuracoes/google-calendar"), 2000);
      return;
    }

    if (!state) {
      setStatus("error");
      setMessage(t("errorNoState"));
      setTimeout(() => router.push("/configuracoes/google-calendar"), 2000);
      return;
    }

    handleCallback(code, state);
  }, [searchParams]);

  const handleCallback = async (code: string, state: string) => {
    // Phase 16 — Usa o `api` axios (com interceptor de refresh automatico do JWT).
    // Antes usava fetch() direto, que nao faz refresh quando o token expira durante
    // o tempo que o user passa autorizando no Google.

    try {
      // 1. Buscar todas as configurações para encontrar pelo nome (state)
      const configsRes = await api.get<{ configs: any[] } | any[]>("/google-calendar-configs");
      const configsData = configsRes.data;
      const configs = (configsData as any)?.configs || configsData || [];

      if (!configs.length) {
        throw new Error(t("errorNoConfigs"));
      }

      const currentConfig = configs.find(
        (c: { name: string }) => c.name === state
      );

      if (!currentConfig) {
        throw new Error(t("errorConfigNotFound") + state);
      }

      // 2. Trocar código por tokens
      // Phase 16 — clientId/secret podem vir vazios (modo "app da plataforma") —
      // backend resolve via AppGoogle/hardcoded.
      const tokenRes = await api.post<{ accessToken: string; refreshToken: string }>(
        "/google-calendar/auth/token",
        {
          code,
          clientId: currentConfig.googleClientId || "",
          clientSecret: currentConfig.googleClientSecret || "",
        }
      );
      const tokenData = tokenRes.data;

      if (!tokenData.accessToken || !tokenData.refreshToken) {
        throw new Error(t("errorInvalidTokens"));
      }

      // 3. Atualizar configuração com os tokens
      await api.put(`/google-calendar-configs/${currentConfig.id}`, {
        name: currentConfig.name,
        googleClientId: currentConfig.googleClientId || "",
        googleClientSecret: currentConfig.googleClientSecret || "",
        googleAccessToken: tokenData.accessToken,
        googleRefreshToken: tokenData.refreshToken,
        isActive: true,
      });

      setStatus("success");
      setMessage(t("successAuth"));
      const isPopup = !!(window.opener && !window.opener.closed);
      if (isPopup) {
        try {
          window.opener.postMessage(
            {
              type: "OAUTH_COMPLETE_CALENDAR",
              status: "success",
              configId: currentConfig.id,
              configName: currentConfig.name,
            },
            window.location.origin
          );
        } catch {}
        setTimeout(() => window.close(), 800);
      } else {
        setTimeout(() => router.push("/configuracoes/google-calendar"), 2000);
      }
    } catch (err: unknown) {
      setStatus("error");
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage(t("errorProcess") + errMsg);
      const isPopup = !!(window.opener && !window.opener.closed);
      if (isPopup) {
        try {
          window.opener.postMessage(
            {
              type: "OAUTH_COMPLETE_CALENDAR",
              status: "error",
              message: errMsg,
            },
            window.location.origin
          );
        } catch {}
        setTimeout(() => window.close(), 1500);
      } else {
        setTimeout(() => router.push("/configuracoes/google-calendar"), 3000);
      }
    }
  };

  return (
    <>
      {status === "loading" && (
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      )}
      {status === "success" && (
        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
      )}
      {status === "error" && (
        <XCircle className="h-12 w-12 text-red-500 mb-4" />
      )}
      <p className="text-sm text-muted-foreground">{message}</p>
      {(status === "success" || status === "error") && (
        <p className="text-xs text-muted-foreground mt-2">
          {t("redirecting")}
        </p>
      )}
    </>
  );
}

export default function GoogleCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Suspense
            fallback={
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            }
          >
            <GoogleCallbackContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
