"use client"

import { useEffect, useRef } from "react"
import { getSocket } from "@/lib/socket"
import { useAuthStore } from "@/stores/auth-store"

export interface WabaGroupNotificationPayload {
  phone_number_id: string
  event: string
  group_id: string
  participants: string[]
  new_values: Record<string, unknown>
}

interface UseWabaGroupNotificationSocketOptions {
  onNotification?: (payload: WabaGroupNotificationPayload) => void
}

export function useWabaGroupNotificationSocket({
  onNotification,
}: UseWabaGroupNotificationSocketOptions = {}) {
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
      onNotificationRef.current?.(data.payload as WabaGroupNotificationPayload)
    }

    socket.on(`${tenantId}:ticketList`, handleTicketList)
    registeredRef.current = true

    return () => {
      socket.off(`${tenantId}:ticketList`, handleTicketList)
      registeredRef.current = false
    }
  }, [isAuthenticated, user?.tenantId])
}
