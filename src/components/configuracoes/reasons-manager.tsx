"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchReasons, createReason, updateReason, deleteReason, type Reason } from "@/services/reasons";
import { EmptyState } from "@/components/layout/empty-state";

/**
 * CRUD de demandas (motivos) reutilizável. Usado tanto na página
 * /configuracoes/motivos quanto na aba "Demandas" de /fechamento.
 * Usa as chaves i18n de `configMotivosPage`; os rótulos de botão/título podem
 * ser sobrescritos (ex.: aba de /fechamento usa "Demanda" para evitar colidir
 * com o termo "Fechamento" da outra aba).
 */
interface ReasonsManagerProps {
  newButtonLabel?: string;
  createTitle?: string;
  editTitle?: string;
}

export function ReasonsManager({ newButtonLabel, createTitle, editTitle }: ReasonsManagerProps = {}) {
  const t = useTranslations("configMotivosPage");
  const newLabel = newButtonLabel ?? t("newButton");
  const createLabel = createTitle ?? t("dialogCreateTitle");
  const editLabel = editTitle ?? t("dialogEditTitle");
  const [list, setList] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reason | null>(null);
  const [deleting, setDeleting] = useState<Reason | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchReasons();
      setList(Array.isArray(data) ? data : (data as { reasons?: Reason[] })?.reasons ?? []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setColor("#3b82f6");
    setOpen(true);
  };

  const openEdit = (r: Reason) => {
    setEditing(r);
    setName(r.name);
    setColor(r.color || "#3b82f6");
    setOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("errorNameRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateReason(editing.id, { name: trimmed, color: color || undefined });
        toast.success(t("successUpdated"));
      } else {
        await createReason({ name: trimmed, color: color || undefined });
        toast.success(t("successCreated"));
      }
      setOpen(false);
      load();
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteReason(deleting.id);
      toast.success(t("successDeleted"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> {newLabel}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        >
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {newLabel}</Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("colId")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead className="w-24">{t("colColor")}</TableHead>
                <TableHead className="w-28">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <span
                      className="inline-block h-5 w-5 rounded border"
                      style={{ backgroundColor: r.color || "#3b82f6" }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(r)}>
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
            <DialogTitle>{editing ? editLabel : createLabel}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
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
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">{t("deleteConfirm", { name: deleting?.name ?? "" })}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t("deleteButton")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ReasonsManager;
