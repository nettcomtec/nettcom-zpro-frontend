"use client";

import { Fragment, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  AI_AGENT_ACTION_TYPES_V5,
  type AiAgentAction,
  type AiAgentActionType,
  type AiAgentMemoryField,
} from "@/services/ai-agents";

// Teto espelhado do backend (AgentActionsZPRO / AgentMemoryZPRO): o que passar
// disso o servidor corta em silêncio, então a tela já não deixa criar.
// Eram 5 ações até a v4 — com os 4 tipos novos o espelho dos dois lados é 10.
export const MAX_AGENT_ACTIONS = 10;
export const MAX_MEMORY_FIELDS = 10;

// Tetos de campo espelhados do sanitizador do servidor: o que passar é cortado
// lá e o admin veria na tela um texto diferente do que ficou gravado.
const MAX_LABEL = 80;
const MAX_DESCRIPTION = 200;
const MAX_ACTION_MESSAGE = 1000;
const MAX_CONTENT = 1000;
const MAX_OPPORTUNITY_NAME = 120;

// Mesmo formato que o servidor aceita para o nome do dado (letra ou "_" no
// começo, sem espaço e sem acento). Nome fora disso seria descartado lá e o
// campo sumiria da tela sem explicação nenhuma.
// Exportada porque o dialog revalida no save: duas cópias do mesmo formato
// acabariam divergindo e a tela aceitaria o que o servidor recusa.
export const MEMORY_FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Espelho de RESERVED_FIELD_NAMES (AgentMemoryZPRO): propriedades de Object
// que o servidor descarta. Comparadas como ele compara — minúsculo e sem "_"
// nas pontas ("__proto__" vira "proto").
const RESERVED_MEMORY_FIELD_NAMES = new Set([
  "constructor", "prototype", "proto", "hasownproperty", "tostring", "valueof",
]);

// Mesma normalização do servidor (normalizeFieldName): corta em 40, tira
// acento, minúsculo, o que não for letra/número/_ vira "_", sem "_" nas pontas
// e "_" na frente de nome que começa com número. Aplicada ao sair do campo e no
// save, para o nome na tela ser exatamente o que fica gravado (decisão de
// 13/09). Nome que não sobra nada volta como veio, para o erro da linha aparecer.
export const normalizeMemoryFieldName = (name: string): string => {
  const raw = (name || "").trim();
  let slug = raw
    .slice(0, 40)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!slug) return raw;
  if (/^[0-9]/.test(slug)) slug = `_${slug}`.slice(0, 40);
  return slug;
};

// Valida o nome JÁ normalizado: "Cidade Natal" é aceito (vira cidade_natal);
// só é inválido o que o servidor descartaria mesmo depois de normalizar.
export const isValidMemoryFieldName = (name: string): boolean => {
  const normalized = normalizeMemoryFieldName(name);
  if (!MEMORY_FIELD_NAME_RE.test(normalized)) return false;
  return !RESERVED_MEMORY_FIELD_NAMES.has(normalized.toLowerCase().replace(/^_+|_+$/g, ""));
};

