"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { Search, Plus, Pencil, Trash2, Tag, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
  type Tag as TagType,
} from "@/services/tags";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { cn } from "@/lib/utils";
import { useTableDensity } from "@/hooks/use-table-density";
import { TableDensityToggle } from "@/components/ui/table-density-toggle";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

function makeTagSchema(msgs: { nameRequired: string; colorRequired: string }) {
  return z.object({
    name: z.string().min(1, msgs.nameRequired),
    color: z.string().min(1, msgs.colorRequired),
    isActive: z.boolean(),
    triggerKeyword: z.string().optional(),
  });
}

type TagForm = z.infer<ReturnType<typeof makeTagSchema>>;

export default function EtiquetasPage() {
  const t = useTranslations("etiquetasPage");
  const tUnsaved = useTranslations("flowBuilderNodeForm");
  const allowed = usePageAccess("etiquetas", { adminSuperOnly: true });
  const tagSchema = makeTagSchema({ nameRequired: t("nameRequired"), colorRequired: t("colorRequired") });
  const { density, updateDensity, rowClassName, cellClassName } = useTableDensity();
  const [items, setItems] = useState<TagType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TagType | null>(null);
  const [deleting, setDeleting] = useState<TagType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [assignedContacts, setAssignedContacts] = useState<{ id: number; name: string; number?: string }[] | null>(null);
  const [forceDeleting, setForceDeleting] = useState(false);
  const [newTagKeyword, setNewTagKeyword] = useState("");

  const form = useForm<TagForm>({
    resolver: zodResolver(tagSchema),
    defaultValues: { name: "", color: "#3B82F6", isActive: true, triggerKeyword: "" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchTags();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { sortKey, sortDir, handleSort, sortedData } = useSortable<TagType>(items, "name");

  // --- Early return after all hooks ---
  if (!allowed) return <AccessDenied />;

  const filtered = sortedData.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", color: "#3B82F6", isActive: true, triggerKeyword: "" });
    setNewTagKeyword("");
    setDialogOpen(true);
  };

  const openEdit = (t: TagType) => {
    setEditing(t);
    form.reset({ name: t.name, color: t.color || "#3B82F6", isActive: t.isActive ?? true, triggerKeyword: t.triggerKeyword ?? "" });
    setNewTagKeyword("");
    setDialogOpen(true);
  };

  // Dirty-guard: fechar o dialog (Esc, clique-fora, X ou Cancelar) com alterações
  // não salvas pede confirmação. Submit fecha direto (setDialogOpen(false) no onSubmit).
  const isTagFormDirty = () => form.formState.isDirty || newTagKeyword.trim() !== "";
  const attemptCloseDialog = () => {
    if (form.formState.isSubmitting) return;
    if (isTagFormDirty() && !window.confirm(tUnsaved("unsavedChangesDesc"))) return;
    setDialogOpen(false);
  };

  const onSubmit = async (values: TagForm) => {
    try {
      const payload = {
        ...values,
        triggerKeyword: values.triggerKeyword?.trim() || null,
      };
      if (editing) {
        await updateTag(editing.id, payload);
        toast.success(t("successUpdate"));
      } else {
        await createTag(payload);
        toast.success(t("successCreate"));
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    }
  };

  // Palavra-gatilho: MÚLTIPLAS palavras armazenadas comma-separated em triggerKeyword
  // (coluna string única no banco). Qualquer uma aplica a tag. Chips no form.
  const tagKeywordList = (form.watch("triggerKeyword") || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const addTagKeyword = () => {
    const v = newTagKeyword.trim();
    if (v && !tagKeywordList.some((k) => k.toLowerCase() === v.toLowerCase())) {
      form.setValue("triggerKeyword", [...tagKeywordList, v].join(","), { shouldDirty: true });
    }
    setNewTagKeyword("");
  };
  const removeTagKeyword = (idx: number) => {
    form.setValue("triggerKeyword", tagKeywordList.filter((_, i) => i !== idx).join(","), { shouldDirty: true });
  };

  const handleDelete = async () => {
    if (!deleting || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteTag(deleting.id);
      toast.success(t("successDelete"));
      setDeleting(null);
      load();
    } catch (err: unknown) {
      const e = err as {
        status?: number;
        data?: { contacts?: { id: number; name: string; number?: string }[] };
        response?: { status?: number; data?: { contacts?: { id: number; name: string; number?: string }[] } };
      };
      const status = e?.status ?? e?.response?.status;
      const data = e?.data ?? e?.response?.data;
      if (status === 409 && Array.isArray(data?.contacts)) {
        setAssignedContacts(data.contacts);
      } else {
        toast.error(t("errorDelete"));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleForceDelete = async () => {
    if (!deleting) return;
    setForceDeleting(true);
    try {
      await deleteTag(deleting.id, true);
      toast.success(t("successDelete"));
      setDeleting(null);
      setAssignedContacts(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setForceDeleting(false);
    }
  };

  const closeAssignedModal = () => {
    if (forceDeleting) return;
    setAssignedContacts(null);
    setDeleting(null);
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
          ],
        }}
      >
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
        </Button>
      </PageHeader>

      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <TableDensityToggle density={density} onChange={updateDensity} />
      </div>

      {loading ? (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colColor")}</TableHead>
                <TableHead className="w-24">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 7 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[
            { number: 1, title: t("emptyStep1") },
            { number: 2, title: t("emptyStep2") },
            { number: 3, title: t("emptyStep3") },
          ]}
        >
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-16">ID</SortableTableHead>
                <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
                <SortableTableHead sortKey="color" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colColor")}</SortableTableHead>
                <SortableTableHead sortKey="isActive" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-24">{t("colActive")}</SortableTableHead>
                <TableHead className="w-24">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tag) => (
                <TableRow key={tag.id} className={rowClassName}>
                  <TableCell className={cn("text-muted-foreground tabular-nums", cellClassName)}>{tag.id}</TableCell>
                  <TableCell className={cn("font-medium", cellClassName)}>{tag.name}</TableCell>
                  <TableCell className={cellClassName}>
                    <Badge
                      variant="outline"
                      className="font-medium"
                      style={{
                        borderColor: tag.color || "#3B82F6",
                        color: tag.color || "#3B82F6",
                      }}
                    >
                      {tag.name}
                    </Badge>
                  </TableCell>
                  <TableCell className={cellClassName}>
                    {tag.isActive !== false ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className={cellClassName}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t("edit")}
                        aria-label={t("edit")}
                        onClick={() => openEdit(tag)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t("delete")}
                        aria-label={t("delete")}
                        onClick={() => setDeleting(tag)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (v) setDialogOpen(true); else attemptCloseDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("newTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("nameLabel")}</Label>
              <Input {...form.register("name")} placeholder={t("namePlaceholder")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("colorLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.watch("color") || "#3B82F6"}
                  onChange={(e) => form.setValue("color", e.target.value, { shouldDirty: true })}
                  className="h-10 w-14 cursor-pointer p-1"
                />
                <Input
                  {...form.register("color")}
                  placeholder="#3B82F6"
                  className="flex-1 font-mono text-sm"
                />
              </div>
              {form.formState.errors.color && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.color.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("triggerKeywordLabel")}</Label>
              {tagKeywordList.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tagKeywordList.map((kw, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {kw}
                      <button
                        type="button"
                        onClick={() => removeTagKeyword(i)}
                        className="hover:text-destructive"
                      >×</button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newTagKeyword}
                  onChange={(e) => setNewTagKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTagKeyword();
                    }
                  }}
                  placeholder={t("triggerKeywordPlaceholder")}
                />
                <Button type="button" variant="outline" size="sm" onClick={addTagKeyword}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("triggerKeywordHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={form.watch("isActive")}
                onCheckedChange={(checked) => form.setValue("isActive", !!checked, { shouldDirty: true })}
              />
              <Label htmlFor="isActive" className="cursor-pointer">{t("activeLabel")}</Label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={attemptCloseDialog}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleting && !assignedContacts}
        onOpenChange={(o) => {
          if (!o && !isDeleting) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteCannotUndo")}</DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            {t("deleteConfirm")} <strong>{deleting?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={isDeleting}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="gap-1">
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignedContacts} onOpenChange={closeAssignedModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assignedTitle")}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t("assignedDescription", { count: assignedContacts?.length || 0, name: deleting?.name || "" })}
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <ul className="divide-y">
                {(assignedContacts || []).map((c) => (
                  <li key={c.id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="truncate">{c.name}</span>
                    {c.number && <span className="text-xs text-muted-foreground shrink-0">{c.number}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAssignedModal} disabled={forceDeleting}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleForceDelete} disabled={forceDeleting}>
              {forceDeleting ? t("removing") : t("unassignAndDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
