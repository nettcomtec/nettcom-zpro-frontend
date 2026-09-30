import api from "@/lib/api";
import type { AxiosProgressEvent } from "axios";

/** Retorna o endpoint de envio de mensagem conforme o canal (como no front legado InputMensagem). */
function getMessageSendPath(channel: string | undefined, ticketId: number): string {
  const ch = (channel || "").toLowerCase();
  if (ch.includes("hub")) return `/hub-message/${ticketId}`;
  if (ch.includes("meow")) return `/meow-message/${ticketId}`;
  if (ch.includes("evogo")) return `/evogo-message/${ticketId}`;
  if (ch.includes("evo") || ch === "evolution") return `/evo-message/${ticketId}`;
  if (ch.includes("uazapi")) return `/uazapi-message/${ticketId}`;
  if (ch.includes("zapi")) return `/zapi-message/${ticketId}`;
  if (ch.includes("webchat")) return `/webchat-message/${ticketId}`;
  if (ch.includes("linkedin")) return `/linkedin-message/${ticketId}`;
  if (ch.includes("mercadolivre")) return `/ml-message/${ticketId}`;
  if (ch.includes("olx")) return `/olx-message/${ticketId}`;
  if (ch.includes("youtube")) return `/yt-message/${ticketId}`;
  if (ch.includes("tiktok")) return `/tt-message/${ticketId}`;
  return `/messages/${ticketId}`;
}

export async function fetchMessages(ticketId: number, params?: { pageNumber?: number; markAsRead?: boolean }) {
  return api.get(`/messages/${ticketId}`, { params });
}

export async function fetchTicketMediaCount(ticketId: number) {
  return api.get(`/messages/${ticketId}/media-count`);
}

export async function sendMessage(
  ticketId: number,
  data: FormData | Record<string, unknown>,
  options?: { channel?: string; onUploadProgress?: (e: AxiosProgressEvent) => void }
) {
  const path = getMessageSendPath(options?.channel, ticketId);
  const isFormData = data instanceof FormData;
  return api.post(path, data, isFormData ? {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
    onUploadProgress: options?.onUploadProgress,
  } : { onUploadProgress: options?.onUploadProgress });
}

/** Baileys / WhatsApp (no-redis path): texto ou mídia via /noRedis */
export async function sendNoRedis(
  data: FormData | Record<string, unknown>,
  options?: { onUploadProgress?: (e: AxiosProgressEvent) => void }
) {
  const isFormData = data instanceof FormData;
  return api.post("/noRedis", data, isFormData ? {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
    onUploadProgress: options?.onUploadProgress,
  } : { onUploadProgress: options?.onUploadProgress });
}

/** WABA: texto via API Meta (não usa /messages). Payload deve incluir from, tokenApi, ticketId. */
export async function sendTextWaba(data: Record<string, unknown>) {
  return api.post("/wabametaText", data);
}

/** Instagram: texto via API Meta. Payload deve incluir from, tokenApi, ticketId, body. */
export async function sendTextInstagramMeta(data: Record<string, unknown>) {
  return api.post("/instagramMetaText", data);
}

/** Messenger: texto via API Meta. Payload deve incluir from, tokenApi, ticketId, body. */
export async function sendTextMessengerMeta(data: Record<string, unknown>) {
  return api.post("/messengerMetaText", data);
}

/** Dialog360 BSP: texto via gateway 360dialog. Payload deve incluir whatsappId/tokenApi, ticketId, body, idFront. */
export async function sendTextDialog360(data: Record<string, unknown>) {
  return api.post("/dialog360/sendText", data);
}

/** Gupshup BSP: texto via gateway Gupshup. Payload deve incluir whatsappId/tokenApi, ticketId, body, idFront. */
export async function sendTextGupshup(data: Record<string, unknown>) {
  return api.post("/gupshupSendText", data);
}

/** WABA: mídia via API Meta. FormData com campos esperados pelo backend. */
export async function sendMediaWaba(
  formData: FormData,
  options?: { onUploadProgress?: (e: AxiosProgressEvent) => void }
) {
  return api.post("/wabametaFile/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
    onUploadProgress: options?.onUploadProgress,
  });
}

