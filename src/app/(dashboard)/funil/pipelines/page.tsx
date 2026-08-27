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
  const t = useTranslations("funilPipelinesPage");
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;
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

  const openEdit = async (p: Pipeline) => {
    setEditing(p);
    setName(p.name);
    setDeletedStages([]);
    try {
      const res = await fetchStages({ pipelineId: p.id });
      const raw = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
      const list = (Array.isArray(raw) ? raw : []).slice().sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
      );
      setStages(
        list.map((s: any) => ({
          id: s.id,
          _uid: `db-${s.id}`,
          name: s.name ?? s.nome ?? "",
          color: s.color ?? s.cor ?? "#00a300",
          order: s.order,
          pipelineId: s.pipelineId,
          notifyUserId: s.notifyUserId ?? null,
          notifyQueueId: s.notifyQueueId ?? null,
        }))
      );
    } catch {
      setStages([]);
    }
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

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("validationName"));
      return;
    }
    setSubmitting(true);
    try {
      let pipelineId: number;
      if (editing) {
        await updatePipeline(editing.id, { name });
        pipelineId = editing.id;
        toast.success(t("pipelineUpdated"));
      } else {
        const res = await createPipeline({ name });
        pipelineId = res.data?.id ?? res.data?.data?.id;
        toast.success(t("pipelineCreated"));
      }

      // Delete removed stages (first delete associated pipeline actions)
      for (const stage of deletedStages) {
        if (stage.id) {
          try {
            const actRes = await fetchPipelineActionsByStage(stage.id);
            const acts: any[] = actRes.data?.data ?? (Array.isArray(actRes.data) ? actRes.data : []);
            for (const act of acts) {
              try { await deletePipelineAction(act.id); } catch { /* ignore */ }
            }
          } catch { /* ignore */ }
          try { await deleteStage(stage.id); } catch { /* ignore */ }
        }
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
        } catch { /* ignore individual stage errors */ }
      }

      setDialogOpen(false);
      loadData();
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
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
