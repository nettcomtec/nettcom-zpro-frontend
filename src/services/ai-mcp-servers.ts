import api, { BACKGROUND_REQUEST } from "@/lib/api";

// v8 — Servidores MCP da empresa (docs/PLANO_AGENTES_IA_MCP.md). O cadastro é
// da EMPRESA; cada agente escolhe na aba Ferramentas quais servidores e
// ferramentas aprovadas usa (`AiAgent.mcpTools`).
//
// O token NUNCA volta do servidor: a listagem só diz `hasSecret` e
// `secretUnreadable` (token salvo que não abre mais neste servidor).

// Espelho dos limites do backend (McpConstantsZPRO.ts): mudar um exige o outro.
export const MAX_MCP_SERVERS_PER_TENANT = 10;
export const MAX_MCP_SERVERS_PER_AGENT = 3;
export const MAX_MCP_TOOLS_PER_AGENT = 15;
export const MCP_TIMEOUT_DEFAULT_SEC = 15;
export const MCP_TIMEOUT_MIN_SEC = 5;
export const MCP_TIMEOUT_MAX_SEC = 30;
export const MAX_MCP_SERVER_NAME = 80;
export const MAX_MCP_URL = 500;
export const MAX_MCP_SECRET = 2000;
export const MAX_MCP_HEADER_NAME = 100;

export type McpAuthType = "none" | "bearer" | "header" | "url";

// Estado de cada ferramenta do servidor, derivado no servidor:
// - pending: nunca aprovada (aguardando aprovação);
// - active: aprovada e igual ao que foi aprovado (em uso);
// - changed: aprovada, mas mudou no servidor (pausada até nova aprovação);
// - removed: aprovada, mas sumiu do servidor;
// - invalid: formato que não dá para mandar à IA.
export type McpToolState = "pending" | "active" | "changed" | "removed" | "invalid";

export interface McpServerToolView {
  name: string;
  // Exatamente o que vai à IA (descrição e parâmetros já limpos e cortados).
  descriptionForModel: string;
  parameters: Record<string, unknown> | null;
  readOnlyHint: boolean | null;
  destructiveHint: boolean | null;
  valid: boolean;
  invalidReason: string | null;
  hash: string;
  approved: boolean;
  altersData: boolean;
  state: McpToolState;
}

export interface McpServerAgentRef {
  id: number;
  name: string;
}

export interface McpServerView {
  id: number;
  name: string;
  // No modo "url" (endereço com token) é só a origem, para exibição.
  url: string;
  authType: McpAuthType;
  headerName: string | null;
  timeoutSec: number;
  isActive: boolean;
  hasSecret: boolean;
  // Token salvo que não abre mais neste servidor: digitar de novo.
  secretUnreadable: boolean;
  protocolEra: "modern" | "legacy" | null;
  lastSyncAt: string | null;
  lastCheckAt: string | null;
  // "ok" ou um código ERR_MCP_* da última conferência.
  lastSyncStatus: string | null;
  pausedCount: number;
  tools: McpServerToolView[];
  agents: McpServerAgentRef[];
}

export interface McpServerSummary {
  id: number;
  name: string;
  isActive: boolean;
  pausedCount: number;
}

export interface McpServerPayload {
  name: string;
  authType: McpAuthType;
  // Endereço (sem parâmetros). No modo "url" o endereço completo vai em
  // `secret` e este campo é ignorado.
  url?: string;
  headerName?: string | null;
  // Vazio/ausente = manter o salvo (só com o mesmo endereço e a mesma
  // autenticação; senão o servidor responde ERR_MCP_SECRET_REQUIRED).
  secret?: string;
  secretClear?: boolean;
  timeoutSec?: number;
  isActive?: boolean;
}

export interface McpTestResult {
  ok: boolean;
  code?: string | null;
  era?: "modern" | "legacy" | null;
  protocolVersion?: string | null;
  toolCount?: number;
}

export interface McpSyncResult {
  ok: boolean;
  code?: string | null;
  server?: McpServerView | null;
}

export interface McpApprovalInput {
  name: string;
  // Hash que o admin viu: se a ferramenta mudou nesse meio tempo, o servidor
  // responde 409 ERR_MCP_HASH_MISMATCH e nada é gravado.
  hash: string;
  approved: boolean;
  altersData?: boolean;
}

/**
 * Silenciosa: 404 (servidor antigo, sem a rota), erro ou forma inesperada =
 * `null` — botão, selo e seção somem / ficam somente leitura.
 */
export async function listAiMcpServers(): Promise<McpServerView[] | null>;
export async function listAiMcpServers(opts: {
  summary: true;
}): Promise<McpServerSummary[] | null>;
export async function listAiMcpServers(opts?: {
  summary?: boolean;
}): Promise<McpServerView[] | McpServerSummary[] | null> {
  try {
    const { data } = await api.get("/ai-mcp-servers", {
      params: opts?.summary ? { summary: 1 } : undefined,
      ...BACKGROUND_REQUEST,
      skipNoPermissionToast: true,
    });
    const list = Array.isArray(data) ? data : data?.records;
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

export async function createAiMcpServer(
  payload: McpServerPayload
): Promise<McpServerView> {
  const { data } = await api.post("/ai-mcp-servers", payload);
  return data;
}

export async function updateAiMcpServer(
  id: number,
  payload: McpServerPayload
): Promise<McpServerView> {
  const { data } = await api.put(`/ai-mcp-servers/${id}`, payload);
  return data;
}

export async function deleteAiMcpServer(
  id: number
): Promise<{ ok: boolean; agentsUpdated?: number }> {
  const { data } = await api.delete(`/ai-mcp-servers/${id}`);
  return data || { ok: true };
}

/**
 * Testa a conexão (antes ou depois de salvar). Com `id` e token vazio o
 * servidor usa o token salvo, só se endereço e autenticação forem os mesmos.
 * Falha do servidor MCP volta 200 `{ ok:false, code }`; o servidor corta em
 * 25 s, então a tela espera 35 s.
 */
export async function testAiMcpServer(
  payload: McpServerPayload & { id?: number | null }
): Promise<McpTestResult> {
  const { data } = await api.post("/ai-mcp-servers/test", payload, {
    timeout: 35000,
  });
  return data || { ok: false };
}

/** Atualiza a lista de ferramentas do servidor (mesmo prazo do teste). */
export async function syncAiMcpServer(id: number): Promise<McpSyncResult> {
  const { data } = await api.post(
    `/ai-mcp-servers/${id}/sync`,
    {},
    { timeout: 35000 }
  );
  return data || { ok: false };
}

export async function approveAiMcpServerTools(
  id: number,
  approvals: McpApprovalInput[]
): Promise<McpServerView> {
  const { data } = await api.put(`/ai-mcp-servers/${id}/tools`, { approvals });
  return data;
}
