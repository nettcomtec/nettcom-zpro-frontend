"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Columns, Plus, Search, Pencil, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import {
  fetchKanbans, createKanban, updateKanban, deleteKanban,
} from "@/services/kanban";

interface Lane {
  id: number;
  name: string;
  color: string;
  order: number;
  cardsCount?: number;
}

export default function LanesPage() {
  const t = useTranslations("lanesPage");
  const allowed = usePageAccess("kanban", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Lane[]>([]);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLane, setEditingLane] = useState<Lane | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#3b82f6");
  const [formOrder, setFormOrder] = useState("0");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadLanes = useCallback(async () => {
    try {
      const { data: res } = await fetchKanbans();
      const lanes = Array.isArray(res) ? res : (res as any).kanbans || (res as any).lanes || (res as any).data || [];
      setData(lanes.sort((a: Lane, b: Lane) => (a.order || 0) - (b.order || 0)));
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadLanes();
  }, [loadLanes]);

  const openCreateDialog = () => {
    setEditingLane(null);
    setFormName("");
    setFormColor("#3b82f6");
    setFormOrder(String(data.length));
    setDialogOpen(true);
  };

  const openEditDialog = (lane: Lane) => {
    setEditingLane(lane);
    setFormName(lane.name || "");
    setFormColor(lane.color || "#3b82f6");
    setFormOrder(String(lane.order ?? 0));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error(t("errorNameRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName,
        color: formColor,
        order: Number(formOrder) || 0,
      };
      if (editingLane) {
        await updateKanban(editingLane.id, payload);
        toast.success(t("successUpdated"));
      } else {
        await createKanban(payload);
        toast.success(t("successCreated"));
      }
      setDialogOpen(false);
      await loadLanes();
    } catch {
      toast.error(editingLane ? t("errorUpdate") : t("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await deleteKanban(deleteId);
      setData((prev) => prev.filter((l) => l.id !== deleteId));
      toast.success(t("successDeleted"));
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const filtered = data.filter((l) =>
    (l.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      >
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" /> {t("newLane")}
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
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
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Columns}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            >
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" /> {t("newLane")}
              </Button>
            </EmptyState>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]" />
                      <TableHead>{t("colColor")}</TableHead>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead>{t("colOrder")}</TableHead>
                      <TableHead>{t("colCards")}</TableHead>
                      <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((lane) => (
                      <TableRow key={lane.id}>
                        <TableCell>
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        </TableCell>
                        <TableCell>
                          <div
                            className="h-6 w-6 rounded-full border"
                            style={{ backgroundColor: lane.color || "#gray" }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{lane.name}</TableCell>
                        <TableCell>{lane.order}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{lane.cardsCount ?? 0}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(lane)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteId(lane.id)}>
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
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLane ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>
              {editingLane ? t("dialogEditDescription") : t("dialogCreateDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("labelName")}</Label>
              <Input
                placeholder={t("placeholderName")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("labelColor")}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="h-10 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("labelOrder")}</Label>
                <Input
                  type="number"
                  value={formOrder}
                  onChange={(e) => setFormOrder(e.target.value)}
                  min="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId != null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>{t("confirmDeleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
