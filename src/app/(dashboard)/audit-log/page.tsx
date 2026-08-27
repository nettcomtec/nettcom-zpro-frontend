"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ClipboardList, Search, X, ChevronLeft, ChevronRight, Eye, Download } from "lucide-react";
import { fetchAuditLogs, AuditLog, AuditLogFilters } from "@/services/audit-log";
import { fetchTenants } from "@/services/tenants";
import { fetchAllUsers, User } from "@/services/users";
import { fetchUserTenants } from "@/services/user-tenants";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  LOGIN:  "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  LOGOUT: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  TEST:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  MIGRATE:"bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  REPAIR: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
};

const METHOD_COLORS: Record<string, string> = {
  GET:    "bg-slate-100 text-slate-700",
  POST:   "bg-green-100 text-green-700",
  PUT:    "bg-yellow-100 text-yellow-700",
  PATCH:  "bg-orange-100 text-orange-700",
  DELETE: "bg-red-100 text-red-700",
};

function statusColor(code: number): string {
  if (code >= 500) return "bg-red-100 text-red-700";
  if (code >= 400) return "bg-yellow-100 text-yellow-700";
  if (code >= 300) return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return formatDateTime(d, { dateStyle: "short", timeStyle: "medium" });
}

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "TEST", "MIGRATE", "REPAIR"];
const PAGE_SIZES = [25, 50, 100];

interface TenantOption { id: number; name: string; }
interface UserOption { id: number; name: string; email: string; }

