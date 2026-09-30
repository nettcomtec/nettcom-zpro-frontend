"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import type {
  AiAgentCloseReason,
  AiAgentCloseRules,
  AiAgentGraceDestinationType,
  AiAgentGraceRule,
  AiAgentRoutingTarget,
  AiAgentRoutingTargetType,
} from "@/services/ai-agents";
import type { Queue } from "@/services/queues";
import type { User } from "@/services/users";

// Chave estável do destino — é o identificador que a IA devolve na decisão de
// transferência; gerada uma vez ao adicionar e preservada nas edições.
export const generateTargetKey = (): string =>
  `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Tetos espelhados do backend (AgentV5ConfigZPRO): o que passar disso o
// servidor corta em silêncio, então a tela já não deixa configurar.
export const MAX_CLOSE_REASONS = 10;
export const MIN_GRACE_SECONDS = 1;
export const MAX_GRACE_SECONDS = 86400;

// Carência nasce em 1 hora — o mesmo padrão do nó de carência do construtor.
const DEFAULT_GRACE_SECONDS = 3600;

type GraceUnit = "minutes" | "hours";

const UNIT_SECONDS: Record<GraceUnit, number> = { minutes: 60, hours: 3600 };

// A unidade é só estado de TELA: o que vai gravado é sempre `seconds`.
const deriveGraceUnit = (seconds?: number | null): GraceUnit =>
  seconds != null &&
  seconds >= UNIT_SECONDS.hours &&
  seconds % UNIT_SECONDS.hours === 0
    ? "hours"
    : "minutes";

const clampGraceSeconds = (seconds: number): number =>
  Math.min(MAX_GRACE_SECONDS, Math.max(MIN_GRACE_SECONDS, Math.round(seconds)));

// Mesmo shape enxuto de `AiAgentChatFlowOption` / `Reason`, declarado aqui para
// a aba não depender de quem carrega as listas.
type RoutingChatFlowOption = { id: number; name: string; isActive?: boolean };
type RoutingReasonOption = { id: number; name: string };
// Mesmo shape de `AiAgentSummary` (listagem enxuta), só com o que a aba lê.
type RoutingAiAgentOption = { id: number; name: string; isActive?: boolean };

// Teto do input de rótulo (abaixo): o nome do agente copiado para um rótulo
// vazio respeita o mesmo limite do que se digita.
const MAX_TARGET_LABEL = 100;

interface AgentRoutingTabProps {
  routingEnabled: boolean;
  onRoutingEnabledChange: (value: boolean) => void;
  targets: AiAgentRoutingTarget[];
  onTargetsChange: (targets: AiAgentRoutingTarget[]) => void;
  autoSummaryEnabled: boolean;
  onAutoSummaryEnabledChange: (value: boolean) => void;
  fallbackQueueId: number | null;
  onFallbackQueueIdChange: (value: number | null) => void;
  transferMessage: string;
  onTransferMessageChange: (value: string) => void;
  queues: Queue[];
  users: User[];
  // v5 — fluxos do construtor na forma enxuta; `chatFlowsAvailable` é false
  // quando o servidor não tem a rota de lookup (backend antigo, 404).
  chatFlows: RoutingChatFlowOption[];
  chatFlowsAvailable: boolean;
  closeRules: AiAgentCloseRules | null;
  onCloseRulesChange: (value: AiAgentCloseRules | null) => void;
  reasons: RoutingReasonOption[];
  // engineFeatures.includes("routingV5") — o que o SERVIDOR anuncia executar.
  supportsRoutingV5: boolean;
  // v6 — destino "Outro agente de IA". Lista enxuta do tenant, carregada uma
  // vez pelo dialog: `aiAgentsAvailable` é false enquanto ela não chegou ou se
  // falhou — aí o agente gravado aparece pelo rótulo, sem acusar "removido".
  // `currentAgentId` (null na criação) nunca é oferecido como destino de si
  // mesmo. `supportsAgentHandoff` = engineFeatures.includes("agentHandoff").
  aiAgents: RoutingAiAgentOption[];
  aiAgentsAvailable: boolean;
  currentAgentId: number | null;
  supportsAgentHandoff: boolean;
}

export function AgentRoutingTab({
  routingEnabled,
  onRoutingEnabledChange,
  targets,
  onTargetsChange,
  autoSummaryEnabled,
  onAutoSummaryEnabledChange,
  fallbackQueueId,
  onFallbackQueueIdChange,
  transferMessage,
  onTransferMessageChange,
  queues,
  users,
  chatFlows,
  chatFlowsAvailable,
  closeRules,
  onCloseRulesChange,
  reasons,
  supportsRoutingV5,
  aiAgents,
  aiAgentsAvailable,
  currentAgentId,
  supportsAgentHandoff,
}: AgentRoutingTabProps) {
  const t = useTranslations("aiAgents");

  const updateTarget = (index: number, patch: Partial<AiAgentRoutingTarget>) => {
    onTargetsChange(
      targets.map((target, i) => (i === index ? { ...target, ...patch } : target))
    );
  };

  const removeTarget = (index: number) => {
    onTargetsChange(targets.filter((_, i) => i !== index));
  };

  const addTarget = () => {
    onTargetsChange([
      ...targets,
      {
        key: generateTargetKey(),
        label: "",
        description: "",
        type: "queue",
        queueId: null,
        userId: null,
        transferMessage: "",
      },
    ]);
  };

  // ── Destino "Fluxo" (v5) ────────────────────────────────────────────────
  // Fluxo desativado não entra na lista: o handoff cai na fila de emergência.
  const activeFlows = useMemo(
    () => chatFlows.filter(flow => flow.isActive !== false),
    [chatFlows]
  );

  // Só dá para ESCOLHER fluxo quando o servidor executa o destino, a rota de
  // lookup existe e sobrou algum fluxo ativo.
  const canPickFlow =
    supportsRoutingV5 && chatFlowsAvailable && activeFlows.length > 0;

  // Nota do motivo pelo qual a opção está desabilitada (uma ou outra).
  const flowTypeBlockedNote = !supportsRoutingV5
    ? null
    : !chatFlowsAvailable
      ? t("targetFlowUnavailable")
      : activeFlows.length === 0
        ? t("targetFlowsEmpty")
        : null;

  // Fluxo já gravado que saiu da lista (desativado/apagado) continua visível,
  // senão o seletor apareceria vazio e o destino sumiria da tela.
  const flowOptionsFor = (
    selectedId?: number | null,
    // Nome do destino, usado quando a LISTA inteira falhou (servidor antigo ou
    // rota fora do ar): sem isto o seletor aparece vazio e o destino parece não
    // configurado, embora o `chatFlowId` continue gravado e vá no save.
    fallbackName?: string
  ): RoutingChatFlowOption[] => {
    if (!selectedId) return activeFlows;
    if (activeFlows.some(flow => flow.id === selectedId)) return activeFlows;
    const saved = chatFlows.find(flow => flow.id === selectedId);
    if (saved) return [saved, ...activeFlows];
    return [
      {
        id: selectedId,
        name: (fallbackName || "").trim() || `#${selectedId}`,
        isActive: true
      },
      ...activeFlows
    ];
  };

  // ── Destino "Outro agente de IA" (v6) ───────────────────────────────────
  // Só agentes ATIVOS e nunca o próprio: desativado não assume a conversa (o
  // handoff cairia na fila de emergência).
  const activeAiAgents = useMemo(
    () =>
      aiAgents.filter(
        agent => agent.isActive !== false && agent.id !== currentAgentId
      ),
    [aiAgents, currentAgentId]
  );

  // Só dá para ESCOLHER quando o servidor executa o destino e sobrou algum
  // outro agente ativo.
  const canPickAiAgent = supportsAgentHandoff && activeAiAgents.length > 0;

  // Motivo de a opção estar desabilitada — só depois que a lista chegou, para
  // não afirmar "nenhum agente" durante a carga.
  const aiAgentTypeBlockedNote =
    supportsAgentHandoff && aiAgentsAvailable && activeAiAgents.length === 0
      ? t("targetAiAgentsEmpty")
      : null;

  // Agente já gravado que foi excluído ou desativado continua visível, com o
  // motivo — senão o seletor apareceria vazio e o destino pareceria não
  // configurado, embora o `aiAgentId` continue gravado e vá no save.
  const aiAgentOptionsFor = (
    selectedId?: number | null,
    // Rótulo do destino: é o único nome que existe para agente excluído
    fallbackName?: string
  ): RoutingAiAgentOption[] => {
    if (!selectedId || activeAiAgents.some(agent => agent.id === selectedId)) {
      return activeAiAgents;
    }
    const saved = aiAgents.find(agent => agent.id === selectedId);
    const baseName = (fallbackName || "").trim() || `#${selectedId}`;
    const name = saved
      ? saved.isActive === false
        ? `${saved.name} ${t("targetAiAgentInactive")}`
        : saved.name
      : aiAgentsAvailable
        ? `${baseName} ${t("targetAiAgentRemoved")}`
        : baseName;
    return [{ id: selectedId, name, isActive: true }, ...activeAiAgents];
  };

  const chooseAiAgent = (index: number, aiAgentId: number) => {
    if (!Number.isInteger(aiAgentId) || aiAgentId <= 0) return;
    const current = targets[index];
    const agentName = (
      aiAgents.find(agent => agent.id === aiAgentId)?.name || ""
    ).trim();
    // Rótulo vazio herda o nome do agente escolhido (é o que a IA enxerga na
    // decisão). Rótulo que ainda é o nome do agente escolhido ANTES também
    // acompanha a troca — senão o modelo leria "Vendas" e a conversa iria
    // para "Suporte". Rótulo digitado pelo admin nunca é trocado.
    const currentLabel = (current?.label || "").trim();
    const previousName = (
      aiAgents.find(agent => agent.id === Number(current?.aiAgentId))?.name || ""
    )
      .trim()
      .slice(0, MAX_TARGET_LABEL);
    const fillLabel =
      !!agentName &&
      (!currentLabel || (!!previousName && currentLabel === previousName));
    updateTarget(
      index,
      fillLabel
        ? { aiAgentId, label: agentName.slice(0, MAX_TARGET_LABEL) }
        : { aiAgentId }
    );
  };

  const changeTargetType = (index: number, value: AiAgentRoutingTargetType) => {
    // Trocar de tipo zera os campos do tipo anterior — id órfão viraria destino
    // morto no servidor.
    updateTarget(index, {
      type: value,
      queueId: null,
      userId: null,
      ...(value === "chatflow" ? {} : { chatFlowId: null }),
      ...(value === "ai_agent" ? {} : { aiAgentId: null }),
    });
  };

  // ── Regras do encerramento (v5) ─────────────────────────────────────────
  const selectedReasons: AiAgentCloseReason[] = closeRules?.reasons ?? [];
  const graceRule: AiAgentGraceRule | null = closeRules?.grace ?? null;

  // Config já gravada continua na tela mesmo em servidor que não anuncia o
  // recurso: esconder o que está valendo é pior que mostrar desligado.
  const showCloseSections =
    supportsRoutingV5 || selectedReasons.length > 0 || !!graceRule;

  const emitCloseRules = (
    nextReasons: AiAgentCloseReason[],
    nextGrace: AiAgentGraceRule | null
  ) => {
    if (nextReasons.length === 0 && !nextGrace) {
      onCloseRulesChange(null);
      return;
    }
    onCloseRulesChange({ reasons: nextReasons, grace: nextGrace });
  };

  const toggleReason = (reason: RoutingReasonOption, checked: boolean) => {
    if (!checked) {
      emitCloseRules(
        selectedReasons.filter(item => item.id !== reason.id),
        graceRule
      );
      return;
    }
    if (selectedReasons.some(item => item.id === reason.id)) return;
    if (selectedReasons.length >= MAX_CLOSE_REASONS) return;
    // O nome vai junto: o servidor monta a ferramenta a partir dele, sem
    // consultar a tabela de motivos.
    emitCloseRules(
      [...selectedReasons, { id: reason.id, name: reason.name }],
      graceRule
    );
  };

  // Motivo marcado que saiu da lista do tenant segue aparecendo — é a única
  // forma de desmarcá-lo.
  const reasonOptions = useMemo<RoutingReasonOption[]>(() => {
    const list = reasons.map(reason => ({ id: reason.id, name: reason.name }));
    const known = new Set(list.map(reason => reason.id));
    for (const selected of selectedReasons) {
      if (!known.has(selected.id)) list.push({ id: selected.id, name: selected.name });
    }
    return list;
  }, [reasons, selectedReasons]);

  // ── Carência (v5) ───────────────────────────────────────────────────────
  const graceEnabled = graceRule?.enabled === true;
  const graceSeconds = graceRule?.seconds ?? DEFAULT_GRACE_SECONDS;

  const [graceUnit, setGraceUnit] = useState<GraceUnit>(() =>
    deriveGraceUnit(closeRules?.grace?.seconds)
  );
  // Guarda o último valor ESCRITO daqui: sem isso, gravar 3600 devolveria
  // "1 hora" no meio da digitação de "60" minutos.
  const lastWrittenSecondsRef = useRef<number | null>(
    closeRules?.grace?.seconds ?? null
  );

  useEffect(() => {
    const seconds = graceRule?.seconds ?? null;
    if (seconds !== lastWrittenSecondsRef.current) {
      lastWrittenSecondsRef.current = seconds;
      setGraceUnit(deriveGraceUnit(seconds));
    }
  }, [graceRule?.seconds]);

  const patchGrace = (patch: Partial<AiAgentGraceRule>) => {
    const base: AiAgentGraceRule = graceRule ?? {
      enabled: true,
      seconds: DEFAULT_GRACE_SECONDS,
      destinationType: "lastUser",
    };
    const next = { ...base, ...patch };
    lastWrittenSecondsRef.current = next.seconds;
    emitCloseRules(selectedReasons, next);
  };

  const toggleGrace = (checked: boolean) => {
    if (!checked) {
      // Desligar NUNCA apaga os motivos — e preserva a configuração para quem
      // religar no mesmo save.
      emitCloseRules(
        selectedReasons,
        graceRule ? { ...graceRule, enabled: false } : null
      );
      return;
    }
    const seconds = graceRule?.seconds ?? DEFAULT_GRACE_SECONDS;
    setGraceUnit(deriveGraceUnit(seconds));
    lastWrittenSecondsRef.current = seconds;
    emitCloseRules(selectedReasons, {
      enabled: true,
      seconds,
      destinationType: graceRule?.destinationType ?? "lastUser",
      queueId: graceRule?.queueId ?? null,
      userId: graceRule?.userId ?? null,
      chatFlowId: graceRule?.chatFlowId ?? null,
    });
  };

  const graceDisplayValue = Math.max(
    1,
    Math.round(graceSeconds / UNIT_SECONDS[graceUnit])
  );

  const changeGraceUnit = (unit: GraceUnit) => {
    setGraceUnit(unit);
    patchGrace({ seconds: clampGraceSeconds(graceDisplayValue * UNIT_SECONDS[unit]) });
  };

  const changeGraceValue = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const value = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    patchGrace({ seconds: clampGraceSeconds(value * UNIT_SECONDS[graceUnit]) });
  };

  const graceFlowOptions = flowOptionsFor(graceRule?.chatFlowId);
  const canPickGraceFlow = canPickFlow || graceRule?.destinationType === "chatflow";

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ai-agent-routing-enabled">{t("routingEnabled")}</Label>
          <Switch
            id="ai-agent-routing-enabled"
            checked={routingEnabled}
            onCheckedChange={onRoutingEnabledChange}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("routingNote")}</p>
      </div>

      {routingEnabled && (
        <div className="space-y-3">
          {targets.length === 0 && (
            <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm font-medium">{t("targetsEmpty")}</p>
              <p className="text-xs text-muted-foreground">
                {t("targetsEmptyWarning")}
              </p>
            </div>
          )}
          {targets.map((target, index) => {
            // A opção "Fluxo" aparece quando o servidor executa o destino — e
            // também num destino JÁ GRAVADO como fluxo, para ele não sumir.
            const showFlowType = supportsRoutingV5 || target.type === "chatflow";
            const targetFlowOptions = flowOptionsFor(target.chatFlowId, target.label);
            // Mesma regra para "Outro agente de IA" (v6): aparece quando o
            // servidor executa o destino, ou quando ele já está gravado.
            const isAiAgentTarget = target.type === "ai_agent";
            const showAiAgentType = supportsAgentHandoff || isAiAgentTarget;
            const targetAiAgentOptions = isAiAgentTarget
              ? aiAgentOptionsFor(target.aiAgentId, target.label)
              : [];
            return (
            <div key={target.key || index} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("targetItemTitle", { index: index + 1 })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeTarget(index)}
                  aria-label={t("removeTarget")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>
                    {t("targetLabel")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={target.label}
                    onChange={e => updateTarget(index, { label: e.target.value })}
                    placeholder={t("targetLabelPlaceholder")}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("targetType")}</Label>
                  <Select
                    value={target.type}
                    onValueChange={value =>
                      changeTargetType(index, value as AiAgentRoutingTargetType)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="queue">{t("targetTypeQueue")}</SelectItem>
                      <SelectItem value="user">{t("targetTypeUser")}</SelectItem>
                      {showFlowType && (
                        <SelectItem value="chatflow" disabled={!canPickFlow}>
                          {t("targetTypeFlow")}
                        </SelectItem>
                      )}
                      {showAiAgentType && (
                        <SelectItem value="ai_agent" disabled={!canPickAiAgent}>
                          <span className="flex items-center gap-1.5">
                            <Bot className="h-3.5 w-3.5 shrink-0" />
                            {t("targetTypeAiAgent")}
                          </span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  {target.type === "queue" ? (
                    <>
                      <Label>
                        {t("targetQueue")} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={target.queueId ? String(target.queueId) : ""}
                        onValueChange={value => updateTarget(index, { queueId: Number(value) })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("targetSelectQueue")} />
                        </SelectTrigger>
                        <SelectContent>
                          {queues.map(queue => (
                            <SelectItem key={queue.id} value={String(queue.id)}>
                              {queue.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : target.type === "chatflow" ? (
                    <>
                      <Label>
                        {t("targetTypeFlow")} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={target.chatFlowId ? String(target.chatFlowId) : ""}
                        onValueChange={value =>
                          updateTarget(index, { chatFlowId: Number(value) })
                        }
                        disabled={targetFlowOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("targetSelectFlow")} />
                        </SelectTrigger>
                        <SelectContent>
                          {targetFlowOptions.map(flow => (
                            <SelectItem key={flow.id} value={String(flow.id)}>
                              {flow.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : isAiAgentTarget ? (
                    // Ramo próprio (v6): sem ele o tipo novo cairia no seletor
                    // de ATENDENTE abaixo e gravaria um `userId` no destino.
                    <>
                      <Label>
                        {t("targetAiAgentField")} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={target.aiAgentId ? String(target.aiAgentId) : ""}
                        onValueChange={value => chooseAiAgent(index, Number(value))}
                        disabled={targetAiAgentOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("targetSelectAiAgent")} />
                        </SelectTrigger>
                        <SelectContent>
                          {targetAiAgentOptions.map(agent => (
                            <SelectItem key={agent.id} value={String(agent.id)}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <>
                      <Label>
                        {t("targetUser")} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={target.userId ? String(target.userId) : ""}
                        onValueChange={value => updateTarget(index, { userId: Number(value) })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("targetSelectUser")} />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map(user => (
                            <SelectItem key={user.id} value={String(user.id)}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
              </div>
              {target.type === "chatflow" && (
                <p className="text-xs text-muted-foreground">{t("targetFlowNote")}</p>
              )}
              {isAiAgentTarget && (
                <p className="text-xs text-muted-foreground">{t("targetAiAgentNote")}</p>
              )}
              <div className="space-y-1.5">
                <Label>
                  {t("targetDescription")} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  rows={2}
                  value={target.description}
                  onChange={e => updateTarget(index, { description: e.target.value })}
                  placeholder={t("targetDescriptionPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("targetDescriptionHint")}</p>
              </div>
              {/* Para outro agente de IA não há despedida: quem responde, na
                  mesma mensagem, é o agente escolhido — o campo não vale ali. */}
              {!isAiAgentTarget && (
                <div className="space-y-1.5">
                  <Label>{t("targetTransferMessage")}</Label>
                  <Textarea
                    rows={2}
                    value={target.transferMessage || ""}
                    onChange={e =>
                      updateTarget(index, { transferMessage: e.target.value })
                    }
                    placeholder={t("targetTransferMessagePlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("targetTransferMessageHint")}
                  </p>
                </div>
              )}
            </div>
            );
          })}
          {/* Motivo de a opção "Fluxo" estar desabilitada — uma vez, não por
              destino, para não virar parede de texto com vários cartões. */}
          {flowTypeBlockedNote && (
            <p className="text-xs text-muted-foreground">{flowTypeBlockedNote}</p>
          )}
          {aiAgentTypeBlockedNote && (
            <p className="text-xs text-muted-foreground">{aiAgentTypeBlockedNote}</p>
          )}
          <Button type="button" variant="outline" onClick={addTarget} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("addTarget")}
          </Button>
        </div>
      )}

      <div className="space-y-1.5 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ai-agent-auto-summary">{t("autoSummary")}</Label>
          <Switch
            id="ai-agent-auto-summary"
            checked={autoSummaryEnabled}
            onCheckedChange={onAutoSummaryEnabledChange}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("autoSummaryNote")}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("transferMessage")}</Label>
        <Textarea
          rows={2}
          value={transferMessage}
          onChange={e => onTransferMessageChange(e.target.value)}
          placeholder={t("transferMessagePlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("transferMessageHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("fallbackQueue")}</Label>
        <Select
          value={fallbackQueueId ? String(fallbackQueueId) : "none"}
          onValueChange={value =>
            onFallbackQueueIdChange(value === "none" ? null : Number(value))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("fallbackQueueNone")}</SelectItem>
            {queues.map(queue => (
              <SelectItem key={queue.id} value={String(queue.id)}>
                {queue.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("fallbackQueueNote")}</p>
      </div>

      {showCloseSections && (
        <>
          {/* ── Ao encerrar: motivos que a IA pode escolher ───────────────── */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">{t("closeSectionTitle")}</p>
            <div className="space-y-1.5">
              <Label>{t("closeReasonsLabel")}</Label>
              {reasonOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("closeReasonsEmpty")}</p>
              ) : (
                <>
                  <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">
                    {reasonOptions.map(reason => {
                      const checked = selectedReasons.some(item => item.id === reason.id);
                      const blocked =
                        !checked && selectedReasons.length >= MAX_CLOSE_REASONS;
                      return (
                        <div key={reason.id} className="flex items-start gap-2">
                          <Checkbox
                            id={`ai-agent-close-reason-${reason.id}`}
                            className="mt-0.5"
                            checked={checked}
                            disabled={blocked}
                            onCheckedChange={value =>
                              toggleReason(reason, value === true)
                            }
                          />
                          <Label
                            htmlFor={`ai-agent-close-reason-${reason.id}`}
                            className="cursor-pointer break-words text-sm font-normal leading-snug"
                          >
                            {reason.name}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("closeReasonsNote")}</p>
                  {selectedReasons.length >= MAX_CLOSE_REASONS && (
                    <p className="text-xs text-muted-foreground">
                      {t("closeReasonsLimit")}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Carência depois da transferência para um atendente ────────── */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">{t("graceSectionTitle")}</p>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-agent-grace-enabled">{t("graceEnable")}</Label>
              <Switch
                id="ai-agent-grace-enabled"
                checked={graceEnabled}
                onCheckedChange={toggleGrace}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("graceNote")}</p>

            {graceEnabled && graceRule && (
              <div className="space-y-3 pt-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-agent-grace-time">{t("graceTime")}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="ai-agent-grace-time"
                        type="number"
                        className="w-24"
                        min={1}
                        max={graceUnit === "hours" ? 24 : 1440}
                        value={graceDisplayValue}
                        onChange={e => changeGraceValue(e.target.value)}
                      />
                      <Select
                        value={graceUnit}
                        onValueChange={value => changeGraceUnit(value as GraceUnit)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">{t("graceUnitMinutes")}</SelectItem>
                          <SelectItem value="hours">{t("graceUnitHours")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("graceDestination")}</Label>
                    <Select
                      value={graceRule.destinationType}
                      onValueChange={value =>
                        patchGrace({
                          destinationType: value as AiAgentGraceDestinationType,
                          queueId: null,
                          userId: null,
                          chatFlowId: null,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lastUser">{t("graceDestLastUser")}</SelectItem>
                        <SelectItem value="closedUser">{t("graceDestClosedUser")}</SelectItem>
                        <SelectItem value="queue">{t("graceDestQueue")}</SelectItem>
                        <SelectItem value="user">{t("graceDestUser")}</SelectItem>
                        {canPickGraceFlow && (
                          <SelectItem value="chatflow" disabled={!canPickFlow}>
                            {t("graceDestFlow")}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {graceRule.destinationType === "queue" && (
                  <div className="space-y-1.5">
                    <Label>{t("targetQueue")}</Label>
                    <Select
                      value={graceRule.queueId ? String(graceRule.queueId) : ""}
                      onValueChange={value => patchGrace({ queueId: Number(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("targetSelectQueue")} />
                      </SelectTrigger>
                      <SelectContent>
                        {queues.map(queue => (
                          <SelectItem key={queue.id} value={String(queue.id)}>
                            {queue.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {graceRule.destinationType === "user" && (
                  <div className="space-y-1.5">
                    <Label>{t("targetUser")}</Label>
                    <Select
                      value={graceRule.userId ? String(graceRule.userId) : ""}
                      onValueChange={value => patchGrace({ userId: Number(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("targetSelectUser")} />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map(user => (
                          <SelectItem key={user.id} value={String(user.id)}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {graceRule.destinationType === "chatflow" && (
                  <div className="space-y-1.5">
                    <Label>{t("targetTypeFlow")}</Label>
                    <Select
                      value={graceRule.chatFlowId ? String(graceRule.chatFlowId) : ""}
                      onValueChange={value => patchGrace({ chatFlowId: Number(value) })}
                      disabled={graceFlowOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("targetSelectFlow")} />
                      </SelectTrigger>
                      <SelectContent>
                        {graceFlowOptions.map(flow => (
                          <SelectItem key={flow.id} value={String(flow.id)}>
                            {flow.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {flowTypeBlockedNote && (
                      <p className="text-xs text-muted-foreground">{flowTypeBlockedNote}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
