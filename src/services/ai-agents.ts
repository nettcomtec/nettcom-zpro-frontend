import api, { BACKGROUND_REQUEST } from "@/lib/api";

// Lista SEMPRE enxuta (pickers do nó do flow e de /sessoes) — a apiKey nunca
// sai no List; o Show completo exige a permissão ai_agents_manage no backend.
export interface AiAgentSummary {
  id: number;
  name: string;
  isActive: boolean;
  description?: string | null;
  // v7 — agente "só base de conhecimento" (nunca atende; o servidor o mantém
  // inativo). Ausente em servidor antigo = agente comum.
  kbOnly?: boolean;
  // O servidor anuncia em cada item o que sabe executar (ausente em servidor
  // antigo). A ajuda da página usa para só citar o que existe de verdade.
  engineFeatures?: AiAgentEngineFeature[] | null;
}

export type AiAgentRoutingTargetType = "queue" | "user" | "chatflow" | "ai_agent";

export interface AiAgentRoutingTarget {
  key: string;
  label: string;
  description: string;
  type: AiAgentRoutingTargetType;
  queueId?: number | null;
  userId?: number | null;
  // v5 — destino "Fluxo": a conversa passa para o fluxo escolhido, que começa
  // na hora. Neste destino o agente NÃO envia despedida (a 1ª mensagem do
  // fluxo é a resposta).
  chatFlowId?: number | null;
  // v6 — destino "Outro agente de IA": a conversa passa para o agente
  // escolhido, que já responde à mensagem atual (sem despedida de quem sai).
  aiAgentId?: number | null;
  // Enviada ao cliente quando a transferência para este destino é concluída e
  // o agente não escreveu nada junto — evita transferência muda.
  transferMessage?: string | null;
}

// Parâmetro que o agente preenche ao chamar a ferramenta externa; vira campo
// do JSON enviado ao webhook.
export interface AiAgentExternalToolParam {
  name: string;
  description?: string | null;
  required?: boolean;
}

// Ferramenta externa (webhook n8n & cia) — o agente chama quando a descrição
// "use quando" casa com o que o cliente pediu.
export interface AiAgentExternalTool {
  key: string;
  label: string;
  description: string;
  url: string;
  // Com `toolSecretMask` anunciado o servidor NUNCA devolve a senha (vem "")
  // e marca `hasSecret`; enviar vazio = manter a salva (só com a mesma `key` E
  // o mesmo endereço) e `secretClear: true` = apagar.
  secret?: string | null;
  hasSecret?: boolean;
  secretClear?: boolean;
  timeoutMs?: number | null;
  params?: AiAgentExternalToolParam[];
}

// v8 MCP — servidor MCP da empresa e as ferramentas aprovadas que o agente usa
// (nomes ORIGINAIS do servidor).
export interface AiAgentMcpToolsEntry {
  serverId: number;
  tools: string[];
}

export type AiAgentActionType =
  | "tag"
  | "kanban"
  // v5 — o agente também registra oportunidade, anota no atendimento, avisa a
  // equipe e pode parar de atender o contato (esta última é terminal).
  | "opportunity"
  | "note"
  | "notify"
  | "block";

// Tipos v5: usados para esconder o que o servidor não anuncia em
// `engineFeatures` e para zerar os campos dos OUTROS tipos ao salvar.
export const AI_AGENT_ACTION_TYPES_V5: AiAgentActionType[] = [
  "opportunity",
  "note",
  "notify",
  "block",
];

// Ação de qualificação que o próprio agente executa durante a conversa
// (etiquetar o contato, mover no funil). O atendimento continua normalmente —
// exceto o tipo "block", que é TERMINAL (passa para a fila de emergência).
export interface AiAgentAction {
  key: string;
  type: AiAgentActionType;
  label: string;
  description: string;
  tagId?: number | null;
  kanbanId?: number | null;
  // v5 — oportunidade: destino sempre fixo no card (nunca escolhido pelo
  // agente); só o nome/descrição podem vir do que o cliente disse.
  pipelineId?: number | null;
  stageId?: number | null;
  responsibleId?: number | null;
  opportunityName?: string | null;
  opportunityValue?: number | null;
  // v5 — texto fixo de "note" e "notify" (aceita variáveis do atendimento).
  content?: string | null;
  // v5 — alvos do aviso à equipe.
  notifyQueueId?: number | null;
  notifyUserIds?: number[] | null;
  actionMessage?: string | null;
}

