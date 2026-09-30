"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, ArrowRight, Pencil, Trash2, RefreshCw, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  fetchPipelines,
  createPipeline,
  updatePipeline,
  deletePipeline,
  fetchStages,
  createStage,
  updateStage,
  deleteStage,
  fetchPipelineActionsByStage,
  fetchPipelineActionsByPipeline,
  deletePipelineAction,
} from "@/services/funnel";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchAllUsers } from "@/services/users";

interface Pipeline {
  id: number;
  name: string;
}

// O interceptor de `lib/api` rejeita com `error.response || error`, então o
// corpo está em `.data`; o caminho de refresh de sessão rejeita o erro inteiro
// do axios, daí o segundo salto.
const readApiError = (err: any): { error?: string; code?: string; details?: unknown } | null =>
  err?.data ?? err?.response?.data ?? null;

interface Stage {
  id?: number;
  _uid: string;
  name: string;
  color: string;
  order?: number;
  pipelineId?: number;
  notifyUserId?: number | null;
  notifyQueueId?: number | null;
  _deleted?: boolean;
}

interface SortableStageProps {
  stage: Stage;
  idx: number;
  dragLabel: string;
  stageNameLabel: string;
  stageNamePlaceholder: string;
  stageColorLabel: string;
  removeLabel: string;
  notifyUserLabel: string;
  notifyQueueLabel: string;
  noneLabel: string;
  queues: { id: number; name: string }[];
  users: { id: number; name: string }[];
  onNameChange: (idx: number, val: string) => void;
  onColorChange: (idx: number, val: string) => void;
  onNotifyUserChange: (idx: number, val: number | null) => void;
  onNotifyQueueChange: (idx: number, val: number | null) => void;
  onRemove: (idx: number) => void;
}

