// Tipos Gupshup (BSP Gupshup) — frontend.
// Mantem naming independente de WABA Meta direto e de Dialog360. Quando o
// payload e pass-through Meta (templates, components — V3 Passthrough do
// Partner API), seguimos a mesma forma. Naming exclusivamente "gupshup".

export interface GupshupChannel {
  id: number
  tenantId: number
  whatsappId: number
  // Identidade do app no Partner Gupshup (idempotente: appId Gupshup, nao Meta)
  appId: string | null
  appName?: string | null
  // Tokens — sempre mascarados na resposta da API
  apiKey?: string | null
  apiKeyMasked?: string | null
  appToken?: string | null
  appTokenMasked?: string | null
  appTokenExpiresAt?: string | null
  // Espelho dos campos Meta vindos do Partner Gupshup
  phoneNumberId?: string | null
  wabaId?: string | null
  displayPhoneNumber?: string | null
  verifiedName?: string | null
  qualityRating?: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | string | null
  status?: string | null
  // running = OK; pending = onboarding incompleto; token_expired = refresh necessario;
  // suspended = Meta/Gupshup desabilitou.
  channelStatus?:
    | "running"
    | "pending"
    | "token_expired"
    | "suspended"
    | string
    | null
  webhookUrl?: string | null
  // own_app = AppGupshup proprio do tenant; zdg_oauth = Embedded Signup via Gupshup hosted.
  webhookOrigin?: "own_app" | "zdg_oauth" | "partner" | string | null
  webhookConfiguredAt?: string | null
  partnerOnboardedAt?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface GupshupTemplateButton {
  type: string
  text: string
  url?: string
  phone_number?: string
  [key: string]: unknown
}

export interface GupshupTemplateComponent {
  type: string
  format?: string
  text?: string
  buttons?: GupshupTemplateButton[]
  [key: string]: unknown
}

export interface GupshupTemplate {
  id?: string
  // Gupshup retorna `elementName` em alguns endpoints; mantemos compat ao expor
  // ambos no consumidor.
  name: string
  elementName?: string
  language: string
  status?: string
  category: string
  namespace?: string
  components?: GupshupTemplateComponent[]
  [key: string]: unknown
}

export type GupshupCallStatus =
  | "RINGING"
  | "ACCEPTED"
  | "REJECTED"
  | "TERMINATED"
  | "COMPLETED"
  | "MISSED"

export type GupshupCallDirection = "USER_INITIATED" | "BUSINESS_INITIATED"

export interface GupshupCall {
  callId: string
  from: string
  to: string
  phoneNumberId: string
  channelId?: number
  appId?: string | null
  direction: GupshupCallDirection
  sdpOffer?: string
  contactName?: string
  contactPic?: string
  startedAt?: number
  endedAt?: number
  duration?: number
  status?: GupshupCallStatus
}

export interface GupshupHealthCheckResult {
  ok: boolean
  channelStatus?: string
  qualityRating?: string
  displayPhoneNumber?: string
  verifiedName?: string
  webhookConfigured?: boolean
  webhookUrl?: string
  apiKeyValid?: boolean
  appTokenValid?: boolean
  errors?: string[]
  warnings?: string[]
  [key: string]: unknown
}

export interface GupshupHijackDetails {
  apiUrlMasked: string
  registeredAt: string | null
  identifier?: string | null
  callbackUrl?: string | null
}

export interface GupshupPartnerOnboardingState {
  partnerEmail?: string | null
  appId?: string | null
  appName?: string | null
  onboardedAt?: string | null
  revoked?: string | null
}

// Modos de criacao de canal (UI):
//   - signup : Embedded Signup hospedado pelo Gupshup (gera URL via Partner API
//              `generate-embed-signed-link`)
//   - manual : usuario cola appId + appToken manualmente (workflow self-serve do
//              dashboard Gupshup)
export type GupshupCreateChannelMode = "signup" | "manual"
