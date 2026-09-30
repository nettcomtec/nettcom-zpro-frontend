import type { Node, Edge } from "@xyflow/react";
import type { FlowData, FlowNodeData, FlowInteraction, FlowCondition } from "./types";

export interface ReactFlowState {
  nodes: Node[];
  edges: Edge[];
}

function parsePosition(left?: string, top?: string) {
  return {
    x: parseInt(left ?? "0", 10) || 0,
    y: parseInt(top ?? "0", 10) || 0,
  };
}

// ─── legado → React compatibility layer ────────────────────────────────────────
// The legacy flow builder uses PascalCase "XxxField" type names and a different
// condition structure. This normaliser converts old format to the React format
// transparently so flows exported from the legacy app can be opened in the React app.

const VUE_INTERACTION_TYPE_MAP: Record<string, FlowInteraction["type"]> = {
  MessageField: "message",
  MediaField: "media",
  DelayField: "delay",
  ChatGPTField: "chatgpt",
  ChatgptField: "chatgpt",
  AgentField: "agent",
  TypebotField: "typebot",
  N8nField: "n8n",
  TagField: "tag",
  KanbanField: "kanban",
  ChatBotBlockField: "chatBotBlock",
  WebhookField: "webhook",
  WebhookAllField: "webhookAll",
  // Sub-fluxo: aceitar as DUAS grafias. O export (REACT_INTERACTION_TYPE_MAP)
  // grava "ChatFlowField" (F maiúsculo); sem esta entrada o round-trip
  // salvar→reabrir não re-normaliza e o campo degrada para o input "Valor"
 // genérico. "ChatflowField" (f minúsculo) mantido para dados legados do front legado.
  // Backend confirma ambas em BuildSendMessageService (msg.type === "ChatFlowField" || "ChatflowField").
  ChatFlowField: "chatflow",
  ChatflowField: "chatflow",
  OpportunityField: "opportunity",
  GoogleAgendaField: "googleAgenda",
  ButtonField: "button",
  ListField: "list",
  PixButtonField: "pixButton",
  TransferField: "transfer",
  CarenciaField: "carencia",
  ContactField: "contact",
  LocationField: "location",
  StickerField: "sticker",
  VideoLinkField: "videoLink",
  ScheduleField: "schedule",
  ReasonsField: "reasons",
  SmsField: "sms",
  VapiField: "vapi",
  NotesField: "notes",
  AppointmentField: "appointment",
  TemplateField: "template",
  NotifyField: "notify",
  // Contrato do backend (PLANO_WABA_HIBRIDO_PINGPONG F4): o type persistido é
  // exatamente "SwitchChannel" — sem sufixo "Field". Identidade explícita.
  SwitchChannel: "SwitchChannel",
};

function normaliseInteraction(raw: Record<string, unknown>): FlowInteraction {
  const rawType = raw.type as string;
  const type: FlowInteraction["type"] =
    (VUE_INTERACTION_TYPE_MAP[rawType] as FlowInteraction["type"]) ??
    (rawType as FlowInteraction["type"]);
  return {
    id: (raw.id as string) ?? `int-${Math.random().toString(36).slice(2)}`,
    type,
    data: (raw.data as Record<string, unknown>) ?? {},
  };
}