const SortableStage: React.FC<SortableStageProps> = ({
  stage,
  idx,
  dragLabel,
  stageNameLabel,
  stageNamePlaceholder,
  stageColorLabel,
  removeLabel,
  notifyUserLabel,
  notifyQueueLabel,
  noneLabel,
  queues,
  users,
  onNameChange,
  onColorChange,
  onNotifyUserChange,
  onNotifyQueueChange,
  onRemove,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage._uid,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-muted border rounded-xl p-3 min-w-[200px] flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        {stage.id ? (
          <p className="text-xs text-muted-foreground">ID: #{stage.id}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground active:cursor-grabbing"
          title={dragLabel}
          aria-label={dragLabel}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{stageNameLabel}</Label>
        <Input
          placeholder={stageNamePlaceholder}
          value={stage.name}
          onChange={(e) => onNameChange(idx, e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{stageColorLabel}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={stage.color}
            onChange={(e) => onColorChange(idx, e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border"
          />
          <Input
            value={stage.color}
            onChange={(e) => onColorChange(idx, e.target.value)}
            className="font-mono text-xs"
            placeholder="#00a300"
          />
        </div>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{notifyQueueLabel}</Label>
        <Select
          value={stage.notifyQueueId != null ? String(stage.notifyQueueId) : "none"}
          onValueChange={(v) => onNotifyQueueChange(idx, v === "none" ? null : Number(v))}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={noneLabel} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{noneLabel}</SelectItem>
            {queues.map((q) => (
              <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{notifyUserLabel}</Label>
        <Select
          value={stage.notifyUserId != null ? String(stage.notifyUserId) : "none"}
          onValueChange={(v) => onNotifyUserChange(idx, v === "none" ? null : Number(v))}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={noneLabel} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{noneLabel}</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => onRemove(idx)}
      >
        <Trash2 className="h-3 w-3 mr-1" />
        {removeLabel}
      </Button>
    </div>
  );
};

export default function FunilPipelinesPage() {
  // Gate isolado num wrapper: sair com `return` no meio dos hooks do conteúdo
  // quebrava o React ("Rendered fewer hooks than expected") quando a permissão
  // caía com a página montada — o teto do tenant chega após o 1º render.
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;
  return <FunilPipelinesPageContent />;
}

function FunilPipelinesPageContent() {
  const t = useTranslations("funilPipelinesPage");
  const [loading, setLoading] = useState(true);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pipeline | null>(null);
  const [name, setName] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [deletedStages, setDeletedStages] = useState<Stage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Pipeline | null>(null);
  const stageUidRef = useRef(0);
  const newStageUid = () => `tmp-${++stageUidRef.current}`;

  // Listas para os selects de notificação por etapa
  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fetchQueues()
      .then((res) => setQueues(((res.data as Queue[]) || []).filter((q) => q.isActive !== false)))
      .catch(() => {});
    fetchAllUsers()
      .then((res) => setUsers((res.data as { users?: { id: number; name: string }[] })?.users || []))
      .catch(() => {});
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStages((prev) => {
      const oldIndex = prev.findIndex((s) => s._uid === active.id);
      const newIndex = prev.findIndex((s) => s._uid === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPipelines();
      const raw = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
      setPipelines(Array.isArray(raw) ? raw : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setStages([]);
    setDeletedStages([]);
    setDialogOpen(true);
  };

  // Devolve as etapas do servidor, ou `null` quando a leitura falha — quem
  // chama decide: abrir o modal zera a lista (como sempre foi), recarregar
  // depois de uma falha de exclusão PRESERVA o que está na tela.
  const fetchStagesOf = async (pipelineId: number): Promise<Stage[] | null> => {
    try {
      const res = await fetchStages({ pipelineId });
      const raw = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
      const list = (Array.isArray(raw) ? raw : []).slice().sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
      );
      return list.map((s: any) => ({
        id: s.id,
        _uid: `db-${s.id}`,
        name: s.name ?? s.nome ?? "",
        color: s.color ?? s.cor ?? "#00a300",
        order: s.order,
        pipelineId: s.pipelineId,
        notifyUserId: s.notifyUserId ?? null,
        notifyQueueId: s.notifyQueueId ?? null,
      }));
    } catch {
      return null;
    }
  };

  const openEdit = async (p: Pipeline) => {
    setEditing(p);
    setName(p.name);
    setDeletedStages([]);
    setStages((await fetchStagesOf(p.id)) ?? []);
    setDialogOpen(true);
  };

  const addStage = () => {
    setStages((prev) => [...prev, { _uid: newStageUid(), name: "", color: "#00a300" }]);
  };

  const removeStage = (idx: number) => {
    setStages((prev) => {
      const stage = prev[idx];
      if (stage.id) {
        setDeletedStages((d) => [...d, stage]);
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const updateStageName = (idx: number, val: string) => {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, name: val } : s)));
  };

  const updateStageColor = (idx: number, val: string) => {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, color: val } : s)));
  };

  const updateStageNotifyUser = (idx: number, val: number | null) => {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, notifyUserId: val } : s)));
  };

  const updateStageNotifyQueue = (idx: number, val: number | null) => {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, notifyQueueId: val } : s)));
  };

  const stageLabel = (value?: string) => (value || "").trim() || t("unnamedStage");

  // Traduz a recusa do backend. `code`/`details` são aditivos: backend antigo
  // manda só `error` e a mensagem cai no texto genérico, sem quebrar a tela.
  const describeStageDeleteError = (stageName: string | undefined, err: unknown): string => {
    const data = readApiError(err);
    const stage = stageLabel(stageName);
    const details = (data?.details ?? {}) as Record<string, any>;

    if (data?.code === "ERR_STAGE_HAS_OPPORTUNITIES") {
      const byStatus = (details.byStatus ?? {}) as Record<string, number>;
      const known: Record<string, string> = {
        open: t("oppStatusOpen"),
        win: t("oppStatusWin"),
        lose: t("oppStatusLose"),
      };
      const parts: string[] = [];
      let others = 0;
      for (const [status, amount] of Object.entries(byStatus)) {
        const count = Number(amount) || 0;
        if (count <= 0) continue;
        if (known[status]) parts.push(`${known[status]}: ${count}`);
        else others += count;
      }
      if (others > 0) parts.push(`${t("oppStatusOther")}: ${others}`);
      // Sem detalhe utilizável cai no texto genérico, que carrega a mensagem
      // crua do servidor — melhor que um parêntese vazio.
      if (parts.length > 0) return t("blockedOpportunities", { stage, detail: parts.join(", ") });
    }

    if (data?.code === "ERR_STAGE_HAS_ACTIONS") {
      const parts: string[] = [];
      if (Number(details.asSource) > 0) parts.push(`${t("actionsFromStage")}: ${details.asSource}`);
      if (Number(details.asTarget) > 0) parts.push(`${t("actionsToStage")}: ${details.asTarget}`);
      if (Number(details.inactive) > 0) parts.push(`${t("actionsInactive")}: ${details.inactive}`);
      if (parts.length > 0) return t("blockedActions", { stage, detail: parts.join(", ") });
    }

    return t("blockedStageGeneric", { stage, reason: data?.error || t("genericFailure") });
  };

  // Apaga as ações do funil vinculadas à etapa. Segue engolindo erro de propósito:
  // é limpeza preparatória, e o que decide o resultado é o DELETE da etapa.
  const deleteActionsOfStage = async (stageId: number) => {
    try {
      const actRes = await fetchPipelineActionsByStage(stageId);
      const acts: any[] = actRes.data?.data ?? (Array.isArray(actRes.data) ? actRes.data : []);
      for (const act of acts) {
        try { await deletePipelineAction(act.id); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  };

  // Tenta excluir a etapa e devolve o erro quando o backend recusa (ou `null`).
  // A etapa é tentada ANTES da limpeza de ações: quando a recusa é por
  // oportunidade vinculada, as ações do funil ficam intactas em vez de serem
  // apagadas por uma exclusão que nunca vai acontecer. Backend antigo não manda
  // `code` — nesse caso cai no comportamento de sempre (limpa e tenta de novo).
  const tryDeleteStage = async (stageId: number): Promise<unknown | null> => {
    try {
      await deleteStage(stageId);
      return null;
    } catch (err) {
      if (readApiError(err)?.code === "ERR_STAGE_HAS_OPPORTUNITIES") return err;
      await deleteActionsOfStage(stageId);
      try {
        await deleteStage(stageId);
        return null;
      } catch (retryErr) {
        return retryErr;
      }
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("validationName"));
      return;
    }
    const isEdit = !!editing;
    setSubmitting(true);
    try {
      let pipelineId: number;
      if (editing) {
        await updatePipeline(editing.id, { name });
        pipelineId = editing.id;
      } else {
        const res = await createPipeline({ name });
        pipelineId = res.data?.id ?? res.data?.data?.id;
      }

      // Motivos de recusa acumulados: o modal só fecha quando está vazio.
      const blocked: string[] = [];

      // Delete removed stages
      for (const stage of deletedStages) {
        if (!stage.id) continue;
        const err = await tryDeleteStage(stage.id);
        if (err) blocked.push(describeStageDeleteError(stage.name, err));
      }

      // Create/update stages
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const payload = {
          name: stage.name,
          color: stage.color,
          order: i,
          pipelineId,
          notifyUserId: stage.notifyUserId ?? null,
          notifyQueueId: stage.notifyQueueId ?? null,
        };
        try {
          if (stage.id) {
            await updateStage(stage.id, payload);
          } else {
            await createStage(payload);
          }
        } catch (err) {
          blocked.push(
            t("stageSaveFailed", {
              stage: stageLabel(stage.name),
              reason: readApiError(err)?.error || t("genericFailure"),
            })
          );
        }
      }

      if (blocked.length > 0) {
        // Nada de "salvo com sucesso": o modal fica aberto mostrando o que o
        // servidor realmente tem, para a etapa recusada não sumir e só voltar no F5.
        if (Number.isFinite(pipelineId)) {
          // Sem isso, um 2º clique em Salvar criaria outro pipeline.
          if (!isEdit) setEditing({ id: pipelineId, name });
          const fresh = await fetchStagesOf(pipelineId);
          if (fresh) setStages(fresh);
        }
        // A etapa recusada volta VISÍVEL na lista, logo não está mais marcada
        // para exclusão: para tentar de novo o operador remove outra vez.
        setDeletedStages([]);
        blocked.slice(0, 3).forEach((msg) => toast.error(msg, { duration: 10000 }));
        loadData();
        return;
      }

      toast.success(isEdit ? t("pipelineUpdated") : t("pipelineCreated"));
      setDialogOpen(false);
      loadData();
    } catch {
      toast.error(isEdit ? t("errorUpdate") : t("errorCreate"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      // Delete all pipeline actions (covers pipeline-level and stage-level)
      try {
        const paRes = await fetchPipelineActionsByPipeline(deleting.id);
        const pipelineActs: any[] = paRes.data?.data ?? (Array.isArray(paRes.data) ? paRes.data : []);
        for (const act of pipelineActs) {
          try { await deletePipelineAction(act.id); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      // Delete all stages (and their remaining actions)
      try {
        const stRes = await fetchStages({ pipelineId: deleting.id });
        const stList: any[] = stRes.data?.data ?? (Array.isArray(stRes.data) ? stRes.data : []);
        for (const st of stList) {
          try {
            const actRes = await fetchPipelineActionsByStage(st.id);
            const acts: any[] = actRes.data?.data ?? (Array.isArray(actRes.data) ? actRes.data : []);
            for (const act of acts) {
              try { await deletePipelineAction(act.id); } catch { /* ignore */ }
            }
          } catch { /* ignore */ }
          try { await deleteStage(st.id); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      await deletePipeline(deleting.id);
      toast.success(t("pipelineDeleted"));
      setDeleteDialogOpen(false);
      setDeleting(null);
      loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t("errorDelete");
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("refresh")}
        </Button>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("newPipeline")}
        </Button>
      </div>

      {pipelines.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ArrowRight className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("noData")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("noDataDesc")}
              </p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {t("createPipeline")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colId")}</TableHead>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipelines.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground text-xs">{p.id}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setDeleting(p); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("editPipeline") : t("newPipelineTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("pipelineNameLabel")}</Label>
              <Input
                placeholder={t("pipelineNamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="font-semibold text-sm">{t("stagesSection")}</div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stages.map((s) => s._uid)}
                  strategy={rectSortingStrategy}
                >
                  <div className="flex flex-wrap gap-4">
                    {stages.map((stage, idx) => (
                      <SortableStage
                        key={stage._uid}
                        stage={stage}
                        idx={idx}
                        dragLabel={t("dragToReorder")}
                        stageNameLabel={t("stageName")}
                        stageNamePlaceholder={t("stageNamePlaceholder")}
                        stageColorLabel={t("stageColor")}
                        removeLabel={t("removeStage")}
                        notifyUserLabel={t("stageNotifyUser")}
                        notifyQueueLabel={t("stageNotifyQueue")}
                        noneLabel={t("stageNotifyNone")}
                        queues={queues}
                        users={users}
                        onNameChange={updateStageName}
                        onColorChange={updateStageColor}
                        onNotifyUserChange={updateStageNotifyUser}
                        onNotifyQueueChange={updateStageNotifyQueue}
                        onRemove={removeStage}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <Button variant="outline" size="sm" onClick={addStage}>
                <Plus className="mr-2 h-4 w-4" />
                {t("addStage")}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deletePipeline")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteConfirm")} <strong>{deleting?.name}</strong>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("no")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("yesDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
