"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Plus, MoreVertical, Pencil, Trash2, Eye, EyeOff, CheckCircle2, XCircle, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAppRocketChats,
  createAppRocketChat,
  updateAppRocketChat,
  deleteAppRocketChat,
  validateAppRocketChat
} from "@/services/superadmin";
import { fetchTenants } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";

interface AppRocketChat {
  id: number;
  serverUrl?: string;
  adminUserId?: string;
  adminAuthToken?: string;
  autoCreateUsers?: boolean;
  description?: string;
  tenantId?: number | null;
  isActive?: boolean;
}

interface Tenant { id: number; name: string; }

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShow(!show)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function AppRocketChatPage() {
  const t = useTranslations("appRocketChatPage");
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.profile === "superadmin";
  const [apps, setApps] = useState<AppRocketChat[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<AppRocketChat>>({});
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);

  const set = (k: keyof AppRocketChat, v: unknown) => setEditing((p) => ({ ...p, [k]: v }));

  async function load() {
    try {
      const { data } = await fetchAppRocketChats();
      setApps(Array.isArray(data) ? data : []);
    } catch { toast.error(t("errorLoad")); }
    finally { setLoading(false); }
  }

  async function loadTenants() {
    try {
      const { data } = await fetchTenants();
      setTenants(Array.isArray(data) ? data : []);
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    load();
    if (isSuperadmin) loadTenants();
  }, [isSuperadmin]);

  function openCreate() {
    setEditing({
      tenantId: null,
      serverUrl: "",
      adminUserId: "",
      adminAuthToken: "",
      autoCreateUsers: false,
      description: "",
      isActive: true
    });
    setOpen(true);
  }

  function openEdit(a: AppRocketChat) {
    setEditing({ ...a });
    setOpen(true);
  }

  async function handleSave() {
    if (!editing.serverUrl || !editing.adminUserId || !editing.adminAuthToken) {
      toast.error(t("requiredFields"));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = isSuperadmin
        ? {
            ...editing,
            isGlobal: editing.tenantId === null || editing.tenantId === undefined
          }
        : (() => {
            const { tenantId: _tid, ...rest } = editing;
            void _tid;
            return rest as Record<string, unknown>;
          })();
      if (editing.id) {
        await updateAppRocketChat(editing.id, payload);
        toast.success(t("appUpdated"));
      } else {
        await createAppRocketChat(payload);
        toast.success(t("appCreated"));
      }
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorSave"));
    } finally { setSaving(false); }
  }

  async function handleDelete(a: AppRocketChat) {
    if (!confirm(t("deleteConfirm", { serverUrl: a.serverUrl || "" }))) return;
    try { await deleteAppRocketChat(a.id); toast.success(t("deleted")); load(); }
    catch { toast.error(t("errorDelete")); }
  }

  async function handleValidate() {
    if (!editing.id) return;
    setValidating(true);
    try {
      const { data } = await validateAppRocketChat(editing.id);
      if (data?.ok) {
        toast.success(t("validateSuccess", { username: data.username || "" }));
      } else {
        toast.error(t("validateError"));
      }
    } catch { toast.error(t("validateError")); }
    finally { setValidating(false); }
  }

  const tenantName = (id?: number | null) => {
    if (id === null || id === undefined) return t("global");
    return tenants.find((t) => t.id === id)?.name || id?.toString() || "---";
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title={t("title")}
          description={t("description")}
          help={{
            description: t("helpDesc"),
            sections: [
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] }
            ]
          }}
        >
          <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("newApp")}</Button>
        </PageHeader>

        {loading ? <Skeleton className="h-64 w-full" /> : apps.length === 0 ? (
          <EmptyState icon={MessageSquare} title={t("emptyTitle")} description={t("emptyDescription")}>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("newApp")}</Button>
          </EmptyState>
        ) : (
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t("serverUrlLabel")}</TableHead>
                <TableHead>{t("descriptionCol")}</TableHead>
                {isSuperadmin && <TableHead>Tenant</TableHead>}
                <TableHead>{t("autoCreateUsersLabel")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {apps.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{a.id}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">{a.serverUrl || "---"}</TableCell>
                    <TableCell>{a.description || "---"}</TableCell>
                    {isSuperadmin && (
                      <TableCell>
                        {a.tenantId === null
                          ? <Badge variant="outline">{t("global")}</Badge>
                          : tenantName(a.tenantId)
                        }
                      </TableCell>
                    )}
                    <TableCell>
                      {a.autoCreateUsers
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <XCircle className="h-4 w-4 text-muted-foreground" />
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.isActive ? "success" : "secondary"}>
                        {a.isActive ? t("active") : t("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(a)}>
                            <Pencil className="mr-2 h-4 w-4" />{t("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(a)}>
                            <Trash2 className="mr-2 h-4 w-4" />{t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="break-words">{editing.id ? t("editApp") : t("newAppTitle")}</DialogTitle>
              <DialogDescription>{t("dialogDescription")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isSuperadmin && (
                <div className="space-y-1.5">
                  <Label>Tenant</Label>
                  <Select
                    value={editing.tenantId === null || editing.tenantId === undefined ? "global" : editing.tenantId?.toString()}
                    onValueChange={(v) => set("tenantId", v === "global" ? null : Number(v))}
                    disabled={!!editing.id}
                  >
                    <SelectTrigger><SelectValue placeholder={t("selectTenant")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">{t("global")} ({t("allTenants")})</SelectItem>
                      {tenants.map((ten) => <SelectItem key={ten.id} value={ten.id.toString()}>{ten.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("tenantHint")}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{t("serverUrlLabel")} *</Label>
                <Input
                  value={editing.serverUrl || ""}
                  onChange={(e) => set("serverUrl", e.target.value)}
                  placeholder="https://chat.suaempresa.com"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">{t("serverUrlHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("adminUserIdLabel")} (X-User-Id) *</Label>
                <Input
                  value={editing.adminUserId || ""}
                  onChange={(e) => set("adminUserId", e.target.value)}
                  placeholder="abc123def456"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("adminAuthTokenLabel")} (X-Auth-Token) *</Label>
                <PasswordInput
                  value={editing.adminAuthToken || ""}
                  onChange={(v) => set("adminAuthToken", v)}
                  placeholder="Personal Access Token do admin RC"
                />
                <p className="text-xs text-muted-foreground">{t("authTokenHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("descriptionCol")} ({t("optional")})</Label>
                <Textarea
                  value={editing.description || ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder={t("descriptionPlaceholder")}
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-3 py-2 border-t">
                <Switch
                  checked={editing.autoCreateUsers ?? false}
                  onCheckedChange={(v) => set("autoCreateUsers", v)}
                />
                <div>
                  <Label>{t("autoCreateUsersLabel")}</Label>
                  <p className="text-xs text-muted-foreground">{t("autoCreateUsersHint")}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pb-2 border-b">
                <Switch
                  checked={editing.isActive !== false}
                  onCheckedChange={(v) => set("isActive", v)}
                />
                <Label>{t("active")}</Label>
              </div>
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              {editing.id && (
                <Button variant="outline" onClick={handleValidate} disabled={validating} className="w-full sm:w-auto sm:mr-auto">
                  {validating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("validating")}</> : t("validateBtn")}
                </Button>
              )}
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)} disabled={saving}>{t("cancel")}</Button>
              <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
                {saving ? t("saving") : editing.id ? t("save") : t("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
