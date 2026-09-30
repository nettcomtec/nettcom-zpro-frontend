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
import { Plus, MoreVertical, Pencil, Trash2, Globe, Eye, EyeOff, Copy, Check, ChevronsUpDown, Search } from "lucide-react";
import { toast } from "sonner";
import { fetchAppWabas, createAppWaba, bulkCreateAppWaba, updateAppWaba, deleteAppWaba } from "@/services/superadmin";
import { MetaPartnerSealDialog } from "@/components/meta-partner-seal-dialog";
import { fetchTenants } from "@/services/tenants";
import { OAUTH_PROXY_URL } from "@/config/oauth-proxy";
import { LEGAL_LANGS, type LegalLang } from "@/lib/legal-langs";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AppWaba {
  id: number;
  appId?: string;
  apiVersion?: string;
  description?: string;
  token?: string;
  configId?: string;
  appSecret?: string;
  redirectUri?: string;
  redirectUriFacebook?: string;
  appInstagramId?: string;
  appInstagramSecret?: string;
  redirectUriInstagram?: string;
  tenantId?: number;
  isActive?: boolean;
}

interface Tenant { id: number; name: string; }


// Phase 13.a — Redirect URIs fixed to the canonical OAuth proxy host.
// Meta channels (WABA ES, Instagram, Facebook Messenger) cannot use the
// tenant's custom CNAME because the Facebook JavaScript SDK requires the
// hosting domain to be in the app's "Allowed Domains for the JavaScript SDK"
// whitelist — which cannot be customized per-tenant. So we always show
// oauth.techprovider.com.br here regardless of /oauth-dominio settings.
function getProxyUris() {
  return {
    redirectUri:          `${OAUTH_PROXY_URL}/waba-signup`,
    redirectUriInstagram: `${OAUTH_PROXY_URL}/instagram-signup`,
    redirectUriFacebook:  `${OAUTH_PROXY_URL}/facebook-signup`,
  };
}

