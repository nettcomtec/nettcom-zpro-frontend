// Catálogo das configurações de /configuracoes/geral.
//
// Fonte única de metadados APENAS DE APRESENTAÇÃO (subgrupo visual e tags de
// tema). NÃO contém valores, defaults nem lógica de leitura/escrita — a página
// continua sendo a dona disso via getValue/isEnabled/handleToggle.
//
// Regras que este módulo preserva por construção:
//   - `section` de cada setting é a MESMA de hoje (os 5 cards não mudam de nome,
//     de ordem nem de conteúdo). Isso mantém PageHelp (helpS0..helpS10), o índice
//     de busca e os tutoriais válidos.
//   - `group` é uma subdivisão VISUAL dentro do card, criada só para os dois
//     cards grandes (orgDist com 27 itens e attendanceResources com 26). Cards
//     pequenos ficam sem subgrupo.
//   - `tags` permitem filtrar por tema ATRAVESSANDO os cards, sem mover nenhuma
//     setting de lugar.

/** Chaves i18n dos 5 cards — idênticas às usadas hoje em geral/page.tsx. */
export type SettingSectionKey =
  | "ticketsVisibilityTitle"
  | "botChatbotTitle"
  | "orgDistTitle"
  | "attendanceResourcesTitle"
  | "systemActionsTitle";

export const SETTING_SECTION_ORDER: SettingSectionKey[] = [
  "ticketsVisibilityTitle",
  "botChatbotTitle",
  "orgDistTitle",
  "attendanceResourcesTitle",
  "systemActionsTitle",
];

/** Subgrupos visuais (chaves i18n novas em configGeralPage). */
export type SettingGroupKey =
  // orgDistTitle
  | "groupListing"
  | "groupWaba"
  | "groupPhone"
  | "groupWallet"
  | "groupIntegrations"
  // attendanceResourcesTitle
  | "groupService"
  | "groupReopen"
  | "groupMedia"
  | "groupNotifications"
  | "groupLimits";

/** Ordem de renderização dos subgrupos dentro de cada card. */
export const SETTING_GROUP_ORDER: Record<string, SettingGroupKey[]> = {
  orgDistTitle: ["groupListing", "groupWaba", "groupPhone", "groupWallet", "groupIntegrations"],
  attendanceResourcesTitle: ["groupService", "groupReopen", "groupMedia", "groupNotifications", "groupLimits"],
};

/** Tags de tema (chaves i18n novas: tagRouting, tagVisibility, ...). */
export type SettingTag =
  | "routing"
  | "visibility"
  | "waba"
  | "permissions"
  | "notifications"
  | "media"
  | "limits"
  | "bot";

export const SETTING_TAG_ORDER: SettingTag[] = [
  "routing",
  "visibility",
  "waba",
  "permissions",
  "notifications",
  "media",
  "limits",
  "bot",
];

/** Chave i18n do rótulo de uma tag. */
export function tagLabelKey(tag: SettingTag): string {
  return `tag${tag.charAt(0).toUpperCase()}${tag.slice(1)}`;
}

export interface SettingCatalogEntry {
  /** settingKey usado em getValue/handleToggle — NUNCA muda. */
  key: string;
  section: SettingSectionKey;
  group?: SettingGroupKey;
  tags: SettingTag[];
}