// Dado que o agente registra na ficha do contato conforme o cliente informa.
export interface AiAgentMemoryField {
  name: string;
  description?: string | null;
}

// ── v5: regras do encerramento e ferramentas nativas ──────────────────────

export interface AiAgentCloseReason {
  id: number;
  name: string;
}

export type AiAgentGraceDestinationType =
  | "lastUser"
  | "closedUser"
  | "queue"
  | "user"
  | "chatflow";

// Carência: depois de transferir para um atendente, se ELE encerrar e o cliente
// voltar dentro do prazo, a conversa vai direto ao destino, sem passar pela IA.
export interface AiAgentGraceRule {
  enabled: boolean;
  seconds: number;
  destinationType: AiAgentGraceDestinationType;
  queueId?: number | null;
  userId?: number | null;
  chatFlowId?: number | null;
}

export interface AiAgentCloseRules {
  reasons: AiAgentCloseReason[];
  grace: AiAgentGraceRule | null;
}

export interface AiAgentBookingTool {
  enabled: boolean;
  bookingPageId: number | null;
  eventTypes: Array<{ id: number; name: string }>;
  pageTimezone?: string | null;
}

export interface AiAgentScheduleMessageTool {
  enabled: boolean;
  maxDaysAhead: number;
}

export interface AiAgentNativeTools {
  booking: AiAgentBookingTool | null;
  scheduleMessage: AiAgentScheduleMessageTool | null;
}

// Fluxo do construtor, na forma enxuta do picker do agente
// (GET /ai-agents/lookup/chat-flows — 404 em servidor antigo).
export interface AiAgentChatFlowOption {
  id: number;
  name: string;
  isActive?: boolean;
}

// Recursos que o SERVIDOR anuncia saber executar. A tela só mostra o tipo de
// card, o destino e a seção que estiverem aqui: front adiantado contra backend
// atrasado não oferece o que não funcionaria, e servidor v4 (que não devolve o
// campo) deixa a tela exatamente como a de hoje.
export type AiAgentEngineFeature =
  | "actionsV5"
  | "routingV5"
  | "booking"
  | "scheduleMessage"
  // v6 — cada uma some quando o interruptor do servidor está desligado.
  | "kbJsonMd"
  | "agentHandoff"
  | "agentConsult"
  // v7 — `kbOnly` e `agentTemplates` são sempre anunciados pelo servidor v7;
  // `kbShared` some com o interruptor da base compartilhada desligado.
  | "kbShared"
  | "kbOnly"
  | "agentTemplates"
  // Atraso na resposta — some com o interruptor do servidor desligado.
  | "replyDelay"
  // v8 — servidores MCP (some com o interruptor do servidor desligado) e
  // senha das ferramentas externas mascarada (sempre anunciada pelo servidor
  // v8: "vazio" passa a significar "manter a senha salva").
  | "mcp"
  | "toolSecretMask"
  // "Quando transferir" com até MAX_AI_AGENT_TARGET_DESCRIPTION caracteres
  // (servidor antigo grava só 200).
  | "longTargetDescription"
  // "Sem resposta do cliente" (aviso + encerrar/transferir) — some com o
  // interruptor do servidor desligado.
  | "inactivity"
  // Passada separada de qualificação (etiqueta e funil depois de cada
  // mensagem) — some com o interruptor do servidor desligado.
  | "qualifyPass";

// Marcador de versão do editor: sem ele (front antigo), o servidor PRESERVA os
// cards e destinos v5/v6 já salvos em vez de deixá-los serem apagados.
// 6 = sabe editar o destino "Outro agente de IA" (`ai_agent`).
export const AI_AGENT_EDITOR_VERSION = 6;

// v6 — especialista que o agente pode consultar antes de responder. O nome NÃO
// vai junto: o servidor lê do próprio agente consultado.
export interface AiAgentConsultEntry {
  aiAgentId: number;
  description?: string | null;
}

// Espelho do MAX_CONSULT_AGENTS do backend (AgentV5ConfigZPRO.ts): mudar um
// exige o outro.
export const MAX_AI_AGENT_CONSULTS = 5;

// v7 — agente cuja base de conhecimento este agente também consulta.
export interface AiAgentSharedKbEntry {
  aiAgentId: number;
}

