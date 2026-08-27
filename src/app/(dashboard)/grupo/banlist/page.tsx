"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  listBans,
  createBan,
  updateBan,
  deleteBan,
  deleteAllBans,
  type BanEntry,
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

interface BanFormData {
  number: string;
  groupId: string;
  whatsappId: string;
}

export default function GrupoBanListPage() {
  const t = useTranslations("grupoBanlistPage");
  const allowed = usePageAccess("grupo");
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [filtered, setFiltered] = useState<BanEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBan, setEditingBan] = useState<BanEntry | null>(null);
  const [formData, setFormData] = useState<BanFormData>({ number: "", groupId: "", whatsappId: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BanEntry | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);

  const loadBans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBans();
      const list = (res.data as any)?.banList ?? res.data;
      const arr: BanEntry[] = Array.isArray(list) ? list : [];
      setBans(arr);
      setFiltered(arr);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBans();
  }, [loadBans]);

  const handleFilter = (val: string) => {
    setFilter(val);
    if (!val.trim()) {
      setFiltered(bans);
      return;
    }
    const lower = val.toLowerCase();
    setFiltered(bans.filter((b) => JSON.stringify(b).toLowerCase().includes(lower)));
  };

  const openCreate = () => {
    setEditingBan(null);
    setFormData({ number: "", groupId: "", whatsappId: "" });
    setModalOpen(true);
  };

  const openEdit = (ban: BanEntry) => {
    setEditingBan(ban);
    setFormData({ number: ban.number, groupId: ban.groupId || "", whatsappId: "" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.number.trim()) {
      toast.warning(t("warningFillNumber"));
      return;
    }
    if (!formData.groupId || !formData.whatsappId) {
      toast.warning(t("warningFillNumber"));
      return;
    }
    setSaving(true);
    try {
      if (editingBan) {
        const payload = {
          number: formData.number,
          groupId: formData.groupId,
          whatsappId: Number(formData.whatsappId),
        };
        const res = await updateBan(editingBan.id, payload);
        const updated: BanEntry =
          (res.data as any) ?? { ...editingBan, number: formData.number, groupId: formData.groupId };
        setBans((prev) => prev.map((b) => (b.id === editingBan.id ? updated : b)));
        setFiltered((prev) => prev.map((b) => (b.id === editingBan.id ? updated : b)));
        toast.success(t("banUpdated"));
      } else {
        const payload = {
          number: formData.number,
          whatsappId: Number(formData.whatsappId),
          groupId: [{ id: formData.groupId }],
        };
        const res = await createBan(payload);
        const list = Array.isArray(res.data) ? (res.data as BanEntry[]) : [];
        const created: BanEntry = list[0] ?? {
          id: Date.now(),
          number: formData.number,
          groupId: formData.groupId,
          createdAt: new Date().toISOString(),
        };
        setBans((prev) => [...prev, created]);
        setFiltered((prev) => [...prev, created]);
        toast.success(t("banCreated"));
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
      await deleteBan(deleteTarget.id);
      setBans((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setFiltered((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      toast.success(t("banRemoved", { id: deleteTarget.id }));
    } catch {
      toast.error(t("errorRemove"));
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllBans();
      setBans([]);
      setFiltered([]);
      toast.success(t("allBansRemoved"));
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
                    <TableHead>{t("colNumber")}</TableHead>
                    <TableHead>{t("colGroupId")}</TableHead>
                    <TableHead>{t("colDate")}</TableHead>
                    <TableHead className="text-center">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((ban) => (
                    <TableRow key={ban.id}>
                      <TableCell className="font-mono text-xs">{ban.id}</TableCell>
                      <TableCell>{ban.number}</TableCell>
                      <TableCell className="font-mono text-xs">{ban.groupId || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(ban.createdAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(ban)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(ban)}
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
            <DialogTitle>{editingBan ? t("editBan") : t("addBan")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("labelNumber")}</Label>
              <Input
                placeholder="5511999999999"
                value={formData.number}
                onChange={(e) => setFormData((p) => ({ ...p, number: e.target.value }))}
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
              {t("confirmDeleteAll", { count: bans.length })}
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
