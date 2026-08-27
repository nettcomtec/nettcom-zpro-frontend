"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
import { FileText, Loader2, Pencil, Plus, Search, Trash2, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  fetchProtocols,
  createProtocol,
  updateProtocol,
  deleteProtocol,
  type Protocol,
} from "@/services/protocols";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { EspiarConversaDialog, type TicketForSpy } from "@/components/atendimento/espiar-conversa-dialog";

function formatDate(dateStr: string): string {
  try {
    return formatDateTime(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export default function ProtocolosPage() {
  const t = useTranslations("protocolosPage");
  const allowed = usePageAccess("protocolos", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Protocol[]>([]);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Protocol | null>(null);
  const [protocolValue, setProtocolValue] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [dialogSaving, setDialogSaving] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProtocol, setDeletingProtocol] = useState<Protocol | null>(null);
  const [spyOpen, setSpyOpen] = useState(false);
  const [spyTicket, setSpyTicket] = useState<TicketForSpy | null>(null);

  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(data, "createdAt");

  const loadData = useCallback(async (page = 1, sp = search, sd = startDate, ed = endDate) => {
    setLoading(true);
    try {
      const result = await fetchProtocols({
        searchParam: sp,
        pageNumber: String(page),
        startDate: sd || undefined,
        endDate: ed || undefined,
      });
      setData(result.ticketProtocols);
      setHasMore(result.hasMore);
      setTotal(result.count);
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search/date changes → always resets to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setPageNumber(1);
      loadData(1, search, startDate, endDate);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, startDate, endDate]);

  function openNew() {
    setEditing(null);
    setProtocolValue("");
    setTicketId("");
    setDialogOpen(true);
  }

  function openEdit(protocol: Protocol) {
    setEditing(protocol);
    setProtocolValue(protocol.protocol);
    setTicketId(String(protocol.ticketId));
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!protocolValue.trim()) {
      toast.error(t("errorProtocolRequired"));
      return;
    }
    if (!ticketId.trim() || isNaN(Number(ticketId))) {
      toast.error(t("errorTicketIdRequired"));
      return;
    }

    setDialogSaving(true);
    try {
      if (editing) {
        await updateProtocol(editing.id, {
          protocol: protocolValue.trim(),
          ticketId: Number(ticketId),
        });
        toast.success(t("protocolUpdated"));
      } else {
        await createProtocol({
          protocol: protocolValue.trim(),
          ticketId: Number(ticketId),
        });
        toast.success(t("protocolCreated"));
      }
      setDialogOpen(false);
      setPageNumber(1);
      await loadData(1, search, startDate, endDate);
    } catch {
      toast.error(t("errorSaving"));
    } finally {
      setDialogSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingProtocol) return;
    try {
      await deleteProtocol(deletingProtocol.id);
      toast.success(t("protocolDeleted"));
      setDeleteDialogOpen(false);
      setDeletingProtocol(null);
      setPageNumber(1);
      await loadData(1, search, startDate, endDate);
    } catch {
      toast.error(t("errorDeleting"));
    }
  }

  const filtered = sortedData;

  if (loading) {
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
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

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
          icon={FileText}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="protocol" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colProtocol")}</SortableTableHead>
                  <SortableTableHead sortKey="ticketId" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colTicketId")}</SortableTableHead>
                  <SortableTableHead sortKey="contactName" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colContact")}</SortableTableHead>
                  <SortableTableHead sortKey="createdAt" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDate")}</SortableTableHead>
                  <TableHead className="w-[160px] text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((protocol) => (
                  <TableRow key={protocol.id}>
                    <TableCell className="font-mono font-medium">
                      {protocol.protocol}
                    </TableCell>
                    <TableCell>{protocol.ticketId}</TableCell>
                    <TableCell>
                      {protocol.contactName ? (
                        <div className="flex flex-col leading-tight">
                          <span className="text-sm font-medium truncate max-w-[200px]">{protocol.contactName}</span>
                          {protocol.contactNumber && (
                            <span className="text-xs text-muted-foreground">{protocol.contactNumber}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(protocol.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("titleSpy")}
                          onClick={() => {
                            setSpyTicket({ id: protocol.ticketId });
                            setSpyOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("titleGoTo")}
                          onClick={() => router.push(`/atendimento?ticket=${protocol.ticketId}`)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(protocol)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeletingProtocol(protocol);
                            setDeleteDialogOpen(true);
                          }}
                        >
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

      {/* Paginação */}
      {!loading && data.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t("totalRecords", { count: total })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageNumber <= 1}
              onClick={() => {
                const p = pageNumber - 1;
                setPageNumber(p);
                loadData(p, search, startDate, endDate);
              }}
            >
              {t("prevPage")}
            </Button>
            <span className="flex items-center px-2">{pageNumber}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => {
                const p = pageNumber + 1;
                setPageNumber(p);
                loadData(p, search, startDate, endDate);
              }}
            >
              {t("nextPage")}
            </Button>
          </div>
        </div>
      )}

      {/* Dialog: Criar/Editar protocolo */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? t("dialogEditDescription") : t("dialogCreateDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("labelProtocol")}</Label>
              <Input
                value={protocolValue}
                onChange={(e) => setProtocolValue(e.target.value)}
                placeholder={t("protocolPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("labelTicketId")}</Label>
              <Input
                type="number"
                min="1"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="Ex: 123"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={dialogSaving}>
              {dialogSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { protocol: deletingProtocol?.protocol ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("delete")}
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
