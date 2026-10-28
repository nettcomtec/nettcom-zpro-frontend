"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlarmClock, Bot, CalendarClock, HelpCircle, Loader2, Plus, Server, Settings2, Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useAuthStore } from "@/stores/auth-store";
import {
  MAX_AI_AGENT_CONSULTS,
  type AiAgentBookingTool,
  type AiAgentExternalTool,
  type AiAgentExternalToolParam,
  type AiAgentNativeTools,
  type AiAgentScheduleMessageTool,
} from "@/services/ai-agents";
import {
  MAX_MCP_SERVERS_PER_AGENT,
  MAX_MCP_TOOLS_PER_AGENT,
  type McpServerToolView,
  type McpServerView,
} from "@/services/ai-mcp-servers";

import { McpServersDialog } from "./mcp-servers-dialog";

// Teto espelhado do backend (ExternalToolsZPRO.MAX_EXTERNAL_TOOLS): mais que
// isso vira ruído no prompt e o agente passa a errar qual chamar.
export const MAX_EXTERNAL_TOOLS = 5;
const MAX_PARAMS = 6;

// Teto espelhado do backend (AgentV5ConfigZPRO.MAX_BOOKING_EVENT_TYPES): o
// servidor corta o 6º serviço em silêncio, então a tela já não deixa marcar.
export const MAX_BOOKING_SERVICES = 5;

// Antecedência da mensagem agendada — espelho de
// AgentV5ConfigZPRO.MIN/MAX_SCHEDULE_DAYS_AHEAD.
const MIN_SCHEDULE_DAYS = 1;
const MAX_SCHEDULE_DAYS = 7;

export const generateToolKey = (): string =>
  `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// v6 — linha da seção "Consultar outros agentes". `aiAgentId` nulo = linha
// recém-adicionada, sem agente escolhido: é rascunho e fica fora do save.
// `rowKey` é só de TELA (identidade estável da linha quando outra do meio é
// removida) e nunca vai ao servidor.
export interface AiAgentConsultRow {
  rowKey: string;
  aiAgentId: number | null;
  description: string;
}

export const generateConsultRowKey = (): string =>
  `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Espelho do MAX_CONSULT_DESCRIPTION do backend (AgentV5ConfigZPRO.ts): o que
// passar disso o servidor corta em silêncio.
const MAX_CONSULT_DESCRIPTION = 200;

// v8 (D13-1) — ferramenta externa como o editor a guarda. Com `toolSecretMask`
// anunciado a senha salva nunca chega à tela: `hasSecret` diz que ela existe e
// `savedUrl` é o endereço gravado (trocar o endereço sem digitar a senha de
// novo faz o servidor descartá-la). Os dois são só de TELA e nunca vão ao
// servidor (o save monta a ferramenta campo a campo).
export interface AgentExternalToolRow extends AiAgentExternalTool {
  savedUrl?: string | null;
}

// v8 — servidor MCP escolhido para o agente. `serverId` nulo = linha
// recém-adicionada, sem servidor escolhido: é rascunho e fica fora do save.
// `tools` são os nomes ORIGINAIS das ferramentas no servidor. `rowKey` é só de
// TELA e nunca vai ao servidor.
export interface AgentMcpRow {
  rowKey: string;
  serverId: number | null;
  tools: string[];
}

