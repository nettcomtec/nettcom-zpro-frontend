// Hook wrapper que retorna um conjunto unificado de funcoes "send*" conforme
// o tipo do canal (whatsapp.type). Permite que UIs/compositores tratem WABA,
// Dialog360 e Gupshup como uma unica abstracao "BSP".
//
// Importa apenas dos services oficiais (services/messages, services/dialog360-messages,
// services/gupshup-messages) + os helpers de limite/MIME do lib/.
//
// Nao cria novos tipos: as assinaturas de send variam entre BSPs e o wrapper
// e fino — o caller passa o payload correto para a BSP que esta usando.

import {
  // WABA (vivem em services/messages.ts)
  sendTextWaba,
  sendMediaWaba,
  sendStickerWaba,
  sendWabaButtons,
  sendWabaList,
  sendWabaReplyButtons,
  sendWabaCTAURL,
  sendWabaFlow,
  sendWabaLocationMsg,
  sendWabaLocationRequest,
  sendWabaAddress,
  sendReactionWaba,
  sendWabaTemplateMsg,
  sendWabaTemplateAuth,
  sendWabaTemplateCarousel,
  sendWabaCatalog,
  sendWabaSingleProduct,
  sendWabaMultiProduct,
  getWabaTemplates,
} from "@/services/messages";

import {
  sendDialog360Text,
  sendDialog360Image,
  sendDialog360Video,
  sendDialog360Audio,
  sendDialog360Doc,
  sendDialog360Sticker,
  sendDialog360Button,
  sendDialog360List,
  sendDialog360ReplyButtons,
  sendDialog360CTAURL,
  sendDialog360Flow,
  sendDialog360Location,
  sendDialog360LocationRequest,
  sendDialog360Address,
  sendDialog360Contact,
  sendDialog360Reaction,
  sendDialog360Template,
  sendDialog360TemplateAuth,
  sendDialog360TemplateCarousel,
  sendDialog360Catalog,
  sendDialog360SingleProduct,
  sendDialog360MultiProduct,
  getDialog360Templates,
} from "@/services/dialog360-messages";

import {
  sendGupshupText,
  sendGupshupImage,
  sendGupshupVideo,
  sendGupshupAudio,
  sendGupshupDocument,
  sendGupshupSticker,
  sendGupshupButtons,
  sendGupshupList,
  sendGupshupReplyButtons,
  sendGupshupCTAURL,
  sendGupshupFlow,
  sendGupshupLocationMsg,
  sendGupshupLocationRequest,
  sendGupshupAddress,
  sendGupshupContact,
  sendGupshupReaction,
  sendGupshupTemplateMsg,
  sendGupshupTemplateAuth,
  sendGupshupTemplateCarousel,
  sendGupshupCatalog,
  sendGupshupSingleProduct,
  sendGupshupMultiProduct,
} from "@/services/gupshup-messages";

import { listGupshupTemplatesByWhatsappId } from "@/services/gupshup-meta";

import {
  DIALOG360_LIMITS,
  DIALOG360_EXT_TO_MIME,
} from "@/lib/dialog360-limits";

import {
  GUPSHUP_MEDIA_MAX_BYTES,
  GUPSHUP_ALLOWED_MIME,
} from "@/lib/gupshup-limits";

// Conjunto canonico de funcoes que cada BSP precisa expor para a UI.
// Tipagem propositalmente larga (any) pois assinaturas variam.
export interface ChannelSenderSet {
  sendText: (data: any) => Promise<any>;
  sendImage: (formData: FormData) => Promise<any>;
  sendVideo: (formData: FormData) => Promise<any>;
  sendAudio: (formData: FormData) => Promise<any>;
  sendDoc: (formData: FormData) => Promise<any>;
  sendSticker: (formData: FormData) => Promise<any>;
  sendButton: (data: any) => Promise<any>;
  sendList: (data: any) => Promise<any>;
  sendReplyButtons: (data: any) => Promise<any>;
  sendCTAURL: (data: any) => Promise<any>;
  sendFlow: (data: any) => Promise<any>;
  sendLocation: (data: any) => Promise<any>;
  sendLocationRequest: (data: any) => Promise<any>;
  sendAddress: (data: any) => Promise<any>;
  sendContact?: (data: any) => Promise<any>;
  sendReaction: (data: any) => Promise<any>;
  sendTemplate: (data: any) => Promise<any>;
  sendTemplateAuth: (data: any) => Promise<any>;
  sendTemplateCarousel: (data: any) => Promise<any>;
  sendCatalog: (data: any) => Promise<any>;
  sendSingleProduct: (data: any) => Promise<any>;
  sendMultiProduct: (data: any) => Promise<any>;
  getTemplates: (idOrToken: any) => Promise<any>;
  // Limites/MIME — opcionais; presentes apenas onde existe modulo dedicado
  limits?: Record<string, unknown> | typeof DIALOG360_LIMITS | typeof GUPSHUP_MEDIA_MAX_BYTES;
  extToMime?: Record<string, string> | typeof DIALOG360_EXT_TO_MIME | typeof GUPSHUP_ALLOWED_MIME;
  channel: "waba" | "dialog360" | "gupshup";
}

