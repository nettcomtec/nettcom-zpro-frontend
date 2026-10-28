import { ensureRegionTexts, getRegionText, regionTextsReady } from "@/hooks/use-region";

export interface FlowInteraction {
  id: string;
  type:
    | "message"
    | "media"
    | "delay"
    | "chatgpt"
    | "agent"
    | "typebot"
    | "n8n"
    | "tag"
    | "kanban"
    | "chatBotBlock"
    | "webhook"
    | "webhookAll"
    | "chatflow"
    | "opportunity"
    | "googleAgenda"
    | "button"
    | "list"
    | "pixButton"
    | "transfer"
    | "contact"
    | "location"
    | "sticker"
    | "videoLink"
    | "schedule"
    | "reasons"
    | "sms"
    | "vapi"
    | "notes"
    | "appointment"
    | "template"
    | "notify"
    | "carencia"
    | "SwitchChannel";
  data: Record<string, unknown>;
}

export interface FlowCondition {
  id: string;
 /** 0 = step, 1 = queue, 2 = user, 3 = close ticket, 4 = channel (mirrors front legado condition.action) */
  action?: number;
  nextStepId: string;
  queueId?: string;
  userIdDestination?: string;
  closeTicket?: string;
  channelDestination?: string;
  /** "A" = automático (auto-avanço ao entrar no nó); "V" = condição por variável de contexto */
  type: "US" | "R" | "T" | "A" | "V" | "contains" | "equals" | "startsWith" | "endsWith" | "regex";
  value: string;
 /** multi-value chip list for type "R" — mirrors the legacy front's condition.condition array */
  condition?: string[];
  comparisonType?: string;
  /** timeTable (type === "T"): dias da semana (0=Dom..6=Sáb) */
  weekdays?: number[];
  /** timeTable: hora de início no formato "HH:mm" (24h, inclusiva) */
  startTime?: string;
  /** timeTable: hora de fim no formato "HH:mm" (24h, exclusiva). "00:00"–"00:00" = dia inteiro */
  endTime?: string;
  variableKey?: string;
}