/** WABA: figurinha (image/webp) via endpoint dedicado /wabametaSticker. */
export async function sendStickerWaba(formData: FormData) {
  return api.post("/wabametaSticker/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

/**
 * Webmail/Email: envio de e-mail (canais webmail e email).
 * PLANO_EMAIL_MASSA §5.4: se o destinatário pediu descadastro, o backend devolve
 * 409 ERR_EMAIL_OPTOUT — o wrapper mostra o dialog global de confirmação e, se
 * o atendente confirmar, reenvia com allowOptOutOverride. Centralizado AQUI para
 * cobrir todos os pontos de envio do app (atendimento, novo ticket, funil, header).
 */
export async function sendEmailWebmail(whatsappId: number, payload: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  ticketId?: number;
  cc?: string[];
  bcc?: string[];
  attachments?: { filename: string; content: string; contentType?: string }[];
  inReplyTo?: string;
  references?: string[];
  allowOptOutOverride?: boolean;
}) {
  try {
    return await api.post(`/wbot-email/send/${whatsappId}`, payload);
  } catch (err: unknown) {
    // lib/api.ts rejeita com `error.response || error`: status/corpo chegam na RAIZ.
    // Ler só `err.response` nunca detectava o 409 e o aviso de descadastro não abria.
    type OptOutBody = { error?: string; optOut?: { createdAt?: string } };
    const e = err as { status?: number; data?: OptOutBody; response?: { status?: number; data?: OptOutBody } } | null;
    const status = e?.status ?? e?.response?.status;
    const data = e?.data ?? e?.response?.data;
    if (status === 409 && data?.error === "ERR_EMAIL_OPTOUT" && !payload.allowOptOutOverride) {
      const { confirmEmailOptOut } = await import("@/stores/email-optout-confirm-store");
      const confirmed = await confirmEmailOptOut(data?.optOut?.createdAt || null);
      if (confirmed) {
        return api.post(`/wbot-email/send/${whatsappId}`, { ...payload, allowOptOutOverride: true });
      }
    }
    throw err;
  }
}

/** Alias mais semântico para o canal IMAP/SMTP genérico. */
export const sendEmailImap = sendEmailWebmail;

/** DELETE /messages — sends { id (DB), messageId (WA id) } as the legacy front's DeletarMensagem */
export async function deleteMessage(data: { id: string | number; messageId?: string }) {
  return api.delete("/messages", { data });
}

/** Default edit (whatsapp/baileys/waba etc): POST /messages/editMessage */
export async function editMessage(data: { messageId: string; ticketId: number; body: string; newBody: string }) {
  return api.post("/messages/editMessage", data);
}

/** Meow edit */
export async function editMessageMeow(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/meow-edition/${ticketId}`, data);
}

/** Evo edit */
export async function editMessageEvo(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/evo-edition/${ticketId}`, data);
}

/** Evolution Go edit */
export async function editMessageEvoGo(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/evogo-edition/${ticketId}`, data);
}

/** Zapi edit */
export async function editMessageZapi(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/zapi-edition/${ticketId}`, data);
}

/** Uazapi edit */
export async function editMessageUazapi(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/uazapi-edition/${ticketId}`, data);
}

/** Editar corpo de mensagem agendada (ainda não enviada): PATCH /messagesSchedule/:id */
export async function updateScheduledMessageBody(id: number, body: string) {
  return api.patch(`/messagesSchedule/${id}`, { body });
}

/** Encaminhar mensagem para um contato: { messages: [fullMsg], contact } */
export async function forwardMessage(data: { messages: Record<string, unknown>[]; contact: Record<string, unknown> }) {
  return api.post("/forward-messages", data);
}

/** Encaminhar para outro canal: { messages: [fullMsg], contact, channel, channelId } */
export async function forwardToOtherChannel(data: { messages: Record<string, unknown>[]; contact: Record<string, unknown>; channel: string; channelId: number }) {
  return api.post("/forward-other-channel-messages", data);
}

export async function sendVcard(ticketId: number, data: { fullName: string; phoneNumber: string; wuid: string }) {
  return api.post(`/messages/${ticketId}/vcard`, { contact: data });
}

export async function sendLocation(ticketId: number, data: { latitude: number; longitude: number; name?: string; address?: string }) {
  return api.post(`/messages/${ticketId}/location`, { location: data });
}

/** Default reaction (whatsapp/baileys): POST /messages/reactionMessage */
export async function sendReaction(data: { messageId: string; ticketId: number; reaction: string }) {
  return api.post("/messages/reactionMessage", data);
}

/** WABA reaction */
export async function sendReactionWaba(data: Record<string, unknown>) {
  return api.post("/wabametaReaction", data);
}

/** Instagram reaction */
export async function sendReactionInstagram(data: Record<string, unknown>) {
  return api.post("/instagramMetaReaction", data);
}

/** Messenger reaction */
export async function sendReactionMessenger(data: Record<string, unknown>) {
  return api.post("/messengerMetaReaction", data);
}

/** Meow reaction */
export async function sendReactionMeow(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/meow-react/${ticketId}`, data);
}

