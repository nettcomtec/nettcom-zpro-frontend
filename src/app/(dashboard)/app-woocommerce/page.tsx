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
import { TooltipProvider } from "@/components/ui/tooltip";
import { Plus, MoreVertical, Pencil, Trash2, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { HijackTakeoverDialog } from "@/components/common/hijack-takeover-dialog";
import { parseOAuthLicenseError, OAUTH_LICENSE_COOLDOWN_MS } from "@/lib/oauth-license-error";
import { takeoverRegistry, type HijackDetails } from "@/lib/registry-hijack";
import {
  fetchAppWooCommerces,
  createAppWooCommerce,
  updateAppWooCommerce,
  deleteAppWooCommerce,
  validateWooCommerceConnection,
  registerWooCommerceWebhooks
} from "@/services/superadmin";
import { fetchTenants } from "@/services/tenants";
import { fetchWhatsapps, createWhatsapp } from "@/services/whatsapp";
import { getWooCommerceProxyCallbackUrl } from "@/config/oauth-proxy";
import { useOAuthProxyDomain } from "@/hooks/use-oauth-proxy-domain";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";

interface AppWooCommerce {
  id: number;
  storeUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
  webhookSecret?: string;
  syncProducts?: boolean;
  autoCloseCompleted?: boolean;
  description?: string;
  tenantId?: number | null;
  whatsappId?: number | null;
  isActive?: boolean;
}

interface Tenant { id: number; name: string; }

interface WhatsappOption { id: number; name: string; type?: string }

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

export default function AppWooCommercePage() {
  const t = useTranslations("appWooCommercePage");
  const tCommon = useTranslations("common");
  const { customDomain: oauthCustomDomain } = useOAuthProxyDomain();
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.profile === "superadmin";
  const [apps, setApps] = useState<AppWooCommerce[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [whatsapps, setWhatsappsLocal] = useState<WhatsappOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<AppWooCommerce>>({});
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [registering, setRegistering] = useState(false);
  // Hijack takeover state — quando proxy retorna 409 (shop ja registrado em
  // outra instalacao), abrimos o mesmo dialog reusado pelos canais Meta.
  const [hijackDetails, setHijackDetails] = useState<HijackDetails | null>(null);
  const [hijackLoading, setHijackLoading] = useState(false);
  const [hijackPendingRetry, setHijackPendingRetry] = useState<(() => void) | null>(null);
  const [hijackContext, setHijackContext] = useState<{ identifier: string; callbackUrl: string } | null>(null);
  const [oauthCooldownUntil, setOauthCooldownUntil] = useState<number | null>(null);

  const set = (k: keyof AppWooCommerce, v: unknown) => setEditing((p) => ({ ...p, [k]: v }));

  async function load() {
    try {
      const { data } = await fetchAppWooCommerces();
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

  async function loadWhatsapps() {
    try {
      const { data } = await fetchWhatsapps();
      const list = (Array.isArray(data) ? data : []).filter(
        (w: any) => (w.type || "").toLowerCase() !== "woocommerce"
      );
      setWhatsappsLocal(list.map((w: any) => ({ id: w.id, name: w.name, type: w.type })));
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    load();
    loadWhatsapps();
    if (isSuperadmin) loadTenants();
  }, [isSuperadmin]);

  function openCreate() {
    setEditing({
      tenantId: null,
      storeUrl: "",
      consumerKey: "",
      consumerSecret: "",
      webhookSecret: "",
      syncProducts: false,
      autoCloseCompleted: false,
      description: "",
      whatsappId: null,
      isActive: true
    });
    setOpen(true);
  }

  function isReadOnlyForAdmin(a: AppWooCommerce | { tenantId?: number | null }): boolean {
    return !isSuperadmin && (a.tenantId === null || a.tenantId === undefined);
  }

  function openEdit(a: AppWooCommerce) {
    if (isReadOnlyForAdmin(a)) {
      toast.info(t("globalReadOnlyDesc"));
      return;
    }
    setEditing({ ...a });
    setOpen(true);
  }

  async function handleSave() {
    if (editing.id && isReadOnlyForAdmin(editing)) {
      toast.info(t("globalReadOnlyDesc"));
      return;
    }
    if (!editing.storeUrl || !editing.consumerKey || !editing.consumerSecret) {
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
            // admin: backend força o próprio tenant — não enviar tenantId/isGlobal
            const { tenantId: _tid, ...rest } = editing;
            void _tid;
            return rest as Record<string, unknown>;
          })();
      if (editing.id) {
        await updateAppWooCommerce(editing.id, payload);
        toast.success(t("appUpdated"));
      } else {
        await createAppWooCommerce(payload);
        toast.success(t("appCreated"));
      }
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorSave"));
    } finally { setSaving(false); }
  }

  async function handleDelete(a: AppWooCommerce) {
    if (isReadOnlyForAdmin(a)) {
      toast.info(t("globalReadOnlyDesc"));
      return;
    }
    if (!confirm(t("deleteConfirm", { storeUrl: a.storeUrl || "" }))) return;
    try { await deleteAppWooCommerce(a.id); toast.success(t("deleted")); load(); }
    catch { toast.error(t("errorDelete")); }
  }

  async function handleOauthConnect(a: AppWooCommerce) {
    if (!a.storeUrl) {
      toast.error(t("oauthMissingStoreUrl"));
      return;
    }
    if (oauthCooldownUntil && oauthCooldownUntil > Date.now()) {
      const remaining = Math.ceil((oauthCooldownUntil - Date.now()) / 1000);
      toast.error(tCommon("oauthCooldownRemaining", { seconds: remaining }));
      return;
    }
    try {
      const { data } = await api.get(`/wc-oauth/auth-url/${a.id}`);
      if (data?.authUrl) {
        window.open(data.authUrl, "woocommerce_oauth", "width=800,height=700");
        toast.success(t("oauthOpened"));
        // Pipeline automatico (registrar webhooks + criar canal) sera disparado
        // pelo listener de postMessage assim que o popup OAuth concluir.
      } else {
        toast.error(t("oauthError"));
      }
    } catch (error) {
      const info = parseOAuthLicenseError(error);
      if (info.kind === "banned") {
        toast.error(tCommon("oauthRateLimited"), { duration: 10000 });
        setOauthCooldownUntil(Date.now() + OAUTH_LICENSE_COOLDOWN_MS);
      } else if (info.kind === "license") {
        toast.error(tCommon("oauthLicenseInvalid"), { duration: 10000 });
        setOauthCooldownUntil(Date.now() + OAUTH_LICENSE_COOLDOWN_MS);
      } else {
        toast.error(t("oauthError"));
      }
    }
  }

  // Pipeline automatico pos-OAuth:
  //   1) registra webhooks (se 409 hijack -> abre dialog; retry continua aqui)
  //   2) cria canal Whatsapp type=woocommerce (skip se ja existe ou config global)
  // Na hijack: setHijackPendingRetry chama de novo runAutoPipeline(appId), entao
  // depois do takeover a pipeline retoma do passo 1 e continua ate o passo 2.
  async function createChannelStep(appId: number) {
    // Recarrega lista pra ter storeUrl/tenantId atualizados pos-OAuth
    const { data: appsData } = await fetchAppWooCommerces();
    const list = Array.isArray(appsData) ? appsData : [];
    const app = list.find((a: AppWooCommerce) => a.id === appId);
    if (!app?.storeUrl) {
      toast.warning(t("pipelineNoStoreUrl"));
      return;
    }
    // Config global (tenantId=null) nao gera canal — não há tenant alvo
    if (app.tenantId === null || app.tenantId === undefined) {
      toast.success(t("pipelineDoneSkipChannelGlobal"));
      return;
    }

    const normalized = String(app.storeUrl).replace(/\/$/, "").toLowerCase();
    const { data: whatsapps } = await fetchWhatsapps();
    const whatsappList = Array.isArray(whatsapps) ? whatsapps : [];
    const existing = whatsappList.find(
      (w) => String(w.wabaId || "").replace(/\/$/, "").toLowerCase() === normalized
    );
    if (existing) {
      toast.success(t("pipelineDoneChannelExists", { name: existing.name }));
      return;
    }

    let hostname = app.storeUrl;
    try { hostname = new URL(app.storeUrl).hostname; } catch { /* mantém storeUrl */ }
    const baseName = `WooCommerce – ${hostname}`;

    toast.info(t("pipelineCreatingChannel"));
    for (let attempt = 1; attempt <= 10; attempt++) {
      const candidateName = attempt === 1 ? baseName : `${baseName} (${attempt})`;
      try {
        await createWhatsapp({
          name: candidateName,
          type: "woocommerce",
          wabaId: app.storeUrl,
          isActive: true,
        });
        toast.success(t("pipelineDone", { name: candidateName }));
        return;
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status;
        const data   = err?.response?.data   ?? err?.data;
        const msg    = String(data?.error || data?.message || err?.message || "");
        // Sequelize unique violation -> tenta proximo nome
        if ((status === 400 || status === 409) && /exist|duplic|unique|já/i.test(msg)) continue;
        toast.error(t("pipelineErrorChannel", { error: msg || "" }));
        return;
      }
    }
    toast.error(t("pipelineErrorChannel", { error: "name conflicts" }));
  }

  async function runAutoPipeline(appId: number) {
    toast.info(t("pipelineRegistering"));
    try {
      const { data } = await registerWooCommerceWebhooks(appId);
      if (!data?.ok) {
        toast.error(t("webhooksError"));
        return;
      }
      if (data?.proxyRegistered === false) {
        toast.warning(t("webhooksProxyNotRegistered"), { duration: 12000 });
      }
      await createChannelStep(appId);
    } catch (err: any) {
      const status = err?.response?.status;
      const d = err?.response?.data;
      if (status === 409 && d?.hijack) {
        setHijackDetails({
          channel:      d.channel      || "woocommerce",
          errorCode:    d.errorCode    || "SHOP_ALREADY_REGISTERED",
          apiUrlMasked: d.existing?.apiUrlMasked || "***",
          registeredAt: d.existing?.registeredAt ?? null,
        });
        setHijackContext({
          identifier:  String(d.identifier || ""),
          callbackUrl: String(d.callbackUrl || ""),
        });
        // Retry continua a pipeline INTEIRA (webhooks + canal), nao so webhooks
        setHijackPendingRetry(() => () => runAutoPipeline(appId));
        return;
      }
      toast.error(t("pipelineUnknownError", { error: err?.response?.data?.message || err?.message || "" }));
    } finally {
      load();
    }
  }

  // Listener postMessage do popup OAuth — dispara o pipeline automatico
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev?.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "wc-oauth-success") {
        const state = String(data.state || "");
        const [appIdStr] = state.split("_");
        const appId = Number(appIdStr);
        if (appId && Number.isFinite(appId)) runAutoPipeline(appId);
      } else if (data.type === "wc-oauth-error") {
        toast.error(t("oauthError"));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleValidate() {
    if (!editing.id) return;
    setValidating(true);
    try {
      const { data } = await validateWooCommerceConnection(editing.id);
      if (data?.ok) {
        toast.success(t("validateSuccess"));
      } else {
        toast.error(t("validateError"));
      }
    } catch { toast.error(t("validateError")); }
    finally { setValidating(false); }
  }

  async function handleRegisterWebhooks() {
    if (!editing.id) return;
    setRegistering(true);
    try {
      const { data } = await registerWooCommerceWebhooks(editing.id);
      if (data?.ok) {
        toast.success(t("webhooksRegistered", { count: data.webhooks?.length || 0 }));
        if (data?.proxyRegistered === false) {
          toast.warning(t("webhooksProxyNotRegistered"), { duration: 12000 });
        }
      } else {
        toast.error(t("webhooksError"));
      }
    } catch (err: any) {
      // 409 HIJACK: shop ja esta registrado em outra instalacao. Abre dialog
      // (mesmo HijackTakeoverDialog reusado dos canais Meta). Apos confirmar,
      // o retry dispara novo handleRegisterWebhooks e o registro completa.
      const status = err?.response?.status;
      const d = err?.response?.data;
      if (status === 409 && d?.hijack) {
        setHijackDetails({
          channel:      d.channel      || "woocommerce",
          errorCode:    d.errorCode    || "SHOP_ALREADY_REGISTERED",
          apiUrlMasked: d.existing?.apiUrlMasked || "***",
          registeredAt: d.existing?.registeredAt ?? null,
        });
        setHijackContext({
          identifier:  String(d.identifier || ""),
          callbackUrl: String(d.callbackUrl || ""),
        });
        setHijackPendingRetry(() => () => handleRegisterWebhooks());
        return;
      }
      toast.error(err?.response?.data?.message || t("webhooksError"));
    } finally { setRegistering(false); }
  }

  async function handleHijackConfirm() {
    if (!hijackContext) return;
    setHijackLoading(true);
    try {
      await takeoverRegistry({
        channel:     "woocommerce",
        identifier:  hijackContext.identifier,
        callbackUrl: hijackContext.callbackUrl,
      });
      // Limpa estado e dispara retry do registro original
      const retry = hijackPendingRetry;
      setHijackDetails(null);
      setHijackContext(null);
      setHijackPendingRetry(null);
      if (retry) retry();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("webhooksError"));
    } finally {
      setHijackLoading(false);
    }
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
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] }
            ]
          }}
        >
          <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("newApp")}</Button>
        </PageHeader>

        {loading ? <Skeleton className="h-64 w-full" /> : apps.length === 0 ? (
          <EmptyState icon={ShoppingBag} title={t("emptyTitle")} description={t("emptyDescription")}>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("newApp")}</Button>
          </EmptyState>
        ) : (
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t("storeUrlLabel")}</TableHead>
                <TableHead>{t("descriptionCol")}</TableHead>
                <TableHead>{t("linkedChannelCol")}</TableHead>
                {isSuperadmin && <TableHead>Tenant</TableHead>}
                <TableHead>{t("autoCloseLabel")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {apps.map((a) => {
                  const readOnly = isReadOnlyForAdmin(a);
                  return (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{a.id}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{a.storeUrl || "---"}</span>
                        {!isSuperadmin && a.tenantId == null && (
                          <Badge variant="outline" className="shrink-0" title={t("globalReadOnlyDesc")}>
                            {t("global")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{a.description || "---"}</TableCell>
                    <TableCell>
                      {a.whatsappId
                        ? (whatsapps.find((w) => w.id === a.whatsappId)?.name || `#${a.whatsappId}`)
                        : <span className="text-muted-foreground">---</span>
                      }
                    </TableCell>
                    {isSuperadmin && (
                      <TableCell>
                        {a.tenantId === null
                          ? <Badge variant="outline">{t("global")}</Badge>
                          : tenantName(a.tenantId)
                        }
                      </TableCell>
                    )}
                    <TableCell>
                      {a.autoCloseCompleted
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
                          <DropdownMenuItem onClick={() => handleOauthConnect(a)} disabled={readOnly}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />{t("oauthConnect")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(a)} disabled={readOnly}>
                            <Pencil className="mr-2 h-4 w-4" />{t("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(a)} disabled={readOnly}>
                            <Trash2 className="mr-2 h-4 w-4" />{t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
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
                <Label>{t("storeUrlLabel")} *</Label>
                <Input
                  value={editing.storeUrl || ""}
                  onChange={(e) => set("storeUrl", e.target.value)}
                  placeholder="https://minha-loja.com"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">{t("storeUrlHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  {t("proxyCallbackLabel")}
                  <Badge variant="outline" className="text-[10px] font-normal">{t("redirectUriFixed")}</Badge>
                </Label>
                <Input
                  value={getWooCommerceProxyCallbackUrl(oauthCustomDomain)}
                  readOnly
                  className="font-mono text-xs bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">{t("proxyCallbackHint")}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {t("customDomainNotice")}{" "}
                  <a href="/oauth-dominio" className="underline font-medium">
                    {t("customDomainNoticeLink")}
                  </a>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("consumerKeyLabel")} *</Label>
                <PasswordInput
                  value={editing.consumerKey || ""}
                  onChange={(v) => set("consumerKey", v)}
                  placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-muted-foreground">{t("consumerKeyHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("consumerSecretLabel")} *</Label>
                <PasswordInput
                  value={editing.consumerSecret || ""}
                  onChange={(v) => set("consumerSecret", v)}
                  placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("webhookUrlLabel")}</Label>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                  <span className="flex-1 text-sm font-mono text-foreground select-all">
                    https://oauth.techprovider.com.br/woocommerce-webhook
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText("https://oauth.techprovider.com.br/woocommerce-webhook");
                      toast.success(t("copied"));
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    title={t("copy")}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{t("webhookUrlHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("webhookSecretLabel")}</Label>
                <PasswordInput
                  value={editing.webhookSecret || ""}
                  onChange={(v) => set("webhookSecret", v)}
                  placeholder={t("webhookSecretPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("webhookSecretHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("linkedChannelLabel")} ({t("optional")})</Label>
                <Select
                  value={editing.whatsappId == null ? "__none__" : String(editing.whatsappId)}
                  onValueChange={(v) => set("whatsappId", v === "__none__" ? null : Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("linkedChannelPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("linkedChannelNone")}</SelectItem>
                    {whatsapps.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}{w.type ? ` (${w.type})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("linkedChannelHint")}</p>
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
                  checked={editing.autoCloseCompleted ?? false}
                  onCheckedChange={(v) => set("autoCloseCompleted", v)}
                />
                <div>
                  <Label>{t("autoCloseLabel")}</Label>
                  <p className="text-xs text-muted-foreground">{t("autoCloseHint")}</p>
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

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2 flex-wrap">
              {editing.id && (
                <>
                  <Button variant="outline" onClick={handleValidate} disabled={validating} className="w-full sm:w-auto sm:mr-auto">
                    {validating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("validating")}</> : t("validateBtn")}
                  </Button>
                  <Button variant="outline" className="w-full sm:w-auto" onClick={handleRegisterWebhooks} disabled={registering}>
                    {registering ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("registering")}</> : t("registerWebhooksBtn")}
                  </Button>
                </>
              )}
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)} disabled={saving}>{t("cancel")}</Button>
              <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
                {saving ? t("saving") : editing.id ? t("save") : t("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <HijackTakeoverDialog
          open={!!hijackDetails}
          details={hijackDetails}
          loading={hijackLoading}
          onCancel={() => {
            if (hijackLoading) return;
            setHijackDetails(null);
            setHijackContext(null);
            setHijackPendingRetry(null);
          }}
          onConfirm={handleHijackConfirm}
        />
      </div>
    </TooltipProvider>
  );
}
