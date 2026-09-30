"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortable } from "@/hooks/use-sortable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Plus, MoreVertical, Trash2, Key, RefreshCw, Copy, Check, BookOpen, ChevronDown, ChevronRight, FlaskConical, Play, Send, Clock } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { fetchTenantApis, createTenantApi, renewTenantApiToken, deleteTenantApi } from "@/services/superadmin";

const apiBaseUrl =
  (typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : "") ||
  "http://localhost:3101";

interface TenantApi {
  id: number;
  apiTokenPrefix?: string;
  tenantId?: number;
  isActive?: boolean;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("tenantApiPage");
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md break-all font-mono select-all">{value}</code>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("copy")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ── Route docs ────────────────────────────────────────────

interface TenantRouteParam {
  key: string;
  desc: string;
  defaultValue?: string;
  required?: boolean;
}

interface TenantRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  name: string;
  description: string;
  bodyType?: "json" | "formdata";
  params?: TenantRouteParam[];
  bodyExample?: string;
}

interface SandboxResponse {
  status: number;
  body: string;
  ok: boolean;
  durationMs: number;
}

const TENANT_API_ROUTE_BODIES: Record<string, string | undefined> = {
  StoreTenant: `{
  "status": "active",
  "name": "Empresa Exemplo",
  "maxUsers": 3,
  "maxConnections": 3,
  "acceptTerms": true,
  "email": "user@example.com",
  "password": "securePassword123!",
  "userName": "Pedro Bastos",
  "identity": "07122255533",
  "profile": "admin",
  "planId": 1,
  "trial": "enabled",
  "trialPeriod": 3,
  "paymentGateway": "stripe",
  "stripeCustomerId": "cus_XXXXXXXXXXXXXX",
  "stripeToken": "sk_live_XXXXXXXXXXXXXXXX"
}`,
  UpdateTenant: `{
  "status": "active",
  "identity": "07122989674",
  "maxUsers": 100,
  "maxConnections": 10,
  "paymentGateway": "stripe",
  "stripeCustomerId": "cus_XXXXXXXXXXXXXX",
  "stripeToken": "sk_live_XXXXXXXXXXXXXXXX"
}`,
  ShowTenant: `{
  "id": 1
}`,
  CreateSessionTenant: `{
  "tenant": 1,
  "name": "My WhatsApp Instance",
  "status": "DISCONNECTED",
  "type": "baileys"
}`,
  CreateApi: `{
  "name": "API 1",
  "sessionId": 1,
  "urlServiceStatus": null,
  "urlMessageStatus": null,
  "userId": 1,
  "authToken": "123456",
  "tenant": 1
}`,
  DeleteApi: `{
  "sessionId": 43,
  "userId": 1,
  "tenant": 1,
  "apiId": "5ec32c80-4549-4256-8ed1-ed57b86396c3"
}`,
};

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  POST: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

// ── Sandbox Modal ─────────────────────────────────────────

