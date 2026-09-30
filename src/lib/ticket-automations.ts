import type { Ticket } from "@/stores/ticket-store";

/**
 * Automações ligadas no ticket — fonte única da guia "Automações" do /atendimento
 * (lista, contador da guia) e dos ícones do card, para os dois nunca divergirem.
 *
 * Critério = só as flags do PRÓPRIO ticket (decisão do Pedro, 2026-09-16), sem
 * cruzar com a Setting da integração no tenant — mesmo critério que o ícone de
 * integração do card sempre usou.
 */

export type TicketAutomationFilter = "all" | "chatbot" | "aiAgent" | "integration";

export const TICKET_AUTOMATION_FILTERS: TicketAutomationFilter[] = ["all", "chatbot", "aiAgent", "integration"];

type AutomationTicket = Pick<
  Ticket,
  | "chatbot"
  | "aiAgentId"
  | "typebotStatus"
  | "dialogflowStatus"
  | "chatgptStatus"
  | "n8nStatus"
  | "difyStatus"
  | "lmStatus"
  | "grokStatus"
  | "geminiStatus"
  | "deepseekStatus"
  | "qwenStatus"
  | "claudeStatus"
  | "ollamaStatus"
>;

type IntegrationField = Exclude<keyof AutomationTicket, "chatbot" | "aiAgentId">;

// Rótulos são nomes de produto de terceiros (não traduzíveis). Ordem = ordem no tooltip.
const AI_INTEGRATIONS: ReadonlyArray<{ field: IntegrationField; label: string }> = [
  { field: "typebotStatus", label: "Typebot" },
  { field: "dialogflowStatus", label: "DialogFlow" },
  { field: "chatgptStatus", label: "ChatGPT" },
  { field: "n8nStatus", label: "N8N" },
  { field: "difyStatus", label: "Dify" },
  { field: "lmStatus", label: "LM Studio" },
  { field: "grokStatus", label: "Grok" },
  { field: "geminiStatus", label: "Gemini" },
  { field: "deepseekStatus", label: "DeepSeek" },
  { field: "qwenStatus", label: "Qwen" },
  { field: "claudeStatus", label: "Claude" },
  { field: "ollamaStatus", label: "Ollama" },
];

export interface TicketAutomations {
  /** Fluxo de chatbot (chatFlowId) */
  chatbot: boolean;
  /** Agente de IA armado no ticket */
  aiAgent: boolean;
  /** Nomes das integrações de IA/bot externas ligadas (sem o ChatGPT do agente) */
  integrations: string[];
}

export function getTicketAutomations(ticket: AutomationTicket): TicketAutomations {
  const chatgptOn = ticket.chatgptStatus === "enabled";
  // O agente arma aiAgentId + chatgptStatus juntos e só responde com os dois. Desligar
  // o ChatGPT à mão no ticket não limpa o aiAgentId — por isso exige o par. Com
  // agente, o chatgptStatus é dele: não aparece também como integração ChatGPT.
  // Backend antigo não manda aiAgentId: o ticket cai como integração ChatGPT.
  const aiAgent = chatgptOn && Number(ticket.aiAgentId) > 0;
  const integrations: string[] = [];
  for (const { field, label } of AI_INTEGRATIONS) {
    if (ticket[field] !== "enabled") continue;
    if (aiAgent && field === "chatgptStatus") continue;
    integrations.push(label);
  }
  return { chatbot: !!ticket.chatbot, aiAgent, integrations };
}

export function matchesTicketAutomationFilter(
  ticket: AutomationTicket,
  filter: TicketAutomationFilter,
): boolean {
  const a = getTicketAutomations(ticket);
  switch (filter) {
    case "chatbot":
      return a.chatbot;
    case "aiAgent":
      return a.aiAgent;
    case "integration":
      return a.integrations.length > 0;
    default:
      return a.chatbot || a.aiAgent || a.integrations.length > 0;
  }
}
