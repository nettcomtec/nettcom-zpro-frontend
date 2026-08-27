"use client"

import { useEffect, useRef } from "react"
import { getSocket } from "@/lib/socket"
import { useAuthStore } from "@/stores/auth-store"

export interface GupshupAuthExpiredPayload {
  service: "gupshup"
  whatsappId: number
  appId?: string | null
  // partner_token | app_token | api_key — qual credencial expirou
  credential?: "partner_token" | "app_token" | "api_key" | string
  expiredAt: string
}

interface UseGupshupAuthExpiredOptions {
  onExpired?: (payload: GupshupAuthExpiredPayload) => void
}

/**
 * Hook dedicado para o evento `${tenantId}:gupshup:auth-expired`. Comparado
 * ao hook compartilhado use-channel-auth-expired-socket, este expoe a chave
 * extra `credential` que indica qual das tres credenciais Gupshup expirou
 * (partner token JWT, app_token V3, ou apikey enterprise) — informacao usada
 * pela UI para sugerir o passo de recuperacao correto.
 */
export function useGupshupAuthExpiredSocket({
  onExpired,
}: UseGupshupAuthExpiredOptions = {}) {
  const { user, isAuthenticated } = useAuthStore()
  const tenantId = user?.tenantId
  const onExpiredRef = useRef(onExpired)
  onExpiredRef.current = onExpired

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return

    const socket = getSocket()
    if (!socket) return

    const event = `${tenantId}:gupshup:auth-expired`
    const handler = (payload: GupshupAuthExpiredPayload) => {
      onExpiredRef.current?.(payload)
    }

    socket.on(event, handler)
    return () => {
      socket.off(event, handler)
    }
  }, [isAuthenticated, tenantId])
}
