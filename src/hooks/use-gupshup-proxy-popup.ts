"use client"

import { useCallback, useEffect, useRef } from "react"
import { OAUTH_PROXY_URL } from "@/config/oauth-proxy"
import type { HijackDetails } from "@/lib/registry-hijack"

/**
 * Hook que abre o popup do Embedded Signup hospedado pelo Gupshup, via OAuth
 * proxy (extra/oauth-proxy rota /gupshup-signup criada em W1-F). Faz o
 * handshake postMessage analogamente ao use-meta-proxy-popup.ts (WABA) e ao
 * use-dialog360-proxy-popup.ts (BSP 360dialog):
 *
 *   1. Opener abre popup em ${proxyBase}/gupshup-signup?callbackOrigin=${origin}
 *   2. Popup envia `proxy:ready`     -> opener responde com `proxy:credentials`
 *   3. Popup roda o Gupshup hosted signup, valida licenca (/api/check-license)
 *   4. Popup envia `proxy:success` | `proxy:error` | `proxy:cancelled`
 *   5. Callback do opener e invocado e popup e fechado pelo HTML embarcado
 *
 * Contrato 100% paralelo ao Meta — diferenca e o caminho (`/gupshup-signup`)
 * e o `channel` exportado.
 */

export type GupshupProxyChannel = "gupshup"

export interface GupshupProxyCredentials {
  apiUrl: string
  authToken: string | null
  tenantId: number | null
  metaToken?: string
  licenseKey: string
  extensionMode?: boolean
  // App proprio do tenant (AppGupshup). Quando presente, popup busca
  // credenciais em GET ${apiUrl}/app-gupshup/{appGupshupId}/public-oauth-config
  // e troca code por token via POST oauth-exchange. partnerSecret nunca sai
  // do backend do tenant.
  appGupshupId?: number | null
  webhookOrigin?: "own_app" | "zdg_oauth"
  // appId Gupshup (do painter partner.gupshup.io). Embedded Signup é PARA
  // um app existente — Partner API exige appId em /partner/app/embed/{appId}.
  gupshupAppId?: string
}

export interface GupshupProxySuccessPayload {
  appId?: string
  appName?: string
  apiKey?: string
  appToken?: string
  appTokenExpiresAt?: string
  phoneNumberId?: string
  phone_number_id?: string
  wabaId?: string
  waba_id?: string
  partnerEmail?: string
  tenantId?: number | null
  [k: string]: unknown
}

export interface GupshupProxyHijackPayload extends HijackDetails {
  identifier: string | null
  callbackUrl: string | null
}

interface OpenPopupOptions {
  credentials: GupshupProxyCredentials
  onSuccess?: (data: GupshupProxySuccessPayload) => void
  onError?: (msg: string, hijack?: GupshupProxyHijackPayload | null) => void
  onCancelled?: () => void
  windowFeatures?: string
}

export function useGupshupProxyPopup() {
  const popupRef = useRef<Window | null>(null)
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null)

  useEffect(() => {
    return () => {
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current)
        messageHandlerRef.current = null
      }
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  const open = useCallback(
    async ({
      credentials,
      onSuccess,
      onError,
      onCancelled,
      windowFeatures,
    }: OpenPopupOptions) => {
      const callbackOrigin =
        typeof window !== "undefined" ? window.location.origin : ""
      const expectedOrigin = new URL(OAUTH_PROXY_URL).origin
      const features =
        windowFeatures || "width=640,height=720,resizable=yes,scrollbars=yes"

      // Gate de licença no proxy via /api/oauth-init antes de abrir o popup.
      // O signupUrl retornado embute apiUrl+licenseKey no state assinado, mas
      // gupshup-signup.html ainda lê apiUrl/licenseKey de query params (precisa
      // disso pra chamar /gupshupEmbeddedSignupLink no backend do tenant).
      try {
        const r = await fetch(`${OAUTH_PROXY_URL}/api/oauth-init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "gupshup",
            returnUrl: callbackOrigin,
            apiUrl: credentials.apiUrl,
            licenseKey: credentials.licenseKey,
            originalState: credentials.tenantId,
          }),
        })
        const body = await r.json().catch(() => ({}))
        if (!r.ok) {
          onError?.(body?.error || "OAUTH_INIT_FAILED")
          return
        }
      } catch (err) {
        onError?.((err as Error)?.message || "OAUTH_INIT_NETWORK_ERROR")
        return
      }

      const params = new URLSearchParams({
        callbackOrigin,
        apiUrl: credentials.apiUrl,
        licenseKey: credentials.licenseKey,
      })
      if (credentials.gupshupAppId) {
        params.set("appId", credentials.gupshupAppId)
      }
      const url = `${OAUTH_PROXY_URL}/gupshup-signup?${params.toString()}`
      const popup = window.open(url, "gupshup_proxy_popup", features)
      if (!popup) {
        onError?.("POPUP_BLOCKED")
        return
      }
      popupRef.current = popup

      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current)
      }

      const handler = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return
        const data = event.data as {
          type?: string
          error?: string
          hijack?: {
            channel?: string
            errorCode?: string
            identifier?: string | null
            callbackUrl?: string | null
            existing?: { apiUrlMasked?: string; registeredAt?: string | null }
          } | null
          data?: GupshupProxySuccessPayload
        }
        if (!data || typeof data.type !== "string") return

        switch (data.type) {
          case "proxy:ready": {
            try {
              popup.postMessage(
                { type: "proxy:credentials", ...credentials },
                expectedOrigin,
              )
            } catch {
              // ignore
            }
            return
          }
          case "proxy:success": {
            onSuccess?.(data.data || {})
            cleanup()
            return
          }
          case "proxy:error": {
            const hijackPayload: GupshupProxyHijackPayload | null = data.hijack
              ? {
                  channel: data.hijack.channel || "gupshup",
                  errorCode: data.hijack.errorCode || "ALREADY_REGISTERED",
                  identifier: data.hijack.identifier || null,
                  callbackUrl: data.hijack.callbackUrl || null,
                  apiUrlMasked: data.hijack.existing?.apiUrlMasked || "***",
                  registeredAt: data.hijack.existing?.registeredAt || null,
                }
              : null
            onError?.(data.error || "UNKNOWN_ERROR", hijackPayload)
            cleanup()
            return
          }
          case "proxy:cancelled": {
            onCancelled?.()
            cleanup()
            return
          }
        }
      }

      function cleanup() {
        window.removeEventListener("message", handler)
        messageHandlerRef.current = null
      }

      window.addEventListener("message", handler)
      messageHandlerRef.current = handler

      const watchdog = setInterval(() => {
        if (popup.closed) {
          clearInterval(watchdog)
          if (messageHandlerRef.current === handler) {
            onCancelled?.()
            cleanup()
          }
        }
      }, 500)
    },
    [],
  )

  return { open }
}
