"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { PauseCircle, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchPauseReasons, createPauseReason, updatePauseReason, deletePauseReason,
  type PauseReason,
} from "@/services/pause-reasons";
import { EmptyState } from "@/components/layout/empty-state";

/**
 * CRUD de motivos de pausa do operador (Banheiro, Almoco, Reuniao...). Admin/super.
 * Os limites (maxDurationMinutes/maxUsesPerDay/alertOnOverflow) sao cadastraveis aqui;
 * o enforcement/alertas chegam na Fase 2.
 */
export function PauseReasonsManager() {
  const t = useTranslations("pauseReasonsPage");
  const tCommon = useTranslations("common");
  const [list, setList] = useState<PauseReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PauseReason | null>(null);
  const [deleting, setDeleting] = useState<PauseReason | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#f59e0b");
  const [maxDuration, setMaxDuration] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [alertOnOverflow, setAlertOnOverflow] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchPauseReasons();
      setList(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName(""); setColor("#f59e0b");
    setMaxDuration(""); setMaxUses(""); setAlertOnOverflow(true); setIsActive(true);
    setOpen(true);
  };

  const openEdit = (r: PauseReason) => {
    setEditing(r);
    setName(r.name); setColor(r.color || "#f59e0b");
    setMaxDuration(r.maxDurationMinutes != null ? String(r.maxDurationMinutes) : "");
    setMaxUses(r.maxUsesPerDay != null ? String(r.maxUsesPerDay) : "");
    setAlertOnOverflow(r.alertOnOverflow !== false);
    setIsActive(r.isActive !== false);
    setOpen(true);
  };

  const buildPayload = () => ({
    name: name.trim(),
    color: color || undefined,
    maxDurationMinutes: maxDuration.trim() ? Number(maxDuration) : null,
    maxUsesPerDay: maxUses.trim() ? Number(maxUses) : null,
    alertOnOverflow,
    isActive,
  });

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error(t("errorNameRequired")); return; }
    setSaving(true);
    try {
      if (editing) {
        await updatePauseReason(editing.id, buildPayload());
        toast.success(t("successUpdated"));
      } else {
        await createPauseReason(buildPayload());
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
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    try {
      await deletePauseReason(deleting.id);
      toast.success(t("successDeleted"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const limitsSummary = (r: PauseReason) => {
    const parts: string[] = [];
    if (r.maxDurationMinutes != null) parts.push(t("limitDuration", { min: r.maxDurationMinutes }));
    if (r.maxUsesPerDay != null) parts.push(t("limitUses", { count: r.maxUsesPerDay }));
    return parts.length ? parts.join(" · ") : t("noLimit");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : list.length === 0 ? (
        <EmptyState icon={PauseCircle} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newButton")}</Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("colId")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead className="w-16">{t("colColor")}</TableHead>
                <TableHead>{t("colLimits")}</TableHead>
                <TableHead className="w-24">{t("colActive")}</TableHead>
                <TableHead className="w-28">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <span className="inline-block h-5 w-5 rounded border" style={{ backgroundColor: r.color || "#f59e0b" }} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{limitsSummary(r)}</TableCell>
                  <TableCell>
                    <Badge variant={r.isActive !== false ? "secondary" : "outline"} className="text-[10px]">
                      {r.isActive !== false ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={tCommon("edit")} aria-label={tCommon("edit")} onClick={() => openEdit(r)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title={tCommon("delete")} aria-label={tCommon("delete")} onClick={() => setDeleting(r)}>
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
            <DialogTitle>{editing ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("nameLabel")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("colorLabel")}</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 font-mono text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("maxDurationLabel")}</Label>
                <Input type="number" min={1} value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder={t("noLimit")} />
                <p className="text-[10px] text-muted-foreground">{t("maxDurationHint")}</p>
              </div>
              <div className="space-y-1">
                <Label>{t("maxUsesLabel")}</Label>
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={t("noLimit")} />
                <p className="text-[10px] text-muted-foreground">{t("maxUsesHint")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="pr-alert" checked={alertOnOverflow} onCheckedChange={(v) => setAlertOnOverflow(v === true)} />
              <Label htmlFor="pr-alert" className="font-normal cursor-pointer">{t("alertOnOverflowLabel")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="pr-active" checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
              <Label htmlFor="pr-active" className="font-normal cursor-pointer">{t("isActiveLabel")}</Label>
            </div>
            <p className="text-[10px] text-muted-foreground">{t("limitsFase2Note")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? t("saving") : t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o && !deletingBusy) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">{t("deleteConfirm", { name: deleting?.name ?? "" })}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingBusy}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingBusy} className="gap-1">
              {deletingBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PauseReasonsManager;
