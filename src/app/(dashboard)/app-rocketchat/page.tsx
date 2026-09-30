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
import { Plus, MoreVertical, Pencil, Trash2, Eye, EyeOff, CheckCircle2, XCircle, MinusCircle, Loader2, MessageSquare, HelpCircle, Info } from "lucide-react";
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
import { isRocketChatErrorCode } from "@/lib/rocketchat-errors";

// Token e segredo só voltam do backend para o superadmin; os demais recebem
// apenas os `has*` e deixam o campo vazio para manter o valor salvo.
interface AppRocketChat {
  id: number;
  serverUrl?: string;
  adminUserId?: string;
  adminAuthToken?: string;
  createTokensSecret?: string;
  hasAdminUserId?: boolean;
  hasAdminAuthToken?: boolean;
  hasCreateTokensSecret?: boolean;
  autoCreateUsers?: boolean;
  description?: string;
  tenantId?: number | null;
  isActive?: boolean;
}

type CheckKey = "server" | "adminAuth" | "adminPermissions" | "loginToken" | "iframeEmbed" | "iframeLogin" | "iframeEvents";

interface TestCheck {
  key: CheckKey;
  ok: boolean;
  skipped?: boolean;
  code?: string;
  detail?: string;
}

interface TestReport {
  ok: boolean;
  version?: string;
  username?: string;
  code?: string;
  checks?: TestCheck[];
}

