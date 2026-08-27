// Servico de mensagens Gupshup — espelha a superficie de envio do WABA Meta
// (25 verbos). Aponta para as rotas /gupshupSend* expostas pelo backend
// (wabaGupshupRoutesZPRO.ts). O backend internamente faz mapping para a V3
// Passthrough do Partner Gupshup.
//
// NAO importa messages.ts nem reusa funcoes WABA — copia independente.

import api from "@/lib/api"

// ─── Texto e midia ──────────────────────────────────────────────────────────

export async function sendGupshupText(data: Record<string, unknown>) {
  return api.post("/gupshupSendText", data)
}

export async function sendGupshupImage(formData: FormData) {
  return api.post("/gupshupSendImage", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendGupshupVideo(formData: FormData) {
  return api.post("/gupshupSendVideo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendGupshupAudio(formData: FormData) {
  return api.post("/gupshupSendAudio", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendGupshupDocument(formData: FormData) {
  return api.post("/gupshupSendDoc", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

export async function sendGupshupSticker(formData: FormData) {
  return api.post("/gupshupSendSticker", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  })
}

// ─── Interativos ────────────────────────────────────────────────────────────

export async function sendGupshupButtons(data: Record<string, unknown>) {
  return api.post("/gupshupSendButton", data)
}

export async function sendGupshupList(data: Record<string, unknown>) {
  return api.post("/gupshupSendList", data)
}

export async function sendGupshupReplyButtons(data: Record<string, unknown>) {
  return api.post("/gupshupSendReplyButtons", data)
}

export async function sendGupshupCTAURL(data: Record<string, unknown>) {
  return api.post("/gupshupSendCTAURL", data)
}

export async function sendGupshupFlow(data: Record<string, unknown>) {
  return api.post("/gupshupSendFlow", data)
}

// ─── Localizacao / Contato / Endereco ───────────────────────────────────────

export async function sendGupshupLocationMsg(data: Record<string, unknown>) {
  return api.post("/gupshupSendLocation", data)
}

export async function sendGupshupLocationRequest(data: Record<string, unknown>) {
  return api.post("/gupshupSendLocationRequest", data)
}

export async function sendGupshupAddress(data: Record<string, unknown>) {
  return api.post("/gupshupSendAddress", data)
}

export async function sendGupshupContact(data: Record<string, unknown>) {
  return api.post("/gupshupSendContact", data)
}

// ─── Reaction / Templates ───────────────────────────────────────────────────

export async function sendGupshupReaction(data: Record<string, unknown>) {
  return api.post("/gupshupSendReaction", data)
}

export async function sendGupshupTemplateMsg(data: Record<string, unknown>) {
  return api.post("/gupshupSendTemplate", data)
}

export async function sendGupshupTemplateComponents(
  data: Record<string, unknown>,
) {
  return api.post("/gupshupSendTemplateText", data)
}

export async function sendGupshupTemplateMarketingComponents(
  data: Record<string, unknown>,
) {
  return api.post("/gupshupSendTemplateMarketing", data)
}

export async function sendGupshupTemplateAuth(data: Record<string, unknown>) {
  return api.post("/gupshupSendTemplateAuth", data)
}

export async function sendGupshupTemplateCarousel(data: Record<string, unknown>) {
  return api.post("/gupshupSendTemplateCarousel", data)
}

// ─── Catalogo / Produto ─────────────────────────────────────────────────────

export async function sendGupshupSingleProduct(data: Record<string, unknown>) {
  return api.post("/gupshupSendSingleProduct", data)
}

export async function sendGupshupMultiProduct(data: Record<string, unknown>) {
  return api.post("/gupshupSendMultiProduct", data)
}

export async function sendGupshupCatalog(data: Record<string, unknown>) {
  return api.post("/gupshupSendCatalog", data)
}

// ─── Status / Read ──────────────────────────────────────────────────────────

export async function markGupshupRead(data: { messageId: string; whatsappId?: number }) {
  return api.post("/gupshupMarkRead", data)
}
