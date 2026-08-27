// Limites oficiais de caracteres da Meta (WhatsApp Cloud API / Business Management API).
// Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp
// - Mensagens interativas: interactive-list-messages / interactive-reply-buttons-messages / interactive-cta-url-messages
// - Templates: templates/components
// Dialog360 e Gupshup são BSPs sobre a mesma plataforma — os mesmos limites se aplicam.
export const WABA_LIMITS = {
  // Mensagens interativas (lista, reply buttons, CTA URL, produtos)
  headerText: 60,
  listBody: 4096, // corpo de mensagem de LISTA (os demais interativos usam `body`)
  body: 1024, // reply buttons / CTA URL / produtos / catálogo
  footer: 60,
  listButton: 20, // texto do botão que abre a lista
  buttonTitle: 20, // título de reply button / display_text de CTA / CTA de Flow
  sectionTitle: 24,
  rowTitle: 24,
  rowDescription: 72,
  rowId: 200,
  maxSections: 10,
  maxRowsTotal: 10, // 10 linhas SOMADAS entre todas as seções
  maxReplyButtons: 3,
  caption: 1024, // legenda de mídia (imagem/vídeo/documento)

  // Criação de template
  templateName: 512, // minúsculas, números e underscore
  templateHeaderText: 60,
  templateBody: 1024,
  templateFooter: 60,
  templateButtonText: 25, // QUICK_REPLY / URL / PHONE_NUMBER / OTP
  templateUrl: 2000,
  templatePhone: 20,
} as const;
