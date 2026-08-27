"use client";

import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeMouseHandler,
  type ReactFlowInstance,
  type Node,
  type Edge,
  Panel,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Plus,
  Save,
  Undo2,
  Redo2,
  LayoutGrid,
  Download,
  Trash2,
  AlertTriangle,
  Clock,
  Blocks,
  Zap,
  MessageSquare,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { FlowCustomNode } from "./custom-node";
import { ConditionEdge, FLOW_EDGE_REMOVE_EVENT } from "./condition-edge";
import { NodeForm } from "./node-form";
import { BlockPalette, FLOW_BLOCK_MIME } from "./block-palette";
import {
  convertToReactFlow,
  convertFromReactFlow,
  syncConditionsToEdges,
} from "./lib/flow-adapter";
import { createDefaultFlow } from "./lib/default-flow";
import { defaultInteractionData } from "./lib/types";
import type { FlowData, FlowNodeData, FlowCondition, FlowInteraction } from "./lib/types";

interface FlowEditorProps {
  initialData?: FlowData;
  flowName: string;
  // Pode devolver o flow como o SERVIDOR o gravou (mídia extraída para arquivo,
  // mediaUrl reescrita): o editor usa isso para descartar os base64 da sessão
  // logo após o save — senão todo save subsequente re-enviaria os vídeos
  // inteiros e o backend regravaria arquivo novo a cada vez.
  onSave: (data: FlowData) => Promise<void | FlowData | undefined>;
  onDirtyChange?: (dirty: boolean) => void;
}

