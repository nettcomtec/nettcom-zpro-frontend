"use client";

import { useCallback, useEffect, useRef } from "react";
import { OAUTH_PROXY_URL } from "@/config/oauth-proxy";
import type { HijackDetails } from "@/lib/registry-hijack";

/**
 * Phase 13.a — Hook that opens a signup popup on the OAuth proxy (WABA / Instagram /
 * Facebook Messenger) and handles the full postMessage handshake:
 *
 * 1. Opener opens popup at `${proxyBase}/${signupPath}?callbackOrigin=${origin}`
 * 2. Popup sends `proxy:ready` (optional) → opener posts `proxy:credentials`
 * 3. Popup validates license via /api/check-license, then runs the provider flow
 * 4. Popup sends `proxy:success` / `proxy:error` / `proxy:cancelled`
 * 5. Opener's callback is invoked and the popup is closed automatically by the HTML
 *
 * The contract matches waba-signup.html, facebook-signup.html, instagram-signup.html
 * living in extra/oauth-proxy/public/.
 */

export type MetaProxyChannel = "waba" | "facebook" | "instagram";

export interface MetaProxyCredentials {
  apiUrl: string;           // backend base URL of this tenant
  authToken: string | null; // user auth token for calls back to the backend
  tenantId: number | null;
  metaToken?: string;       // Meta webhook verify token
  licenseKey: string;       // tenant license (usually tenantEmail)
  extensionMode?: boolean;  // skip license check and go straight to connect button
  // Phase 18 — app proprio do tenant. Quando presente, o popup:
  //  1. busca {appId, configId, apiVersion, appInstagramId} em
  //     GET {apiUrl}/app-waba/{appWabaId}/public-oauth-config
  //  2. usa esse appId no dialog/oauth da Meta
  //  3. troca o code por token em POST {apiUrl}/app-waba/{appWabaId}/oauth-exchange
  // appSecret nunca sai do backend do tenant.
  appWabaId?: number | null;
  webhookOrigin?: "own_app" | "zdg_oauth";
  // Capability gate: sinaliza ao popup facebook-signup que este backend suporta
  // criar também o canal Instagram (EAA) a partir da conta IG concedida no asset
  // selector (cross-dispatch por object + união de subscribed_fields). Instalações
  // antigas não enviam → popup mantém o comportamento legado (só Messenger).
  igViaFacebook?: boolean;
}

export interface MetaProxySuccessPayload {
  // Union of fields the popup may return depending on the channel.
  access_token?: string;
  user_id?: string;
  userId?: string;
  wabaId?: string;
  phoneId?: string;
  phone_number_id?: string;
  waba_id?: string;
  tenantId?: number | null;
  pages?: Array<{ id: string; name: string; access_token: string }>;
  instagram?: unknown[];
  // WhatsApp (aditivos): número em coexistência e situação do registro automático
  // ('pending_pin' = o popup está mostrando o PIN e registra depois do "Já anotei").
  coex?: boolean;
  register?: "pending_pin" | "skipped" | string;
  [k: string]: unknown;
}

/**
 * `proxy:onboarding-update` (aditivo): resultado do registro automático do número e
 * da sincronização da coexistência, enviado pelo popup DEPOIS do `proxy:success`.
 * Nunca traz PIN nem token.
 */
export interface MetaProxyOnboardingUpdate {
  phoneId?: string;
  register?: "registered" | "already_registered" | "pin_required" | "rate_limited" | "failed" | "skipped" | string;
  coexSync?: "ok" | "partial" | "failed" | "off" | "skipped" | string;
}

/**
 * O `proxy:success` do WhatsApp só significa canal criado quando traz o número
 * (`phoneId`). Proxy antigo manda sucesso sem número quando a Meta não devolveu o
 * número (coexistência) — e nesse caso nenhum canal foi criado.
 */
export function metaProxySuccessHasPhone(data?: MetaProxySuccessPayload | null): boolean {
  const phone = (data?.phoneId ?? data?.phone_number_id) as unknown;
  if (typeof phone === "string") return phone.trim() !== "";
  if (typeof phone === "number") return Number.isFinite(phone) && phone > 0;
  return false;
}

