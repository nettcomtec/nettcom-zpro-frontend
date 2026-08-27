// Servicos Gupshup-Meta (templates + profile) — espelha waba-meta.ts mas
// apontando para /gupshup/*. NAO importa waba-meta.

import api from "@/lib/api"
import type { GupshupTemplate } from "@/types/gupshup"

// ─── Templates ──────────────────────────────────────────────────────────────

// opts.includeAll = true devolve TODOS os status (PENDING/REJECTED/PAUSED/...).
// Default (false) filtra so aprovados — correto pro picker de envio (atendimento/
// massa). A tela de gestao (/configuracoes -> bsp) passa includeAll pra ver tudo.
export async function listGupshupTemplates(appId: string, opts?: { includeAll?: boolean }) {
  const { data } = await api.get<unknown>(`/gupshup/templates/${encodeURIComponent(appId)}`)
  return normalizeTemplateList(data, opts?.includeAll)
}

export async function listGupshupTemplatesByWhatsappId(whatsappId: number, opts?: { includeAll?: boolean }) {
  const { data } = await api.get<unknown>(`/gupshup/templates-by-whatsapp/${whatsappId}`)
  return normalizeTemplateList(data, opts?.includeAll)
}

// Normaliza resposta: backend pode devolver array direto, {templates: []} ou {data: []}.
// Por padrao filtra apenas templates aprovados (alinha com getWabaTemplates / envio).
// includeAll preserva todos os status pra tela de gestao.
function normalizeTemplateList(data: any, includeAll?: boolean): GupshupTemplate[] {
  const list: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.templates)
      ? data.templates
      : Array.isArray(data?.data)
        ? data.data
        : []
  const mapped = list.map((tmpl) => ({
    ...tmpl,
    // Gupshup Enterprise (Customer Account, GET /wa/app/{appId}/template) devolve a
    // shape proprietaria com `elementName`/`languageCode` em vez de `name`/`language`
    // (Meta-native). Sem `name`, a tela de atendimento quebra no sort/filter
    // (a.name.toLowerCase()). Normaliza para o shape Meta-native que os consumidores esperam.
    name: tmpl.name ?? tmpl.elementName ?? "",
    language: tmpl.language ?? tmpl.languageCode ?? "",
  }))
  if (includeAll) return mapped
  return mapped.filter(
    (tmpl) => !tmpl.status || ["APPROVED", "ENABLED", "approved", "enabled"].includes(String(tmpl.status)),
  )
}

export async function createGupshupTemplate(data: Record<string, unknown>) {
  return api.post("/gupshup/templates", data)
}

export async function editGupshupTemplate(data: Record<string, unknown>) {
  return api.put("/gupshup/templates", data)
}

export async function deleteGupshupTemplate(data: Record<string, unknown>) {
  return api.delete("/gupshup/templates", { data })
}

// ─── Profile ────────────────────────────────────────────────────────────────

export interface GupshupProfileData {
  about?: string
  address?: string
  description?: string
  email?: string
  vertical?: string
  websites?: string[]
  profilePicUrl?: string
  [key: string]: unknown
}

export async function getGupshupProfile(data: Record<string, unknown>) {
  return api.post("/gupshup/profile/get", data)
}

export async function updateGupshupProfile(data: Record<string, unknown>) {
  return api.post("/gupshup/profile/update", data)
}

// ─── Phone / Webhook (operacoes Partner) ───────────────────────────────────

export async function getGupshupPhoneInfo(data: { whatsappId: number; appId?: string }) {
  return api.post("/gupshup/phone-info", data)
}

export async function overrideGupshupWebhook(data: Record<string, unknown>) {
  return api.post("/gupshup/webhook/override", data)
}

// ─── Analytics / Limits ─────────────────────────────────────────────────────

export async function getGupshupAnalytics(data: Record<string, unknown>) {
  return api.post("/gupshup/analytics", data)
}

export async function getGupshupTemplateAnalytics(data: Record<string, unknown>) {
  return api.post("/gupshup/template-analytics", data)
}

export async function getGupshupLimitsInfo() {
  return api.get("/gupshup/limits")
}

export async function getGupshupPhoneNumbers(appId: string) {
  return api.get(`/gupshup/phone-numbers/${encodeURIComponent(appId)}`)
}

// ─── App Gupshup (apps proprios do tenant) ─────────────────────────────────

export interface AppGupshup {
  id: string | number
  name: string
  appId?: string
  partnerEmail?: string
  webhookConfigured?: boolean
  [key: string]: unknown
}

export async function listActiveAppGupshups() {
  return api.get<AppGupshup[]>("/app-gupshup-tenantActive")
}