export const generateMcpRowKey = (): string =>
  `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Ferramentas que o agente pode passar a usar: só as liberadas e iguais ao que
// foi aprovado (as pausadas e as que saíram não vão à IA)
const activeMcpTools = (server: McpServerView): McpServerToolView[] =>
  (server.tools || []).filter(tool => tool.state === "active");

// Bases usadas quando o agente ainda não tem nada gravado (servidor antigo
// devolve `nativeTools: null`). Nunca são mutadas — só espalhadas.
const EMPTY_BOOKING: AiAgentBookingTool = {
  enabled: false,
  bookingPageId: null,
  eventTypes: [],
};

const EMPTY_SCHEDULE: AiAgentScheduleMessageTool = {
  enabled: false,
  maxDaysAhead: MAX_SCHEDULE_DAYS,
};

const clampScheduleDays = (value: number): number => {
  if (!Number.isFinite(value)) return MAX_SCHEDULE_DAYS;
  return Math.min(Math.max(Math.trunc(value), MIN_SCHEDULE_DAYS), MAX_SCHEDULE_DAYS);
};

interface AgentToolsTabProps {
  tools: AgentExternalToolRow[];
  onToolsChange: (tools: AgentExternalToolRow[]) => void;
  // v8 (D13-1) — o servidor esconde a senha das ferramentas externas: campo
  // nunca preenchido, "em branco = manter" e "Remover senha". Sem o anúncio
  // (servidor antigo) o campo funciona exatamente como antes.
  supportsToolSecretMask: boolean;
  // v5 — ferramentas nativas (agenda e mensagem agendada). O estado mora no
  // dialog, igual às ferramentas externas.
  nativeTools: AiAgentNativeTools | null;
  onNativeToolsChange: (value: AiAgentNativeTools | null) => void;
  // Listas carregadas sob demanda pelo dialog: vazia significa só que a seção
  // fica sem destino — o resto da aba continua funcionando.
  bookingPages: Array<{ id: number; name: string; timezone?: string | null }>;
  bookingEventTypes: Array<{ id: number; name: string; requiresForm?: boolean }>;
  onBookingPageSelected: (bookingPageId: number) => void;
  agentTimezone: string;
  // O servidor anuncia o que sabe executar (`engineFeatures`): seção que ele não
  // anuncia não aparece, senão a tela ofereceria o que não funcionaria.
  supportsBooking: boolean;
  supportsScheduleMessage: boolean;
  // Capacidade do PLANO (diferente de engineFeatures, que e o que o servidor
  // sabe executar): sem ela a secao aparece com o aviso certo em vez de
  // "nenhuma pagina cadastrada", que manda o admin cadastrar o que o plano
  // dele nao inclui.
  bookingInPlan: boolean;
  schedulingInPlan: boolean;
  // v6 — especialistas que o agente consulta antes de responder (a conversa
  // continua com ele). A lista de agentes é a enxuta do tenant, carregada uma
  // vez pelo dialog: `aiAgentsAvailable` é false enquanto ela não chegou ou se
  // falhou — aí o gravado aparece pelo "#id", sem acusar "removido".
  // `currentAgentId` (null na criação) nunca é oferecido. A seção inteira só
  // aparece com `agentConsult` anunciado pelo servidor.
  consultAgents: AiAgentConsultRow[];
  onConsultAgentsChange: (rows: AiAgentConsultRow[]) => void;
  aiAgents: Array<{ id: number; name: string; isActive?: boolean }>;
  aiAgentsAvailable: boolean;
  currentAgentId: number | null;
  supportsAgentConsult: boolean;
  // v8 — servidores MCP da empresa. A seção inteira só aparece com `mcp`
  // anunciado. `mcpServers` vem pronto do editor: `null` = lista não carregada
  // (erro ou sem acesso) e a seção fica SOMENTE LEITURA — o save não envia o
  // campo. `onMcpServersReload(prune)` recarrega a lista; com `prune` tira do
  // formulário o servidor que sumiu do cadastro (feito ao fechar o
  // "Gerenciar servidores").
  supportsMcp: boolean;
  mcpTools: AgentMcpRow[];
  onMcpToolsChange: (rows: AgentMcpRow[]) => void;
  mcpServers: McpServerView[] | null;
  mcpServersLoading: boolean;
  onMcpServersReload: (prune: boolean) => void;
}

export function AgentToolsTab({
  tools,
  onToolsChange,
  supportsToolSecretMask,
  nativeTools,
  onNativeToolsChange,
  bookingPages,
  bookingEventTypes,
  onBookingPageSelected,
  agentTimezone,
  supportsBooking,
  supportsScheduleMessage,
  bookingInPlan,
  schedulingInPlan,
  consultAgents,
  onConsultAgentsChange,
  aiAgents,
  aiAgentsAvailable,
  currentAgentId,
  supportsAgentConsult,
  supportsMcp,
  mcpTools,
  onMcpToolsChange,
  mcpServers,
  mcpServersLoading,
  onMcpServersReload,
}: AgentToolsTabProps) {
  const t = useTranslations("aiAgents");

  // D21 — cadastrar e aprovar servidores MCP é de quem gerencia agentes, nunca
  // do perfil `user` (o servidor recusa de qualquer jeito; aqui só some o botão)
  const profile = useAuthStore(s => s.user?.profile);
  const hasAgentsManage = useAuthStore(s => s.hasPermission("ai_agents_manage"));
  const canManageMcp = !!profile && profile !== "user" && hasAgentsManage;
  const [mcpManageOpen, setMcpManageOpen] = useState(false);

  const updateTool = (index: number, patch: Partial<AiAgentExternalTool>) => {
    onToolsChange(tools.map((tool, i) => (i === index ? { ...tool, ...patch } : tool)));
  };

  const removeTool = (index: number) => {
    onToolsChange(tools.filter((_, i) => i !== index));
  };

  const addTool = () => {
    if (tools.length >= MAX_EXTERNAL_TOOLS) return;
    onToolsChange([
      ...tools,
      {
        key: generateToolKey(),
        label: "",
        description: "",
        url: "",
        secret: "",
        params: [],
      },
    ]);
  };

  const updateParam = (
    toolIndex: number,
    paramIndex: number,
    patch: Partial<AiAgentExternalToolParam>
  ) => {
    const params = (tools[toolIndex]?.params || []).map((param, i) =>
      i === paramIndex ? { ...param, ...patch } : param
    );
    updateTool(toolIndex, { params });
  };

  const removeParam = (toolIndex: number, paramIndex: number) => {
    const params = (tools[toolIndex]?.params || []).filter((_, i) => i !== paramIndex);
    updateTool(toolIndex, { params });
  };

  const addParam = (toolIndex: number) => {
    const params = tools[toolIndex]?.params || [];
    if (params.length >= MAX_PARAMS) return;
    updateTool(toolIndex, {
      params: [...params, { name: "", description: "", required: false }],
    });
  };

  // ── Ferramentas nativas (v5) ─────────────────────────────────────────────

  const booking: AiAgentBookingTool = nativeTools?.booking || EMPTY_BOOKING;
  const schedule: AiAgentScheduleMessageTool =
    nativeTools?.scheduleMessage || EMPTY_SCHEDULE;

  // Os dois patches sempre reemitem o objeto INTEIRO: o dialog grava
  // `{booking, scheduleMessage}` e mandar só metade apagaria a outra.
  const patchBooking = (patch: Partial<AiAgentBookingTool>) => {
    onNativeToolsChange({
      booking: { ...booking, ...patch },
      scheduleMessage: nativeTools?.scheduleMessage || null,
    });
  };

  const patchSchedule = (patch: Partial<AiAgentScheduleMessageTool>) => {
    onNativeToolsChange({
      booking: nativeTools?.booking || null,
      scheduleMessage: { ...schedule, ...patch },
    });
  };

  const selectedPage = bookingPages.find(page => page.id === booking.bookingPageId);
  const selectedPageTimezone = (selectedPage?.timezone || "").trim();
  // B10 — o agente monta a data no fuso DELE e a página oferece horários no
  // fuso DELA: fusos diferentes fazem o "amanhã" da conversa errar o dia.
  const timezoneDiffers =
    !!agentTimezone.trim() &&
    !!selectedPageTimezone &&
    agentTimezone.trim() !== selectedPageTimezone;

  // Lista vazia por tenant sem página (ou por falha ao carregar) desabilita a
  // seção — mas nunca esconde agenda JÁ configurada.
  // Sem o recurso no plano o interruptor fica travado — mas nunca esconde nem
  // desliga config JÁ salva (empresa rebaixada continua vendo o que configurou).
  const bookingUnavailable =
    (!bookingInPlan || bookingPages.length === 0) && !booking.bookingPageId;

  const selectBookingPage = (id: number) => {
    if (!Number.isFinite(id) || id <= 0) return;
    const page = bookingPages.find(item => item.id === id);
    // Trocar de página zera os serviços: eles são da página anterior e o
    // servidor descarta id que não pertence à página escolhida.
    patchBooking({
      bookingPageId: id,
      eventTypes: booking.bookingPageId === id ? booking.eventTypes : [],
      pageTimezone: page?.timezone || null,
    });
    onBookingPageSelected(id);
  };

  // Guardamos id E nome: o servidor denormaliza o nome do serviço para não
  // consultar a agenda a cada mensagem (item sem nome é descartado lá).
  const toggleBookingService = (
    service: { id: number; name: string },
    checked: boolean
  ) => {
    const current = booking.eventTypes || [];
    if (!checked) {
      patchBooking({ eventTypes: current.filter(item => item.id !== service.id) });
      return;
    }
    if (current.some(item => item.id === service.id)) return;
    if (current.length >= MAX_BOOKING_SERVICES) return;
    patchBooking({
      eventTypes: [...current, { id: service.id, name: service.name }],
    });
  };

  const hasNativeSections = supportsBooking || supportsScheduleMessage;

  // ── Consultar outros agentes (v6) ────────────────────────────────────────

  // Só agente ATIVO e nunca o próprio: o desativado não responde à consulta.
  const consultCandidates = aiAgents.filter(
    agent => agent.isActive !== false && agent.id !== currentAgentId
  );
  const chosenConsultIds = new Set(
    consultAgents
      .map(row => row.aiAgentId)
      .filter((id): id is number => !!id)
  );
  const freeConsultCandidates = consultCandidates.filter(
    agent => !chosenConsultIds.has(agent.id)
  );
  const draftConsultRows = consultAgents.filter(row => !row.aiAgentId).length;
  // Só afirma "não há agente" depois que a lista chegou
  const noConsultCandidates = aiAgentsAvailable && consultCandidates.length === 0;
  // Linha nova só quando sobra agente livre para ela (e para cada rascunho já
  // aberto) — senão nasceria com o seletor vazio.
  const canAddConsult =
    consultAgents.length < MAX_AI_AGENT_CONSULTS &&
    freeConsultCandidates.length > draftConsultRows;

  // Opções da linha: os agentes livres mais o que ELA já escolheu. O gravado que
  // saiu da lista (excluído) ou foi desativado continua visível com o motivo —
  // senão o seletor apareceria vazio e a consulta pareceria não configurada.
  const consultOptionsFor = (row: AiAgentConsultRow) => {
    const selectedId = row.aiAgentId;
    const options = consultCandidates
      .filter(agent => agent.id === selectedId || !chosenConsultIds.has(agent.id))
      .map(agent => ({ id: agent.id, name: agent.name }));
    if (!selectedId || options.some(option => option.id === selectedId)) return options;
    const saved = aiAgents.find(agent => agent.id === selectedId);
    const name = saved
      ? saved.isActive === false
        ? `${saved.name} ${t("targetAiAgentInactive")}`
        : saved.name
      : aiAgentsAvailable
        ? `#${selectedId} ${t("targetAiAgentRemoved")}`
        : `#${selectedId}`;
    return [{ id: selectedId, name }, ...options];
  };

  const updateConsultRow = (index: number, patch: Partial<AiAgentConsultRow>) => {
    onConsultAgentsChange(
      consultAgents.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const removeConsultRow = (index: number) => {
    onConsultAgentsChange(consultAgents.filter((_, i) => i !== index));
  };

  const addConsultRow = () => {
    if (!canAddConsult) return;
    onConsultAgentsChange([
      ...consultAgents,
      { rowKey: generateConsultRowKey(), aiAgentId: null, description: "" },
    ]);
  };

  // ── Servidores MCP (v8) ──────────────────────────────────────────────────

  const mcpListLoaded = mcpServers !== null;
  const mcpServerById = new Map<number, McpServerView>(
    (mcpServers || []).map(server => [server.id, server] as [number, McpServerView])
  );
  // Só servidor ATIVO entra na escolha (o inativo fica fora de todo atendimento)
  const activeMcpServers = (mcpServers || []).filter(server => server.isActive);
  const chosenMcpServerIds = new Set(
    mcpTools.map(row => row.serverId).filter((id): id is number => !!id)
  );
  const freeMcpServers = activeMcpServers.filter(
    server => !chosenMcpServerIds.has(server.id)
  );
  const draftMcpRows = mcpTools.filter(row => !row.serverId).length;
  // O teto vale para TUDO o que está marcado, inclusive ferramenta pausada:
  // acima dele o servidor recusaria o save inteiro
  const mcpToolCount = mcpTools.reduce((sum, row) => sum + row.tools.length, 0);
  const mcpAtToolLimit = mcpToolCount >= MAX_MCP_TOOLS_PER_AGENT;
  // Linha nova só quando sobra servidor livre para ela (e para cada rascunho já
  // aberto) — senão nasceria com o seletor vazio
  const canAddMcp =
    mcpListLoaded &&
    mcpTools.length < MAX_MCP_SERVERS_PER_AGENT &&
    freeMcpServers.length > draftMcpRows;

  const updateMcpRow = (index: number, patch: Partial<AgentMcpRow>) => {
    onMcpToolsChange(mcpTools.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeMcpRow = (index: number) => {
    onMcpToolsChange(mcpTools.filter((_, i) => i !== index));
  };

  const addMcpRow = () => {
    if (!canAddMcp) return;
    onMcpToolsChange([
      ...mcpTools,
      { rowKey: generateMcpRowKey(), serverId: null, tools: [] },
    ]);
  };

  // A23 — o servidor chega com as ferramentas liberadas já marcadas, na ordem do
  // cadastro, até o saldo do teto (com mais de 15 liberadas, as do fim ficam
  // desmarcadas e o contador mostra)
  const chooseMcpServer = (index: number, serverId: number) => {
    const server = mcpServerById.get(serverId);
    if (!server || !server.isActive || chosenMcpServerIds.has(serverId)) return;
    const usedByOthers = mcpTools.reduce(
      (sum, row, i) => (i === index ? sum : sum + row.tools.length),
      0
    );
    const balance = Math.max(0, MAX_MCP_TOOLS_PER_AGENT - usedByOthers);
    updateMcpRow(index, {
      serverId,
      tools: activeMcpTools(server)
        .slice(0, balance)
        .map(tool => tool.name),
    });
  };

  const toggleMcpTool = (index: number, name: string, checked: boolean) => {
    const row = mcpTools[index];
    if (!row) return;
    if (!checked) {
      updateMcpRow(index, { tools: row.tools.filter(item => item !== name) });
      return;
    }
    if (row.tools.includes(name) || mcpAtToolLimit) return;
    updateMcpRow(index, { tools: [...row.tools, name] });
  };

  // Ferramenta marcada que deixou de estar liberada: pausada quando mudou no
  // servidor (volta sozinha depois de aprovada de novo), senão saiu da lista
  const mcpSavedToolReason = (server: McpServerView, name: string): string =>
    (server.tools || []).find(tool => tool.name === name)?.state === "changed"
      ? t("mcpToolPaused")
      : t("mcpToolGone");

  const closeMcpManage = (next: boolean) => {
    setMcpManageOpen(next);
    // Recarrega sempre ao fechar (cobre criar, excluir, aprovar e pausar) e tira
    // do agente o servidor que foi excluído (A3/B6)
    if (!next) onMcpServersReload(true);
  };

  // ── Senha das ferramentas externas (v8, D13-1) ───────────────────────────

  // Senha salva que vale enquanto nada for digitado: só com o servidor que a
  // esconde (sem o anúncio, o campo mostra a senha como sempre)
  const isSecretKept = (tool: AgentExternalToolRow): boolean =>
    supportsToolSecretMask &&
    tool.hasSecret === true &&
    !tool.secretClear &&
    !(tool.secret || "").trim();

  // O servidor só reaproveita a senha salva com o MESMO endereço
  const isSecretUrlChanged = (tool: AgentExternalToolRow): boolean =>
    typeof tool.savedUrl === "string" && tool.url.trim() !== tool.savedUrl.trim();

  return (
    <div className="space-y-5">
      {/* ── Agenda: o agente consulta horários e reserva pela Página de
          Agendamento do tenant ─────────────────────────────────────────── */}
      {supportsBooking && (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarClock className="h-4 w-4" />
            {t("bookingSectionTitle")}
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-agent-booking-enabled">{t("bookingEnable")}</Label>
              <Switch
                id="ai-agent-booking-enabled"
                checked={booking.enabled}
                disabled={bookingUnavailable}
                onCheckedChange={value => patchBooking({ enabled: value })}
              />
            </div>
            {!bookingInPlan ? (
              <p className="text-xs text-muted-foreground">{t("bookingNotInPlan")}</p>
            ) : (
              bookingUnavailable && (
                <p className="text-xs text-muted-foreground">{t("bookingPagesEmpty")}</p>
              )
            )}
          </div>

          {booking.enabled && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1.5">
                <Label>
                  {t("bookingPage")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={booking.bookingPageId ? String(booking.bookingPageId) : ""}
                  onValueChange={value => selectBookingPage(Number(value))}
                  disabled={bookingPages.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("bookingPage")} />
                  </SelectTrigger>
                  <SelectContent>
                    {bookingPages.map(page => (
                      <SelectItem key={page.id} value={String(page.id)}>
                        {page.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {timezoneDiffers && (
                  <>
                    <p className="text-xs text-destructive">
                      {t("bookingTimezoneDiffers")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {agentTimezone.trim()} · {selectedPageTimezone}
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  {t("bookingServices")} <span className="text-destructive">*</span>
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {bookingEventTypes.map(service => {
                    const checked = (booking.eventTypes || []).some(
                      item => item.id === service.id
                    );
                    // D17 — serviço com pergunta obrigatória no formulário fica
                    // fora da v5 (nome e telefone vêm do contato, nunca do
                    // modelo). Já marcado continua desmarcável, senão o admin
                    // ficaria preso com um serviço que o agente não atende.
                    const needsForm = service.requiresForm === true;
                    const atLimit =
                      !checked &&
                      (booking.eventTypes || []).length >= MAX_BOOKING_SERVICES;
                    return (
                      <div key={service.id} className="space-y-1">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={`ai-agent-booking-service-${service.id}`}
                            className="mt-0.5"
                            checked={checked}
                            disabled={(needsForm && !checked) || atLimit}
                            onCheckedChange={value =>
                              toggleBookingService(service, value === true)
                            }
                          />
                          <Label
                            htmlFor={`ai-agent-booking-service-${service.id}`}
                            className="text-sm font-normal leading-5"
                          >
                            {service.name}
                          </Label>
                        </div>
                        {needsForm && (
                          <p className="pl-6 text-xs text-muted-foreground">
                            {t("bookingServiceNeedsForm")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(booking.eventTypes || []).length >= MAX_BOOKING_SERVICES && (
                  <p className="text-xs text-muted-foreground">
                    {t("bookingServicesLimit", { max: MAX_BOOKING_SERVICES })}
                  </p>
                )}
              </div>

              {/* Limitações declaradas: profissional (D23), dados do contato
                  (D17) e confirmação antes de reservar */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("bookingProfessionalNote")}
                </p>
                <p className="text-xs text-muted-foreground">{t("bookingPhoneOnly")}</p>
                <p className="text-xs text-muted-foreground">{t("bookingConfirmNote")}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Mensagem agendada: o agente marca um retorno para o contato ───── */}
      {supportsScheduleMessage && (
        <div className={supportsBooking ? "space-y-3 border-t pt-5" : "space-y-3"}>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <AlarmClock className="h-4 w-4" />
            {t("scheduleSectionTitle")}
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-agent-schedule-enabled">{t("scheduleEnable")}</Label>
              <Switch
                id="ai-agent-schedule-enabled"
                checked={schedule.enabled}
                disabled={!schedulingInPlan && !schedule.enabled}
                onCheckedChange={value => patchSchedule({ enabled: value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {schedulingInPlan ? t("scheduleNote") : t("scheduleNotInPlan")}
            </p>
          </div>

          {schedule.enabled && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-agent-schedule-days">{t("scheduleMaxDays")}</Label>
                  <Input
                    id="ai-agent-schedule-days"
                    type="number"
                    inputMode="numeric"
                    min={MIN_SCHEDULE_DAYS}
                    max={MAX_SCHEDULE_DAYS}
                    value={String(schedule.maxDaysAhead ?? MAX_SCHEDULE_DAYS)}
                    onChange={e => {
                      const parsed = Number.parseInt(e.target.value, 10);
                      patchSchedule({
                        maxDaysAhead: Number.isNaN(parsed)
                          ? MIN_SCHEDULE_DAYS
                          : parsed,
                      });
                    }}
                    onBlur={() =>
                      patchSchedule({
                        maxDaysAhead: clampScheduleDays(schedule.maxDaysAhead),
                      })
                    }
                  />
                </div>
              </div>

              {/* D11/D25 — as três limitações ficam declaradas na tela */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("scheduleOfficialNote")}
                </p>
                <p className="text-xs text-muted-foreground">{t("scheduleNoCancel")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("scheduleNewTicketNote")}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Consultar outros agentes (v6): o agente pergunta a um especialista
          antes de responder, sem passar a conversa para ele ─────────────── */}
      {supportsAgentConsult && (
        <div className={hasNativeSections ? "space-y-3 border-t pt-5" : "space-y-3"}>
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Bot className="h-4 w-4" />
              {t("consultTitle")}
            </p>
            <p className="text-sm text-muted-foreground">{t("consultDescription")}</p>
            <p className="text-xs text-muted-foreground">{t("consultCostNote")}</p>
          </div>

          {consultAgents.length === 0 && !noConsultCandidates && (
            <p className="text-sm text-muted-foreground">{t("consultEmpty")}</p>
          )}

          {consultAgents.map((row, index) => {
            const options = consultOptionsFor(row);
            return (
              <div
                key={row.rowKey}
                className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end"
              >
                <div className="min-w-0 space-y-1.5">
                  <Label>
                    {t("consultAgentField")} <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={row.aiAgentId ? String(row.aiAgentId) : ""}
                    onValueChange={value => {
                      const id = Number(value);
                      if (Number.isInteger(id) && id > 0) {
                        updateConsultRow(index, { aiAgentId: id });
                      }
                    }}
                    disabled={options.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("consultSelectAgent")} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map(agent => (
                        <SelectItem key={agent.id} value={String(agent.id)}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label>{t("consultWhenField")}</Label>
                  <Input
                    value={row.description}
                    onChange={e =>
                      updateConsultRow(index, { description: e.target.value })
                    }
                    placeholder={t("consultWhenPlaceholder")}
                    maxLength={MAX_CONSULT_DESCRIPTION}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() => removeConsultRow(index)}
                    aria-label={t("removeConsult")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Mesma explicação do "Quando transferir" do roteamento: é a frase
              que a IA lê para decidir quando consultar */}
          {consultAgents.length > 0 && (
            <p className="text-xs text-muted-foreground">{t("consultWhenHint")}</p>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={addConsultRow}
            className="gap-1.5"
            disabled={!canAddConsult}
          >
            <Plus className="h-4 w-4" />
            {t("consultAdd")}
          </Button>
          {noConsultCandidates ? (
            <p className="text-xs text-muted-foreground">{t("consultNoAgents")}</p>
          ) : (
            consultAgents.length >= MAX_AI_AGENT_CONSULTS && (
              <p className="text-xs text-muted-foreground">
                {t("consultMax", { max: MAX_AI_AGENT_CONSULTS })}
              </p>
            )
          )}
        </div>
      )}

      {/* ── Servidores MCP (v8): ferramentas de servidores cadastrados pela
          empresa e aprovadas uma a uma ─────────────────────────────────── */}
      {supportsMcp && (
        <div
          className={
            hasNativeSections || supportsAgentConsult
              ? "space-y-3 border-t pt-5"
              : "space-y-3"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Server className="h-4 w-4" />
                {t("mcpSectionTitle")}
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    aria-label={t("mcpSectionTitle")}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                {/* Altura presa à área visível (rolagem interna), como a ajuda
                    do atraso na resposta */}
                <PopoverContent
                  side="top"
                  align="start"
                  collisionPadding={16}
                  className="w-[360px] max-w-[calc(100vw-2rem)] overflow-y-auto text-xs"
                  style={{
                    maxHeight: "var(--radix-popover-content-available-height, 70vh)",
                  }}
                >
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">{t("mcpSectionTitle")}</p>
                    <p className="whitespace-pre-line text-muted-foreground">
                      {t("mcpSectionHelp")}
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
              {mcpServersLoading && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            {canManageMcp && mcpListLoaded && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setMcpManageOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {t("mcpManageServers")}
              </Button>
            )}
          </div>

          {!mcpListLoaded ? (
            // Lista não carregada: o que está salvo aparece só para leitura e o
            // save não mexe nele
            <>
              {mcpTools
                .filter(row => !!row.serverId)
                .map(row => (
                  <div key={row.rowKey} className="space-y-1 rounded-md border p-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      #{row.serverId}
                    </p>
                    {row.tools.length > 0 && (
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {row.tools.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              {!mcpServersLoading && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("mcpReadOnlyNotice")}
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => onMcpServersReload(false)}
                  >
                    {t("mapRetry")}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {mcpTools.length === 0 && activeMcpServers.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("mcpNoServers")}</p>
              )}

              {mcpTools.map((row, index) => {
                // Rascunho: só o seletor de servidor
                if (!row.serverId) {
                  return (
                    <div key={row.rowKey} className="flex items-center gap-2 rounded-md border p-3">
                      <div className="min-w-0 flex-1">
                        <Select
                          value=""
                          onValueChange={value => {
                            const id = Number(value);
                            if (Number.isInteger(id) && id > 0) chooseMcpServer(index, id);
                          }}
                          disabled={freeMcpServers.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("mcpSelectServer")} />
                          </SelectTrigger>
                          <SelectContent>
                            {freeMcpServers.map(server => (
                              <SelectItem key={server.id} value={String(server.id)}>
                                {server.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => removeMcpRow(index)}
                        aria-label={t("mcpRemoveServer")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                }

                const server = mcpServerById.get(row.serverId);
                const serverActiveTools = server ? activeMcpTools(server) : [];
                const activeNames = new Set(serverActiveTools.map(tool => tool.name));
                // Marcadas que não estão mais liberadas: riscadas, com o motivo
                const lostTools = row.tools.filter(name => !activeNames.has(name));
                const title = !server
                  ? `#${row.serverId} ${t("mcpServerRemoved")}`
                  : server.isActive
                    ? server.name
                    : `${server.name} ${t("targetAiAgentInactive")}`;

                return (
                  <div key={row.rowKey} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          "flex min-w-0 items-center gap-1.5 text-sm font-medium",
                          !server && "text-muted-foreground"
                        )}
                      >
                        <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 break-words">{title}</span>
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive"
                        onClick={() => removeMcpRow(index)}
                        aria-label={t("mcpRemoveServer")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {!server ? (
                      // Servidor excluído do cadastro: as ferramentas dele já
                      // não valem (o servidor ignora o vínculo no save)
                      row.tools.length > 0 && (
                        <p className="break-all font-mono text-xs text-muted-foreground line-through">
                          {row.tools.join(", ")}
                        </p>
                      )
                    ) : (
                      <div className="space-y-2">
                        {serverActiveTools.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            {t("mcpNoActiveTools")}
                          </p>
                        )}
                        {serverActiveTools.map((tool, toolIndex) => {
                          const checked = row.tools.includes(tool.name);
                          const checkboxId = `ai-agent-mcp-${row.rowKey}-${toolIndex}`;
                          return (
                            <div key={tool.name} className="flex items-start gap-2">
                              <Checkbox
                                id={checkboxId}
                                className="mt-0.5"
                                checked={checked}
                                disabled={!checked && mcpAtToolLimit}
                                onCheckedChange={value =>
                                  toggleMcpTool(index, tool.name, value === true)
                                }
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Label
                                    htmlFor={checkboxId}
                                    className="break-all font-mono text-xs font-normal leading-5"
                                  >
                                    {tool.name}
                                  </Label>
                                  {tool.altersData && (
                                    <Badge
                                      variant="warning-soft"
                                      className="px-1.5 py-0 text-[10px] font-medium"
                                    >
                                      {t("mcpBadgeWrites")}
                                    </Badge>
                                  )}
                                </div>
                                {tool.descriptionForModel && (
                                  <p
                                    className="line-clamp-2 break-words text-xs text-muted-foreground"
                                    title={tool.descriptionForModel}
                                  >
                                    {tool.descriptionForModel}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {lostTools.map(name => (
                          <div key={`lost-${name}`} className="flex items-start gap-2">
                            <div className="min-w-0 flex-1 space-y-0.5 pl-6">
                              <p className="break-all font-mono text-xs text-muted-foreground line-through">
                                {name}
                              </p>
                              <p className="text-xs text-amber-600 dark:text-amber-400">
                                {mcpSavedToolReason(server, name)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-destructive"
                              onClick={() => toggleMcpTool(index, name, false)}
                              aria-label={t("removeTool")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {mcpTools.length > 0 && (
                <p
                  className={cn(
                    "text-xs",
                    mcpAtToolLimit
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  )}
                >
                  {t("mcpToolsCounter", {
                    count: mcpToolCount,
                    max: MAX_MCP_TOOLS_PER_AGENT,
                  })}
                </p>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={addMcpRow}
                className="gap-1.5"
                disabled={!canAddMcp}
              >
                <Plus className="h-4 w-4" />
                {t("mcpAddToAgent")}
              </Button>
            </>
          )}

          {canManageMcp && (
            <McpServersDialog open={mcpManageOpen} onOpenChange={closeMcpManage} />
          )}
        </div>
      )}

      {/* ── Ferramentas externas ──────────────────────────────────────────── */}
      <div
        className={
          hasNativeSections || supportsAgentConsult || supportsMcp
            ? "space-y-1.5 border-t pt-5"
            : "space-y-1.5"
        }
      >
        <p className="text-sm font-medium">{t("tabTools")}</p>
        <p className="text-sm text-muted-foreground">{t("toolsNote")}</p>
        <p className="text-xs text-muted-foreground">{t("toolsPayloadHint")}</p>
      </div>

      <div className="space-y-3">
        {tools.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("toolsEmpty")}</p>
        )}

        {tools.map((tool, index) => (
          <div key={tool.key || index} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t("toolItemTitle", { index: index + 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => removeTool(index)}
                aria-label={t("removeTool")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  {t("toolLabel")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={tool.label}
                  onChange={e => updateTool(index, { label: e.target.value })}
                  placeholder={t("toolLabelPlaceholder")}
                  maxLength={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("toolSecret")}</Label>
                {/* Com a senha escondida pelo servidor o campo nunca vem
                    preenchido: em branco = manter a salva */}
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={tool.secret || ""}
                  onChange={e => updateTool(index, { secret: e.target.value })}
                  placeholder={
                    supportsToolSecretMask && tool.hasSecret === true && !tool.secretClear
                      ? t("toolSecretKept")
                      : t("toolSecretPlaceholder")
                  }
                  maxLength={200}
                />
                {isSecretKept(tool) && (
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p
                      className={cn(
                        "min-w-0 flex-1 text-xs",
                        isSecretUrlChanged(tool)
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {t("toolSecretUrlNote")}
                    </p>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto shrink-0 p-0 text-xs text-destructive"
                      onClick={() => updateTool(index, { secret: "", secretClear: true })}
                    >
                      {t("toolSecretClear")}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("toolUrl")} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={tool.url}
                onChange={e => updateTool(index, { url: e.target.value })}
                placeholder={t("toolUrlPlaceholder")}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{t("toolUrlHint")}</p>
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("toolDescription")} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={2}
                value={tool.description}
                onChange={e => updateTool(index, { description: e.target.value })}
                placeholder={t("toolDescriptionPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("toolDescriptionHint")}</p>
            </div>

            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">{t("toolParams")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1"
                  onClick={() => addParam(index)}
                  disabled={(tool.params || []).length >= MAX_PARAMS}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("addParam")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("toolParamsHint")}</p>

              {(tool.params || []).map((param, paramIndex) => (
                <div
                  key={paramIndex}
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-center"
                >
                  <Input
                    value={param.name}
                    onChange={e =>
                      updateParam(index, paramIndex, { name: e.target.value })
                    }
                    placeholder={t("paramNamePlaceholder")}
                    maxLength={40}
                  />
                  <Input
                    value={param.description || ""}
                    onChange={e =>
                      updateParam(index, paramIndex, { description: e.target.value })
                    }
                    placeholder={t("paramDescriptionPlaceholder")}
                    maxLength={200}
                  />
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={!!param.required}
                        onCheckedChange={value =>
                          updateParam(index, paramIndex, { required: value })
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        {t("paramRequired")}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeParam(index, paramIndex)}
                      aria-label={t("removeParam")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addTool}
          className="gap-1.5"
          disabled={tools.length >= MAX_EXTERNAL_TOOLS}
        >
          <Plus className="h-4 w-4" />
          {t("addTool")}
        </Button>
        {tools.length >= MAX_EXTERNAL_TOOLS && (
          <p className="text-xs text-muted-foreground">
            {t("toolsMax", { max: MAX_EXTERNAL_TOOLS })}
          </p>
        )}
      </div>
    </div>
  );
}
