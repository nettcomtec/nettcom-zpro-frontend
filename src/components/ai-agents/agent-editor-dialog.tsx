"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, BookOpen, Bot, HelpCircle, KeyRound, Loader2, Split, Webhook, Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { OpenAIBaseUrlField } from "@/components/copilot/openai-base-url-field";
import {
  PlatformAiSelector, isPlatformAiModelAvailable, usePlatformAiEnabled,
} from "@/components/ai-credits/platform-ai-selector";
import { CHATGPT_MODELS } from "@/lib/openai-models";
import { useAuthStore } from "@/stores/auth-store";
import { AI_PLATFORM_KEY_SENTINEL, isPlatformKey } from "@/services/ai-credits";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchAllUsers, type User } from "@/services/users";
import { fetchTags } from "@/services/tags";
import { fetchKanbans } from "@/services/kanban";
import { fetchPipelines, fetchStages } from "@/services/funnel";
import { fetchReasons, type Reason } from "@/services/reasons";
import {
  fetchBookingEventTypes, fetchBookingPages,
  type BookingEventType, type BookingPage,
} from "@/services/booking";
import {
  AGENT_INACTIVITY_LIMITS,
  AI_AGENT_ACTION_TYPES_V5, AI_AGENT_EDITOR_VERSION, MAX_AI_AGENT_REPLY_DELAY_SECONDS,
  MAX_AI_AGENT_TARGET_DESCRIPTION, LEGACY_AI_AGENT_TARGET_DESCRIPTION,
  MAX_AI_AGENT_SHARED_KB,
  createAiAgent, fetchAiAgent, fetchAiAgentChatFlows, fetchAiAgentUsage, fetchAiAgents,
  updateAiAgent,
  type AiAgentAction, type AiAgentActionType, type AiAgentChatFlowOption,
  type AiAgentCloseRules, type AiAgentEngineFeature, type AiAgentExternalTool,
  type AiAgentInactivityConfig,
  type AiAgentMcpToolsEntry, type AiAgentMemoryField, type AiAgentNativeTools,
  type AiAgentPayload, type AiAgentRoutingTarget, type AiAgentSummary,
  type AiAgentUsage, type AiAgentUsageRef,
} from "@/services/ai-agents";
import {
  MAX_MCP_SERVERS_PER_AGENT, MAX_MCP_TOOLS_PER_AGENT, listAiMcpServers,
  type McpServerView,
} from "@/services/ai-mcp-servers";

import { AgentKnowledgeTab } from "./agent-knowledge-tab";
import {
  AgentRoutingTab, generateTargetKey, type AgentInactivityFormValue,
} from "./agent-routing-tab";
import {
  AgentActionsTab, generateActionKey, isValidMemoryFieldName,
  normalizeMemoryFieldName,
} from "./agent-actions-tab";
import {
  AgentToolsTab, generateConsultRowKey, generateMcpRowKey, generateToolKey,
  type AgentExternalToolRow, type AgentMcpRow, type AiAgentConsultRow,
} from "./agent-tools-tab";
import { aiAgentErrorKey } from "./agent-error";

interface AgentForm {
  name: string;
  description: string;
  isActive: boolean;
  systemPrompt: string;
  exitKeyword: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  // IA da plataforma: o agente consome do saldo pré-pago em vez de chave
  // própria. Só VALE com o recurso liberado na empresa (ver `platformMode`)
  usePlatformAi: boolean;
  // Como o agente está gravado no servidor — decide quando a chave volta a ser
  // obrigatória na edição e quando o modelo é conferido antes do save
  savedOnPlatformAi: boolean;
  // Modelo guardado do OUTRO modo: os nomes de modelo da plataforma não são os
  // mesmos da chave própria, então cada modo lembra o seu ao alternar
  otherModeModel: string | null;
  kbEnabled: boolean;
  semanticEnabled: boolean;
  routingEnabled: boolean;
  routingTargets: AiAgentRoutingTarget[];
  autoSummaryEnabled: boolean;
  fallbackQueueId: number | null;
  transferMessage: string;
  // v8 (D13-1) — com `toolSecretMask` a senha salva nunca vem: o campo fica
  // vazio, `hasSecret`/`savedUrl` contam o que está gravado
  externalTools: AgentExternalToolRow[];
  // v8 — servidores MCP e ferramentas aprovadas que o agente usa (aba
  // Ferramentas). Servidor antigo não devolve o campo: ausente = lista vazia.
  mcpTools: AgentMcpRow[];
  // v4 — qualificação: etiquetar/mover no funil e anotar dados na ficha
  actions: AiAgentAction[];
  actionMessage: string;
  memoryEnabled: boolean;
  memoryFields: AiAgentMemoryField[];
  // v5 — motivos de encerramento e carência (aba Roteamento), agenda e mensagem
  // agendada (aba Ferramentas) e o fuso que o agente usa para falar de horário.
  // Servidor antigo não devolve nenhum dos três: ausente = null / vazio.
  closeRules: AiAgentCloseRules | null;
  nativeTools: AiAgentNativeTools | null;
  timezone: string;
  // v6 — especialistas que o agente consulta antes de responder (aba
  // Ferramentas). Servidor antigo não devolve o campo: ausente = lista vazia.
  consultAgents: AiAgentConsultRow[];
  // v7 — agente "só base de conhecimento": não atende, fica sempre inativo e
  // só guarda conhecimento para outros agentes. `savedKbOnly` é como ele está
  // gravado (o interruptor continua visível para quem já é "só base").
  kbOnly: boolean;
  savedKbOnly: boolean;
  // v7 — agentes cuja base este também consulta (aba Conhecimento). `0` é a
  // linha recém-adicionada sem agente escolhido: rascunho, fica fora do save.
  sharedKbAgents: number[];
  // Atraso na resposta, em segundos (texto do campo). Os dois vazios = responde
  // na hora; só um preenchido = tempo fixo (o servidor completa o outro).
  replyDelayMin: string;
  replyDelayMax: string;
  // "Sem resposta do cliente" (aba Roteamento). Servidor antigo não devolve o
  // campo: ausente = regra desligada com os tempos padrão.
  inactivity: AgentInactivityFormValue;
  // Passada de qualificação (aba Ações): etiquetas e funil decididos depois
  // de cada mensagem do cliente. Nasce ligada.
  qualifyPassEnabled: boolean;
  // Vazio = usa o padrão do servidor (20 mensagens / temperatura do modelo)
  maxHistoryMessages: string;
  temperature: string;
}

// Regra nasce DESLIGADA (D4), sem aviso, com os tempos padrão do servidor
const EMPTY_INACTIVITY_FORM: AgentInactivityFormValue = {
  enabled: false,
  warnEnabled: false,
  warnMinutes: String(AGENT_INACTIVITY_LIMITS.defaultWarnMinutes),
  warnMessage: "",
  actAfterMinutes: String(AGENT_INACTIVITY_LIMITS.defaultActAfterMinutes),
  action: "close",
  queueId: null,
  message: "",
};

// Valor gravado → formulário. Tolerante a JSON parcial ou de outra versão:
// tempo ilegível volta ao padrão, ação desconhecida vira "Encerrar".
const toInactivityForm = (raw: unknown): AgentInactivityFormValue => {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return EMPTY_INACTIVITY_FORM;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_INACTIVITY_FORM;
  }
  const cfg = value as Partial<AiAgentInactivityConfig>;
  const warning =
    cfg.warning && typeof cfg.warning === "object" ? cfg.warning : null;
  const minutesText = (minutes: unknown, fallback: number): string => {
    const n = Number(minutes);
    return Number.isInteger(n) && n > 0 ? String(n) : String(fallback);
  };
  const queueId = Number(cfg.queueId);
  return {
    enabled: cfg.enabled === true,
    warnEnabled: warning?.enabled === true,
    warnMinutes: minutesText(warning?.minutes, AGENT_INACTIVITY_LIMITS.defaultWarnMinutes),
    warnMessage: warning && typeof warning.message === "string" ? warning.message : "",
    actAfterMinutes: minutesText(
      cfg.actAfterMinutes,
      AGENT_INACTIVITY_LIMITS.defaultActAfterMinutes
    ),
    action: cfg.action === "transfer" ? "transfer" : "close",
    queueId: Number.isInteger(queueId) && queueId > 0 ? queueId : null,
    message: typeof cfg.message === "string" ? cfg.message : "",
  };
};

// Minutos inteiros dentro dos limites do servidor; `null` = vazio ou inválido
const parseInactivityMinutes = (raw: string): number | null => {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= AGENT_INACTIVITY_LIMITS.minMinutes &&
    value <= AGENT_INACTIVITY_LIMITS.maxMinutes
    ? value
    : null;
};

const EMPTY_FORM: AgentForm = {
  name: "",
  description: "",
  isActive: true,
  systemPrompt: "",
  exitKeyword: "",
  apiKey: "",
  baseUrl: "",
  model: "gpt-4o-mini",
  usePlatformAi: false,
  savedOnPlatformAi: false,
  otherModeModel: null,
  kbEnabled: true,
  semanticEnabled: false,
  routingEnabled: true,
  routingTargets: [],
  autoSummaryEnabled: true,
  fallbackQueueId: null,
  transferMessage: "",
  externalTools: [],
  mcpTools: [],
  actions: [],
  actionMessage: "",
  memoryEnabled: false,
  memoryFields: [],
  closeRules: null,
  nativeTools: null,
  timezone: "",
  consultAgents: [],
  kbOnly: false,
  savedKbOnly: false,
  sharedKbAgents: [],
  replyDelayMin: "",
  replyDelayMax: "",
  inactivity: EMPTY_INACTIVITY_FORM,
  qualifyPassEnabled: true,
  maxHistoryMessages: "",
  temperature: "",
};

// Recursos que o SERVIDOR anuncia saber executar. A tela só oferece o tipo de
// card, o destino e a seção que estiverem na lista: front adiantado contra
// servidor atrasado não mostra o que não funcionaria, e servidor que não
// devolve o campo deixa a tela exatamente como era antes.
// Tudo o que ESTA tela sabe usar — filtro do anúncio (o que o servidor anuncia
// e a tela não conhece é ignorado). Recurso novo entra aqui, senão é descartado
// mesmo quando o servidor o anuncia.
const KNOWN_ENGINE_FEATURES: AiAgentEngineFeature[] = [
  "actionsV5", "routingV5", "booking", "scheduleMessage",
  "kbJsonMd", "agentHandoff", "agentConsult",
  "kbShared", "kbOnly", "agentTemplates", "replyDelay",
  // v8 — servidores MCP e senha das ferramentas externas escondida. NUNCA no
  // fallback da sonda abaixo: servidor antigo "ganharia" os dois
  "mcp", "toolSecretMask",
  "longTargetDescription",
  // "Sem resposta do cliente". NUNCA no fallback da sonda abaixo: servidor
  // antigo "ganharia" o bloco e ignoraria o campo no save
  "inactivity",
  // Passada de qualificação. NUNCA no fallback da sonda abaixo: servidor
  // antigo "ganharia" o interruptor e ignoraria o campo no save
  "qualifyPass",
];