// Mesma identidade de servidor do backend (rocketChatServerKey): origem + caminho.
function serverKey(url?: string): string | null {
  try {
    const parsed = new URL(String(url || "").trim().replace(/\/+$/, ""));
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

const CHECK_LABEL_KEYS: Record<CheckKey, string> = {
  server: "checkServer",
  adminAuth: "checkAdminAuth",
  adminPermissions: "checkAdminPermissions",
  loginToken: "checkLoginToken",
  iframeEmbed: "checkIframeEmbed",
  iframeLogin: "checkIframeLogin",
  iframeEvents: "checkIframeEvents"
};

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

// tabIndex -1: o foco automático do modal não pode abrir o tooltip sozinho.
function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" tabIndex={-1} aria-label="?" className="inline-flex align-middle text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-snug">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function AppRocketChatPage() {
  const t = useTranslations("appRocketChatPage");
  const tErr = useTranslations("rocketChatErrors");
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.profile === "superadmin";
  const [apps, setApps] = useState<AppRocketChat[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<AppRocketChat>>({});
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [testReport, setTestReport] = useState<TestReport | null>(null);
  // Config como veio do backend: decide o que foi editado e se o servidor mudou.
  const [original, setOriginal] = useState<AppRocketChat | null>(null);

  const set = (k: keyof AppRocketChat, v: unknown) => setEditing((p) => ({ ...p, [k]: v }));

  const serverChanged = !!original && serverKey(editing.serverUrl) !== serverKey(original.serverUrl);
  // Token e segredo salvos só voltam ao superadmin: para os demais o campo vem vazio.
  const credentialsHidden =
    !!original &&
    ((!!original.hasAdminAuthToken && !original.adminAuthToken) ||
      (!!original.hasCreateTokensSecret && !original.createTokensSecret));

  // Trocar de servidor limpa as credenciais que vieram preenchidas (superadmin):
  // o backend não reaproveita credencial salva em outro servidor.
  function setServerUrl(value: string) {
    setEditing((p) => {
      const next = { ...p, serverUrl: value };
      if (original && serverKey(value) !== serverKey(original.serverUrl)) {
        if (next.adminAuthToken && next.adminAuthToken === original.adminAuthToken) next.adminAuthToken = "";
        if (next.createTokensSecret && next.createTokensSecret === original.createTokensSecret) next.createTokensSecret = "";
      }
      return next;
    });
  }

  // Token e segredo só viajam quando foram digitados — os salvos ficam no backend.
  function withoutUntouchedCredentials(payload: Record<string, unknown>): Record<string, unknown> {
    const next = { ...payload };
    delete next.hasAdminUserId;
    delete next.hasAdminAuthToken;
    delete next.hasCreateTokensSecret;
    if (original && next.adminAuthToken === original.adminAuthToken) delete next.adminAuthToken;
    if (original && next.createTokensSecret === original.createTokensSecret) delete next.createTokensSecret;
    return next;
  }

  const errorText = (code?: string, fallback?: string) =>
    isRocketChatErrorCode(code) ? tErr(code) : fallback || code || "";

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
      createTokensSecret: "",
      autoCreateUsers: false,
      description: "",
      isActive: true
    });
    setOriginal(null);
    setTestReport(null);
    setOpen(true);
  }

  function openEdit(a: AppRocketChat) {
    setEditing({ ...a });
    setOriginal({ ...a });
    setTestReport(null);
    setOpen(true);
  }

  // Na edição, campo vazio com valor já salvo = manter o salvo.
  const keepsSaved = (flag?: boolean) => !!editing.id && !!flag;

  async function handleSave() {
    if (
      !editing.serverUrl ||
      (!editing.adminUserId && !keepsSaved(editing.hasAdminUserId)) ||
      (!editing.adminAuthToken && !keepsSaved(editing.hasAdminAuthToken))
    ) {
      toast.error(t("requiredFields"));
      return;
    }
    if (serverChanged && (!editing.adminAuthToken || (editing.hasCreateTokensSecret && !editing.createTokensSecret))) {
      toast.error(tErr("ERR_RC_CREDENTIALS_REQUIRED"));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = withoutUntouchedCredentials(
        isSuperadmin
          ? {
              ...editing,
              isGlobal: editing.tenantId === null || editing.tenantId === undefined
            }
          : (() => {
              const { tenantId: _tid, ...rest } = editing;
              void _tid;
              return rest as Record<string, unknown>;
            })()
      );
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
      // lib/api rejeita com o response: o corpo vem em `data`.
      const body = err?.data ?? err?.response?.data;
      toast.error(errorText(body?.code, body?.message || t("errorSave")));
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
    setTestReport(null);
    try {
      // Testa o que está no formulário, mesmo antes de salvar.
      const { data } = await validateAppRocketChat(
        editing.id,
        withoutUntouchedCredentials({
          serverUrl: editing.serverUrl,
          adminUserId: editing.adminUserId,
          adminAuthToken: editing.adminAuthToken,
          createTokensSecret: editing.createTokensSecret,
          autoCreateUsers: editing.autoCreateUsers
        })
      );
      const report = data as TestReport;
      setTestReport(report);
      // Servidor ou conta da integração falhando: o aviso diz o porquê, nunca "conectado".
      const blocking = report?.checks?.find(
        (check) => !check.ok && !check.skipped && (check.key === "server" || check.key === "adminAuth")
      );
      if (report?.ok) {
        toast.success(t("validateSuccess", { username: report.username || "" }));
      } else if (blocking) {
        toast.error(errorText(blocking.code, t("validateError")));
      } else if (report?.checks?.length) {
        toast.error(t("validatePartial"));
      } else {
        toast.error(errorText(report?.code, t("validateError")));
      }
    } catch (err: any) {
      const body = err?.data ?? err?.response?.data;
      toast.error(errorText(body?.code, t("validateError")));
    } finally { setValidating(false); }
  }

  function checkSummary(check: TestCheck): string | null {
    if (!check.ok) return null;
    if (check.key === "server" && check.detail) return t("checkVersion", { version: check.detail });
    if (check.key === "adminAuth" && check.detail) return t("checkConnectedAs", { username: check.detail });
    return null;
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
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2"), t("helpS0I3"), t("helpS0I4")] },
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
                      {/* Config global é do superadmin: para os demais o backend responde 404 em editar/testar. */}
                      {isSuperadmin || (a.tenantId !== null && a.tenantId !== undefined) ? (
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
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="outline">{t("global")}</Badge>
                          <InfoTip text={t("globalRowTooltip")} />
                        </span>
                      )}
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
                  {(editing.tenantId === null || editing.tenantId === undefined) && (
                    <p className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
                      {t("globalAccountsNote")}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="inline-flex items-center gap-1.5">
                  {t("serverUrlLabel")} *
                  <InfoTip text={t("serverUrlTooltip")} />
                </Label>
                <Input
                  value={editing.serverUrl || ""}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://chat.suaempresa.com"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">{t("serverUrlHint")}</p>
                {serverChanged && (
                  <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>{t("serverChangedNote")}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>{t("adminUserIdLabel")} (X-User-Id) *</Label>
                <Input
                  value={editing.adminUserId || ""}
                  onChange={(e) => set("adminUserId", e.target.value)}
                  placeholder={keepsSaved(editing.hasAdminUserId) ? t("keepCurrentPlaceholder") : "abc123def456"}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("adminAuthTokenLabel")} (X-Auth-Token) *</Label>
                <PasswordInput
                  value={editing.adminAuthToken || ""}
                  onChange={(v) => set("adminAuthToken", v)}
                  placeholder={
                    serverChanged
                      ? t("reenterForNewServer")
                      : keepsSaved(editing.hasAdminAuthToken)
                        ? t("keepCurrentPlaceholder")
                        : "Personal Access Token do admin RC"
                  }
                />
                <p className="text-xs text-muted-foreground">{t("authTokenHint")}</p>
                {credentialsHidden && !serverChanged && (
                  <p className="text-xs text-muted-foreground">{t("savedCredentialsNote")}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="inline-flex items-center gap-1.5">
                  {t("createTokensSecretLabel")}
                  <InfoTip text={t("createTokensSecretTooltip")} />
                </Label>
                <PasswordInput
                  value={editing.createTokensSecret || ""}
                  onChange={(v) => set("createTokensSecret", v)}
                  placeholder={
                    serverChanged && editing.hasCreateTokensSecret
                      ? t("reenterForNewServer")
                      : keepsSaved(editing.hasCreateTokensSecret)
                        ? t("keepCurrentPlaceholder")
                        : "CREATE_TOKENS_FOR_USERS_SECRET"
                  }
                />
                <p className="text-xs text-muted-foreground">{t("createTokensSecretHint")}</p>
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
              <p className="text-xs text-muted-foreground -mt-2 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
                {t("autoCreateUsersNote")}
              </p>

              <div className="flex items-center gap-3 pb-2 border-b">
                <Switch
                  checked={editing.isActive !== false}
                  onCheckedChange={(v) => set("isActive", v)}
                />
                <Label>{t("active")}</Label>
              </div>

              {testReport?.checks && testReport.checks.length > 0 && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{t("testResultTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("testResultNote")}</p>
                  <ul className="space-y-2">
                    {testReport.checks.map((check) => {
                      const summary = checkSummary(check);
                      return (
                        <li key={check.key} className="flex items-start gap-2 text-sm">
                          {check.ok ? (
                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                          ) : check.skipped ? (
                            <MinusCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                          )}
                          <div className="min-w-0 space-y-0.5">
                            <p className="break-words">
                              {t(CHECK_LABEL_KEYS[check.key])}
                              {summary && <span className="text-muted-foreground"> · {summary}</span>}
                            </p>
                            {check.skipped && <p className="text-xs text-muted-foreground">{t("checkSkipped")}</p>}
                            {!check.ok && !check.skipped && (
                              <p className="text-xs text-muted-foreground break-words">{errorText(check.code)}</p>
                            )}
                            {!check.ok && !check.skipped && check.detail && (
                              <p className="text-xs text-muted-foreground font-mono break-all">
                                {check.key === "adminPermissions" ? t("missingPermissions", { list: check.detail }) : check.detail}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              {editing.id && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={handleValidate} disabled={validating} className="w-full sm:w-auto sm:mr-auto">
                      {validating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("validating")}</> : t("validateBtn")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-snug">{t("validateBtnTooltip")}</TooltipContent>
                </Tooltip>
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
