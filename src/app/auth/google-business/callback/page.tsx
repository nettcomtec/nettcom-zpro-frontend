"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { completeGoogleBusinessAuth, previewGoogleBusinessAuth } from "@/services/google-business";

/**
 * Retorno da conexão do Perfil da Empresa no Google (popup aberto pela aba Google de
 * /avaliacoes). Página PÚBLICA: a instalação pode ter vários domínios e o retorno cai
 * no endereço do servidor, onde a pessoa pode não estar logada — quem autoriza é o
 * `state` assinado e de uso único, conferido pelo backend.
 *
 * Aberta FORA do popup do próprio painel (link mandado a outra pessoa, ou popup aberto
 * por outro site), a página mostra a empresa e só grava com a confirmação (A6): sem isso,
 * quem gerou o link ligaria a conta Google de outra pessoa à empresa dele.
 */

const ERROR_KEYS: Record<string, string> = {
  ERR_GOOGLE_BUSINESS_STATE_INVALID: "errStateInvalid",
  ERR_GOOGLE_BUSINESS_FORBIDDEN: "errForbidden",
  ERR_NO_PERMISSION: "errForbidden",
  ERR_GOOGLE_BUSINESS_FRONTEND_URL: "errFrontendUrl",
  ERR_GOOGLE_BUSINESS_PROXY_OUTDATED: "errProxyOutdated",
  ERR_NO_GOOGLE_APP_CONFIGURED: "errNoGoogleApp",
  ERR_PLATFORM_GOOGLE_APP_DISABLED: "errPlatformAppDisabled",
  ERR_GOOGLE_BUSINESS_UNAVAILABLE: "errUnavailable",
  ERR_GOOGLE_BUSINESS_API: "errGoogleApi",
};

const CLOSE_AFTER_MS = 2000;

type Status = "loading" | "confirm" | "success" | "error";

function notifyOpener(ok: boolean) {
  // Só o resultado, nada sensível: a janela de origem relê o status no servidor.
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "OAUTH_COMPLETE_GOOGLE_BUSINESS", ok }, "*");
    }
  } catch {
    /* janela de origem inacessível */
  }
}

/** Janela de origem do PRÓPRIO painel (mesma origem). Popup aberto por outro site não conta. */
function hasTrustedOpener(): boolean {
  try {
    if (!window.opener || window.opener.closed) return false;
    return window.opener.location.origin === window.location.origin;
  } catch {
    return false;
  }
}

const statusOf = (err: unknown): number | undefined => {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
};

function GoogleBusinessCallbackContent() {
  const t = useTranslations("googleReviews");
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [isPopup, setIsPopup] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const paramsRef = useRef<{ code: string; state: string } | null>(null);
  // O código do Google vale uma vez: o modo estrito do React roda o efeito duas vezes.
  const ranRef = useRef(false);
  const submittedRef = useRef(false);

  const finish = (ok: boolean, text: string) => {
    setStatus(ok ? "success" : "error");
    setMessage(text);
    notifyOpener(ok);
    // Tenta fechar mesmo sem `opener` visível: a tela do Google pode cortar o vínculo
    // com a janela de origem. Aberta direto (não por script), o navegador só ignora.
    setTimeout(() => {
      try {
        window.close();
      } catch {
        /* o navegador não deixou fechar */
      }
    }, CLOSE_AFTER_MS);
  };

  const failWith = (err: unknown) => {
    const key = ERROR_KEYS[getBackendErrorCode(err)];
    if (key) finish(false, t(key));
    else if (statusOf(err) === 429) finish(false, t("callbackTooMany"));
    else finish(false, t("errGeneric"));
  };

  const complete = () => {
    const params = paramsRef.current;
    if (!params || submittedRef.current) return;
    submittedRef.current = true;
    setStatus("loading");
    completeGoogleBusinessAuth(params)
      .then(({ data }) => {
        const count = Math.max(0, Number(data?.locationsCount) || 0);
        finish(true, t("callbackSuccess", { count }));
      })
      .catch(failWith);
  };

  const cancel = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    finish(false, t("callbackCancelled"));
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const googleError = searchParams.get("error");
    let popup = false;
    try {
      popup = !!window.opener && !window.opener.closed;
    } catch {
      popup = false;
    }
    setIsPopup(popup);

    // Tira código e state do endereço (histórico do navegador e cópia do link).
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* navegador sem history */
    }

    if (googleError) {
      finish(false, googleError === "access_denied" ? t("callbackDenied") : t("callbackGoogleError"));
      return;
    }
    if (!code || !state) {
      finish(false, t("callbackMissing"));
      return;
    }
    paramsRef.current = { code, state };

    if (hasTrustedOpener()) {
      complete();
      return;
    }
    // Fora do popup do painel: mostra a empresa e espera a confirmação.
    previewGoogleBusinessAuth(state)
      .then(({ data }) => {
        setCompanyName(typeof data?.tenantName === "string" && data.tenantName.trim() ? data.tenantName.trim() : null);
        setStatus("confirm");
      })
      .catch((err: unknown) => {
        // State inválido/vencido ou excesso de tentativas: a confirmação falharia igual.
        const errorCode = getBackendErrorCode(err);
        if (ERROR_KEYS[errorCode] || statusOf(err) === 429) {
          failWith(err);
          return;
        }
        setCompanyName(null);
        setStatus("confirm");
      });
    // Lido uma vez só: o retorno do Google não muda na mesma página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "confirm") {
    return (
      <>
        <ShieldAlert className="mb-4 h-12 w-12 text-amber-500" />
        <p className="text-sm font-medium">{t("callbackTitle")}</p>
        <p className="mt-2 text-sm">
          {companyName
            ? t("callbackConfirmQuestion", { company: companyName })
            : t("callbackConfirmQuestionNoName")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{t("callbackConfirmHint")}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={cancel}>
            {t("callbackCancelButton")}
          </Button>
          <Button size="sm" onClick={complete}>
            {t("callbackConfirmButton")}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {status === "loading" && <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />}
      {status === "success" && <CheckCircle className="mb-4 h-12 w-12 text-green-500" />}
      {status === "error" && <XCircle className="mb-4 h-12 w-12 text-red-500" />}
      <p className="text-sm font-medium">{t("callbackTitle")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{status === "loading" ? t("callbackProcessing") : message}</p>
      {status !== "loading" && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-xs text-muted-foreground">{isPopup ? t("callbackClosing") : t("callbackCloseHint")}</p>
          {!isPopup && (
            <Button asChild size="sm" variant="outline">
              <Link href="/avaliacoes?tab=google">{t("callbackGoToReviews")}</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}

export default function GoogleBusinessCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Suspense fallback={<Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />}>
            <GoogleBusinessCallbackContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
