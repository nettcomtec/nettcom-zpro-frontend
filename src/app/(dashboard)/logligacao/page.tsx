"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  PhoneCall,
  RefreshCw,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { fetchCallLogs, deleteCallLog, type CallLog, type CallLogFilters } from "@/services/call-logs";
import { fetchAllUsers, type User } from "@/services/users";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

// ── helpers ──────────────────────────────────────────────────────────────────

// CALL_STATUS_LABELS are now resolved via t() inside the component

const CALL_STATUS_VARIANTS: Record<string, "success" | "destructive" | "warning" | "info" | "secondary"> = {
  Completed: "success",
  Accepted: "success",
  Ended: "secondary",
  Received: "info",
  Calling: "warning",
  Missed: "destructive",
  Busy: "warning",
  Failed: "destructive",
};

const CALL_STATUS_KEYS: Record<string, string> = {
  Calling: "statusCalling",
  Received: "statusReceived",
  Accepted: "statusAccepted",
  Completed: "statusCompleted",
  Ended: "statusEnded",
  Missed: "statusMissed",
  Busy: "statusBusy",
  Failed: "statusFailed",
};

function statusVariant(status: string) {
  return CALL_STATUS_VARIANTS[status] ?? "secondary";
}

function formatDate(date?: string) {
  if (!date) return "—";
  return formatDateTime(new Date(date));
}