export const SETTINGS_CATALOG: SettingCatalogEntry[] = [
  // ── Tickets e Visibilidade ────────────────────────────────────────────────
  { key: "NotViewAssignedTickets", section: "ticketsVisibilityTitle", tags: ["visibility"] },
  { key: "NotViewTicketsChatBot", section: "ticketsVisibilityTitle", tags: ["visibility", "bot"] },
  { key: "DirectTicketsToWallets", section: "ticketsVisibilityTitle", tags: ["routing"] },
  { key: "DirectTicketsToContactQueue", section: "ticketsVisibilityTitle", tags: ["routing"] },
  { key: "ticketNulo", section: "ticketsVisibilityTitle", tags: ["routing", "visibility"] },
  { key: "supervisor", section: "ticketsVisibilityTitle", tags: ["permissions", "visibility"] },
  { key: "supervisorChannelScoped", section: "ticketsVisibilityTitle", tags: ["permissions", "visibility"] },
  { key: "customProfileEnabled", section: "ticketsVisibilityTitle", tags: ["permissions"] },
  { key: "privacidadeFunil", section: "ticketsVisibilityTitle", tags: ["visibility"] },
  { key: "crossChannelTicketCheck", section: "ticketsVisibilityTitle", tags: ["routing"] },
  { key: "semRedis", section: "ticketsVisibilityTitle", tags: [] },

  // ── Bot e Chatbot ─────────────────────────────────────────────────────────
  { key: "botTicketActive", section: "botChatbotTitle", tags: ["bot"] },
  { key: "autoDisableIntegrationsOnAccept", section: "botChatbotTitle", tags: ["bot"] },
  { key: "notifyOnlyHumanTickets", section: "botChatbotTitle", tags: ["bot", "notifications"] },
  { key: "aiEngine", section: "botChatbotTitle", tags: ["bot"] },
  { key: "ignoreGroupMsg", section: "botChatbotTitle", tags: ["bot"] },
  { key: "ignorarStories", section: "botChatbotTitle", tags: ["bot"] },
  { key: "mostrarGruposParaTodos", section: "botChatbotTitle", tags: ["visibility"] },
  { key: "mostrarFechadoParaTodos", section: "botChatbotTitle", tags: ["visibility"] },
  { key: "rejectCalls", section: "botChatbotTitle", tags: ["bot"] },
  { key: "chatbotLane", section: "botChatbotTitle", tags: ["bot"] },
  { key: "fixarConexao", section: "botChatbotTitle", tags: ["routing"] },
  { key: "forcarPendente", section: "botChatbotTitle", tags: ["routing"] },

  // ── Organização e Distribuição · Listagem e ordenação ─────────────────────
  { key: "agruparTickets", section: "orgDistTitle", group: "groupListing", tags: ["visibility"] },
  { key: "messageListingType", section: "orgDistTitle", group: "groupListing", tags: ["visibility"] },
  { key: "listarPelaUltimaMensagem", section: "orgDistTitle", group: "groupListing", tags: ["visibility"] },
  { key: "ordemReversaLista", section: "orgDistTitle", group: "groupListing", tags: ["visibility"] },

  // ── Organização e Distribuição · Janela 24h e WABA ────────────────────────
  { key: "videoConferenceProvider", section: "orgDistTitle", group: "groupWaba", tags: [] },
  { key: "wabaCallRouting", section: "orgDistTitle", group: "groupWaba", tags: ["routing", "waba"] },
  { key: "windowTimerBanner", section: "orgDistTitle", group: "groupWaba", tags: ["waba"] },
  { key: "wabaTemplateBanner", section: "orgDistTitle", group: "groupWaba", tags: ["waba"] },
  { key: "windowClosedBanner", section: "orgDistTitle", group: "groupWaba", tags: ["waba"] },

  // ── Organização e Distribuição · Telefonia e identificadores ──────────────
  { key: "validateContact", section: "orgDistTitle", group: "groupPhone", tags: [] },
  { key: "brPhoneConvention", section: "orgDistTitle", group: "groupPhone", tags: ["waba"] },

  // ── Organização e Distribuição · Carteira e acesso a dados ────────────────
  // A ordem aqui espelha a ordem de renderização no JSX da página, para que os
  // sub-cabeçalhos caiam exatamente entre os blocos certos.
  { key: "userCreationPasswordMode", section: "orgDistTitle", group: "groupWallet", tags: ["permissions"] },
  { key: "hearHubApi", section: "orgDistTitle", group: "groupWallet", tags: [] },
  { key: "ticketsRain", section: "orgDistTitle", group: "groupWallet", tags: ["notifications"] },
  { key: "carteiraExterna", section: "orgDistTitle", group: "groupWallet", tags: ["routing"] },
  { key: "walletShowAll", section: "orgDistTitle", group: "groupWallet", tags: ["routing", "visibility"] },
  { key: "contactDeleteAdminOnly", section: "orgDistTitle", group: "groupWallet", tags: ["permissions"] },
  { key: "hidePaymentsFromUsers", section: "orgDistTitle", group: "groupWallet", tags: ["permissions", "visibility"] },
  { key: "inboundByQueueOnly", section: "orgDistTitle", group: "groupWallet", tags: ["routing"] },

  // ── Organização e Distribuição · Integrações e fluxo externo ──────────────
  { key: "youtubeCommentsCreateTickets", section: "orgDistTitle", group: "groupIntegrations", tags: [] },
  { key: "esperarProcessamento", section: "orgDistTitle", group: "groupIntegrations", tags: [] },
  { key: "transbordo", section: "orgDistTitle", group: "groupIntegrations", tags: ["routing"] },
  { key: "janelaConversa", section: "orgDistTitle", group: "groupIntegrations", tags: ["waba"] },
  { key: "atualizarNomes", section: "orgDistTitle", group: "groupIntegrations", tags: [] },
  { key: "bsuidStrictMode", section: "orgDistTitle", group: "groupIntegrations", tags: [] },
  { key: "forcarAdmin", section: "orgDistTitle", group: "groupIntegrations", tags: ["permissions", "routing"] },
  { key: "uazapiDisableLid", section: "orgDistTitle", group: "groupIntegrations", tags: [] },
  { key: "aiAgentPrivateWebhookEnabled", section: "orgDistTitle", group: "groupIntegrations", tags: [] },

  // ── Atendimento e Recursos · Atendimento ──────────────────────────────────
  { key: "signed", section: "attendanceResourcesTitle", group: "groupService", tags: [] },
  { key: "controleFeatures", section: "attendanceResourcesTitle", group: "groupService", tags: ["permissions"] },
  { key: "forceReason", section: "attendanceResourcesTitle", group: "groupService", tags: [] },
  { key: "allowPause", section: "attendanceResourcesTitle", group: "groupService", tags: [] },
  { key: "autoUnpauseOnReply", section: "attendanceResourcesTitle", group: "groupService", tags: [] },
  { key: "allowDuplicateMessages", section: "attendanceResourcesTitle", group: "groupService", tags: [] },
  { key: "groupTimeMetricsEnabled", section: "attendanceResourcesTitle", group: "groupService", tags: ["visibility"] },
  { key: "contactEventsRetentionDays", section: "attendanceResourcesTitle", group: "groupService", tags: ["limits"] },
  { key: "scheduleSentNoticeEnabled", section: "attendanceResourcesTitle", group: "groupService", tags: ["visibility"] },

  // ── Atendimento e Recursos · Reabertura e agendamento ─────────────────────
  { key: "botReopenGraceSeconds", section: "attendanceResourcesTitle", group: "groupReopen", tags: ["bot", "limits"] },
  { key: "botReopenDestinationType", section: "attendanceResourcesTitle", group: "groupReopen", tags: ["routing", "bot"] },
  { key: "scheduleRoutingWindowDays", section: "attendanceResourcesTitle", group: "groupReopen", tags: ["routing", "limits"] },
  { key: "offlineOnTabClose", section: "attendanceResourcesTitle", group: "groupReopen", tags: [] },
  { key: "reopenTicketAssignsToActor", section: "attendanceResourcesTitle", group: "groupReopen", tags: ["routing"] },
  { key: "universalCounter", section: "attendanceResourcesTitle", group: "groupReopen", tags: ["notifications"] },

  // ── Atendimento e Recursos · Áudio e mídia ────────────────────────────────
  { key: "pluginAudio", section: "attendanceResourcesTitle", group: "groupMedia", tags: ["media"] },
  { key: "audioModulo", section: "attendanceResourcesTitle", group: "groupMedia", tags: ["media"] },
  { key: "persistirMedia", section: "attendanceResourcesTitle", group: "groupMedia", tags: ["media"] },

  // ── Atendimento e Recursos · Notificações ─────────────────────────────────
  { key: "useUserBusinessHours", section: "attendanceResourcesTitle", group: "groupNotifications", tags: [] },
  { key: "webPushChatInterno", section: "attendanceResourcesTitle", group: "groupNotifications", tags: ["notifications"] },
  { key: "pushNotificationLimitToOwner", section: "attendanceResourcesTitle", group: "groupNotifications", tags: ["notifications"] },
  { key: "notificationSilenced", section: "attendanceResourcesTitle", group: "groupNotifications", tags: ["notifications"] },

  // ── Atendimento e Recursos · Limites ──────────────────────────────────────
  { key: "autoClose", section: "attendanceResourcesTitle", group: "groupLimits", tags: ["limits"] },
  { key: "queuePositionEnabled", section: "attendanceResourcesTitle", group: "groupLimits", tags: ["bot"] },
  { key: "ticketLimit", section: "attendanceResourcesTitle", group: "groupLimits", tags: ["limits"] },
  { key: "tentativas", section: "attendanceResourcesTitle", group: "groupLimits", tags: ["limits"] },
  { key: "limiteTickets", section: "attendanceResourcesTitle", group: "groupLimits", tags: ["limits"] },
  { key: "limiteChatInterno", section: "attendanceResourcesTitle", group: "groupLimits", tags: ["limits"] },
  { key: "forbiddenNumbers", section: "attendanceResourcesTitle", group: "groupLimits", tags: ["limits"] },

  // ── Ações do Sistema (execuções, não configurações) ───────────────────────
  { key: "forceMessage", section: "systemActionsTitle", tags: [] },
  { key: "resolvePending", section: "systemActionsTitle", tags: [] },
  { key: "validateContacts", section: "systemActionsTitle", tags: [] },
  { key: "syncMessages", section: "systemActionsTitle", tags: [] },
  { key: "syncTicketData", section: "systemActionsTitle", tags: [] },
  { key: "scanContacts", section: "systemActionsTitle", tags: [] },
  { key: "normalizeBirthdays", section: "systemActionsTitle", tags: [] },
  { key: "lidConsolidation", section: "systemActionsTitle", tags: [] },
  { key: "instagramPkSanitize", section: "systemActionsTitle", tags: [] },
];

/** Index key -> entrada, para lookup O(1) na página. */
export const SETTINGS_BY_KEY: Record<string, SettingCatalogEntry> = SETTINGS_CATALOG.reduce(
  (acc, entry) => {
    acc[entry.key] = entry;
    return acc;
  },
  {} as Record<string, SettingCatalogEntry>
);

/** Seção (card) de uma setting — usado para abrir o card certo antes de rolar. */
export function sectionOfSetting(key: string): SettingSectionKey | undefined {
  return SETTINGS_BY_KEY[key]?.section;
}

/** Tags de uma setting (vazio quando não catalogada). */
export function tagsOfSetting(key: string): SettingTag[] {
  return SETTINGS_BY_KEY[key]?.tags ?? [];
}