function normaliseCondition(raw: Record<string, unknown>): FlowCondition {
 // The legacy front stores the comparison operator in `comparisonType` and the routing type
  // in `type` ("R" = reply-based, "US" = any reply).
  // React collapses both into a single `type` field and stores the match value
 // as a string (front legado uses an array called `condition`).
  const vueType = (raw.type as string) ?? "US";
  const comparisonType = (raw.comparisonType as string) ?? "";
  const conditionArr = Array.isArray(raw.condition) ? (raw.condition as string[]) : [];

  let type: FlowCondition["type"];
  if (vueType === "US") {
    type = "US";
  } else if (vueType === "R") {
 // Map legacy comparisonType → React condition type
    const mapping: Record<string, FlowCondition["type"]> = {
      equals: "equals",
      contains: "contains",
      startsWith: "startsWith",
      endsWith: "endsWith",
      regex: "regex",
    };
    // "R" with no comparisonType = numbered-option match → treat as "equals"
    type = mapping[comparisonType] ?? "equals";
  } else {
    type = vueType as FlowCondition["type"];
  }

  return {
    id: (raw.id as string) ?? `cond-${Math.random().toString(36).slice(2)}`,
    // Routing action: 0=step, 1=queue, 2=user, 3=close, 4=channel
    action: raw.action !== undefined ? (raw.action as number) : 0,
    nextStepId: (raw.nextStepId as string) ?? "",
    queueId: (raw.queueId as string) || undefined,
    userIdDestination: (raw.userIdDestination as string) || undefined,
    closeTicket: (raw.closeTicket as string) || undefined,
    channelDestination: (raw.channelDestination as string) || undefined,
    type,
    condition: conditionArr,
    value: conditionArr.join(",") || ((raw.value as string) ?? ""),
    comparisonType: comparisonType || undefined,
 // timeTable (type "T") fields — preservados no round-trip legado/React
    weekdays: Array.isArray(raw.weekdays) ? (raw.weekdays as number[]) : undefined,
    startTime: (raw.startTime as string) || undefined,
    endTime: (raw.endTime as string) || undefined,
    variableKey: (raw.variableKey as string) || undefined,
  };
}

// ─── React → legacy compatibility layer (for saving) ───────────────────────────
// When saving, we must produce the legacy/backend format so existing backend logic
// continues to work unchanged.

const REACT_INTERACTION_TYPE_MAP: Record<string, string> = {
  message: "MessageField",
  media: "MediaField",
  delay: "DelayField",
  chatgpt: "ChatGPTField",
  agent: "AgentField",
  typebot: "TypebotField",
  n8n: "N8nField",
  tag: "TagField",
  kanban: "KanbanField",
  chatBotBlock: "ChatBotBlockField",
  webhook: "WebhookField",
  webhookAll: "WebhookAllField",
  chatflow: "ChatFlowField",
  opportunity: "OpportunityField",
  googleAgenda: "GoogleAgendaField",
  button: "ButtonField",
  list: "ListField",
  pixButton: "PixButtonField",
  transfer: "TransferField",
  carencia: "CarenciaField",
  contact: "ContactField",
  location: "LocationField",
  sticker: "StickerField",
  videoLink: "VideoLinkField",
  schedule: "ScheduleField",
  reasons: "ReasonsField",
  sms: "SmsField",
  vapi: "VapiField",
  notes: "NotesField",
  appointment: "AppointmentField",
  template: "TemplateField",
  notify: "NotifyField",
  // Serializa exatamente como "SwitchChannel" (contrato do executor no backend).
  SwitchChannel: "SwitchChannel",
};

// Comparison types that map to legacy type "R"
const COMPARISON_TYPES = new Set(["equals", "contains", "startsWith", "endsWith", "regex"]);

function denormaliseInteraction(i: FlowInteraction): Record<string, unknown> {
  return {
    id: i.id,
    type: REACT_INTERACTION_TYPE_MAP[i.type] ?? i.type,
    data: i.data,
  };
}