export default function AuditLogPage() {
  const t = useTranslations("auditLogPage");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const { user } = useAuthStore();
  const isSuperAdmin = user?.profile === "superadmin";

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [draft, setDraft] = useState<AuditLogFilters>({});

  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Tenant & user dropdown data
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  // Load tenants for superadmin
  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchTenants().then(({ data }) => {
      const raw = data as any;
      const arr: any[] = Array.isArray(raw) ? raw : (raw?.tenants ?? raw?.data ?? []);
      setTenants(arr.map((t: any) => ({ id: t.id, name: t.name })));
    }).catch(() => { toast.error(tErrors("loadFailed")); });
  }, [isSuperAdmin]);

  // Load users — for superadmin filtered by selected tenant, for admin all users
  const loadUsers = useCallback((tenantId?: number) => {
    if (isSuperAdmin && tenantId) {
      fetchUserTenants({ tenantId }).then(({ data }) => {
        const raw = data as any;
        const arr: any[] = Array.isArray(raw) ? raw : (raw?.users ?? []);
        setUsers(arr.filter((u: any) => u.profile !== "superadmin").map((u: any) => ({ id: u.id, name: u.name, email: u.email })));
      }).catch(() => { toast.error(tErrors("loadFailed")); });
    } else if (!isSuperAdmin) {
      fetchAllUsers().then(({ data }) => {
        const arr = data?.users ?? [];
        setUsers(arr.filter((u: any) => u.profile !== "superadmin").map((u: any) => ({ id: u.id, name: u.name, email: u.email })));
      }).catch(() => { toast.error(tErrors("loadFailed")); });
    } else {
      setUsers([]);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadUsers(undefined);
  }, [loadUsers]);

  const load = useCallback(async (f: AuditLogFilters, p: number, l: number) => {
    setLoading(true);
    try {
      const res = await fetchAuditLogs({ ...f, page: p, limit: l });
      setLogs(res.data.logs);
      setCount(res.data.count);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(filters, page, limit);
  }, [load, filters, page, limit]);

  async function handleExportCsv() {
    if (count === 0) {
      toast.warning(t("noDataToExport"));
      return;
    }
    setExportingCsv(true);
    const toastId = toast.loading(tCommon("exportLoading"));
    try {
      const res = await fetchAuditLogs({ ...filters, page: 1, limit: 10000 });
      const rows = res.data.logs;
      const headers = ["Data/Hora", "Usuário", "Email", "Tenant", "Ação", "Entidade", "ID Entidade", "Método", "Caminho", "Status", "IP"];
      const escape = (v: string | number | null | undefined) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const csvLines = [
        headers.join(","),
        ...rows.map(log => [
          // CSV mantém formato fixo pt-BR (conteúdo do arquivo exportado, não exibição)
          escape(new Date(log.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })),
          escape(log.user?.name ?? log.userId),
          escape(log.user?.email ?? ""),
          escape(log.tenantId),
          escape(log.action),
          escape(log.entity),
          escape(log.entityId),
          escape(log.method),
          escape(log.path),
          escape(log.statusCode),
          escape(log.ip),
        ].join(","))
      ];
      const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tCommon("downloadSuccess"), { id: toastId });
    } catch {
      toast.error(t("loadError"), { id: toastId });
    } finally {
      setExportingCsv(false);
    }
  }

  function applyFilters() {
    setFilters({ ...draft });
    setPage(1);
  }

  function clearFilters() {
    setDraft({});
    setFilters({});
    setPage(1);
    if (isSuperAdmin) setUsers([]);
  }

  // When superadmin changes tenant, reload users and clear userId
  function handleTenantChange(val: string) {
    const tenantId = val === "all" ? undefined : Number(val);
    setDraft(d => ({ ...d, tenantId, userId: undefined }));
    loadUsers(tenantId);
  }

  const totalPages = Math.max(1, Math.ceil(count / limit));
  const from = count === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, count);

  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== "");

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
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            {/* Tenant (superadmin only) */}
            {isSuperAdmin && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("filters.tenant")}</Label>
                <Select
                  value={draft.tenantId !== undefined ? String(draft.tenantId) : "all"}
                  onValueChange={handleTenantChange}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t("filters.allTenants")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.allTenants")}</SelectItem>
                    {tenants.map(ten => (
                      <SelectItem key={ten.id} value={String(ten.id)}>
                        {ten.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Action */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("filters.action")}</Label>
              <Select
                value={draft.action || "all"}
                onValueChange={v => setDraft(d => ({ ...d, action: v === "all" ? undefined : v }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t("filters.allActions")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filters.allActions")}</SelectItem>
                  {ACTIONS.map(a => (
                    <SelectItem key={a} value={a}>
                      {t(`actions.${a}` as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entity */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("filters.entity")}</Label>
              <Input
                className="h-8 text-xs"
                placeholder={t("filters.entity")}
                value={draft.entity || ""}
                onChange={e => setDraft(d => ({ ...d, entity: e.target.value || undefined }))}
              />
            </div>

            {/* User dropdown */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("filters.user")}</Label>
              <Select
                value={draft.userId !== undefined ? String(draft.userId) : "all"}
                onValueChange={v => setDraft(d => ({ ...d, userId: v === "all" ? undefined : Number(v) }))}
                disabled={isSuperAdmin && !draft.tenantId}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t("filters.allUsers")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filters.allUsers")}</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start date */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("filters.startDate")}</Label>
              <Input
                className="h-8 text-xs"
                type="date"
                value={draft.startDate || ""}
                onChange={e => setDraft(d => ({ ...d, startDate: e.target.value || undefined }))}
              />
            </div>

            {/* End date */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("filters.endDate")}</Label>
              <Input
                className="h-8 text-xs"
                type="date"
                value={draft.endDate || ""}
                onChange={e => setDraft(d => ({ ...d, endDate: e.target.value || undefined }))}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button size="sm" className="h-8 flex-1" onClick={applyFilters}>
                <Search className="h-3 w-3 mr-1" />
                {t("filters.apply")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0" onClick={handleExportCsv} disabled={exportingCsv} title={t("exportCsv")}>
                <Download className="h-3 w-3" />
              </Button>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" className="h-8 px-2 shrink-0" onClick={clearFilters}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t("table.datetime")}</TableHead>
                <TableHead className="text-xs">{t("table.user")}</TableHead>
                <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                <TableHead className="text-xs">{t("table.action")}</TableHead>
                <TableHead className="text-xs">{t("table.entity")}</TableHead>
                <TableHead className="text-xs">{t("table.method")}</TableHead>
                <TableHead className="text-xs">{t("table.path")}</TableHead>
                <TableHead className="text-xs">{t("table.status")}</TableHead>
                <TableHead className="text-xs">{t("table.ip")}</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : logs.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-40">
                        <EmptyState
                          icon={ClipboardList}
                          title={t("empty")}
                        />
                      </TableCell>
                    </TableRow>
                  )
                : logs.map(log => (
                    <TableRow key={log.id} className="text-xs">
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        {log.user ? (
                          <div className="flex flex-col">
                            <span className="font-medium">{log.user.name}</span>
                            <span className="text-muted-foreground text-[10px]">{log.user.email}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">#{log.userId ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.tenantId != null ? (
                          <div className="flex flex-col">
                            <span className="font-mono text-[10px] text-muted-foreground">#{log.tenantId}</span>
                            {isSuperAdmin && (
                              <span className="font-medium text-xs">{tenants.find(tn => tn.id === log.tenantId)?.name ?? "—"}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"}`}>
                          {t(`actions.${log.action}` as any, { defaultMessage: log.action })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{log.entity}</span>
                        {log.entityId && (
                          <span className="ml-1 text-muted-foreground text-[10px]">#{log.entityId}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${METHOD_COLORS[log.method] || "bg-gray-100 text-gray-700"}`}>
                          {log.method}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="block truncate font-mono text-[10px] text-muted-foreground" title={log.path}>
                          {log.path}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusColor(log.statusCode)}`}>
                          {log.statusCode}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                        {log.ip || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setDetail(log)}
                          title={t("table.details")}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {count > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("showing", { from, to, total: count })}
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(limit)}
              onValueChange={v => { setLimit(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums">{page} / {totalPages}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("detail.title")}</DialogTitle>
            <DialogDescription>
              {detail && (
                <span className="font-mono text-xs">{detail.path} — {formatDate(detail.createdAt)}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="flex flex-col gap-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-muted-foreground">{t("table.user")}: </span>{detail.user?.name || `#${detail.userId}`}</div>
                <div><span className="text-muted-foreground">{t("table.action")}: </span>{detail.action}</div>
                {detail.tenantId != null && (
                  <div>
                    <span className="text-muted-foreground">{t("table.tenant")}: </span>
                    #{detail.tenantId}{isSuperAdmin ? ` ${tenants.find(tn => tn.id === detail.tenantId)?.name ?? ""}` : ""}
                  </div>
                )}
                <div><span className="text-muted-foreground">{t("table.entity")}: </span>{detail.entity}{detail.entityId ? ` #${detail.entityId}` : ""}</div>
                <div><span className="text-muted-foreground">{t("table.status")}: </span>{detail.statusCode}</div>
                <div><span className="text-muted-foreground">{t("table.ip")}: </span>{detail.ip || "—"}</div>
                <div className="col-span-2 truncate"><span className="text-muted-foreground">User-Agent: </span>{detail.userAgent || "—"}</div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1">{t("detail.requestBody")}</p>
                {detail.requestBody
                  ? (
                    <pre className="bg-muted rounded p-3 text-[10px] font-mono overflow-auto max-h-64 whitespace-pre-wrap break-all">
                      {JSON.stringify(detail.requestBody, null, 2)}
                    </pre>
                  )
                  : <p className="text-xs text-muted-foreground">{t("detail.noData")}</p>
                }
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
