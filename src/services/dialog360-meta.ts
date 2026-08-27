import api from "@/lib/api"
import type { Dialog360Template } from "@/types/dialog360"

// ─── Templates CRUD ───────────────────────────────────────────────────────────
// 360dialog expõe o CRUD de templates via `/v1/configs/templates` (header
// `D360-API-KEY`). O backend proxia para `/dialog360/templates/*`.
// IMPORTANTE: todos os endpoints indexam por `whatsappId` (FK pro Whatsapp),
// NÃO pelo `id` PK do Dialog360Channel. Caller deve passar `channel.whatsappId`.

export async function listDialog360Templates(whatsappId: number | string) {
  return api.get<Dialog360Template[]>(
    `/dialog360/templates/${encodeURIComponent(String(whatsappId))}`,
  )
}

export async function listDialog360TemplatesByWhatsappId(whatsappId: number) {
  return api.get<Dialog360Template[]>(
    `/dialog360/templatesByWhatsappId/${whatsappId}`,
  )
}

export async function createDialog360Template(data: Record<string, unknown>) {
  return api.post("/dialog360/templateCreate", data)
}

export async function editDialog360Template(data: Record<string, unknown>) {
  return api.put("/dialog360/templateEdit", data)
}

export async function deleteDialog360Template(data: Record<string, unknown>) {
  return api.delete("/dialog360/templateDelete", { data })
}

export async function syncDialog360Templates(whatsappId: number | string) {
  return api.post(`/dialog360/templatesSync/${whatsappId}`)
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getDialog360Profile(channelId: number | string) {
  return api.get(`/dialog360/profile/${channelId}`)
}

export async function updateDialog360Profile(data: Record<string, unknown>) {
  return api.post("/dialog360/profileUpdate", data)
}

// ─── WABA data / analytics ────────────────────────────────────────────────────

export async function getDialog360WABAData(data: Record<string, unknown>) {
  return api.post("/dialog360/getWABAData", data)
}

export async function getDialog360Analytics(data: Record<string, unknown>) {
  return api.post("/dialog360/getAnalytics", data)
}

export async function getDialog360TemplateAnalytics(
  data: Record<string, unknown>,
) {
  return api.post("/dialog360/getTemplateAnalytics", data)
}
