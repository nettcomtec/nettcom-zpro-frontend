"use client";

import { formatDate as formatDateIntl } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { BookOpen, Plus, Search, Pencil, Trash2, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  fetchTicketNotes, createTicketNote, updateTicketNote, deleteTicketNote,
  type TicketNote,
} from "@/services/notes";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { EspiarConversaDialog, type TicketForSpy } from "@/components/atendimento/espiar-conversa-dialog";

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return formatDateIntl(new Date(dateStr), {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function NotasPage() {
  const t = useTranslations("notasPage");
  const allowed = usePageAccess("notas", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TicketNote[]>([]);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<TicketNote | null>(null);
  const [formContent, setFormContent] = useState("");
  const [formTicketId, setFormTicketId] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [spyOpen, setSpyOpen] = useState(false);
  const [spyTicket, setSpyTicket] = useState<TicketForSpy | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(data, "createdAt");

  const loadNotes = useCallback(async () => {
    try {
      const { data: res } = await fetchTicketNotes();
      const list = Array.isArray(res) ? res : res.notes || res.ticketNotes || res.data || [];
 // normalize: the legacy front uses `notes` field, Next uses `content`
      setData(list.map((n: TicketNote & { notes?: string }) => ({
        ...n,
        content: n.content || n.notes || "",
      })));
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const openCreateDialog = () => {
    setEditingNote(null);
    setFormContent("");
    setFormTicketId("");
    setDialogOpen(true);
  };

  const openEditDialog = (note: TicketNote) => {
    setEditingNote(note);
    setFormContent(note.content || "");
    setFormTicketId(String(note.ticketId || ""));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formContent.trim()) {
      toast.error(t("errorContentRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editingNote) {
        await updateTicketNote(editingNote.id, { content: formContent });
        toast.success(t("noteUpdated"));
      } else {
        if (!formTicketId || isNaN(Number(formTicketId))) {
          toast.error(t("errorTicketIdRequired"));
          setSaving(false);
          return;
        }
        await createTicketNote({
          content: formContent,
          ticketId: Number(formTicketId),
        });
        toast.success(t("noteCreated"));
      }
      setDialogOpen(false);
      await loadNotes();
    } catch {
      toast.error(editingNote ? t("errorUpdating") : t("errorCreating"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await deleteTicketNote(deleteId);
      setData((prev) => prev.filter((n) => n.id !== deleteId));
      toast.success(t("noteDeleted"));
    } catch {
      toast.error(t("errorDeleting"));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const filtered = sortedData.filter((n) => {
    const matchText =
      n.content?.toLowerCase().includes(search.toLowerCase()) ||
      String(n.ticketId).includes(search);
    if (!matchText) return false;
    if (startDate) {
      const d = new Date(n.createdAt);
      if (d < new Date(startDate)) return false;
    }
    if (endDate) {
      const d = new Date(n.createdAt);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);
      if (d > end) return false;
    }
    return true;
  });

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
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("dateStart")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("dateEnd")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 h-9"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="ticketId" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colTicketId")}</SortableTableHead>
                      <SortableTableHead sortKey="content" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colContent")}</SortableTableHead>
                      <TableHead>{t("colUser")}</TableHead>
                      <SortableTableHead sortKey="createdAt" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDate")}</SortableTableHead>
                      <TableHead className="w-[160px] text-right">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((note) => (
                      <TableRow key={note.id}>
                        <TableCell className="font-medium">#{note.ticketId}</TableCell>
                        <TableCell className="max-w-xs">
                          <p className="truncate text-sm text-muted-foreground">{note.content}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{note.user?.name || t("defaultUser")}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(note.updatedAt || note.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("titleSpy")}
                              onClick={() => {
                                setSpyTicket({ id: note.ticketId });
                                setSpyOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("titleGoTo")}
                              onClick={() => router.push(`/atendimento?ticket=${note.ticketId}`)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(note)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(note.id)}>
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
            <DialogTitle>{editingNote ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>
              {editingNote ? t("dialogEditDescription") : t("dialogCreateDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingNote && (
              <div className="space-y-2">
                <Label>{t("labelTicketId")} *</Label>
                <Input
                  type="number"
                  placeholder="Ex: 123"
                  value={formTicketId}
                  onChange={(e) => setFormTicketId(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("labelContent")} *</Label>
              <Textarea
                placeholder={t("contentPlaceholder")}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={6}
              />
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
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EspiarConversaDialog
        open={spyOpen}
        onOpenChange={setSpyOpen}
        ticket={spyTicket}
      />
    </div>
  );
}
