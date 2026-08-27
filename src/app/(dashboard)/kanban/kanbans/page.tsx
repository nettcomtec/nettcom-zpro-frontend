"use client";

import { formatDate } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, LayoutGrid, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchKanbans, createKanban, updateKanban, deleteKanban } from "@/services/kanban";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";

interface Kanban {
  id: number;
  name: string;
  description?: string;
  columns?: number;
  createdAt: string;
  updatedAt: string;
}

export default function KanbansPage() {
  const t = useTranslations("kanbanListPage");
  const allowed = usePageAccess("kanban");
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [kanbans, setKanbans] = useState<Kanban[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKanban, setEditingKanban] = useState<Kanban | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchKanbans();
      const data = Array.isArray(res.data) ? res.data : [];
      setKanbans(data as any);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => {
    setEditingKanban(null);
    setName("");
    setDescription("");
    setDialogOpen(true);
  };

  const openEdit = (k: Kanban) => {
    setEditingKanban(k);
    setName(k.name);
    setDescription(k.description || "");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      if (editingKanban) {
        await updateKanban(editingKanban.id, { name, description } as any);
        toast.success(t("updateSuccess"));
      } else {
        await createKanban({ name, description } as any);
        toast.success(t("createSuccess"));
      }
      setDialogOpen(false);
      loadData();
    } catch {
      toast.error(editingKanban ? t("updateError") : t("createError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteKanban(id);
      toast.success(t("deleteSuccess"));
      loadData();
    } catch {
      toast.error(t("deleteError"));
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-lg font-medium">{t("title")}</h3>
          <PageHelp
            description={t("helpDesc")}
            sections={[
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
              { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("refresh")}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("newKanban")}
          </Button>
        </div>
      </div>

      {kanbans.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("emptyTitle")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("emptyDescription")}
              </p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {t("createKanban")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {kanbans.map((k) => (
            <Card key={k.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{k.name}</CardTitle>
                    {k.description && (
                      <CardDescription className="mt-1">{k.description}</CardDescription>
                    )}
                  </div>
                  <Badge variant="secondary">#{k.id}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("createdAt")} {formatDate(new Date(k.createdAt))}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(k)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(k.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingKanban ? t("editTitle") : t("newKanban")}</DialogTitle>
            <DialogDescription>
              {editingKanban
                ? t("editDescription")
                : t("createDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("name")}</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("description")}</Label>
              <Input
                placeholder={t("descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {editingKanban ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
