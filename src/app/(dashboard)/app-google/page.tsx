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
import { Plus, MoreVertical, Pencil, Trash2, Globe, Eye, EyeOff, Copy, Check, Mail, Calendar as CalendarIcon, Youtube } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAppGoogles,
  createAppGoogle,
  updateAppGoogle,
  deleteAppGoogle
} from "@/services/superadmin";
import { fetchTenants } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";
import { getGoogleCanonicalCallbackUrl } from "@/config/oauth-proxy";

interface AppGoogle {
  id: number;
  clientId?: string;
  clientSecret?: string;
  gmailEnabled?: boolean;
  calendarEnabled?: boolean;
  youtubeEnabled?: boolean;
  gmailScopes?: string | null;
  calendarScopes?: string | null;
  youtubeScopes?: string | null;
  youtubePollIntervalSeconds?: number;
  description?: string;
  tenantId?: number | null;
  isActive?: boolean;
}

interface Tenant { id: number; name: string; }

const GMAIL_SCOPES_DEFAULT = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify";
const CALENDAR_SCOPES_DEFAULT = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events";
const YOUTUBE_SCOPES_DEFAULT = "https://www.googleapis.com/auth/youtube.force-ssl";

function CopyButton({ value }: { value: string }) {
  const t = useTranslations("appGooglePage");
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

export default function AppGooglePage() {
  const t = useTranslations("appGooglePage");
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.profile === "superadmin";
  const [apps, setApps] = useState<AppGoogle[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<AppGoogle>>({});
  const [saving, setSaving] = useState(false);

  const set = (k: keyof AppGoogle, v: unknown) => setEditing((p) => ({ ...p, [k]: v }));

  // Phase 16 — Google NAO suporta custom domain nas Authorized Redirect URIs.
  // A URL e SEMPRE canonical, independente de customDomain do tenant.
  const defaultRedirectUri = getGoogleCanonicalCallbackUrl();

  async function load() {
    try {
      const { data } = await fetchAppGoogles();
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
      clientId: "",
      clientSecret: "",
      gmailEnabled: true,
      calendarEnabled: true,
      youtubeEnabled: true,
      gmailScopes: "",
      calendarScopes: "",
      youtubeScopes: "",
      youtubePollIntervalSeconds: 30,
      description: "",
      isActive: true,
    });
    setOpen(true);
  }

  function openEdit(a: AppGoogle) {
    setEditing({ ...a });
    setOpen(true);
  }

  async function handleSave() {
    if (!editing.clientId || !editing.clientSecret) {
      toast.error(t("clientIdSecretRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = isSuperadmin
        ? { ...editing }
        : (() => {
            const { tenantId: _tid, ...rest } = editing;
            void _tid;
            return { ...rest } as Record<string, unknown>;
          })();
      if (editing.id) {
        await updateAppGoogle(editing.id, payload);
        toast.success(t("appUpdated"));
      } else {
        await createAppGoogle(payload);
        toast.success(t("appCreated"));
      }
      setOpen(false);
      load();
    } catch { toast.error(t("errorSave")); }
    finally { setSaving(false); }
  }

  async function handleDelete(a: AppGoogle) {
    if (!confirm(t("deleteConfirm", { clientId: a.clientId || "" }))) return;
    try { await deleteAppGoogle(a.id); toast.success(t("deleted")); load(); }
    catch { toast.error(t("errorDelete")); }
  }

  const tenantName = (id?: number | null) => {
    if (id === null || id === undefined) return t("global");
    return tenants.find((ten) => ten.id === id)?.name || id?.toString() || "---";
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
              { title: t("helpCoverageTitle"), items: [t("helpCoverageGmail"), t("helpCoverageCalendar"), t("helpCoverageYouTube")] },
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
              { title: t("helpFallbackTitle"), items: [t("helpFallbackInfo"), t("helpFallbackPlatform"), t("helpFallbackOwn")] },
            ],
          }}
        >
          <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newApp")}</Button>
        </PageHeader>

        {loading ? <Skeleton className="h-64 w-full" /> : apps.length === 0 ? (
          <EmptyState icon={Globe} title={t("emptyTitle")} description={t("emptyDescription")}>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("newApp")}</Button>
          </EmptyState>
        ) : (
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Client ID</TableHead>
                <TableHead>{t("services")}</TableHead>
                <TableHead>{t("descriptionCol")}</TableHead>
                {isSuperadmin && <TableHead>Tenant</TableHead>}
                <TableHead>{t("status")}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {apps.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{a.id}</TableCell>
                    <TableCell className="font-mono text-xs">{a.clientId ? `${a.clientId.slice(0, 24)}…` : "---"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {a.gmailEnabled && <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" />Gmail</Badge>}
                        {a.calendarEnabled && <Badge variant="outline" className="gap-1"><CalendarIcon className="h-3 w-3" />Calendar</Badge>}
                        {a.youtubeEnabled && <Badge variant="outline" className="gap-1"><Youtube className="h-3 w-3" />YouTube</Badge>}
                      </div>
                    </TableCell>
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
                <Label>Client ID (OAuth 2.0)</Label>
                <Input value={editing.clientId || ""} onChange={(e) => set("clientId", e.target.value)} placeholder="123456789-abc.apps.googleusercontent.com" className="font-mono text-xs" />
              </div>

              <div className="space-y-1.5">
                <Label>Client Secret</Label>
                <PasswordInput value={editing.clientSecret || ""} onChange={(v) => set("clientSecret", v)} placeholder="GOCSPX-..." />
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
              </div>

              <div className="space-y-3 pt-2 border-t">
                <Label className="text-base">{t("servicesEnabledTitle")}</Label>
                <p className="text-xs text-muted-foreground">{t("servicesEnabledHint")}</p>
                <div className="flex items-center gap-3">
                  <Switch checked={editing.gmailEnabled !== false} onCheckedChange={(v) => set("gmailEnabled", v)} />
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Label>Gmail</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={editing.calendarEnabled !== false} onCheckedChange={(v) => set("calendarEnabled", v)} />
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Label>Google Calendar</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={editing.youtubeEnabled !== false} onCheckedChange={(v) => set("youtubeEnabled", v)} />
                  <Youtube className="h-4 w-4 text-muted-foreground" />
                  <Label>YouTube</Label>
                </div>
              </div>

              {editing.youtubeEnabled !== false && (
                <div className="space-y-1.5">
                  <Label>{t("youtubePollInterval")}</Label>
                  <Input
                    type="number"
                    min={15}
                    max={3600}
                    value={editing.youtubePollIntervalSeconds || 30}
                    onChange={(e) => set("youtubePollIntervalSeconds", Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">{t("youtubePollIntervalHint")}</p>
                </div>
              )}

              <details className="pt-2 border-t group">
                <summary className="cursor-pointer text-base font-medium select-none flex items-center gap-2 hover:text-primary transition-colors">
                  <span className="text-muted-foreground text-xs group-open:rotate-90 inline-block transition-transform">▶</span>
                  {t("scopesTitle")}
                </summary>
                <div className="space-y-3 mt-3">
                  <p className="text-xs text-muted-foreground">{t("scopesHint")}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">{t("scopesWarning")}</p>

                  <div className="space-y-1.5">
                    <Label>Gmail scopes ({t("optional")})</Label>
                    <Textarea value={editing.gmailScopes || ""} onChange={(e) => set("gmailScopes", e.target.value)} placeholder={GMAIL_SCOPES_DEFAULT} rows={2} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Calendar scopes ({t("optional")})</Label>
                    <Textarea value={editing.calendarScopes || ""} onChange={(e) => set("calendarScopes", e.target.value)} placeholder={CALENDAR_SCOPES_DEFAULT} rows={2} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>YouTube scopes ({t("optional")})</Label>
                    <Textarea value={editing.youtubeScopes || ""} onChange={(e) => set("youtubeScopes", e.target.value)} placeholder={YOUTUBE_SCOPES_DEFAULT} rows={2} className="font-mono text-xs" />
                  </div>
                </div>
              </details>

              <div className="space-y-1.5 pt-2 border-t">
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
