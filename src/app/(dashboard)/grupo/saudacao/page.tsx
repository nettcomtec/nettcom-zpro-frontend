"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  listGreetings,
  createGreeting,
  updateGreeting,
  deleteGreeting,
  deleteAllGreetings,
  type GreetingEntry,
} from "@/services/groups";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { GroupConnectionSelect } from "@/components/grupo/group-connection-select";
import { PageHelp } from "@/components/layout/page-help";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

interface GreetingFormData {
  message: string;
  groupId: string;
  whatsappId: string;
}

export default function GrupoSaudacaoPage() {
  const t = useTranslations("grupoSaudacaoPage");
  const allowed = usePageAccess("grupo");
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [greetings, setGreetings] = useState<GreetingEntry[]>([]);
  const [filtered, setFiltered] = useState<GreetingEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGreeting, setEditingGreeting] = useState<GreetingEntry | null>(null);
  const [formData, setFormData] = useState<GreetingFormData>({ message: "", groupId: "", whatsappId: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GreetingEntry | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);

  const loadGreetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listGreetings();
      const list = (res.data as any)?.greetingMessage ?? res.data;
      const arr: GreetingEntry[] = Array.isArray(list) ? list : [];
      setGreetings(arr);
      setFiltered(arr);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGreetings();
  }, [loadGreetings]);

  const handleFilter = (val: string) => {
    setFilter(val);
    if (!val.trim()) {
      setFiltered(greetings);
      return;
    }
    const lower = val.toLowerCase();
    setFiltered(greetings.filter((g) => JSON.stringify(g).toLowerCase().includes(lower)));
  };

  const openCreate = () => {
    setEditingGreeting(null);
    setFormData({ message: "", groupId: "", whatsappId: "" });
    setModalOpen(true);
  };

  const openEdit = (greeting: GreetingEntry) => {
    setEditingGreeting(greeting);
    setFormData({ message: greeting.message, groupId: greeting.groupId || "", whatsappId: "" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.message.trim()) {
      toast.warning(t("warningFillMessage"));
      return;
    }
    if (!formData.groupId || !formData.whatsappId) {
      toast.warning(t("warningFillMessage"));
      return;
    }
    setSaving(true);
    try {
      if (editingGreeting) {
        const payload = {
          message: formData.message,
          groupId: formData.groupId,
          whatsappId: Number(formData.whatsappId),
        };
        const res = await updateGreeting(editingGreeting.id, payload);
        const updated: GreetingEntry =
          (res.data as any) ?? { ...editingGreeting, message: formData.message, groupId: formData.groupId };
        setGreetings((prev) => prev.map((g) => (g.id === editingGreeting.id ? updated : g)));
        setFiltered((prev) => prev.map((g) => (g.id === editingGreeting.id ? updated : g)));
        toast.success(t("greetingUpdated"));
      } else {
        const payload = {
          message: formData.message,
          whatsappId: Number(formData.whatsappId),
          groupId: [{ id: formData.groupId }],
        };
        const res = await createGreeting(payload);
        const list = Array.isArray(res.data) ? (res.data as GreetingEntry[]) : [];
        const created: GreetingEntry = list[0] ?? {
          id: Date.now(),
          message: formData.message,
          groupId: formData.groupId,
          createdAt: new Date().toISOString(),
        };
        setGreetings((prev) => [...prev, created]);
        setFiltered((prev) => [...prev, created]);
        toast.success(t("greetingCreated"));
      }
      setModalOpen(false);
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteGreeting(deleteTarget.id);
      setGreetings((prev) => prev.filter((g) => g.id !== deleteTarget.id));
      setFiltered((prev) => prev.filter((g) => g.id !== deleteTarget.id));
      toast.success(t("greetingRemoved", { id: deleteTarget.id }));
    } catch {
      toast.error(t("errorRemove"));
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllGreetings();
      setGreetings([]);
      setFiltered([]);
      toast.success(t("allGreetingsRemoved"));
    } catch {
      toast.error(t("errorRemoveAll"));
    } finally {
      setDeleteAllOpen(false);
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
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-lg font-bold">{t("title")}</CardTitle>
              <PageHelp
                description={t("helpDesc")}
                sections={[
                  { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
                  { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {t("add")}
              </Button>
              <Button variant="destructive" onClick={() => setDeleteAllOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("deleteAll")}
              </Button>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("searchPlaceholder")}
              value={filter}
              onChange={(e) => handleFilter(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>{t("colMessage")}</TableHead>
                    <TableHead>{t("colGroupId")}</TableHead>
                    <TableHead>{t("colDate")}</TableHead>
                    <TableHead className="text-center">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((greeting) => (
                    <TableRow key={greeting.id}>
                      <TableCell className="font-mono text-xs">{greeting.id}</TableCell>
                      <TableCell className="max-w-xs truncate">{greeting.message}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {greeting.groupId || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(greeting.createdAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(greeting)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(greeting)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit modal */}
      <Dialog open={modalOpen} onOpenChange={(v) => !v && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGreeting ? t("editGreeting") : t("addGreeting")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("labelMessage")}</Label>
              <Textarea
                placeholder={t("placeholderMessage")}
                value={formData.message}
                onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                rows={4}
              />
            </div>
            <GroupConnectionSelect
              groupId={formData.groupId}
              onChange={(id) => setFormData((p) => ({ ...p, groupId: id }))}
              onWhatsappIdChange={(wid) => setFormData((p) => ({ ...p, whatsappId: wid }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete single confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("attention")}</DialogTitle>
            <DialogDescription>
              {t("confirmDelete", { id: deleteTarget?.id ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("no")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete all confirmation */}
      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("attention")}</DialogTitle>
            <DialogDescription>
              {t("confirmDeleteAll", { count: greetings.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)}>
              {t("no")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteAll}>
              {t("yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
