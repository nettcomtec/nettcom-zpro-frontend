"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Loader2, MessageSquare, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchFarewells,
  createFarewell,
  updateFarewell,
  deleteFarewell,
  type FarewellPrivateMessage,
} from "@/services/farewell";
import { fetchReasons, type Reason } from "@/services/reasons";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { ReasonsManager } from "@/components/configuracoes/reasons-manager";

export default function FechamentoPage() {
  const t = useTranslations("fechamentoPage");
  const allowed = usePageAccess("fechamento", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FarewellPrivateMessage[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FarewellPrivateMessage | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<FarewellPrivateMessage | null>(null);

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(items, "name");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchFarewells();
      setItems(list);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReasons = useCallback(async () => {
    try {
      const { data } = await fetchReasons();
      setReasons(Array.isArray(data) ? data : (data as { reasons?: Reason[] })?.reasons ?? []);
    } catch {
      /* lista de demandas é opcional — silencia falha */
    }
  }, []);

  useEffect(() => { load(); loadReasons(); }, [load, loadReasons]);

  function openNew() {
    setEditing(null);
    setName("");
    setMessage("");
    setReasonId(null);
    setDialogOpen(true);
  }

  function openEdit(item: FarewellPrivateMessage) {
    setEditing(item);
    setName(item.name);
    setMessage(item.message);
    setReasonId(item.reasonId ?? null);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t("errorNameRequired"));
      return;
    }
    if (!message.trim()) {
      toast.error(t("errorMessageRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateFarewell(editing.id, { name: name.trim(), message: message.trim(), reasonId });
        toast.success(t("successUpdate"));
      } else {
        await createFarewell({ name: name.trim(), message: message.trim(), reasonId });
        toast.success(t("successCreate"));
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteFarewell(deleting.id);
      toast.success(t("successDelete"));
      setDeleteDialogOpen(false);
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    }
  }

  function reasonOf(item: FarewellPrivateMessage): Reason | null {
    if (item.reason) return item.reason as Reason;
    if (item.reasonId) return reasons.find((r) => r.id === item.reasonId) ?? null;
    return null;
  }

  const header = (
    <PageHeader
      title={t("title")}
      description={t("description")}
      help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
        ],
      }}
    />
  );

  return (
    <div className="space-y-6">
      {header}

      <Tabs defaultValue="messages" className="space-y-4">
        <TabsList>
          <TabsTrigger value="messages">{t("tabMessages")}</TabsTrigger>
          <TabsTrigger value="reasons">{t("tabReasons")}</TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("refresh")}
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-[300px]" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            >
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
              </Button>
            </EmptyState>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
                      <SortableTableHead sortKey="message" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colMessage")}</SortableTableHead>
                      <TableHead>{t("colReason")}</TableHead>
                      <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((item) => {
                      const r = reasonOf(item);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium whitespace-nowrap">{item.name}</TableCell>
                          <TableCell className="max-w-md text-muted-foreground truncate">{item.message}</TableCell>
                          <TableCell>
                            {r ? (
                              <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
                                <span
                                  className="inline-block h-3 w-3 rounded-full border"
                                  style={{ backgroundColor: r.color || "#3b82f6" }}
                                />
                                {r.name}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setDeleting(item); setDeleteDialogOpen(true); }}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reasons">
          <ReasonsManager
            newButtonLabel={t("reasonNewButton")}
            createTitle={t("reasonCreateTitle")}
            editTitle={t("reasonEditTitle")}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("newTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? t("editDescription") : t("createDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("nameLabel")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("messageLabel")}</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("reasonLabel")}</Label>
              <Select
                value={reasonId ? String(reasonId) : "none"}
                onValueChange={(v) => setReasonId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("reasonNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("reasonNone")}</SelectItem>
                  {reasons.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full border"
                          style={{ backgroundColor: r.color || "#3b82f6" }}
                        />
                        {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: deleting?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t("deleteButton")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