export function FlowEditor({ initialData, flowName, onSave, onDirtyChange }: FlowEditorProps) {
  const t = useTranslations("flowBuilderEditor");
  const nodeTypes = useMemo(() => ({ flowNode: FlowCustomNode }), []);
  const edgeTypes = useMemo(() => ({ condEdge: ConditionEdge }), []);

  // Compute initial state once (not on every render)
  const initData = useMemo(
    () => initialData || createDefaultFlow(flowName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const rfState = useMemo(() => convertToReactFlow(initData), [initData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfState.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfState.edges);
  const [selectedNode, setSelectedNode] = useState<FlowNodeData | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  // Paleta aberta por default; preferência persistida em localStorage (o editor
  // só monta client-side, após o usuário abrir um fluxo — leitura segura aqui)
  const [paletteOpen, setPaletteOpen] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem("flowPaletteOpen") !== "false";
    } catch {
      return true;
    }
  });
  // Conexão criada por arraste a partir do handle do NÓ (sem condição associada):
  // o dialog pergunta qual condição essa ligação representa (US / palavras-chave / A)
  const [pendingConn, setPendingConn] = useState<{ source: string; target: string; hasUS: boolean; allowAuto: boolean } | null>(null);
  const [connKeywords, setConnKeywords] = useState("");
  // X no label da edge → Dialog de confirmação (a remoção apaga a condição do nó)
  const [pendingEdgeDelete, setPendingEdgeDelete] = useState<{ id: string; label: string } | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const isDirtyRef = useRef(false);
  const historyRef = useRef<{ nodes: typeof rfState.nodes; edges: typeof rfState.edges }[]>([]);
  // Pilha espelho do Refazer: alimentada só pelo Desfazer; qualquer ação NOVA do
  // usuário (pushHistory) a invalida — mesma semântica de editores de texto
  const redoRef = useRef<{ nodes: typeof rfState.nodes; edges: typeof rfState.edges }[]>([]);
  // Tamanhos das pilhas em estado apenas p/ habilitar/desabilitar os botões
  // (mutação de ref não re-renderiza)
  const [historyLen, setHistoryLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  // Nós com condição órfã apontada pela validação do save (realce no card)
  const [errorNodeIds, setErrorNodeIds] = useState<Set<string>>(() => new Set());
  // Contexto do gesto de remoção de NÓS em andamento (onBeforeDelete →
  // onEdgesDelete → onNodesDelete): permite um único passe de limpeza no final
  // sem setNodes sobre estado obsoleto (que ressuscitaria o nó removido)
  const nodeDeleteCtxRef = useRef<{ nodeIds: Set<string>; extraConds: { source: string; condId: string }[] } | null>(null);

  const markDirty = useCallback(() => {
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      onDirtyChange?.(true);
    }
  }, [onDirtyChange]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const pushHistory = useCallback(() => {
    historyRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    if (historyRef.current.length > 30) historyRef.current.shift();
    // Ação nova do usuário invalida o Refazer (ramo alternativo descartado)
    redoRef.current = [];
    setHistoryLen(historyRef.current.length);
    setRedoLen(0);
  }, [nodes, edges]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev) {
      // Estado ATUAL vai para o Refazer antes de restaurar o snapshot
      redoRef.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      });
      if (redoRef.current.length > 30) redoRef.current.shift();
      setNodes(prev.nodes);
      setEdges(prev.edges);
      markDirty();
    }
    setHistoryLen(historyRef.current.length);
    setRedoLen(redoRef.current.length);
  }, [nodes, edges, setNodes, setEdges, markDirty]);

  const handleRedo = useCallback(() => {
    const next = redoRef.current.pop();
    if (next) {
      // Inverso do Desfazer: estado atual volta para a pilha de Desfazer
      // (sem passar por pushHistory, que limparia o Refazer)
      historyRef.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      });
      if (historyRef.current.length > 30) historyRef.current.shift();
      setNodes(next.nodes);
      setEdges(next.edges);
      markDirty();
    }
    setHistoryLen(historyRef.current.length);
    setRedoLen(redoRef.current.length);
  }, [nodes, edges, setNodes, setEdges, markDirty]);

  // Atalhos no CONTAINER do editor (não em window — não sequestra Ctrl+Z do
  // resto da página): Ctrl/Cmd+Z desfaz; Ctrl+Shift+Z e Ctrl/Cmd+Y refazem.
  // Digitação em input/textarea/contenteditable e dialogs abertos é ignorada.
  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
      ) {
        return;
      }
      e.preventDefault();
      if (key === "y" || e.shiftKey) handleRedo();
      else handleUndo();
    },
    [handleUndo, handleRedo]
  );

  const togglePalette = useCallback(() => {
    setPaletteOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("flowPaletteOpen", String(next));
      } catch {
        // storage indisponível — a preferência apenas não persiste
      }
      return next;
    });
  }, []);

  // Aplica um update nas conditions de um nó e re-deriva as edges (a fonte de
  // verdade continua sendo node.conditions — o shape salvo não muda).
  const applyConditionsUpdate = useCallback(
    (nodeId: string, updater: (conds: FlowCondition[]) => FlowCondition[]) => {
      pushHistory();
      markDirty();
      const updatedNodes = nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as unknown as FlowNodeData;
        return {
          ...n,
          data: { ...d, conditions: updater(d.conditions || []) } as unknown as Record<string, unknown>,
        };
      });
      setNodes(updatedNodes);
      setEdges((eds) => syncConditionsToEdges(updatedNodes as Node[], eds));
    },
    [nodes, pushHistory, markDirty, setNodes, setEdges]
  );

  // Regras de conexão validadas DURANTE o arraste (handle inválido nem aceita o
  // drop): sem self-loop, alvo só node/timeTable, start/configurations nunca é
  // origem. O onConnect repete as checagens — defesa dupla, sem custo.
  const isValidConnection = useCallback(
    (conn: Edge | Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return false;
      const sourceNode = nodes.find((n) => n.id === conn.source);
      const targetNode = nodes.find((n) => n.id === conn.target);
      if (!sourceNode || !targetNode) return false;
      const sd = sourceNode.data as unknown as FlowNodeData;
      const td = targetNode.data as unknown as FlowNodeData;
      if (td.type !== "node" && td.type !== "timeTable") return false;
      if (sd.type === "start" || sd.type === "configurations") return false;
      return true;
    },
    [nodes]
  );

  // Drag-to-connect: arrastar do handle de uma CONDIÇÃO re-roteia aquela condição;
  // arrastar do handle do NÓ abre o dialog para criar a condição da nova ligação.
  // As edges continuam 100% derivadas de node.conditions.
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      if (!sourceNode || !targetNode) return;
      const sd = sourceNode.data as unknown as FlowNodeData;
      const td = targetNode.data as unknown as FlowNodeData;
      if (td.type !== "node" && td.type !== "timeTable") return;
      if (sd.type === "start" || sd.type === "configurations") {
        toast.info(t("connStartLocked"));
        return;
      }

      // Handle de condição existente → só troca o destino
      if (params.sourceHandle) {
        applyConditionsUpdate(params.source, (conds) =>
          conds.map((c) =>
            c.id === params.sourceHandle ? { ...c, action: 0, nextStepId: params.target as string } : c
          )
        );
        return;
      }

      // Handle do nó (conexão crua)
      const conds = sd.conditions || [];
      if (sd.type === "timeTable") {
        // timeTable: o arraste cru define o destino do branch Padrão (faixas "T"
        // continuam sendo criadas no editor de horários)
        const us = conds.find((c) => c.type === "US");
        applyConditionsUpdate(params.source, (cs) =>
          us
            ? cs.map((c) => (c.id === us.id ? { ...c, action: 0, nextStepId: params.target as string } : c))
            : [
                ...cs,
                { id: `cond-${Date.now()}`, type: "US", action: 0, nextStepId: params.target as string, value: "", condition: [] },
              ]
        );
        return;
      }

      setConnKeywords("");
      setPendingConn({
        source: params.source,
        target: params.target,
        hasUS: conds.some((c) => c.type === "US"),
        // A é exclusivo: só ofertado em nó sem outras condições e sem captura de variável (regra da F2)
        allowAuto: conds.length === 0 && !sd.variableKey,
      });
    },
    [nodes, applyConditionsUpdate, t]
  );

  // Confirmação do dialog de conexão crua — cria a condição no nó de origem
  const applyPendingConnection = useCallback(
    (kind: "US" | "R" | "A") => {
      if (!pendingConn) return;
      const kws = connKeywords.split(",").map((s) => s.trim()).filter(Boolean);
      if (kind === "R" && kws.length === 0) return;
      const newCond: FlowCondition =
        kind === "US"
          ? { id: `cond-${Date.now()}`, type: "US", action: 0, nextStepId: pendingConn.target, value: "", condition: [] }
          : kind === "A"
          ? { id: `cond-${Date.now()}`, type: "A", action: 0, nextStepId: pendingConn.target, value: "", condition: [] }
          : { id: `cond-${Date.now()}`, type: "equals", action: 0, nextStepId: pendingConn.target, value: kws.join(","), condition: kws };
      applyConditionsUpdate(pendingConn.source, (conds) => [...conds, newCond]);
      setPendingConn(null);
      setConnKeywords("");
    },
    [pendingConn, connKeywords, applyConditionsUpdate]
  );

  // Del em edge de condição remove a condição correspondente do nó de origem
  // (o Desfazer reverte — pushHistory roda antes da remoção)
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const condEdges = deleted.filter((e) => e.id.startsWith("cond-") && e.sourceHandle);
      const ctx = nodeDeleteCtxRef.current;
      if (ctx) {
        // Gesto que remove NÓS: as edges ligadas aos nós removidos morrem junto
        // (a condição órfã do lado sobrevivente é desanexada no onNodesDelete);
        // condições de edges AVULSAS selecionadas no mesmo gesto são acumuladas
        // para o passe único de lá — um setNodes aqui usaria o estado obsoleto
        // pré-remoção e ressuscitaria o nó removido.
        for (const e of condEdges) {
          if (e.sourceHandle && !ctx.nodeIds.has(e.source) && !ctx.nodeIds.has(e.target)) {
            ctx.extraConds.push({ source: e.source, condId: e.sourceHandle });
          }
        }
        return;
      }
      if (condEdges.length === 0) return;
      pushHistory();
      markDirty();
      const updatedNodes = nodes.map((n) => {
        const toRemove = condEdges.filter((e) => e.source === n.id).map((e) => e.sourceHandle);
        if (toRemove.length === 0) return n;
        const d = n.data as unknown as FlowNodeData;
        return {
          ...n,
          data: {
            ...d,
            conditions: (d.conditions || []).filter((c) => !toRemove.includes(c.id)),
          } as unknown as Record<string, unknown>,
        };
      });
      setNodes(updatedNodes);
      setEdges((eds) =>
        syncConditionsToEdges(
          updatedNodes as Node[],
          eds.filter((e) => !deleted.some((de) => de.id === e.id))
        )
      );
      toast.success(t("edgeConditionRemoved"));
    },
    [nodes, pushHistory, markDirty, setNodes, setEdges, t]
  );

  // Delete via teclado (Del/Backspace) e botão de lixeira (ambos passam pelo
  // deleteElements): bloqueia a remoção se a seleção incluir nó protegido —
  // start/configurations/nodeC. Defesa em profundidade: o adapter já marca
  // esses nós como deletable:false. Quando a remoção vai acontecer, registra o
  // snapshot de Desfazer ANTES da remoção efetiva e abre o contexto do gesto.
  const onBeforeDelete = useCallback(
    async ({ nodes: nodesToDelete }: { nodes: Node[]; edges: Edge[] }) => {
      nodeDeleteCtxRef.current = null;
      const blocked = nodesToDelete.some((n) => {
        const d = n.data as unknown as FlowNodeData;
        return d.id === "nodeC" || (d.type !== "node" && d.type !== "timeTable");
      });
      if (blocked) return false;
      if (nodesToDelete.length > 0) {
        pushHistory();
        nodeDeleteCtxRef.current = {
          nodeIds: new Set(nodesToDelete.map((n) => n.id)),
          extraConds: [],
        };
      }
      return true;
    },
    [pushHistory]
  );

  // Pós-remoção de nós (teclado E botão): varre os nós REMANESCENTES e desanexa
  // toda condição cujo nextStepId apontava para um nó removido (fica "sem
  // destino", mesmo shape da condição vazia do NodeForm). Sem isso o fluxo
  // salvava "verde" com rota morta e o bot emudecia no runtime. Passe único:
  // aplica também as condições de edges avulsas acumuladas pelo onEdgesDelete.
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ctx = nodeDeleteCtxRef.current;
      nodeDeleteCtxRef.current = null;
      markDirty();
      const removedIds = new Set(deleted.map((n) => n.id));
      const extraBySource = new Map<string, Set<string>>();
      for (const ec of ctx?.extraConds ?? []) {
        const set = extraBySource.get(ec.source) ?? new Set<string>();
        set.add(ec.condId);
        extraBySource.set(ec.source, set);
      }
      let detached = 0;
      const cleaned = nodes
        .filter((n) => !removedIds.has(n.id))
        .map((n) => {
          const d = n.data as unknown as FlowNodeData;
          const conds = d.conditions || [];
          const extra = extraBySource.get(n.id);
          const hasOrphan = conds.some((c) => !!c.nextStepId && removedIds.has(c.nextStepId));
          if (!extra && !hasOrphan) return n;
          const nextConds = conds
            .filter((c) => !extra || !extra.has(c.id))
            .map((c) => {
              if (c.nextStepId && removedIds.has(c.nextStepId)) {
                detached += 1;
                return { ...c, nextStepId: "" };
              }
              return c;
            });
          return {
            ...n,
            data: { ...d, conditions: nextConds } as unknown as Record<string, unknown>,
          };
        });
      setNodes(cleaned);
      setEdges((eds) => syncConditionsToEdges(cleaned as Node[], eds));
      if ((ctx?.extraConds.length ?? 0) > 0) toast.success(t("edgeConditionRemoved"));
      if (detached > 0) toast.info(t("conditionsDetached", { count: detached }));
    },
    [nodes, markDirty, setNodes, setEdges, t]
  );

  // Duplo-clique numa edge de condição abre o node-form do nó de origem.
  // Clique simples apenas SELECIONA a edge (Del remove a condição via onEdgesDelete).
  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (!edge.id.startsWith("cond-")) return;
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) return;
      setSelectedNode(sourceNode.data as unknown as FlowNodeData);
      setFormOpen(true);
    },
    [nodes]
  );

  // Drop de bloco da palette → cria nó pré-configurado com a interação na posição do drop
  const onCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      const blockType = event.dataTransfer.getData(FLOW_BLOCK_MIME);
      if (!blockType || !rfInstanceRef.current) return;
      event.preventDefault();
      // Drop SOBRE um nó existente adiciona a interação DENTRO do nó (modelo do
      // produto); drop no canvas vazio mantém o comportamento de criar um passo novo.
      const targetNodeEl = (event.target as HTMLElement).closest(".react-flow__node");
      const targetId = targetNodeEl?.getAttribute("data-id");
      if (targetId) {
        const targetNode = nodes.find((n) => n.id === targetId);
        const td = targetNode?.data as unknown as FlowNodeData | undefined;
        if (td && td.type === "node") {
          pushHistory();
          markDirty();
          const newInt = {
            id: `int-${Date.now()}`,
            type: blockType as FlowInteraction["type"],
            data: defaultInteractionData(blockType as FlowInteraction["type"]),
          };
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== targetId) return n;
              const d = n.data as unknown as FlowNodeData;
              return {
                ...n,
                data: {
                  ...d,
                  interactions: [...(d.interactions || []), newInt],
                } as unknown as Record<string, unknown>,
              };
            })
          );
          toast.success(t("actionAddedToStep", { name: td.name || targetId }));
          return;
        }
      }
      // Regra do produto: ação só existe DENTRO de um passo (a estrutura do JSON
      // do fluxo exige interactions dentro do nó). Drop fora de um nó não cria
      // nada — apenas orienta o usuário. Passos novos: botão "Etapa".
      toast.info(t("dropActionOnStepHint"));
    },
    [nodes, pushHistory, markDirty, setNodes, t]
  );

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes(FLOW_BLOCK_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }, []);

  // X no label da edge (condition-edge.tsx) → confirma no Dialog antes de remover
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string; label?: string } | undefined;
      if (detail?.id) setPendingEdgeDelete({ id: detail.id, label: detail.label || "" });
    };
    window.addEventListener(FLOW_EDGE_REMOVE_EVENT, handler);
    return () => window.removeEventListener(FLOW_EDGE_REMOVE_EVENT, handler);
  }, []);

  const confirmEdgeDelete = useCallback(() => {
    if (!pendingEdgeDelete) return;
    rfInstanceRef.current?.deleteElements({ edges: [{ id: pendingEdgeDelete.id }] });
    setPendingEdgeDelete(null);
  }, [pendingEdgeDelete]);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const d = node.data as unknown as FlowNodeData;
      if (d.type === "start") return;
      setSelectedNode(d);
      setFormOpen(true);
    },
    []
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const target = event.target as HTMLElement;
      const action = target.closest("[data-action]")?.getAttribute("data-action");
      if (!action) return;

      const d = node.data as unknown as FlowNodeData;
      if (action === "edit") {
        setSelectedNode(d);
        setFormOpen(true);
      } else if (
        action === "delete" &&
        d.id !== "nodeC" &&
        (d.type === "node" || d.type === "timeTable")
      ) {
        // Mesmo caminho do Del de teclado (onBeforeDelete registra o snapshot de
        // Desfazer; onNodesDelete marca dirty e desanexa condições órfãs)
        rfInstanceRef.current?.deleteElements({ nodes: [{ id: node.id }] });
        toast.success(t("stepRemoved"));
      } else if (
        action === "duplicate" &&
        (d.type === "node" || d.type === "timeTable")
      ) {
        pushHistory();
        markDirty();
        const stamp = Date.now();
        const newId = `${d.type === "timeTable" ? "timetable" : "node"}-${stamp}`;
        const src = JSON.parse(JSON.stringify(d)) as FlowNodeData & { hasError?: boolean };
        delete src.hasError; // flag transitória de validação — não viaja na cópia
        const posX = Math.round(node.position.x + 40);
        const posY = Math.round(node.position.y + 40);
        const clone: FlowNodeData = {
          ...src,
          id: newId,
          left: `${posX}px`,
          top: `${posY}px`,
          interactions: (src.interactions || []).map((it, idx) => ({ ...it, id: `int-${stamp}-${idx}` })),
          // Condições com IDs novos e rota ZERADA — a cópia não herda as
          // ligações do original (evitaria edges fantasmas/duplicadas)
          conditions: (src.conditions || []).map((c, idx) => ({ ...c, id: `cond-${stamp}-${idx}`, nextStepId: "" })),
          actions: (src.actions || []).map((a, idx) => ({ ...a, id: `act-${stamp}-${idx}` })),
        };
        setNodes((nds) => [
          ...nds,
          {
            id: newId,
            type: "flowNode",
            position: { x: posX, y: posY },
            data: { ...clone } as unknown as Record<string, unknown>,
            draggable: true,
            deletable: true,
          },
        ]);
        toast.success(t("stepDuplicated"));
      }
    },
    [pushHistory, markDirty, setNodes, t]
  );

  const handleAddStep = useCallback(() => {
    pushHistory();
    markDirty();
    const id = `node-${Date.now()}`;
    const posX = 400 + Math.floor(Math.random() * 100);
    const posY = 100 + nodes.length * 130;

    const newNode: FlowNodeData = {
      id,
      name: t("newStep"),
      type: "node",
      left: `${posX}px`,
      top: `${posY}px`,
      ico: "mdi-robot-outline",
      interactions: [],
      conditions: [],
      actions: [],
    };

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "flowNode",
        position: { x: posX, y: posY },
        data: { ...newNode } as unknown as Record<string, unknown>,
        draggable: true,
        deletable: true,
      },
    ]);
  }, [nodes.length, pushHistory, setNodes]);

  const handleAddTimeTable = useCallback(() => {
    pushHistory();
    markDirty();
    const id = `timetable-${Date.now()}`;
    const posX = 400 + Math.floor(Math.random() * 100);
    const posY = 100 + nodes.length * 130;

    const newNode: FlowNodeData = {
      id,
      name: t("newTimeTable"),
      type: "timeTable",
      left: `${posX}px`,
      top: `${posY}px`,
      ico: "mdi-clock-outline",
      interactions: [],
      conditions: [
        {
          id: `cond-default-${Date.now()}`,
          type: "US",
          action: 0,
          nextStepId: "",
          value: "",
          condition: [],
        },
      ],
      actions: [],
    };

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "flowNode",
        position: { x: posX, y: posY },
        data: { ...newNode } as unknown as Record<string, unknown>,
        draggable: true,
        deletable: true,
      },
    ]);
  }, [nodes.length, pushHistory, setNodes, markDirty, t]);

  const handleNodeFormSave = useCallback(
    (updatedNode: FlowNodeData) => {
      pushHistory();
      markDirty();
      // Editar o nó limpa o realce de erro dele (flag transitória) — a próxima
      // validação de save re-checa e re-realça se o problema persistir
      const cleanNode = { ...updatedNode } as FlowNodeData & { hasError?: boolean };
      delete cleanNode.hasError;
      setNodes((nds) =>
        nds.map((n) => (n.id === cleanNode.id ? { ...n, data: { ...cleanNode } } : n))
      );

      setEdges((eds) => {
        const updatedNodes = nodes.map((n) =>
          n.id === cleanNode.id ? { ...n, data: { ...cleanNode } } : n
        );
        return syncConditionsToEdges(updatedNodes, eds);
      });
    },
    [nodes, pushHistory, markDirty, setNodes, setEdges]
  );

  // Retorna o nome do primeiro nó timeTable com alguma faixa sem destino
  // (ação 0/1/2/4 sem alvo, ou action 0 apontando para nó inexistente). Sem
  // destino a faixa estaciona o ticket no runtime e o bot fica mudo.
  const findTimeTableDestinationError = useCallback((): string | null => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      const d = n.data as unknown as FlowNodeData;
      if (d.type !== "timeTable") continue;
      const conds = Array.isArray(d.conditions) ? d.conditions : [];
      for (const c of conds) {
        const action = c.action ?? 0;
        let ok = true;
        if (action === 0) ok = !!c.nextStepId && nodeIds.has(c.nextStepId);
        else if (action === 1) ok = !!c.queueId;
        else if (action === 2) ok = !!c.userIdDestination;
        else if (action === 4) ok = !!c.channelDestination;
        // action 3 (encerrar) dispensa destino
        if (!ok) return d.name || d.id;
      }
    }
    return null;
  }, [nodes]);

  // Valida condições "A" (auto-avanço): destino obrigatório (espelha o
  // branchHasDestination do timeTable) e ciclo de nós automáticos (A→A→A...),
  // que no runtime estouraria o MAX_HOPS do resolver sem nunca aguardar resposta.
  const findAutoAdvanceError = useCallback((): { node: string; kind: "destination" | "cycle" } | null => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const autoNext = new Map<string, string>();
    for (const n of nodes) {
      const d = n.data as unknown as FlowNodeData;
      if (d.type !== "node") continue;
      const auto = (Array.isArray(d.conditions) ? d.conditions : []).find((c) => c.type === "A");
      if (!auto) continue;
      const action = auto.action ?? 0;
      let ok = true;
      if (action === 0) {
        ok = !!auto.nextStepId && nodeIds.has(auto.nextStepId);
        if (ok && auto.nextStepId) autoNext.set(n.id, auto.nextStepId);
      } else if (action === 1) ok = !!auto.queueId;
      else if (action === 2) ok = !!auto.userIdDestination;
      else if (action === 4) ok = !!auto.channelDestination;
      // action 3 (encerrar) dispensa destino
      if (!ok) return { node: d.name || d.id, kind: "destination" };
    }
    // ciclo: segue a cadeia A→A a partir de cada nó automático
    for (const startId of autoNext.keys()) {
      const seen = new Set<string>([startId]);
      let cur = autoNext.get(startId);
      while (cur && autoNext.has(cur)) {
        if (seen.has(cur)) {
          const nodeData = nodes.find((n) => n.id === cur)?.data as unknown as FlowNodeData | undefined;
          return { node: nodeData?.name || cur, kind: "cycle" };
        }
        seen.add(cur);
        cur = autoNext.get(cur);
      }
    }
    return null;
  }, [nodes]);

  // Valida interações Template (HSM): template selecionado e variáveis
  // preenchidas — a Meta rejeita envio com parâmetro vazio, então melhor
  // bloquear no save do que travar o fluxo no runtime.
  const findTemplateFieldError = useCallback((): { node: string; kind: "missing" | "vars" } | null => {
    for (const n of nodes) {
      const d = n.data as unknown as FlowNodeData;
      const interactions = Array.isArray(d.interactions) ? d.interactions : [];
      for (const i of interactions) {
        if (i.type !== "template") continue;
        const data = (i.data ?? {}) as Record<string, unknown>;
        if (!data.templateName) return { node: d.name || d.id, kind: "missing" };
        const vars = Array.isArray(data.templateVars) ? (data.templateVars as { value?: string }[]) : [];
        if (vars.some((v) => !String(v?.value ?? "").trim())) return { node: d.name || d.id, kind: "vars" };
      }
    }
    return null;
  }, [nodes]);

  // `hasError` é flag transitória do editor (realce de validação) e `__allNodes`
  // é resíduo de versões antigas do editor de horários (lista completa dos outros
  // nós — com base64 de mídias — que vazava para o state e inflava o JSON até o
  // timeout do save). Nenhum dos dois pode persistir no JSON salvo/exportado.
  // Remove só de quem tem (preserva refs para o memo do custom-node).
  const stripEditorFlags = useCallback(
    (nds: Node[]): Node[] =>
      nds.map((n) => {
        const raw = n.data as Record<string, unknown>;
        if (!("hasError" in raw) && !("__allNodes" in raw)) return n;
        const data = { ...raw };
        delete data.hasError;
        delete data.__allNodes;
        return { ...n, data };
      }),
    []
  );

  // Injeta/remove `hasError` no data APENAS dos nós cujo estado mudou — os demais
  // mantêm a MESMA referência de data, preservando o memo do custom-node.
  const applyErrorNodeIds = useCallback(
    (ids: Set<string>) => {
      setErrorNodeIds(ids);
      setNodes((nds) => {
        let changed = false;
        const next = nds.map((n) => {
          const data = n.data as Record<string, unknown>;
          const has = data.hasError === true;
          const want = ids.has(n.id);
          if (has === want) return n;
          changed = true;
          const nextData = { ...data };
          if (want) nextData.hasError = true;
          else delete nextData.hasError;
          return { ...n, data: nextData };
        });
        return changed ? next : nds;
      });
    },
    [setNodes]
  );

  // Validação GENÉRICA de condição órfã: qualquer condição comum (US/palavra-
  // chave/V/A/T) com rota por etapa (action 0) e nextStepId preenchido apontando
  // para nó que não existe mais. Complementa os validadores específicos acima e
  // cobre fluxos importados/legados — sem isso o fluxo salva "verde" com rota
  // morta e o bot emudece no runtime.
  const findDanglingConditionNodes = useCallback((): { id: string; name: string }[] => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const bad: { id: string; name: string }[] = [];
    for (const n of nodes) {
      const d = n.data as unknown as FlowNodeData;
      if (d.type !== "node" && d.type !== "timeTable") continue;
      const conds = Array.isArray(d.conditions) ? d.conditions : [];
      const broken = conds.some(
        (c) => (c.action ?? 0) === 0 && !!c.nextStepId && !nodeIds.has(c.nextStepId)
      );
      if (broken) bad.push({ id: n.id, name: d.name || d.id });
    }
    return bad;
  }, [nodes]);

  // Pós-save: espelha no state o que o servidor fez com os MediaField (base64
  // extraído para arquivo, mediaUrl reescrita). Sem isso o base64 fica vivo na
  // sessão e TODO save re-envia os vídeos inteiros (e o backend regrava arquivo
  // novo a cada vez). `sentMediaRefs` protege contra corrida: guarda a
  // IDENTIDADE do objeto `i.data` no clique do save — qualquer edição durante o
  // PUT em voo (save de modal, undo/redo) substitui o objeto por um clone, a
  // identidade difere e a interação é preservada (strings não servem de guard:
  // comparam por VALOR, e uma legenda editada manteria o mesmo base64). Não
  // mexe em posição, histórico nem dirty; refs intactas para quem não mudou
  // (memo do custom-node).
  const applyServerMediaState = useCallback(
    (saved: FlowData, sentMediaRefs: Map<string, unknown>) => {
      const serverMedia = new Map<string, Record<string, unknown>>();
      for (const sn of saved.nodeList ?? []) {
        const sInts = Array.isArray(sn.interactions) ? sn.interactions : [];
        for (const si of sInts) {
          const sType = (si as { type?: string }).type;
          const sData = (si as { data?: Record<string, unknown> }).data;
          if (
            (sType === "MediaField" || sType === "media") &&
            sData &&
            !sData.media &&
            typeof sData.mediaUrl === "string" &&
            sData.mediaUrl
          ) {
            serverMedia.set(`${sn.id}::${si.id}`, sData);
          }
        }
      }
      if (serverMedia.size === 0) return;
      setNodes((nds) =>
        nds.map((n) => {
          const d = n.data as unknown as FlowNodeData;
          const ints = Array.isArray(d.interactions) ? d.interactions : [];
          let touched = false;
          const nextInts = ints.map((i) => {
            if (i.type !== "media") return i;
            const data = i.data as Record<string, unknown> | undefined;
            if (!data?.media) return i;
            const key = `${n.id}::${i.id}`;
            // Identidade do OBJETO data (não valor): mudou = houve edição
            // concorrente durante o PUT — preserva a versão do usuário
            if (sentMediaRefs.get(key) !== data) return i;
            const sData = serverMedia.get(key);
            if (!sData) return i;
            touched = true;
            return { ...i, data: { ...sData } };
          });
          if (!touched) return n;
          return { ...n, data: { ...d, interactions: nextInts } };
        })
      );
    },
    [setNodes]
  );

  const handleSave = useCallback(async () => {
    // Cada validação parte do zero: limpa realces da tentativa anterior
    if (errorNodeIds.size > 0) applyErrorNodeIds(new Set());
    const ttError = findTimeTableDestinationError();
    if (ttError) {
      toast.error(t("errTimeTableDestination", { node: ttError }));
      return;
    }
    const autoError = findAutoAdvanceError();
    if (autoError) {
      toast.error(
        autoError.kind === "cycle"
          ? t("errAutoAdvanceCycle", { node: autoError.node })
          : t("errAutoAdvanceDestination", { node: autoError.node })
      );
      return;
    }
    const templateError = findTemplateFieldError();
    if (templateError) {
      toast.error(
        templateError.kind === "vars"
          ? t("errTemplateVars", { node: templateError.node })
          : t("errTemplateMissing", { node: templateError.node })
      );
      return;
    }
    const dangling = findDanglingConditionNodes();
    if (dangling.length > 0) {
      const idSet = new Set(dangling.map((b) => b.id));
      applyErrorNodeIds(idSet);
      toast.error(t("errConditionNoTarget", { nodes: dangling.map((b) => b.name).join(", ") }));
      // Centraliza no primeiro nó com erro mantendo o zoom atual
      const first = nodes.find((n) => idSet.has(n.id));
      const inst = rfInstanceRef.current;
      if (first && inst) {
        inst.setCenter(
          first.position.x + (first.measured?.width ?? 230) / 2,
          first.position.y + (first.measured?.height ?? 120) / 2,
          { zoom: inst.getViewport().zoom, duration: 400 }
        );
      }
      return;
    }
    setSaving(true);
    try {
      const flowData = convertFromReactFlow({ nodes: stripEditorFlags(nodes), edges }, flowName);
      // Snapshot da IDENTIDADE dos objetos `i.data` enviados neste save (ver
      // applyServerMediaState — protege contra edição durante o PUT)
      const sentMediaRefs = new Map<string, unknown>();
      for (const n of nodes) {
        const d = n.data as unknown as FlowNodeData;
        for (const i of d.interactions ?? []) {
          const data = i.data as Record<string, unknown> | undefined;
          if (i.type === "media" && data?.media) {
            sentMediaRefs.set(`${n.id}::${i.id}`, data);
          }
        }
      }
      const saved = await onSave(flowData);
      isDirtyRef.current = false;
      onDirtyChange?.(false);
      if (saved && Array.isArray(saved.nodeList)) {
        applyServerMediaState(saved, sentMediaRefs);
      }
      toast.success(t("flowSaved"));
    } catch {
      toast.error(t("flowSaveError"));
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, flowName, onSave, onDirtyChange, findTimeTableDestinationError, findAutoAdvanceError, findTemplateFieldError, findDanglingConditionNodes, errorNodeIds, applyErrorNodeIds, stripEditorFlags, applyServerMediaState, t]);

  const handleAutoLayout = useCallback(() => {
    pushHistory();
    const startNode = nodes.find((n) => (n.data as unknown as FlowNodeData).type === "start");
    if (!startNode) return;

    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      if (!adjacency.has(e.source)) adjacency.set(e.source, []);
      adjacency.get(e.source)!.push(e.target);
    }

    const visited = new Set<string>();
    const layers: string[][] = [];
    let queue = [startNode.id];
    visited.add(startNode.id);

    while (queue.length > 0) {
      layers.push([...queue]);
      const next: string[] = [];
      for (const nodeId of queue) {
        for (const targetId of adjacency.get(nodeId) || []) {
          if (!visited.has(targetId)) {
            visited.add(targetId);
            next.push(targetId);
          }
        }
      }
      queue = next;
    }

    const unvisited = nodes.filter((n) => !visited.has(n.id));
    if (unvisited.length > 0) {
      layers.push(unvisited.map((n) => n.id));
    }

    const xGap = 300;
    const yGap = 150;

    setNodes((nds) =>
      nds.map((n) => {
        const layerIdx = layers.findIndex((l) => l.includes(n.id));
        const posIdx = layers[layerIdx]?.indexOf(n.id) ?? 0;
        const layerSize = layers[layerIdx]?.length ?? 1;
        const yOffset = (posIdx - (layerSize - 1) / 2) * yGap;

        if ((n.data as unknown as FlowNodeData).type === "configurations") {
          return { ...n, position: { x: 0, y: 200 + yGap } };
        }

        return {
          ...n,
          position: {
            x: layerIdx * xGap,
            y: 200 + yOffset,
          },
        };
      })
    );

    toast.success(t("layoutReorganized"));
  }, [nodes, edges, pushHistory, setNodes]);

  const handleDownloadJson = useCallback(() => {
    const flowData = convertFromReactFlow({ nodes: stripEditorFlags(nodes), edges }, flowName);
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${flowName.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, flowName, stripEditorFlags]);

  const allNodeData = useMemo(
    () => nodes.map((n) => n.data as unknown as FlowNodeData),
    [nodes]
  );

  return (
    <div className="flex h-full flex-col" onKeyDown={handleEditorKeyDown}>
      <div className="relative min-h-0 flex-1" onDrop={onCanvasDrop} onDragOver={onCanvasDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onEdgesDelete={onEdgesDelete}
        onNodesDelete={onNodesDelete}
        onBeforeDelete={onBeforeDelete}
        onNodeDragStart={() => pushHistory()}
        onNodeDragStop={() => markDirty()}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeClick={onNodeClick}
        onInit={(instance) => { rfInstanceRef.current = instance; }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        className="bg-background"
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor="hsl(var(--primary))"
          maskColor="hsl(var(--muted) / 0.7)"
        />

        {/* pointer-events-none no Panel: a caixa do painel (botões + paleta) cobre
            um retângulo grande do canvas; sem isso ela bloqueia pan/seleção/drop
            nos nós por baixo. Os filhos visíveis reativam com pointer-events-auto. */}
        <Panel position="top-left" className="!pointer-events-none flex flex-col items-start gap-2">
          <div className="pointer-events-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={handleAddStep}>
              <Plus className="mr-1 h-4 w-4" /> {t("btnStep")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleAddTimeTable} className="text-amber-700 border-amber-300 hover:bg-amber-50">
              <Clock className="mr-1 h-4 w-4" /> {t("btnTimeTable")}
            </Button>
            <Button size="sm" variant={paletteOpen ? "default" : "outline"} onClick={togglePalette}>
              <Blocks className="mr-1 h-4 w-4" /> {t("paletteBtn")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleAutoLayout}>
              <LayoutGrid className="mr-1 h-4 w-4" /> {t("btnAutoLayout")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleUndo} disabled={historyLen === 0} title={`${t("btnUndo")} (Ctrl+Z)`}>
              <Undo2 className="mr-1 h-4 w-4" /> {t("btnUndo")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleRedo} disabled={redoLen === 0} title={`${t("btnRedo")} (Ctrl+Y)`}>
              <Redo2 className="mr-1 h-4 w-4" /> {t("btnRedo")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadJson}>
              <Download className="mr-1 h-4 w-4" /> JSON
            </Button>
            <Button size="sm" variant="outline" className="text-amber-600 border-amber-400 hover:bg-amber-50" onClick={() => setWarningOpen(true)}>
              <AlertTriangle className="mr-1 h-4 w-4" /> {t("btnWarnings")}
            </Button>
          </div>
          {paletteOpen && <BlockPalette />}
        </Panel>

        <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {t("warningsTitle")}
              </DialogTitle>
            </DialogHeader>
            <ul className="text-sm text-muted-foreground space-y-2 list-none pb-2">
              <li>- {t("warning1")}</li>
              <li>- {t("warning2")}</li>
              <li>- {t("warning3")}</li>
              <li>- {t("warning4")}</li>
              <li>- {t("warning5")}</li>
              <li>- {t("warning6")}</li>
              <li>- {t("warning7")}</li>
            </ul>
          </DialogContent>
        </Dialog>

        <Panel position="top-right">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />
            {saving ? t("saving") : t("save")}
          </Button>
        </Panel>
      </ReactFlow>
      </div>

      <Dialog open={!!pendingConn} onOpenChange={(o) => { if (!o) { setPendingConn(null); setConnKeywords(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("connTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("connDesc")}</p>
          <div className="space-y-3">
            {!pendingConn?.hasUS && (
              <Button variant="outline" className="w-full justify-start" onClick={() => applyPendingConnection("US")}>
                <MessageSquare className="mr-2 h-4 w-4" /> {t("connUS")}
              </Button>
            )}
            {pendingConn?.allowAuto && (
              <Button variant="outline" className="w-full justify-start" onClick={() => applyPendingConnection("A")}>
                <Zap className="mr-2 h-4 w-4" /> {t("connAuto")}
              </Button>
            )}
            <div className="space-y-1.5 rounded-md border p-3">
              <p className="text-xs font-medium">{t("connKeywords")}</p>
              <div className="flex gap-2">
                <Input
                  value={connKeywords}
                  onChange={(e) => setConnKeywords(e.target.value)}
                  placeholder={t("connKeywordsPlaceholder")}
                  className="h-8 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter" && connKeywords.trim()) applyPendingConnection("R"); }}
                />
                <Button size="sm" disabled={!connKeywords.trim()} onClick={() => applyPendingConnection("R")}>
                  {t("connCreate")}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPendingConn(null); setConnKeywords(""); }}>
              {t("connCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingEdgeDelete} onOpenChange={(o) => { if (!o) setPendingEdgeDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("edgeRemove")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("edgeRemoveConfirm")}</p>
          {pendingEdgeDelete?.label && (
            <p className="truncate rounded-md border bg-muted/40 px-2 py-1 text-xs">{pendingEdgeDelete.label}</p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingEdgeDelete(null)}>{t("connCancel")}</Button>
            <Button variant="destructive" onClick={confirmEdgeDelete}>
              <Trash2 className="mr-1 h-4 w-4" /> {t("edgeRemove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NodeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        node={selectedNode}
        allNodes={allNodeData}
        onSave={handleNodeFormSave}
      />
    </div>
  );
}
