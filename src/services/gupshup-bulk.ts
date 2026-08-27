// Servico de bulk dispatch Gupshup — espelha bulk.ts apontando para
// /gupshup-bulk/*. Mantemos types proprios para evitar acoplamento com
// bulk.ts (WABA).

import api from "@/lib/api"

export interface GupshupBulkDispatch {
  id: number
  status: string
  totalContacts?: number
  sentCount?: number
  failedCount?: number
  pendingMessages?: number
  failedMessages?: number
  sentMessages?: number
  totalMessages?: number
  message?: string
  mediaUrl?: string
  mediaDescription?: string
  templateName?: string
  templateLanguage?: string
  minDelay?: number
  maxDelay?: number
  whatsappId?: number
  dispatchType?: string
  metadata?: {
    variables?: string[]
    contacts?: string[]
    sentContacts?: { contact: string; timestamp: string }[]
    [key: string]: unknown
  }
  errors?: { contact: string; error: string; timestamp: string }[]
  createdAt: string
  startedAt?: string
  completedAt?: string
  updatedAt?: string
}

export async function sendGupshupBulkFast(data: FormData) {
  return api.post("/gupshup-bulk", data, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendGupshupBulkVariable(data: FormData) {
  return api.post("/gupshup-bulk-variable", data, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendGupshupBulkVariableJson(data: Record<string, unknown>) {
  return api.post("/gupshup-bulk-variable", data)
}

export async function sendGupshupBulkClose(data: FormData) {
  return api.post("/gupshup-bulk-close", data, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendGupshupBulkCloseJson(data: Record<string, unknown>) {
  return api.post("/gupshup-bulk-close", data)
}

export async function listGupshupDispatches(params?: {
  status?: string
  dispatchType?: string
  page?: number
  limit?: number
  sortBy?: string
  order?: string
}) {
  return api.get<{ rows: GupshupBulkDispatch[]; count: number } | GupshupBulkDispatch[]>(
    "/gupshup-bulk-dispatch",
    { params },
  )
}

export async function showGupshupDispatch(id: number) {
  return api.get<GupshupBulkDispatch>(`/gupshup-bulk-dispatch/${id}`)
}

export async function createGupshupDispatch(data: Record<string, unknown>) {
  return api.post("/gupshup-bulk-dispatch", data)
}

export async function updateGupshupDispatch(
  id: number,
  data: Record<string, unknown>,
) {
  return api.put(`/gupshup-bulk-dispatch/${id}`, data)
}

export async function deleteGupshupDispatch(id: number) {
  return api.delete(`/gupshup-bulk-dispatch/${id}`)
}

export async function sendGupshupBulkTemplate(data: FormData) {
  return api.post("/gupshup-bulk-template", data, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendGupshupBulkTemplateJson(data: Record<string, unknown>) {
  return api.post("/gupshup-bulk-template", data)
}