function CopyButton({ value }: { value: string }) {
  const t = useTranslations("appWabaPage");
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

/** Abre a URL em janela popup centralizada (preview dos documentos legais). */
function openPreviewPopup(url: string) {
  const w = 900;
  const h = 700;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  window.open(url, "legal-preview", `width=${w},height=${h},left=${left},top=${top}`);
}

function ReadonlyUriField({ label, value, hint, previewTitle }: { label: string; value: string; hint?: string; previewTitle?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        <Input value={value} readOnly className="font-mono text-xs bg-muted" />
        <CopyButton value={value} />
        {previewTitle && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openPreviewPopup(value)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{previewTitle}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function AppWabaPage() {
  const t = useTranslations("appWabaPage");
  const [apps, setApps] = useState<AppWaba[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<AppWaba>>({});
  const [saving, setSaving] = useState(false);
  const [manualVersion, setManualVersion] = useState(false);
  const [bulkTenantIds, setBulkTenantIds] = useState<number[]>([]);
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [tenantSearch, setTenantSearch] = useState("");
  const [legalLang, setLegalLang] = useState<LegalLang>("pt");

  // Meta channels always use canonical oauth.techprovider.com.br — see getProxyUris comment
  const uris = getProxyUris();

  const set = (k: keyof AppWaba, v: unknown) => setEditing((p) => ({ ...p, [k]: v }));

  async function load() {
    try {
      const { data } = await fetchAppWabas();
      setApps(Array.isArray(data) ? data : (data as { appWabas?: AppWaba[] })?.appWabas || []);
    } catch { toast.error(t("errorLoad")); }
    finally { setLoading(false); }
  }

  async function loadTenants() {
    try {
      const { data } = await fetchTenants();
      setTenants(Array.isArray(data) ? data : []);
    } catch { /* silencioso */ }
  }

  useEffect(() => { load(); loadTenants(); }, []);

  const FIXED_VERSIONS = ["v17.0", "v18.0", "v19.0", "v20.0", "v21.0", "v22.0", "v23.0", "v24.0", "v25.0", "v26.0"];

  function openCreate() {
    setEditing({
      tenantId: undefined, appId: "", apiVersion: "v19.0", description: "",
      token: "", configId: "", appSecret: "",
      redirectUri: uris.redirectUri,
      redirectUriFacebook: uris.redirectUriFacebook,
      appInstagramId: "", appInstagramSecret: "",
      redirectUriInstagram: uris.redirectUriInstagram,
      isActive: true,
    });
    setManualVersion(false);
    setBulkTenantIds([]);
    setTenantSearch("");
    setOpen(true);
  }

  function openEdit(a: AppWaba) {
    const isManual = !!a.apiVersion && !FIXED_VERSIONS.includes(a.apiVersion);
 // Front legado: redirectUri sempre sobrescrito pelo valor padrão (window.location.origin) ao abrir edição
    setEditing({
      ...a,
      redirectUri: uris.redirectUri,
      redirectUriFacebook: uris.redirectUriFacebook,
      redirectUriInstagram: uris.redirectUriInstagram,
    });
    setManualVersion(isManual);
    setBulkTenantIds([]);
    setTenantSearch("");
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const basePayload = {
        ...editing,
        redirectUri: uris.redirectUri,
        redirectUriFacebook: uris.redirectUriFacebook,
        redirectUriInstagram: uris.redirectUriInstagram,
      };
      if (editing.id) {
        // 1) Atualiza o AppWaba atual
        await updateAppWaba(editing.id, basePayload as Record<string, unknown>);
        // 2) Se selecionou outros tenants, estende para eles
        if (bulkTenantIds.length > 0) {
          const additional = bulkTenantIds.filter((id) => id !== editing.tenantId);
          if (additional.length > 0) {
            const { tenantId: _o, id: _id, ...rest } = basePayload as Record<string, unknown>;
            const { data } = await bulkCreateAppWaba({ ...rest, tenantIds: additional });
            const r = (data || {}) as { created?: number; failed?: number; errors?: Array<{ tenantId: number; tenantName?: string; message: string }> };
            if ((r.failed || 0) > 0) {
              toast.warning(t("extendPartial", { updated: 1, created: r.created || 0, failed: r.failed || 0 }));
              (r.errors || []).slice(0, 3).forEach((e) => toast.error(`${e.tenantName || `#${e.tenantId}`}: ${e.message}`));
            } else {
              toast.success(t("extendedOk", { count: r.created || additional.length }));
            }
          } else {
            toast.success(t("appUpdated"));
          }
        } else {
          toast.success(t("appUpdated"));
        }
      } else if (bulkTenantIds.length > 1) {
        const { tenantId: _omit, ...rest } = basePayload as Record<string, unknown>;
        const { data } = await bulkCreateAppWaba({ ...rest, tenantIds: bulkTenantIds });
        const r = (data || {}) as { created?: number; failed?: number; errors?: Array<{ tenantId: number; tenantName?: string; message: string }> };
        if ((r.failed || 0) > 0) {
          toast.warning(t("bulkPartial", { created: r.created || 0, failed: r.failed || 0 }));
          (r.errors || []).slice(0, 3).forEach((e) => toast.error(`${e.tenantName || `#${e.tenantId}`}: ${e.message}`));
        } else {
          toast.success(t("bulkCreated", { count: r.created || bulkTenantIds.length }));
        }
      } else if (bulkTenantIds.length === 1) {
        const payload = { ...basePayload, tenantId: bulkTenantIds[0] };
        await createAppWaba(payload as Record<string, unknown>);
        toast.success(t("appCreated"));
      } else if (editing.tenantId) {
        await createAppWaba(basePayload as Record<string, unknown>);
        toast.success(t("appCreated"));
      } else {
        toast.warning(t("selectTenantWarning"));
        setSaving(false);
        return;
      }
      setOpen(false); load();
    } catch { toast.error(t("errorSave")); }
    finally { setSaving(false); }
  }

  async function handleDelete(a: AppWaba) {
    if (!confirm(t("deleteConfirm", { appId: a.appId || "" }))) return;
    try { await deleteAppWaba(a.id); toast.success(t("deleted")); load(); }
    catch { toast.error(t("errorDelete")); }
  }

  const tenantName = (id?: number) => tenants.find((t) => t.id === id)?.name || id?.toString() || "—";

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
              { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
            ],
          }}
        >
          <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newApp")}</Button>
        </PageHeader>

        {/* Meta Business Partner badge */}
        <div className="flex items-center gap-3 py-2.5 px-4 rounded-lg border bg-card max-w-lg">
          <MetaPartnerSealDialog imgClassName="h-8 object-contain shrink-0 opacity-90" zoomLabel={t("metaPartnerLabel")} />
          <div>
            <p className="text-xs font-semibold text-[#0866FF] dark:text-blue-400 mb-0.5">{t("metaPartnerLabel")}</p>
            <p className="text-xs text-muted-foreground leading-snug">{t("metaPartnerDescription")}</p>
          </div>
        </div>

        {loading ? <Skeleton className="h-64 w-full" /> : apps.length === 0 ? (
          <EmptyState icon={Globe} title={t("emptyTitle")} description={t("emptyDescription")}>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("newApp")}</Button>
          </EmptyState>
        ) : (
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead><TableHead>App ID</TableHead><TableHead>{t("version")}</TableHead>
                <TableHead>{t("descriptionCol")}</TableHead><TableHead>Tenant</TableHead><TableHead>{t("status")}</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {apps.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{a.id}</TableCell>
                    <TableCell className="font-mono text-sm">{a.appId || "—"}</TableCell>
                    <TableCell>{a.apiVersion || "—"}</TableCell>
                    <TableCell>{a.description || "—"}</TableCell>
                    <TableCell>{tenantName(a.tenantId)}</TableCell>
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
              <DialogTitle className="break-words">{editing.id ? t("editAppWaba") : t("newAppWaba")}</DialogTitle>
              <DialogDescription>{t("dialogDescription")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Tenant — multi-select quando criando, read-only + extender quando editando */}
              <div className="space-y-1.5">
                <Label>{editing.id ? "Tenant" : t("tenantsLabel")}</Label>
                {editing.id ? (
                  <>
                    <Input value={tenantName(editing.tenantId)} readOnly className="bg-muted" />
                    {(() => {
                      const others = tenants.filter((tn) => tn.id !== editing.tenantId);
                      const filtered = others.filter((tn) => !tenantSearch || (tn.name || "").toLowerCase().includes(tenantSearch.toLowerCase()) || String(tn.id).includes(tenantSearch));
                      const allFilteredSelected = filtered.length > 0 && filtered.every((tn) => bulkTenantIds.includes(tn.id));
                      const toggleAll = () => {
                        if (allFilteredSelected) {
                          setBulkTenantIds((p) => p.filter((id) => !filtered.some((tn) => tn.id === id)));
                        } else {
                          const toAdd = filtered.map((tn) => tn.id).filter((id) => !bulkTenantIds.includes(id));
                          setBulkTenantIds((p) => [...p, ...toAdd]);
                        }
                      };
                      return (
                        <div className="mt-3 border-t pt-3 space-y-1.5">
                          <Label className="text-xs font-medium">{t("extendToOthers")}</Label>
                          <Popover open={tenantPickerOpen} onOpenChange={setTenantPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                                <span className="truncate">
                                  {bulkTenantIds.length === 0
                                    ? t("selectTenants")
                                    : bulkTenantIds.length === others.length
                                      ? t("allTenantsSelected", { total: others.length })
                                      : t("nTenantsSelected", { count: bulkTenantIds.length, total: others.length })}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <div className="flex items-center gap-2 border-b px-3 py-2">
                                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <Input
                                  value={tenantSearch}
                                  onChange={(e) => setTenantSearch(e.target.value)}
                                  placeholder={t("searchTenants")}
                                  className="h-7 border-0 px-0 shadow-none focus-visible:ring-0 text-sm"
                                />
                              </div>
                              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                                <Checkbox
                                  id="extend-all-tenants"
                                  checked={allFilteredSelected}
                                  onCheckedChange={toggleAll}
                                />
                                <Label htmlFor="extend-all-tenants" className="text-xs cursor-pointer flex-1">
                                  {allFilteredSelected ? t("deselectAll") : t("selectAll")}
                                  <span className="ml-1 text-muted-foreground">({filtered.length})</span>
                                </Label>
                              </div>
                              <div className="max-h-64 overflow-y-auto">
                                {filtered.length === 0 ? (
                                  <p className="text-xs text-muted-foreground p-3 text-center">{t("noTenantsFound")}</p>
                                ) : filtered.map((tn) => (
                                  <div key={tn.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/60 cursor-pointer" onClick={() => {
                                    setBulkTenantIds((p) => p.includes(tn.id) ? p.filter((x) => x !== tn.id) : [...p, tn.id]);
                                  }}>
                                    <Checkbox
                                      checked={bulkTenantIds.includes(tn.id)}
                                      onCheckedChange={() => {
                                        setBulkTenantIds((p) => p.includes(tn.id) ? p.filter((x) => x !== tn.id) : [...p, tn.id]);
                                      }}
                                    />
                                    <span className="text-sm flex-1 truncate">{tn.name}</span>
                                    <span className="text-[10px] text-muted-foreground">#{tn.id}</span>
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <p className="text-[11px] text-muted-foreground">
                            {bulkTenantIds.length === 0 ? t("extendHint") : t("extendHintWithCount", { count: bulkTenantIds.length })}
                          </p>
                        </div>
                      );
                    })()}
                  </>
                ) : (() => {
                  const filtered = tenants.filter((tn) => !tenantSearch || (tn.name || "").toLowerCase().includes(tenantSearch.toLowerCase()) || String(tn.id).includes(tenantSearch));
                  const allFilteredSelected = filtered.length > 0 && filtered.every((tn) => bulkTenantIds.includes(tn.id));
                  const toggleAll = () => {
                    if (allFilteredSelected) {
                      setBulkTenantIds((p) => p.filter((id) => !filtered.some((tn) => tn.id === id)));
                    } else {
                      const toAdd = filtered.map((tn) => tn.id).filter((id) => !bulkTenantIds.includes(id));
                      setBulkTenantIds((p) => [...p, ...toAdd]);
                    }
                  };
                  return (
                    <Popover open={tenantPickerOpen} onOpenChange={setTenantPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                          <span className="truncate">
                            {bulkTenantIds.length === 0
                              ? t("selectTenants")
                              : bulkTenantIds.length === tenants.length
                                ? t("allTenantsSelected", { total: tenants.length })
                                : t("nTenantsSelected", { count: bulkTenantIds.length, total: tenants.length })}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <div className="flex items-center gap-2 border-b px-3 py-2">
                          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <Input
                            value={tenantSearch}
                            onChange={(e) => setTenantSearch(e.target.value)}
                            placeholder={t("searchTenants")}
                            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0 text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                          <Checkbox
                            id="select-all-tenants"
                            checked={allFilteredSelected}
                            onCheckedChange={toggleAll}
                          />
                          <Label htmlFor="select-all-tenants" className="text-xs cursor-pointer flex-1">
                            {allFilteredSelected ? t("deselectAll") : t("selectAll")}
                            <span className="ml-1 text-muted-foreground">({filtered.length})</span>
                          </Label>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {filtered.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-3 text-center">{t("noTenantsFound")}</p>
                          ) : filtered.map((tn) => (
                            <div key={tn.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/60 cursor-pointer" onClick={() => {
                              setBulkTenantIds((p) => p.includes(tn.id) ? p.filter((x) => x !== tn.id) : [...p, tn.id]);
                            }}>
                              <Checkbox
                                checked={bulkTenantIds.includes(tn.id)}
                                onCheckedChange={() => {
                                  setBulkTenantIds((p) => p.includes(tn.id) ? p.filter((x) => x !== tn.id) : [...p, tn.id]);
                                }}
                              />
                              <span className="text-sm flex-1 truncate">{tn.name}</span>
                              <span className="text-[10px] text-muted-foreground">#{tn.id}</span>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })()}
                {!editing.id && bulkTenantIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {bulkTenantIds.length === 1
                      ? t("singleTenantHint")
                      : t("bulkTenantsHint", { count: bulkTenantIds.length })}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>App ID</Label>
                  <Input value={editing.appId || ""} onChange={(e) => set("appId", e.target.value)} placeholder={t("appIdPlaceholder")} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("apiVersion")}</Label>
                  <div className="space-y-2">
                    <Select
                      value={manualVersion ? "manual" : (editing.apiVersion || "v19.0")}
                      onValueChange={(v) => {
                        if (v === "manual") {
                          setManualVersion(true);
                          set("apiVersion", "");
                        } else {
                          setManualVersion(false);
                          set("apiVersion", v);
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FIXED_VERSIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        <SelectItem value="manual">{t("enterManually")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {manualVersion && (
                      <Input
                        value={editing.apiVersion || ""}
                        onChange={(e) => set("apiVersion", e.target.value)}
                        placeholder="ex: v27.0"
                        className="font-mono text-sm"
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t("descriptionLabel")}</Label>
                <Textarea value={editing.description || ""} onChange={(e) => set("description", e.target.value)} rows={2} />
              </div>

              <div className="space-y-1.5">
                <Label>Token <span className="text-xs text-muted-foreground">({t("tokenHint")})</span></Label>
                <PasswordInput value={editing.token || ""} onChange={(v) => set("token", v)} placeholder={t("tokenPlaceholder")} />
              </div>

              <div className="space-y-1.5">
                <Label>Config ID <span className="text-xs text-muted-foreground">({t("configIdHint")})</span></Label>
                <Input value={editing.configId || ""} onChange={(e) => set("configId", e.target.value)} placeholder={t("configIdPlaceholder")} />
              </div>

              <div className="space-y-1.5">
                <Label>App Secret <span className="text-xs text-muted-foreground">({t("appSecretHint")})</span></Label>
                <PasswordInput value={editing.appSecret || ""} onChange={(v) => set("appSecret", v)} placeholder="App Secret" />
              </div>

              <ReadonlyUriField
                label="Redirect URI"
                value={uris.redirectUri}
                hint={t("redirectUriHint")}
              />

              {/* Instagram */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">{t("instagramSettings")}</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Instagram App ID</Label>
                    <Input value={editing.appInstagramId || ""} onChange={(e) => set("appInstagramId", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Instagram App Secret</Label>
                    <PasswordInput value={editing.appInstagramSecret || ""} onChange={(v) => set("appInstagramSecret", v)} />
                  </div>
                  <ReadonlyUriField
                    label="Redirect URI Instagram"
                    value={uris.redirectUriInstagram}
                    hint={t("redirectUriInstagramHint")}
                  />
                </div>
              </div>

              {/* Facebook */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">{t("facebookSettings")}</p>
                <ReadonlyUriField
                  label="Redirect URI Facebook"
                  value={uris.redirectUriFacebook}
                  hint={t("redirectUriFacebookHint")}
                />
              </div>

              {/* Links públicos de Política de Privacidade / Termos de Uso para o App Review da Meta */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold">{t("legalLinksTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("legalLinksHint")}</p>
                <div className="space-y-1.5">
                  <Label>{t("legalLinksLanguage")}</Label>
                  <Select value={legalLang} onValueChange={(v) => setLegalLang(v as LegalLang)}>
                    <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEGAL_LANGS.map((l) => (
                        <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(() => {
                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                  const suffix = legalLang === "pt" ? "" : `?lang=${legalLang}`;
                  return (
                    <>
                      <ReadonlyUriField label={t("privacyPolicyLink")} value={`${origin}/politica-de-privacidade${suffix}`} previewTitle={t("legalLinksPreview")} />
                      <ReadonlyUriField label={t("termsLink")} value={`${origin}/termos-de-uso${suffix}`} previewTitle={t("legalLinksPreview")} />
                      <ReadonlyUriField label={t("dataDeletionLink")} value={`${origin}/politica-de-privacidade${suffix}#data-deletion`} previewTitle={t("legalLinksPreview")} />
                    </>
                  );
                })()}
              </div>

              {/* isActive */}
              <div className="border-t pt-4 flex items-center gap-3">
                <Switch
                  checked={!!editing.isActive}
                  onCheckedChange={(v) => set("isActive", v)}
                  id="isActive"
                />
                <Label htmlFor="isActive">{t("active")}</Label>
              </div>
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>{saving ? t("saving") : t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