function denormaliseCondition(c: FlowCondition): Record<string, unknown> {
  const action = c.action ?? 0;
  const base: Record<string, unknown> = {
    id: c.id,
    action,
    nextStepId: c.nextStepId,
    queueId: c.queueId,
    userIdDestination: c.userIdDestination,
    closeTicket: c.closeTicket,
    channelDestination: c.channelDestination,
    variableKey: c.variableKey,
  };

  // timeTable (type "T") — preserva weekdays/startTime/endTime; sem `condition` array
  if (c.type === "T") {
    return {
      ...base,
      type: "T",
      weekdays: Array.isArray(c.weekdays) ? c.weekdays : [],
      startTime: c.startTime ?? "",
      endTime: c.endTime ?? "",
    };
  }

 // React "US" → legacy type "US", condition []
  if (c.type === "US") {
    return { ...base, type: "US", comparisonType: "", condition: [], value: c.value };
  }

 // Automático (auto-avanço) → front legado type "A"; condition [] garante que canais
  // sem plumb do resolver não quebrem no matcher legado (que itera o array)
  if (c.type === "A") {
    return { ...base, type: "A", comparisonType: "", condition: [], value: "" };
  }

 // React comparison types → legacy type "R" + comparisonType
  if (COMPARISON_TYPES.has(c.type)) {
    const condArr = c.condition?.length ? c.condition : (c.value ? c.value.split(",") : []);
    return {
      ...base,
      type: "R",
      comparisonType: c.type,
      condition: condArr,
      value: condArr.join(","),
    };
  }

 // Already in the legacy front "R" format or unknown type — pass through
  const condArr = c.condition?.length ? c.condition : (c.value ? c.value.split(",") : []);
  return {
    ...base,
    type: c.type,
    comparisonType: c.comparisonType ?? "",
    condition: condArr,
    value: condArr.join(","),
  };
}

/**
 * Denormalise a FlowData object from React format back to the legacy/backend
 * format (PascalCase interaction types, condition array, etc.) before saving.
 */
export function denormaliseFlowData(flowData: FlowData): FlowData {
  return {
    ...flowData,
    nodeList: (flowData.nodeList ?? []).map((node) => {
 // start and configurations nodes don't have interactions/conditions/actions in legacy format.
 // We strip them here so the saved JSON matches the legacy ccFlowBuilder output exactly.
      if (node.type === "start" || node.type === "configurations") {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { interactions: _i, conditions: _c, actions: _a, ...rest } = node;
        return rest as unknown as FlowNodeData;
      }
      // timeTable: nunca tem interactions (backend força [] no Validate). Conditions
      // preservadas via denormaliseCondition que trata type "T".
      if (node.type === "timeTable") {
        return {
          ...node,
          interactions: [],
          conditions: (node.conditions ?? []).map((c) =>
            denormaliseCondition(c) as unknown as FlowCondition
          ),
        };
      }
      return {
        ...node,
        interactions: (node.interactions ?? []).map((i) =>
          denormaliseInteraction(i) as unknown as FlowInteraction
        ),
        conditions: (node.conditions ?? []).map((c) =>
          denormaliseCondition(c) as unknown as FlowCondition
        ),
      };
    }),
  };
}

/**
 * Normalise a raw FlowData object that may have been exported from the legacy front
 * flow builder, converting interaction types and condition shapes to the React
 * format expected by node-form and flow-adapter.
 */
export function normaliseFlowData(flowData: FlowData): FlowData {
  return {
    ...flowData,
    nodeList: (flowData.nodeList ?? []).map((node) => ({
      ...node,
      interactions: (node.interactions ?? []).map((i) =>
        normaliseInteraction(i as unknown as Record<string, unknown>)
      ),
      conditions: (node.conditions ?? []).map((c) =>
        normaliseCondition(c as unknown as Record<string, unknown>)
      ),
    })),
  };
}

export function convertToReactFlow(flowData: FlowData): ReactFlowState {
  const normalised = normaliseFlowData(flowData);
  const nodeList = normalised.nodeList ?? [];
  const lineList = normalised.lineList ?? [];

  const nodes: Node[] = nodeList.map((n) => ({
    id: n.id,
    type: "flowNode",
    position: parsePosition(n.left, n.top),
    // Spread the full node data so configurations/interactions/conditions/etc. are preserved.
    // Ensure arrays are never undefined so the editor works correctly.
    data: {
      ...n,
      interactions: n.interactions ?? [],
      conditions: n.conditions ?? [],
      actions: n.actions ?? [],
    } as unknown as Record<string, unknown>,
    draggable: n.type !== "start" && n.viewOnly !== true,
    deletable: (n.type === "node" || n.type === "timeTable") && n.id !== "nodeC",
  }));

  const edges: Edge[] = lineList.map((line, idx) => ({
    id: `edge-${line.from}-${line.to}-${idx}`,
    source: line.from,
    target: line.to,
    type: "smoothstep",
    animated: true,
    label: line.label || undefined,
    style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
  }));

  // Re-deriva as edges de condição já na carga: ganham sourceHandle (handle por
  // condição no custom-node) + label; as manuais do lineList que duplicam rotas
  // de condição são descartadas pelo sync (ficam só as sem condição, ex. start→nodeC).
  return { nodes, edges: syncConditionsToEdges(nodes, edges) };
}

