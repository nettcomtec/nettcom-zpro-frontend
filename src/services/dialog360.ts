import api from "@/lib/api"
import type {
  Dialog360Channel,
  Dialog360HealthCheckResult,
} from "@/types/dialog360"

// ─── Channels (CRUD + provisioning) ───────────────────────────────────────────

export async function listDialog360Channels() {
  return api.get<Dialog360Channel[]>("/dialog360/channels")
}

export async function getDialog360Channel(channelId: number | string) {
  return api.get<Dialog360Channel>(`/dialog360/channels/${channelId}`)
}

export interface Dialog360WebhookInfo {
  webhookUrl: string
  channelId?: string
  instructions: {
    panelUrl: string
    steps: string[]
    note?: string
  }
}

export async function getDialog360WebhookInfo(whatsappId: number, crossTenant = false) {
  return api.get<Dialog360WebhookInfo>(
    crossTenant
      ? `/whatsappTenants/actions/${whatsappId}/dialog360-webhook-info`
      : `/dialog360/channels/${whatsappId}/webhook-info`
  )
}

export async function createDialog360Channel(data: Record<string, unknown>) {
  return api.post<Dialog360Channel>("/dialog360/channels", data)
}

export async function updateDialog360Channel(
  channelId: number | string,
  data: Record<string, unknown>,
) {
  return api.put<Dialog360Channel>(`/dialog360/channels/${channelId}`, data)
}

export async function deleteDialog360Channel(channelId: number | string) {
  return api.delete(`/dialog360/channels/${channelId}`)
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

/**
 * Chamado pelo callback do oauth-proxy 360dialog (`/dialog360-callback`).
 * Recebe client + channels + state e cria o canal Dialog360 no tenant.
 */
export async function onboardDialog360Partner(data: Record<string, unknown>) {
  return api.post("/dialog360/partnerOnboard", data)
}

export async function manualOnboardDialog360(data: {
  apiKey: string
  phoneNumberId?: string
  wabaId?: string
  displayName?: string
  name?: string
  greetingMessage?: string
}) {
  return api.post("/dialog360/manual/onboard", data)
}

// ─── API key management ───────────────────────────────────────────────────────

export async function rotateDialog360ApiKey(channelId: number | string) {
  return api.post<{ apiKey: string }>(
    `/dialog360/channels/${channelId}/rotateApiKey`,
  )
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export async function setDialog360Webhook(
  channelId: number | string,
  data?: { url?: string },
) {
  return api.post(`/dialog360/channels/${channelId}/setWebhook`, data ?? {})
}

export async function revalidateDialog360Webhook(channelId: number | string) {
  return api.post(`/dialog360/channels/${channelId}/revalidateWebhook`)
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function healthCheckDialog360Channel(channelId: number | string) {
  return api.get<Dialog360HealthCheckResult>(
    `/dialog360/channels/${channelId}/healthCheck`,
  )
}

export async function diagnoseDialog360Channel(channelId: number | string) {
  return api.get<Dialog360HealthCheckResult>(
    `/dialog360/channels/${channelId}/diagnose`,
  )
}

// ─── Phone numbers ────────────────────────────────────────────────────────────

export async function getDialog360PhoneNumbers(channelId: number | string) {
  return api.get(`/dialog360/channels/${channelId}/phoneNumbers`)
}

// ─── Anti-hijacking ───────────────────────────────────────────────────────────

export async function takeoverDialog360Registry(data: {
  phoneNumberId?: string
  wabaId?: string
  identifier?: string
  confirm: boolean
}) {
  return api.post("/dialog360/registryTakeover", data)
}

// ─── Analytics (paridade WABAMeta) ────────────────────────────────────────────

export async function getWABAData(data: {
  wabaId: string
  businessToken: string
  apiVersion?: string
  fields?: string
}) {
  return api.post("/dialog360/getWABAData", data)
}

export async function getWABAAnalytics(data: {
  wabaId: string
  businessToken: string
  apiVersion?: string
  start: number
  end: number
  granularity?: "HALF_HOUR" | "DAILY" | "MONTHLY" | "DAY" | "MONTH"
  conversationAnalytics?: boolean
  pricingAnalytics?: boolean
  phoneNumbers?: string[]
  countryCodes?: string[]
}) {
  return api.post("/dialog360/getWABAAnalytics", data)
}

export async function getWABATemplateAnalytics(data: {
  wabaId: string
  businessToken: string
  apiVersion?: string
  start: string
  end: string
  templateIds?: string[]
  metricTypes?: string[]
}) {
  return api.post("/dialog360/getWABATemplateAnalytics", data)
}

export async function getWABALimitsInfo() {
  return api.get("/dialog360/getWABALimitsInfo")
}
