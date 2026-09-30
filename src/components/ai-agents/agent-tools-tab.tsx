"use client";

import { useTranslations } from "next-intl";
import { AlarmClock, Bot, CalendarClock, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  MAX_AI_AGENT_CONSULTS,
  type AiAgentBookingTool,
  type AiAgentExternalTool,
  type AiAgentExternalToolParam,
  type AiAgentNativeTools,
  type AiAgentScheduleMessageTool,
} from "@/services/ai-agents";

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
  tools: AiAgentExternalTool[];
  onToolsChange: (tools: AiAgentExternalTool[]) => void;
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
}

export function AgentToolsTab({
  tools,
  onToolsChange,
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
}: AgentToolsTabProps) {
  const t = useTranslations("aiAgents");

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

      {/* ── Ferramentas externas (inalteradas) ────────────────────────────── */}
      <div
        className={
          hasNativeSections || supportsAgentConsult
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
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={tool.secret || ""}
                  onChange={e => updateTool(index, { secret: e.target.value })}
                  placeholder={t("toolSecretPlaceholder")}
                  maxLength={200}
                />
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
