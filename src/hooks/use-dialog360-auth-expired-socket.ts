"use client"

import { useEffect, useRef } from "react"
import { getSocket } from "@/lib/socket"
import { useAuthStore } from "@/stores/auth-store"

export interface Dialog360AuthExpiredPayload {
  whatsappId: number
  channelId?: number
  reason?: string
  expiredAt: string
}

interface UseDialog360AuthExpiredOptions {
  onExpired?: (payload: Dialog360AuthExpiredPayload) => void
}

/**
 * Escuta socket `${tenantId}:dialog360:auth-expired` — disparado quando a
 * API key Dialog360 retorna 401/403 ou quando o stack detecta `key expired`
 * em chamadas batch.
 */
export function useDialog360AuthExpiredSocket({
  onExpired,
}: UseDialog360AuthExpiredOptions = {}) {
  const { user, isAuthenticated } = useAuthStore()
  const tenantId = user?.tenantId
  const onExpiredRef = useRef(onExpired)
  onExpiredRef.current = onExpired

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return

    const socket = getSocket()
    if (!socket) return

    const event = `${tenantId}:dialog360:auth-expired`
    const handler = (payload: Dialog360AuthExpiredPayload) => {
      onExpiredRef.current?.(payload)
    }

    socket.on(event, handler)
    return () => {
      socket.off(event, handler)
    }
  }, [isAuthenticated, tenantId])
}
