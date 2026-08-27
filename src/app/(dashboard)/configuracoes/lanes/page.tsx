"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { LayoutGrid, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { fetchKanbans, createKanban, updateKanban, deleteKanban, type Kanban } from "@/services/kanban";
import { EmptyState } from "@/components/layout/empty-state";

export default function ConfigLanesPage() {
  const t = useTranslations("configLanesPage");
  const [list, setList] = useState<Kanban[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Kanban | null>(null);
  const [deleting, setDeleting] = useState<Kanban | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchKanbans();
      setList(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setColor("#3b82f6");
    setOpen(true);
  };

  const openEdit = (k: Kanban) => {
    setEditing(k);
    setName(k.name);
    setColor(k.color || "#3b82f6");
    setOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("nameRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateKanban(editing.id, { name: trimmed, color: color || undefined });
        setList((prev) =>
          prev.map((k) => (k.id === editing.id ? { ...k, name: trimmed, color } : k))
        );
        toast.success(t("laneUpdated"));
      } else {
        const position = list.length + 1;
        const res = await createKanban({ name: trimmed, color: color || undefined, position });
        const created = res.data as Kanban;
        setList((prev) => [...prev, { ...created, position }]);
        toast.success(t("laneCreated"));
      }
      setOpen(false);
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteKanban(deleting.id);
      const newList = list.filter((k) => k.id !== deleting.id);
      const reindexed = newList.map((k, i) => ({ ...k, position: i + 1 }));
      await Promise.all(reindexed.map((k) => updateKanban(k.id, { position: k.position })));
      setList(reindexed);
      setDeleting(null);
      toast.success(t("laneRemoved"));
    } catch {
      toast.error(t("errorRemove"));
    }
  };

  const moveItem = async (index: number, direction: "up" | "down") => {
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const newList = [...list];
    [newList[index], newList[swapIdx]] = [newList[swapIdx], newList[index]];
    const updated = newList.map((k, i) => ({ ...k, position: i + 1 }));
    setList(updated);
    try {
      await Promise.all([
        updateKanban(updated[index].id, { position: updated[index].position }),
        updateKanban(updated[swapIdx].id, { position: updated[swapIdx].position }),
      ]);
    } catch {
      toast.error(t("errorUpdate"));
      load();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> {t("newLane")}
        </Button>
      </PageHeader>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
        >
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newLane")}</Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">ID</TableHead>
                <TableHead className="w-16">{t("colPosition")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead className="w-20">{t("colColor")}</TableHead>
                <TableHead className="w-36">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((k, index) => (
                <TableRow key={k.id}>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">{k.id}</TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums font-medium">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>
                    <span
                      className="inline-block h-5 w-5 rounded border"
                      style={{ backgroundColor: k.color || "#3b82f6" }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title={t("moveUp")}
                        disabled={index === 0}
                        onClick={() => moveItem(index, "up")}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title={t("moveDown")}
                        disabled={index === list.length - 1}
                        onClick={() => moveItem(index, "down")}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(k)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(k)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editLane") : t("newLaneDialog")}</DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("nameLabel")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("colorLabel")}</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded border" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 font-mono text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? t("saving") : t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeLane")}</DialogTitle>
            <DialogDescription>{t("irreversible")}</DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">{t("removeConfirm")} <strong>{deleting?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t("remove")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
