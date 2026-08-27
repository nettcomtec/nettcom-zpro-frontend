// Servico generico Gupshup — operacoes CRUD do canal e Partner Onboarding.
// Endpoints sob /gupshup/* expostos pelo backend (W1-B).

import api from "@/lib/api"
import type { GupshupChannel } from "@/types/gupshup"

// ─── Channels CRUD ──────────────────────────────────────────────────────────

export async function listGupshupChannels() {
  return api.get<GupshupChannel[]>("/gupshup/channels")
}

export async function getGupshupChannel(whatsappId: number) {
  return api.get<GupshupChannel>(`/gupshup/channels/${whatsappId}`)
}

export interface GupshupWebhookInfo {
  webhookUrl: string
  callbackSecret: string
  appId: string
  appName?: string
  events: string[]
  instructions: {
    panelUrl: string
    steps: string[]
  }
}

export async function getGupshupWebhookInfo(whatsappId: number, crossTenant = false) {
  return api.get<GupshupWebhookInfo>(
    crossTenant
      ? `/whatsappTenants/actions/${whatsappId}/gupshup-webhook-info`
      : `/gupshup/channels/${whatsappId}/webhook-info`
  )
}

export interface CreateGupshupChannelManualParams {
  name: string
  appId: string
  appToken: string
  apiKey?: string | null
  phoneNumberId?: string | null
  wabaId?: string | null
  webhookOrigin?: "own_app" | "zdg_oauth" | "partner"
}

export async function createGupshupChannelManual(
  data: CreateGupshupChannelManualParams,
) {
  return api.post<GupshupChannel>("/gupshup/channels/manual", data)
}

export interface CreateGupshupChannelSignupParams {
  name: string
  // dados retornados pelo Embedded Signup hospedado pelo Gupshup
  appId: string
  appToken?: string
  apiKey?: string
  phoneNumberId?: string
  wabaId?: string
  partnerEmail?: string
}

export async function createGupshupChannelFromSignup(
  data: CreateGupshupChannelSignupParams,
) {
  return api.post<GupshupChannel>("/gupshup/channels/signup", data)
}

export async function updateGupshupChannel(
  whatsappId: number,
  data: Record<string, unknown>,
) {
  return api.put<GupshupChannel>(`/gupshup/channels/${whatsappId}`, data)
}

export async function deleteGupshupChannel(whatsappId: number) {
  return api.delete(`/gupshup/channels/${whatsappId}`)
}

// ─── Partner Token / Embedded Signup helpers ────────────────────────────────

export interface GupshupEmbeddedSignupLink {
  url: string
  expiresAt?: string
}

export async function generateGupshupEmbeddedSignupLink(params?: {
  partnerEmail?: string
}) {
  return api.post<GupshupEmbeddedSignupLink>("/gupshup/embedded-signup-link", params || {})
}

export async function refreshGupshupAppToken(whatsappId: number) {
  return api.post<{ appTokenExpiresAt?: string; appTokenMasked?: string }>(
    `/gupshup/channels/${whatsappId}/refresh-app-token`,
  )
}

export async function rotateGupshupApiKey(whatsappId: number) {
  return api.post<{ apiKeyMasked?: string }>(
    `/gupshup/channels/${whatsappId}/rotate-api-key`,
  )
}

export async function setGupshupWebhook(whatsappId: number) {
  return api.post<{ webhookUrl: string; webhookConfiguredAt: string }>(
    `/gupshup/channels/${whatsappId}/set-webhook`,
  )
}

// ─── Anti-hijack: takeover registry (BSP-specific) ──────────────────────────

export interface GupshupRegistryTakeoverParams {
  identifier: string
  callbackUrl: string
}

export async function takeoverGupshupRegistry(
  params: GupshupRegistryTakeoverParams,
) {
  return api.post("/gupshup/registry-takeover", params)
}

// ─── Analytics (paridade WABAMeta) ────────────────────────────────────────────

export async function getWABAData(data: {
  wabaId: string
  businessToken: string
  apiVersion?: string
  fields?: string
}) {
  return api.post("/gupshupGetWABAData", data)
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
  return api.post("/gupshupGetWABAAnalytics", data)
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
  return api.post("/gupshupGetWABATemplateAnalytics", data)
}

export async function getWABALimitsInfo() {
  return api.get("/gupshupGetWABALimitsInfo")
}
