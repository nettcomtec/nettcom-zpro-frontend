"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Trash2,
  GripVertical,
  MessageSquare,
  Image,
  Clock,
  Bot,
  Blocks,
  Workflow,
  Tag,
  LayoutGrid,
  ShieldOff,
  Globe,
  GitBranch,
  TrendingUp,
  Calendar,
  ArrowRightLeft,
  UserCircle,
  MapPin,
  Smile,
  Video,
  CalendarClock,
  CalendarPlus,
  ListChecks,
  Phone,
  Mic,
  FileText,
  SquareStack,
  List,
  Receipt,
  FileBadge,
  Copy,
  ChevronDown,
  AlertTriangle,
  X,
  ArrowLeftRight,
  TimerReset,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FlowNodeData, FlowInteraction, FlowCondition } from "./lib/types";
import { TextareaWithVars, InputWithVars } from "@/components/shared/variable-picker";
import TimeTableEditor from "./time-table-editor";
import { INTERACTION_TYPES, defaultInteractionData, SWITCH_CHANNEL_DEFAULT_MESSAGE } from "./lib/types";
import { useTranslations } from "next-intl";
import { fetchQueues } from "@/services/queues";
import { fetchAllUsers } from "@/services/users";
import { fetchWhatsapps } from "@/services/whatsapp";
import { fetchChatFlows } from "@/services/chatflow";
import { fetchTags } from "@/services/tags";
import { fetchKanbans } from "@/services/kanban";
import { fetchReasons } from "@/services/reasons";
import { fetchStages, fetchPipelines } from "@/services/funnel";
import { getTemplatesForChannel } from "@/services/channel-templates";
import {
  type TemplateVarEntry,
  type TemplateBuilderTFunc,
  type OrderDetailsValue,
  extractTemplateVars,
  buildTemplateFriendlyComponents,
  buildTemplateFallbackMessage,
  isOrderDetailsTemplateLike,
  orderDetailsFromPayload,
} from "@/utils/template-builder";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
} from "@/lib/order-details";
import { WABA_LIMITS } from "@/lib/waba-text-limits";

const iconMap: Record<string, React.ElementType> = {
  MessageSquare, Image, Clock, Bot, Blocks, Workflow, Tag, LayoutGrid,
  ShieldOff, Globe, GitBranch, TrendingUp, Calendar, SquareStack,
  ArrowRightLeft, UserCircle, MapPin, Smile, Video, CalendarClock,
  ListChecks, Phone, Mic, FileText, CalendarPlus, List, Receipt, FileBadge,
  ArrowLeftRight, TimerReset,
};

// Options loaded from API used for routing destinations
export interface RouteOptions {
  queues: { id: number; name: string }[];
  users: { id: number; name: string }[];
  channels: { id: number; name: string }[];
  chatflows: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  kanbans: { id: number; name: string }[];
  reasons: { id: number; name: string }[];
  stages: { id: number; name: string; pipelineId: number }[];
  pipelines: { id: number; name: string }[];
  /** Canais BSP conectados (waba/gupshup/dialog360) — fonte de templates do TemplateField */
  templateChannels: { id: number; name: string; type: string; tokenAPI?: string; appId?: string }[];
}

interface NodeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: FlowNodeData | null;
  allNodes: FlowNodeData[];
  onSave: (node: FlowNodeData) => void;
}