export interface FlowAction {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface FlowNodeData {
  id: string;
  name: string;
  type: "start" | "configurations" | "node" | "timeTable";
  left: string;
  top: string;
  ico?: string;
  viewOnly?: boolean;
  status?: string;
 /** Visual style overrides (mirrors the legacy front's node.style) */
  style?: Record<string, unknown>;
  interactions: FlowInteraction[];
  conditions: FlowCondition[];
  actions: FlowAction[];
  configurations?: Record<string, unknown>;
  variableKey?: string;
  variableLabel?: string;
  variableType?: string;
  variableValidation?: string;
  /** Mensagem enviada quando a resposta não passa na validação do variableType */
  variableErrorMessage?: string;
  /** Tentativas de re-pergunta antes de capturar o valor cru e seguir (default 3) */
  variableRetryLimit?: number;
}

export interface FlowLine {
  from: string;
  to: string;
  label?: string;
 /** Visual style used by legacy/jsPlumb (preserved on save for cross-platform compatibility) */
  paintStyle?: { strokeWidth?: number; stroke?: string };
}

export interface FlowData {
  name: string;
  nodeList: FlowNodeData[];
  lineList: FlowLine[];
}

export interface ChatFlowRecord {
  id: number;
  name: string;
  flow: Record<string, unknown>;
  status: boolean;
  isActive?: boolean;
  isDefault: boolean;
  userId: number;
  tenantId: number;
  celpisPriority: number;
  celularTeste?: string | null;
  createdAt: string;
  updatedAt: string;
}

// i18n: este é um módulo de dados (sem hook). `label` segue em PT (valor de hoje,
// usado também como fallback e na busca); `labelKey` é a chave no namespace
// "flowBuilderDefaults" para o componente traduzir:
//   const tDef = useTranslations("flowBuilderDefaults");
//   const label = it.labelKey ? tDef(it.labelKey) : it.label;
// Sem `labelKey` = nome próprio que não se traduz (ChatGPT, Typebot, n8n, SMS, VAPI).
/** Canais onde cada tipo de interação está disponível. undefined = todos os canais */
export const INTERACTION_CHANNELS: Partial<Record<FlowInteraction["type"], string[]>> = {
  button: ["baileys", "whatsapp", "waba", "uazapi", "evogo", "meow", "instagram", "messenger"],
  list: ["baileys", "whatsapp", "waba", "uazapi", "evogo", "meow", "instagram", "messenger"],
  pixButton: ["baileys", "whatsapp", "meow", "waba", "gupshup", "dialog360"],
  sticker: ["baileys", "whatsapp", "waba", "uazapi", "evo", "evogo", "zapi", "meow", "instagram"],
  videoLink: ["baileys", "whatsapp", "evo", "evogo", "zapi", "uazapi", "meow"],
  location: ["baileys", "whatsapp", "waba", "uazapi", "evogo", "evo", "zapi", "meow", "instagram"],
  contact: ["baileys", "whatsapp", "waba", "uazapi", "evo", "evogo", "zapi", "meow"],
  template: ["waba", "gupshup", "dialog360"],
};

export const INTERACTION_TYPES: {
  type: FlowInteraction["type"];
  label: string;
  /** Chave em "flowBuilderDefaults" (ausente = nome próprio, não traduz). */
  labelKey?: string;
  icon: string;
}[] = [
  { type: "message", label: "Mensagem", labelKey: "interactionMessage", icon: "MessageSquare" },
  { type: "media", label: "Mídia", labelKey: "interactionMedia", icon: "Image" },
  { type: "delay", label: "Atraso", labelKey: "interactionDelay", icon: "Clock" },
  { type: "chatgpt", label: "ChatGPT", icon: "Bot" },
  { type: "agent", label: "Agente de IA", labelKey: "interactionAgent", icon: "Bot" },
  { type: "typebot", label: "Typebot", icon: "Blocks" },
  { type: "n8n", label: "n8n", icon: "Workflow" },
  { type: "tag", label: "Etiqueta", labelKey: "interactionTag", icon: "Tag" },
  { type: "kanban", label: "Kanban", labelKey: "interactionKanban", icon: "LayoutGrid" },
  { type: "chatBotBlock", label: "Bloquear Chatbot", labelKey: "interactionChatBotBlock", icon: "ShieldOff" },
  { type: "webhook", label: "Webhook", labelKey: "interactionWebhook", icon: "Globe" },
  { type: "webhookAll", label: "Webhook Avançado", labelKey: "interactionWebhookAdvanced", icon: "Globe" },
  { type: "chatflow", label: "Sub-fluxo", labelKey: "interactionSubflow", icon: "GitBranch" },
  { type: "opportunity", label: "Oportunidade", labelKey: "interactionOpportunity", icon: "TrendingUp" },
  { type: "googleAgenda", label: "Google Agenda", labelKey: "interactionGoogleAgenda", icon: "Calendar" },
  { type: "button", label: "Botões", labelKey: "interactionButtons", icon: "SquareStack" },
  { type: "list", label: "Lista", labelKey: "interactionList", icon: "List" },
  { type: "pixButton", label: "Botão PIX", labelKey: "interactionPixButton", icon: "Receipt" },
  { type: "transfer", label: "Transferir", labelKey: "interactionTransfer", icon: "ArrowRightLeft" },
  { type: "carencia", label: "Carência", labelKey: "interactionCarencia", icon: "TimerReset" },
  { type: "contact", label: "Contato", labelKey: "interactionContact", icon: "UserCircle" },
  { type: "location", label: "Localização", labelKey: "interactionLocation", icon: "MapPin" },
  { type: "sticker", label: "Sticker", labelKey: "interactionSticker", icon: "Smile" },
  { type: "videoLink", label: "Vídeo Conferência", labelKey: "interactionVideoLink", icon: "Video" },
  { type: "schedule", label: "Agendamento", labelKey: "interactionSchedule", icon: "CalendarClock" },
  { type: "reasons", label: "Razões", labelKey: "interactionReasons", icon: "ListChecks" },
  { type: "sms", label: "SMS", icon: "Phone" },
  { type: "vapi", label: "VAPI", icon: "Mic" },
  { type: "notes", label: "Notas", labelKey: "interactionNotes", icon: "FileText" },
  { type: "appointment", label: "Consulta Agenda", labelKey: "interactionAppointment", icon: "CalendarPlus" },
  { type: "template", label: "Template (HSM)", labelKey: "interactionTemplate", icon: "FileBadge" },
  { type: "notify", label: "Notificar equipe", labelKey: "interactionNotify", icon: "BellRing" },
  { type: "SwitchChannel", label: "Trocar de Canal", labelKey: "interactionSwitchChannel", icon: "ArrowLeftRight" },
];

/**
 * Mensagem-ponte default do nó "Trocar de Canal" (SwitchChannel), em pt (o texto
 * de hoje). {{link}} é substituído pelo executor (wa.me/<numero destino>?text=<protocolo>).
 * Na CRIAÇÃO do nó vale `getSwitchChannelDefaultMessage()`; a constante segue
 * exportada para quem ainda a usa como placeholder/preenchimento.
 */
export const SWITCH_CHANNEL_DEFAULT_MESSAGE =
  "Vamos continuar seu atendimento em outro número: {{link}}";

/**
 * Mensagem-ponte do nó "Trocar de Canal": vai ao CLIENTE, então sai no idioma da
 * Região da empresa (catálogo do backend, `{{link}}` literal). Sem idioma
 * configurado ou antes de os textos chegarem, o literal PT de hoje (serve de
 * placeholder; para GRAVAR use `getSwitchChannelMessageToPersist`).
 */
export function getSwitchChannelDefaultMessage(): string {
  // Voo único; sem idioma configurado não faz request.
  void ensureRegionTexts();
  return getRegionText("flow.switchChannelBridge", undefined, SWITCH_CHANNEL_DEFAULT_MESSAGE);
}

/**
 * Mensagem-ponte GRAVADA no nó: com o idioma da empresa configurado e os textos
 * ainda não carregados, grava vazio — o backend manda o texto do catálogo no idioma
 * da empresa —, em vez de gravar o PT para sempre numa empresa estrangeira.
 */
export function getSwitchChannelMessageToPersist(): string {
  void ensureRegionTexts();
  return regionTextsReady() ? getSwitchChannelDefaultMessage() : "";
}

/**
 * Dados iniciais ao criar uma interação de um dado tipo.
 * Alguns forms (ex.: webhookAll) exibem um default ("POST"/"json") apenas como
 * fallback de exibição e só o gravam quando o usuário troca o controle — sem isso
 * o campo nunca é persistido e o backend cai no próprio default. Semeando aqui,
 * "o que se vê no editor = o que se salva = o que o backend executa".
 */
export function defaultInteractionData(type: FlowInteraction["type"]): Record<string, unknown> {
  switch (type) {
    case "webhookAll":
      return { httpMethod: "POST", bodyType: "json" };
    // SwitchChannel: semear channelId (null = usar canal vinculado do canal atual)
    // e a mensagem-ponte default — o que se vê no editor = o que se salva.
    case "SwitchChannel":
      return { channelId: null, message: getSwitchChannelMessageToPersist() };
    // Carência (retorno rápido): semeia enabled/seconds/destinationType para que
    // "o que se vê no editor = o que se salva = o que o backend executa".
    case "carencia":
      return { enabled: true, seconds: 3600, destinationType: "lastUser" };
    // Bloquear Chatbot: o backend só executa a ação se o campo existir no data —
    // sem esta semente a interação salva vazia e vira no-op silencioso.
    case "chatBotBlock":
      return { chatbotBlocked: true };
    // Agente de IA: semear agentId para que "o que se vê no editor = o que se salva".
    case "agent":
      return { agentId: "" };
    // Localização: nó novo nasce na família lat/lng (texto); nome e endereço sempre em
    // locationName/locationAddress (ver flowLocationCoordKeys).
    case "location":
      return { lat: "", lng: "", locationName: "", locationAddress: "" };
    default:
      return {};
  }
}

/** Valor preenchido como o servidor entende (nem ausente, nem nulo, nem só espaço). */
export function isFlowLocationValueFilled(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export interface FlowLocationCoordKeys {
  lat: "lat" | "locationLatitude";
  lng: "lng" | "locationLongitude";
  /** Família do editor antigo, que gravava número. */
  legacy: boolean;
}

/**
 * Nó "Localização": de qual família de chaves vêm as coordenadas (A1-2 do
 * docs/PLANO_LOCALIZACAO_ENVIO_ENCAMINHAR.md). O editor antigo gravava
 * `locationLatitude/locationLongitude` (número); o editor novo grava `lat/lng` (texto). Nó com
 * qualquer uma das antigas preenchida continua nelas — a mesma regra do `readFlowLocation` do
 * backend (helpers/LocationMessageZPRO.ts; mudar um exige o outro). Assim o backend antigo nunca
 * recebe dado novo num ramo que hoje fica parado, e o nó antigo segue como ele o lê.
 */
export function flowLocationCoordKeys(data: Record<string, unknown> | null | undefined): FlowLocationCoordKeys {
  const d: Record<string, unknown> = data ?? {};
  const legacy = isFlowLocationValueFilled(d.locationLatitude) || isFlowLocationValueFilled(d.locationLongitude);
  return legacy
    ? { lat: "locationLatitude", lng: "locationLongitude", legacy: true }
    : { lat: "lat", lng: "lng", legacy: false };
}

/**
 * Tipos de NODE disponíveis no editor (botão "+ Adicionar nó").
 * Diferente de INTERACTION_TYPES (interações DENTRO de um node).
 *
 * - `node` — passo padrão: envia interações + aguarda resposta do contato
 *            e roteia por match de texto/regex.
 * - `timeTable` — roteamento automático por dia da semana + janela de horário.
 *                 Sem mensagens. Branches type "T" + Padrão (US) obrigatório.
 *                 Server-side: docs/PLANO_CHATFLOW_NODE_HORARIO.md
 */
export const NODE_TYPES: { type: FlowNodeData["type"]; label: string; labelKey: string; icon: string }[] = [
  { type: "node",      label: "Passo",              labelKey: "nodeTypeStep",      icon: "Square" },
  { type: "timeTable", label: "Tabela de horários", labelKey: "nodeTypeTimeTable", icon: "Clock" },
];