// Chave estável da ação: é o identificador que o agente devolve ao decidir
// executá-la; gerada uma vez ao adicionar e preservada em toda edição.
export const generateActionKey = (): string =>
  `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Grupos do seletor de tipo. A ordem aqui é a ordem na tela.
const ACTION_TYPE_GROUPS: Array<{ labelKey: string; types: AiAgentActionType[] }> = [
  { labelKey: "actionGroupQualify", types: ["tag", "kanban", "opportunity"] },
  { labelKey: "actionGroupTeam", types: ["note", "notify"] },
  { labelKey: "actionGroupEnd", types: ["block"] },
];

const ACTION_TYPE_LABEL_KEY: Record<AiAgentActionType, string> = {
  tag: "actionTypeTag",
  kanban: "actionTypeKanban",
  opportunity: "actionTypeOpportunity",
  note: "actionTypeNote",
  notify: "actionTypeNotify",
  block: "actionTypeBlock",
};

// Por que o tipo está desabilitado. O mesmo texto aparece no menu, embaixo da
// opção cinza (sem ele não havia como saber o motivo), e embaixo do seletor
// quando o card já está nesse tipo.
const TYPE_DISABLED_HINT_KEY: Partial<Record<AiAgentActionType, string>> = {
  tag: "actionTagsEmpty",
  kanban: "actionKanbansEmpty",
  opportunity: "actionPipelinesEmpty",
  block: "actionBlockNeedsFallback",
};

// Tipos que aceitam o texto que o próprio modelo escreve junto da ação.
const TYPES_WITH_AI_TEXT: AiAgentActionType[] = ["opportunity", "note", "notify", "block"];

const NOTIFY_NO_QUEUE = "__none";

interface AgentActionsTabProps {
  actions: AiAgentAction[];
  onActionsChange: (actions: AiAgentAction[]) => void;
  actionMessage: string;
  onActionMessageChange: (value: string) => void;
  memoryEnabled: boolean;
  onMemoryEnabledChange: (value: boolean) => void;
  memoryFields: AiAgentMemoryField[];
  onMemoryFieldsChange: (fields: AiAgentMemoryField[]) => void;
  // Listas carregadas com fail-open no dialog: vazia significa só que aquele
  // tipo de ação fica sem destino — o resto da aba continua funcionando
  tags: Array<{ id: number; name: string }>;
  kanbans: Array<{ id: number; name: string }>;
  queues: Array<{ id: number; name: string }>;
  users: Array<{ id: number; name: string }>;
  pipelines: Array<{ id: number; name: string }>;
  stages: Array<{ id: number; name: string; pipelineId: number }>;
  // O dialog carrega as etapas do funil escolhido sob demanda
  onPipelineSelected: (pipelineId: number) => void;
  // Card "parar a IA" exige fila de emergência: sem ela o servidor recusa o
  // save com 400, e o atendimento ficaria pendente sem fila (B14)
  hasFallbackQueue: boolean;
  // O servidor anuncia em engineFeatures o que sabe executar: sem "actionsV5"
  // os 4 tipos novos não são oferecidos (backend antigo não os executaria)
  supportsV5: boolean;
}

export function AgentActionsTab({
  actions,
  onActionsChange,
  actionMessage,
  onActionMessageChange,
  memoryEnabled,
  onMemoryEnabledChange,
  memoryFields,
  onMemoryFieldsChange,
  tags,
  kanbans,
  queues,
  users,
  pipelines,
  stages,
  onPipelineSelected,
  hasFallbackQueue,
  supportsV5,
}: AgentActionsTabProps) {
  const t = useTranslations("aiAgents");

  // ── Ações ────────────────────────────────────────────────────────────────

  const updateAction = (index: number, patch: Partial<AiAgentAction>) => {
    onActionsChange(
      actions.map((action, i) => (i === index ? { ...action, ...patch } : action))
    );
  };

  const removeAction = (index: number) => {
    onActionsChange(actions.filter((_, i) => i !== index));
  };

  const addAction = () => {
    if (actions.length >= MAX_AGENT_ACTIONS) return;
    // Nascer num tipo cuja lista de destinos está vazia deixaria o card
    // travado já na criação
    let type: AiAgentActionType = "tag";
    if (tags.length === 0 && kanbans.length > 0) type = "kanban";
    else if (tags.length === 0 && kanbans.length === 0 && supportsV5) type = "note";
    onActionsChange([
      ...actions,
      {
        key: generateActionKey(),
        type,
        label: "",
        description: "",
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
        actionMessage: "",
      },
    ]);
  };

  // Trocar o tipo zera TODOS os campos do tipo anterior E o rótulo: em tag,
  // kanban e oportunidade o rótulo é cópia do nome do destino, então manter o
  // antigo deixaria o card mostrando uma coisa e fazendo outra
  const changeActionType = (index: number, type: AiAgentActionType) => {
    updateAction(index, {
      type,
      label: "",
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
    });
  };

  // O rótulo é o que identifica a ação para o agente e é obrigatório no
  // servidor: copiamos o nome do destino para o admin não digitar duas vezes
  const selectActionDestination = (index: number, id: number) => {
    const action = actions[index];
    if (!action) return;
    const name =
      (action.type === "kanban" ? kanbans : tags).find(item => item.id === id)?.name || "";
    updateAction(
      index,
      action.type === "kanban"
        ? { kanbanId: id, tagId: null, label: name }
        : { tagId: id, kanbanId: null, label: name }
    );
  };

  const selectPipeline = (index: number, pipelineId: number) => {
    // Trocar o funil invalida a etapa (e o rótulo, que vem dela)
    updateAction(index, { pipelineId, stageId: null, label: "" });
    onPipelineSelected(pipelineId);
  };

  // O rótulo da oportunidade deriva da ETAPA escolhida (B18)
  const selectStage = (index: number, stageId: number) => {
    const stage = stages.find(item => item.id === stageId);
    updateAction(index, { stageId, label: stage?.name || "" });
  };

  const toggleNotifyUser = (index: number, userId: number) => {
    const current = actions[index]?.notifyUserIds || [];
    const next = current.includes(userId)
      ? current.filter(id => id !== userId)
      : [...current, userId];
    updateAction(index, { notifyUserIds: next });
  };

  // Card salvo traz o funil, mas as etapas são carregadas sob demanda: sem
  // pedir aqui, a etapa já gravada ficaria para sempre sem nome na tela. O ref
  // garante UM pedido por funil por abertura — lista que volta vazia (funil
  // sem etapa ou falha) não vira laço de requests.
  const requestedPipelines = useRef<Set<number>>(new Set());
  useEffect(() => {
    for (const action of actions) {
      if (action.type !== "opportunity") continue;
      const pipelineId = action.pipelineId;
      if (!pipelineId || requestedPipelines.current.has(pipelineId)) continue;
      if (stages.some(stage => Number(stage.pipelineId) === Number(pipelineId))) continue;
      requestedPipelines.current.add(pipelineId);
      onPipelineSelected(pipelineId);
    }
  }, [actions, stages, onPipelineSelected]);

  // Tipo v5 só aparece quando o servidor anuncia que sabe executá-lo; card JÁ
  // salvo continua mostrando o próprio tipo, para não sumir da tela
  const isTypeVisible = (type: AiAgentActionType, currentType: AiAgentActionType) =>
    !AI_AGENT_ACTION_TYPES_V5.includes(type) || supportsV5 || currentType === type;

  // Lista vazia (nada cadastrado no tenant ou falha ao carregar) desabilita SÓ
  // aquele tipo — o resto da aba continua funcionando
  const isTypeDisabled = (type: AiAgentActionType) => {
    if (type === "tag") return tags.length === 0;
    if (type === "kanban") return kanbans.length === 0;
    if (type === "opportunity") return pipelines.length === 0;
    if (type === "block") return !hasFallbackQueue;
    return false;
  };

  const renderTypeItems = (currentType: AiAgentActionType, idPrefix: string) => {
    const groups = ACTION_TYPE_GROUPS.map(group => ({
      labelKey: group.labelKey,
      types: group.types.filter(type => isTypeVisible(type, currentType)),
    })).filter(group => group.types.length > 0);

    // O aviso fica FORA do SelectItem: tudo que está dentro dele vira o texto
    // do seletor quando a opção é a escolhida, e um card já salvo pode estar
    // num tipo que ficou desabilitado depois
    const renderItem = (type: AiAgentActionType) => {
      const disabled = isTypeDisabled(type);
      const hintKey = disabled ? TYPE_DISABLED_HINT_KEY[type] : undefined;
      const hintId = `${idPrefix}-hint-${type}`;
      return (
        <Fragment key={type}>
          <SelectItem
            value={type}
            disabled={disabled}
            aria-describedby={hintKey ? hintId : undefined}
          >
            {t(ACTION_TYPE_LABEL_KEY[type])}
          </SelectItem>
          {hintKey && (
            <p id={hintId} className="-mt-1 px-2 pb-1.5 text-xs text-muted-foreground">
              {t(hintKey)}
            </p>
          )}
        </Fragment>
      );
    };

    // Servidor sem os tipos novos: um grupo só, e aí o cabeçalho seria ruído —
    // a lista fica idêntica à de hoje
    if (groups.length <= 1) return groups[0]?.types.map(renderItem) || null;

    return groups.map(group => (
      <SelectGroup key={group.labelKey}>
        <SelectLabel>{t(group.labelKey)}</SelectLabel>
        {group.types.map(renderItem)}
      </SelectGroup>
    ));
  };

  // Nota de lista vazia do tipo ATUAL, logo abaixo do seletor
  const renderTypeWarning = (action: AiAgentAction) => {
    const hintKey = isTypeDisabled(action.type)
      ? TYPE_DISABLED_HINT_KEY[action.type]
      : undefined;
    return hintKey ? <p className="text-xs text-destructive">{t(hintKey)}</p> : null;
  };

  // Campo "Nome da ação": obrigatório nos tipos sem destino de onde copiar o
  // rótulo (B18)
  const renderActionNameField = (action: AiAgentAction, index: number) => (
    <div className="space-y-1.5">
      <Label>
        {t("actionName")} <span className="text-destructive">*</span>
      </Label>
      <Input
        value={action.label || ""}
        onChange={e => updateAction(index, { label: e.target.value })}
        placeholder={t("actionNamePh")}
        maxLength={MAX_LABEL}
      />
    </div>
  );

  const renderAiWritesNote = (action: AiAgentAction) =>
    TYPES_WITH_AI_TEXT.includes(action.type) ? (
      <p className="text-xs text-muted-foreground">{t("actionAiWrites")}</p>
    ) : null;

  // Campos próprios de cada tipo. Entram na MESMA grade do seletor de tipo, que
  // ocupa a primeira célula — por isso tag/kanban ficam com o layout de sempre.
  const renderActionFields = (action: AiAgentAction, index: number) => {
    switch (action.type) {
      case "tag":
      case "kanban": {
        const isKanban = action.type === "kanban";
        const destinations = isKanban ? kanbans : tags;
        const destinationId = isKanban ? action.kanbanId : action.tagId;
        return (
          <div className="space-y-1.5">
            <Label>
              {t("actionDestination")} <span className="text-destructive">*</span>
            </Label>
            <Select
              value={destinationId ? String(destinationId) : ""}
              onValueChange={value => selectActionDestination(index, Number(value))}
              disabled={destinations.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={isKanban ? t("actionSelectKanban") : t("actionSelectTag")}
                />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {destinations.map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }

      case "opportunity": {
        const pipelineStages = stages.filter(
          stage => Number(stage.pipelineId) === Number(action.pipelineId)
        );
        return (
          <>
            <div className="space-y-1.5">
              <Label>
                {t("actionPipeline")} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={action.pipelineId ? String(action.pipelineId) : ""}
                onValueChange={value => selectPipeline(index, Number(value))}
                disabled={pipelines.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("actionPipeline")} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {pipelines.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("actionStage")} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={action.stageId ? String(action.stageId) : ""}
                onValueChange={value => selectStage(index, Number(value))}
                disabled={!action.pipelineId}
              >
                <SelectTrigger>
                  {/* Enquanto as etapas do funil não chegam, o rótulo já salvo
                      (que é o nome da etapa) segura o lugar */}
                  <SelectValue placeholder={action.label || t("actionStage")} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {pipelineStages.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("actionResponsible")} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={action.responsibleId ? String(action.responsibleId) : ""}
                onValueChange={value =>
                  updateAction(index, { responsibleId: Number(value) })
                }
                disabled={users.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("actionResponsible")} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {users.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("actionOpportunityName")}</Label>
              <Input
                value={action.opportunityName || ""}
                onChange={e =>
                  updateAction(index, { opportunityName: e.target.value })
                }
                placeholder={t("actionOpportunityNamePh")}
                maxLength={MAX_OPPORTUNITY_NAME}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("actionOpportunityValue")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={
                  action.opportunityValue === null || action.opportunityValue === undefined
                    ? ""
                    : String(action.opportunityValue)
                }
                onChange={e => {
                  const raw = e.target.value;
                  const parsed = Number(raw);
                  updateAction(index, {
                    opportunityValue:
                      raw === "" || Number.isNaN(parsed) || parsed < 0 ? null : parsed,
                  });
                }}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <p className="text-xs text-muted-foreground">{t("actionOpportunityNoDup")}</p>
              {renderAiWritesNote(action)}
            </div>
          </>
        );
      }

      case "note":
        return (
          <>
            {renderActionNameField(action, index)}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("actionNoteContent")}</Label>
              <Textarea
                rows={2}
                value={action.content || ""}
                onChange={e => updateAction(index, { content: e.target.value })}
                placeholder={t("actionNoteContentPh")}
                maxLength={MAX_CONTENT}
              />
              {renderAiWritesNote(action)}
              <p className="text-xs text-muted-foreground">{t("actionNoteLimit")}</p>
            </div>
          </>
        );

      case "notify": {
        const selectedUserIds = action.notifyUserIds || [];
        const hasTarget = !!action.notifyQueueId || selectedUserIds.length > 0;
        return (
          <>
            {renderActionNameField(action, index)}

            <div className="space-y-1.5">
              <Label>{t("actionNotifyQueue")}</Label>
              <Select
                value={
                  action.notifyQueueId ? String(action.notifyQueueId) : NOTIFY_NO_QUEUE
                }
                onValueChange={value =>
                  updateAction(index, {
                    notifyQueueId: value === NOTIFY_NO_QUEUE ? null : Number(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value={NOTIFY_NO_QUEUE}>{t("fallbackQueueNone")}</SelectItem>
                  {queues.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {users.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("actionNotifyUsers")}</Label>
                <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-md border p-2">
                  {users.map(user => {
                    const inputId = `ai-agent-notify-${action.key || index}-u${user.id}`;
                    return (
                      <div key={user.id} className="flex items-center gap-2">
                        <Checkbox
                          id={inputId}
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={() => toggleNotifyUser(index, user.id)}
                        />
                        <label
                          htmlFor={inputId}
                          className="cursor-pointer truncate text-xs"
                        >
                          {user.name}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                {t("actionNotifyMessage")} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={2}
                value={action.content || ""}
                onChange={e => updateAction(index, { content: e.target.value })}
                maxLength={MAX_CONTENT}
              />
              {renderAiWritesNote(action)}
              <p className="text-xs text-muted-foreground">{t("actionNotifyOnce")}</p>
              {!hasTarget && (
                <p className="text-xs text-destructive">{t("actionNotifyNoTarget")}</p>
              )}
            </div>
          </>
        );
      }

      case "block":
        return (
          <>
            {renderActionNameField(action, index)}
            <div className="space-y-1 sm:col-span-2">
              <p className="text-xs text-muted-foreground">{t("actionBlockNote")}</p>
              {renderAiWritesNote(action)}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  // ── Dados a registrar ────────────────────────────────────────────────────

  const updateMemoryField = (index: number, patch: Partial<AiAgentMemoryField>) => {
    onMemoryFieldsChange(
      memoryFields.map((field, i) => (i === index ? { ...field, ...patch } : field))
    );
  };

  const removeMemoryField = (index: number) => {
    onMemoryFieldsChange(memoryFields.filter((_, i) => i !== index));
  };

  const addMemoryField = () => {
    if (memoryFields.length >= MAX_MEMORY_FIELDS) return;
    onMemoryFieldsChange([...memoryFields, { name: "", description: "" }]);
  };

  // Linha sem nome é rascunho (o dialog a descarta no save); só o nome
  // preenchido e fora do formato vira erro visível
  const isMemoryNameInvalid = (name: string) => {
    const trimmed = (name || "").trim();
    return trimmed.length > 0 && !isValidMemoryFieldName(trimmed);
  };

  return (
    <div className="space-y-5">
      {/* ── Ações: o agente qualifica o contato durante a conversa ───────── */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("actionsTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("actionsTabIntro")}</p>
        </div>

        {actions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("actionsEmpty")}</p>
        )}

        {actions.map((action, index) => (
          <div key={action.key || index} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t("actionItemTitle", { index: index + 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => removeAction(index)}
                aria-label={t("removeAction")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("actionType")}</Label>
                <Select
                  value={action.type}
                  onValueChange={value =>
                    changeActionType(index, value as AiAgentActionType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {renderTypeItems(action.type, `ai-agent-action-${action.key || index}`)}
                  </SelectContent>
                </Select>
                {renderTypeWarning(action)}
              </div>

              {renderActionFields(action, index)}
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("actionWhen")} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={2}
                value={action.description}
                onChange={e => updateAction(index, { description: e.target.value })}
                placeholder={t("actionWhenPlaceholder")}
                maxLength={MAX_DESCRIPTION}
              />
              <p className="text-xs text-muted-foreground">{t("actionWhenHint")}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t("actionMessage")}</Label>
              <Input
                value={action.actionMessage || ""}
                onChange={e => updateAction(index, { actionMessage: e.target.value })}
                placeholder={t("actionMessagePlaceholder")}
                maxLength={MAX_ACTION_MESSAGE}
              />
              <p className="text-xs text-muted-foreground">{t("actionMessageHint")}</p>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addAction}
          className="gap-1.5"
          disabled={actions.length >= MAX_AGENT_ACTIONS}
        >
          <Plus className="h-4 w-4" />
          {t("addAction")}
        </Button>
        {actions.length >= MAX_AGENT_ACTIONS && (
          <p className="text-xs text-muted-foreground">
            {t("actionsMax", { max: MAX_AGENT_ACTIONS })}
          </p>
        )}

        {/* Texto de reserva: vale para qualquer ação que o agente execute sem
            escrever nada junto — evita ação muda para o cliente */}
        <div className="space-y-1.5">
          <Label>{t("actionMessageDefault")}</Label>
          <Input
            value={actionMessage}
            onChange={e => onActionMessageChange(e.target.value)}
            placeholder={t("actionMessageDefaultPlaceholder")}
            maxLength={MAX_ACTION_MESSAGE}
          />
          <p className="text-xs text-muted-foreground">{t("actionMessageDefaultHint")}</p>
        </div>
      </div>

      {/* ── Dados a registrar na ficha do contato ─────────────────────────── */}
      <div className="space-y-3 border-t pt-5">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("memoryTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("memoryNote")}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ai-agent-memory-enabled">{t("memoryEnabled")}</Label>
            <Switch
              id="ai-agent-memory-enabled"
              checked={memoryEnabled}
              onCheckedChange={onMemoryEnabledChange}
            />
          </div>
          {/* Limitação conhecida: quem abrir a ficha do contato antes e salvar
              depois sobrescreve o que o agente anotou no meio-tempo */}
          <p className="text-xs text-muted-foreground">{t("memoryPanelNote")}</p>
        </div>

        {memoryEnabled && (
          <div className="space-y-2">
            {memoryFields.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("memoryEmpty")}</p>
            )}

            {memoryFields.map((field, index) => {
              const invalidName = isMemoryNameInvalid(field.name);
              return (
                <div key={index} className="space-y-1">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-center">
                    <Input
                      value={field.name}
                      onChange={e => updateMemoryField(index, { name: e.target.value })}
                      onBlur={e =>
                        updateMemoryField(index, {
                          name: normalizeMemoryFieldName(e.target.value),
                        })
                      }
                      placeholder={t("memoryFieldNamePlaceholder")}
                      aria-label={t("memoryFieldName")}
                      aria-invalid={invalidName}
                      className={invalidName ? "border-destructive" : undefined}
                      maxLength={40}
                    />
                    <Input
                      value={field.description || ""}
                      onChange={e =>
                        updateMemoryField(index, { description: e.target.value })
                      }
                      placeholder={t("memoryFieldDescriptionPlaceholder")}
                      aria-label={t("memoryFieldDescription")}
                      maxLength={200}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeMemoryField(index)}
                        aria-label={t("removeMemoryField")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {invalidName && (
                    <p className="text-xs text-destructive">{t("memoryFieldInvalidName")}</p>
                  )}
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              onClick={addMemoryField}
              className="gap-1.5"
              disabled={memoryFields.length >= MAX_MEMORY_FIELDS}
            >
              <Plus className="h-4 w-4" />
              {t("addMemoryField")}
            </Button>
            {memoryFields.length >= MAX_MEMORY_FIELDS && (
              <p className="text-xs text-muted-foreground">
                {t("memoryMax", { max: MAX_MEMORY_FIELDS })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