function formatDuration(duration: string | number | null) {
  if (!duration && duration !== 0) return "—";
  const secs = typeof duration === "string" ? parseInt(duration, 10) : duration;
  if (isNaN(secs)) return String(duration);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// ── page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function LogLigacaoPage() {
  const t = useTranslations("logligacaoPage");
  const tCommon = useTranslations("common");
  const allowed = usePageAccess("logligacao", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  function formatStatus(status: string) {
    const key = CALL_STATUS_KEYS[status];
    return key ? t(key as Parameters<typeof t>[0]) : status;
  }
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);

  // filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [callStatus, setCallStatus] = useState("all");
  const [userId, setUserId] = useState("all");
  const [originNumber, setOriginNumber] = useState("");
  const [destinationNumber, setDestinationNumber] = useState("");

  // pagination
  const [page, setPage] = useState(1);

  // Confirmação de exclusão via AlertDialog (substitui o confirm() nativo)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ── data loading ───────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await fetchAllUsers();
      setUsers(data?.users ?? []);
    } catch {
      // non-critical
    }
  }, []);

  const loadLogs = useCallback(
    async (currentPage = 1) => {
      setLoading(true);
      try {
        const filters: CallLogFilters = {
          page: currentPage,
          limit: PAGE_SIZE,
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
          ...(callStatus !== "all" && { callStatus }),
          ...(userId !== "all" && { userId }),
          ...(originNumber.trim() && { originNumber: originNumber.trim() }),
          ...(destinationNumber.trim() && { destinationNumber: destinationNumber.trim() }),
        };
        const { data } = await fetchCallLogs(filters);
        // API may return { data: [], count: N } or raw array
        if (Array.isArray(data)) {
          setLogs(data);
          setTotal(data.length);
        } else {
          setLogs((data as { data: CallLog[]; count: number }).data ?? []);
          setTotal((data as { data: CallLog[]; count: number }).count ?? 0);
        }
      } catch {
        toast.error(t("errorLoadLogs"));
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate, callStatus, userId, originNumber, destinationNumber]
  );

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(1);
    loadLogs(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, callStatus, userId]);

  function handleSearch() {
    setPage(1);
    loadLogs(1);
  }

  function handlePageChange(next: number) {
    setPage(next);
    loadLogs(next);
  }

  // ── delete ─────────────────────────────────────────────────────────────────

  function handleDelete(id: number) {
    setDeleteId(id);
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    try {
      await deleteCallLog(deleteId);
      toast.success(t("successDeleteLog"));
      loadLogs(page);
    } catch {
      toast.error(t("errorDeleteLog"));
    }
  }

  // ── CSV export ─────────────────────────────────────────────────────────────

  function downloadReport() {
    if (logs.length === 0) {
      toast.error(t("errorNoDataExport"));
      return;
    }
    const header = `${t("csvId")},${t("csvUser")},${t("csvOrigin")},${t("csvDestination")},${t("csvStatus")},${t("csvDuration")},${t("csvCreatedAt")}\n`;
    const rows = logs
      .map((log) =>
        [
          log.id,
          log.user?.name ?? log.userId ?? "",
          log.originNumber ?? "",
          log.destinationNumber ?? "",
          formatStatus(log.callStatus),
          formatDuration(log.callDuration),
          formatDate(log.createdAt),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + header + rows], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "report_call_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t("successExport"));
  }

  // ── sort ───────────────────────────────────────────────────────────────────

  const { sortKey, sortDir, handleSort, sortedData: sortedLogs } = useSortable(
    logs as unknown as Record<string, unknown>[],
    "createdAt"
  );

  // ── pagination math ────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  // ── render ─────────────────────────────────────────────────────────────────

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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadLogs(page)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("refresh")}
          </Button>
          <Button size="sm" onClick={downloadReport}>
            <Download className="mr-2 h-4 w-4" />
            {t("exportCsv")}
          </Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* Date range */}
            <div className="space-y-1.5">
              <Label>{t("labelStartDate")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("labelEndDate")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>{t("labelStatus")}</Label>
              <Select value={callStatus} onValueChange={setCallStatus}>
                <SelectTrigger>
                  <SelectValue placeholder={t("allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="Calling">{t("statusCalling")}</SelectItem>
                  <SelectItem value="Received">{t("statusReceived")}</SelectItem>
                  <SelectItem value="Accepted">{t("statusAccepted")}</SelectItem>
                  <SelectItem value="Completed">{t("statusCompleted")}</SelectItem>
                  <SelectItem value="Ended">{t("statusEnded")}</SelectItem>
                  <SelectItem value="Missed">{t("statusMissed")}</SelectItem>
                  <SelectItem value="Busy">{t("statusBusy")}</SelectItem>
                  <SelectItem value="Failed">{t("statusFailed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* User */}
            <div className="space-y-1.5">
              <Label>{t("labelUserAgent")}</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("allUsers")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all")}</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Number search */}
            <div className="space-y-1.5">
              <Label>{t("labelOriginNumber")}</Label>
              <Input
                placeholder={t("placeholderNumber")}
                value={originNumber}
                onChange={(e) => setOriginNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("labelDestinationNumber")}</Label>
              <Input
                placeholder={t("placeholderNumber")}
                value={destinationNumber}
                onChange={(e) => setDestinationNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>

            {/* Search button */}
            <div className="flex items-end">
              <Button onClick={handleSearch} className="w-full sm:w-auto">
                <Search className="mr-2 h-4 w-4" />
                {t("search")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <SortableTableHead sortKey="userId" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colUser")}</SortableTableHead>
                  <SortableTableHead sortKey="originNumber" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colOriginNumber")}</SortableTableHead>
                  <SortableTableHead sortKey="destinationNumber" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDestinationNumber")}</SortableTableHead>
                  <SortableTableHead sortKey="callStatus" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
                  <SortableTableHead sortKey="callDuration" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDuration")}</SortableTableHead>
                  <SortableTableHead sortKey="createdAt" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colCreatedAt")}</SortableTableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sortedLogs as unknown as typeof logs).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {log.id}
                    </TableCell>
                    <TableCell>
                      {log.user?.name ?? (log.userId ? `#${log.userId}` : "—")}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.originNumber || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.destinationNumber || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(log.callStatus)}>
                        {formatStatus(log.callStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDuration(log.callDuration)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(log.id)}
                        title={t("deleteLog")}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {total} {total !== 1 ? t("records") : t("record")}
                {totalPages > 1 && ` — ${t("page")} ${page} ${t("of")} ${totalPages}`}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!hasPrev}
                  onClick={() => handlePageChange(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!hasNext}
                  onClick={() => handlePageChange(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmação de exclusão (AlertDialog) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteLog")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDeleteLog")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={confirmDelete}
            >
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