// Espelho do MAX_SHARED_KB_AGENTS do backend (SharedKnowledgeZPRO.ts): mudar
// um exige o outro.
export const MAX_AI_AGENT_SHARED_KB = 3;

// Espelho do MAX_REPLY_DELAY_SECONDS do backend (AgentReplyDelayZPRO.ts):
// mudar um exige o outro.
export const MAX_AI_AGENT_REPLY_DELAY_SECONDS = 120;

// Espelho do MAX_DESCRIPTION do sanitizador de destinos do backend
// (CreateAiAgentServiceZPRO.ts): mudar um exige o outro. O legado é o que o
// servidor sem o anúncio `longTargetDescription` grava.
export const MAX_AI_AGENT_TARGET_DESCRIPTION = 1000;
export const LEGACY_AI_AGENT_TARGET_DESCRIPTION = 200;

// "Sem resposta do cliente": depois de N minutos sem resposta à última
// mensagem do agente, avisa (opcional) e encerra ou transfere para uma fila.
// Tempos em minutos inteiros.
export interface AiAgentInactivityConfig {
  enabled: boolean;
  warning: { enabled: boolean; minutes: number; message: string };
  actAfterMinutes: number;
  action: "close" | "transfer";
  queueId: number | null;
  message: string;
}

// Espelho do AGENT_INACTIVITY_LIMITS do backend
// (AiAgentServices/AgentInactivityConfigZPRO.ts): mudar um exige o outro.
export const AGENT_INACTIVITY_LIMITS = {
  minMinutes: 1,
  maxMinutes: 1440,
  maxText: 1000,
  defaultWarnMinutes: 5,
  defaultActAfterMinutes: 10,
} as const;

