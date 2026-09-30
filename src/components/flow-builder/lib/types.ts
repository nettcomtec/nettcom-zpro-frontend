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

// i18n: INTERACTION_TYPES labels are Portuguese and used in the UI dropdown.
// These cannot use hooks as this is a data file. Labels should be replaced at
// component level using useTranslations("flowBuilderDefaults") where needed,
// e.g. using a lookup map: { message: t("interactionMessage"), media: t("interactionMedia"), ... }
// Keys: interactionMessage, interactionMedia, interactionDelay, interactionTag,
//       interactionKanban, interactionChatBotBlock, interactionWebhookAdvanced,
//       interactionSubflow, interactionOpportunity, interactionButtons,
//       interactionTransfer, interactionContact, interactionLocation,
//       interactionVideoLink, interactionSchedule, interactionReasons, interactionNotes
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
  icon: string;
}[] = [
  { type: "message", label: "Mensagem", icon: "MessageSquare" },
  { type: "media", label: "Mídia", icon: "Image" },
  { type: "delay", label: "Atraso", icon: "Clock" },
  { type: "chatgpt", label: "ChatGPT", icon: "Bot" },
  { type: "agent", label: "Agente de IA", icon: "Bot" },
  { type: "typebot", label: "Typebot", icon: "Blocks" },
  { type: "n8n", label: "n8n", icon: "Workflow" },
  { type: "tag", label: "Etiqueta", icon: "Tag" },
  { type: "kanban", label: "Kanban", icon: "LayoutGrid" },
  { type: "chatBotBlock", label: "Bloquear Chatbot", icon: "ShieldOff" },
  { type: "webhook", label: "Webhook", icon: "Globe" },
  { type: "webhookAll", label: "Webhook Avançado", icon: "Globe" },
  { type: "chatflow", label: "Sub-fluxo", icon: "GitBranch" },
  { type: "opportunity", label: "Oportunidade", icon: "TrendingUp" },
  { type: "googleAgenda", label: "Google Agenda", icon: "Calendar" },
  { type: "button", label: "Botões", icon: "SquareStack" },
  { type: "list", label: "Lista", icon: "List" },
  { type: "pixButton", label: "Botão PIX", icon: "Receipt" },
  { type: "transfer", label: "Transferir", icon: "ArrowRightLeft" },
  { type: "carencia", label: "Carência", icon: "TimerReset" },
  { type: "contact", label: "Contato", icon: "UserCircle" },
  { type: "location", label: "Localização", icon: "MapPin" },
  { type: "sticker", label: "Sticker", icon: "Smile" },
  { type: "videoLink", label: "Vídeo Conferência", icon: "Video" },
  { type: "schedule", label: "Agendamento", icon: "CalendarClock" },
  { type: "reasons", label: "Razões", icon: "ListChecks" },
  { type: "sms", label: "SMS", icon: "Phone" },
  { type: "vapi", label: "VAPI", icon: "Mic" },
  { type: "notes", label: "Notas", icon: "FileText" },
  { type: "appointment", label: "Consulta Agenda", icon: "CalendarPlus" },
  { type: "template", label: "Template (HSM)", icon: "FileBadge" },
  { type: "notify", label: "Notificar equipe", icon: "BellRing" },
  { type: "SwitchChannel", label: "Trocar de Canal", icon: "ArrowLeftRight" },
];

/**
 * Mensagem-ponte default do nó "Trocar de Canal" (SwitchChannel).
 * PERSISTIDA em pt no data.message ao criar o nó — o backend usa esta string
 * exata como fallback consistente. {{link}} é substituído pelo executor
 * (wa.me/<numero destino>?text=<protocolo>).
 */
export const SWITCH_CHANNEL_DEFAULT_MESSAGE =
  "Vamos continuar seu atendimento em outro número: {{link}}";

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
      return { channelId: null, message: SWITCH_CHANNEL_DEFAULT_MESSAGE };
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
    default:
      return {};
  }
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
export const NODE_TYPES: { type: FlowNodeData["type"]; label: string; icon: string }[] = [
  { type: "node",      label: "Passo",              icon: "Square" },
  { type: "timeTable", label: "Tabela de horários", icon: "Clock" },
];