/** Chaves (namespace `sessoesPage`) dos avisos do `proxy:onboarding-update`. */
export type MetaProxyOnboardingNoticeKey =
  | "waRegisterAutoOk"
  | "waRegisterAutoPinRequired"
  | "waRegisterAutoFailed"
  | "coexSyncAutoOk"
  | "coexSyncAutoFailed";

/**
 * Traduz o `proxy:onboarding-update` em avisos para a tela e no número a marcar
 * como registrado (aviso "registro pendente" some na hora). `skipped`/`off` não
 * geram aviso: o botão de sempre continua no card.
 */
export function describeMetaProxyOnboardingUpdate(update: MetaProxyOnboardingUpdate): {
  registeredPhoneId: string | null;
  notices: Array<{ level: "success" | "warning"; key: MetaProxyOnboardingNoticeKey }>;
} {
  const notices: Array<{ level: "success" | "warning"; key: MetaProxyOnboardingNoticeKey }> = [];
  let registeredPhoneId: string | null = null;
  switch (update.register) {
    case "registered":
    case "already_registered":
      registeredPhoneId = update.phoneId || null;
      notices.push({ level: "success", key: "waRegisterAutoOk" });
      break;
    case "pin_required":
      notices.push({ level: "warning", key: "waRegisterAutoPinRequired" });
      break;
    case "rate_limited":
    case "failed":
      notices.push({ level: "warning", key: "waRegisterAutoFailed" });
      break;
    default:
      break;
  }
  switch (update.coexSync) {
    case "ok":
      notices.push({ level: "success", key: "coexSyncAutoOk" });
      break;
    case "partial":
    case "failed":
      notices.push({ level: "warning", key: "coexSyncAutoFailed" });
      break;
    default:
      break;
  }
  return { registeredPhoneId, notices };
}

/** Lê o `proxy:onboarding-update` (dados em `data` ou na raiz da mensagem). */
export function readMetaProxyOnboardingUpdate(message: unknown): MetaProxyOnboardingUpdate {
  const m = (message && typeof message === "object" ? message : {}) as Record<string, unknown>;
  const inner = m.data && typeof m.data === "object" ? (m.data as Record<string, unknown>) : m;
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
  return {
    phoneId: str(inner.phoneId) ?? (typeof inner.phoneId === "number" ? String(inner.phoneId) : undefined),
    register: str(inner.register),
    coexSync: str(inner.coexSync),
  };
}

export interface MetaProxyHijackPayload extends HijackDetails {
  identifier:  string | null;
  callbackUrl: string | null;
}

interface OpenPopupOptions {
  channel: MetaProxyChannel;
  credentials: MetaProxyCredentials;
  onSuccess?: (data: MetaProxySuccessPayload) => void;
  onError?: (msg: string, hijack?: MetaProxyHijackPayload | null, errorCode?: string | null) => void;
  onCancelled?: () => void;
  /** Registro automático / sincronização terminados no popup (depois do sucesso). */
  onOnboardingUpdate?: (data: MetaProxyOnboardingUpdate) => void;
  windowFeatures?: string; // e.g. "width=600,height=700"
}

