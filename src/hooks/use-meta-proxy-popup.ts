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
  wabaId?: string;
  phoneId?: string;
  phone_number_id?: string;
  waba_id?: string;
  tenantId?: number | null;
  pages?: Array<{ id: string; name: string; access_token: string }>;
  [k: string]: unknown;
}

export interface MetaProxyHijackPayload extends HijackDetails {
  identifier:  string | null;
  callbackUrl: string | null;
}

interface OpenPopupOptions {
  channel: MetaProxyChannel;
  credentials: MetaProxyCredentials;
  onSuccess?: (data: MetaProxySuccessPayload) => void;
  onError?: (msg: string, hijack?: MetaProxyHijackPayload | null) => void;
  onCancelled?: () => void;
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
    ({ channel, credentials, onSuccess, onError, onCancelled, windowFeatures }: OpenPopupOptions) => {
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

      // Attach listener
      const handler = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return;
        const data = event.data as {
          type?:   string;
          error?:  string;
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
            onSuccess?.(data.data || {});
            cleanup();
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
            onError?.(data.error || "UNKNOWN_ERROR", hijackPayload);
            cleanup();
            return;
          }
          case "proxy:cancelled": {
            onCancelled?.();
            cleanup();
            return;
          }
        }
      };

      function cleanup() {
        window.removeEventListener("message", handler);
        messageHandlerRef.current = null;
      }

      window.addEventListener("message", handler);
      messageHandlerRef.current = handler;

      // Watchdog: if popup is closed without posting anything, fire onCancelled
      const watchdog = setInterval(() => {
        if (popup.closed) {
          clearInterval(watchdog);
          if (messageHandlerRef.current === handler) {
            // popup closed before success/error — treat as cancel
            onCancelled?.();
            cleanup();
          }
        }
      }, 500);
    },
    []
  );

  return { open };
}