export function convertFromReactFlow(
  state: ReactFlowState,
  flowName: string
): FlowData {
  const nodeList: FlowNodeData[] = state.nodes.map((n) => {
    const d = n.data as unknown as FlowNodeData;
    return {
      ...d,
      left: `${Math.round(n.position.x)}px`,
      top: `${Math.round(n.position.y)}px`,
    };
  });

  // Deduplicate edges — keep only unique from→to pairs
  // Build a lookup of existing paintStyles from the original lineList (stored in node data or passed through)
  const seen = new Set<string>();
  const lineList = state.edges
    .filter((e) => {
      const key = `${e.source}-${e.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((e) => ({
      from: e.source,
      to: e.target,
      label: (e.label as string) || undefined,
      paintStyle: { strokeWidth: 3, stroke: "#5c67f2" },
    }));

  return denormaliseFlowData({ name: flowName, nodeList, lineList });
}

export function syncConditionsToEdges(
  nodes: Node[],
  existingEdges: Edge[]
): Edge[] {
  const conditionEdges: Edge[] = [];
  // Edges paralelas (mesma origem→destino) recebem offset incremental no segmento
  // central do smoothstep — sem isso as linhas e os labels se sobrepõem
  const pairCount = new Map<string, number>();

  for (const node of nodes) {
    const d = node.data as unknown as FlowNodeData;
    if (!d.conditions) continue;
    for (const cond of d.conditions) {
      // Only create an edge for step-routing conditions (action 0 = go to step)
      if ((cond.action ?? 0) !== 0) continue;
      if (!cond.nextStepId) continue;
      const edgeId = `cond-${node.id}-${cond.nextStepId}-${cond.id}`;
      const isAuto = cond.type === "A";
      const pairKey = `${node.id}-${cond.nextStepId}`;
      const parallelIdx = pairCount.get(pairKey) ?? 0;
      pairCount.set(pairKey, parallelIdx + 1);
      conditionEdges.push({
        id: edgeId,
        source: node.id,
        // Handle dedicado da condição no custom-node (drag re-roteia ESTA condição)
        sourceHandle: cond.id,
        target: cond.nextStepId,
        // Edge customizada: label ancorado no handle de origem (condition-edge.tsx)
        type: "condEdge",
        animated: true,
        data: {
          offset: 20 + parallelIdx * 35,
          kind: isAuto ? "A" : cond.type === "US" ? "US" : cond.type === "V" ? "V" : "R"
        },
        label: isAuto
          ? "⚡ auto"
          : cond.type === "V"
          ? `{{${cond.variableKey || "?"}}} ${cond.comparisonType || "equals"} ${cond.value || ""}`.trim()
          : (cond.value || undefined),
        // Auto-avanço: edge tracejada para diferenciar do roteamento por resposta
        style: isAuto
          ? { stroke: "hsl(var(--primary))", strokeWidth: 2, strokeDasharray: "6 4" }
          : { stroke: "hsl(var(--primary))", strokeWidth: 2 },
      } as Edge);
    }
  }

  // Mantém só as manuais que não duplicam uma rota de condição (evita edge dupla:
  // uma no handle do nó e outra no handle da condição)
  const condPairs = new Set(conditionEdges.map((e) => `${e.source}-${e.target}`));
  const manualEdges = existingEdges.filter(
    (e) => !e.id.startsWith("cond-") && !condPairs.has(`${e.source}-${e.target}`)
  );
  return [...manualEdges, ...conditionEdges];
}
