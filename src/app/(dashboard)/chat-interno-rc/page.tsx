"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { Loader2, MessageSquare, Lock, Hash, ChevronDown, Search, Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface RCToken {
  serverUrl: string;
  userId: string;
  authToken: string;
  enabled?: boolean;
}

// Skeleton que imita o layout do Rocket.Chat com overlay de "não habilitado"
function RocketChatPreview({
  loading,
  errorType,
  errorDetail,
  t,
}: {
  loading: boolean;
  errorType?: "disabled" | "connection" | null;
  errorDetail?: string;
  t: (k: string) => string;
}) {
  const sidebarChannels = ["geral", "suporte", "vendas", "tecnologia", "random"];
  const sidebarDMs = ["Ana Lima", "Carlos Souza", "Maria Silva"];

  const fakeMessages = [
    { side: "left", widths: ["w-48", "w-32"] },
    { side: "right", widths: ["w-40"] },
    { side: "left", widths: ["w-56", "w-44", "w-28"] },
    { side: "right", widths: ["w-36", "w-52"] },
    { side: "left", widths: ["w-32"] },
    { side: "right", widths: ["w-48", "w-20"] },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border bg-muted/10 select-none">
      {/* Layout RC mockado */}
      <div className="flex h-full">
        {/* Sidebar esquerda */}
        <div className="hidden sm:flex flex-col w-56 shrink-0 bg-muted/30 border-r">
          {/* Header da sidebar */}
          <div className="flex items-center gap-2 px-3 py-3 border-b">
            <div className="h-6 w-6 rounded-full bg-muted-foreground/20" />
            <div className="h-3 w-24 rounded bg-muted-foreground/20" />
            <ChevronDown className="h-3 w-3 text-muted-foreground/30 ml-auto" />
          </div>

          {/* Search */}
          <div className="px-2 py-2">
            <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1.5">
              <Search className="h-3 w-3 text-muted-foreground/30 shrink-0" />
              <div className="h-2.5 w-20 rounded bg-muted-foreground/15" />
            </div>
          </div>

          {/* Canais */}
          <div className="px-2 pt-1">
            <div className="flex items-center justify-between px-1 py-1">
              <div className="h-2 w-12 rounded bg-muted-foreground/20" />
              <ChevronDown className="h-3 w-3 text-muted-foreground/20" />
            </div>
            <div className="space-y-0.5 mt-1">
              {sidebarChannels.map((ch, i) => (
                <div key={ch} className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1",
                  i === 0 && "bg-muted-foreground/10"
                )}>
                  <Hash className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                  <div className={cn("h-2 rounded bg-muted-foreground/20", i === 0 ? "w-10" : "w-14")} />
                  {i === 2 && <div className="ml-auto h-4 w-4 rounded-full bg-muted-foreground/20 flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded bg-muted-foreground/30" />
                  </div>}
                </div>
              ))}
            </div>
          </div>

          {/* DMs */}
          <div className="px-2 pt-3">
            <div className="flex items-center justify-between px-1 py-1">
              <div className="h-2 w-16 rounded bg-muted-foreground/20" />
              <ChevronDown className="h-3 w-3 text-muted-foreground/20" />
            </div>
            <div className="space-y-0.5 mt-1">
              {sidebarDMs.map((dm) => (
                <div key={dm} className="flex items-center gap-1.5 rounded px-2 py-1">
                  <div className="h-4 w-4 rounded-full bg-muted-foreground/20 shrink-0" />
                  <div className="h-2 w-16 rounded bg-muted-foreground/20" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Área principal do chat */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header do canal */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-background/30">
            <Menu className="h-4 w-4 text-muted-foreground/30 sm:hidden" />
            <Hash className="h-4 w-4 text-muted-foreground/30 shrink-0" />
            <div className="h-3 w-16 rounded bg-muted-foreground/20" />
            <div className="h-2 w-px bg-muted-foreground/20 mx-1" />
            <div className="h-2.5 w-32 rounded bg-muted-foreground/15 hidden sm:block" />
            <div className="ml-auto flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground/20" />
              <Bell className="h-4 w-4 text-muted-foreground/20" />
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-hidden px-4 py-4 space-y-4">
            {fakeMessages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.side === "right" && "flex-row-reverse")}>
                <div className="h-7 w-7 rounded-full bg-muted-foreground/20 shrink-0 mt-0.5" />
                <div className={cn("flex flex-col gap-1", msg.side === "right" && "items-end")}>
                  <div className="h-2 w-16 rounded bg-muted-foreground/15" />
                  <div className={cn(
                    "rounded-lg px-3 py-2 space-y-1.5",
                    msg.side === "left"
                      ? "bg-muted-foreground/10"
                      : "bg-primary/10"
                  )}>
                    {msg.widths.map((w, j) => (
                      <div key={j} className={cn("h-2.5 rounded bg-muted-foreground/20", w)} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input de mensagem */}
          <div className="px-4 py-3 border-t">
            <div className="flex items-center gap-2 rounded-lg border bg-background/30 px-3 py-2.5">
              <div className="h-2.5 w-36 rounded bg-muted-foreground/15 flex-1" />
              <div className="h-5 w-5 rounded bg-muted-foreground/15 shrink-0" />
            </div>
          </div>
        </div>
      </div>

      {/* Overlay com blur + mensagem */}
      <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-[3px] bg-background/50">
        {loading ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">{t("loading")}</span>
          </div>
        ) : errorType === "connection" ? (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="rounded-full bg-destructive/10 p-3 shadow-sm">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-foreground">{t("connectionError")}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">{errorDetail || t("connectionErrorDetail")}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="rounded-full bg-muted p-3 shadow-sm">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{t("notConfigured")}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">{t("notConfiguredHint")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatInternoRcPage() {
  const t = useTranslations("chatInternoRcPage");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [rcToken, setRcToken] = useState<RCToken | null>(null);
  const [errorType, setErrorType] = useState<"disabled" | "connection" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [ssoSent, setSsoSent] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  function handleTokenResponse(data: RCToken) {
    if (data?.enabled === false) {
      setErrorType("disabled");
    } else {
      setRcToken(data);
    }
  }

  function handleTokenError(err: unknown) {
    const e = err as Record<string, unknown>;
    const msg =
      (e?.data as Record<string, string>)?.message ||
      (e as Record<string, string>)?.message ||
      t("errorLoad");
    setErrorType("connection");
    setErrorDetail(msg);
  }

  useEffect(() => {
    api
      .get<RCToken>("/rocketchat-user-token")
      .then((res) => handleTokenResponse(res.data))
      .catch(handleTokenError);
  }, []);

  const handleIframeLoad = useCallback(() => {
    if (!rcToken || ssoSent) return;
    iframeRef.current?.contentWindow?.postMessage(
      { externalCommand: "login-with-token", token: rcToken.authToken },
      rcToken.serverUrl
    );
    setSsoSent(true);
  }, [rcToken, ssoSent]);

  // Escutar eventos do iframe (unread, logout)
  useEffect(() => {
    if (!rcToken) return;
    const handler = (event: MessageEvent) => {
      if (event.origin !== rcToken.serverUrl) return;
      if (event.data?.eventName === "unread-changed") {
        setUnreadCount(Number(event.data?.data) || 0);
      }
      if (event.data?.eventName === "logout") {
        setSsoSent(false);
        api
          .get<RCToken>("/rocketchat-user-token")
          .then((res) => handleTokenResponse(res.data))
          .catch(handleTokenError);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [rcToken]);

  if (errorType || !rcToken) {
    return (
      <RocketChatPreview
        loading={!errorType && !rcToken}
        errorType={errorType}
        errorDetail={errorDetail ?? undefined}
        t={t}
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {unreadCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b text-sm text-primary font-medium shrink-0">
          <MessageSquare className="h-4 w-4" />
          {t("unreadMessages", { count: unreadCount })}
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={rcToken.serverUrl}
        onLoad={handleIframeLoad}
        className="flex-1 w-full border-0"
        allow="camera; microphone; fullscreen; display-capture"
        title="Rocket.Chat"
      />
    </div>
  );
}
