"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle, ArrowRightLeft, BellRing, BookOpen, Bot, CalendarClock,
  CalendarPlus, ClipboardList, Cpu, FileText, GitBranch, HelpCircle, History,
  Kanban, Link2, Loader2, LogOut, MessagesSquare, Pencil, ShieldOff, Tag,
  TrendingUp, Users, Webhook, type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAiAgent,
  fetchAiAgentKnowledge,
  fetchAiAgents,
  fetchAiAgentSources,
  type AiAgent,
  type AiAgentSource,
  type AiAgentSummary,
} from "@/services/ai-agents";
import { fetchWhatsapps } from "@/services/whatsapp";

// Mapa SÓ DE LEITURA do que foi montado nos formulários do agente — mesmo
// visual do canvas do /chat-flow, travado (sem arrastar, ligar ou selecionar).
// Carrega no clique (o List da página é enxuto de propósito) e NUNCA guarda a
// chave do provedor: ela é descartada antes de entrar no estado.

type MapTone =
  | "channels" | "agent" | "knowledge" | "actions"
  | "memory" | "tools" | "routing" | "exit";

interface MapRow {
  icon?: LucideIcon;
  text: string;
  hint?: string;
  // "quando usar" e afins: aparece só como dica ao passar o mouse
  title?: string;
  mono?: boolean;
  tall?: boolean;
}

interface MapNodeData extends Record<string, unknown> {
  tone: MapTone;
  label: string;
  title: string;
  rows: MapRow[];
  extra: number;
  badges: string[];
  // seção desligada ou vazia: card tracejado, sem cor
  muted: boolean;
  emptyText?: string;
  emptyHint?: string;
  warn?: boolean;
  hasTarget: boolean;
  hasSource: boolean;
}

// Canal como a lista de conexões devolve; só o que o mapa lê (a interface
// completa de services/whatsapp.ts não declara o vínculo com o agente).
interface LinkedChannel {
  id: number;
  name?: string | null;
  type?: string | null;
  aiAgentId?: number | null;
}

type SafeAgent = Omit<AiAgent, "apiKey">;

const TONES: Record<MapTone, { icon: LucideIcon; card: string; accent: string }> = {
  channels: { icon: MessagesSquare, card: "border-emerald-500 bg-emerald-500/10", accent: "text-emerald-600 dark:text-emerald-400" },
  agent: { icon: Bot, card: "border-primary bg-primary/10", accent: "text-primary" },
  knowledge: { icon: BookOpen, card: "border-blue-500 bg-blue-500/10", accent: "text-blue-600 dark:text-blue-400" },
  actions: { icon: Tag, card: "border-violet-500 bg-violet-500/10", accent: "text-violet-600 dark:text-violet-400" },
  memory: { icon: ClipboardList, card: "border-amber-500 bg-amber-500/10", accent: "text-amber-600 dark:text-amber-400" },
  tools: { icon: Webhook, card: "border-sky-500 bg-sky-500/10", accent: "text-sky-600 dark:text-sky-400" },
  routing: { icon: ArrowRightLeft, card: "border-rose-500 bg-rose-500/10", accent: "text-rose-600 dark:text-rose-400" },
  exit: { icon: LogOut, card: "border-slate-400 bg-slate-500/10", accent: "text-slate-600 dark:text-slate-300" },
};

const NODE_WIDTH = 264;
const COLUMN_X = [0, 364, 728];
const COLUMN_GAP = 20;
const MAX_ROWS = 5;

// Altura ESTIMADA — só para empilhar a coluna da direita sem sobreposição; o
// card real se ajusta ao conteúdo (linhas truncadas mantêm a conta confiável).
const estimateHeight = (data: MapNodeData): number => {
  const header = data.label !== data.title ? 64 : 56;
  const badges = data.badges.length > 0 ? 28 : 0;
  if (data.rows.length === 0) {
    return header + badges + (data.emptyHint ? 92 : 44);
  }
  const rows = data.rows.reduce((sum, row) => sum + (row.tall ? 50 : 28), 0);
  return header + badges + rows + (data.extra > 0 ? 24 : 0) + 20;
};

const clip = (list: MapRow[]): { rows: MapRow[]; extra: number } => ({
  rows: list.slice(0, MAX_ROWS),
  extra: Math.max(0, list.length - MAX_ROWS),
});

