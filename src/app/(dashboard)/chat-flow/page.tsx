"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Workflow,
  Plus,
  Search,
  Pencil,
  Trash2,
  Copy,
  Upload,
  ArrowLeft,
  Settings2,
  Phone,
  ArrowUpDown,
  Filter,
  UserPlus,
  RotateCcw,
  SlidersHorizontal,
  ArrowUp,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { FlowEditor } from "@/components/flow-builder/flow-editor";
import { createDefaultFlow } from "@/components/flow-builder/lib/default-flow";
import type { ChatFlowRecord, FlowData } from "@/components/flow-builder/lib/types";
import {
  fetchChatFlows,
  createChatFlow,
  updateChatFlow,
  deleteChatFlow,
  duplicateChatFlow,
  importChatFlowJson,
  fetchChatFlowIntegrity,
  type ChatFlowIntegrityReport,
} from "@/services/chatflow";
import { formatDateTime } from "@/lib/utils";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import {
  AudienceFields,
  defaultAudienceValue,
  extractAudienceFromFlow,
  type AudienceValue,
} from "@/components/chat-flow/audience-fields";

export default function ChatFlowPage() {
  const t = useTranslations("chatFlowPage");
  const tAud = useTranslations("chatFlowAudience");
  const allowed = usePageAccess("chat-flow", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<ChatFlowRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editingFlow, setEditingFlow] = useState<ChatFlowRecord | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowCelular, setNewFlowCelular] = useState("");
  const [newFlowActive, setNewFlowActive] = useState(true);
  const [creating, setCreating] = useState(false);
  // Metadata edit dialog (name, isActive, celularTeste — separate from the flow editor)
  const [metaDialogFlow, setMetaDialogFlow] = useState<ChatFlowRecord | null>(null);
  const [metaName, setMetaName] = useState("");
  const [metaCelular, setMetaCelular] = useState("");
  const [metaActive, setMetaActive] = useState(true);
  const [metaAudience, setMetaAudience] = useState<AudienceValue>(defaultAudienceValue());
  const [savingMeta, setSavingMeta] = useState(false);
  // Create dialog audience
  const [newAudience, setNewAudience] = useState<AudienceValue>(defaultAudienceValue());
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "updated">("name-asc");
  const [flowDirty, setFlowDirty] = useState(false);
  const [confirmBackOpen, setConfirmBackOpen] = useState(false);
  const [deleteConfirmFlow, setDeleteConfirmFlow] = useState<ChatFlowRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Integridade: fluxos com transferência apontando para fila/atendente/canal
  // excluído (backend GET /chat-flow-integrity). Best-effort — sem badge em erro.
  const [integrity, setIntegrity] = useState<Record<number, ChatFlowIntegrityReport>>({});

  const loadIntegrity = useCallback(() => {
    fetchChatFlowIntegrity()
      .then(({ data }) => {
        const map: Record<number, ChatFlowIntegrityReport> = {};
        (Array.isArray(data) ? data : []).forEach((r) => {
          map[r.chatFlowId] = r;
        });
        setIntegrity(map);
      })
      .catch(() => {});
  }, []);

  const loadFlows = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await fetchChatFlows();
      const list = Array.isArray(data) ? data : data?.chatFlow ?? []
      setFlows(list);
      loadIntegrity();
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  const filtered = flows
    .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name-asc") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (sortBy === "name-desc") return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const handleCreate = async () => {
    if (!newFlowName.trim()) return;
    setCreating(true);
    try {
      const trimmedName = newFlowName.trim();
      const defaultFlow = createDefaultFlow(trimmedName);
      // Send the full flow structure at the top level matching Vue's CriarChatFlow format:
      // { name, nodeList, lineList, isActive, action, celularTeste, id }
      const { data } = await createChatFlow({
        name: trimmedName,
        isActive: newFlowActive,
        action: 0,
        celularTeste: newFlowCelular.trim() || null,
        id: null,
        nodeList: defaultFlow.nodeList,
        lineList: defaultFlow.lineList,
        audienceEnabled: newAudience.audienceEnabled,
        targetAudience: newAudience.targetAudience,
        audienceMaxAgeDays: newAudience.audienceMaxAgeDays,
        audienceTags: newAudience.audienceTags,
        audienceExcludeTags: newAudience.audienceExcludeTags,
        audienceKanbanId: newAudience.audienceKanbanId,
        audienceChannels: newAudience.audienceChannels,
        audienceScheduleEnabled: newAudience.audienceScheduleEnabled,
        audienceScheduleWindows: newAudience.audienceScheduleWindows,
        priority: newAudience.priority,
      });
      setCreateDialogOpen(false);
      setNewFlowName("");
      setNewFlowCelular("");
      setNewFlowActive(true);
      setNewAudience(defaultAudienceValue());
      // After creation, open the editor immediately
      if (data) {
        setEditingFlow(data);
      }
      toast.success(t("createSuccess"));
      loadFlows();
    } catch {
      toast.error(t("createError"));
    } finally {
      setCreating(false);
    }
  };

  const openMetaDialog = (flow: ChatFlowRecord) => {
    setMetaDialogFlow(flow);
    setMetaName(flow.name);
    setMetaCelular(flow.celularTeste || "");
    setMetaActive(!!(flow.isActive || flow.status));
    setMetaAudience(extractAudienceFromFlow(flow as unknown as Record<string, unknown>));
  };

  const handleSaveMeta = async () => {
    if (!metaDialogFlow) return;
    setSavingMeta(true);
    try {
      await updateChatFlow(metaDialogFlow.id, {
        ...metaDialogFlow,
        name: metaName.trim() || metaDialogFlow.name,
        isActive: metaActive,
        celularTeste: metaCelular.trim() || null,
        audienceEnabled: metaAudience.audienceEnabled,
        targetAudience: metaAudience.targetAudience,
        audienceMaxAgeDays: metaAudience.audienceMaxAgeDays,
        audienceTags: metaAudience.audienceTags,
        audienceExcludeTags: metaAudience.audienceExcludeTags,
        audienceKanbanId: metaAudience.audienceKanbanId,
        audienceChannels: metaAudience.audienceChannels,
        audienceScheduleEnabled: metaAudience.audienceScheduleEnabled,
        audienceScheduleWindows: metaAudience.audienceScheduleWindows,
        priority: metaAudience.priority,
      });
      toast.success(t("editSuccess"));
      setMetaDialogFlow(null);
      loadFlows();
    } catch {
      toast.error(t("editError"));
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDelete = (flow: ChatFlowRecord) => {
    setDeleteConfirmFlow(flow);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmFlow) return;
    setDeleting(true);
    try {
      await deleteChatFlow(deleteConfirmFlow.id);
      setFlows((prev) => prev.filter((f) => f.id !== deleteConfirmFlow.id));
      toast.success(t("deleteSuccess"));
      setDeleteConfirmFlow(null);
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (flow: ChatFlowRecord) => {
    try {
      await duplicateChatFlow(flow.id, `${flow.name} (cópia)`);
      loadFlows();
      toast.success(t("duplicateSuccess"));
    } catch {
      toast.error(t("duplicateError"));
    }
  };

  const handleImportJson = async (flowId: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        await importChatFlowJson(flowId, json);
        loadFlows();
        toast.success(t("importSuccess"));
      } catch {
        toast.error(t("importError"));
      }
    };
    input.click();
  };

  const handleSaveFlow = async (flowData: FlowData) => {
    if (!editingFlow) return;
    // The backend expects the full flow record with a nested `flow` property
    // that contains the actual flow structure (name, nodeList, lineList).
    // This mirrors what the Vue panel does: { ...cDataFlow.flow, flow: this.data }
    const { data } = await updateChatFlow(editingFlow.id, {
      ...editingFlow,
      flow: {
        name: flowData.name,
        nodeList: flowData.nodeList || [],
        lineList: flowData.lineList || [],
      },
    });
    loadFlows();
    // Devolve o flow como o SERVIDOR o gravou (base64 de mídia extraído para
    // arquivo, mediaUrl reescrita) — o editor usa isso para descartar os
    // base64 da sessão e não re-enviá-los em todo save.
    const savedFlow = (data as { flow?: FlowData } | undefined)?.flow;
    return savedFlow && Array.isArray(savedFlow.nodeList) ? savedFlow : undefined;
  };

  if (editingFlow) {
    const raw = editingFlow.flow;
    // The DB record stores flow data under the `flow` key.
    // Try: record.flow.flow (in case it's double-nested), then record.flow itself.
    // Fall back to undefined if there's no valid nodeList (so the editor uses the default).
    const candidate = (raw?.flow as FlowData | undefined) ?? (raw as unknown as FlowData | undefined);
    const flowData: FlowData | undefined =
      candidate && Array.isArray((candidate as FlowData).nodeList)
        ? (candidate as FlowData)
        : undefined;
    return (
      <>
        <div className="flex h-[calc(100vh-4rem)] flex-col">
          <div className="flex items-center gap-3 border-b p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (flowDirty) {
                  setConfirmBackOpen(true);
                } else {
                  setEditingFlow(null);
                  setFlowDirty(false);
                  loadFlows();
                }
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> {t("back")}
            </Button>
            <div className="h-6 w-px bg-border" />
            <h2 className="text-lg font-semibold">{editingFlow.name}</h2>
            <Badge variant="secondary" className="text-xs">
              ID: {editingFlow.id}
            </Badge>
          </div>
          <div className="flex-1">
            <FlowEditor
              initialData={flowData}
              flowName={editingFlow.name}
              onSave={handleSaveFlow}
              onDirtyChange={setFlowDirty}
            />
          </div>
        </div>

        {/* Confirmação ao voltar com mudanças não salvas */}
        <Dialog open={confirmBackOpen} onOpenChange={setConfirmBackOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("unsavedChangesTitle")}</DialogTitle>
              <DialogDescription>{t("unsavedChangesDesc")}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmBackOpen(false)}>{t("keepEditing")}</Button>
              <Button variant="destructive" onClick={() => { setConfirmBackOpen(false); setFlowDirty(false); setEditingFlow(null); loadFlows(); }}>{t("discardChanges")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            {
              title: t("helpS0T"),
              items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2"), t("helpS0I3")],
            },
            {
              title: t("helpS1T"),
              items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2"), t("helpS1I3")],
            },
            {
              title: t("helpS2T"),
              items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")],
            },
          ],
        }}
      >
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> {t("newFlow")}
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[180px]" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[180px] gap-1">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">{t("sortNameAsc")}</SelectItem>
                <SelectItem value="name-desc">{t("sortNameDesc")}</SelectItem>
                <SelectItem value="updated">{t("sortUpdated")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Workflow}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            >
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> {t("newFlow")}
              </Button>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((flow) => {
                const flowInner = (flow.flow?.flow ?? flow.flow) as FlowData | undefined;
                const nodeCount = flowInner?.nodeList?.length || 0;
                const audienceRec = flow as unknown as Record<string, unknown>;
                const audienceEnabled = audienceRec.audienceEnabled === true;
                const audienceMode = (audienceRec.targetAudience as string) || "all";
                const audiencePriority = Number(audienceRec.priority || 0);
                const audienceHasFilters =
                  (Array.isArray(audienceRec.audienceTags) && (audienceRec.audienceTags as unknown[]).length > 0) ||
                  (Array.isArray(audienceRec.audienceExcludeTags) && (audienceRec.audienceExcludeTags as unknown[]).length > 0) ||
                  audienceRec.audienceKanbanId != null ||
                  (Array.isArray(audienceRec.audienceChannels) && (audienceRec.audienceChannels as unknown[]).length > 0);
                return (
                  <Card key={flow.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <CardTitle className="truncate text-base">{flow.name}</CardTitle>
                          <Badge variant="secondary" className="text-xs shrink-0">ID: {flow.id}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t("nodes", { count: nodeCount })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <Badge variant={flow.isActive || flow.status ? "success" : "secondary"}>
                          {flow.isActive || flow.status ? t("active") : t("inactive")}
                        </Badge>
                        {integrity[flow.id] && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-destructive/15 px-1.5 text-[10px] font-semibold text-destructive ring-1 ring-destructive/25">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                {t("integrityBadge")}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium">{t("integrityTooltipTitle")}</p>
                              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                {integrity[flow.id].issues.slice(0, 6).map((iss, idx) => (
                                  <li key={idx}>
                                    {iss.where === "condition"
                                      ? t("integrityWhereNode", { node: iss.nodeName || iss.nodeId || "?" })
                                      : iss.where === "maxRetryBotMessage"
                                        ? t("integrityWhereMaxRetry")
                                        : iss.where === "firstInteraction"
                                          ? t("integrityWhereFirstInteraction")
                                          : iss.where === "notResponseMessage"
                                            ? t("integrityWhereNotResponse")
                                            : t("integrityWhereOutOpenHours")}
                                    {" → "}
                                    {iss.kind === "user"
                                      ? t("integrityKindUser", { id: iss.refId })
                                      : iss.kind === "queue"
                                        ? t("integrityKindQueue", { id: iss.refId })
                                        : t("integrityKindChannel", { id: iss.refId })}
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-1 text-xs opacity-80">{t("integrityFix")}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {audienceEnabled && (
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20">
                                  <Filter className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{tAud("badgeEnabled")}</TooltipContent>
                            </Tooltip>
                            {audienceMode === "new" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                    <UserPlus className="h-3 w-3" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{tAud("badgeNew")}</TooltipContent>
                              </Tooltip>
                            )}
                            {audienceMode === "returning" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                                    <RotateCcw className="h-3 w-3" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{tAud("badgeReturning")}</TooltipContent>
                              </Tooltip>
                            )}
                            {(audienceMode === "custom" || (audienceMode === "all" && audienceHasFilters)) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                                    <SlidersHorizontal className="h-3 w-3" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{tAud("badgeCustom")}</TooltipContent>
                              </Tooltip>
                            )}
                            {audiencePriority > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center gap-0.5 rounded-full bg-secondary px-1 text-[10px] font-semibold text-secondary-foreground ring-1 ring-border">
                                    <ArrowUp className="h-2.5 w-2.5" />
                                    {audiencePriority}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{tAud("badgePriority", { n: audiencePriority })}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {t("updatedAt")}: {formatDateTime(flow.updatedAt)}
                      </p>
                      {flow.celularTeste && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1 mb-3">
                          <Phone className="h-3 w-3 shrink-0" />
                          {flow.celularTeste}
                        </p>
                      )}
                      {!flow.celularTeste && <div className="mb-3" />}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t("editFlow")}
                          onClick={() => setEditingFlow(flow)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t("editMetadata")}
                          onClick={() => openMetaDialog(flow)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t("duplicate")}
                          onClick={() => handleDuplicate(flow)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t("importJson")}
                          onClick={() => handleImportJson(flow.id)}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t("delete")}
                          onClick={() => handleDelete(flow)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("newFlow")}</DialogTitle>
            <DialogDescription>{t("newFlowDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("flowName")}</Label>
              <Input
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                placeholder={t("flowNamePlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("testNumber")}</Label>
              <Input
                value={newFlowCelular}
                onChange={(e) => setNewFlowCelular(e.target.value)}
                placeholder={t("testNumberPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("testNumberHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newFlowActive}
                onCheckedChange={setNewFlowActive}
                id="create-active"
              />
              <Label htmlFor="create-active">{t("active")}</Label>
            </div>
            <AudienceFields value={newAudience} onChange={setNewAudience} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newFlowName.trim()}>
              {creating ? t("creating") : t("createFlow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Metadata edit dialog — edit name, isActive, celularTeste without opening the editor */}
      <Dialog open={!!metaDialogFlow} onOpenChange={(o) => { if (!o) setMetaDialogFlow(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editMetadata")}</DialogTitle>
            <DialogDescription>{metaDialogFlow?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("flowName")}</Label>
              <Input
                value={metaName}
                onChange={(e) => setMetaName(e.target.value)}
                placeholder={t("flowNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("testNumber")}</Label>
              <Input
                value={metaCelular}
                onChange={(e) => setMetaCelular(e.target.value)}
                placeholder={t("testNumberPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("testNumberHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={metaActive}
                onCheckedChange={setMetaActive}
                id="meta-active"
              />
              <Label htmlFor="meta-active">{t("active")}</Label>
            </div>
            <AudienceFields value={metaAudience} onChange={setMetaAudience} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaDialogFlow(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSaveMeta} disabled={savingMeta}>
              {savingMeta ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <Dialog open={!!deleteConfirmFlow} onOpenChange={(o) => { if (!o) setDeleteConfirmFlow(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirmDesc", { name: deleteConfirmFlow?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmFlow(null)} disabled={deleting}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? t("deleting") : t("confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
