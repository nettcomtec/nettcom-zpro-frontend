import api from "@/lib/api";

export async function fetchChatFlows() {
  return api.get("/chat-flow");
}

export async function fetchChatFlow(flowId: number) {
  return api.get(`/chat-flow/${flowId}`);
}

export async function createChatFlow(data: Record<string, unknown>) {
  return api.post("/chat-flow", data);
}

export async function updateChatFlow(flowId: number, data: Record<string, unknown>) {
  return api.put(`/chat-flow/${flowId}`, data);
}

export async function deleteChatFlow(flowId: number) {
  return api.delete(`/chat-flow/${flowId}`);
}

export async function duplicateChatFlow(flowId: number, name: string) {
  return api.post(`/chat-flow-duplicate`, { id: flowId, name });
}

export async function importChatFlowJson(flowId: number, jsonData: Record<string, unknown>) {
  return api.put(`/chat-flow-import/${flowId}`, jsonData);
}

export interface ChatFlowBrokenRef {
  kind: "user" | "queue" | "channel";
  refId: number;
  nodeId: string | null;
  nodeName: string | null;
  where: "condition" | "maxRetryBotMessage" | "firstInteraction" | "notResponseMessage" | "outOpenHours";
}

export interface ChatFlowIntegrityReport {
  chatFlowId: number;
  name: string;
  issues: ChatFlowBrokenRef[];
}

/** Fluxos com transferência apontando para fila/atendente/canal excluído (badge nos cards). */
export async function fetchChatFlowIntegrity() {
  return api.get<ChatFlowIntegrityReport[]>("/chat-flow-integrity");
}