export function NodeForm({ open, onOpenChange, node, allNodes, onSave }: NodeFormProps) {
  const t = useTranslations("flowBuilderNodeForm");
  const [editNode, setEditNode] = useState<FlowNodeData | null>(null);
  const [originalNodeJson, setOriginalNodeJson] = useState<string>("");
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOptions>({
    queues: [], users: [], channels: [], chatflows: [], tags: [], kanbans: [], reasons: [],
    stages: [], pipelines: [], templateChannels: [],
  });
  const [openSections, setOpenSections] = useState({ interactions: true, conditions: true, variable: true });
  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const [interactionSelectKey, setInteractionSelectKey] = useState(0);
  const [addInteractionOpen, setAddInteractionOpen] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  // Load all options once when form opens
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetchQueues().catch(() => ({ data: [] })),
      fetchAllUsers().catch(() => ({ data: { users: [], count: 0 } })),
      fetchWhatsapps().catch(() => ({ data: [] })),
      fetchChatFlows().catch(() => ({ data: { chatFlow: [] } })),
      fetchTags().catch(() => ({ data: [] })),
      // Kanban/funil são capabilities separadas do chatflow: um plano com fluxo e
      // sem funil não pode receber "recurso fora do plano" só por abrir o form —
      // os selects ficam vazios (background = 402 sem toast global).
      fetchKanbans({ background: true }).catch(() => ({ data: [] })),
      fetchReasons().catch(() => ({ data: [] })),
      fetchStages(undefined, { background: true }).catch(() => ({ data: [] })),
      fetchPipelines(undefined, { background: true }).catch(() => ({ data: [] })),
    ]).then(([qRes, uRes, wRes, cfRes, tRes, kRes, rRes, stRes, plRes]) => {
      const queues = (qRes.data as { id: number; name: string }[]) ?? [];
      const usersRaw = (uRes as { data: { users?: unknown[] } }).data?.users ?? [];
      const users = (usersRaw as { id: number; name: string; profile?: string }[])
        .filter((u) => u.profile !== "superadmin")
        .map((u) => ({ id: u.id, name: u.name }));
      const channelsRaw = (wRes.data as { id: number; name: string; status?: string; type?: string; tokenAPI?: string; appId?: string }[]) ?? [];
      const channels = channelsRaw
        .filter((w) => w.status === "CONNECTED")
        .map((w) => ({ id: w.id, name: w.name }));
      const templateChannels = channelsRaw
        .filter((w) => w.status === "CONNECTED" && ["waba", "gupshup", "dialog360"].includes(w.type || ""))
        .map((w) => ({ id: w.id, name: w.name, type: w.type || "", tokenAPI: w.tokenAPI, appId: w.appId }));
      const cfRaw = ((cfRes as { data: { chatFlow?: unknown[] } }).data?.chatFlow ?? []) as { id: number; name: string }[];
      const chatflows = cfRaw.map((c) => ({ id: c.id, name: c.name }));
      const tagsData = (tRes as { data: unknown }).data;
      const tagsRaw: { id: number; name: string }[] = Array.isArray(tagsData)
        ? tagsData
        : Array.isArray((tagsData as { rows?: unknown })?.rows)
        ? ((tagsData as { rows: { id: number; name: string }[] }).rows)
        : [];
      const tags = tagsRaw.map((t) => ({ id: t.id, name: t.name }));

      const kanbansData = (kRes as { data: unknown }).data;
      const kanbansRaw: { id: number; name?: string; tag?: string }[] = Array.isArray(kanbansData)
        ? kanbansData
        : Array.isArray((kanbansData as { rows?: unknown })?.rows)
        ? ((kanbansData as { rows: { id: number; name?: string; tag?: string }[] }).rows)
        : [];
      const kanbans = kanbansRaw.map((k) => ({ id: k.id, name: k.name ?? k.tag ?? String(k.id) }));

      const reasonsData = (rRes as { data: unknown }).data;
      const reasonsRaw: { id: number; name: string }[] = Array.isArray(reasonsData)
        ? reasonsData
        : Array.isArray((reasonsData as { rows?: unknown })?.rows)
        ? ((reasonsData as { rows: { id: number; name: string }[] }).rows)
        : [];
      const reasons = reasonsRaw.map((r) => ({ id: r.id, name: r.name }));

      const stagesData = (stRes as { data: unknown }).data;
      const stagesRaw: { id: number; name: string; pipelineId: number }[] = Array.isArray(stagesData)
        ? stagesData
        : Array.isArray((stagesData as { data?: unknown })?.data)
        ? ((stagesData as { data: { id: number; name: string; pipelineId: number }[] }).data)
        : [];
      const stages = stagesRaw.map((s) => ({ id: s.id, name: s.name, pipelineId: s.pipelineId }));

      const pipelinesData = (plRes as { data: unknown }).data;
      const pipelinesRaw: { id: number; name: string }[] = Array.isArray(pipelinesData)
        ? pipelinesData
        : Array.isArray((pipelinesData as { data?: unknown })?.data)
        ? ((pipelinesData as { data: { id: number; name: string }[] }).data)
        : [];
      const pipelines = pipelinesRaw.map((p) => ({ id: p.id, name: p.name }));

      setRouteOptions({ queues, users, channels, chatflows, tags, kanbans, reasons, stages, pipelines, templateChannels });
    });
  }, [open]);

  useEffect(() => {
    if (open && node) {
      const snapshot = JSON.stringify(node);
      setEditNode(JSON.parse(snapshot));
      setOriginalNodeJson(snapshot);
    }
  }, [open, node]);

  if (!editNode) return null;

  const isConfig = editNode.type === "configurations";

  const addInteraction = (type: FlowInteraction["type"]) => {
    const newInteraction: FlowInteraction = { id: `int-${Date.now()}`, type, data: defaultInteractionData(type) };
    setEditNode({ ...editNode, interactions: [...editNode.interactions, newInteraction] });
    setInteractionSelectKey((k) => k + 1);
  };

  const removeInteraction = (id: string) => {
    setEditNode({ ...editNode, interactions: editNode.interactions.filter((i) => i.id !== id) });
  };

  const moveInteraction = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editNode.interactions.length) return;
    const arr = [...editNode.interactions];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setEditNode({ ...editNode, interactions: arr });
  };

  const updateInteractionData = (id: string, key: string, value: unknown) => {
    setEditNode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        interactions: prev.interactions.map((i) =>
          i.id === id ? { ...i, data: { ...i.data, [key]: value } } : i
        ),
      };
    });
  };

  const batchUpdateInteractionData = (id: string, updates: Record<string, unknown>) => {
    setEditNode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        interactions: prev.interactions.map((i) =>
          i.id === id ? { ...i, data: { ...i.data, ...updates } } : i
        ),
      };
    });
  };

  const addCondition = () => {
    const newCondition: FlowCondition = { id: `cond-${Date.now()}`, nextStepId: "", type: "US", value: "", condition: [] };
    setEditNode({ ...editNode, conditions: [...editNode.conditions, newCondition] });
  };

  const removeCondition = (id: string) => {
    setEditNode({ ...editNode, conditions: editNode.conditions.filter((c) => c.id !== id) });
  };

  const updateCondition = (id: string, updates: Partial<FlowCondition>) => {
    setEditNode({ ...editNode, conditions: editNode.conditions.map((c) => c.id === id ? { ...c, ...updates } : c) });
  };

  const isDirty = editNode !== null && JSON.stringify(editNode) !== originalNodeJson;

  const handleAttemptClose = (open: boolean) => {
    if (!open && isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(open);
  };

  const handleConfirmDiscard = () => {
    setConfirmCloseOpen(false);
    onOpenChange(false);
  };

  const handleSave = () => { onSave(editNode); onOpenChange(false); };

  const otherNodes = allNodes.filter((n) => n.id !== editNode.id && n.type !== "configurations");

  // Condição "A" (automático) é exclusiva: o nó envia as interações e executa a
  // action imediatamente, sem aguardar resposta — não convive com outras
  // condições nem com coleta de variável (que exige a resposta do contato).
  const hasAutoCondition = editNode.conditions.some((c) => c.type === "A");

  return (
    <>
    <Dialog open={open} onOpenChange={handleAttemptClose}>
      <DialogContent
        className="max-w-2xl flex flex-col gap-0 p-0 overflow-hidden"
        style={{ maxHeight: "90vh", height: "90vh" }}
      >
        {/* Header fixo */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
          <DialogTitle>
            {isConfig ? t("flowSettings") : `${t("editPrefix")}${editNode.name}`}
          </DialogTitle>
        </DialogHeader>

        {/* Ícone de avisos ao lado do X */}
        {!isConfig && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="absolute right-10 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none"
                title={t("importantWarnings")}
              >
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="sr-only">{t("warnings")}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-80 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs font-bold text-amber-700">{t("stepRepresentsInitialContact")}</p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 list-none">
                <li>- {t("warning1")}</li>
                <li>- {t("warning2")}</li>
                <li>- {t("warning3")}</li>
                <li>- {t("warning4")}</li>
                <li>- {t("warning5")}</li>
              </ul>
            </PopoverContent>
          </Popover>
        )}

        {/* Área scrollável */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-6 py-4">
            {!isConfig && (
              <div className="space-y-2">
                <Label>{t("stepName")}</Label>
                <Input
                  value={editNode.name}
                  onChange={(e) => setEditNode({ ...editNode, name: e.target.value })}
                />
              </div>
            )}

            {isConfig && <ConfigurationsForm editNode={editNode} setEditNode={setEditNode} routeOptions={routeOptions} />}

            {!isConfig && editNode.type === "timeTable" && (
              <TimeTableEditor
                editNode={editNode}
                setEditNode={setEditNode}
                routeOptions={routeOptions}
                otherNodes={otherNodes}
              />
            )}

            {!isConfig && editNode.type !== "timeTable" && (
              <>
                {/* ── INTERAÇÕES ── */}
                <Collapsible open={openSections.interactions} onOpenChange={() => toggleSection("interactions")}>
                  <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 flex-1 text-left">
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.interactions ? "" : "-rotate-90"}`} />
                        <span className="text-sm font-semibold">
                          {t("interactions")}
                          {editNode.interactions.length > 0 && (
                            <Badge variant="secondary" className="ml-2 text-xs">{editNode.interactions.length}</Badge>
                          )}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <Popover modal open={addInteractionOpen} onOpenChange={setAddInteractionOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          role="combobox"
                          aria-expanded={addInteractionOpen}
                          className="flex items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-[200px] h-7 text-xs"
                        >
                          <span className="line-clamp-1 text-muted-foreground">{t("addInteraction")}</span>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" aria-hidden="true" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[260px] p-0" align="end">
                        <Command>
                          <CommandInput placeholder={t("searchInteraction")} className="h-9" />
                          <CommandList>
                            <CommandEmpty>{t("noInteractionFound")}</CommandEmpty>
                            <CommandGroup>
                              {[...INTERACTION_TYPES].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })).map((it) => {
                                const Ico = iconMap[it.icon] || MessageSquare;
                                return (
                                  <CommandItem
                                    key={it.type}
                                    value={it.label}
                                    onSelect={() => {
                                      addInteraction(it.type as FlowInteraction["type"]);
                                      setAddInteractionOpen(false);
                                    }}
                                  >
                                    <Ico className="h-4 w-4" />
                                    <span>{it.label}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <CollapsibleContent className="space-y-3 pt-3">
                    {editNode.interactions.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t("noInteractions")}
                      </p>
                    )}
                    {editNode.interactions.map((interaction, idx) => {
                      const it = INTERACTION_TYPES.find((t) => t.type === interaction.type);
                      const Ico = it ? (iconMap[it.icon] || MessageSquare) : MessageSquare;
                      return (
                        <Card
                          key={interaction.id}
                          draggable
                          onDragStart={() => { dragIndexRef.current = idx; }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const from = dragIndexRef.current;
                            if (from !== null && from !== idx) {
                              const arr = [...editNode.interactions];
                              const [moved] = arr.splice(from, 1);
                              arr.splice(idx, 0, moved);
                              setEditNode({ ...editNode, interactions: arr });
                              dragIndexRef.current = null;
                            }
                          }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing" />
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Ico className="h-4 w-4 text-primary" />
                                    <Badge variant="secondary" className="text-xs">
                                      {it?.label || interaction.type}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                                      disabled={idx === 0} onClick={() => moveInteraction(idx, -1)} title={t("moveUp")}>↑
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                                      disabled={idx === editNode.interactions.length - 1} onClick={() => moveInteraction(idx, 1)} title={t("moveDown")}>↓
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => removeInteraction(interaction.id)}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                                <InteractionFields
                                  interaction={interaction}
                                  allNodes={otherNodes}
                                  routeOptions={routeOptions}
                                  onUpdate={(key, val) => updateInteractionData(interaction.id, key, val)}
                                  onBatchUpdate={(updates) => batchUpdateInteractionData(interaction.id, updates)}
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* ── CONDIÇÕES ── */}
                <Collapsible open={openSections.conditions} onOpenChange={() => toggleSection("conditions")}>
                  <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 flex-1 text-left">
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.conditions ? "" : "-rotate-90"}`} />
                        <span className="text-sm font-semibold">
                          {t("conditions")}
                          {editNode.conditions.length > 0 && (
                            <Badge variant="secondary" className="ml-2 text-xs">{editNode.conditions.length}</Badge>
                          )}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    {!hasAutoCondition && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addCondition}>
                        <Plus className="mr-1 h-3 w-3" /> {t("condition")}
                      </Button>
                    )}
                  </div>
                  <CollapsibleContent className="space-y-3 pt-3">
                    {editNode.conditions.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t("noConditions")}
                      </p>
                    )}
                    {editNode.conditions.map((cond) => (
                      <Card key={cond.id}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              <GitBranch className="mr-1 h-3 w-3" />{t("condition")}
                            </Badge>
                            <Button variant="ghost" size="sm" onClick={() => removeCondition(cond.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">{t("condType")}</Label>
                              <Select
                                value={cond.type}
                                onValueChange={(v) => {
                                  if (v === "A") {
                                    // Automático é exclusivo: vira a única condição do nó
                                    // e limpa a coleta de variável (exige resposta).
                                    setEditNode({
                                      ...editNode,
                                      conditions: editNode.conditions
                                        .filter((c) => c.id === cond.id)
                                        .map((c) => ({ ...c, type: "A" as const, condition: [], value: "" })),
                                      variableKey: "",
                                      variableLabel: "",
                                      variableType: undefined,
                                      variableValidation: undefined,
                                      variableErrorMessage: undefined,
                                      variableRetryLimit: undefined,
                                    });
                                    return;
                                  }
                                  updateCondition(cond.id, { type: v as FlowCondition["type"] });
                                }}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-60">
                                  <SelectItem value="US">{t("condAnyResponse")}</SelectItem>
                                  <SelectItem value="A" disabled={!!editNode.variableKey}>{t("condAuto")}</SelectItem>
                                  <SelectItem value="V">{t("condVariable")}</SelectItem>
                                  <SelectItem value="equals">{t("condEquals")}</SelectItem>
                                  <SelectItem value="contains">{t("condContains")}</SelectItem>
                                  <SelectItem value="startsWith">{t("condStartsWith")}</SelectItem>
                                  <SelectItem value="endsWith">{t("condEndsWith")}</SelectItem>
                                  <SelectItem value="regex">Regex</SelectItem>
                                </SelectContent>
                              </Select>
                              {cond.type === "A" && (
                                <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">{t("condAutoHint")}</p>
                              )}
                              {cond.type === "V" && (
                                <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">{t("condVariableHint")}</p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("condRouteTo")}</Label>
                              <Select
                                value={String(cond.action ?? 0)}
                                onValueChange={(v) => updateCondition(cond.id, { action: parseInt(v, 10), nextStepId: "", queueId: "", userIdDestination: "", closeTicket: "", channelDestination: "" })}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-60">
                                  <SelectItem value="0">{t("condRouteStep")}</SelectItem>
                                  <SelectItem value="1">{t("queue")}</SelectItem>
                                  <SelectItem value="2">{t("user")}</SelectItem>
                                  <SelectItem value="3">{t("close")}</SelectItem>
                                  <SelectItem value="4">{t("channel")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {/* Routing destination based on action */}
                          {(cond.action ?? 0) === 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs">{t("nextStep")}</Label>
                              <Select value={cond.nextStepId} onValueChange={(v) => updateCondition(cond.id, { nextStepId: v })}>
                                <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {otherNodes.map((n) => (
                                    <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {(cond.action ?? 0) === 1 && (
                            <div className="space-y-1">
                              <Label className="text-xs">{t("selectQueue")}</Label>
                              <Select value={cond.queueId || ""} onValueChange={(v) => updateCondition(cond.id, { queueId: v })}>
                                <SelectTrigger><SelectValue placeholder={t("selectQueue")} /></SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {routeOptions.queues.map((q) => (
                                    <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">{t("action1QueueAutoDistHint")}</p>
                            </div>
                          )}
                          {(cond.action ?? 0) === 2 && (
                            <div className="space-y-1">
                              <Label className="text-xs">{t("selectUser")}</Label>
                              <Select value={cond.userIdDestination || ""} onValueChange={(v) => updateCondition(cond.id, { userIdDestination: v })}>
                                <SelectTrigger><SelectValue placeholder={t("selectUser")} /></SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {routeOptions.users.map((u) => (
                                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">{t("action2UserAutoDistHint")}</p>
                            </div>
                          )}
                          {(cond.action ?? 0) === 3 && (
                            <div className="space-y-1">
                              <Label className="text-xs">{t("closingMessage")}</Label>
                              <textarea
                                className="w-full rounded-md border bg-background p-2 text-sm resize-y"
                                rows={2}
                                placeholder={t("closingMessage")}
                                value={cond.closeTicket || ""}
                                onChange={(e) => updateCondition(cond.id, { closeTicket: e.target.value })}
                              />
                              <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">{t("action3CloseAutoDistHint")}</p>
                            </div>
                          )}
                          {(cond.action ?? 0) === 4 && (
                            <div className="space-y-1">
                              <Label className="text-xs">{t("selectChannel")}</Label>
                              <Select value={cond.channelDestination || ""} onValueChange={(v) => updateCondition(cond.id, { channelDestination: v })}>
                                <SelectTrigger><SelectValue placeholder={t("selectChannel")} /></SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {routeOptions.channels.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">{t("action4ChannelAutoDistHint")}</p>
                            </div>
                          )}
                          {cond.type === "V" && (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">{t("condVariableKey")}</Label>
                                <Select
                                  value={cond.variableKey || ""}
                                  onValueChange={(v) => updateCondition(cond.id, { variableKey: v })}
                                >
                                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    {[...new Set([
                                      ...allNodes.map((n) => n.variableKey).filter(Boolean) as string[],
                                      // Variáveis criadas por bloco de API (campo "Resposta da API"):
                                      // sem isto o seletor só enxergava as de coleta e o nome tinha
                                      // de ser adivinhado à mão.
                                      ...allNodes.flatMap((n) =>
                                        (n.interactions || []).map((i) => i?.data?.responseVariable)
                                      ).filter((v): v is string => typeof v === "string" && v.trim() !== ""),
                                      "name", "firstName", "lastName", "email", "phoneNumber", "businessName", "cpf", "kanban", "protocol",
                                      ...(cond.variableKey ? [cond.variableKey] : []),
                                    ])].map((k) => (
                                      <SelectItem key={k} value={k}>{k}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t("condVariableOperator")}</Label>
                                <Select
                                  value={cond.comparisonType || "equals"}
                                  onValueChange={(v) => updateCondition(cond.id, { comparisonType: v })}
                                >
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    <SelectItem value="equals">{t("condEquals")}</SelectItem>
                                    <SelectItem value="notEquals">{t("opNotEquals")}</SelectItem>
                                    <SelectItem value="contains">{t("condContains")}</SelectItem>
                                    <SelectItem value="regex">Regex</SelectItem>
                                    <SelectItem value="gt">{t("opGt")}</SelectItem>
                                    <SelectItem value="lt">{t("opLt")}</SelectItem>
                                    <SelectItem value="gte">{t("opGte")}</SelectItem>
                                    <SelectItem value="lte">{t("opLte")}</SelectItem>
                                    <SelectItem value="exists">{t("opExists")}</SelectItem>
                                    <SelectItem value="notExists">{t("opNotExists")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {cond.comparisonType !== "exists" && cond.comparisonType !== "notExists" && (
                                <div className="col-span-2 space-y-1">
                                  <Label className="text-xs">{t("condValue")}</Label>
                                  <Input
                                    className="h-8 text-xs"
                                    value={cond.condition?.[0] ?? cond.value ?? ""}
                                    onChange={(e) => updateCondition(cond.id, { condition: [e.target.value], value: e.target.value })}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          {cond.type !== "US" && cond.type !== "A" && cond.type !== "V" && (
                            <div className="space-y-1">
                              <Label className="text-xs">{t("condValue")}</Label>
                              <ConditionChipInput
                                values={cond.condition ?? []}
                                onChange={(vals) => updateCondition(cond.id, { condition: vals })}
                                placeholder={t("condValuePlaceholder")}
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* ── VARIÁVEL ── */}
                <Collapsible open={openSections.variable} onOpenChange={() => toggleSection("variable")}>
                  <div className="flex items-center rounded-md bg-muted/50 px-3 py-2">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 w-full text-left">
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.variable ? "" : "-rotate-90"}`} />
                        <span className="text-sm font-semibold">{t("variable")} <span className="font-normal text-muted-foreground text-xs">({t("optional")})</span></span>
                      </button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="pt-3">
                    {hasAutoCondition ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        {t("variableBlockedByAuto")}
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder={t("variableKey")}
                            value={editNode.variableKey || ""}
                            onChange={(e) => setEditNode({ ...editNode, variableKey: e.target.value })}
                          />
                          <Input
                            placeholder={t("variableLabel")}
                            value={editNode.variableLabel || ""}
                            onChange={(e) => setEditNode({ ...editNode, variableLabel: e.target.value })}
                          />
                        </div>
                        {editNode.variableKey && (
                          <div className="mt-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">{t("variableType")}</Label>
                                <Select
                                  value={editNode.variableType || "text"}
                                  onValueChange={(v) => setEditNode({ ...editNode, variableType: v })}
                                >
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    <SelectItem value="text">{t("variableTypeText")}</SelectItem>
                                    <SelectItem value="number">{t("variableTypeNumber")}</SelectItem>
                                    <SelectItem value="email">{t("variableTypeEmail")}</SelectItem>
                                    <SelectItem value="cpf">CPF</SelectItem>
                                    <SelectItem value="cnpj">CNPJ</SelectItem>
                                    <SelectItem value="phone">{t("variableTypePhone")}</SelectItem>
                                    <SelectItem value="date">{t("variableTypeDate")}</SelectItem>
                                    <SelectItem value="regex">Regex</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {editNode.variableType && editNode.variableType !== "text" && (
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("variableRetryLimit")}</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    value={editNode.variableRetryLimit ?? 3}
                                    onChange={(e) =>
                                      setEditNode({
                                        ...editNode,
                                        variableRetryLimit: Number.isNaN(parseInt(e.target.value, 10))
                                          ? undefined
                                          : parseInt(e.target.value, 10),
                                      })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                            {editNode.variableType === "regex" && (
                              <div className="space-y-1">
                                <Label className="text-xs">{t("variableValidationRegex")}</Label>
                                <Input
                                  placeholder="^\d{5}$"
                                  value={editNode.variableValidation || ""}
                                  onChange={(e) => setEditNode({ ...editNode, variableValidation: e.target.value })}
                                />
                              </div>
                            )}
                            {editNode.variableType && editNode.variableType !== "text" && (
                              <div className="space-y-1">
                                <Label className="text-xs">{t("variableErrorMessage")}</Label>
                                <Input
                                  placeholder={t("variableErrorMessagePlaceholder")}
                                  value={editNode.variableErrorMessage || ""}
                                  onChange={(e) => setEditNode({ ...editNode, variableErrorMessage: e.target.value })}
                                />
                                <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">{t("variableValidationHint")}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>
        </div>

        {/* Footer fixo */}
        <DialogFooter className="px-6 py-4 shrink-0 border-t">
          <Button variant="outline" onClick={() => handleAttemptClose(false)}>{t("cancel")}</Button>
          <Button onClick={handleSave}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Confirmação de mudanças não salvas */}
    <Dialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("unsavedChangesTitle")}</DialogTitle>
          <DialogDescription>{t("unsavedChangesDesc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setConfirmCloseOpen(false)}>{t("keepEditing")}</Button>
          <Button variant="destructive" onClick={handleConfirmDiscard}>{t("discardChanges")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── VARIABLE PICKER ─────────────────────────────────────────────────────────

function ConditionChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [inputVal, setInputVal] = useState("");
  const addChip = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setInputVal("");
  };
  return (
    <div className="flex flex-wrap gap-1 rounded-md border bg-background p-1.5 min-h-[36px]">
      {values.map((v) => (
        <span key={v} className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs">
          {v}
          <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        value={inputVal}
        placeholder={values.length === 0 ? placeholder : ""}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(inputVal); }
          if (e.key === "Backspace" && inputVal === "" && values.length > 0) onChange(values.slice(0, -1));
        }}
        onBlur={() => { if (inputVal.trim()) addChip(inputVal); }}
      />
    </div>
  );
}

// ─── INTERACTION FIELDS ────────────────────────────────────────────────────────

// ── Template (HSM) — WABA/Gupshup/Dialog360 ─────────────────────────────────
// Espelha a extração de variáveis e a montagem de components do message-input
// (atendimento). data persistida: whatsappId/channelType (canal-fonte da lista),
// templateName/templateLanguage, templateComponents (definição completa, usada
// na bolha do backend), templateVars (estado da UI), components (shape amigável
// enviada aos senders) e message (fallback texto p/ canais sem suporte a HSM).
// extractTemplateVars / buildTemplateFriendlyComponents / buildTemplateFallbackMessage
// e os tipos TemplateVarEntry / TFunc vivem em @/utils/template-builder (compartilhados
// com a configuração de template de despedida do canal). Alias local p/ os casts existentes.
type TFunc = TemplateBuilderTFunc;

function TemplateInteractionFields({
  d,
  routeOptions,
  onBatchUpdate,
}: {
  d: Record<string, unknown>;
  routeOptions: RouteOptions;
  onBatchUpdate: (updates: Record<string, unknown>) => void;
}) {
  const t = useTranslations("flowBuilderNodeForm");
  const tOrder = useTranslations("orderDetails");
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const channels = routeOptions.templateChannels;
  const whatsappId = Number(d.whatsappId) || 0;
  const templateVars: TemplateVarEntry[] = Array.isArray(d.templateVars) ? (d.templateVars as TemplateVarEntry[]) : [];
  const tplComponents: any[] = Array.isArray(d.templateComponents) ? (d.templateComponents as any[]) : [];

  // ── Cobrança (ORDER_DETAILS) ──────────────────────────────────────────────
  // O bot dispara sozinho, então a ficha só aparece quando o template escolhido
  // é de cobrança (D2 — nunca por herança de template comum) e é montada aqui,
  // de forma deliberada, pelo autor do fluxo. Persiste no próprio data do nó
  // (JSON do ChatFlow), sob `orderDetails` — sem campo novo no backend.
  const isOrderDetails = isOrderDetailsTemplateLike(tplComponents);
  const orderKey = `${whatsappId}|${d.templateName || ""}|${d.templateLanguage || ""}`;
  const [orderValue, setOrderValue] = useState<OrderDetailsValue>(
    () => orderDetailsFromPayload(d.orderDetails) || emptyOrderDetails()
  );

  useEffect(() => {
    setOrderValue(orderDetailsFromPayload(d.orderDetails) || emptyOrderDetails());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const orderError = React.useMemo(
    () => (isOrderDetails ? validateOrderDetails(orderValue) : null),
    [isOrderDetails, orderValue]
  );

  const updateOrder = (next: OrderDetailsValue) => {
    setOrderValue(next);
    onBatchUpdate({ orderDetails: buildOrderDetailsPayload(next) });
  };

  // Troca de canal/template zera a ficha — e só grava a chave se o nó já a tinha
  // (data de template comum continua idêntico ao de hoje).
  const resetOrder = (): Record<string, unknown> => {
    setOrderValue(emptyOrderDetails());
    return d.orderDetails ? { orderDetails: null } : {};
  };

  useEffect(() => {
    if (!whatsappId) { setTemplates([]); return; }
    const channel = channels.find((c) => c.id === whatsappId);
    if (!channel) return;
    let cancelled = false;
    setLoadingTemplates(true);
    getTemplatesForChannel(channel)
      .then((list: any) => { if (!cancelled) setTemplates(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setLoadingTemplates(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsappId, channels.length]);

  // Dedup por name|language (lista pode trazer duplicatas entre superfícies)
  const templateOptions = templates.filter((tpl: any, idx: number, arr: any[]) =>
    arr.findIndex((o: any) => o?.name === tpl?.name && String(o?.language || "") === String(tpl?.language || "")) === idx
  );
  const selectedKey = d.templateName ? `${d.templateName}|${d.templateLanguage || ""}` : "";

  const updateVar = (key: string, value: string) => {
    const next = templateVars.map((v) => (v.key === key ? { ...v, value } : v));
    onBatchUpdate({
      templateVars: next,
      components: buildTemplateFriendlyComponents(tplComponents, next),
      message: buildTemplateFallbackMessage(tplComponents, next),
    });
  };

  return (
    <div className="space-y-2">
      {channels.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("templateNoBspChannels")}</p>
      )}
      {channels.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">{t("templateChannelLabel")}</Label>
          <Select
            value={whatsappId ? String(whatsappId) : ""}
            onValueChange={(val) => {
              const ch = channels.find((c) => String(c.id) === val);
              onBatchUpdate({
                whatsappId: Number(val),
                channelType: ch?.type || "",
                templateName: "",
                templateLanguage: "",
                templateComponents: [],
                templateVars: [],
                components: [],
                message: "",
                ...resetOrder(),
              });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={t("templateChannelPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {channels.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.type})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {whatsappId > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">{t("templateSelectLabel")}</Label>
          {loadingTemplates ? (
            <p className="text-xs text-muted-foreground">{t("templateLoadingTemplates")}</p>
          ) : templateOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("templateNoTemplates")}</p>
          ) : (
            <Select
              value={selectedKey}
              onValueChange={(val) => {
                const sep = val.lastIndexOf("|");
                const name = val.slice(0, sep);
                const language = val.slice(sep + 1);
                const tpl = templateOptions.find((tp: any) => tp?.name === name && String(tp?.language || "") === language);
                if (!tpl) return;
                const vars = extractTemplateVars(tpl.components || [], t as TFunc);
                onBatchUpdate({
                  templateName: tpl.name,
                  templateLanguage: tpl.language || "pt_BR",
                  templateComponents: tpl.components || [],
                  templateVars: vars,
                  components: buildTemplateFriendlyComponents(tpl.components || [], vars),
                  message: buildTemplateFallbackMessage(tpl.components || [], vars),
                  ...resetOrder(),
                });
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("templateSelectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {templateOptions.map((tpl: any) => (
                  <SelectItem key={`${tpl.name}|${tpl.language || ""}`} value={`${tpl.name}|${tpl.language || ""}`}>
                    {tpl.name} ({tpl.language || "?"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {templateVars.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">{t("templateVarsLabel")}</Label>
          {templateVars.map((v) => (
            <div key={v.key} className="space-y-0.5">
              <span className="text-[11px] text-muted-foreground">{v.label}</span>
              <InputWithVars
                value={v.value}
                onChange={(val) => updateVar(v.key, val)}
                placeholder={v.label}
              />
            </div>
          ))}
        </div>
      )}
      {isOrderDetails && (
        <div className="space-y-1.5 rounded-md border p-2 pt-1.5">
          <Label className="text-xs">{tOrder("sectionTitle")}</Label>
          <p className="text-[11px] text-muted-foreground">{tOrder("sectionHint")}</p>
          <OrderDetailsFields
            key={orderKey}
            value={orderValue}
            onChange={updateOrder}
            compact
          />
          {orderError && (
            <p className="text-[11px] text-destructive">{tOrder(orderError)}</p>
          )}
        </div>
      )}
      {!!(d.message as string) && (
        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap border rounded-md p-2 bg-muted/30">
          {d.message as string}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">{t("templateFallbackHint")}</p>
    </div>
  );
}

function InteractionFields({
  interaction,
  allNodes,
  routeOptions,
  onUpdate,
  onBatchUpdate,
}: {
  interaction: FlowInteraction;
  allNodes: FlowNodeData[];
  routeOptions: RouteOptions;
  onUpdate: (key: string, value: unknown) => void;
  onBatchUpdate: (updates: Record<string, unknown>) => void;
}) {
  const t = useTranslations("flowBuilderNodeForm");
  const d = interaction.data as Record<string, unknown>;
  const scheduleFileRef = useRef<HTMLInputElement>(null);

  // Inicializa defaults do TransferField (paridade com Vue legado: transferField.vue#initializeData).
  // Sem isso o JSON salvo fica sem `transferType` e o backend ignora a transferência.
  useEffect(() => {
    if (interaction.type !== "transfer") return;
    const updates: Record<string, unknown> = {};
    if (d.transferType === undefined) updates.transferType = "queue";
    if (d.transferQueueId === undefined) updates.transferQueueId = null;
    if (d.transferUserId === undefined) updates.transferUserId = null;
    if (d.transferMessage === undefined) updates.transferMessage = "";
    if (Object.keys(updates).length > 0) onBatchUpdate(updates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction.id, interaction.type]);

  // SwitchChannel (handoff híbrido): garante defaults PERSISTIDOS no data mesmo
  // para nós criados fora do defaultInteractionData (import/Vue) — gotcha do
  // Webhook Avançado: default só-exibição nunca é salvo e o backend fica sem fallback.
  useEffect(() => {
    if (interaction.type !== "SwitchChannel") return;
    const updates: Record<string, unknown> = {};
    if (d.channelId === undefined) updates.channelId = null;
    if (d.message === undefined) updates.message = SWITCH_CHANNEL_DEFAULT_MESSAGE;
    if (Object.keys(updates).length > 0) onBatchUpdate(updates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction.id, interaction.type]);

  switch (interaction.type) {

    // ── Mensagem simples ──────────────────────────────────────────────────────
    case "message":
      return (
        <TextareaWithVars
          rows={3}
          placeholder={t("typeMessage")}
          value={(d.message as string) || ""}
          onChange={(val) => onUpdate("message", val)}
        />
      );

    // ── Template (HSM) — WABA/Gupshup/Dialog360 ───────────────────────────────
    case "template":
      return (
        <TemplateInteractionFields
          d={d}
          routeOptions={routeOptions}
          onBatchUpdate={onBatchUpdate}
        />
      );

    // ── Mídia ─────────────────────────────────────────────────────────────────
    case "media": {
      const mediaBase64 = (d.media as string) || "";
      const mediaName = (d.name as string) || "";
      // Infer MIME type: prefer stored `type`, fallback to parsing the base64 header
      const mediaType =
        (d.type as string) ||
        (mediaBase64.startsWith("data:") ? mediaBase64.slice(5, mediaBase64.indexOf(";")) : "");
      // For preview: prefer base64 (works offline + avoids mixed-content issues),
      // then fresh blob URL (just uploaded), then server URL as last resort.
      const previewSrc = mediaBase64 || (d.mediaUrl as string) || "";

      const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const blobUrl = URL.createObjectURL(file);
        const ext = file.name.split(".").pop() || "";
        const reader = new FileReader();
        reader.onload = () => {
          onBatchUpdate({
            media: reader.result as string,
            mediaUrl: blobUrl,
            type: file.type,
            name: file.name,
            ext,
          });
        };
        reader.readAsDataURL(file);
      };

      return (
        <div className="space-y-2">
          {previewSrc ? (
            <div className="space-y-2">
              {mediaType.startsWith("image/") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewSrc} alt={mediaName} className="max-h-32 rounded border object-contain w-full" />
              )}
              {mediaType.startsWith("video/") && (
                <video src={previewSrc} controls className="max-h-32 w-full rounded border" />
              )}
              {mediaType.startsWith("audio/") && (
                <audio src={previewSrc} controls className="w-full" />
              )}
              {!mediaType.startsWith("image/") && !mediaType.startsWith("video/") && !mediaType.startsWith("audio/") && (mediaName || previewSrc) && (
                <div className="flex items-center gap-2 p-2 rounded border bg-muted text-sm">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{mediaName || t("file")}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => (document.getElementById(`media-upload-${interaction.id}`) as HTMLInputElement)?.click()}>
                {t("changeFile")}
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => (document.getElementById(`media-upload-${interaction.id}`) as HTMLInputElement)?.click()}
            >
              <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("clickToSelectFile")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("mediaFileTypes")}</p>
            </div>
          )}
          <input
            id={`media-upload-${interaction.id}`}
            type="file"
            className="hidden"
            accept=".txt,.jpg,.png,.jpeg,image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.ppt,.pptx,.mp4,.mp3,.ogg"
            onChange={handleFileChange}
          />
          <TextareaWithVars
            rows={2}
            placeholder={t("captionOptional")}
            value={(d.caption as string) || ""}
            onChange={(val) => onUpdate("caption", val)}
          />
        </div>
      );
    }

    // ── Delay ─────────────────────────────────────────────────────────────────
    case "delay":
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-24"
            placeholder={t("sec")}
            min={0}
            value={((d.time as number) ?? (d.seconds as number)) ?? ""}
            onChange={(e) => onUpdate("time", parseInt(e.target.value, 10) || 0)}
          />
          <span className="text-sm text-muted-foreground">{t("seconds")}</span>
        </div>
      );

    // ── ChatGPT ───────────────────────────────────────────────────────────────
    case "chatgpt": {
      const routeAction = d.routeAction !== undefined ? (d.routeAction as number) : null;
      return (
        <div className="space-y-2">
          <Input
            placeholder={t("chatgptApiKey")}
            type="password"
            value={(d.chatgptApiKey as string) || ""}
            onChange={(e) => onUpdate("chatgptApiKey", e.target.value)}
          />
          <Input
            placeholder={t("chatgptOrgId")}
            value={(d.chatgptOrgId as string) || ""}
            onChange={(e) => onUpdate("chatgptOrgId", e.target.value)}
          />
          <TextareaWithVars
            rows={3}
            placeholder={t("chatgptPrompt")}
            value={(d.chatgptPrompt as string) || ""}
            onChange={(val) => onUpdate("chatgptPrompt", val)}
          />
          <div className="space-y-1">
            <Label className="text-xs">{t("chatgptOffKeyword")}</Label>
            <Input
              placeholder={t("exExit")}
              value={(d.chatgptOff as string) || ""}
              onChange={(e) => onUpdate("chatgptOff", e.target.value)}
            />
          </div>
          <Separator />
          {routeAction !== null && routeAction !== 0 && (
            <div className="space-y-1">
              <Label className="text-xs">{t("condType")}</Label>
              <Select
                value={(d.routeComparisonType as string) || "equals"}
                onValueChange={(v) => onUpdate("routeComparisonType", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="equals">{t("condEquals")}</SelectItem>
                  <SelectItem value="contains">{t("condContains")}</SelectItem>
                  <SelectItem value="startsWith">{t("condStartsWith")}</SelectItem>
                  <SelectItem value="endsWith">{t("condEndsWith")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">{t("routeTo")}</Label>
            <Select
              value={routeAction !== null ? String(routeAction) : ""}
              onValueChange={(v) => onUpdate("routeAction", parseInt(v, 10))}
            >
              <SelectTrigger><SelectValue placeholder={t("noRouting")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="1">{t("queue")}</SelectItem>
                <SelectItem value="2">{t("user")}</SelectItem>
                <SelectItem value="3">{t("closeTicket")}</SelectItem>
                <SelectItem value="4">{t("channel")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {routeAction === 1 && (
            <Select value={(d.queueId as string) || ""} onValueChange={(v) => onUpdate("queueId", v)}>
              <SelectTrigger><SelectValue placeholder={t("selectQueue")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.queues.map((q) => (
                  <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {routeAction === 2 && (
            <Select value={(d.userIdDestination as string) || ""} onValueChange={(v) => onUpdate("userIdDestination", v)}>
              <SelectTrigger><SelectValue placeholder={t("selectUser")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {routeAction === 3 && (
            <textarea
              className="w-full rounded-md border bg-background p-2 text-sm resize-y"
              rows={2}
              placeholder={t("closingMessage")}
              value={(d.closeTicket as string) || ""}
              onChange={(e) => onUpdate("closeTicket", e.target.value)}
            />
          )}
          {routeAction === 4 && (
            <Select
              value={(d.channelDestination as string) || ""}
              onValueChange={(v) => onUpdate("channelDestination", v)}
            >
              <SelectTrigger><SelectValue placeholder={t("selectChannel")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.channels.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      );
    }

    // ── Typebot ───────────────────────────────────────────────────────────────
    case "typebot":
      return (
        <div className="space-y-2">
          <Input
            placeholder={t("typebotUrl")}
            value={(d.typebotUrl as string) || ""}
            onChange={(e) => onUpdate("typebotUrl", e.target.value)}
          />
          <Input
            placeholder={t("typebotName")}
            value={(d.typebotName as string) || ""}
            onChange={(e) => onUpdate("typebotName", e.target.value)}
          />
          <Input
            placeholder={t("typebotOff")}
            value={(d.typebotOff as string) || ""}
            onChange={(e) => onUpdate("typebotOff", e.target.value)}
          />
          <Input
            placeholder={t("typebotRestart")}
            value={(d.typebotRestart as string) || ""}
            onChange={(e) => onUpdate("typebotRestart", e.target.value)}
          />
        </div>
      );

    // ── N8N ───────────────────────────────────────────────────────────────────
    case "n8n":
      return (
        <InputWithVars
          placeholder={t("n8nWebhookUrl")}
          value={(d.n8nfield as string) || ""}
          onChange={(val) => onUpdate("n8nfield", val)}
        />
      );

    // ── Tag ───────────────────────────────────────────────────────────────────
    case "tag":
      return (
        <div className="space-y-1">
          <Label className="text-xs">{t("tag")}</Label>
          <Select value={(d.tag as string) || ""} onValueChange={(v) => onUpdate("tag", v)}>
            <SelectTrigger><SelectValue placeholder={t("selectTag")} /></SelectTrigger>
            <SelectContent className="max-h-60">
              {routeOptions.tags.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    // ── Kanban ────────────────────────────────────────────────────────────────
    case "kanban":
      return (
        <div className="space-y-1">
          <Label className="text-xs">{t("kanban")}</Label>
          <Select value={(d.kanban as string) || ""} onValueChange={(v) => onUpdate("kanban", v)}>
            <SelectTrigger><SelectValue placeholder={t("selectKanban")} /></SelectTrigger>
            <SelectContent className="max-h-60">
              {routeOptions.kanbans.map((k) => (
                <SelectItem key={k.id} value={String(k.id)}>{k.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    // ── ChatBot Block ─────────────────────────────────────────────────────────
    case "chatBotBlock":
      return (
        <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <ShieldOff className="h-4 w-4" />
          <span>{t("blockChatbot")}</span>
        </div>
      );

    // ── Trocar de Canal (handoff híbrido — SwitchChannel) ─────────────────────
    // Contrato backend: interaction { type: "SwitchChannel", data: { channelId, message } }.
    // channelId null = usar o canal vinculado (linkedChannelId) do canal atual do ticket.
    case "SwitchChannel": {
      const switchChannelId = d.channelId != null ? Number(d.channelId) : null;
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("switchChannelTargetLabel")}</Label>
            <Select
              value={switchChannelId ? String(switchChannelId) : "linked"}
              onValueChange={(v) => onUpdate("channelId", v === "linked" ? null : Number(v))}
            >
              <SelectTrigger><SelectValue placeholder={t("switchChannelUseLinked")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="linked">{t("switchChannelUseLinked")}</SelectItem>
                {routeOptions.channels.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("switchChannelMessageLabel")}</Label>
            <TextareaWithVars
              rows={3}
              placeholder={SWITCH_CHANNEL_DEFAULT_MESSAGE}
              value={(d.message as string) || ""}
              onChange={(val) => onUpdate("message", val)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("switchChannelLinkHint")}{" "}
              <code className="text-[10px]">{"{{link}}"}</code>
            </p>
          </div>
        </div>
      );
    }

    // ── Webhook ───────────────────────────────────────────────────────────────
    case "webhook":
      return (
        <InputWithVars
          placeholder={t("webhookUrl")}
          value={(d.webhook as string) || ""}
          onChange={(val) => onUpdate("webhook", val)}
        />
      );

    // ── Webhook All ───────────────────────────────────────────────────────────
    case "webhookAll": {
      const httpMethod = (d.httpMethod as string) || (d.method as string) || "POST";
      const headers = (d.headers as { key: string; value: string }[]) || [];
      const bodyType = (d.bodyType as string) || "json";
      return (
        <div className="space-y-2">
          <Select
            value={httpMethod}
            onValueChange={(v) => onUpdate("httpMethod", v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
          <InputWithVars
            placeholder={t("webhookUrl")}
            value={(d.webhookUrl as string) || (d.webhook as string) || ""}
            onChange={(val) => onUpdate("webhookUrl", val)}
          />

          {/* Headers */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-primary w-full text-left">
                <ChevronDown className="h-3 w-3" />
                {t("webhookHeaders")}
                {headers.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{headers.length}</Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1">
              {headers.map((h, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <Input
                    className="h-7 text-xs flex-1"
                    placeholder={t("webhookHeaderKey")}
                    value={h.key}
                    onChange={(e) => {
                      const updated = headers.map((x, j) => j === i ? { ...x, key: e.target.value } : x);
                      onUpdate("headers", updated);
                    }}
                  />
                  <Input
                    className="h-7 text-xs flex-1"
                    placeholder={t("webhookHeaderValue")}
                    value={h.value}
                    onChange={(e) => {
                      const updated = headers.map((x, j) => j === i ? { ...x, value: e.target.value } : x);
                      onUpdate("headers", updated);
                    }}
                  />
                  <button
                    className="text-destructive hover:opacity-80 shrink-0"
                    onClick={() => onUpdate("headers", headers.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onUpdate("headers", [...headers, { key: "", value: "" }])}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t("addHeader")}
              </Button>
            </CollapsibleContent>
          </Collapsible>

          {/* Body (POST / PUT only) */}
          {["POST", "PUT"].includes(httpMethod) && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-xs text-primary w-full text-left">
                  <ChevronDown className="h-3 w-3" />
                  {t("webhookBody")}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                <Select
                  value={bodyType}
                  onValueChange={(v) => onUpdate("bodyType", v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="json">{t("webhookBodyJson")}</SelectItem>
                    <SelectItem value="form">{t("webhookBodyForm")}</SelectItem>
                  </SelectContent>
                </Select>
                <TextareaWithVars
                  rows={5}
                  placeholder={t("webhookBodyContentPlaceholder")}
                  value={(d.bodyContent as string) || ""}
                  onChange={(val) => onUpdate("bodyContent", val)}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Advanced settings */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-primary w-full text-left">
                <ChevronDown className="h-3 w-3" />
                {t("webhookAdvanced")}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("webhookTimeout")}</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min={1000} max={60000} step={1000}
                  value={(d.timeout as number) ?? 10000}
                  onChange={(e) => onUpdate("timeout", parseInt(e.target.value, 10) || 10000)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("webhookRetryAttempts")}</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min={0} max={5}
                  value={(d.retryAttempts as number) ?? 0}
                  onChange={(e) => onUpdate("retryAttempts", parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("webhookRetryDelay")}</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min={1000} max={30000} step={1000}
                  value={(d.retryDelay as number) ?? 5000}
                  onChange={(e) => onUpdate("retryDelay", parseInt(e.target.value, 10) || 5000)}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Resposta roteável: captura o body numa variável e roteia por sucesso/erro */}
          <div className="space-y-2 rounded-md border p-2">
            <p className="text-xs font-medium">{t("webhookResponseSection")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("webhookResponseVariable")}</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder={t("webhookResponseVariablePh")}
                  value={(d.responseVariable as string) || ""}
                  onChange={(e) => onUpdate("responseVariable", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("webhookJsonPath")}</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="data.cliente.nome"
                  value={(d.responseJsonPath as string) || ""}
                  onChange={(e) => onUpdate("responseJsonPath", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("webhookOnSuccess")}</Label>
                <Select
                  value={(d.successNextStepId as string) || "__none"}
                  onValueChange={(v) => onUpdate("successNextStepId", v === "__none" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none">{t("webhookNoRouting")}</SelectItem>
                    {allNodes.filter((n) => n.type === "node" || n.type === "timeTable").map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("webhookOnError")}</Label>
                <Select
                  value={(d.errorNextStepId as string) || "__none"}
                  onValueChange={(v) => onUpdate("errorNextStepId", v === "__none" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none">{t("webhookNoRouting")}</SelectItem>
                    {allNodes.filter((n) => n.type === "node" || n.type === "timeTable").map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">{t("webhookResponseHint")}</p>
          </div>
        </div>
      );
    }

    // ── Notificar equipe (interno — nada vai ao cliente) ─────────────────────
    case "notify": {
      const selectedUserIds: number[] = Array.isArray(d.notifyUserIds) ? (d.notifyUserIds as number[]) : [];
      const toggleUser = (id: number) => {
        const next = selectedUserIds.includes(id)
          ? selectedUserIds.filter((u) => u !== id)
          : [...selectedUserIds, id];
        onUpdate("notifyUserIds", next);
      };
      return (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">{t("notifyHint")}</p>
          <div className="space-y-1">
            <Label className="text-xs">{t("notifyQueue")}</Label>
            <Select
              value={d.notifyQueueId ? String(d.notifyQueueId) : "__none"}
              onValueChange={(v) => onUpdate("notifyQueueId", v === "__none" ? null : Number(v))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="__none">{t("notifyNoQueue")}</SelectItem>
                {routeOptions.queues.map((q) => (
                  <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("notifyUsers")}</Label>
            <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border p-2">
              {routeOptions.users.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("notifyMessage")}</Label>
            <TextareaWithVars
              rows={3}
              placeholder={t("notifyMessagePh")}
              value={(d.message as string) || ""}
              onChange={(val) => onUpdate("message", val)}
            />
          </div>
        </div>
      );
    }

    // ── ChatFlow ──────────────────────────────────────────────────────────────
    case "chatflow":
      return (
        <div className="space-y-1">
          <Label className="text-xs">{t("chatFlow")}</Label>
          <Select value={(d.chatFlow as string) || ""} onValueChange={(v) => onUpdate("chatFlow", v)}>
            <SelectTrigger><SelectValue placeholder={t("selectFlow")} /></SelectTrigger>
            <SelectContent className="max-h-60">
              {routeOptions.chatflows.map((cf) => (
                <SelectItem key={cf.id} value={String(cf.id)}>{cf.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    // ── Opportunity ───────────────────────────────────────────────────────────
    case "opportunity": {
      const dateType = (d.dateType as string) || "today";
      const oppStatus = (d.opportunityStatus as string) || "open";
      return (
        <div className="space-y-2">
          <InputWithVars
            placeholder={t("opportunityName")}
            value={(d.name as string) || ""}
            onChange={(val) => onUpdate("name", val)}
          />
          <div className="space-y-1">
            <Label className="text-xs">{t("stageId")}</Label>
            <Select
              value={(d.stageId as string) || ""}
              onValueChange={(v) => {
                const stage = routeOptions.stages.find((s) => String(s.id) === v);
                onBatchUpdate({ stageId: v, pipelineId: stage ? String(stage.pipelineId) : (d.pipelineId as string) || "" });
              }}
            >
              <SelectTrigger><SelectValue placeholder={t("selectStage")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.stages.map((s) => {
                  const pipeline = routeOptions.pipelines.find((p) => p.id === s.pipelineId);
                  return (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {pipeline ? `${pipeline.name} > ${s.name}` : s.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("responsibleLabel")}</Label>
            <Select
              value={(d.responsibleId as string) || "none"}
              onValueChange={(v) => onUpdate("responsibleId", v === "none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder={t("selectResponsible")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="none">—</SelectItem>
                {routeOptions.users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("value")}</Label>
            <Input
              type="number"
              placeholder="0.00"
              min={0}
              step={0.01}
              value={(d.value as number) ?? ""}
              onChange={(e) => onUpdate("value", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("status")}</Label>
            <Select value={oppStatus} onValueChange={(v) => onUpdate("opportunityStatus", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="open">{t("oppOpen")}</SelectItem>
                <SelectItem value="win">{t("oppWon")}</SelectItem>
                <SelectItem value="lose">{t("oppLost")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("closingDateType")}</Label>
            <Select value={dateType} onValueChange={(v) => onUpdate("dateType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="today">{t("today")}</SelectItem>
                <SelectItem value="tomorrow">{t("tomorrow")}</SelectItem>
                <SelectItem value="days_from_interaction">{t("daysFromInteraction")}</SelectItem>
                <SelectItem value="custom">{t("customDate")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dateType === "days_from_interaction" && (
            <div className="flex items-center gap-2">
              <Input
                type="number" className="w-24" min={0} max={365}
                value={(d.daysFromInteraction as number) ?? 0}
                onChange={(e) => onUpdate("daysFromInteraction", parseInt(e.target.value, 10) || 0)}
              />
              <span className="text-sm text-muted-foreground">{t("days")}</span>
            </div>
          )}
          {dateType === "custom" && (
            <Input
              type="date"
              value={(d.closingForecast as string) || ""}
              onChange={(e) => onUpdate("closingForecast", e.target.value)}
            />
          )}
          <TextareaWithVars
            rows={2}
            placeholder={t("opportunityDescription")}
            value={(d.opportunityDescription as string) || ""}
            onChange={(val) => onUpdate("opportunityDescription", val)}
          />
        </div>
      );
    }

    // ── Google Agenda ─────────────────────────────────────────────────────────
    case "googleAgenda": {
      const gaDateType = (d.dateType as string) || "today";
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("googleCalendarConfigId")}</Label>
            <Input
              placeholder={t("googleCalendarConfigIdPlaceholder")}
              value={(d.googleConfigId as string) || ""}
              onChange={(e) => onUpdate("googleConfigId", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("eventDateType")}</Label>
            <Select value={gaDateType} onValueChange={(v) => onUpdate("dateType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="today">{t("today")}</SelectItem>
                <SelectItem value="tomorrow">{t("tomorrow")}</SelectItem>
                <SelectItem value="days_from_interaction">{t("daysFromInteraction")}</SelectItem>
                <SelectItem value="custom">{t("customDate")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {gaDateType === "days_from_interaction" && (
            <div className="flex items-center gap-2">
              <Input
                type="number" className="w-24" min={0} max={365}
                value={(d.daysFromInteraction as number) ?? 0}
                onChange={(e) => onUpdate("daysFromInteraction", parseInt(e.target.value, 10) || 0)}
              />
              <span className="text-sm text-muted-foreground">{t("days")}</span>
            </div>
          )}
          <InputWithVars
            placeholder={t("eventTitle")}
            value={(d.eventSummary as string) || ""}
            onChange={(val) => onUpdate("eventSummary", val)}
          />
          {gaDateType === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("start")}</Label>
                <Input type="datetime-local"
                  value={(d.eventStartDateTime as string) || ""}
                  onChange={(e) => onUpdate("eventStartDateTime", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("end")}</Label>
                <Input type="datetime-local"
                  value={(d.eventEndDateTime as string) || ""}
                  onChange={(e) => onUpdate("eventEndDateTime", e.target.value)}
                />
              </div>
            </div>
          )}
          <TextareaWithVars
            rows={2}
            placeholder={t("eventDescription")}
            value={(d.eventDescription as string) || ""}
            onChange={(val) => onUpdate("eventDescription", val)}
          />
          <InputWithVars
            placeholder={t("eventLocation")}
            value={(d.eventLocation as string) || ""}
            onChange={(val) => onUpdate("eventLocation", val)}
          />
          <Input
            placeholder={t("eventAttendees")}
            value={(d.eventAttendees as string) || ""}
            onChange={(e) => onUpdate("eventAttendees", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={(d.sendNotifications as boolean) ?? true}
                onCheckedChange={(v) => onUpdate("sendNotifications", v)}
              />
              <Label className="text-xs">{t("sendNotifications")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={(d.reminderBefore as boolean) ?? false}
                onCheckedChange={(v) => onUpdate("reminderBefore", v)}
              />
              <Label className="text-xs">{t("reminderBefore")}</Label>
            </div>
          </div>
          {(d.reminderBefore as boolean) && (
            <div className="flex items-center gap-2">
              <Input
                type="number" className="w-24" min={1} max={1440}
                value={(d.reminderMinutes as number) ?? 15}
                onChange={(e) => onUpdate("reminderMinutes", parseInt(e.target.value, 10) || 15)}
              />
              <span className="text-sm text-muted-foreground">{t("minutesBefore")}</span>
            </div>
          )}
        </div>
      );
    }

    // ── Button (WABA + UazAPI + Baileys) ──────────────────────────────────────
    case "button": {
      const choices = Array.isArray(d.choices) ? (d.choices as string[]) : [];
      const updateChoice = (i: number, v: string) => {
        const next = [...choices];
        next[i] = v;
        onUpdate("choices", next);
      };
      const addChoice = () => onUpdate("choices", [...choices, ""]);
      const removeChoice = (i: number) => onUpdate("choices", choices.filter((_, j) => j !== i));
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-blue-600">{t("buttonChannelLabel")}</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  <p className="font-semibold mb-1">{t("buttonTooltipTitle")}</p>
                  <p>{t("buttonTooltipWaba")}</p>
                  <p>{t("buttonTooltipUazapi")}</p>
                  <p>{t("buttonTooltipBaileys")}</p>
                  <p>{t("buttonTooltipInstagram")}</p>
                  <p>{t("buttonTooltipMessenger")}</p>
                  <p className="mt-1">{t("buttonTooltipBoth")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <TextareaWithVars
            rows={3}
            placeholder={t("typeMessage")}
            maxLength={WABA_LIMITS.body}
            value={(d.message as string) || ""}
            onChange={(val) => onUpdate("message", val)}
          />
          <p className="text-[10px] text-muted-foreground text-right">{((d.message as string) || "").length}/{WABA_LIMITS.body}</p>
          <Input
            placeholder={t("button1")}
            maxLength={20}
            value={(d.button1 as string) || ""}
            onChange={(e) => onUpdate("button1", e.target.value)}
          />
          <Input
            placeholder={t("button2")}
            maxLength={20}
            value={(d.button2 as string) || ""}
            onChange={(e) => onUpdate("button2", e.target.value)}
          />
          <Input
            placeholder={t("button3")}
            maxLength={20}
            value={(d.button3 as string) || ""}
            onChange={(e) => onUpdate("button3", e.target.value)}
          />
          <Input
            placeholder={t("footerPlaceholder")}
            maxLength={WABA_LIMITS.footer}
            value={(d.footerText as string) || ""}
            onChange={(e) => onUpdate("footerText", e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground text-right">{((d.footerText as string) || "").length}/{WABA_LIMITS.footer}</p>
          <p className="text-[10px] text-muted-foreground">{t("choicesExtraLabel")}</p>
          {choices.map((c, i) => (
            <div key={i} className="flex gap-1">
              <Input value={c} onChange={(e) => updateChoice(i, e.target.value)} placeholder={t("choicePlaceholder", { n: i + 1 })} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeChoice(i)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addChoice}>
            <Plus className="h-3 w-3 mr-1" /> {t("addChoice")}
          </Button>
        </div>
      );
    }

    // ── List (Baileys + UazAPI + WABA) ────────────────────────────────────────
    case "list": {
      type ListRow = { title: string; desc: string };
      type ListSection = { title: string; rows: ListRow[] };

      const buildFromChoices = (choices: string[]): ListSection[] => {
        const result: ListSection[] = [];
        let current: ListSection = { title: "", rows: [] };
        for (const c of choices) {
          const m = /^\s*\[(.+?)\]\s*$/.exec(c);
          if (m) {
            if (current.rows.length > 0 || current.title) result.push(current);
            current = { title: m[1], rows: [] };
          } else if (c.trim()) {
            current.rows.push({ title: c.trim(), desc: "" });
          }
        }
        if (current.rows.length > 0 || current.title) result.push(current);
        return result.length > 0 ? result : [{ title: "", rows: [{ title: "", desc: "" }] }];
      };

      const rawSections = Array.isArray(d.sections) && (d.sections as ListSection[]).length > 0
        ? (d.sections as ListSection[])
        : null;
      const sections: ListSection[] = rawSections ?? buildFromChoices(
        Array.isArray(d.choices) ? (d.choices as string[]) : []
      );

      const setSections = (next: ListSection[]) => onBatchUpdate({ sections: next, choices: [] });
      const addSection = () => setSections([...sections, { title: "", rows: [{ title: "", desc: "" }] }]);
      const removeSection = (si: number) => setSections(sections.filter((_, j) => j !== si));
      const updateSecTitle = (si: number, v: string) => setSections(sections.map((s, j) => j === si ? { ...s, title: v } : s));
      const addRow = (si: number) => setSections(sections.map((s, j) => j === si ? { ...s, rows: [...s.rows, { title: "", desc: "" }] } : s));
      const removeRow = (si: number, ri: number) => setSections(sections.map((s, j) => j === si ? { ...s, rows: s.rows.filter((_, k) => k !== ri) } : s));
      const updateRow = (si: number, ri: number, field: "title" | "desc", v: string) =>
        setSections(sections.map((s, j) => j === si ? { ...s, rows: s.rows.map((r, k) => k === ri ? { ...r, [field]: v } : r) } : s));
      const totalRows = sections.reduce((acc, s) => acc + s.rows.length, 0);

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-blue-600">{t("uazapiAndWaba")}</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  <p className="font-semibold mb-1">{t("listTooltipTitle")}</p>
                  <p>{t("listTooltipBody")}</p>
                  <p>{t("listTooltipBaileys")}</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-400">{t("listTooltipWabaNote")}</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-400">{t("listTooltipUazapiHeaderNote")}</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-400">{t("listTooltipInstagramNote")}</p>
                  <p className="mt-1">{t("listTooltipFallback")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            placeholder={t("listHeaderPlaceholder")}
            maxLength={WABA_LIMITS.headerText}
            value={(d.header as string) || ""}
            onChange={(e) => onUpdate("header", e.target.value)}
          />
          <TextareaWithVars
            rows={3}
            placeholder={t("typeMessage")}
            maxLength={WABA_LIMITS.listBody}
            value={(d.message as string) || ""}
            onChange={(val) => onUpdate("message", val)}
          />
          <p className="text-[10px] text-muted-foreground text-right">{((d.message as string) || "").length}/{WABA_LIMITS.listBody}</p>
          <Input
            placeholder={t("footerPlaceholder")}
            maxLength={WABA_LIMITS.footer}
            value={(d.footerText as string) || ""}
            onChange={(e) => onUpdate("footerText", e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground text-right">{((d.footerText as string) || "").length}/{WABA_LIMITS.footer}</p>
          <Input
            placeholder={t("listButtonPlaceholder")}
            maxLength={WABA_LIMITS.listButton}
            value={(d.listButton as string) || t("listButtonDefault")}
            onChange={(e) => onUpdate("listButton", e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground font-medium">{t("listSectionsLabel")}</p>
          {sections.map((sec, si) => (
            <div key={si} className="border rounded p-2 space-y-1.5 bg-muted/20">
              <div className="flex items-center gap-1">
                <Input
                  value={sec.title}
                  onChange={(e) => updateSecTitle(si, e.target.value)}
                  placeholder={t("listSectionTitlePh", { n: si + 1 })}
                  maxLength={WABA_LIMITS.sectionTitle}
                  className="h-7 text-xs font-medium flex-1"
                />
                {sections.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => removeSection(si)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {sec.rows.map((row, ri) => (
                <div key={ri} className="flex gap-1 pl-1">
                  <Input
                    value={row.title}
                    onChange={(e) => updateRow(si, ri, "title", e.target.value)}
                    placeholder={t("listRowTitlePh")}
                    maxLength={WABA_LIMITS.rowTitle}
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    value={row.desc}
                    onChange={(e) => updateRow(si, ri, "desc", e.target.value)}
                    placeholder={t("listRowDescPh")}
                    maxLength={WABA_LIMITS.rowDescription}
                    className="h-7 text-xs w-28"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeRow(si, ri)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {totalRows < WABA_LIMITS.maxRowsTotal && (
                <Button type="button" variant="outline" size="sm" className="w-full h-7 text-xs gap-1" onClick={() => addRow(si)}>
                  <Plus className="h-3 w-3" /> {t("listAddRow")}
                </Button>
              )}
            </div>
          ))}
          {sections.length < WABA_LIMITS.maxSections && totalRows < WABA_LIMITS.maxRowsTotal && (
            <Button type="button" variant="outline" size="sm" className="w-full h-7 text-xs gap-1" onClick={addSection}>
              <Plus className="h-3 w-3" /> {t("listAddSection")}
            </Button>
          )}
        </div>
      );
    }

    // ── PIX Button (UazAPI + Baileys) ─────────────────────────────────────────
    case "pixButton": {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-blue-600">{t("uazapiOnly")}</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  <p className="font-semibold mb-1">{t("pixTooltipTitle")}</p>
                  <p>{t("pixTooltipBody")}</p>
                  <p className="mt-1">{t("pixTooltipFallback")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select
            value={(d.pixType as string) || "EVP"}
            onValueChange={(v) => onUpdate("pixType", v)}
          >
            <SelectTrigger><SelectValue placeholder={t("pixTypePlaceholder")} /></SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="CPF">{t("pixTypeCpf")}</SelectItem>
              <SelectItem value="CNPJ">{t("pixTypeCnpj")}</SelectItem>
              <SelectItem value="PHONE">{t("pixTypePhone")}</SelectItem>
              <SelectItem value="EMAIL">{t("pixTypeEmail")}</SelectItem>
              <SelectItem value="EVP">{t("pixTypeEvp")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder={t("pixKeyPlaceholder")}
            value={(d.pixKey as string) || ""}
            onChange={(e) => onUpdate("pixKey", e.target.value)}
          />
          <Input
            placeholder={t("pixNamePlaceholder")}
            value={(d.pixName as string) || ""}
            onChange={(e) => onUpdate("pixName", e.target.value)}
          />
          {/* Fallback BSP (waba/gupshup/dialog360): botão CTA-URL p/ link de pagamento */}
          <div className="space-y-1 rounded-md border p-2">
            <Label className="text-xs">{t("pixPaymentLink")}</Label>
            <Input
              className="h-8 text-xs"
              placeholder="https://..."
              value={(d.paymentLinkUrl as string) || ""}
              onChange={(e) => onUpdate("paymentLinkUrl", e.target.value)}
            />
            <Input
              className="h-8 text-xs"
              placeholder={t("pixPaymentButtonPh")}
              value={(d.paymentButtonText as string) || ""}
              onChange={(e) => onUpdate("paymentButtonText", e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground leading-snug">{t("pixPaymentLinkHint")}</p>
          </div>
        </div>
      );
    }

    // ── Transfer ──────────────────────────────────────────────────────────────
    case "transfer": {
      const transferType = (d.transferType as string) || "queue";
      return (
        <div className="space-y-2">
          <Select value={transferType} onValueChange={(v) => onUpdate("transferType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="queue">{t("queue")}</SelectItem>
              <SelectItem value="user">{t("user")}</SelectItem>
              <SelectItem value="close">{t("close")}</SelectItem>
            </SelectContent>
          </Select>
          {transferType === "queue" && (
            <Select
              value={(d.transferQueueId as string) || ""}
              onValueChange={(v) => onUpdate("transferQueueId", v)}
            >
              <SelectTrigger><SelectValue placeholder={t("selectQueue")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.queues.map((q) => (
                  <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {transferType === "user" && (
            <Select
              value={(d.transferUserId as string) || ""}
              onValueChange={(v) => onUpdate("transferUserId", v)}
            >
              <SelectTrigger><SelectValue placeholder={t("selectUser")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <TextareaWithVars
            rows={2}
            placeholder={t("transferMessage")}
            value={(d.transferMessage as string) || ""}
            onChange={(val) => onUpdate("transferMessage", val)}
          />
        </div>
      );
    }

    // ── Contact ───────────────────────────────────────────────────────────────
    case "contact":
      return (
        <div className="space-y-2">
          <p className="text-xs text-blue-600">⚠ {t("whatsappOnly")}</p>
          <Input
            placeholder={t("contactFullName")}
            value={(d.contactFullName as string) || ""}
            onChange={(e) => onUpdate("contactFullName", e.target.value)}
          />
          <Input
            placeholder={t("contactPhone")}
            value={(d.contactPhoneNumber as string) || ""}
            onChange={(e) => onUpdate("contactPhoneNumber", e.target.value)}
          />
        </div>
      );

    // ── Location ──────────────────────────────────────────────────────────────
    case "location":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Latitude"
            value={(d.lat as string) || ""}
            onChange={(e) => onUpdate("lat", e.target.value)}
          />
          <Input
            placeholder="Longitude"
            value={(d.lng as string) || ""}
            onChange={(e) => onUpdate("lng", e.target.value)}
          />
        </div>
      );

    // ── Sticker ───────────────────────────────────────────────────────────────
    case "sticker": {
      const stickerBase64 = (d.stickerMedia as string) || "";
      const stickerName = (d.stickerName as string) || "";
      const stickerPreview = stickerBase64 || (d.stickerUrl as string) || "";

      const handleStickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const blobUrl = URL.createObjectURL(file);
        const ext = file.name.split(".").pop() || "";
        const reader = new FileReader();
        reader.onload = () => {
          onBatchUpdate({
            stickerMedia: reader.result as string,
            stickerUrl: blobUrl,
            stickerType: file.type,
            stickerName: file.name,
            stickerExt: ext,
          });
        };
        reader.readAsDataURL(file);
      };

      return (
        <div className="space-y-2">
          <p className="text-xs text-blue-600">⚠ {t("whatsappOnly")}</p>
          {stickerPreview ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stickerPreview}
                alt={stickerName}
                className="h-24 w-24 rounded-lg border object-contain bg-muted"
              />
              {stickerName && (
                <p className="text-xs text-muted-foreground truncate">{stickerName}</p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => (document.getElementById(`sticker-upload-${interaction.id}`) as HTMLInputElement)?.click()}
              >
                {t("changeSticker")}
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => (document.getElementById(`sticker-upload-${interaction.id}`) as HTMLInputElement)?.click()}
            >
              <Smile className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("clickToSelectImage")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("stickerFileTypes")}</p>
            </div>
          )}
          <input
            id={`sticker-upload-${interaction.id}`}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleStickerChange}
          />
        </div>
      );
    }

    // ── Video Link ────────────────────────────────────────────────────────────
    case "videoLink": {
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("videoLinkLabel")}</Label>
            <p className="text-xs text-muted-foreground bg-muted rounded-md px-2 py-1.5">
              {t("videoLinkAutoGenerated")}
            </p>
          </div>
          <TextareaWithVars
            rows={2}
            placeholder={t("videoLinkMessage")}
            value={(d.videoLinkMessage as string) || ""}
            onChange={(val) => onUpdate("videoLinkMessage", val)}
          />
        </div>
      );
    }

    // ── Schedule ──────────────────────────────────────────────────────────────
    case "schedule": {
      const scheduleType = (d.scheduleType as string) || "custom";
      const scheduleMedia = (d.media as string) || (d.mediaUrl as string) || "";
      const scheduleMediaName = (d.name as string) || "";
      const scheduleMediaType = (d.type as string) || "";

      const handleScheduleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const ext = file.name.split(".").pop() || "";
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          onBatchUpdate({
            media: base64,
            // NUNCA duplicar o base64 em mediaUrl: o envio agendado lê SÓ
            // `media` (todos os canais) e a duplicata dobrava o peso do fluxo
            // salvo (um vídeo de 10MB virava ~27MB de JSON). "" também limpa
            // a duplicata antiga ao trocar o arquivo.
            mediaUrl: "",
            type: file.type,
            name: file.name,
            ext,
          });
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      };

      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("scheduleType")}</Label>
            <Select value={scheduleType} onValueChange={(v) => onUpdate("scheduleType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="custom">{t("customDate")}</SelectItem>
                <SelectItem value="30_mins">{t("in30Mins")}</SelectItem>
                <SelectItem value="1_hour">{t("in1Hour")}</SelectItem>
                <SelectItem value="tomorrow">{t("tomorrowAt9")}</SelectItem>
                <SelectItem value="next_week">{t("nextWeekAt9")}</SelectItem>
                <SelectItem value="next_month">{t("nextMonthAt9")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scheduleType === "custom" && (
            <div className="space-y-1">
              <Label className="text-xs">{t("dateAndTime")}</Label>
              <Input
                type="datetime-local"
                value={(d.scheduleDate as string) || ""}
                // Persiste scheduleType="custom" junto com a data: o Select exibe
                // "Data personalizada" por padrao, mas so grava scheduleType se o
                // usuario troca a opcao. Sem isso o export saia sem scheduleType e
                // o backend ignorava a data, agendando para "agora".
                onChange={(e) => onBatchUpdate({ scheduleDate: e.target.value, scheduleType: "custom" })}
              />
            </div>
          )}
          <TextareaWithVars
            rows={3}
            placeholder={t("scheduleMessage")}
            value={(d.scheduleMessage as string) || ""}
            onChange={(val) => onUpdate("scheduleMessage", val)}
          />

          {/* Media upload */}
          <div className="space-y-1">
            <Label className="text-xs">{t("scheduleUploadMedia")}</Label>
            {scheduleMedia ? (
              <div className="space-y-1">
                {scheduleMediaType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scheduleMedia}
                    alt={scheduleMediaName}
                    className="max-h-32 rounded-md border object-contain bg-muted"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground truncate">{scheduleMediaName}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => scheduleFileRef.current?.click()}
                  >
                    {t("scheduleChangeFile")}
                  </Button>
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs text-destructive"
                    onClick={() => onBatchUpdate({ media: "", mediaUrl: "", type: "", name: "", ext: "" })}
                  >
                    {t("scheduleRemoveMedia")}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => scheduleFileRef.current?.click()}
              >
                <FileText className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{t("scheduleSelectFile")}</p>
              </div>
            )}
            <input
              ref={scheduleFileRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.ppt,.pptx"
              onChange={handleScheduleFile}
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">{t("delayBeforeSend")}</Label>
            <Input
              type="number" className="w-20" min={0} max={1440}
              value={(d.delayBeforeSend as number) ?? 0}
              onChange={(e) => onUpdate("delayBeforeSend", parseInt(e.target.value, 10) || 0)}
            />
            <span className="text-sm text-muted-foreground">{t("min")}</span>
          </div>
        </div>
      );
    }

    // ── Reasons ───────────────────────────────────────────────────────────────
    case "reasons":
      return (
        <div className="space-y-1">
          <Label className="text-xs">{t("closingReason")}</Label>
          <Select value={(d.reasonId as string) || ""} onValueChange={(v) => onUpdate("reasonId", v)}>
            <SelectTrigger><SelectValue placeholder={t("selectReason")} /></SelectTrigger>
            <SelectContent className="max-h-60">
              {routeOptions.reasons.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    // ── SMS ───────────────────────────────────────────────────────────────────
    case "sms":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("smsService")}</Label>
            <Select
              value={(d.smsService as string) || ""}
              onValueChange={(v) => onUpdate("smsService", v)}
            >
              <SelectTrigger><SelectValue placeholder={t("selectService")} /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="comtele">Comtele</SelectItem>
                <SelectItem value="conecta">Conecta</SelectItem>
                <SelectItem value="livson">BHI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TextareaWithVars
            rows={3}
            placeholder={t("smsMessage")}
            value={(d.smsMessage as string) || ""}
            onChange={(val) => onUpdate("smsMessage", val)}
          />
        </div>
      );

    // ── VAPI ──────────────────────────────────────────────────────────────────
    case "vapi":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("vapiAssistantId")}</Label>
            <Input
              placeholder={t("vapiAssistantIdPlaceholder")}
              value={(d.assistantId as string) || ""}
              onChange={(e) => onUpdate("assistantId", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("vapiPhoneNumberId")}</Label>
            <Input
              placeholder={t("vapiPhoneNumberIdPlaceholder")}
              value={(d.phoneNumberId as string) || ""}
              onChange={(e) => onUpdate("phoneNumberId", e.target.value)}
            />
          </div>
        </div>
      );

    // ── Notes ─────────────────────────────────────────────────────────────────
    case "notes":
      return (
        <TextareaWithVars
          rows={3}
          placeholder={t("noteContent")}
          value={(d.noteText as string) || (d.content as string) || ""}
          onChange={(val) => onUpdate("noteText", val)}
        />
      );

    // ── Appointment (Consulta Agenda) ─────────────────────────────────────────
    case "appointment":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("appointmentTitle")}</Label>
            <TextareaWithVars
              rows={2}
              placeholder={t("appointmentTitlePlaceholder")}
              value={(d.title as string) || ""}
              onChange={(val) => onUpdate("title", val)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("appointmentStartAt")}</Label>
            <Input
              type="datetime-local"
              value={(d.startAt as string) || ""}
              onChange={(e) => onUpdate("startAt", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("appointmentEndAt")} <span className="text-muted-foreground">({t("optional")})</span></Label>
            <Input
              type="datetime-local"
              value={(d.endAt as string) || ""}
              onChange={(e) => onUpdate("endAt", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("appointmentNotes")} <span className="text-muted-foreground">({t("optional")})</span></Label>
            <TextareaWithVars
              rows={2}
              placeholder={t("appointmentNotesPlaceholder")}
              value={(d.notes as string) || ""}
              onChange={(val) => onUpdate("notes", val)}
            />
          </div>
        </div>
      );

    // ── Carência (retorno rápido) ─────────────────────────────────────────────
    // NÃO envia mensagem. Grava no ticket uma janela de "retorno rápido": se o
    // cliente responder logo após o fim do atendimento, o backend o leva direto
    // ao destino escolhido (sem passar pelo menu do robô). data: enabled/seconds
    // (SEMPRE em segundos) + destinationType (+ queueId/userId/chatFlowId).
    // graceUnit é só estado de UI da unidade exibida (segundos/minutos); o backend
    // ignora e lê apenas `seconds`.
    case "carencia": {
      const enabled = d.enabled !== false;
      const graceUnit = (d.graceUnit as string) === "minutes" ? "minutes" : "seconds";
      const seconds = (d.seconds as number) ?? 3600;
      const displayValue = graceUnit === "minutes" ? Math.round(seconds / 60) : seconds;
      const destinationType = (d.destinationType as string) || "lastUser";
      return (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5 leading-snug">
            {t("flowCarenciaHint")}
          </p>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="text-xs">{t("flowCarenciaDesc")}</Label>
            <Switch checked={enabled} onCheckedChange={(v) => onUpdate("enabled", v)} />
          </div>
          {enabled && (
            <>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-24"
                  min={1}
                  value={displayValue}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    const val = Number.isNaN(raw) || raw < 1 ? 1 : raw;
                    const secs = graceUnit === "minutes" ? val * 60 : val;
                    onUpdate("seconds", Math.min(secs, 86400));
                  }}
                />
                <Select value={graceUnit} onValueChange={(v) => onUpdate("graceUnit", v)}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="seconds">{t("botReopenGraceUnitSeconds")}</SelectItem>
                    <SelectItem value="minutes">{t("botReopenGraceUnitMinutes")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("condRouteTo")}</Label>
                <Select
                  value={destinationType}
                  onValueChange={(v) =>
                    onBatchUpdate({ destinationType: v, queueId: undefined, userId: undefined, chatFlowId: undefined })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="lastUser">{t("botReopenDestLastUser")}</SelectItem>
                    <SelectItem value="closedUser">{t("botReopenDestClosedUser")}</SelectItem>
                    <SelectItem value="queue">{t("botReopenDestQueue")}</SelectItem>
                    <SelectItem value="user">{t("botReopenDestUser")}</SelectItem>
                    <SelectItem value="chatflow">{t("botReopenDestChatFlow")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {destinationType === "queue" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("botReopenQueuePicker")}</Label>
                  <Select
                    value={d.queueId != null ? String(d.queueId) : ""}
                    onValueChange={(v) => onUpdate("queueId", Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder={t("selectQueue")} /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {routeOptions.queues.map((q) => (
                        <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {destinationType === "user" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("botReopenUserPicker")}</Label>
                  <Select
                    value={d.userId != null ? String(d.userId) : ""}
                    onValueChange={(v) => onUpdate("userId", Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder={t("selectUser")} /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {routeOptions.users.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {destinationType === "chatflow" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("botReopenChatFlowPicker")}</Label>
                  <Select
                    value={d.chatFlowId != null ? String(d.chatFlowId) : ""}
                    onValueChange={(v) => onUpdate("chatFlowId", Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder={t("selectFlow")} /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {routeOptions.chatflows.map((cf) => (
                        <SelectItem key={cf.id} value={String(cf.id)}>{cf.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    default:
      return (
        <Input
          placeholder={t("valueDefault")}
          value={(d.value as string) || ""}
          onChange={(e) => onUpdate("value", e.target.value)}
        />
      );
  }
}

// ─── CONFIGURATIONS FORM ───────────────────────────────────────────────────────

function getConfigField(
  configurations: Record<string, unknown> | undefined,
  ...path: string[]
): string {
  let obj: unknown = configurations ?? {};
  for (const key of path) {
    if (obj && typeof obj === "object") {
      obj = (obj as Record<string, unknown>)[key];
    } else {
      return "";
    }
  }
  return (obj as string) ?? "";
}

function setConfigField(
  configurations: Record<string, unknown> | undefined,
  value: unknown,
  ...path: string[]
): Record<string, unknown> {
  const config = JSON.parse(JSON.stringify(configurations ?? {})) as Record<string, unknown>;
  let obj = config as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    if (!obj[path[i]] || typeof obj[path[i]] !== "object") obj[path[i]] = {};
    obj = obj[path[i]] as Record<string, unknown>;
  }
  obj[path[path.length - 1]] = value;
  return config;
}

function getNum(cfg: Record<string, unknown>, ...path: string[]): number {
  let obj: unknown = cfg;
  for (const key of path) {
    if (obj && typeof obj === "object") obj = (obj as Record<string, unknown>)[key];
    else return 0;
  }
  return (obj as number) ?? 0;
}

// Helper to render route type radio group (queue/user/close/channel)
function RouteTypeGroup({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const t = useTranslations("flowBuilderNodeForm");
  const opts = [
    { v: 1, label: t("queue") },
    { v: 2, label: t("user") },
    { v: 3, label: t("close") },
    { v: 4, label: t("channel") },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-2 py-1 rounded text-xs border transition-colors ${
            value === o.v
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Select de destino (fila/usuário/canal) com botão para limpar a seleção (destiny = null)
function DestinySelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { id: number; name: string }[];
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("flowBuilderNodeForm");
  return (
    <div className="flex items-center gap-1">
      <Select value={value || ""} onValueChange={(v) => onChange(v)}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent className="max-h-60">{options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
      {!!value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title={t("clearDestiny")}
          aria-label={t("clearDestiny")}
          className="shrink-0 rounded-md border border-border p-2 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ConfigurationsForm({
  editNode,
  setEditNode,
  routeOptions,
}: {
  editNode: FlowNodeData;
  setEditNode: (n: FlowNodeData) => void;
  routeOptions: RouteOptions;
}) {
  const t = useTranslations("flowBuilderNodeForm");
  const cfg = (editNode.configurations ?? {}) as Record<string, unknown>;

  const update = (value: unknown, ...path: string[]) => {
    setEditNode({ ...editNode, configurations: setConfigField(cfg, value, ...path) });
  };

  const notRespTime    = getNum(cfg, "notResponseMessage", "time") || 10;
  const notRespType    = getNum(cfg, "notResponseMessage", "type") || 1;
  const notRespDest    = getConfigField(cfg, "notResponseMessage", "destiny");
  const notRespWarnEn  = !!(cfg as Record<string, unknown> & { notResponseMessage?: Record<string, unknown> })?.notResponseMessage?.messageWarningEnabled;
  const maxRetryNum    = getNum(cfg, "maxRetryBotMessage", "number") || 3;
  const maxRetryType   = getNum(cfg, "maxRetryBotMessage", "type") || 1;
  const maxRetryDest   = getConfigField(cfg, "maxRetryBotMessage", "destiny");
  const firstIntType   = getNum(cfg, "firstInteraction", "type") || 1;
  const firstIntDest   = getConfigField(cfg, "firstInteraction", "destiny");
  const outHoursType   = getNum(cfg, "outOpenHours", "type") || 1;
  const outHoursDest   = getConfigField(cfg, "outOpenHours", "destiny");
  const autoDistrib    = getConfigField(cfg, "autoDistributeTickets") || "N";
  const answerClose    = ((cfg as Record<string, unknown>)?.answerCloseTicket as string[]) ?? [];
  const hasKeyword     = "keyword" in cfg;
  const hasFirstInt    = "firstInteraction" in cfg;
  const hasOutHours    = "outOpenHours" in cfg;
  const [newCloseTag, setNewCloseTag] = React.useState("");

  // Palavra-gatilho: array `keyword.messages` (novo) com fallback do legado `keyword.message`.
  // Grava o array E espelha o 1o item em keyword.message (retrocompat: leitores legados do back
  // que ainda só leem keyword.message continuam disparando pela 1a palavra).
  const kwObj          = (cfg.keyword ?? {}) as { message?: string; messages?: string[] };
  const keywordList    = Array.isArray(kwObj.messages) && kwObj.messages.length
    ? kwObj.messages
    : (kwObj.message ? [kwObj.message] : []);
  const [newKeyword, setNewKeyword] = React.useState("");
  const setKeywords = (list: string[]) => {
    const cleaned = list.map((s) => s.trim()).filter(Boolean);
    setEditNode({
      ...editNode,
      configurations: setConfigField(cfg, { ...kwObj, messages: cleaned, message: cleaned[0] ?? "" }, "keyword"),
    });
  };
  const addKeyword = () => {
    const v = newKeyword.trim();
    if (v && !keywordList.some((k) => k.toLowerCase() === v.toLowerCase())) setKeywords([...keywordList, v]);
    setNewKeyword("");
  };

  return (
    <div className="space-y-4">

      {/* ── Mensagem de Boas-vindas ── */}
      <ConfigCard title={t("welcomeMessage")} subtitle={t("welcomeMessageSubtitle")}>
        <textarea
          className="w-full rounded-md border bg-background p-2 text-sm resize-y"
          rows={3}
          placeholder={t("welcomeMessagePlaceholder")}
          value={getConfigField(cfg, "welcomeMessage", "message")}
          onChange={(e) => update(e.target.value, "welcomeMessage", "message")}
        />
      </ConfigCard>

      {/* ── Fallback (opção inválida) ── */}
      <ConfigCard title={t("invalidOptionMessage")} subtitle={t("invalidOptionMessageSubtitle")}>
        <textarea
          className="w-full rounded-md border bg-background p-2 text-sm resize-y"
          rows={3}
          placeholder={t("typeMessage")}
          value={getConfigField(cfg, "notOptionsSelectMessage", "message")}
          onChange={(e) => update(e.target.value, "notOptionsSelectMessage", "message")}
        />
      </ConfigCard>

      {/* ── Palavra-chave (gatilho) — múltiplas, qualquer uma ativa o fluxo ── */}
      {hasKeyword && (
        <ConfigCard title={t("triggerKeyword")} subtitle={t("triggerKeywordSubtitle")}>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 min-h-[2rem]">
              {keywordList.map((kw, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs">
                  {kw}
                  <button
                    type="button"
                    onClick={() => setKeywords(keywordList.filter((_, idx) => idx !== i))}
                    className="hover:text-destructive"
                  >×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={t("typeAndPressEnter")}
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={addKeyword}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </ConfigCard>
      )}

      {/* ── Sem resposta (timeout) ── */}
      <ConfigCard title={t("noResponse")} subtitle={t("noResponseSubtitle")}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">{t("timeMin")}</Label>
            <Input
              type="number" className="w-20" min={1}
              value={notRespTime}
              onChange={(e) => update(parseInt(e.target.value, 10) || 10, "notResponseMessage", "time")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">{t("routeTo")}</Label>
            <RouteTypeGroup value={notRespType} onChange={(v) => update(v, "notResponseMessage", "type")} />
          </div>
          {notRespType === 1 && (
            <DestinySelect value={notRespDest || ""} placeholder={t("selectQueue")} options={routeOptions.queues} onChange={(v) => update(v, "notResponseMessage", "destiny")} />
          )}
          {notRespType === 2 && (
            <DestinySelect value={notRespDest || ""} placeholder={t("selectUser")} options={routeOptions.users} onChange={(v) => update(v, "notResponseMessage", "destiny")} />
          )}
          {notRespType === 4 && (
            <DestinySelect value={notRespDest || ""} placeholder={t("selectChannel")} options={routeOptions.channels} onChange={(v) => update(v, "notResponseMessage", "destiny")} />
          )}
        </div>
      </ConfigCard>

      {/* ── Mensagem de aviso antes do timeout ── */}
      <ConfigCard title={t("timeoutWarningMessage")} subtitle={t("timeoutWarningMessageSubtitle")}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={notRespWarnEn}
              onCheckedChange={(v) => update(v, "notResponseMessage", "messageWarningEnabled")}
            />
            <Label className="text-xs">{t("enableWarningMessage")}</Label>
          </div>
          {notRespWarnEn && (
            <textarea
              className="w-full rounded-md border bg-background p-2 text-sm resize-y"
              rows={3}
              placeholder={t("warningMessagePlaceholder")}
              value={getConfigField(cfg, "notResponseMessage", "messageWarning")}
              onChange={(e) => update(e.target.value, "notResponseMessage", "messageWarning")}
            />
          )}
        </div>
      </ConfigCard>

      {/* ── Mensagem ao timeout ── */}
      <ConfigCard title={t("timeoutCloseMessage")} subtitle={t("timeoutCloseMessageSubtitle")}>
        <textarea
          className="w-full rounded-md border bg-background p-2 text-sm resize-y"
          rows={3}
          placeholder={t("timeoutCloseMessagePlaceholder")}
          value={getConfigField(cfg, "notResponseMessage", "message")}
          onChange={(e) => update(e.target.value, "notResponseMessage", "message")}
        />
      </ConfigCard>

      {/* ── Máximo de tentativas ── */}
      <ConfigCard title={t("maxBotRetries")} subtitle={t("maxBotRetriesSubtitle")}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">{t("retries")}</Label>
            <Input
              type="number" className="w-20" min={1}
              value={maxRetryNum}
              onChange={(e) => update(parseInt(e.target.value, 10) || 3, "maxRetryBotMessage", "number")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">{t("routeTo")}</Label>
            <RouteTypeGroup value={maxRetryType} onChange={(v) => update(v, "maxRetryBotMessage", "type")} />
          </div>
          {maxRetryType === 1 && (
            <DestinySelect value={maxRetryDest || ""} placeholder={t("selectQueue")} options={routeOptions.queues} onChange={(v) => update(v, "maxRetryBotMessage", "destiny")} />
          )}
          {maxRetryType === 2 && (
            <DestinySelect value={maxRetryDest || ""} placeholder={t("selectUser")} options={routeOptions.users} onChange={(v) => update(v, "maxRetryBotMessage", "destiny")} />
          )}
          {maxRetryType === 4 && (
            <DestinySelect value={maxRetryDest || ""} placeholder={t("selectChannel")} options={routeOptions.channels} onChange={(v) => update(v, "maxRetryBotMessage", "destiny")} />
          )}
        </div>
      </ConfigCard>

      {/* ── Primeira interação ── */}
      {hasFirstInt && (
        <ConfigCard title={t("firstInteraction")} subtitle={t("firstInteractionSubtitle")}>
          <div className="space-y-2">
            <RouteTypeGroup value={firstIntType} onChange={(v) => update(v, "firstInteraction", "type")} />
            {firstIntType === 1 && (
              <DestinySelect value={firstIntDest || ""} placeholder={t("selectQueue")} options={routeOptions.queues} onChange={(v) => update(v, "firstInteraction", "destiny")} />
            )}
            {firstIntType === 2 && (
              <DestinySelect value={firstIntDest || ""} placeholder={t("selectUser")} options={routeOptions.users} onChange={(v) => update(v, "firstInteraction", "destiny")} />
            )}
            {firstIntType === 4 && (
              <DestinySelect value={firstIntDest || ""} placeholder={t("selectChannel")} options={routeOptions.channels} onChange={(v) => update(v, "firstInteraction", "destiny")} />
            )}
          </div>
        </ConfigCard>
      )}

      {/* ── Fora do horário ── */}
      {hasOutHours && (
        <ConfigCard title={t("outOfHours")} subtitle={t("outOfHoursSubtitle")}>
          <div className="space-y-2">
            <RouteTypeGroup value={outHoursType} onChange={(v) => update(v, "outOpenHours", "type")} />
            {outHoursType === 1 && (
              <DestinySelect value={outHoursDest || ""} placeholder={t("selectQueue")} options={routeOptions.queues} onChange={(v) => update(v, "outOpenHours", "destiny")} />
            )}
            {outHoursType === 2 && (
              <DestinySelect value={outHoursDest || ""} placeholder={t("selectUser")} options={routeOptions.users} onChange={(v) => update(v, "outOpenHours", "destiny")} />
            )}
            {outHoursType === 4 && (
              <DestinySelect value={outHoursDest || ""} placeholder={t("selectChannel")} options={routeOptions.channels} onChange={(v) => update(v, "outOpenHours", "destiny")} />
            )}
          </div>
        </ConfigCard>
      )}

      {/* ── Auto distribuir tickets ── */}
      <ConfigCard title={t("autoDistribution")} subtitle={t("autoDistributionSubtitle")}>
        <div className="space-y-2">
          {[
            { v: "N", label: t("distNone"), desc: t("distNoneDesc") },
            { v: "R", label: t("distRandom"), desc: t("distRandomDesc") },
            { v: "B", label: t("distBalanced"), desc: t("distBalancedDesc") },
            { v: "S", label: t("distSequential"), desc: t("distSequentialDesc") },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => update(o.v, "autoDistributeTickets")}
              className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                autoDistrib === o.v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              <span className="text-xs font-semibold block">{o.label}</span>
              <span className={`text-xs block ${autoDistrib === o.v ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{o.desc}</span>
            </button>
          ))}
        </div>
      </ConfigCard>

      {/* ── Parâmetros para fechar ticket ── */}
      <ConfigCard title={t("closeTicketParams")} subtitle={t("closeTicketParamsSubtitle")}>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1 min-h-[2rem]">
            {answerClose.map((tag, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs">
                {tag}
                <button
                  type="button"
                  onClick={() => update(answerClose.filter((_, idx) => idx !== i), "answerCloseTicket")}
                  className="hover:text-destructive"
                >×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t("typeAndPressEnter")}
              value={newCloseTag}
              onChange={(e) => setNewCloseTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCloseTag.trim()) {
                  update([...answerClose, newCloseTag.trim()], "answerCloseTicket");
                  setNewCloseTag("");
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={() => {
              if (newCloseTag.trim()) {
                update([...answerClose, newCloseTag.trim()], "answerCloseTicket");
                setNewCloseTag("");
              }
            }}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </ConfigCard>

      {/* ── Mensagem de Despedida ── */}
      <ConfigCard title={t("farewellMessage")} subtitle={t("farewellMessageSubtitle")}>
        <textarea
          className="w-full rounded-md border bg-background p-2 text-sm resize-y"
          rows={3}
          placeholder={t("farewellMessagePlaceholder")}
          value={getConfigField(cfg, "farewellMessage", "message")}
          onChange={(e) => update(e.target.value, "farewellMessage", "message")}
        />
      </ConfigCard>

    </div>
  );
}

// Card visual para cada seção de configuração
function ConfigCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted px-3 py-2 border-b">
        <p className="text-sm font-semibold">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="p-3">
        {children}
      </div>
    </div>
  );
}