// Fallback da descoberta na CRIAÇÃO sem nenhum agente na empresa: a sonda da
// rota de fluxos só prova a geração v5. Os recursos v6 e v7 dependem do
// servidor e NUNCA entram por aqui — um servidor v5 que responde a sonda
// passaria a oferecer o que não executa.
const PROBE_FALLBACK_FEATURES: AiAgentEngineFeature[] = [
  "actionsV5", "routingV5", "booking", "scheduleMessage",
];

const normalizeEngineFeatures = (raw: unknown): AiAgentEngineFeature[] => {
  if (!Array.isArray(raw)) return [];
  const announced = raw as unknown[];
  return KNOWN_ENGINE_FEATURES.filter(feature => announced.includes(feature));
};

// Recursos que a página descobriu pela rota própria (empresa sem agente). Só
// vale array NÃO vazio: `null` (desconhecido) e `[]` seguem para a sonda de
// fluxos, exatamente como antes.
const usableFallbackFeatures = (raw: unknown): AiAgentEngineFeature[] | null => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const features = normalizeEngineFeatures(raw);
  return features.length > 0 ? features : null;
};

// Abas que não existem para o agente "só base" (ele não atende ninguém)
const KB_ONLY_HIDDEN_TABS = ["routing", "actions", "tools"];

// Até 5 nomes por linha do aviso de uso; o resto vira "e mais N"
const USAGE_NAMES_SHOWN = 5;

// A listagem enxuta de agentes leva o mesmo anúncio de recursos do Show — é a
// única forma de descobrir o que o servidor executa ANTES do 1º save
type AgentListItem = AiAgentSummary & {
  engineFeatures?: AiAgentEngineFeature[] | null;
};

const KNOWN_ACTION_TYPES: AiAgentActionType[] = [
  "tag", "kanban", ...AI_AGENT_ACTION_TYPES_V5,
];

// Tipo desconhecido (servidor mais novo que a tela) cai em "tag" para o card
// continuar editável; tipo conhecido é PRESERVADO — forçar "tag"/"kanban" aqui
// apagava o card novo ao salvar de novo
const normalizeActionType = (raw: unknown): AiAgentActionType =>
  KNOWN_ACTION_TYPES.find(type => type === raw) || "tag";

// Tipo desconhecido (servidor mais novo que a tela) vira "fila" sem fila: o
// save barra em "destinos incompletos" em vez de gravar destino errado. Tipo
// conhecido é PRESERVADO — "ai_agent" (v6) incluído.
const normalizeTargetType = (raw: unknown): AiAgentRoutingTarget["type"] =>
  raw === "user"
    ? "user"
    : raw === "chatflow"
      ? "chatflow"
      : raw === "ai_agent"
        ? "ai_agent"
        : "queue";

// `/pipelines` e `/stages` respondem ora array puro, ora `{ data: [...] }`
const asRows = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  const inner =
    (payload as { data?: unknown })?.data ?? (payload as { rows?: unknown })?.rows;
  return Array.isArray(inner) ? (inner as T[]) : [];
};

interface PipelineOption {
  id: number;
  name: string;
}

interface StageOption {
  id: number;
  name: string;
  pipelineId: number;
}

type ActionTypedFields = Pick<
  AiAgentAction,
  | "tagId" | "kanbanId" | "pipelineId" | "stageId" | "responsibleId"
  | "opportunityName" | "opportunityValue" | "content"
  | "notifyQueueId" | "notifyUserIds"
>;

// Base com TODOS os campos de destino zerados. Cada card salvo leva esta base
// mais o que o tipo DELE usa: esquecer um campo aqui deixaria gravado o destino
// do tipo anterior e a ação passaria a fazer duas coisas.
const EMPTY_ACTION_FIELDS: ActionTypedFields = {
  tagId: null,
  kanbanId: null,
  pipelineId: null,
  stageId: null,
  responsibleId: null,
  opportunityName: null,
  opportunityValue: null,
  content: null,
  notifyQueueId: null,
  notifyUserIds: null,
};

const trimmedOrNull = (value?: string | null): string | null =>
  (value || "").trim() || null;

const actionFieldsForType = (action: AiAgentAction): ActionTypedFields => {
  switch (action.type) {
    case "kanban":
      return { ...EMPTY_ACTION_FIELDS, kanbanId: action.kanbanId ?? null };
    case "opportunity": {
      const value = Number(action.opportunityValue);
      return {
        ...EMPTY_ACTION_FIELDS,
        pipelineId: action.pipelineId ?? null,
        stageId: action.stageId ?? null,
        responsibleId: action.responsibleId ?? null,
        opportunityName: trimmedOrNull(action.opportunityName),
        opportunityValue:
          action.opportunityValue != null && Number.isFinite(value) && value >= 0
            ? value
            : null,
      };
    }
    case "note":
      return { ...EMPTY_ACTION_FIELDS, content: trimmedOrNull(action.content) };
    case "notify": {
      // Alvo repetido ou id inválido sai do payload: o servidor descartaria do
      // mesmo jeito e a linha sumiria da tela sem explicação
      const ids = Array.from(
        new Set(
          (action.notifyUserIds || []).filter(id => Number.isInteger(id) && id > 0)
        )
      );
      return {
        ...EMPTY_ACTION_FIELDS,
        content: trimmedOrNull(action.content),
        notifyQueueId: action.notifyQueueId ?? null,
        notifyUserIds: ids.length ? ids : null,
      };
    }
    case "block":
      return { ...EMPTY_ACTION_FIELDS };
    case "tag":
    default:
      return { ...EMPTY_ACTION_FIELDS, tagId: action.tagId ?? null };
  }
};

interface AgentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null = criação; number = edição (aba Conhecimento só na edição)
  agentId: number | null;
  onSaved: () => void;
  // v7 — recursos que a página obteve da rota própria quando a listagem veio
  // vazia. Usado SÓ na criação e só como array não vazio: vale depois do
  // anúncio da listagem e antes da sonda de fluxos.
  fallbackFeatures?: AiAgentEngineFeature[] | null;
}

