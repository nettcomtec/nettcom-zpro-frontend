"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

function GmailCallbackContent() {
  const t = useTranslations("gmailCallbackPage");
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [whatsappId, setWhatsappId] = useState("");

  useEffect(() => {
    setMessage(t("processing"));
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    if (error) {
      setStatus("error");
      setMessage(t("errorAuth") + error);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage(t("errorNoCode"));
      return;
    }

    if (!state) {
      setStatus("error");
      setMessage(t("errorNoState"));
      return;
    }

    setWhatsappId(state);
    handleCallback(code, state);
  }, [searchParams]);

  const handleCallback = async (code: string, state: string) => {
    let apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

    if (!apiUrl || apiUrl === "undefined") {
      if (
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
      ) {
        apiUrl = window.location.origin.replace(/:\d+/, ":3101");
      } else {
        apiUrl = window.location.origin;
      }
    }

    apiUrl = apiUrl.replace(/\/$/, "");

    try {
      const response = await fetch(`${apiUrl}/gauth/gmail/save-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state }),
      });

      if (response.ok) {
        setStatus("success");
        setMessage(t("success"));
        if (window.opener && !window.opener.closed) {
          try {
            window.opener.postMessage(
              {
                type: "OAUTH_COMPLETE",
                status: "success",
                whatsappId: Number(state),
              },
              window.location.origin
            );
          } catch {}
        }
        setTimeout(() => window.close(), 800);
      } else {
        const errorText = await response.text();
        setStatus("error");
        setMessage(t("errorProcess") + errorText);
        if (window.opener && !window.opener.closed) {
          try {
            window.opener.postMessage(
              {
                type: "OAUTH_COMPLETE",
                status: "error",
                message: errorText,
                whatsappId: Number(state),
              },
              window.location.origin
            );
          } catch {}
        }
      }
    } catch (err: unknown) {
      setStatus("error");
      setMessage(
        t("errorConnection") +
          (err instanceof Error ? err.message : String(err))
      );
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
      {status === "success" && whatsappId && (
        <p className="text-xs text-muted-foreground mt-2">
          WhatsApp ID: {whatsappId}
        </p>
      )}
    </>
  );
}

export default function GmailCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Suspense
            fallback={
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            }
          >
            <GmailCallbackContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
