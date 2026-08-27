// Tipos Dialog360 (BSP 360dialog) — frontend.
// Mantém naming independente de WABA Meta direto; quando o payload é
// pass-through Meta (templates, components), seguimos a mesma forma.

export interface Dialog360Channel {
  id: number
  tenantId: number
  whatsappId: number
  apiKey: string | null
  apiKeyMasked?: string | null
  channelId?: string | null
  phoneNumberId?: string | null
  wabaId?: string | null
  wabaIdMeta?: string | null
  displayPhoneNumber?: string | null
  verifiedName?: string | null
  qualityRating?: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | string | null
  status?: string | null
  channelStatus?: "running" | "pending" | "key_expired" | "suspended" | string | null
  webhookUrl?: string | null
  webhookOrigin?: "own_app" | "zdg_oauth" | "partner" | string | null
  webhookConfiguredAt?: string | null
  partnerOnboardedAt?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface Dialog360TemplateButton {
  type: string
  text: string
  url?: string
  phone_number?: string
  [key: string]: unknown
}

export interface Dialog360TemplateComponent {
  type: string
  format?: string
  text?: string
  buttons?: Dialog360TemplateButton[]
  [key: string]: unknown
}

export interface Dialog360Template {
  id?: string
  name: string
  language: string
  status?: string
  category: string
  namespace?: string
  components?: Dialog360TemplateComponent[]
  [key: string]: unknown
}

export type Dialog360CallStatus =
  | "RINGING"
  | "ACCEPTED"
  | "REJECTED"
  | "TERMINATED"
  | "COMPLETED"
  | "MISSED"

export type Dialog360CallDirection = "USER_INITIATED" | "BUSINESS_INITIATED"

export interface Dialog360Call {
  callId: string
  from: string
  to: string
  phoneNumberId: string
  channelId?: number
  direction: Dialog360CallDirection
  sdpOffer?: string
  contactName?: string
  contactPic?: string
  startedAt?: number
  endedAt?: number
  duration?: number
  status?: Dialog360CallStatus
}

export interface Dialog360HealthCheckResult {
  ok: boolean
  channelStatus?: string
  qualityRating?: string
  displayPhoneNumber?: string
  verifiedName?: string
  webhookConfigured?: boolean
  webhookUrl?: string
  apiKeyValid?: boolean
  errors?: string[]
  warnings?: string[]
  [key: string]: unknown
}

export interface Dialog360HijackDetails {
  apiUrlMasked: string
  registeredAt: string | null
  identifier?: string | null
  callbackUrl?: string | null
}

export interface Dialog360PartnerOnboardingState {
  client?: string | null
  channels?: string[] | null
  revoked?: string | null
}
