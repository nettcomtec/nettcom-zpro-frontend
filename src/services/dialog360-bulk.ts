import api from "@/lib/api"

/**
 * Envio em massa via Dialog360 (templates + dados). Espelha contrato
 * de `/wabameta/bulk` mas roteia ao stack Dialog360.
 */
export async function bulkSendDialog360(data: Record<string, unknown>) {
  return api.post("/dialog360/bulk", data)
}

export async function bulkSendDialog360Template(data: Record<string, unknown>) {
  return api.post("/dialog360/bulkTemplate", data)
}

export async function bulkSendDialog360Media(formData: FormData) {
  return api.post("/dialog360/bulkMedia", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600000,
  })
}

export interface Dialog360BulkStatus {
  jobId: string
  total: number
  sent: number
  failed: number
  status: "queued" | "running" | "done" | "failed"
}

export async function getDialog360BulkStatus(jobId: string) {
  const { data } = await api.get<Dialog360BulkStatus>(
    `/dialog360/bulk/${encodeURIComponent(jobId)}/status`,
  )
  return data
}

export async function cancelDialog360Bulk(jobId: string) {
  return api.post(`/dialog360/bulk/${encodeURIComponent(jobId)}/cancel`)
}
