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
import { Plus, MoreVertical, Pencil, Trash2, Tag, Eye, EyeOff, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { fetchAppOLXs, createAppOLX, updateAppOLX, deleteAppOLX } from "@/services/superadmin";
import { fetchTenants } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";
import { getProxyCallbackUrl } from "@/config/oauth-proxy";
import { useOAuthProxyDomain } from "@/hooks/use-oauth-proxy-domain";

interface AppOLX {
  id: number;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  webhookUrl?: string;
  description?: string;
  tenantId?: number | null;
  isActive?: boolean;
}

interface Tenant { id: number; name: string; }

function CopyButton({ value }: { value: string }) {
  const t = useTranslations("appOLXPage");
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handle}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("copy")}</TooltipContent>
    </Tooltip>
  );
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono text-xs" />
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShow(!show)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function AppOLXPage() {
  const t = useTranslations("appOLXPage");
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.profile === "superadmin";
  const [apps, setApps] = useState<AppOLX[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<AppOLX>>({});
  const [saving, setSaving] = useState(false);

  const set = (k: keyof AppOLX, v: unknown) => setEditing((p) => ({ ...p, [k]: v }));

  async function load() {
    try {
      const { data } = await fetchAppOLXs();
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

  // Auto-preencher URLs a partir do NEXT_PUBLIC_API_URL (env do backend)
  const backendUrl = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.hostname}:3101`)
    : "";
  // Phase 11/12 — Redirect URI fixo no proxy, respeitando custom domain se configurado
  const { customDomain: oauthCustomDomain } = useOAuthProxyDomain();
  const defaultRedirectUri = getProxyCallbackUrl(oauthCustomDomain);
  // Webhook URL é hardcoded para o oauth-proxy — proxy gerencia roteamento por user_id
  const PROXY_WEBHOOK_URL = "https://oauth.techprovider.com.br/olx-webhook";

  useEffect(() => {
    load();
    if (isSuperadmin) loadTenants();
  }, [isSuperadmin]);

  function openCreate() {
    setEditing({
      tenantId: null,
      clientId: "",
      clientSecret: "",
      redirectUri: defaultRedirectUri,
      webhookUrl: PROXY_WEBHOOK_URL,
      description: "",
      isActive: true,
    });
    setOpen(true);
  }

  function openEdit(a: AppOLX) {
    // Phase 11: force redirectUri to always be the fixed proxy URL
    setEditing({ ...a, redirectUri: defaultRedirectUri });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = isSuperadmin
        ? {
            ...editing,
            redirectUri: defaultRedirectUri,
            isGlobal: editing.tenantId === null || editing.tenantId === undefined,
          }
        : (() => {
            const { tenantId: _tid, ...rest } = editing;
            void _tid;
            return { ...rest, redirectUri: defaultRedirectUri } as Record<string, unknown>;
          })();
      if (editing.id) {
        await updateAppOLX(editing.id, payload);
        toast.success(t("appUpdated"));
      } else {
        await createAppOLX(payload);
        toast.success(t("appCreated"));
      }
      setOpen(false);
      load();
    } catch { toast.error(t("errorSave")); }
    finally { setSaving(false); }
  }

  async function handleDelete(a: AppOLX) {
    if (!confirm(t("deleteConfirm", { clientId: a.clientId || "" }))) return;
    try { await deleteAppOLX(a.id); toast.success(t("deleted")); load(); }
    catch { toast.error(t("errorDelete")); }
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
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            ],
          }}
        >
          <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newApp")}</Button>
        </PageHeader>

        {loading ? <Skeleton className="h-64 w-full" /> : apps.length === 0 ? (
          <EmptyState icon={Tag} title={t("emptyTitle")} description={t("emptyDescription")}>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("newApp")}</Button>
          </EmptyState>
        ) : (
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Client ID</TableHead>
                <TableHead>{t("descriptionCol")}</TableHead>
                {isSuperadmin && <TableHead>Tenant</TableHead>}
                <TableHead>{t("status")}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {apps.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{a.id}</TableCell>
                    <TableCell className="font-mono text-sm">{a.clientId || "---"}</TableCell>
                    <TableCell>{a.description || "---"}</TableCell>
                    {isSuperadmin && (
                      <TableCell>
                        {a.tenantId === null ? (
                          <Badge variant="outline">{t("global")}</Badge>
                        ) : (
                          tenantName(a.tenantId)
                        )}
                      </TableCell>
                    )}
                    <TableCell><Badge variant={a.isActive ? "success" : "secondary"}>{a.isActive ? t("active") : t("inactive")}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(a)}><Pencil className="mr-2 h-4 w-4" />{t("edit")}</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(a)}><Trash2 className="mr-2 h-4 w-4" />{t("delete")}</DropdownMenuItem>
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
                <Label>Client ID</Label>
                <Input value={editing.clientId || ""} onChange={(e) => set("clientId", e.target.value)} placeholder="your-client-id" />
              </div>

              <div className="space-y-1.5">
                <Label>Client Secret</Label>
                <PasswordInput value={editing.clientSecret || ""} onChange={(v) => set("clientSecret", v)} placeholder="your-client-secret" />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  Redirect URI (OAuth callback)
                  <Badge variant="outline" className="text-[10px] font-normal">{t("redirectUriFixed")}</Badge>
                </Label>
                <div className="flex gap-2 items-center">
                  <Input value={defaultRedirectUri} readOnly className="font-mono text-xs bg-muted cursor-not-allowed" />
                  <CopyButton value={defaultRedirectUri} />
                </div>
                <p className="text-xs text-muted-foreground">{t("redirectUriFixedHint")}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {t("customDomainNotice")}{" "}
                  <a href="/oauth-dominio" className="underline font-medium">
                    {t("customDomainNoticeLink")}
                  </a>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  Webhook URL
                  <Badge variant="outline" className="text-[10px] font-normal">{t("webhookFixed")}</Badge>
                </Label>
                <div className="flex gap-2 items-center">
                  <Input value={PROXY_WEBHOOK_URL} readOnly className="font-mono text-xs bg-muted cursor-not-allowed" />
                  <CopyButton value={PROXY_WEBHOOK_URL} />
                </div>
                <p className="text-xs text-muted-foreground">{t("webhookHardcodedHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("descriptionCol")} ({t("optional")})</Label>
                <Textarea value={editing.description || ""} onChange={(e) => set("description", e.target.value)} placeholder={t("descriptionPlaceholder")} rows={2} />
              </div>

              <div className="flex items-center gap-3 pt-2 border-t">
                <Switch checked={editing.isActive !== false} onCheckedChange={(v) => set("isActive", v)} />
                <Label>{t("active")}</Label>
              </div>
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
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