const AgentMapNode = memo(function AgentMapNode({ data }: { data: MapNodeData }) {
  const tone = TONES[data.tone];
  const Icon = data.warn ? AlertTriangle : tone.icon;
  const handleClass = "!h-3 !w-3 !border-2 !border-background !bg-primary";
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        "rounded-lg border-2 shadow-md",
        data.muted
          ? "border-dashed border-muted-foreground/40 bg-muted/40"
          : data.warn
            ? "border-amber-500 bg-amber-500/10"
            : tone.card
      )}
    >
      {data.hasTarget && (
        <Handle type="target" position={Position.Left} isConnectable={false} className={handleClass} />
      )}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
            <Icon
              className={cn(
                "h-4 w-4",
                data.muted ? "text-muted-foreground" : data.warn ? "text-amber-600" : tone.accent
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-semibold", data.muted && "text-muted-foreground")}>
              {data.title}
            </p>
            {/* Só o agente tem nome próprio; nas seções a legenda repetiria o título */}
            {data.label !== data.title && (
              <p
                className={cn(
                  "truncate text-[10px] uppercase tracking-wider",
                  data.muted ? "text-muted-foreground/70" : tone.accent
                )}
              >
                {data.label}
              </p>
            )}
          </div>
          {data.rows.length > 0 && data.tone !== "agent" && (
            <span
              className={cn(
                "shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                tone.accent
              )}
            >
              {data.rows.length + data.extra}
            </span>
          )}
        </div>

        {data.badges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {data.badges.map(badge => (
              <span
                key={badge}
                className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {data.rows.length === 0 ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-muted-foreground">{data.emptyText}</p>
            {data.emptyHint && (
              <p className="text-[11px] leading-snug text-muted-foreground/80">{data.emptyHint}</p>
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {data.rows.map((row, index) => {
              const RowIcon = row.icon;
              return (
                <div
                  key={`${row.text}-${index}`}
                  title={row.title || undefined}
                  className={cn(
                    "flex gap-1.5 rounded border border-muted-foreground/15 bg-background/70 px-2 py-1 text-[11px]",
                    row.tall ? "items-start" : "items-center"
                  )}
                >
                  {RowIcon && <RowIcon className="mt-px h-3 w-3 shrink-0 text-muted-foreground" />}
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-foreground/90",
                      row.tall ? "line-clamp-2 leading-snug" : "truncate",
                      row.mono && "font-mono text-[10.5px]"
                    )}
                  >
                    {row.text}
                  </span>
                  {row.hint && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{row.hint}</span>
                  )}
                </div>
              );
            })}
            {data.extra > 0 && (
              <p className="px-1 text-[10px] text-muted-foreground">+{data.extra}</p>
            )}
          </div>
        )}
      </div>
      {data.hasSource && (
        <Handle type="source" position={Position.Right} isConnectable={false} className={handleClass} />
      )}
    </div>
  );
});

const nodeTypes = { agentMap: AgentMapNode };

interface AgentMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: number | null;
  onEdit?: (agentId: number) => void;
}

interface MapData {
  agent: SafeAgent;
  sources: AiAgentSource[];
  articleCount: number;
  channels: LinkedChannel[];
  // v6 — nome dos agentes do tenant (listagem enxuta) para o destino "Outro
  // agente de IA" e as consultas. Falha = vazio: a linha cai no rótulo ou "#id".
  agentNames: Record<number, string>;
}

