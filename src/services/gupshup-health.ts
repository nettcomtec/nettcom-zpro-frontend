// Diagnostico de saude do canal Gupshup — espelha meta-channel-health.ts.
// Endpoints exclusivos /gupshup/*. NAO importa meta-channel-health.

import api from "@/lib/api"
import type { GupshupHealthCheckResult } from "@/types/gupshup"

export type GupshupProbeStatus = "ok" | "warn" | "error"
export type GupshupProbeId =
  | "API_KEY"
  | "APP_TOKEN"
  | "PARTNER_TOKEN"
  | "WEBHOOK"
  | "WABA_ID"
  | "PHONE_NUMBER"
  | "ACCOUNT_TYPE"
  | "TEMPLATES"
  | "QUALITY_RATING"

export interface GupshupProbeResult {
  id: GupshupProbeId
  status: GupshupProbeStatus
  label: string
  detail: string | null
  durationMs: number
}

export interface GupshupDiagnoseResult {
  whatsappId: number
  type: "gupshup"
  channelName: string
  webhookOrigin: "own_app" | "zdg_oauth" | "partner" | null
  overallStatus: GupshupProbeStatus
  checkedAt: string
  probes: GupshupProbeResult[]
}

export async function diagnoseGupshupChannel(whatsappId: number) {
  return api.get<GupshupDiagnoseResult>(`/gupshupChannelDiagnose/${whatsappId}`)
}

export interface GupshupRevalidateWarning {
  code: string
  probe: GupshupProbeId | string
  detail: string | null
  needsRevalidation: boolean
}

export interface GupshupRevalidateResult {
  success: boolean
  data?: unknown
  warnings: GupshupRevalidateWarning[]
  needsRevalidation: boolean
}

export async function revalidateGupshupWebhook(whatsappId: number) {
  return api.post<GupshupRevalidateResult>(
    `/gupshupChannelRevalidateWebhook/${whatsappId}`,
  )
}

export async function healthCheckGupshup(whatsappId: number) {
  return api.get<GupshupHealthCheckResult>(
    `/gupshup/channels/${whatsappId}/health`,
  )
}
