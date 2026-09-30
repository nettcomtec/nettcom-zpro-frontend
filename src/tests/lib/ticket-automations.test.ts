import { describe, it, expect } from "vitest";
import { normalizeTicket } from "@/lib/normalize-ticket";
import { getTicketAutomations, matchesTicketAutomationFilter } from "@/lib/ticket-automations";

describe("ticket-automations — guia Automações do /atendimento", () => {
  it("ticket sem nenhuma automação não entra em filtro nenhum", () => {
    const tk = normalizeTicket({ id: 1, status: "pending", chatgptStatus: false });
    expect(matchesTicketAutomationFilter(tk, "all")).toBe(false);
    expect(getTicketAutomations(tk).integrations).toEqual([]);
  });

  it("chatbot vem do chatFlowId (paridade com a guia antiga)", () => {
    const tk = normalizeTicket({ id: 1, chatFlowId: 3 });
    expect(matchesTicketAutomationFilter(tk, "chatbot")).toBe(true);
    expect(matchesTicketAutomationFilter(tk, "all")).toBe(true);
    expect(matchesTicketAutomationFilter(tk, "aiAgent")).toBe(false);
  });

  it("agente de IA não aparece também como integração ChatGPT", () => {
    const tk = normalizeTicket({ id: 1, aiAgentId: 7, chatgptStatus: true, typebotStatus: true });
    const a = getTicketAutomations(tk);
    expect(a.aiAgent).toBe(true);
    expect(a.integrations).toEqual(["Typebot"]);
    expect(matchesTicketAutomationFilter(tk, "aiAgent")).toBe(true);
  });

  it("aiAgentId com ChatGPT desligado à mão não conta como agente", () => {
    const tk = normalizeTicket({ id: 1, aiAgentId: 7, chatgptStatus: false });
    expect(getTicketAutomations(tk).aiAgent).toBe(false);
    expect(matchesTicketAutomationFilter(tk, "all")).toBe(false);
  });

  it("backend antigo sem aiAgentId: chatgptStatus cai como integração", () => {
    const tk = normalizeTicket({ id: 1, chatgptStatus: true });
    expect(getTicketAutomations(tk)).toEqual({ chatbot: false, aiAgent: false, integrations: ["ChatGPT"] });
    expect(matchesTicketAutomationFilter(tk, "integration")).toBe(true);
  });
});
