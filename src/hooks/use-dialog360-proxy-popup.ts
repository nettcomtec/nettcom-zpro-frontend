"use client"

import { useCallback, useEffect, useRef } from "react"
import { OAUTH_PROXY_URL } from "@/config/oauth-proxy"
import type { Dialog360HijackDetails } from "@/types/dialog360"

/**
 * Hook que abre o popup de onboarding 360dialog no oauth-proxy e gerencia o
 * handshake postMessage. Cópia independente de `use-meta-proxy-popup` — não
 * importa nada de Meta para preservar isolamento.
 *
 * Contrato:
 * 1. Opener abre popup em `${OAUTH_PROXY_URL}/dialog360-signup?callbackOrigin=...`
 * 2. Popup envia `proxy:ready` (opcional) → opener envia `proxy:credentials`
 * 3. Popup roda fluxo 360dialog Permissions URL + Partner API key issuance
 * 4. Popup envia `proxy:success` / `proxy:error` / `proxy:cancelled`
 * 5. Opener invoca o callback; o popup HTML faz o `window.close()`
 */

export interface Dialog360ProxyCredentials {
  apiUrl: string
  authToken: string | null
  tenantId: number | null
  licenseKey: string
  /** Sobe direto para o passo de conexão sem o license check. */
  extensionMode?: boolean
  /** Quando o tenant tem app próprio 360dialog (Partner ID/Secret). */
  appDialog360Id?: number | null
}

export interface Dialog360ProxySuccessPayload {
  client?: string
  channels?: string[]
  channelId?: string
  apiKey?: string
  phoneNumberId?: string
  wabaId?: string
  tenantId?: number | null
  [k: string]: unknown
}

export interface Dialog360ProxyHijackPayload extends Dialog360HijackDetails {
  errorCode: string
  identifier: string | null
  callbackUrl: string | null
}

interface OpenPopupOptions {
  credentials: Dialog360ProxyCredentials
  onSuccess?: (data: Dialog360ProxySuccessPayload) => void
  onError?: (msg: string, hijack?: Dialog360ProxyHijackPayload | null) => void
  onCancelled?: () => void
  windowFeatures?: string
}

export function useDialog360ProxyPopup() {
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

      // /dialog360-signup exige state HMAC-assinado (apiUrl+licenseKey+tenantId).
      // POST /api/oauth-init valida licença no proxy e devolve signupUrl com state.
      let signupUrl: string
      try {
        const r = await fetch(`${OAUTH_PROXY_URL}/api/oauth-init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "dialog360",
            returnUrl: callbackOrigin,
            apiUrl: credentials.apiUrl,
            licenseKey: credentials.licenseKey,
            originalState: credentials.tenantId,
          }),
        })
        const body = await r.json().catch(() => ({}))
        if (!r.ok || !body?.signupUrl) {
          onError?.(body?.error || "OAUTH_INIT_FAILED")
          return
        }
        signupUrl = body.signupUrl
      } catch (err) {
        onError?.((err as Error)?.message || "OAUTH_INIT_NETWORK_ERROR")
        return
      }

      const popup = window.open(signupUrl, "dialog360_proxy_popup", features)
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
            existing?: {
              apiUrlMasked?: string
              registeredAt?: string | null
            }
          } | null
          data?: Dialog360ProxySuccessPayload
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
            const hijackPayload: Dialog360ProxyHijackPayload | null =
              data.hijack
                ? {
                    errorCode:
                      data.hijack.errorCode || "ALREADY_REGISTERED",
                    identifier: data.hijack.identifier || null,
                    callbackUrl: data.hijack.callbackUrl || null,
                    apiUrlMasked:
                      data.hijack.existing?.apiUrlMasked || "***",
                    registeredAt:
                      data.hijack.existing?.registeredAt || null,
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

      // Watchdog: se o popup fechar sem nenhum message, dispara onCancelled.
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