export function AgentMapDialog({ open, onOpenChange, agentId, onEdit }: AgentMapDialogProps) {
  const t = useTranslations("aiAgents");
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (id: number) => {
    setLoading(true);
    setFailed(false);
    try {
      // Só o agente é obrigatório; base e canais degradam para vazio (o mapa
      // continua útil e nada aqui pode travar a tela).
      const [agent, sources, articles, channelsRes, agentList] = await Promise.all([
        fetchAiAgent(id),
        fetchAiAgentSources(id).catch(() => [] as AiAgentSource[]),
        fetchAiAgentKnowledge(id).catch(() => []),
        fetchWhatsapps().catch(() => null),
        // Uma chamada por abertura, só para dar NOME aos agentes citados
        fetchAiAgents().catch(() => [] as AiAgentSummary[]),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { apiKey: _discarded, ...safeAgent } = agent;
      const list = (channelsRes?.data ?? []) as unknown as LinkedChannel[];
      const agentNames: Record<number, string> = {};
      for (const item of Array.isArray(agentList) ? agentList : []) {
        const itemId = Number(item?.id);
        if (itemId > 0 && item?.name) agentNames[itemId] = item.name;
      }
      setData({
        agent: safeAgent,
        sources,
        articleCount: articles.length,
        channels: Array.isArray(list)
          ? list.filter(channel => Number(channel?.aiAgentId) === Number(id))
          : [],
        agentNames,
      });
    } catch {
      setData(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !agentId) return;
    setData(null);
    load(agentId);
  }, [open, agentId, load]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as Node<MapNodeData>[], edges: [] as Edge[] };
    const { agent, sources, articleCount, channels, agentNames } = data;

    const base = { extra: 0, badges: [] as string[], muted: false, hasTarget: true, hasSource: false };

    // v6 — nome de outro agente citado no mapa; sem a listagem (ou agente
    // excluído) cai no rótulo dado a ele e, por último, no "#id"
    const linkedAgentName = (id?: number | null, fallback?: string | null): string => {
      const key = Number(id);
      return (
        (key > 0 && agentNames[key]) ||
        (fallback || "").trim() ||
        (key > 0 ? `#${key}` : "")
      );
    };

    // ── Canais ──────────────────────────────────────────────────────────────
    const channelRows = clip(
      channels.map(channel => ({
        icon: MessagesSquare,
        text: channel.name || `#${channel.id}`,
        hint: channel.type || undefined,
      }))
    );
    const channelsNode: MapNodeData = {
      ...base,
      tone: "channels",
      label: t("mapChannels"),
      title: t("mapChannels"),
      ...channelRows,
      warn: channels.length === 0,
      emptyText: t("mapChannelsEmpty"),
      emptyHint: t("mapChannelsHint"),
      hasTarget: false,
      hasSource: true,
    };

    // ── Agente ──────────────────────────────────────────────────────────────
    const tone = (agent.systemPrompt || "").trim();
    const agentRows: MapRow[] = [
      {
        icon: Cpu,
        text: agent.model || "gpt-4o-mini",
        hint: agent.baseUrl ? t("mapProviderCustom") : undefined,
        mono: true,
      },
      tone
        ? { icon: MessagesSquare, text: tone.replace(/\s+/g, " "), tall: true, title: tone }
        : { icon: MessagesSquare, text: t("mapToneEmpty") },
    ];
    if (agent.maxHistoryMessages) {
      agentRows.push({ icon: History, text: t("mapHistory", { count: agent.maxHistoryMessages }) });
    }
    if (agent.routingEnabled !== false && agent.autoSummaryEnabled !== false) {
      agentRows.push({ icon: FileText, text: t("autoSummary") });
    }
    const agentNode: MapNodeData = {
      ...base,
      tone: "agent",
      label: t("mapAgent"),
      title: agent.name,
      rows: agentRows,
      badges: [agent.isActive ? t("statusActive") : t("statusInactive")],
      hasSource: true,
    };

    // ── Base de conhecimento ────────────────────────────────────────────────
    const sourceIcon: Record<string, LucideIcon> = { document: FileText, url: Link2, faq: HelpCircle };
    const kbList: MapRow[] = [];
    if (articleCount > 0) {
      kbList.push({ icon: BookOpen, text: t("mapKnowledgeArticles", { count: articleCount }) });
    }
    for (const source of sources) {
      kbList.push({
        icon: sourceIcon[source.type] || FileText,
        text: source.name,
        hint: typeof source.chunkCount === "number" ? t("mapChunks", { count: source.chunkCount }) : undefined,
        title: source.url || source.name,
      });
    }
    const kbOff = agent.kbEnabled === false;
    const knowledgeNode: MapNodeData = {
      ...base,
      tone: "knowledge",
      label: t("tabKnowledge"),
      title: t("tabKnowledge"),
      ...(kbOff ? { rows: [], extra: 0 } : clip(kbList)),
      badges: !kbOff && agent.semanticEnabled ? [t("semanticEnabled")] : [],
      muted: kbOff || kbList.length === 0,
      emptyText: kbOff ? t("mapKnowledgeOff") : t("mapKnowledgeEmpty"),
    };

    // ── Ações ───────────────────────────────────────────────────────────────
    // Etiqueta é o tipo sem ícone próprio (e sem legenda: o agente que não usa
    // os tipos novos sai igual ao de antes). A legenda de tipo é resolvida só
    // quando o tipo tem uma — nenhuma chave é consultada à toa.
    const actionIcon: Record<string, LucideIcon> = {
      kanban: Kanban,
      opportunity: TrendingUp,
      note: FileText,
      notify: BellRing,
      block: ShieldOff,
    };
    const actionTypeKey: Record<string, string> = {
      opportunity: "mapActionOpportunity",
      note: "mapActionNote",
      notify: "mapActionNotify",
      block: "mapActionBlock",
    };
    const actionList: MapRow[] = (agent.actions || []).map(action => {
      const typeKey = actionTypeKey[action.type];
      return {
        icon: actionIcon[action.type] || Tag,
        text: action.label,
        hint: typeKey ? t(typeKey) : undefined,
        title: action.description,
      };
    });
    const actionsNode: MapNodeData = {
      ...base,
      tone: "actions",
      label: t("actionsTitle"),
      title: t("actionsTitle"),
      ...clip(actionList),
      muted: actionList.length === 0,
      emptyText: t("actionsEmpty"),
    };

    // ── Dados a registrar ───────────────────────────────────────────────────
    const memoryOn = agent.memoryEnabled === true;
    const memoryList: MapRow[] = memoryOn
      ? (agent.memoryFields || []).map(field => ({
          icon: ClipboardList,
          text: field.name,
          title: field.description || undefined,
          mono: true,
        }))
      : [];
    const memoryNode: MapNodeData = {
      ...base,
      tone: "memory",
      label: t("memoryTitle"),
      title: t("memoryTitle"),
      ...clip(memoryList),
      muted: memoryList.length === 0,
      emptyText: memoryOn ? t("memoryEmpty") : t("mapMemoryOff"),
    };

    // ── Ferramentas externas ────────────────────────────────────────────────
    // As nativas vêm primeiro: são no máximo duas e ficariam escondidas atrás
    // do "+N" num agente com a lista de webhooks cheia.
    const nativeToolRows: MapRow[] = [];
    if (agent.nativeTools?.booking?.enabled) {
      nativeToolRows.push({ icon: CalendarClock, text: t("mapToolBooking") });
    }
    if (agent.nativeTools?.scheduleMessage?.enabled) {
      nativeToolRows.push({ icon: CalendarPlus, text: t("mapToolSchedule") });
    }
    // v6 — especialistas consultados: uma linha por agente, pelo nome
    const consultRows: MapRow[] = (
      Array.isArray(agent.consultAgents) ? agent.consultAgents : []
    )
      .filter(entry => Number(entry?.aiAgentId) > 0)
      .map(entry => ({
        icon: Bot,
        text: linkedAgentName(entry.aiAgentId),
        hint: t("mapToolConsult"),
        title: entry.description || undefined,
      }));
    const toolList: MapRow[] = [
      ...nativeToolRows,
      ...consultRows,
      ...(agent.externalTools || []).map(tool => ({
        icon: Webhook,
        text: tool.label,
        title: tool.description,
      })),
    ];
    const toolsNode: MapNodeData = {
      ...base,
      tone: "tools",
      label: t("tabTools"),
      title: t("tabTools"),
      ...clip(toolList),
      muted: toolList.length === 0,
      emptyText: t("toolsEmpty"),
    };

    // ── Transferência ───────────────────────────────────────────────────────
    const routingOn = agent.routingEnabled !== false;
    const routingList: MapRow[] = routingOn
      ? (agent.routingTargets || []).map(target => {
          // v6 — outro agente de IA: a linha mostra o NOME do agente que
          // assume. Tipo desconhecido continua caindo em "Fila" abaixo.
          if (target.type === "ai_agent") {
            return {
              icon: Bot,
              text: linkedAgentName(target.aiAgentId, target.label),
              hint: t("mapTargetAiAgent"),
              title: target.description,
            };
          }
          const isFlow = target.type === "chatflow";
          const isUser = target.type === "user";
          return {
            icon: isFlow ? GitBranch : isUser ? Users : ArrowRightLeft,
            text: target.label,
            hint: isFlow
              ? t("mapTargetFlow")
              : isUser
                ? t("targetTypeUser")
                : t("targetTypeQueue"),
            title: target.description,
          };
        })
      : [];
    const routingNode: MapNodeData = {
      ...base,
      tone: "routing",
      label: t("routingEnabled"),
      title: t("routingEnabled"),
      ...clip(routingList),
      muted: routingList.length === 0,
      emptyText: routingOn ? t("mapRoutingEmpty") : t("mapRoutingOff"),
    };

    // ── Palavra de saída ────────────────────────────────────────────────────
    const exitWord = (agent.exitKeyword || "").trim();
    const exitRows: MapRow[] = exitWord ? [{ icon: LogOut, text: exitWord, mono: true }] : [];
    if (exitWord && agent.fallbackQueueId) {
      exitRows.push({ icon: ArrowRightLeft, text: t("mapExitFallback") });
    }
    const exitNode: MapNodeData = {
      ...base,
      tone: "exit",
      label: t("mapExit"),
      title: t("mapExit"),
      rows: exitRows,
      muted: exitRows.length === 0,
      emptyText: t("mapExitEmpty"),
    };

    // Leitura da esquerda para a direita: o que ALIMENTA o agente (canais, base,
    // consultas externas) → o agente → o que ele FAZ (qualifica, registra,
    // transfere, sai). Duas colunas baixas em vez de uma alta: o desenho fica
    // mais largo que alto, como a janela, e o enquadramento não encolhe tudo.
    const inputs: Array<[string, MapNodeData]> = [
      ["channels", { ...channelsNode, hasTarget: false, hasSource: true }],
      ["knowledge", { ...knowledgeNode, hasTarget: false, hasSource: true }],
      ["tools", { ...toolsNode, hasTarget: false, hasSource: true }],
    ];
    const outputs: Array<[string, MapNodeData]> = [
      ["actions", actionsNode],
      ["memory", memoryNode],
      ["routing", routingNode],
      ["exit", exitNode],
    ];

    const columnHeight = (column: Array<[string, MapNodeData]>) =>
      column.reduce((sum, [, nodeData]) => sum + estimateHeight(nodeData), 0) +
      COLUMN_GAP * Math.max(0, column.length - 1);
    const tallest = Math.max(
      columnHeight(inputs),
      columnHeight(outputs),
      estimateHeight(agentNode)
    );

    const stack = (column: Array<[string, MapNodeData]>, x: number): Node<MapNodeData>[] => {
      let cursor = (tallest - columnHeight(column)) / 2;
      return column.map(([id, nodeData]) => {
        const node: Node<MapNodeData> = {
          id,
          type: "agentMap",
          position: { x, y: cursor },
          data: nodeData,
          draggable: false,
          selectable: false,
        };
        cursor += estimateHeight(nodeData) + COLUMN_GAP;
        return node;
      });
    };

    const builtNodes: Node<MapNodeData>[] = [
      ...stack(inputs, COLUMN_X[0]),
      {
        id: "agent",
        type: "agentMap",
        position: { x: COLUMN_X[1], y: (tallest - estimateHeight(agentNode)) / 2 },
        data: agentNode,
        draggable: false,
        selectable: false,
      },
      ...stack(outputs, COLUMN_X[2]),
    ];

    const live = { stroke: "hsl(var(--primary))", strokeWidth: 2 };
    const idle = { stroke: "hsl(var(--muted-foreground) / 0.45)", strokeWidth: 1.5, strokeDasharray: "5 5" };
    const isIdle = (nodeData: MapNodeData) => nodeData.muted || nodeData.warn === true;
    const builtEdges: Edge[] = [
      ...inputs.map(([id, nodeData]) => ({
        id: `${id}-agent`,
        source: id,
        target: "agent",
        type: "smoothstep",
        animated: !isIdle(nodeData),
        style: isIdle(nodeData) ? idle : live,
      })),
      ...outputs.map(([id, nodeData]) => ({
        id: `agent-${id}`,
        source: "agent",
        target: id,
        type: "smoothstep",
        animated: !isIdle(nodeData),
        style: isIdle(nodeData) ? idle : live,
      })),
    ];

    return { nodes: builtNodes, edges: builtEdges };
  }, [data, t]);

  const agentName = data?.agent.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94dvh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b px-4 py-3 text-left sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            <span>{t("mapTitle")}</span>
            {agentName && (
              <Badge variant="secondary" className="max-w-[60vw] truncate font-normal">
                {agentName}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{t("mapSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="h-[66dvh] min-h-[360px] w-full bg-background">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : failed || !data ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <p className="text-sm text-muted-foreground">{t("mapLoadError")}</p>
              {agentId && (
                <Button variant="outline" size="sm" onClick={() => load(agentId)}>
                  {t("mapRetry")}
                </Button>
              )}
            </div>
          ) : (
            <ReactFlow
              key={data.agent.id}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              elementsSelectable={false}
              panOnDrag
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              minZoom={0.25}
              maxZoom={1.5}
              fitView
              fitViewOptions={{ padding: 0.08 }}
              className="bg-background"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Controls
                showInteractive={false}
                className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground"
              />
            </ReactFlow>
          )}
        </div>

        <DialogFooter className="flex-row justify-end gap-2 border-t px-4 py-3 sm:px-6">
          {onEdit && agentId && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                onOpenChange(false);
                onEdit(agentId);
              }}
            >
              <Pencil className="h-4 w-4" />
              {t("edit")}
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>{t("mapClose")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