export function AgentEditorDialog({
  open, onOpenChange, agentId, onSaved, fallbackFeatures,
}: AgentEditorDialogProps) {
  const t = useTranslations("aiAgents");

  const [tab, setTab] = useState("profile");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AgentForm>(EMPTY_FORM);

  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  // Destinos das ações de qualificação. Lista vazia (tenant sem cadastro ou
  // falha na chamada) desabilita só o tipo correspondente na aba Ações
  const [tags, setTags] = useState<Array<{ id: number; name: string }>>([]);
  const [kanbans, setKanbans] = useState<Array<{ id: number; name: string }>>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [chatFlows, setChatFlows] = useState<AiAgentChatFlowOption[]>([]);
  // Rota enxuta de fluxos não existe em servidor antigo (404): sem ela o tipo
  // de destino "Fluxo" fica indisponível na aba Roteamento
  const [chatFlowsAvailable, setChatFlowsAvailable] = useState(false);
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [bookingEventTypes, setBookingEventTypes] = useState<BookingEventType[]>([]);
  // v6 — agentes do tenant (listagem enxuta, 1 chamada por abertura) para o
  // destino "Outro agente de IA" e a consulta a especialistas. `Loaded` só vira
  // true com a lista em mãos: antes disso (ou se ela falhar) as abas não acusam
  // agente gravado como "removido".
  const [aiAgentOptions, setAiAgentOptions] = useState<AiAgentSummary[]>([]);
  const [aiAgentOptionsLoaded, setAiAgentOptionsLoaded] = useState(false);
  // v7 — quem usa este agente, consultado ao LIGAR o "só base" num agente já
  // salvo. `null` = sem consulta ou falha (fica só a nota fixa do interruptor).
  const [kbOnlyUsage, setKbOnlyUsage] = useState<AiAgentUsage | null>(null);
  const [kbOnlyUsageLoading, setKbOnlyUsageLoading] = useState(false);
  // Descarta a resposta de uma consulta que ficou velha (desligou e ligou de
  // novo, ou fechou o editor no meio)
  const kbOnlyUsageRequestRef = useRef(0);
  // v8 — servidores MCP da empresa, carregados aqui UMA vez por abertura (a aba
  // Ferramentas recebe pronto). `null` = não carregou (erro ou sem acesso): a
  // seção fica somente leitura e o save NÃO envia `mcpTools` (o servidor
  // mantém o vínculo salvo). Recarga que falha mantém a lista que já havia.
  const [mcpServers, setMcpServers] = useState<McpServerView[] | null>(null);
  const [mcpServersLoading, setMcpServersLoading] = useState(false);
  const mcpServersRequestRef = useRef(0);

  // A aba Ferramentas recebe a forma enxuta: a pagina de agendamento chama o
  // nome de "title", e "servico com pergunta obrigatoria" (que a v5 nao
  // reserva) so existe como campo required dentro do formulario do tipo.
  const bookingPagesForTab = useMemo(
    () =>
      bookingPages
        .filter(page => page.isActive !== false)
        .map(page => ({ id: page.id, name: page.title, timezone: page.timezone })),
    [bookingPages]
  );
  const bookingEventTypesForTab = useMemo(
    () =>
      bookingEventTypes
        .filter(type => type.isActive !== false)
        .map(type => ({
          id: type.id,
          name: type.name,
          requiresForm: (type.formFields || []).some(field => field.required),
        })),
    [bookingEventTypes]
  );

  const listsLoadedRef = useRef(false);
  const funnelLoadedRef = useRef(false);
  const reasonsLoadedRef = useRef(false);
  const chatFlowsLoadedRef = useRef(false);
  const bookingLoadedRef = useRef(false);
  const loadedStagePipelinesRef = useRef<Set<number>>(new Set());
  const loadedBookingPageRef = useRef<number | null>(null);
  // Recursos do servidor descobertos na criação: resolvidos uma vez por sessão
  // da tela (só em caso de sucesso — falha volta a sondar na próxima abertura)
  const createFeaturesRef = useRef<AiAgentEngineFeature[] | null>(null);
  // Valor mais recente de `fallbackFeatures` (a página pode recebê-lo depois de
  // o editor abrir) e se a listagem desta abertura já anunciou os recursos —
  // o anúncio da listagem sempre vence o da página.
  const fallbackFeaturesRef = useRef<AiAgentEngineFeature[] | null | undefined>(
    fallbackFeatures
  );
  fallbackFeaturesRef.current = fallbackFeatures;
  const createListAnnouncedRef = useRef(false);

  // O que ESTE servidor anuncia saber executar (A11). Vazio = servidor v4: a
  // tela fica exatamente como era antes das interações novas.
  const [engineFeatures, setEngineFeatures] = useState<AiAgentEngineFeature[]>([]);
  const supportsV5 = engineFeatures.includes("actionsV5");
  const supportsRoutingV5 = engineFeatures.includes("routingV5");
  const supportsBooking = engineFeatures.includes("booking");
  const supportsScheduleMessage = engineFeatures.includes("scheduleMessage");
  const supportsAgentHandoff = engineFeatures.includes("agentHandoff");
  const supportsLongTargetDescription = engineFeatures.includes("longTargetDescription");
  const supportsAgentConsult = engineFeatures.includes("agentConsult");
  const supportsKbShared = engineFeatures.includes("kbShared");
  const supportsKbOnly = engineFeatures.includes("kbOnly");
  // Atraso na resposta: sem o anúncio o campo some e não vai no save (o
  // servidor mantém o que está gravado)
  const supportsReplyDelay = engineFeatures.includes("replyDelay");
  // v8 — sem `mcp` a seção não aparece e o campo não vai no save; sem
  // `toolSecretMask` a senha das ferramentas externas segue como sempre (o
  // servidor antigo devolve a senha e substitui a lista inteira no save)
  const supportsMcp = engineFeatures.includes("mcp");
  const supportsToolSecretMask = engineFeatures.includes("toolSecretMask");
  // "Sem resposta do cliente": sem o anúncio o bloco some da aba Roteamento e
  // o campo não vai no save (o servidor mantém o que está gravado)
  const supportsInactivity = engineFeatures.includes("inactivity");
  // Passada de qualificação: sem o anúncio o interruptor some da aba Ações e
  // o campo não vai no save (o servidor mantém o que está gravado)
  const supportsQualifyPass = engineFeatures.includes("qualifyPass");
  // O servidor devolveu o valor do interruptor para ESTE agente (agente novo
  // sempre conta). Banco sem a coluna não devolve o campo: o interruptor
  // fica escondido e nada vai no save
  const [qualifyPassKnown, setQualifyPassKnown] = useState(false);

  // Funil e Página de Agendamento são capacidades de PLANO. Sem o pré-check, só
  // abrir a aba viraria 402 + toast global de "recurso fora do plano" sem o
  // admin ter pedido nada (a chamada da agenda não aceita modo background)
  const hasFunnelFeature = useAuthStore(s => s.hasFeature("funnelKanban"));
  const hasBookingFeature = useAuthStore(s => s.hasFeature("publicBooking"));
  const hasSchedulingFeature = useAuthStore(s => s.hasFeature("scheduling"));

  const setField = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // v7 — o interruptor "só base" aparece quando o servidor anuncia o recurso OU
  // quando o agente já é "só base" (nunca esconder o que está gravado). As
  // travas e notas seguem `form.kbOnly`, nunca o anúncio.
  const kbOnlySwitchVisible = supportsKbOnly || form.savedKbOnly || form.kbOnly;
  // Interruptor da passada de qualificação na aba Ações (e no save)
  const showQualifyPass = supportsQualifyPass && qualifyPassKnown && !form.kbOnly;
  // Aba escondida para o agente "só base" nunca fica aberta: sem isto um erro
  // de save que leva a ela mostraria uma área vazia
  const visibleTab =
    form.kbOnly && KB_ONLY_HIDDEN_TABS.includes(tab) ? "profile" : tab;

  useEffect(() => {
    if (form.kbOnly && KB_ONLY_HIDDEN_TABS.includes(tab)) setTab("profile");
  }, [form.kbOnly, tab]);

  const handleKbOnlyChange = (next: boolean) => {
    setField("kbOnly", next);
    const requestId = ++kbOnlyUsageRequestRef.current;
    setKbOnlyUsage(null);
    setKbOnlyUsageLoading(false);
    // Só ao LIGAR num agente já salvo, e que não estava gravado como "só base"
    // (voltar ao estado gravado não muda nada para quem o usa)
    if (!next || !agentId || form.savedKbOnly) return;
    setKbOnlyUsageLoading(true);
    void fetchAiAgentUsage(agentId).then(usage => {
      if (kbOnlyUsageRequestRef.current !== requestId) return;
      setKbOnlyUsage(usage);
      setKbOnlyUsageLoading(false);
    });
  };

  // "A, B, C, D, E e mais 3" — os nomes vêm do servidor, a junção é da tela
  const formatUsageNames = (refs: AiAgentUsageRef[]): string => {
    const shown = refs.slice(0, USAGE_NAMES_SHOWN).map(ref => ref.name).join(", ");
    const rest = refs.length - USAGE_NAMES_SHOWN;
    return rest > 0 ? `${shown} ${t("usageMore", { count: rest })}` : shown;
  };

  const kbOnlyUsageLines: string[] = kbOnlyUsage
    ? [
        kbOnlyUsage.sharedKbBy.length > 0
          ? t("usageSharedKb", { names: formatUsageNames(kbOnlyUsage.sharedKbBy) })
          : "",
        kbOnlyUsage.transferFrom.length > 0
          ? t("usageTransfer", { names: formatUsageNames(kbOnlyUsage.transferFrom) })
          : "",
        kbOnlyUsage.consultedBy.length > 0
          ? t("usageConsult", { names: formatUsageNames(kbOnlyUsage.consultedBy) })
          : "",
        kbOnlyUsage.channels.length > 0
          ? t("usageChannels", { names: formatUsageNames(kbOnlyUsage.channels) })
          : "",
      ].filter(line => line.length > 0)
    : [];

  // IA da plataforma. Sem o recurso liberado na empresa o seletor não aparece e
  // `platformMode` é SEMPRE falso: a aba Provedor e o payload ficam como sempre
  // foram, mesmo para um agente gravado no modo plataforma (campo de chave
  // vazio = mantém o que está salvo).
  const platformAiEnabled = usePlatformAiEnabled();
  const platformMode = platformAiEnabled && form.usePlatformAi;
  // Na edição, chave vazia significa "manter a atual" — exceto quando o que está
  // salvo é o modo plataforma e o admin acabou de trocar para chave própria:
  // não existe chave para manter, então ela volta a ser obrigatória.
  const apiKeyRequired =
    !platformMode && (!agentId || (platformAiEnabled && form.savedOnPlatformAi));

  const handlePlatformAiChange = (next: boolean) =>
    setForm(prev => {
      if (prev.usePlatformAi === next) return prev;
      // Indo para a plataforma pela 1ª vez o modelo atual é mantido — o seletor
      // avisa se ele não está no catálogo, sem trocar sozinho. A exceção é o
      // agente novo com o padrão intocado: ninguém escolheu aquele modelo, então
      // a lista abre sem seleção em vez de acusar um modelo "indisponível".
      const firstPlatformModel =
        !agentId && prev.model.trim() === EMPTY_FORM.model ? "" : prev.model;
      return {
        ...prev,
        usePlatformAi: next,
        // A chave digitada não atravessa a troca de modo: ao voltar para chave
        // própria o campo reaparece vazio
        apiKey: "",
        // Cada modo lembra o próprio modelo (`??`: "" é um valor lembrado)
        model: prev.otherModeModel ?? (next ? firstPlatformModel : EMPTY_FORM.model),
        otherModeModel: prev.model,
      };
    });

  // Etapas do funil escolhido no card de oportunidade. Uma chamada por funil, e
  // o resultado fica guardado: trocar de card não refaz o request.
  const loadStages = async (pipelineId: number) => {
    if (!pipelineId || loadedStagePipelinesRef.current.has(pipelineId)) return;
    loadedStagePipelinesRef.current.add(pipelineId);
    try {
      const res = await fetchStages({ pipelineId }, { background: true });
      const rows = asRows<StageOption>(res.data).map(stage => ({
        id: stage.id,
        name: stage.name,
        pipelineId: stage.pipelineId ?? pipelineId,
      }));
      setStages(prev => [
        ...prev.filter(stage => stage.pipelineId !== pipelineId),
        ...rows,
      ]);
    } catch {
      // Falhou: libera para tentar de novo ao reabrir o seletor
      loadedStagePipelinesRef.current.delete(pipelineId);
    }
  };

  // Devolve se a rota enxuta de fluxos respondeu — na criação é ela que sonda
  // se o servidor é da geração nova (ver o efeito de carga)
  const loadChatFlows = async (): Promise<boolean> => {
    if (chatFlowsLoadedRef.current) return chatFlowsAvailable;
    chatFlowsLoadedRef.current = true;
    try {
      const flows = await fetchAiAgentChatFlows();
      setChatFlows(flows);
      setChatFlowsAvailable(true);
      return true;
    } catch {
      // 404 = servidor sem a rota enxuta; qualquer outra falha também deixa o
      // tipo "Fluxo" fora, para a tela não oferecer destino que não salvaria
      chatFlowsLoadedRef.current = false;
      setChatFlowsAvailable(false);
      return false;
    }
  };

  const loadBookingEventTypes = async (bookingPageId: number) => {
    if (!bookingPageId || loadedBookingPageRef.current === bookingPageId) return;
    loadedBookingPageRef.current = bookingPageId;
    try {
      setBookingEventTypes(await fetchBookingEventTypes(bookingPageId));
    } catch {
      loadedBookingPageRef.current = null;
      setBookingEventTypes([]);
    }
  };

  // v8 — (re)carrega a lista de servidores MCP. Chamada silenciosa: `null` só
  // fica quando NENHUMA carga desta abertura deu certo. Com `prune` (ao fechar o
  // "Gerenciar servidores") o servidor que sumiu do cadastro sai do formulário
  // (A3/B6); a 1ª carga não poda, para a aba mostrar "(servidor removido)".
  const loadMcpServers = async (prune: boolean) => {
    const requestId = ++mcpServersRequestRef.current;
    setMcpServersLoading(true);
    const list = await listAiMcpServers();
    if (mcpServersRequestRef.current !== requestId) return;
    setMcpServersLoading(false);
    if (!list) return;
    setMcpServers(list);
    if (!prune) return;
    const existing = new Set(list.map(server => server.id));
    setForm(prev => {
      const kept = prev.mcpTools.filter(
        row => !row.serverId || existing.has(row.serverId)
      );
      return kept.length === prev.mcpTools.length ? prev : { ...prev, mcpTools: kept };
    });
  };

  // Carrega o agente completo (edição) e reseta o formulário (criação)
  useEffect(() => {
    if (!open) return;
    setTab("profile");
    let cancelled = false;
    kbOnlyUsageRequestRef.current += 1;
    setKbOnlyUsage(null);
    setKbOnlyUsageLoading(false);
    // v8 — a lista de servidores MCP é refeita a cada abertura (efeito abaixo);
    // a resposta de uma abertura anterior é descartada
    mcpServersRequestRef.current += 1;
    setMcpServers(null);
    setMcpServersLoading(false);

    // v6 — UMA chamada da listagem enxuta por abertura do editor: alimenta os
    // seletores de agente das abas Roteamento e Ferramentas e, na criação, é
    // também a descoberta de recursos. Falha = lista vazia (fail-open): só
    // essas duas opções ficam sem agente para escolher.
    setAiAgentOptions([]);
    setAiAgentOptionsLoaded(false);
    const agentListPromise: Promise<AgentListItem[] | null> = fetchAiAgents()
      .then(list => (Array.isArray(list) ? (list as AgentListItem[]) : null))
      .catch(() => null);
    void agentListPromise.then(list => {
      if (cancelled || !list) return;
      setAiAgentOptions(
        list
          .filter(item => Number(item?.id) > 0)
          .map(item => ({
            id: Number(item.id),
            name: item.name || `#${item.id}`,
            isActive: item.isActive !== false,
            // v7 — marca "(só base)" na aba Conhecimento (ausente em servidor
            // antigo = agente comum)
            kbOnly: item.kbOnly === true,
          }))
      );
      setAiAgentOptionsLoaded(true);
    });

    // Agente novo sempre conhece o interruptor (nasce ligado); na edição só
    // depois de o servidor devolver o campo
    setQualifyPassKnown(!agentId);

    if (!agentId) {
      setForm(EMPTY_FORM);
      // Fechar o editor no meio de uma carga cancela o `finally` que desliga o
      // indicador: sem isto a criação seguinte abriria travada no carregando
      setLoading(false);
      createListAnnouncedRef.current = false;
      setEngineFeatures(
        usableFallbackFeatures(fallbackFeaturesRef.current) ||
          createFeaturesRef.current ||
          []
      );
      // Na criação não existe Show para consultar: a LISTAGEM enxuta devolve o
      // mesmo `engineFeatures` em cada item — e como ela é refeita a cada
      // abertura, o anúncio dela sempre vence o que foi memorizado antes.
      // Empresa sem nenhum agente usa o que a página obteve da rota própria
      // (v7) e, sem ele, cai na sonda da rota de fluxos — 404 ali significa
      // servidor antigo.
      (async () => {
        const list = await agentListPromise;
        if (cancelled) return;
        const announced = list?.find(item => Array.isArray(item?.engineFeatures));
        if (announced) {
          createListAnnouncedRef.current = true;
          const features = normalizeEngineFeatures(announced.engineFeatures);
          createFeaturesRef.current = features;
          setEngineFeatures(features);
          return;
        }
        const fromRoute = usableFallbackFeatures(fallbackFeaturesRef.current);
        if (fromRoute) {
          createFeaturesRef.current = fromRoute;
          setEngineFeatures(fromRoute);
          return;
        }
        if (createFeaturesRef.current) return;
        // A rota enxuta de fluxos é a sonda: ela só existe na geração nova, e
        // 404 ali é servidor antigo (a tela fica como a de sempre). Falha não é
        // memoizada — a próxima abertura sonda de novo.
        const answered = await loadChatFlows();
        if (cancelled || !answered) return;
        // O anúncio da página pode ter chegado durante a sonda: ele vence
        if (usableFallbackFeatures(fallbackFeaturesRef.current)) return;
        createFeaturesRef.current = PROBE_FALLBACK_FEATURES;
        setEngineFeatures(PROBE_FALLBACK_FEATURES);
      })();
      return () => { cancelled = true; };
    }

    setLoading(true);
    (async () => {
      try {
        const agent = await fetchAiAgent(agentId);
        if (cancelled) return;
        const announcedFeatures = normalizeEngineFeatures(agent.engineFeatures);
        setEngineFeatures(announcedFeatures);
        // v8 (D13-1) — servidor que esconde a senha das ferramentas externas
        const maskToolSecrets = announcedFeatures.includes("toolSecretMask");
        // Agente gravado no modo plataforma: a "chave" salva é só o marcador
        // desse modo — nunca vai para o campo de chave
        const onPlatformAi = isPlatformKey(agent.apiKey);
        setForm({
          name: agent.name || "",
          description: agent.description || "",
          isActive: agent.isActive !== false,
          systemPrompt: agent.systemPrompt || "",
          exitKeyword: agent.exitKeyword || "",
          // Nunca pré-preenche a chave: na edição o campo vazio significa
          // "manter a atual" (só é enviada quando o admin digita outra)
          apiKey: "",
          baseUrl: agent.baseUrl || "",
          model: agent.model || "gpt-4o-mini",
          usePlatformAi: onPlatformAi,
          savedOnPlatformAi: onPlatformAi,
          otherModeModel: null,
          kbEnabled: agent.kbEnabled !== false,
          // Padrão OFF: servidor antigo não devolve o campo
          semanticEnabled: agent.semanticEnabled === true,
          routingEnabled: agent.routingEnabled !== false,
          // O tipo do destino é PRESERVADO como veio (inclusive "chatflow"):
          // forçar "queue" aqui fazia o save seguinte gravar o destino errado
          routingTargets: (agent.routingTargets || []).map(target => ({
            key: target.key || generateTargetKey(),
            label: target.label || "",
            description: target.description || "",
            type: normalizeTargetType(target.type),
            queueId: target.queueId ?? null,
            userId: target.userId ?? null,
            chatFlowId: target.chatFlowId ?? null,
            aiAgentId: target.aiAgentId ?? null,
            transferMessage: target.transferMessage || "",
          })),
          autoSummaryEnabled: agent.autoSummaryEnabled !== false,
          fallbackQueueId: agent.fallbackQueueId ?? null,
          transferMessage: agent.transferMessage || "",
          // Servidor antigo não devolve o campo: lista vazia mantém a tela
          // funcionando e o save não apaga nada (só envia o que existe).
          // v8 (D13-1) — com `toolSecretMask` a senha NUNCA vai para o campo
          // (o servidor manda "" e marca `hasSecret`; vazio no save = manter).
          // Sem o anúncio (servidor antigo) ela vem e é reenviada como sempre:
          // ele substitui a lista inteira no save e apagaria a senha.
          externalTools: (agent.externalTools || []).map(tool => ({
            key: tool.key || generateToolKey(),
            label: tool.label || "",
            description: tool.description || "",
            url: tool.url || "",
            secret: maskToolSecrets ? "" : tool.secret || "",
            ...(maskToolSecrets
              ? { hasSecret: tool.hasSecret === true, savedUrl: tool.url || "" }
              : {}),
            timeoutMs: tool.timeoutMs ?? null,
            params: (tool.params || []).map(param => ({
              name: param.name || "",
              description: param.description || "",
              required: !!param.required,
            })),
          })),
          // v8 — servidor antigo não devolve o campo: lista vazia (e sem `mcp`
          // anunciado o campo nem vai no save)
          mcpTools: (Array.isArray(agent.mcpTools) ? agent.mcpTools : [])
            .filter(entry => Number(entry?.serverId) > 0 && Array.isArray(entry?.tools))
            .map(entry => ({
              rowKey: generateMcpRowKey(),
              serverId: Number(entry.serverId),
              tools: entry.tools.filter(
                (name): name is string => typeof name === "string" && name.length > 0
              ),
            })),
          // Mesma tolerância das ferramentas: servidor antigo não devolve os
          // campos da qualificação, e lista vazia mantém a tela funcionando.
          // Todo campo dos tipos novos é copiado — o que não viesse para o
          // formulário seria apagado no próximo save.
          actions: (agent.actions || []).map(action => ({
            key: action.key || generateActionKey(),
            type: normalizeActionType(action.type),
            label: action.label || "",
            description: action.description || "",
            tagId: action.tagId ?? null,
            kanbanId: action.kanbanId ?? null,
            pipelineId: action.pipelineId ?? null,
            stageId: action.stageId ?? null,
            responsibleId: action.responsibleId ?? null,
            opportunityName: action.opportunityName ?? null,
            opportunityValue: action.opportunityValue ?? null,
            content: action.content ?? null,
            notifyQueueId: action.notifyQueueId ?? null,
            notifyUserIds: Array.isArray(action.notifyUserIds)
              ? action.notifyUserIds
              : null,
            actionMessage: action.actionMessage || "",
          })),
          actionMessage: agent.actionMessage || "",
          memoryEnabled: agent.memoryEnabled === true,
          memoryFields: (agent.memoryFields || []).map(field => ({
            name: field.name || "",
            description: field.description || "",
          })),
          closeRules: agent.closeRules ?? null,
          nativeTools: agent.nativeTools ?? null,
          timezone: agent.timezone || "",
          // Servidor antigo não devolve o campo: lista vazia (e sem
          // `agentConsult` anunciado o campo nem vai no save)
          consultAgents: (Array.isArray(agent.consultAgents) ? agent.consultAgents : [])
            .filter(entry => Number(entry?.aiAgentId) > 0)
            .map(entry => ({
              rowKey: generateConsultRowKey(),
              aiAgentId: Number(entry.aiAgentId),
              description: entry.description || "",
            })),
          // v7 — servidor antigo não devolve os campos: agente comum, sem
          // bases compartilhadas (e sem `kbShared` o campo nem vai no save)
          kbOnly: agent.kbOnly === true,
          savedKbOnly: agent.kbOnly === true,
          sharedKbAgents: (Array.isArray(agent.sharedKbAgents) ? agent.sharedKbAgents : [])
            .map(entry => Number(entry?.aiAgentId))
            .filter(id => Number.isInteger(id) && id > 0),
          // Servidor antigo não devolve os campos: vazio (responde na hora)
          replyDelayMin: agent.replyDelayMin != null ? String(agent.replyDelayMin) : "",
          replyDelayMax: agent.replyDelayMax != null ? String(agent.replyDelayMax) : "",
          // Servidor antigo não devolve o campo: regra desligada (e sem
          // `inactivity` anunciado o campo nem vai no save)
          inactivity: toInactivityForm(agent.inactivityConfig),
          // Passada de qualificação: ausente = ligada (o interruptor só
          // aparece quando o servidor devolveu o campo, abaixo)
          qualifyPassEnabled: agent.qualifyPassEnabled !== false,
          maxHistoryMessages:
            agent.maxHistoryMessages != null ? String(agent.maxHistoryMessages) : "",
          temperature: agent.temperature != null ? String(agent.temperature) : "",
        });
        setQualifyPassKnown(typeof agent.qualifyPassEnabled === "boolean");
      } catch (err: unknown) {
        if (cancelled) return;
        const key = aiAgentErrorKey(err);
        toast.error(key ? t(key) : t("loadError"));
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentId]);

  // v8 — lista de servidores MCP: uma carga por abertura, só com `mcp`
  // anunciado (servidor antigo nem recebe o pedido). Fica DEPOIS do efeito de
  // carga de propósito: ele zera a lista ao abrir e este dispara a nova.
  useEffect(() => {
    if (!open || !supportsMcp) return;
    void loadMcpServers(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentId, supportsMcp]);

  // v7 — o anúncio da página chegou com o editor de criação já aberto (clique
  // antes de a rota de recursos responder): vale na hora, salvo se a listagem
  // desta abertura já anunciou (ela sempre vence).
  useEffect(() => {
    if (!open || agentId || createListAnnouncedRef.current) return;
    const fromRoute = usableFallbackFeatures(fallbackFeatures);
    if (!fromRoute) return;
    createFeaturesRef.current = fromRoute;
    setEngineFeatures(fromRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackFeatures]);

  // Filas, atendentes, etiquetas e raias do funil para os selects (services
  // existentes; carrega uma única vez, best-effort — cada um em try/catch
  // próprio para que uma lista indisponível não leve as outras junto)
  useEffect(() => {
    if (!open || listsLoadedRef.current) return;
    listsLoadedRef.current = true;
    (async () => {
      try {
        const { data } = await fetchQueues();
        setQueues((data || []).filter(queue => queue.isActive !== false));
      } catch {
        /* selects de fila ficam vazios */
      }
      try {
        const { data } = await fetchAllUsers();
        setUsers((data?.users || []).filter(user => !user.inactive));
      } catch {
        /* selects de atendente ficam vazios */
      }
      try {
        const { data } = await fetchTags();
        setTags(
          (data || [])
            .filter(tag => tag.isActive !== false)
            .map(tag => ({ id: tag.id, name: tag.name }))
        );
      } catch {
        /* ação de etiqueta fica indisponível; o resto da aba segue */
      }
      try {
        // Em background: o funil é capacidade de plano e a empresa sem ele
        // recebia o toast de "recurso fora do plano" só por abrir o editor
        const { data } = await fetchKanbans({ background: true });
        setKanbans(
          (data || [])
            .filter(lane => lane.isActive !== false)
            .map(lane => ({ id: lane.id, name: lane.name }))
        );
      } catch {
        /* ação de funil fica indisponível; o resto da aba segue */
      }
    })();
  }, [open]);

  // Listas sob demanda: cada uma só é buscada quando a aba que a usa abre pela
  // primeira vez, e sempre em background. Cada chamada tem try/catch próprio —
  // lista vazia desabilita só o que depende dela.
  useEffect(() => {
    if (!open) return;

    if (tab === "actions" && hasFunnelFeature && !funnelLoadedRef.current) {
      funnelLoadedRef.current = true;
      (async () => {
        try {
          const res = await fetchPipelines(undefined, { background: true });
          setPipelines(
            asRows<PipelineOption>(res.data).map(pipeline => ({
              id: pipeline.id,
              name: pipeline.name,
            }))
          );
        } catch {
          /* sem funis: o card de oportunidade fica sem destino para escolher */
        }
        // Etapas dos funis que os cards já salvos apontam — sem isso o card
        // gravado reabriria com a etapa em branco
        const savedPipelines = Array.from(
          new Set(
            form.actions
              .map(action => action.pipelineId)
              .filter((id): id is number => !!id)
          )
        );
        for (const pipelineId of savedPipelines) await loadStages(pipelineId);
      })();
    }

    if (tab === "routing") {
      if (!reasonsLoadedRef.current) {
        reasonsLoadedRef.current = true;
        (async () => {
          try {
            const res = await fetchReasons();
            const data = res.data as { reasons?: Reason[] } | Reason[];
            setReasons(
              Array.isArray(data) ? data : (data as { reasons?: Reason[] }).reasons ?? []
            );
          } catch {
            /* seção de motivos fica sem opções */
          }
        })();
      }
      if (supportsRoutingV5) void loadChatFlows();
    }

    if (
      tab === "tools" &&
      supportsBooking &&
      hasBookingFeature &&
      !bookingLoadedRef.current
    ) {
      bookingLoadedRef.current = true;
      (async () => {
        try {
          setBookingPages(await fetchBookingPages());
        } catch {
          /* seção Agenda fica sem página para escolher */
        }
        const savedPage = form.nativeTools?.booking?.bookingPageId;
        if (savedPage) await loadBookingEventTypes(savedPage);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, supportsRoutingV5, supportsBooking, hasFunnelFeature, hasBookingFeature]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t("requiredFields"));
      return;
    }
    // O marcador do modo plataforma nunca vale como chave digitada: só o seletor
    // escolhe esse modo (no campo, é tratado como vazio)
    const typedApiKey = isPlatformKey(form.apiKey.trim()) ? "" : form.apiKey.trim();
    if (apiKeyRequired && !typedApiKey) {
      toast.error(t("apiKeyRequired"));
      return;
    }
    // Mesmo critério do servidor: o modelo só é conferido quando o agente PASSA
    // a usar a IA da plataforma (criação ou troca de modo). `null` = catálogo
    // desconhecido aqui — o servidor decide e o erro dele é traduzido no catch.
    if (
      platformMode &&
      (!agentId || !form.savedOnPlatformAi) &&
      isPlatformAiModelAvailable(form.model, "chat") === false
    ) {
      toast.error(t("errPlatformModelNotAllowed"));
      setTab("provider");
      return;
    }

    const isTargetComplete = (target: AiAgentRoutingTarget) =>
      target.label.trim().length > 0 &&
      target.description.trim().length > 0 &&
      (target.type === "queue"
        ? !!target.queueId
        : target.type === "user"
        ? !!target.userId
        : target.type === "ai_agent"
        ? !!target.aiAgentId
        : !!target.chatFlowId);

    // v7 — agente "só base": as abas Roteamento, Ações e Ferramentas estão
    // escondidas e os campos delas NÃO vão no save (o servidor preserva o que
    // está gravado). Validar o que ele não enxerga travaria o save sem saída.
    const skipHiddenTabs = form.kbOnly;

    if (
      !skipHiddenTabs &&
      form.routingEnabled &&
      form.routingTargets.some(target => !isTargetComplete(target))
    ) {
      toast.error(t("targetsIncomplete"));
      return;
    }

    const isToolComplete = (tool: AiAgentExternalTool) =>
      tool.label.trim().length > 0 &&
      tool.description.trim().length > 0 &&
      /^https?:\/\//i.test(tool.url.trim());

    if (!skipHiddenTabs && form.externalTools.some(tool => !isToolComplete(tool))) {
      toast.error(t("toolsIncomplete"));
      return;
    }

    // Ação sem destino ou sem "quando usar" o servidor recusa a lista INTEIRA:
    // barrar aqui mostra qual card está pela metade em vez de um erro genérico.
    // Cada tipo tem o próprio mínimo — os que não têm destino escolhido exigem
    // o "Nome da ação", que é o rótulo que a IA enxerga.
    const isActionComplete = (action: AiAgentAction) => {
      if (action.description.trim().length === 0) return false;
      switch (action.type) {
        case "kanban":
          return !!action.kanbanId;
        case "opportunity":
          return !!action.pipelineId && !!action.stageId && !!action.responsibleId;
        case "note":
          return action.label.trim().length > 0;
        case "notify":
          return (
            action.label.trim().length > 0 &&
            (action.content || "").trim().length > 0 &&
            (!!action.notifyQueueId || (action.notifyUserIds || []).length > 0)
          );
        case "block":
          return action.label.trim().length > 0;
        case "tag":
        default:
          return !!action.tagId;
      }
    };

    if (!skipHiddenTabs && form.actions.some(action => !isActionComplete(action))) {
      toast.error(t("actionsIncomplete"));
      return;
    }

    // Carência ligada e SEM alvo o servidor descarta em silêncio (o 400 só sai
    // quando não há motivo nenhum junto): sem este bloco o admin via "salvo" e
    // a carência simplesmente não existia. Mesmo critério de `isTargetComplete`.
    const grace = form.closeRules?.grace;
    if (
      !skipHiddenTabs &&
      grace?.enabled &&
      ((grace.destinationType === "queue" && !grace.queueId) ||
        (grace.destinationType === "user" && !grace.userId) ||
        (grace.destinationType === "chatflow" && !grace.chatFlowId) ||
        !(Number(grace.seconds) > 0))
    ) {
      toast.error(t("errInvalidCloseRules"));
      setTab("routing");
      return;
    }

    // "Sem resposta do cliente": só com o bloco na tela (servidor que anuncia o
    // recurso e agente que não é "só base"). Com a regra LIGADA o servidor
    // recusaria o save inteiro com o mesmo critério; desligada, o rascunho vai
    // como está (o servidor guarda sem conferir)
    const sendInactivity = supportsInactivity && !skipHiddenTabs;
    const inactivityForm = form.inactivity;
    const inactivityWarnMinutes = parseInactivityMinutes(inactivityForm.warnMinutes);
    const inactivityActAfterMinutes = parseInactivityMinutes(inactivityForm.actAfterMinutes);
    if (sendInactivity && inactivityForm.enabled) {
      if (
        inactivityActAfterMinutes === null ||
        (inactivityForm.warnEnabled && inactivityWarnMinutes === null)
      ) {
        toast.error(
          t("inactivityMinutesInvalid", {
            min: AGENT_INACTIVITY_LIMITS.minMinutes,
            max: AGENT_INACTIVITY_LIMITS.maxMinutes,
          })
        );
        setTab("routing");
        return;
      }
      if (inactivityForm.warnEnabled && !inactivityForm.warnMessage.trim()) {
        toast.error(t("inactivityWarnMessageRequired"));
        setTab("routing");
        return;
      }
      if (inactivityForm.action === "transfer" && !inactivityForm.queueId) {
        toast.error(t("inactivityQueueRequired"));
        setTab("routing");
        return;
      }
    }

    // Mesma armadilha do lado da agenda: página sem serviço (ou serviço sem
    // página) é descartado pelo sanitizador do servidor e a seção voltava
    // desligada depois de um save "bem-sucedido".
    const booking = form.nativeTools?.booking;
    if (
      !skipHiddenTabs &&
      booking?.enabled &&
      (!booking.bookingPageId || (booking.eventTypes || []).length === 0)
    ) {
      toast.error(t("errInvalidNativeTools"));
      setTab("tools");
      return;
    }

    // A ação que para a IA manda o atendimento para a fila de emergência: sem
    // ela escolhida o servidor recusa o save inteiro com 400
    if (
      !skipHiddenTabs &&
      !form.fallbackQueueId &&
      form.actions.some(action => action.type === "block")
    ) {
      toast.error(t("errBlockNeedsFallback"));
      setTab("routing");
      return;
    }

    // Linha sem nome é rascunho (sai do payload); nome preenchido tem de estar
    // no formato aceito pelo servidor, senão o campo sumiria sem explicação
    if (
      !skipHiddenTabs &&
      form.memoryEnabled &&
      form.memoryFields.some(
        field =>
          field.name.trim().length > 0 && !isValidMemoryFieldName(field.name)
      )
    ) {
      toast.error(t("memoryFieldsIncomplete"));
      return;
    }

    // Atraso na resposta: segundos inteiros de 0 ao teto, e o mínimo não passa
    // do máximo (o servidor trocaria os dois de lugar sem avisar). `undefined`
    // = valor inválido; `null` = campo vazio
    const parseReplyDelayField = (raw: string): number | null | undefined => {
      const text = raw.trim();
      if (!text) return null;
      if (!/^\d+$/.test(text)) return undefined;
      const value = Number(text);
      return value <= MAX_AI_AGENT_REPLY_DELAY_SECONDS ? value : undefined;
    };
    const sendReplyDelay = supportsReplyDelay && !skipHiddenTabs;
    const replyDelayMin = parseReplyDelayField(form.replyDelayMin);
    const replyDelayMax = parseReplyDelayField(form.replyDelayMax);
    if (sendReplyDelay) {
      if (replyDelayMin === undefined || replyDelayMax === undefined) {
        toast.error(t("replyDelayInvalid", { max: MAX_AI_AGENT_REPLY_DELAY_SECONDS }));
        setTab("profile");
        return;
      }
      if (replyDelayMin !== null && replyDelayMax !== null && replyDelayMin > replyDelayMax) {
        toast.error(t("replyDelayOrder"));
        setTab("profile");
        return;
      }
    }

    // Com roteamento desligado os destinos ficam ocultos na UI: envia só os
    // completos para não travar o save num rascunho invisível
    const cleanedTargets = form.routingTargets
      .filter(isTargetComplete)
      .map(target => ({
        key: target.key || generateTargetKey(),
        label: target.label.trim(),
        description: target.description.trim(),
        type: target.type,
        // Só o id do tipo escolhido vai no payload
        queueId: target.type === "queue" ? target.queueId ?? null : null,
        userId: target.type === "user" ? target.userId ?? null : null,
        chatFlowId: target.type === "chatflow" ? target.chatFlowId ?? null : null,
        aiAgentId: target.type === "ai_agent" ? target.aiAgentId ?? null : null,
        // Para outro agente de IA o campo fica oculto na aba: o texto que ficou
        // de outro tipo não pode seguir gravado sem o admin enxergar
        transferMessage:
          target.type === "ai_agent"
            ? null
            : (target.transferMessage || "").trim() || null,
      }));

    const cleanedTools = form.externalTools.filter(isToolComplete).map(tool => {
      const typedSecret = (tool.secret || "").trim();
      return {
        key: tool.key || generateToolKey(),
        label: tool.label.trim(),
        description: tool.description.trim(),
        url: tool.url.trim(),
        // Sem `toolSecretMask` é a senha de sempre (veio do servidor e volta);
        // com ele só a digitada vai, e vazio = o servidor mantém a salva
        secret: typedSecret || null,
        // v8 (D13-1) — "Remover senha" só vale sem senha nova digitada, e só
        // com o servidor que entende o pedido
        ...(supportsToolSecretMask && tool.secretClear && !typedSecret
          ? { secretClear: true }
          : {}),
        // Parâmetro sem nome é rascunho: sai do payload (o servidor descartaria
        // do mesmo jeito e o campo some da tela no próximo carregamento)
        params: (tool.params || [])
          .filter(param => param.name.trim().length > 0)
          .map(param => ({
            name: param.name.trim(),
            description: (param.description || "").trim() || null,
            required: !!param.required,
          })),
      };
    });

    // O rótulo é o que a IA enxerga: em etiqueta e funil vem do nome do destino,
    // na oportunidade vem do nome da ETAPA escolhida (sem a lista carregada vale
    // o que já estava salvo) e nos demais é o "Nome da ação" digitado
    const buildActionLabel = (action: AiAgentAction): string => {
      const typed = action.label.trim();
      if (action.type === "tag" || action.type === "kanban") {
        const isKanban = action.type === "kanban";
        const list = isKanban ? kanbans : tags;
        const id = isKanban ? action.kanbanId : action.tagId;
        return typed || list.find(item => item.id === id)?.name || "";
      }
      if (action.type === "opportunity") {
        return stages.find(stage => stage.id === action.stageId)?.name || typed;
      }
      return typed;
    };

    const cleanedActions = form.actions.filter(isActionComplete).map(action => ({
      key: action.key || generateActionKey(),
      type: action.type,
      label: buildActionLabel(action),
      description: action.description.trim(),
      // Campo que não pertence ao tipo do card vai NULO, sem exceção: um id
      // esquecido deixaria o destino antigo gravado e a ação faria duas coisas
      ...actionFieldsForType(action),
      actionMessage: (action.actionMessage || "").trim() || null,
    }));

    // Campo sem nome é rascunho: sai do payload (o servidor descartaria do
    // mesmo jeito e a linha some no próximo carregamento)
    const cleanedMemoryFields = form.memoryFields
      .filter(field => isValidMemoryFieldName(field.name))
      .map(field => ({
        // O nome que o servidor gravaria — ajustado aqui também para o caso de
        // o save acontecer sem o campo ter perdido o foco
        name: normalizeMemoryFieldName(field.name),
        description: (field.description || "").trim() || null,
      }));

    const payload: AiAgentPayload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      isActive: form.isActive,
      systemPrompt: form.systemPrompt.trim() || null,
      exitKeyword: form.exitKeyword.trim() || null,
      // No modo plataforma não existe endereço próprio. O valor digitado segue
      // no formulário (só não é enviado) para voltar se o admin desistir da troca
      baseUrl: platformMode ? "" : (form.baseUrl.trim() || null),
      model: form.model.trim() || "gpt-4o-mini",
      kbEnabled: form.kbEnabled,
      semanticEnabled: form.semanticEnabled,
      routingEnabled: form.routingEnabled,
      routingTargets: cleanedTargets,
      autoSummaryEnabled: form.autoSummaryEnabled,
      fallbackQueueId: form.fallbackQueueId,
      transferMessage: form.transferMessage.trim() || null,
      externalTools: cleanedTools,
      actions: cleanedActions,
      actionMessage: form.actionMessage.trim() || null,
      memoryEnabled: form.memoryEnabled,
      memoryFields: cleanedMemoryFields,
      closeRules: form.closeRules,
      nativeTools: form.nativeTools,
      // Vazio = o servidor usa o fuso padrão dele (ou o da página de agenda)
      timezone: form.timezone.trim() || null,
      // Marcador do editor novo. É ele que faz o servidor PRESERVAR a configuração
      // que uma tela antiga não sabe editar, em vez de deixá-la ser apagada.
      editorVersion: AI_AGENT_EDITOR_VERSION,
    };
    // Campo vazio = padrão do servidor (nunca enviar "" — o clamp trataria
    // como valor e prenderia o histórico no mínimo)
    const parsedHistory = Number(form.maxHistoryMessages);
    if (form.maxHistoryMessages.trim() && Number.isFinite(parsedHistory)) {
      payload.maxHistoryMessages = Math.min(Math.max(Math.round(parsedHistory), 1), 100);
    }
    const parsedTemperature = Number(form.temperature);
    if (form.temperature.trim() && Number.isFinite(parsedTemperature)) {
      payload.temperature = Math.min(Math.max(parsedTemperature, 0), 2);
    }
    // Os dois caminhos são exclusivos: no modo plataforma vai SEMPRE o marcador
    // (nunca chave vazia, nunca o que ficou digitado); com chave própria só vai
    // o que o admin digitou — vazio na edição mantém a chave salva
    if (platformMode) payload.apiKey = AI_PLATFORM_KEY_SENTINEL;
    else if (typedApiKey) payload.apiKey = typedApiKey;
    // v6 — só vai quando o servidor anuncia a consulta: servidor sem ela
    // ignoraria o campo em silêncio. Linha sem agente escolhido é rascunho e
    // fica de fora; lista vazia limpa o que estava salvo. O próprio agente e
    // id repetido também ficam de fora (o servidor recusaria o save inteiro).
    if (supportsAgentConsult && !skipHiddenTabs) {
      const seenConsultIds = new Set<number>();
      payload.consultAgents = form.consultAgents
        .filter(row => {
          const id = Number(row.aiAgentId);
          if (!Number.isInteger(id) || id <= 0) return false;
          if (id === agentId || seenConsultIds.has(id)) return false;
          seenConsultIds.add(id);
          return true;
        })
        .map(row => ({
          aiAgentId: Number(row.aiAgentId),
          description: row.description.trim() || null,
        }));
    }
    // v8 — só com `mcp` anunciado E a lista de servidores carregada (molde da
    // consulta): sem a lista a seção fica só leitura e o campo NÃO vai (o
    // servidor mantém o vínculo salvo). Rascunho (sem servidor), servidor sem
    // ferramenta marcada e servidor que saiu do cadastro ficam de fora (o
    // servidor ignoraria os dois últimos do mesmo jeito); os tetos repetem os do
    // servidor, que acima deles recusaria o save inteiro. Ferramenta pausada
    // segue marcada: volta a valer quando for aprovada de novo. Nada marcado =
    // sem MCP. O "só base" não envia (a aba fica escondida).
    if (supportsMcp && mcpServers !== null && !skipHiddenTabs) {
      const knownServerIds = new Set(mcpServers.map(server => server.id));
      const seenServerIds = new Set<number>();
      const mcpEntries: AiAgentMcpToolsEntry[] = [];
      let mcpToolTotal = 0;
      for (const row of form.mcpTools) {
        const serverId = Number(row.serverId);
        if (!Number.isInteger(serverId) || serverId <= 0) continue;
        if (!knownServerIds.has(serverId) || seenServerIds.has(serverId)) continue;
        if (mcpEntries.length >= MAX_MCP_SERVERS_PER_AGENT) break;
        const toolNames = Array.from(
          new Set(row.tools.filter(name => typeof name === "string" && name.length > 0))
        ).slice(0, Math.max(0, MAX_MCP_TOOLS_PER_AGENT - mcpToolTotal));
        if (toolNames.length === 0) continue;
        seenServerIds.add(serverId);
        mcpToolTotal += toolNames.length;
        mcpEntries.push({ serverId, tools: toolNames });
      }
      payload.mcpTools = mcpEntries.length > 0 ? mcpEntries : null;
    }
    // v7 — agente "só base": os campos das abas escondidas saem do payload
    // (ausente = o servidor mantém o que está gravado) e ele vai sempre
    // inativo. Sem o "só base" nada muda aqui.
    if (skipHiddenTabs) {
      delete payload.routingEnabled;
      delete payload.routingTargets;
      delete payload.fallbackQueueId;
      delete payload.transferMessage;
      delete payload.autoSummaryEnabled;
      delete payload.closeRules;
      delete payload.actions;
      delete payload.actionMessage;
      delete payload.memoryEnabled;
      delete payload.memoryFields;
      delete payload.externalTools;
      delete payload.nativeTools;
      payload.isActive = false;
    }
    // v7 — só vai quando o servidor anuncia as bases compartilhadas (mesmo
    // molde da consulta: sem rascunho, sem o próprio agente, sem repetição e
    // no teto). Com o "só base" a seção fica escondida e o salvo é mantido.
    if (supportsKbShared && !skipHiddenTabs) {
      const seenSharedKbIds = new Set<number>();
      payload.sharedKbAgents = form.sharedKbAgents
        .filter(rawId => {
          const id = Number(rawId);
          if (!Number.isInteger(id) || id <= 0) return false;
          if (id === agentId || seenSharedKbIds.has(id)) return false;
          seenSharedKbIds.add(id);
          return true;
        })
        .slice(0, MAX_AI_AGENT_SHARED_KB)
        .map(id => ({ aiAgentId: Number(id) }));
    }
    // v7 — só com o interruptor na tela (servidor que anuncia o recurso, ou
    // agente que já é "só base")
    if (kbOnlySwitchVisible) payload.kbOnly = form.kbOnly;
    // Atraso na resposta — só com o campo na tela; vazio nos dois = na hora
    if (sendReplyDelay) {
      payload.replyDelayMin = replyDelayMin ?? null;
      payload.replyDelayMax = replyDelayMax ?? null;
    }
    // Passada de qualificação — só com o interruptor na tela (servidor que
    // anuncia, agente cujo valor veio do servidor e que não é "só base")
    if (showQualifyPass) payload.qualifyPassEnabled = form.qualifyPassEnabled;
    // "Sem resposta do cliente" — só com o bloco na tela (o "só base" não
    // envia: ausente = o servidor mantém o salvo). Regra desligada e nada
    // preenchido vai `null` (agente que nunca configurou segue sem a coluna);
    // desligada com rascunho guarda o rascunho, para religar sem redigitar.
    // A fila só vai com "Transferir".
    if (sendInactivity) {
      const warnMessage = inactivityForm.warnMessage.trim();
      const message = inactivityForm.message.trim();
      const warnMinutes =
        inactivityWarnMinutes ?? AGENT_INACTIVITY_LIMITS.defaultWarnMinutes;
      const actAfterMinutes =
        inactivityActAfterMinutes ?? AGENT_INACTIVITY_LIMITS.defaultActAfterMinutes;
      const untouched =
        !inactivityForm.enabled &&
        !inactivityForm.warnEnabled &&
        !warnMessage &&
        !message &&
        !inactivityForm.queueId &&
        inactivityForm.action === "close" &&
        warnMinutes === AGENT_INACTIVITY_LIMITS.defaultWarnMinutes &&
        actAfterMinutes === AGENT_INACTIVITY_LIMITS.defaultActAfterMinutes;
      payload.inactivityConfig = untouched
        ? null
        : {
            enabled: inactivityForm.enabled,
            warning: {
              enabled: inactivityForm.warnEnabled,
              minutes: warnMinutes,
              message: warnMessage,
            },
            actAfterMinutes,
            action: inactivityForm.action,
            queueId:
              inactivityForm.action === "transfer" ? inactivityForm.queueId : null,
            message,
          };
    }

    setSaving(true);
    try {
      const saved = agentId
        ? await updateAiAgent(agentId, payload)
        : await createAiAgent(payload);
      toast.success(t("saved"));
      // Rede de segurança do anúncio de recursos: servidor antigo aceita o save
      // e IGNORA as novidades, sem erro nenhum — só a resposta denuncia. O save
      // em si valeu, por isso é aviso depois do sucesso e não bloqueia.
      // Com o "só base" ações, memória e destinos nem foram enviados: não há o
      // que conferir na resposta
      const sentNovelty =
        !skipHiddenTabs &&
        (cleanedActions.length > 0 ||
          cleanedMemoryFields.length > 0 ||
          form.memoryEnabled);
      const backendKnowsNovelty =
        saved?.actions !== undefined ||
        saved?.memoryFields !== undefined ||
        saved?.memoryEnabled !== undefined;
      if (sentNovelty && !backendKnowsNovelty) {
        toast.warning(t("actionsUnsupportedBackend"));
      }
      // O servidor conhece os campos, mas pode ter descartado o que não executa:
      // compara QUANTIDADE e TIPO do que foi enviado com o que voltou
      const savedActions = saved?.actions;
      const sentV5Actions: typeof cleanedActions = skipHiddenTabs
        ? []
        : cleanedActions.filter(action =>
            AI_AGENT_ACTION_TYPES_V5.includes(action.type)
          );
      if (
        sentV5Actions.length > 0 &&
        Array.isArray(savedActions) &&
        (savedActions.length !== cleanedActions.length ||
          sentV5Actions.some(
            sent =>
              !savedActions.some(
                got => got?.key === sent.key && got?.type === sent.type
              )
          ))
      ) {
        toast.warning(t("serverIgnoredActions"));
      }
      // Servidor que não conhece um tipo de destino o descarta em silêncio e
      // responde sucesso. Conferido POR TIPO (key + tipo): com dois tipos
      // novos, comparar só o tamanho da lista fazia o aviso de um disparar
      // pela falta do outro.
      const savedTargets = saved?.routingTargets;
      const targetTypeIgnored = (type: AiAgentRoutingTarget["type"]) => {
        if (skipHiddenTabs) return false;
        const sentOfType = cleanedTargets.filter(target => target.type === type);
        return (
          sentOfType.length > 0 &&
          Array.isArray(savedTargets) &&
          sentOfType.some(
            sent =>
              !savedTargets.some(got => got?.key === sent.key && got?.type === type)
          )
        );
      };
      if (targetTypeIgnored("chatflow")) {
        toast.warning(t("serverIgnoredTargets"));
      }
      if (targetTypeIgnored("ai_agent")) {
        toast.warning(t("serverIgnoredAiAgentTargets"));
      }
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
      // Leva direto para a aba onde a recusa se resolve
      if (
        key === "errPlatformModelNotAllowed" ||
        key === "errPlatformDisabled" ||
        // O campo de fuso mora na aba Perfil — sem isto o admin recebia o erro
        // sem enxergar o campo que o causou.
        key === "errInvalidTimezone"
      ) {
        setTab(key === "errInvalidTimezone" ? "profile" : "provider");
      } else if (
        key === "errBlockNeedsFallback" ||
        key === "errInvalidCloseRules" ||
        // Destinos recusados — na v6 inclui "Outro agente de IA" excluído entre
        // abrir e salvar a tela
        key === "errInvalidTargets" ||
        // "Sem resposta do cliente" recusado (tempo, aviso sem mensagem, fila
        // ausente ou que não existe mais)
        key === "errInvalidInactivity"
      ) {
        setTab("routing");
      } else if (key === "errInvalidActions" || key === "errInvalidMemoryFields") {
        setTab("actions");
      } else if (
        key === "errInvalidNativeTools" ||
        key === "errInvalidTools" ||
        key === "errInvalidConsult" ||
        // v8 — vínculo com servidores MCP recusado (formato ou teto)
        key === "errInvalidMcp"
      ) {
        setTab("tools");
      } else if (key === "errInvalidSharedKb" && agentId) {
        // v7 — base compartilhada recusada. Na criação a aba Conhecimento está
        // bloqueada: o erro fica só no aviso
        setTab("knowledge");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {agentId ? t("dialogEditTitle") : t("dialogNewTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs value={visibleTab} onValueChange={setTab}>
              <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="profile" className="gap-1.5">
                  <Bot className="h-4 w-4" />
                  {t("tabProfile")}
                </TabsTrigger>
                <TabsTrigger value="provider" className="gap-1.5">
                  <KeyRound className="h-4 w-4" />
                  {t("tabProvider")}
                </TabsTrigger>
                <TabsTrigger value="knowledge" className="gap-1.5" disabled={!agentId}>
                  <BookOpen className="h-4 w-4" />
                  {t("tabKnowledge")}
                </TabsTrigger>
                {/* v7 — o agente "só base" não atende: sem roteamento, ações
                    nem ferramentas */}
                {!form.kbOnly && (
                  <>
                    <TabsTrigger value="routing" className="gap-1.5">
                      <Split className="h-4 w-4" />
                      {t("tabRouting")}
                    </TabsTrigger>
                    <TabsTrigger value="actions" className="gap-1.5">
                      <Zap className="h-4 w-4" />
                      {t("tabActions")}
                    </TabsTrigger>
                    <TabsTrigger value="tools" className="gap-1.5">
                      <Webhook className="h-4 w-4" />
                      {t("tabTools")}
                    </TabsTrigger>
                  </>
                )}
              </TabsList>

              {!agentId && (
                <p className="mb-4 text-xs text-muted-foreground">{t("knowledgeSaveFirst")}</p>
              )}

              {/* ── Perfil ─────────────────────────────────────────────── */}
              <TabsContent value="profile" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>
                      {t("fieldName")} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={form.name}
                      onChange={e => setField("name", e.target.value)}
                      maxLength={255}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-agent-active">{t("fieldActive")}</Label>
                    <div className="flex h-9 items-center">
                      {/* Agente "só base" fica sempre inativo: o interruptor
                          aparece desligado e travado (o valor anterior volta
                          se o "só base" for desmarcado) */}
                      <Switch
                        id="ai-agent-active"
                        checked={form.kbOnly ? false : form.isActive}
                        onCheckedChange={v => setField("isActive", v)}
                        disabled={form.kbOnly}
                      />
                    </div>
                    {form.kbOnly && (
                      <p className="text-xs text-muted-foreground">
                        {t("kbOnlyActiveLocked")}
                      </p>
                    )}
                  </div>
                </div>

                {/* v7 — agente que só guarda conhecimento para outros agentes */}
                {kbOnlySwitchVisible && (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="ai-agent-kb-only" className="flex items-center gap-1.5">
                        {t("kbOnlyLabel")}
                        {kbOnlyUsageLoading && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                      </Label>
                      <Switch
                        id="ai-agent-kb-only"
                        checked={form.kbOnly}
                        onCheckedChange={handleKbOnlyChange}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{t("kbOnlyHint")}</p>
                    {form.kbOnly && kbOnlyUsageLines.length > 0 && (
                      <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                        <div className="min-w-0 space-y-1 text-amber-700 dark:text-amber-400">
                          <p className="font-medium">{t("kbOnlyUsageTitle")}</p>
                          <ul className="space-y-0.5">
                            {kbOnlyUsageLines.map(line => (
                              <li key={line} className="break-words">{line}</li>
                            ))}
                          </ul>
                          <p>{t("kbOnlyUsageFlows")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>{t("fieldDescription")}</Label>
                  <Textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setField("description", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{t("fieldSystemPrompt")}</Label>
                  <Textarea
                    rows={8}
                    value={form.systemPrompt}
                    onChange={e => setField("systemPrompt", e.target.value)}
                    placeholder={t("systemPromptPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">{t("systemPromptHint")}</p>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("fieldExitKeyword")}</Label>
                  <Input
                    value={form.exitKeyword}
                    onChange={e => setField("exitKeyword", e.target.value)}
                    placeholder={t("exitKeywordPlaceholder")}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">{t("exitKeywordHint")}</p>
                </div>

                {/* Atraso na resposta: só com o servidor que executa e nunca no
                    agente "só base", que não atende */}
                {supportsReplyDelay && !form.kbOnly && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label>{t("replyDelayLabel")}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                            aria-label={t("replyDelayHelpTitle")}
                          >
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                        {/* Altura presa à área visível (rolagem interna): em
                            tela baixa o fim dos alertas ficava cortado */}
                        <PopoverContent
                          side="top"
                          align="start"
                          collisionPadding={16}
                          className="w-[380px] max-w-[calc(100vw-2rem)] overflow-y-auto text-xs"
                          style={{
                            maxHeight: "var(--radix-popover-content-available-height, 70vh)",
                          }}
                        >
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{t("replyDelayHelpTitle")}</p>
                            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                              <li>{t("replyDelayHelpHow")}</li>
                              <li>{t("replyDelayHelpFixed")}</li>
                              <li>{t("replyDelayHelpTyping")}</li>
                            </ul>
                            <div>
                              <p className="mb-1 flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {t("replyDelayHelpAlertsTitle")}
                              </p>
                              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                                <li>{t("replyDelayHelpAlertWaitOn")}</li>
                                <li>{t("replyDelayHelpAlertWaitOff")}</li>
                                <li>{t("replyDelayHelpAlertTakeover")}</li>
                                <li>{t("replyDelayHelpAlertRead")}</li>
                                <li>
                                  {t("replyDelayHelpAlertLong", {
                                    max: MAX_AI_AGENT_REPLY_DELAY_SECONDS,
                                  })}
                                </li>
                              </ul>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {/* Texto numérico, não type="number": com entrada inválida
                        ("1,5", "5e") o campo numérico entrega "" em silêncio e o
                        save gravaria "responde na hora" sem erro */}
                    <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                      <div className="space-y-1">
                        <Label htmlFor="ai-agent-reply-delay-min" className="text-xs font-normal text-muted-foreground">
                          {t("replyDelayMinLabel")}
                        </Label>
                        <Input
                          id="ai-agent-reply-delay-min"
                          type="text"
                          inputMode="numeric"
                          maxLength={3}
                          value={form.replyDelayMin}
                          onChange={e => setField("replyDelayMin", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ai-agent-reply-delay-max" className="text-xs font-normal text-muted-foreground">
                          {t("replyDelayMaxLabel")}
                        </Label>
                        <Input
                          id="ai-agent-reply-delay-max"
                          type="text"
                          inputMode="numeric"
                          maxLength={3}
                          value={form.replyDelayMax}
                          onChange={e => setField("replyDelayMax", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("replyDelayHint", { max: MAX_AI_AGENT_REPLY_DELAY_SECONDS })}
                    </p>
                  </div>
                )}

                {/* Só aparece quando o servidor executa agenda ou mensagem
                    agendada: é o fuso em que a IA fala de horário com o cliente */}
                {(supportsBooking || supportsScheduleMessage) && (
                  <div className="space-y-1.5">
                    <Label>{t("timezoneLabel")}</Label>
                    <Input
                      value={form.timezone}
                      onChange={e => setField("timezone", e.target.value)}
                      placeholder="America/Sao_Paulo"
                      maxLength={64}
                    />
                    <p className="text-xs text-muted-foreground">{t("timezoneNote")}</p>
                  </div>
                )}
              </TabsContent>

              {/* ── Provedor ───────────────────────────────────────────── */}
              <TabsContent value="provider" className="space-y-4">
                {/* Não renderiza nada (nem faz request) sem o recurso liberado
                    na empresa. No modo plataforma é ele que mostra o modelo */}
                <PlatformAiSelector
                  value={form.usePlatformAi}
                  onChange={handlePlatformAiChange}
                  showModel
                  modelKind="chat"
                  model={form.model}
                  onModelChange={modelId => setField("model", modelId)}
                  disabled={saving}
                />

                {!platformMode && (
                  <>
                    <div className="space-y-1.5">
                      <Label>
                        {t("fieldApiKey")}
                        {apiKeyRequired && <span className="text-destructive"> *</span>}
                      </Label>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        value={form.apiKey}
                        onChange={e => setField("apiKey", e.target.value)}
                        placeholder={
                          agentId && !apiKeyRequired ? t("apiKeyKeptPlaceholder") : "sk-..."
                        }
                      />
                      <p className="text-xs text-muted-foreground">{t("apiKeyHint")}</p>
                    </div>

                    <OpenAIBaseUrlField
                      value={form.baseUrl}
                      onChange={v => setField("baseUrl", v)}
                      context="agent"
                    />

                    <div className="space-y-1.5">
                      <Label>{t("fieldModel")}</Label>
                      <Input
                        list="ai-agent-model-list"
                        value={form.model}
                        onChange={e => setField("model", e.target.value)}
                        placeholder="gpt-4o-mini"
                      />
                      <datalist id="ai-agent-model-list">
                        {CHATGPT_MODELS.map(model => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                      <p className="text-xs text-muted-foreground">{t("modelHint")}</p>
                    </div>
                  </>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("fieldMaxHistory")}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={form.maxHistoryMessages}
                      onChange={e => setField("maxHistoryMessages", e.target.value)}
                      placeholder="20"
                    />
                    <p className="text-xs text-muted-foreground">{t("maxHistoryHint")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("fieldTemperature")}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={form.temperature}
                      onChange={e => setField("temperature", e.target.value)}
                      placeholder={t("temperaturePlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">{t("temperatureHint")}</p>
                  </div>
                </div>
              </TabsContent>

              {/* ── Conhecimento (só na edição) ────────────────────────── */}
              <TabsContent value="knowledge">
                {agentId ? (
                  <AgentKnowledgeTab
                    agentId={agentId}
                    kbEnabled={form.kbEnabled}
                    onKbEnabledChange={v => setField("kbEnabled", v)}
                    semanticEnabled={form.semanticEnabled}
                    onSemanticEnabledChange={v => setField("semanticEnabled", v)}
                    engineFeatures={engineFeatures}
                    sharedKbAgents={form.sharedKbAgents}
                    onSharedKbAgentsChange={ids => setField("sharedKbAgents", ids)}
                    kbOnly={form.kbOnly}
                    agentOptions={aiAgentOptions}
                    aiAgentsAvailable={aiAgentOptionsLoaded}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("knowledgeSaveFirst")}</p>
                )}
              </TabsContent>

              {/* ── Roteamento ─────────────────────────────────────────── */}
              {/* Com o "só base" as três abas abaixo nunca ficam ativas
                  (`visibleTab`), então nem são montadas */}
              <TabsContent value="routing">
                <AgentRoutingTab
                  routingEnabled={form.routingEnabled}
                  onRoutingEnabledChange={v => setField("routingEnabled", v)}
                  targets={form.routingTargets}
                  onTargetsChange={targets => setField("routingTargets", targets)}
                  autoSummaryEnabled={form.autoSummaryEnabled}
                  onAutoSummaryEnabledChange={v => setField("autoSummaryEnabled", v)}
                  fallbackQueueId={form.fallbackQueueId}
                  onFallbackQueueIdChange={v => setField("fallbackQueueId", v)}
                  transferMessage={form.transferMessage}
                  onTransferMessageChange={v => setField("transferMessage", v)}
                  queues={queues}
                  users={users}
                  chatFlows={chatFlows}
                  chatFlowsAvailable={chatFlowsAvailable}
                  closeRules={form.closeRules}
                  onCloseRulesChange={rules => setField("closeRules", rules)}
                  reasons={reasons}
                  supportsRoutingV5={supportsRoutingV5}
                  aiAgents={aiAgentOptions}
                  aiAgentsAvailable={aiAgentOptionsLoaded}
                  currentAgentId={agentId}
                  supportsAgentHandoff={supportsAgentHandoff}
                  maxTargetDescription={
                    supportsLongTargetDescription
                      ? MAX_AI_AGENT_TARGET_DESCRIPTION
                      : LEGACY_AI_AGENT_TARGET_DESCRIPTION
                  }
                  supportsInactivity={supportsInactivity}
                  inactivity={form.inactivity}
                  onInactivityChange={value => setField("inactivity", value)}
                />
              </TabsContent>

              {/* ── Ações e dados a registrar ──────────────────────────── */}
              <TabsContent value="actions">
                <AgentActionsTab
                  actions={form.actions}
                  onActionsChange={actions => setField("actions", actions)}
                  actionMessage={form.actionMessage}
                  onActionMessageChange={v => setField("actionMessage", v)}
                  memoryEnabled={form.memoryEnabled}
                  onMemoryEnabledChange={v => setField("memoryEnabled", v)}
                  memoryFields={form.memoryFields}
                  onMemoryFieldsChange={fields => setField("memoryFields", fields)}
                  tags={tags}
                  kanbans={kanbans}
                  queues={queues}
                  users={users}
                  pipelines={pipelines}
                  stages={stages}
                  onPipelineSelected={loadStages}
                  hasFallbackQueue={!!form.fallbackQueueId}
                  supportsV5={supportsV5}
                  showQualifyPass={showQualifyPass}
                  qualifyPassEnabled={form.qualifyPassEnabled}
                  onQualifyPassChange={v => setField("qualifyPassEnabled", v)}
                />
              </TabsContent>

              {/* ── Ferramentas externas, agenda e mensagem agendada ───── */}
              <TabsContent value="tools">
                <AgentToolsTab
                  tools={form.externalTools}
                  onToolsChange={tools => setField("externalTools", tools)}
                  supportsToolSecretMask={supportsToolSecretMask}
                  nativeTools={form.nativeTools}
                  onNativeToolsChange={native => setField("nativeTools", native)}
                  bookingPages={bookingPagesForTab}
                  bookingEventTypes={bookingEventTypesForTab}
                  onBookingPageSelected={loadBookingEventTypes}
                  agentTimezone={form.timezone}
                  supportsBooking={supportsBooking}
                  supportsScheduleMessage={supportsScheduleMessage}
                  bookingInPlan={hasBookingFeature}
                  schedulingInPlan={hasSchedulingFeature}
                  consultAgents={form.consultAgents}
                  onConsultAgentsChange={rows => setField("consultAgents", rows)}
                  aiAgents={aiAgentOptions}
                  aiAgentsAvailable={aiAgentOptionsLoaded}
                  currentAgentId={agentId}
                  supportsAgentConsult={supportsAgentConsult}
                  supportsMcp={supportsMcp}
                  mcpTools={form.mcpTools}
                  onMcpToolsChange={rows => setField("mcpTools", rows)}
                  mcpServers={mcpServers}
                  mcpServersLoading={mcpServersLoading}
                  onMcpServersReload={prune => void loadMcpServers(prune)}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