export interface AiAgent extends AiAgentSummary {
  apiKey?: string;
  baseUrl?: string | null;
  model?: string;
  systemPrompt?: string | null;
  exitKeyword?: string | null;
  kbEnabled?: boolean;
  semanticEnabled?: boolean;
  routingEnabled?: boolean;
  routingTargets?: AiAgentRoutingTarget[] | null;
  autoSummaryEnabled?: boolean;
  fallbackQueueId?: number | null;
  transferMessage?: string | null;
  externalTools?: AiAgentExternalTool[] | null;
  // Qualificação (v4): servidor antigo NÃO devolve estes campos — a ausência
  // é o que o editor usa para avisar que as novidades foram ignoradas.
  actions?: AiAgentAction[] | null;
  memoryFields?: AiAgentMemoryField[] | null;
  memoryEnabled?: boolean;
  actionMessage?: string | null;
  // v5 — ausentes em servidor antigo; `engineFeatures` é o que decide o que a
  // tela mostra (a ausência dos campos é só a rede de segurança).
  closeRules?: AiAgentCloseRules | null;
  nativeTools?: AiAgentNativeTools | null;
  timezone?: string | null;
  // v6 — ausente em servidor antigo.
  consultAgents?: AiAgentConsultEntry[] | null;
  // v7 — ausente em servidor antigo.
  sharedKbAgents?: AiAgentSharedKbEntry[] | null;
  // Atraso na resposta, em segundos — ausente em servidor antigo; null = na hora.
  replyDelayMin?: number | null;
  replyDelayMax?: number | null;
  // v8 — ausente em servidor antigo; null = agente sem MCP.
  mcpTools?: AiAgentMcpToolsEntry[] | null;
  // "Sem resposta do cliente" — ausente em servidor antigo; null = regra
  // nunca configurada (desligada).
  inactivityConfig?: AiAgentInactivityConfig | null;
  // Passada de qualificação — ausente em servidor antigo e em banco sem a
  // coluna (a tela esconde o interruptor desse agente).
  qualifyPassEnabled?: boolean;
  engineFeatures?: AiAgentEngineFeature[] | null;
  maxHistoryMessages?: number | null;
  temperature?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiAgentKnowledge {
  id: number;
  agentId: number;
  title?: string | null;
  content: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type AiAgentSourceType = "document" | "url" | "faq";

/**
 * Fonte importada da base de conhecimento (documento, link ou FAQ).
 * O backend NÃO expõe `fileKey` nem `contentHash` — não declarar aqui.
 * `errorMessage` vem como CÓDIGO `ERR_*`: traduzir por `agent-error.ts`,
 * nunca renderizar cru.
 */
export interface AiAgentSource {
  id: number;
  type: AiAgentSourceType;
  name: string;
  url?: string | null;
  status: "ready" | "error";
  errorMessage?: string | null;
  syncEnabled?: boolean;
  chunkCount?: number;
  lastSyncAt?: string | null;
  createdAt?: string;
}

export interface AiAgentFaqItem {
  question: string;
  answer: string;
}

export interface AiAgentPayload {
  name: string;
  description?: string | null;
  isActive?: boolean;
  apiKey?: string;
  baseUrl?: string | null;
  model?: string;
  systemPrompt?: string | null;
  exitKeyword?: string | null;
  kbEnabled?: boolean;
  semanticEnabled?: boolean;
  routingEnabled?: boolean;
  routingTargets?: AiAgentRoutingTarget[];
  autoSummaryEnabled?: boolean;
  fallbackQueueId?: number | null;
  transferMessage?: string | null;
  externalTools?: AiAgentExternalTool[];
  actions?: AiAgentAction[];
  memoryFields?: AiAgentMemoryField[];
  memoryEnabled?: boolean;
  actionMessage?: string | null;
  // v5
  closeRules?: AiAgentCloseRules | null;
  nativeTools?: AiAgentNativeTools | null;
  timezone?: string | null;
  // v6 — enviar SÓ quando o servidor anuncia `agentConsult` (servidor antigo
  // ignoraria o campo em silêncio).
  consultAgents?: AiAgentConsultEntry[] | null;
  // v7 — enviar SÓ quando o servidor anuncia `kbShared` (bases) e `kbOnly`
  // (interruptor "só base").
  sharedKbAgents?: AiAgentSharedKbEntry[] | null;
  kbOnly?: boolean;
  // Atraso na resposta — enviar SÓ quando o servidor anuncia `replyDelay`
  // (ausente = o servidor mantém o que está salvo).
  replyDelayMin?: number | null;
  replyDelayMax?: number | null;
  // v8 — enviar SÓ quando o servidor anuncia `mcp` E a lista de servidores
  // carregou (ausente = o servidor mantém o vínculo salvo).
  mcpTools?: AiAgentMcpToolsEntry[] | null;
  // "Sem resposta do cliente" — enviar SÓ quando o servidor anuncia
  // `inactivity` e o agente não é "só base" (ausente = o servidor mantém o que
  // está salvo; null = limpa).
  inactivityConfig?: AiAgentInactivityConfig | null;
  // Passada de qualificação — enviar SÓ quando o servidor anuncia
  // `qualifyPass` e o agente devolveu o campo (ausente = o servidor mantém).
  qualifyPassEnabled?: boolean;
  // Marcador do editor novo: sem ele o servidor preserva o que o front antigo
  // não sabe editar.
  editorVersion?: number;
  maxHistoryMessages?: number | null;
  temperature?: number | null;
}

// `background`: carga automática da página (o selo do card em /sessoes) — plano sem
// Agentes de IA não mostra o aviso global de "recurso fora do plano".
export async function fetchAiAgents(opts?: { background?: boolean }): Promise<AiAgentSummary[]> {
  const { data } = await api.get("/ai-agents", opts?.background ? BACKGROUND_REQUEST : undefined);
  return Array.isArray(data) ? data : data?.records || [];
}

/**
 * v7 — recursos que o servidor sabe executar, SEM precisar de agente na
 * listagem (a página só chama com a listagem vazia). Contrato fixo:
 * `{ engineFeatures: string[] }`. Servidor antigo não tem a rota: a URL cai no
 * Show, que responde 404 `ERR_AI_AGENT_NOT_FOUND` (ou 403/402, calados aqui) —
 * tudo vira `null` = "desconhecido", nunca `[]`.
 */
export async function fetchAiAgentEngineFeatures(): Promise<
  AiAgentEngineFeature[] | null
> {
  try {
    const { data } = await api.get("/ai-agents/features", {
      ...BACKGROUND_REQUEST,
      skipNoPermissionToast: true,
    });
    const list = data?.engineFeatures;
    return Array.isArray(list) ? (list as AiAgentEngineFeature[]) : null;
  } catch {
    return null;
  }
}

// v7 — quem usa o agente (aviso ao excluir e ao marcar "só base").
export interface AiAgentUsageRef {
  id: number;
  name: string;
}

export interface AiAgentUsage {
  // Agentes que usam a base deste.
  sharedKbBy: AiAgentUsageRef[];
  // Agentes que transferem para este (destino "Outro agente de IA").
  transferFrom: AiAgentUsageRef[];
  // Agentes que consultam este.
  consultedBy: AiAgentUsageRef[];
  // Canais vinculados a este agente.
  channels: AiAgentUsageRef[];
}

/**
 * Silenciosa: erro, 404 (servidor antigo) ou forma inesperada = `null`, e a
 * tela segue com o diálogo genérico de hoje.
 */
export async function fetchAiAgentUsage(id: number): Promise<AiAgentUsage | null> {
  try {
    const { data } = await api.get(`/ai-agents/${id}/usage`, {
      ...BACKGROUND_REQUEST,
      skipNoPermissionToast: true,
    });
    if (!data || typeof data !== "object") return null;
    const pick = (value: unknown): AiAgentUsageRef[] =>
      Array.isArray(value)
        ? value
            .filter(
              (item: any) =>
                item && Number(item.id) > 0 && typeof item.name === "string"
            )
            .map((item: any) => ({ id: Number(item.id), name: String(item.name) }))
        : [];
    if (
      !Array.isArray(data.sharedKbBy) &&
      !Array.isArray(data.transferFrom) &&
      !Array.isArray(data.consultedBy) &&
      !Array.isArray(data.channels)
    ) {
      return null;
    }
    return {
      sharedKbBy: pick(data.sharedKbBy),
      transferFrom: pick(data.transferFrom),
      consultedBy: pick(data.consultedBy),
      channels: pick(data.channels),
    };
  } catch {
    return null;
  }
}

// ── v7: modelos prontos (POST /ai-agents/from-template) ──────────────────

// Destino de um agente criado por modelo. `aiAgentRef` aponta para OUTRO
// agente do mesmo lote (o `ref` dele); o servidor troca pelo id criado.
export interface AiAgentTemplateTarget {
  key: string;
  label: string;
  description: string;
  type: "queue" | "ai_agent";
  queueId?: number | null;
  aiAgentRef?: string;
}

export interface AiAgentTemplateArticle {
  title: string;
  content: string;
}

export interface AiAgentTemplateAgentInput {
  // Identificador do agente DENTRO do lote (`^[a-z][a-z0-9_]{0,39}$`).
  ref: string;
  name: string;
  description?: string | null;
  systemPrompt: string;
  transferMessage?: string | null;
  memoryEnabled?: boolean;
  memoryFields?: AiAgentMemoryField[];
  routingTargets: AiAgentTemplateTarget[];
  // Nascem DESATIVADOS no servidor (o admin completa as lacunas e ativa).
  articles?: AiAgentTemplateArticle[];
}

// Conexão de IA dos agentes criados. No modo `copy` a chave é copiada NO
// SERVIDOR a partir do agente escolhido — nunca passa pelo navegador.
export type AiAgentTemplateConnection =
  | { mode: "platform"; model: string }
  | { mode: "copy"; aiAgentId: number }
  | { mode: "key"; apiKey: string; baseUrl?: string | null; model?: string | null };

export interface AiAgentTemplatePayload {
  connection: AiAgentTemplateConnection;
  // Obrigatória: é para ela que a IA passa o atendimento quando precisa de uma
  // pessoa (sem fila o agente criado ficaria sem ferramenta nenhuma).
  fallbackQueueId: number;
  agents: AiAgentTemplateAgentInput[];
}

export type AiAgentTemplateCreated = AiAgentSummary & { ref: string };

/**
 * Cria de 1 a 6 agentes numa transação só (tudo ou nada). Resposta enxuta, sem
 * chave. Servidor antigo responde 404 SEM código (a rota não existe).
 */
export async function createAiAgentsFromTemplate(
  payload: AiAgentTemplatePayload
): Promise<{ agents: AiAgentTemplateCreated[] }> {
  // Teto maior que os 30 s padrão: com o banco ocupado o servidor pode levar
  // até ~60 s para responder, e cortar antes faria a tela dizer "falhou" para
  // uma equipe que foi criada (repetir criaria outra).
  const { data } = await api.post("/ai-agents/from-template", payload, {
    timeout: 120000,
  });
  return { agents: Array.isArray(data?.agents) ? data.agents : [] };
}

export async function fetchAiAgent(id: number): Promise<AiAgent> {
  const { data } = await api.get(`/ai-agents/${id}`);
  return data;
}

export async function createAiAgent(payload: AiAgentPayload): Promise<AiAgent> {
  const { data } = await api.post("/ai-agents", payload);
  return data;
}

export async function updateAiAgent(
  id: number,
  payload: AiAgentPayload
): Promise<AiAgent> {
  const { data } = await api.put(`/ai-agents/${id}`, payload);
  return data;
}

export async function deleteAiAgent(id: number): Promise<void> {
  await api.delete(`/ai-agents/${id}`);
}

// Cópia fiel no servidor (todas as abas + base de conhecimento). O nome vai
// pronto daqui — o backend não traduz. Servidor antigo responde 404 sem código.
export async function duplicateAiAgent(
  id: number,
  name: string
): Promise<AiAgentSummary> {
  const { data } = await api.post(`/ai-agents/${id}/duplicate`, { name });
  return data;
}

/**
 * Fluxos do construtor na forma ENXUTA (id, nome, ativo) para o destino
 * "Fluxo" da aba Roteamento. Rota própria de propósito: o `GET /chat-flow` do
 * CRUD devolve o desenho inteiro de todos os fluxos em base64. Servidor antigo
 * responde 404 — o chamador desabilita o tipo.
 */
export async function fetchAiAgentChatFlows(): Promise<AiAgentChatFlowOption[]> {
  const { data } = await api.get("/ai-agents/lookup/chat-flows");
  return Array.isArray(data) ? data : data?.records || [];
}

export async function fetchAiAgentKnowledge(
  agentId: number
): Promise<AiAgentKnowledge[]> {
  const { data } = await api.get(`/ai-agents/${agentId}/knowledge`);
  return Array.isArray(data) ? data : data?.records || [];
}

export async function createAiAgentKnowledge(
  agentId: number,
  payload: { title?: string | null; content: string; isActive?: boolean }
): Promise<AiAgentKnowledge> {
  const { data } = await api.post(`/ai-agents/${agentId}/knowledge`, payload);
  return data;
}

export async function updateAiAgentKnowledge(
  agentId: number,
  knowledgeId: number,
  payload: { title?: string | null; content?: string; isActive?: boolean }
): Promise<AiAgentKnowledge> {
  const { data } = await api.put(
    `/ai-agents/${agentId}/knowledge/${knowledgeId}`,
    payload
  );
  return data;
}

export async function deleteAiAgentKnowledge(
  agentId: number,
  knowledgeId: number
): Promise<void> {
  await api.delete(`/ai-agents/${agentId}/knowledge/${knowledgeId}`);
}

// ── Fontes da base de conhecimento ────────────────────────────────────────
// A extração/indexação é síncrona no servidor (parser + embeddings), então
// toda ingestão passa `timeout: 300000`: o timeout global do axios é 30s e
// abortar no meio deixaria a request processando no servidor (retry viraria
// duplicata).

export async function fetchAiAgentSources(
  agentId: number
): Promise<AiAgentSource[]> {
  const { data } = await api.get(`/ai-agents/${agentId}/sources`);
  return Array.isArray(data) ? data : data?.records || [];
}

export async function createAiAgentDocumentSource(
  agentId: number,
  file: File
): Promise<AiAgentSource> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post(
    `/ai-agents/${agentId}/sources/document`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 }
  );
  return data;
}

export async function createAiAgentUrlSource(
  agentId: number,
  payload: { url: string; syncEnabled?: boolean }
): Promise<AiAgentSource> {
  const { data } = await api.post(
    `/ai-agents/${agentId}/sources/url`,
    payload,
    { timeout: 300000 }
  );
  return data;
}

export async function createAiAgentFaqSource(
  agentId: number,
  payload: { name?: string | null; items: AiAgentFaqItem[] }
): Promise<AiAgentSource> {
  const { data } = await api.post(
    `/ai-agents/${agentId}/sources/faq`,
    payload,
    { timeout: 300000 }
  );
  return data;
}

export async function deleteAiAgentSource(
  agentId: number,
  sourceId: number
): Promise<void> {
  await api.delete(`/ai-agents/${agentId}/sources/${sourceId}`);
}

export async function resyncAiAgentSource(
  agentId: number,
  sourceId: number
): Promise<AiAgentSource> {
  const { data } = await api.post(
    `/ai-agents/${agentId}/sources/${sourceId}/resync`,
    {},
    { timeout: 300000 }
  );
  return data;
}