function SandboxModal({ route, apiToken, onClose }: { route: TenantRoute; apiToken: string; onClose: () => void }) {
  const t = useTranslations("tenantApiPage");
  const { resolvedTheme } = useTheme();
  const fullUrl = `${apiBaseUrl}${route.path}`;

  const defaultParams = (route.params || []).map((p) => ({
    key: p.key,
    value: p.defaultValue || "",
    enabled: true,
  }));

  const [bodyText, setBodyText] = useState(route.bodyExample || "");
  const [queryParams, setQueryParams] = useState(defaultParams);
  const [response, setResponse] = useState<SandboxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (str: string) => {
    const bytes = new Blob([str]).size;
    return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  };

  const durationClass = (ms: number) =>
    ms < 200
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
      : ms < 1000
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";

  const buildUrl = () => {
    if (route.method === "GET" && queryParams.length > 0) {
      const qs = queryParams
        .filter((p) => p.enabled && p.key && p.value)
        .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join("&");
      return qs ? `${fullUrl}?${qs}` : fullUrl;
    }
    return fullUrl;
  };

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    const start = Date.now();
    try {
      const url = buildUrl();
      const headers: Record<string, string> = { Authorization: `Bearer ${apiToken}` };
      let body: BodyInit | undefined;
      if (route.method !== "GET" && route.bodyType === "json" && bodyText.trim()) {
        headers["Content-Type"] = "application/json";
        body = bodyText;
      }
      const res = await fetch(url, { method: route.method, headers, body });
      const durationMs = Date.now() - start;
      let responseText = "";
      try {
        const json = await res.json();
        responseText = JSON.stringify(json, null, 2);
      } catch {
        responseText = await res.text();
      }
      setResponse({ status: res.status, body: responseText, ok: res.ok, durationMs });
    } catch (err) {
      const durationMs = Date.now() - start;
      setResponse({ status: 0, body: err instanceof Error ? err.message : t("sandboxUnknownError"), ok: false, durationMs });
    } finally {
      setLoading(false);
    }
  };

  const isFormdata = route.bodyType === "formdata";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            {t("sandboxTitle")} — {route.name}
          </DialogTitle>
          <DialogDescription>
            {t("sandboxTokenLabel")}: <code className="text-xs bg-muted px-1 rounded">{apiToken.slice(0, 20)}…</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">{t("sandboxUrl")}</Label>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-[11px] font-bold shrink-0 ${METHOD_COLORS[route.method] || ""}`}>
                {route.method}
              </span>
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono break-all">{buildUrl()}</code>
            </div>
          </div>

          {queryParams.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">{t("sandboxQueryParams")}</Label>
              <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                {queryParams.map((param, idx) => (
                  <div key={param.key} className="flex items-center gap-2">
                    <Switch
                      checked={param.enabled}
                      onCheckedChange={(v) => setQueryParams((prev) => prev.map((p, i) => i === idx ? { ...p, enabled: v } : p))}
                      className="h-4 w-7"
                    />
                    <code className="text-[11px] font-mono bg-muted px-2 py-1 rounded w-36 shrink-0">{param.key}</code>
                    <Input
                      value={param.value}
                      onChange={(e) => setQueryParams((prev) => prev.map((p, i) => i === idx ? { ...p, value: e.target.value } : p))}
                      className="h-8 text-xs font-mono"
                      placeholder={param.key}
                      disabled={!param.enabled}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {route.method !== "GET" && (
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">
                {isFormdata ? t("sandboxBodyFormdata") : t("sandboxBodyJson")}
              </Label>
              {isFormdata ? (
                <div className="border rounded-lg p-3 bg-muted/20 text-xs text-muted-foreground font-mono whitespace-pre">
                  {route.bodyExample}
                </div>
              ) : (
                <Textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="font-mono text-xs min-h-[160px] resize-y"
                  placeholder='{ "key": "value" }'
                  spellCheck={false}
                />
              )}
            </div>
          )}

          <Button onClick={handleSend} disabled={loading || isFormdata} className="w-full">
            {loading
              ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{t("sandboxSending")}</>
              : <><Send className="mr-2 h-4 w-4" />{t("sandboxSend")}</>}
          </Button>

          {isFormdata && (
            <p className="text-xs text-muted-foreground text-center">{t("sandboxFormdataNote")}</p>
          )}

          {response && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs uppercase text-muted-foreground">{t("sandboxResponse")}</Label>
                <Badge variant={response.ok ? "success" : "destructive"} className="text-[10px]">
                  {response.status || t("sandboxNetworkError")}
                </Badge>
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1", durationClass(response.durationMs))}>
                  <Clock className="h-2.5 w-2.5" />{response.durationMs}ms
                </span>
                {response.body && (
                  <span className="text-[11px] text-muted-foreground">{formatSize(response.body)}</span>
                )}
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[11px]" onClick={copyResponse}>
                  {copied
                    ? <><Check className="h-3 w-3 mr-1" />{t("sandboxCopied")}</>
                    : <><Copy className="h-3 w-3 mr-1" />{t("sandboxCopyResponse")}</>}
                </Button>
              </div>
              {response.body ? (
                <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto text-[11px]">
                  <SyntaxHighlighter
                    language="json"
                    style={resolvedTheme === "dark" ? oneDark : oneLight}
                    customStyle={{ margin: 0, fontSize: "11px", borderRadius: 0, padding: "12px" }}
                    wrapLongLines
                  >
                    {response.body}
                  </SyntaxHighlighter>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">{t("sandboxNoBody")}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("sandboxClose")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Route Item ─────────────────────────────────────────────

function RouteItem({ route, sandboxToken, onTest }: { route: TenantRoute; sandboxToken: string | null; onTest: (route: TenantRoute) => void }) {
  const t = useTranslations("tenantApiPage");
  const [expanded, setExpanded] = useState(false);
  const fullPath = `${apiBaseUrl}${route.path}`;
  const hasDetails = !!route.bodyExample;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors">
        <button
          className="flex items-center gap-3 flex-1 text-left min-w-0"
          onClick={() => hasDetails && setExpanded(!expanded)}
        >
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${METHOD_COLORS[route.method]}`}>
            {route.method}
          </span>
          <code className="text-xs font-mono flex-1 truncate">{route.path}</code>
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{route.name}</span>
          {hasDetails && (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </button>
        {sandboxToken && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 shrink-0 text-primary hover:text-primary"
                onClick={() => onTest(route)}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("sandboxTestWith", { id: "" })}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {expanded && (
        <div className="border-t bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{route.description}</p>
          <CopyField label="URL" value={fullPath} />
          {route.bodyExample && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Body (JSON)</span>
              <pre className="text-[11px] font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre">{route.bodyExample}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TenantApiDocsSection({ apis }: { apis: TenantApi[] }) {
  const t = useTranslations("tenantApiPage");
  const [sandboxToken, setSandboxToken] = useState<string>("");
  const [sandboxRoute, setSandboxRoute] = useState<TenantRoute | null>(null);

  const TENANT_API_ROUTES: TenantRoute[] = [
    { method: "POST", path: "/tenantCreateApi", name: "CreateApi", description: t("routeCreateApi"), bodyType: "json", bodyExample: TENANT_API_ROUTE_BODIES.CreateApi },
    { method: "POST", path: "/tenantDeleteApi", name: "DeleteApi", description: t("routeDeleteApi"), bodyType: "json", bodyExample: TENANT_API_ROUTE_BODIES.DeleteApi },
    { method: "POST", path: "/tenantApiStoreTenant", name: "StoreTenant", description: t("routeStoreTenant"), bodyType: "json", bodyExample: TENANT_API_ROUTE_BODIES.StoreTenant },
    { method: "POST", path: "/tenantApiUpdateTenant", name: "UpdateTenant", description: t("routeUpdateTenant"), bodyType: "json", bodyExample: TENANT_API_ROUTE_BODIES.UpdateTenant },
    { method: "POST", path: "/tenantApiShowTenant", name: "ShowTenant", description: t("routeShowTenant"), bodyType: "json", bodyExample: TENANT_API_ROUTE_BODIES.ShowTenant },
    { method: "POST", path: "/tenantApiCreateSession", name: "CreateSessionTenant", description: t("routeCreateSession"), bodyType: "json", bodyExample: TENANT_API_ROUTE_BODIES.CreateSessionTenant },
    { method: "GET", path: "/tenantApiListTenants", name: "ListTenants", description: t("routeListTenants") },
  ];

  return (
    <>
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-base">{t("apiRoutesTitle")}</h3>
            <Badge variant="secondary" className="text-[10px]">{TENANT_API_ROUTES.length} endpoints</Badge>
          </div>

          {/* Sandbox Token Input */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t("sandboxTitle")}</span>
              {sandboxToken && (
                <Badge variant="outline" className="text-[10px] text-primary border-primary">
                  {t("sandboxActive", { name: sandboxToken.slice(0, 8) + "…" })}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("sandboxPasteDesc")}</p>
            <div className="flex items-center gap-2">
              <Input
                value={sandboxToken}
                onChange={(e) => setSandboxToken(e.target.value)}
                placeholder={t("sandboxPastePlaceholder")}
                className="h-8 text-xs font-mono max-w-xs"
              />
              {sandboxToken && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSandboxToken("")}>
                  {t("sandboxClear")}
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Base URL: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{apiBaseUrl}</code>
            <br />
            {t("authenticationVia")} <code className="bg-muted px-1.5 py-0.5 rounded font-mono">Authorization: Bearer {"{apiToken}"}</code>
          </p>
          <div className="space-y-1.5">
            {TENANT_API_ROUTES.map((route) => (
              <RouteItem
                key={route.name}
                route={route}
                sandboxToken={sandboxToken || null}
                onTest={(r) => setSandboxRoute(r)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {sandboxRoute && sandboxToken && (
        <SandboxModal route={sandboxRoute} apiToken={sandboxToken} onClose={() => setSandboxRoute(null)} />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────

export default function TenantApiPage() {
  const t = useTranslations("tenantApiPage");
  const [apis, setApis] = useState<TenantApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  async function load() {
    try {
      const { data } = await fetchTenantApis();
      setApis(Array.isArray(data) ? data : (data as { tenantApi?: TenantApi[] })?.tenantApi || []);
    } catch { toast.error(t("loadError")); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  const { sortKey, sortDir, handleSort, sortedData: sortedApis } = useSortable(apis, "id");

  async function handleCreate() {
    setCreating(true);
    try {
      const { data } = await createTenantApi();
      setPlainToken((data as { plainToken?: string }).plainToken || null);
      load();
    } catch { toast.error(t("saveError")); }
    finally { setCreating(false); }
  }

  async function handleRenew(a: TenantApi) {
    if (!confirm(t("renewConfirm"))) return;
    try {
      const { data } = await renewTenantApiToken(a.id);
      setPlainToken((data as { plainToken?: string }).plainToken || null);
      load();
    } catch { toast.error(t("saveError")); }
  }

  async function handleDelete(a: TenantApi) {
    if (!confirm(`${t("deleteSuccess")} #${a.id}?`)) return;
    try { await deleteTenantApi(a.id); toast.success(t("deleteSuccess")); load(); }
    catch { toast.error(t("deleteError")); }
  }

  async function copyPlainToken() {
    if (!plainToken) return;
    await navigator.clipboard.writeText(plainToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 3000);
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}>
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t("newApi")}
          </Button>
        </PageHeader>

        {/* Security notice */}
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-start gap-3">
            <Key className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">{t("securityNotice")}</p>
          </CardContent>
        </Card>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : apis.length === 0 ? (
          <EmptyState icon={Key} title={t("noApi")} description={t("noApiDesc")}>
            <Button onClick={handleCreate} disabled={creating}><Plus className="mr-2 h-4 w-4" /> {t("newApi")}</Button>
          </EmptyState>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colId")}</SortableTableHead>
                    <SortableTableHead sortKey="apiTokenPrefix" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colToken")}</SortableTableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedApis.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-muted-foreground">{a.id}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {a.apiTokenPrefix ? `${a.apiTokenPrefix}...` : "—"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleRenew(a)}>
                              <RefreshCw className="mr-2 h-4 w-4" /> {t("renewToken")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(a)}>
                              <Trash2 className="mr-2 h-4 w-4" /> {t("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <TenantApiDocsSection apis={apis} />

        {/* One-time token reveal modal */}
        <Dialog open={!!plainToken} onOpenChange={() => setPlainToken(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-500" />
                {t("tokenRevealTitle")}
              </DialogTitle>
              <DialogDescription>{t("tokenRevealDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mb-2">{t("tokenRevealWarning")}</p>
                <code className="block text-xs font-mono bg-white dark:bg-black/40 px-3 py-2 rounded border break-all select-all">
                  {plainToken}
                </code>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={copyPlainToken}>
                {tokenCopied ? <><Check className="mr-2 h-4 w-4" />{t("copied")}</> : <><Copy className="mr-2 h-4 w-4" />{t("copy")}</>}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setPlainToken(null)}>{t("tokenRevealClose")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