export function useMetaProxyPopup() {
  // Phase 13.c — When a tenant sets an oauthCustomDomain, Meta signup flows are
  // loaded inside an iframe wrapper served at the custom domain (/meta-frame),
  // which embeds the canonical oauth.techprovider.com.br signup HTML. This keeps FB SDK /
  // OAuth redirect_uri on the whitelisted canonical origin while the popup's
  // address bar stays on the tenant's branded domain.
  // Without customDomain, flows open directly on the canonical proxy.
  const popupRef = useRef<Window | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  // Cleanup on unmount: close popup + remove listener
  useEffect(() => {
    return () => {
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current);
        messageHandlerRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const open = useCallback(
    ({ channel, credentials, onSuccess, onError, onCancelled, onOnboardingUpdate, windowFeatures }: OpenPopupOptions) => {
      const callbackOrigin = typeof window !== "undefined" ? window.location.origin : "";

      // Meta channels (WABA, Instagram, Facebook Messenger) sempre rodam no
      // host canonico oauth.techprovider.com.br — e la que o FB SDK, os redirect_uris
      // e as "Allowed Domains for JavaScript SDK" estao registrados no app.
      const signupPath =
        channel === "waba"
          ? "/waba-signup"
          : channel === "facebook"
            ? "/facebook-signup"
            : "/instagram-signup";
      const url = `${OAUTH_PROXY_URL}${signupPath}?callbackOrigin=${encodeURIComponent(callbackOrigin)}`;
      const expectedOrigin = new URL(OAUTH_PROXY_URL).origin;

      // Open popup
      const features = windowFeatures || "width=640,height=720,resizable=yes,scrollbars=yes";
      const popup = window.open(url, `${channel}_proxy_popup`, features);
      if (!popup) {
        onError?.("POPUP_BLOCKED");
        return;
      }
      popupRef.current = popup;

      // Remove any previous listener
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current);
      }

      // Algo já foi entregue ao chamador (sucesso, erro ou cancelamento): o vigia de
      // fechamento não dispara cancelamento depois disso.
      let delivered = false;

      // Attach listener
      const handler = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return;
        // Só a janela aberta AQUI fala com este handler: os popups do Gupshup e do
        // Dialog360 vêm da mesma origem e usam os mesmos tipos de mensagem.
        if (event.source !== popup) return;
        const data = event.data as {
          type?:   string;
          error?:  string;
          // Codigo estruturado do erro (ex.: ERR_NO_PERMISSION_CHANNEL_TYPE_LIMIT) —
          // proxy antigo nao manda; o caller cai na mensagem crua.
          errorCode?: string | null;
          hijack?: {
            channel?:     string;
            errorCode?:   string;
            identifier?:  string | null;
            callbackUrl?: string | null;
            existing?:    { apiUrlMasked?: string; registeredAt?: string | null };
          } | null;
          data?:   MetaProxySuccessPayload;
        };
        if (!data || typeof data.type !== "string") return;

        switch (data.type) {
          case "proxy:ready": {
            // Popup requesting credentials — send them now
            try {
              popup.postMessage({ type: "proxy:credentials", ...credentials }, expectedOrigin);
            } catch {
              // ignore
            }
            return;
          }
          case "proxy:success": {
            // A escuta continua enquanto o popup estiver aberto: o resultado do
            // registro automático chega depois, em `proxy:onboarding-update`.
            delivered = true;
            onSuccess?.(data.data || {});
            return;
          }
          case "proxy:onboarding-update": {
            onOnboardingUpdate?.(readMetaProxyOnboardingUpdate(data));
            return;
          }
          case "proxy:error": {
            const hijackPayload: MetaProxyHijackPayload | null = data.hijack
              ? {
                  channel:      data.hijack.channel      || channel,
                  errorCode:    data.hijack.errorCode    || "ALREADY_REGISTERED",
                  identifier:   data.hijack.identifier   || null,
                  callbackUrl:  data.hijack.callbackUrl  || null,
                  apiUrlMasked: data.hijack.existing?.apiUrlMasked || "***",
                  registeredAt: data.hijack.existing?.registeredAt || null,
                }
              : null;
            // Escuta mantida: uma nova tentativa no mesmo popup ainda pode dar certo.
            delivered = true;
            onError?.(data.error || "UNKNOWN_ERROR", hijackPayload, data.errorCode || null);
            return;
          }
          case "proxy:cancelled": {
            delivered = true;
            onCancelled?.();
            return;
          }
        }
      };

      function cleanup() {
        window.removeEventListener("message", handler);
        if (messageHandlerRef.current === handler) messageHandlerRef.current = null;
      }

      window.addEventListener("message", handler);
      messageHandlerRef.current = handler;

      // Watchdog: popup fechado encerra a escuta; sem nada entregue antes, conta
      // como cancelamento.
      const watchdog = setInterval(() => {
        if (popup.closed) {
          clearInterval(watchdog);
          if (messageHandlerRef.current === handler) {
            // popup closed before success/error — treat as cancel
            if (!delivered) onCancelled?.();
            cleanup();
          }
        }
      }, 500);
    },
    []
  );

  return { open };
}
