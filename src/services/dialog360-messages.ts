import api from "@/lib/api"
import type { Dialog360Template } from "@/types/dialog360"

// ─── Text & media ─────────────────────────────────────────────────────────────

/** Dialog360: texto. Payload deve incluir from, channelId, ticketId, body. */
export async function sendDialog360Text(data: Record<string, unknown>) {
  return api.post("/dialog360/sendText", data)
}

/** Dialog360: mídia genérica (image/video/audio/doc) — FormData. */
export async function sendDialog360Media(formData: FormData) {
  return api.post("/dialog360/sendDoc", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendDialog360Image(formData: FormData) {
  return api.post("/dialog360/sendImage", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendDialog360Video(formData: FormData) {
  return api.post("/dialog360/sendVideo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendDialog360Audio(formData: FormData) {
  return api.post("/dialog360/sendAudio", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendDialog360Doc(formData: FormData) {
  return api.post("/dialog360/sendDoc", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendDialog360Sticker(formData: FormData) {
  return api.post("/dialog360/sendSticker", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

// ─── Interactive ──────────────────────────────────────────────────────────────

export async function sendDialog360Button(data: Record<string, unknown>) {
  return api.post("/dialog360/sendButton", data)
}

export async function sendDialog360List(data: Record<string, unknown>) {
  return api.post("/dialog360/sendList", data)
}

export async function sendDialog360ReplyButtons(data: Record<string, unknown>) {
  return api.post("/dialog360/sendReplyButtons", data)
}

export async function sendDialog360CTAURL(data: Record<string, unknown>) {
  return api.post("/dialog360/sendCTAURL", data)
}

export async function sendDialog360Flow(data: Record<string, unknown>) {
  return api.post("/dialog360/sendFlow", data)
}

export async function sendDialog360Location(data: Record<string, unknown>) {
  return api.post("/dialog360/sendLocation", data)
}

export async function sendDialog360LocationRequest(
  data: Record<string, unknown>,
) {
  return api.post("/dialog360/sendLocationRequest", data)
}

export async function sendDialog360Address(data: Record<string, unknown>) {
  return api.post("/dialog360/sendAddress", data)
}

export async function sendDialog360Contact(data: Record<string, unknown>) {
  return api.post("/dialog360/sendContact", data)
}

export async function sendDialog360Reaction(data: Record<string, unknown>) {
  return api.post("/dialog360/sendReaction", data)
}

// ─── Templates ────────────────────────────────────────────────────────────────

/** Busca templates Dialog360 aprovados pelo canal. */
export async function getDialog360Templates(channelId: number | string) {
  const { data } = await api.get(
    `/dialog360/templates/${encodeURIComponent(String(channelId))}`,
  )
  const list: Dialog360Template[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown })?.data)
      ? ((data as { data: Dialog360Template[] }).data)
      : []
  // 360dialog (/v1/configs/templates) devolve status em minúsculo ("approved").
  // Normaliza o casing antes de comparar — o filtro estrito "APPROVED" descartava
  // todos os aprovados e a tela de atendimento ficava vazia ("Nenhum template").
  return list.filter((t) => !t.status || String(t.status).toUpperCase() === "APPROVED")
}

export async function sendDialog360Template(data: Record<string, unknown>) {
  return api.post("/dialog360/sendTemplate", data)
}

export async function sendDialog360TemplateComponents(
  data: Record<string, unknown>,
) {
  return api.post("/dialog360/sendTemplateText", data)
}

export async function sendDialog360TemplateMarketing(
  data: Record<string, unknown>,
) {
  return api.post("/dialog360/sendTemplateMarketing", data)
}

export async function sendDialog360TemplateAuth(data: Record<string, unknown>) {
  return api.post("/dialog360/sendTemplateAuth", data)
}

export async function sendDialog360TemplateCarousel(
  data: Record<string, unknown>,
) {
  return api.post("/dialog360/sendTemplateCarousel", data)
}

// ─── Catalog / commerce ───────────────────────────────────────────────────────

export async function sendDialog360Catalog(data: Record<string, unknown>) {
  return api.post("/dialog360/sendCatalog", data)
}

export async function sendDialog360SingleProduct(
  data: Record<string, unknown>,
) {
  return api.post("/dialog360/sendSingleProduct", data)
}

export async function sendDialog360MultiProduct(data: Record<string, unknown>) {
  return api.post("/dialog360/sendMultiProduct", data)
}
