"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Phone, PhoneCall, RotateCcw, ExternalLink, Settings2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  fetchCalls, fetchDevices, loginAndFetchCalls, resetWavoip, fetchCallsByToken,
  type WaVoipCall, type WaVoipDevice,
} from "@/services/wavoip";
import { fetchTenantById } from "@/services/tenants";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { WavoipMetrics } from "@/components/wavoip/wavoip-metrics";
import { useAuthStore } from "@/stores/auth-store";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

function dedup(calls: WaVoipCall[]): WaVoipCall[] {
  const seen = new Set<string | number>();
  return calls.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

function callDate(c: WaVoipCall) {
  return c.created_date || c.createdAt || "";
}
function callFrom(c: WaVoipCall) {
  return c.caller || c.from || "";
}
function callTo(c: WaVoipCall) {
  return c.receiver || c.to || "";
}
function formatDuration(s?: number) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, "0")}s`;
}
function formatDate(d: string) {
  if (!d) return "—";
  try { return formatDateTime(new Date(d)); } catch { return d; }
}

type ColumnKey = "id" | "caller" | "receiver" | "direction" | "duration" | "date" | "status" | "link";

const COLUMN_KEYS: ColumnKey[] = ["id", "caller", "receiver", "direction", "duration", "date", "status", "link"];

const DEFAULT_COLUMNS: ColumnKey[] = ["id", "caller", "receiver", "status", "link"];

function CallsTable({ calls }: { calls: WaVoipCall[] }) {
  const t = useTranslations("wavoipPage");
  const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
    { key: "id", label: "ID" },
    { key: "caller", label: t("colFrom") },
    { key: "receiver", label: t("colTo") },
    { key: "direction", label: t("colDirection") },
    { key: "duration", label: t("colDuration") },
    { key: "date", label: t("colDate") },
    { key: "status", label: t("colStatus") },
    { key: "link", label: t("colRecording") },
  ];
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(DEFAULT_COLUMNS));

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [calls]);
  const totalPages = Math.max(1, Math.ceil(calls.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageCalls = calls.slice(start, start + PAGE_SIZE);

  function toggleCol(key: ColumnKey) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (calls.length === 0) {
    return (
      <EmptyState icon={PhoneCall} title={t("noCallsFound")} description={t("noCallsFound")} />
    );
  }

  return (
    <div>
      <div className="flex justify-end px-4 pt-3 pb-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="h-4 w-4" /> {t("columns")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ALL_COLUMNS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={visibleCols.has(col.key)}
                onCheckedChange={() => toggleCol(col.key)}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {visibleCols.has("id") && <TableHead>ID</TableHead>}
            {visibleCols.has("caller") && <TableHead>{t("colFrom")}</TableHead>}
            {visibleCols.has("receiver") && <TableHead>{t("colTo")}</TableHead>}
            {visibleCols.has("direction") && <TableHead>{t("colDirection")}</TableHead>}
            {visibleCols.has("duration") && <TableHead>{t("colDuration")}</TableHead>}
            {visibleCols.has("date") && <TableHead>{t("colDate")}</TableHead>}
            {visibleCols.has("status") && <TableHead>{t("colStatus")}</TableHead>}
            {visibleCols.has("link") && <TableHead>{t("colRecording")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageCalls.map((c) => (
            <TableRow key={c.id}>
              {visibleCols.has("id") && <TableCell className="font-mono text-xs">{c.id}</TableCell>}
              {visibleCols.has("caller") && <TableCell>{callFrom(c)}</TableCell>}
              {visibleCols.has("receiver") && <TableCell>{callTo(c)}</TableCell>}
              {visibleCols.has("direction") && <TableCell>{c.direction || "—"}</TableCell>}
              {visibleCols.has("duration") && <TableCell>{formatDuration(c.duration)}</TableCell>}
              {visibleCols.has("date") && <TableCell className="text-muted-foreground">{formatDate(callDate(c))}</TableCell>}
              {visibleCols.has("status") && (
                <TableCell><Badge variant="secondary">{c.status}</Badge></TableCell>
              )}
              {visibleCols.has("link") && (
                <TableCell>
                  {(c.whatsapp_call_id || c.id) && (
                    <a
                      href={`https://storage.wavoip.com/${c.whatsapp_call_id || c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> {t("viewRecording")}
                    </a>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {calls.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t">
          <p className="text-xs text-muted-foreground">
            {t("paginationShowing", { from: start + 1, to: Math.min(start + PAGE_SIZE, calls.length), total: calls.length })}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">{t("paginationPrev")}</span>
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">{safePage} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
              <span className="hidden sm:inline mr-1">{t("paginationNext")}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WaVoIPPage() {
  const t = useTranslations("wavoipPage");
  const allowed = usePageAccess("wavoip", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;

  // Login tab state
  const [loading, setLoading] = useState(true);
  const [wavoipAuth, setWavoipAuth] = useState<string | null>(null);
  const [calls, setCalls] = useState<WaVoipCall[]>([]);
  const [devices, setDevices] = useState<WaVoipDevice[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [logging, setLogging] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // Token tab state
  const [whatsapps, setWhatsapps] = useState<Whatsapp[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [tokenCalls, setTokenCalls] = useState<WaVoipCall[]>([]);
  const [loadingToken, setLoadingToken] = useState(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const tenantRes = await fetchTenantById(tenantId);
      const d = Array.isArray(tenantRes.data) ? tenantRes.data[0] : tenantRes.data;
      const auth = (d as Record<string, string>)?.wavoipAuth || null;
      setWavoipAuth(auth);

      if (auth) {
        const [callsData, devicesData] = await Promise.allSettled([fetchCalls(), fetchDevices()]);
        if (callsData.status === "fulfilled") setCalls(dedup(callsData.value));
        if (devicesData.status === "fulfilled") setDevices(devicesData.value);
      }

      // Load whatsapps for token tab
      const wpRes = await fetchWhatsapps();
      const allWp: Whatsapp[] = Array.isArray(wpRes.data) ? wpRes.data : [];
      setWhatsapps(allWp.filter((w) => w.wavoipToken && !(w as any).isDeleted));
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      toast.error(t("errorEmailPassword"));
      return;
    }
    setLogging(true);
    try {
      const res = await loginAndFetchCalls({ email: email.trim(), password: password.trim() });
      const result = res.data?.result || [];
      setCalls(dedup(result));
      setWavoipAuth("enabled");
      toast.success(t("loginSuccess"));
    } catch {
      toast.error(t("loginError"));
    } finally {
      setLogging(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await resetWavoip();
      setWavoipAuth(null);
      setCalls([]);
      setDevices([]);
      setEmail("");
      setPassword("");
      toast.success(t("resetSuccess"));
      setResetDialogOpen(false);
    } catch {
      toast.error(t("resetError"));
    } finally {
      setResetting(false);
    }
  }

  async function handleFetchByToken() {
    if (!selectedToken) {
      toast.error(t("errorSelectToken"));
      return;
    }
    setLoadingToken(true);
    setTokenCalls([]);
    try {
      const res = await fetchCallsByToken(selectedToken);
      const data = res.data;
      const result: WaVoipCall[] = Array.isArray(data)
        ? data
        : (data as { result?: WaVoipCall[] }).result || [];
      setTokenCalls(dedup(result));
      if (result.length === 0) toast.info(t("noCallsFound"));
    } catch {
      toast.error(t("errorFetchByToken"));
    } finally {
      setLoadingToken(false);
    }
  }

  // Build token options from whatsapps (support multiple comma-separated tokens)
  const seenTokens = new Set<string>();
  const tokenOptions: { label: string; value: string }[] = [];
  for (const wp of whatsapps) {
    const tokens = (wp.wavoipToken || "").split(",").map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 1) {
      if (!seenTokens.has(tokens[0])) {
        seenTokens.add(tokens[0]);
        tokenOptions.push({ label: `${wp.name} — ${tokens[0].substring(0, 20)}...`, value: tokens[0] });
      }
    } else {
      tokens.forEach((t, i) => {
        if (!seenTokens.has(t)) {
          seenTokens.add(t);
          tokenOptions.push({ label: `${wp.name} — Token ${i + 1} (${t.substring(0, 15)}...)`, value: t });
        }
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("pageTitle")} description={t("pageDescription")} help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }} />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}>
        {wavoipAuth && (
          <Button variant="outline" onClick={() => setResetDialogOpen(true)}>
            <RotateCcw className="mr-2 h-4 w-4" /> {t("resetLogin")}
          </Button>
        )}
      </PageHeader>

      <Tabs defaultValue="login">
        <TabsList>
          <TabsTrigger value="login">{t("tabLoginCalls")}</TabsTrigger>
          <TabsTrigger value="token">{t("tabByToken")}</TabsTrigger>
        </TabsList>

        {/* Tab 1: Login */}
        <TabsContent value="login" className="space-y-4 mt-4">
          {!wavoipAuth ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" /> {t("authTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("authDescription")}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("emailLabel")}</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("passwordLabel")}</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <Button onClick={handleLogin} disabled={logging}>
                  {logging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                  {t("authorizeBtn")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {calls.length > 0 && (
                <WavoipMetrics calls={calls} channelCount={devices.length || whatsapps.length} />
              )}
              {calls.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <PhoneCall className="h-5 w-5" /> {t("callsSection")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-auto">
                    <CallsTable calls={calls} />
                  </CardContent>
                </Card>
              )}
              {devices.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("devicesSection")}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>{t("colName")}</TableHead>
                          <TableHead>{t("colPhone")}</TableHead>
                          <TableHead>{t("colToken")}</TableHead>
                          <TableHead>{t("colStatus")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {devices.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>{d.id}</TableCell>
                            <TableCell>{d.name}</TableCell>
                            <TableCell>{d.phone || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{d.token || "—"}</TableCell>
                            <TableCell><Badge variant="secondary">{d.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
              {calls.length === 0 && devices.length === 0 && (
                <EmptyState icon={PhoneCall} title={t("noCallsFound")} description={t("noCallsFound")} />
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 2: Token */}
        <TabsContent value="token" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("listByTokenTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("selectTokenDescription")}
              </p>
              {tokenOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noTokensFound")}</p>
              ) : (
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>{t("colToken")} WaVoIP</Label>
                    <Select value={selectedToken} onValueChange={setSelectedToken}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectTokenPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {tokenOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleFetchByToken} disabled={loadingToken || !selectedToken}>
                    {loadingToken ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t("searchCallsBtn")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {tokenCalls.length > 0 && (
            <WavoipMetrics calls={tokenCalls} channelCount={1} />
          )}

          {tokenCalls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("tokenCallsTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto">
                <CallsTable calls={tokenCalls} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("resetWavoip")}</DialogTitle>
            <DialogDescription>
              {t("resetConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("reset")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
