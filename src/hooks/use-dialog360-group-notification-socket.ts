"use client"

import { useEffect, useRef } from "react"
import { getSocket } from "@/lib/socket"
import { useAuthStore } from "@/stores/auth-store"

export interface Dialog360GroupNotificationPayload {
  phone_number_id: string
  event: string
  group_id: string
  participants: string[]
  new_values: Record<string, unknown>
}

interface UseDialog360GroupNotificationSocketOptions {
  onNotification?: (payload: Dialog360GroupNotificationPayload) => void
}

/**
 * Escuta notificações de grupo (`group:notification`) enviadas pelo
 * stack Dialog360. O canal Dialog360 emite no mesmo namespace de tickets
 * (`${tenantId}:ticketList`) com tipo `group:notification`, mas o
 * `phone_number_id` permite o consumidor diferenciar do WABA.
 */
export function useDialog360GroupNotificationSocket({
  onNotification,
}: UseDialog360GroupNotificationSocketOptions = {}) {
  const { user, isAuthenticated } = useAuthStore()
  const registeredRef = useRef(false)
  const onNotificationRef = useRef(onNotification)
  onNotificationRef.current = onNotification

  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId || registeredRef.current) return

    const socket = getSocket()
    const tenantId = user.tenantId

    const handleTicketList = (data: { type: string; payload: unknown }) => {
      if (data.type !== "group:notification") return
      onNotificationRef.current?.(
        data.payload as Dialog360GroupNotificationPayload,
      )
    }

    socket.on(`${tenantId}:ticketList`, handleTicketList)
    registeredRef.current = true

    return () => {
      socket.off(`${tenantId}:ticketList`, handleTicketList)
      registeredRef.current = false
    }
  }, [isAuthenticated, user?.tenantId])
}