/** Evo reaction */
export async function sendReactionEvo(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/evo-react/${ticketId}`, data);
}

/** Evolution Go reaction */
export async function sendReactionEvoGo(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/evogo-react/${ticketId}`, data);
}

/** Uazapi reaction */
export async function sendReactionUazapi(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/uazapi-react/${ticketId}`, data);
}

/** Zapi reaction */
export async function sendReactionZapi(ticketId: number, data: Record<string, unknown>) {
  return api.post(`/zapi-react/${ticketId}`, data);
}

export async function sendTypingIndicator(ticketId: number, ticketData?: Record<string, unknown>) {
  if (!ticketData?.contact || !(ticketData as { whatsapp?: { id?: number } }).whatsapp?.id) {
    return Promise.resolve(); // Backend exige ticket com contact e whatsapp
  }
  return api.post(`/messages/${ticketId}/typing`, { state: "composing", ticket: ticketData });
}

export async function sendStopTypingIndicator(ticketId: number, ticketData?: Record<string, unknown>) {
  if (!ticketData?.contact || !(ticketData as { whatsapp?: { id?: number } }).whatsapp?.id) {
    return Promise.resolve();
  }
  return api.post(`/messages/${ticketId}/paused`, { state: "paused", ticket: ticketData });
}

export async function sendRecordingIndicator(ticketId: number, ticketData?: Record<string, unknown>) {
  if (!ticketData?.contact || !(ticketData as { whatsapp?: { id?: number } }).whatsapp?.id) {
    return Promise.resolve(); // Backend exige ticket com contact e whatsapp
  }
  return api.post(`/messages/${ticketId}/recording`, { state: "recording", ticket: ticketData });
}

export async function searchMessages(params: { searchParam?: string; searchTerm?: string; pageNumber?: number; ticketId?: number }) {
  // Backend espera searchTerm; manter compat com searchParam
  const { searchParam, searchTerm, ...rest } = params;
  return api.get("/searchMessage", { params: { searchTerm: searchTerm || searchParam, ...rest } });
}

export async function exportMessages(ticketId: number, asBlob = false) {
  return api.get(`/exportMessages/${ticketId}`, asBlob ? { responseType: "blob" } : {});
}

/** Enviar conversa avulsa (sem ticket existente) — front legado: TextoIndividual */
export async function sendIndividualMessage(data: {
  whatsappId: number;
  whatsappType: string;
  number: string;
  message: string;
  desiredStatus?: "open" | "pending";
}) {
  return api.post("/individual/", data);
}

export async function syncOldMessagesByUser(data: {
  whatsappId: number;
  limit: number;
  tenantId: number;
  contactId: string;
}) {
  return api.post("/messages/syncOldByUser", data);
}

export async function sendScheduledMessage(data: Record<string, unknown>) {
  return api.post("/messagesSchedule", data);
}

export async function fetchQuickReplies() {
  return api.get("/fastreply");
}

// ── Hub-specific endpoints ────────────────────────────────────────────────

/** Lista templates do Hub (hub_whatsapp_business_account) */
export async function listHubTemplates(data: { whatsappId: number }) {
  return api.post("/hub-template/", data);
}

/** Envia template via Hub */
export async function sendHubTemplate(data: Record<string, unknown>) {
  return api.post("/send-template/", data);
}

// ── Group / mention / ghost endpoints ─────────────────────────────────────

/** Mensagem fantasma (ghost) — grupos Baileys/WhatsApp */
export async function sendGhostMessage(data: Record<string, unknown>) {
  return api.post("/messages/ghostMessage", data);
}

/** Mencionar participantes específicos */
export async function sendMentionMessage(data: Record<string, unknown>) {
  return api.post("/messages/mentionMessage", data);
}

/** Participante de grupo para o autocomplete de menção (@) */
export interface MentionParticipant {
  userId: string; // JID (ex: 5511999@s.whatsapp.net) ou lid; para wweb é só o número
  name: string;
  // Telefone do participante quando o grupo o identifica por LID — usado no
  // token "@numero" do texto. Ausente em backend antigo (cai no userId).
  number?: string;
}

/** Lista participantes do grupo (com nome resolvido) para o picker de @menção */
export async function listMentionParticipants(data: {
  channel: string;
  ticket: string; // número do grupo (contact.number)
  whatsappId: number;
  wabaId?: string;
}) {
  return api.post<{ participants: MentionParticipant[] }>("/messages/listParticipants", data);
}

/** Mencionar todos os participantes */
export async function sendMentionAllMessage(data: Record<string, unknown>) {
  return api.post("/messages/mentionAllMessage", data);
}

/** Botão (não-WABA) via /sendButton */
export async function sendButtonMessage(data: Record<string, unknown>) {
  return api.post("/sendButton", data);
}

// ── Interactive messages (Baileys) ────────────────────────────────────────

export async function sendInteractiveQuickReply(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/quickReply", data);
}

export async function sendInteractiveSingleSelect(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/singleSelect", data);
}

export async function sendInteractiveCatalog(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/catalog", data);
}

export async function sendInteractiveCarousel(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/carousel", data);
}

export async function sendInteractiveCTAButtons(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/ctaButtons", data);
}

export async function sendInteractiveMenuText(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/menuText", data);
}

export async function sendInteractivePoll(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/poll", data);
}

export async function sendInteractivePixButton(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/pixButton", data);
}

export async function sendInteractiveCtaCopy(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/ctaCopy", data);
}

export async function sendInteractiveCtaUrl(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/ctaUrl", data);
}

export async function sendInteractiveCtaCall(data: Record<string, unknown>) {
  return api.post("/messagesInteractive/ctaCall", data);
}

// ── WABA Meta-specific endpoints ──────────────────────────────────────────

export async function sendWabaButtons(data: Record<string, unknown>) {
  return api.post("/wabametaButton", data);
}

export async function sendWabaList(data: Record<string, unknown>) {
  return api.post("/wabametaList", data);
}

export async function sendWabaCTAURL(data: Record<string, unknown>) {
  return api.post("/wabametaCTAURL/", data);
}

export async function sendWabaReplyButtons(data: Record<string, unknown>) {
  return api.post("/wabametaReplyButtons/", data);
}

export async function sendWabaAddress(data: Record<string, unknown>) {
  return api.post("/wabametaAddress/", data);
}

export async function sendWabaLocationRequest(data: Record<string, unknown>) {
  return api.post("/wabametaLocationRequest/", data);
}

// Pedido oficial do telefone ao cliente (contato que chegou sem numero, com nome
// de usuario do WhatsApp). Rota nova: servidor antigo responde 404 e a tela esconde
// a acao. Body: { tokenApi, from, ticketId, bodyText }.
export async function sendWabaRequestContactInfo(data: Record<string, unknown>) {
  return api.post("/wabametaRequestContactInfo/", data);
}

export async function sendWabaLocationMsg(data: Record<string, unknown>) {
  return api.post("/wabametaLocation/", data);
}

export async function sendWabaFlow(data: Record<string, unknown>) {
  return api.post("/wabametaFlow/", data);
}

/** Busca templates WABA aprovados via tokenApi */
export async function getWabaTemplates(tokenApi: string) {
  const { data } = await api.get(`/wabametaTemplate/${encodeURIComponent(tokenApi)}`);
  const list: WabaTemplate[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  return list.filter((t) => !t.status || t.status === "APPROVED");
}

/** Envia template WABA para um ticket individual (simples, sem variáveis) */
export async function sendWabaTemplateMsg(data: Record<string, unknown>) {
  return api.post("/wabametaTemplate/", data);
}

/** Envia template WABA com componentes (variáveis, header, botões) */
export async function sendWabaTemplateComponents(data: Record<string, unknown>) {
  return api.post("/wabametaTemplateComponents", data);
}

/** Envia template WABA marketing com componentes */
export async function sendWabaTemplateMarketingComponents(data: Record<string, unknown>) {
  return api.post("/wabametaMarketingTemplateComponents", data);
}

/** Favoritar/desfavoritar mensagem */
export async function toggleStarMessage(messageId: string) {
  return api.post("/messages/starMessage", { messageId });
}

/** Buscar mensagens favoritadas de um ticket */
export async function fetchStarredMessages(ticketId: number) {
  return api.get(`/messages/${ticketId}/starred`);
}

/** Fixar mensagem com duração */
export async function pinMessage(messageId: string, duration: "24h" | "7d" | "30d" | "always") {
  return api.post("/messages/pinMessage", { messageId, duration });
}

/** Desafixar mensagem */
export async function unpinMessage(messageId: string) {
  return api.post("/messages/unpinMessage", { messageId });
}

/** Buscar mensagens fixadas de um ticket */
export async function fetchPinnedMessages(ticketId: number) {
  return api.get<{ messages: import("@/stores/ticket-store").Message[] }>(`/messages/${ticketId}/pinned`);
}

export interface WabaTemplate {
  name: string;
  language: string;
  status?: string;
  category?: string;
  components?: Array<{ type: string; format?: string; text?: string; buttons?: Array<{type: string; text: string; url?: string}> }>;
}

// ── WABA Meta: Product & Catalog ─────────────────────────────────────────────

export async function sendWabaSingleProduct(data: Record<string, unknown>) {
  return api.post("/wabametaSingleProduct/", data);
}

export async function sendWabaMultiProduct(data: Record<string, unknown>) {
  return api.post("/wabametaMultiProduct/", data);
}

export async function sendWabaCatalog(data: Record<string, unknown>) {
  return api.post("/wabametaCatalog/", data);
}

// ── WABA Meta: Template Auth & Carousel ──────────────────────────────────────

export async function sendWabaTemplateAuth(data: Record<string, unknown>) {
  return api.post("/wabametaTemplateAuth/", data);
}

export async function sendWabaTemplateCarousel(data: Record<string, unknown>) {
  return api.post("/wabametaTemplateCarousel/", data);
}

// ── Instagram Meta: Interactive & Engagement ─────────────────────────────────

export async function sendInstagramQuickReply(data: Record<string, unknown>) {
  return api.post("/instagramMetaQuickReply/", data);
}

export async function sendInstagramGenericTemplate(data: Record<string, unknown>) {
  return api.post("/instagramMetaGenericTemplate/", data);
}

// Texto via tag HUMAN_AGENT (janela de 7 dias) — usado quando a janela de 24h fechou.
export async function sendInstagramHumanAgentText(data: Record<string, unknown>) {
  return api.post("/instagramMetaHumanAgentText/", data);
}

export async function sendInstagramPrivateReply(data: Record<string, unknown>) {
  return api.post("/instagramMetaPrivateReply/", data);
}

export async function sendInstagramSenderAction(data: Record<string, unknown>) {
  return api.post("/instagramMetaSenderAction/", data);
}

export async function sendInstagramButtonTemplate(data: Record<string, unknown>) {
  return api.post("/instagramMetaButtonTemplate/", data);
}

export async function getInstagramIceBreakers(tokenApi: string) {
  return api.get("/instagramMetaIceBreakers/", { params: { tokenApi } });
}

export async function setInstagramIceBreakers(data: Record<string, unknown>) {
  return api.post("/instagramMetaIceBreakers/", data);
}

export async function deleteInstagramIceBreakers(data: Record<string, unknown>) {
  return api.delete("/instagramMetaIceBreakers/", { data });
}

export async function getInstagramPersistentMenu(tokenApi: string) {
  return api.get("/instagramMetaPersistentMenu/", { params: { tokenApi } });
}

export async function setInstagramPersistentMenu(data: Record<string, unknown>) {
  return api.post("/instagramMetaPersistentMenu/", data);
}

export async function deleteInstagramPersistentMenu(data: Record<string, unknown>) {
  return api.delete("/instagramMetaPersistentMenu/", { data });
}

// ── Messenger Meta: Interactive & Engagement ─────────────────────────────────

export async function sendMessengerQuickReply(data: Record<string, unknown>) {
  return api.post("/messengerMetaQuickReply/", data);
}

export async function sendMessengerGenericTemplate(data: Record<string, unknown>) {
  return api.post("/messengerMetaGenericTemplate/", data);
}

export async function listMessengerTemplates(whatsappId: number | string) {
  return api.get(`/messengerMetaTemplates/${whatsappId}`);
}

export async function sendMessengerTemplateByName(data: Record<string, unknown>) {
  return api.post("/messengerMetaTemplateByName/", data);
}

export async function createMessengerUtilityTemplate(data: Record<string, unknown>) {
  return api.post("/messengerMetaTemplateUtilityCreate/", data);
}

export async function editMessengerUtilityTemplate(data: Record<string, unknown>) {
  return api.post("/messengerMetaTemplateUtilityEdit/", data);
}

export async function deleteMessengerTemplate(whatsappId: number | string, templateName: string) {
  return api.delete(`/messengerMetaTemplate/${whatsappId}/${encodeURIComponent(templateName)}`);
}

export async function sendMessengerButtonTemplate(data: Record<string, unknown>) {
  return api.post("/messengerMetaButtonTemplate/", data);
}

export async function sendMessengerMediaTemplate(data: Record<string, unknown>) {
  return api.post("/messengerMetaMediaTemplate/", data);
}

export async function sendMessengerPrivateReply(data: Record<string, unknown>) {
  return api.post("/messengerMetaPrivateReply/", data);
}

export async function sendMessengerSenderAction(data: Record<string, unknown>) {
  return api.post("/messengerMetaSenderAction/", data);
}

export async function sendMessengerMessageTag(data: Record<string, unknown>) {
  return api.post("/messengerMetaMessageTag/", data);
}

export async function sendMessengerReceiptTemplate(data: Record<string, unknown>) {
  return api.post("/messengerMetaReceiptTemplate/", data);
}

// Greeting Text (Messenger)
export async function getMessengerGreetingText(tokenApi: string) {
  return api.get("/messengerMetaGreetingText/", { params: { tokenApi } });
}

export async function setMessengerGreetingText(data: Record<string, unknown>) {
  return api.post("/messengerMetaGreetingText/", data);
}

export async function deleteMessengerGreetingText(data: Record<string, unknown>) {
  return api.delete("/messengerMetaGreetingText/", { data });
}

// Personas (Messenger)
export async function listMessengerPersonas(tokenApi: string) {
  return api.get("/messengerMetaPersonas/", { params: { tokenApi } });
}

export async function createMessengerPersona(data: Record<string, unknown>) {
  return api.post("/messengerMetaPersonas/", data);
}

export async function deleteMessengerPersona(data: Record<string, unknown>) {
  return api.delete("/messengerMetaPersonas/", { data });
}

// Customer Feedback Template (Messenger)
export async function sendMessengerCustomerFeedback(data: Record<string, unknown>) {
  return api.post("/messengerMetaCustomerFeedback/", data);
}

// ── Facebook Page ─────────────────────────────────────────────────────────────

export async function listFacebookPagePosts(whatsappId: string, params?: { limit?: number; nextUrl?: string }) {
  return api.get(`/messengerPagePosts/${whatsappId}`, { params });
}

export async function getFacebookPostComments(postId: string, params?: { whatsappId: string; limit?: number; nextUrl?: string }) {
  return api.get(`/messengerPostComments/${postId}`, { params });
}

// ── Instagram Mentions ────────────────────────────────────────────────────────

export async function listInstagramTags(whatsappId: string, params?: { limit?: number; nextUrl?: string }) {
  return api.get(`/instagramTags/${whatsappId}`, { params });
}

export async function listInstagramMentions(whatsappId: string, params?: { limit?: number; nextUrl?: string }) {
  return api.get(`/instagramMentions/${whatsappId}`, { params });
}

export async function replyInstagramMention(data: Record<string, unknown>) {
  return api.post("/instagramReplyMention", data);
}