// WABA nao tem modulo de limites dedicado em lib/ — usa validacoes ad-hoc.
const WABA_SENDER: ChannelSenderSet = {
  sendText: sendTextWaba,
  sendImage: sendMediaWaba,
  sendVideo: sendMediaWaba,
  sendAudio: sendMediaWaba,
  sendDoc: sendMediaWaba,
  sendSticker: sendStickerWaba,
  sendButton: sendWabaButtons,
  sendList: sendWabaList,
  sendReplyButtons: sendWabaReplyButtons,
  sendCTAURL: sendWabaCTAURL,
  sendFlow: sendWabaFlow,
  sendLocation: sendWabaLocationMsg,
  sendLocationRequest: sendWabaLocationRequest,
  sendAddress: sendWabaAddress,
  sendReaction: sendReactionWaba,
  sendTemplate: sendWabaTemplateMsg,
  sendTemplateAuth: sendWabaTemplateAuth,
  sendTemplateCarousel: sendWabaTemplateCarousel,
  sendCatalog: sendWabaCatalog,
  sendSingleProduct: sendWabaSingleProduct,
  sendMultiProduct: sendWabaMultiProduct,
  getTemplates: getWabaTemplates,
  channel: "waba",
};

const DIALOG360_SENDER: ChannelSenderSet = {
  sendText: sendDialog360Text,
  sendImage: sendDialog360Image,
  sendVideo: sendDialog360Video,
  sendAudio: sendDialog360Audio,
  sendDoc: sendDialog360Doc,
  sendSticker: sendDialog360Sticker,
  sendButton: sendDialog360Button,
  sendList: sendDialog360List,
  sendReplyButtons: sendDialog360ReplyButtons,
  sendCTAURL: sendDialog360CTAURL,
  sendFlow: sendDialog360Flow,
  sendLocation: sendDialog360Location,
  sendLocationRequest: sendDialog360LocationRequest,
  sendAddress: sendDialog360Address,
  sendContact: sendDialog360Contact,
  sendReaction: sendDialog360Reaction,
  sendTemplate: sendDialog360Template,
  sendTemplateAuth: sendDialog360TemplateAuth,
  sendTemplateCarousel: sendDialog360TemplateCarousel,
  sendCatalog: sendDialog360Catalog,
  sendSingleProduct: sendDialog360SingleProduct,
  sendMultiProduct: sendDialog360MultiProduct,
  getTemplates: getDialog360Templates,
  limits: DIALOG360_LIMITS,
  extToMime: DIALOG360_EXT_TO_MIME,
  channel: "dialog360",
};

const GUPSHUP_SENDER: ChannelSenderSet = {
  sendText: sendGupshupText,
  sendImage: sendGupshupImage,
  sendVideo: sendGupshupVideo,
  sendAudio: sendGupshupAudio,
  sendDoc: sendGupshupDocument,
  sendSticker: sendGupshupSticker,
  sendButton: sendGupshupButtons,
  sendList: sendGupshupList,
  sendReplyButtons: sendGupshupReplyButtons,
  sendCTAURL: sendGupshupCTAURL,
  sendFlow: sendGupshupFlow,
  sendLocation: sendGupshupLocationMsg,
  sendLocationRequest: sendGupshupLocationRequest,
  sendAddress: sendGupshupAddress,
  sendContact: sendGupshupContact,
  sendReaction: sendGupshupReaction,
  sendTemplate: sendGupshupTemplateMsg,
  sendTemplateAuth: sendGupshupTemplateAuth,
  sendTemplateCarousel: sendGupshupTemplateCarousel,
  sendCatalog: sendGupshupCatalog,
  sendSingleProduct: sendGupshupSingleProduct,
  sendMultiProduct: sendGupshupMultiProduct,
  getTemplates: listGupshupTemplatesByWhatsappId,
  limits: GUPSHUP_MEDIA_MAX_BYTES,
  extToMime: GUPSHUP_ALLOWED_MIME as unknown as Record<string, string>,
  channel: "gupshup",
};

/**
 * Retorna o conjunto de funcoes de envio adequado ao tipo do canal.
 * Default = WABA (caso o caller passe um type desconhecido ou undefined).
 */
export function useChannelSender(type: string | undefined): ChannelSenderSet {
  if (type === "dialog360") return DIALOG360_SENDER;
  if (type === "gupshup") return GUPSHUP_SENDER;
  return WABA_SENDER;
}
