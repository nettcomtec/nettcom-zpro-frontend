"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Play, Save, RotateCcw, RefreshCw, Eye, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { migrateTenant, listMigrations, getMigrationProgress, resumeMigration, listMigrationLogs } from "@/services/superadmin";
import { useBrandingStore } from "@/stores/branding-store";

const STORAGE_KEY = "zpro-migration-config";

interface RemoteDbConfig {
  host: string; port: number; database: string; username: string; password: string; dialect: string;
}
interface SshConfig {
  host: string; port: number; username: string; password: string; privateKey: string; zproBasePath: string; publicFolderPath: string;
}
interface MigrationForm {
  remoteDbConfig: RemoteDbConfig;
  sshConfig: SshConfig;
  sourceTenantId: string;
}

const EMPTY_FORM: MigrationForm = {
  remoteDbConfig: { host: "", port: 5432, database: "", username: "", password: "", dialect: "postgres" },
  sshConfig: { host: "", port: 22, username: "", password: "", privateKey: "", zproBasePath: "", publicFolderPath: "" },
  sourceTenantId: "",
};

interface Migration {
  id: number;
  sourceTenantId?: number;
  targetTenantId?: number;
  status?: string;
  progress?: number;
  currentStep?: number;
  totalSteps?: number;
  filesDownloaded?: number;
  totalFiles?: number;
  currentModel?: string;
  completedModels?: string[];
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;
  publicFilesCompleted?: boolean;
  sessionsFilesCompleted?: boolean;
  wwebjsAuthFilesCompleted?: boolean;
}

interface MigrationLog { type: string; path?: string; size?: number; }

function statusColor(s?: string): "success" | "destructive" | "warning" | "secondary" {
  if (s === "completed") return "success";
  if (s === "failed") return "destructive";
  if (s === "in_progress") return "warning";
  if (s === "paused") return "warning";
  return "secondary";
}

// statusText is now a hook-based function inside the component
function statusTextKey(s?: string): string {
  if (s === "completed") return "statusCompleted";
  if (s === "in_progress") return "statusInProgress";
  if (s === "failed") return "statusFailed";
  if (s === "paused") return "statusPaused";
  if (s === "pending") return "statusPending";
  return "";
}

function calcProgress(m: Migration) {
  if (m.status === "completed") return 100;
  if (m.progress !== undefined) return Math.min(100, Math.round(m.progress));
  if (m.totalSteps && m.totalSteps > 0) return Math.min(100, Math.round((m.currentStep || 0) / m.totalSteps * 100));
  return 0;
}

const fmt = (d?: string) => d ? formatDateTime(new Date(d)) : "—";

export default function MigrationPage() {
  const t = useTranslations("migrationPage");
  const { appName } = useBrandingStore();
  const statusText = (s?: string) => {
    const key = statusTextKey(s);
    return key ? t(key) : (s || "—");
  };
  const [form, setForm] = useState<MigrationForm>(EMPTY_FORM);
  const [hasSaved, setHasSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingResume, setLoadingResume] = useState(false);

  const [selected, setSelected] = useState<Migration | null>(null);
  const [logs, setLogs] = useState<MigrationLog[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeTargetId, setResumeTargetId] = useState<number | null>(null);
  const [resumeNeedsSsh, setResumeNeedsSsh] = useState(false);
  const [resumePasswords, setResumePasswords] = useState({ dbPassword: "", sshPassword: "", sshPrivateKey: "" });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<MigrationForm>;
        // Nunca restaurar segredos do localStorage (senha do banco, senha e chave SSH)
        setForm({
          ...EMPTY_FORM,
          ...parsed,
          sourceTenantId: parsed.sourceTenantId ?? "",
          remoteDbConfig: { ...EMPTY_FORM.remoteDbConfig, ...parsed.remoteDbConfig, password: "" },
          sshConfig: { ...EMPTY_FORM.sshConfig, ...parsed.sshConfig, password: "", privateKey: "" },
        });
        setHasSaved(true);
      } catch { }
    }
    loadMigrations();
    pollRef.current = setInterval(() => {
      setMigrations((prev) => {
        if (prev.some((m) => m.status === "in_progress")) loadMigrations();
        return prev;
      });
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function loadMigrations() {
    setLoadingList(true);
    try {
      const { data } = await listMigrations();
      setMigrations(Array.isArray(data) ? data : []);
    } catch { /* silencioso */ }
    finally { setLoadingList(false); }
  }

  const setDb = (k: keyof RemoteDbConfig, v: string | number) =>
    setForm((p) => ({ ...p, remoteDbConfig: { ...p.remoteDbConfig, [k]: v } }));
  const setSsh = (k: keyof SshConfig, v: string | number) =>
    setForm((p) => ({ ...p, sshConfig: { ...p.sshConfig, [k]: v } }));

  function handleSaveConfig() {
    // Nao persistir segredos no localStorage (senha do banco, senha e chave SSH)
    const safeForm: MigrationForm = {
      ...form,
      remoteDbConfig: { ...form.remoteDbConfig, password: "" },
      sshConfig: { ...form.sshConfig, password: "", privateKey: "" },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeForm));
    setHasSaved(true);
    toast.success(t("configSavedLocally"));
  }

  function handleClearConfig() {
    localStorage.removeItem(STORAGE_KEY);
    setForm(EMPTY_FORM);
    setHasSaved(false);
    toast.success(t("configCleared"));
  }

  function handleRun() {
    if (!form.remoteDbConfig.host || !form.remoteDbConfig.database) {
      toast.error(t("errorHostDbRequired"));
      return;
    }
    if (!form.sshConfig.host || !form.sshConfig.username) {
      toast.error(t("errorSshRequired"));
      return;
    }
    if (!form.sshConfig.password && !form.sshConfig.privateKey) {
      toast.error(t("errorSshAuthRequired"));
      return;
    }
    setConfirmOpen(true);
  }

  async function handleConfirmedRun() {
    setConfirmOpen(false);
    setRunning(true);
    try {
      const payload = { ...form, sourceTenantId: form.sourceTenantId ? Number(form.sourceTenantId) : undefined };
      const { data } = await migrateTenant(payload as Record<string, unknown>);
      toast.success(t("migrationStarted", { id: (data as { migrationId?: number })?.migrationId ?? "?" }));
      setForm(EMPTY_FORM);
      setHasSaved(false);
      localStorage.removeItem(STORAGE_KEY);
      await loadMigrations();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || t("errorStartMigration"));
    }
    finally { setRunning(false); }
  }

  function handleResume(m: Migration) {
    setResumeTargetId(m.id);
    // SSH só é necessário se ainda houver fase de download de arquivos pendente
    setResumeNeedsSsh(!(m.publicFilesCompleted && m.sessionsFilesCompleted && m.wwebjsAuthFilesCompleted));
    setResumePasswords({ dbPassword: "", sshPassword: "", sshPrivateKey: "" });
    setResumeDialogOpen(true);
  }

  async function handleConfirmedResume() {
    if (!resumeTargetId) return;
    if (!resumePasswords.dbPassword.trim()) {
      toast.error(t("resumeRequiredError"));
      return;
    }
    if (resumeNeedsSsh && !resumePasswords.sshPassword.trim() && !resumePasswords.sshPrivateKey.trim()) {
      toast.error(t("resumeSshRequiredError"));
      return;
    }
    setResumeDialogOpen(false);
    setLoadingResume(true);
    try {
      await resumeMigration(resumeTargetId, {
        dbPassword: resumePasswords.dbPassword,
        ...(resumePasswords.sshPassword ? { sshPassword: resumePasswords.sshPassword } : {}),
        ...(resumePasswords.sshPrivateKey ? { sshPrivateKey: resumePasswords.sshPrivateKey } : {})
      });
      toast.success(t("migrationResumed"));
      await loadMigrations();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || t("errorResumeMigration"));
    }
    finally { setLoadingResume(false); }
  }

  async function handleViewDetails(m: Migration) {
    try {
      const { data } = await getMigrationProgress(m.id);
      setSelected(data as Migration);
    } catch { setSelected(m); }
    try {
      const { data } = await listMigrationLogs(m.id);
      setLogs((data as { logs?: MigrationLog[] })?.logs || []);
    } catch { setLogs([]); }
    setDetailOpen(true);
  }

  const completed = migrations.filter((m) => m.status === "completed").length;
  const inProgress = migrations.filter((m) => m.status === "in_progress").length;
  const failed = migrations.filter((m) => m.status === "failed").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description", { appName: appName || "APP" })}
        help={{
          description: t("helpDesc", { appName: appName || "APP" }),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <div className="flex flex-wrap gap-2">
          {hasSaved && <Badge variant="success" className="self-center">{t("configSaved")}</Badge>}
          {hasSaved && (
            <Button variant="outline" size="sm" onClick={handleClearConfig} title={t("clearConfig")}>
              <RotateCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("clearConfig")}</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSaveConfig} title={t("saveConfig")}>
            <Save className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("saveConfig")}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={loadMigrations} title={t("refresh")}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("refresh")}</span>
          </Button>
          <Button size="sm" disabled={running} onClick={handleRun} title={running ? t("migrating") : t("startMigration")}>
            {running ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Play className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">{running ? t("migrating") : t("startMigration")}</span>
          </Button>
        </div>
      </PageHeader>

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{t("alertWarningDescription")}</AlertDescription>
      </Alert>

      <p className="text-xs text-muted-foreground">{t("secretsNotSavedHint")}</p>

      {/* Status resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{migrations.length}</p><p className="text-xs text-muted-foreground">{t("totalMigrations")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-600">{completed}</p><p className="text-xs text-muted-foreground">{t("completed")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-500">{inProgress}</p><p className="text-xs text-muted-foreground">{t("inProgress")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{failed}</p><p className="text-xs text-muted-foreground">{t("failed")}</p></CardContent></Card>
      </div>

      {/* DB Remoto */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("remoteDbConfig")}</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>{t("dbHost")}</Label><Input value={form.remoteDbConfig.host} onChange={(e) => setDb("host", e.target.value)} placeholder="192.168.1.100" /></div>
          <div className="space-y-1.5"><Label>{t("dbPort")}</Label><Input type="number" value={form.remoteDbConfig.port} onChange={(e) => setDb("port", Number(e.target.value))} placeholder="5432" /></div>
          <div className="space-y-1.5"><Label>{t("dbDialect")}</Label><Input value={form.remoteDbConfig.dialect} onChange={(e) => setDb("dialect", e.target.value)} placeholder="postgres" /></div>
          <div className="space-y-1.5"><Label>{t("dbName")}</Label><Input value={form.remoteDbConfig.database} onChange={(e) => setDb("database", e.target.value)} placeholder="nome_do_banco" /></div>
          <div className="space-y-1.5"><Label>{t("dbUser")}</Label><Input value={form.remoteDbConfig.username} onChange={(e) => setDb("username", e.target.value)} placeholder="postgres" /></div>
          <div className="space-y-1.5"><Label>{t("dbPassword")}</Label><Input type="password" value={form.remoteDbConfig.password} onChange={(e) => setDb("password", e.target.value)} /></div>
        </CardContent>
      </Card>

      {/* SSH */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("sshConfig")}</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>{t("sshHost")}</Label><Input value={form.sshConfig.host} onChange={(e) => setSsh("host", e.target.value)} placeholder="192.168.1.100" /></div>
          <div className="space-y-1.5"><Label>{t("sshPort")}</Label><Input type="number" value={form.sshConfig.port} onChange={(e) => setSsh("port", Number(e.target.value))} placeholder="22" /></div>
          <div className="space-y-1.5"><Label>{t("sshUser")}</Label><Input value={form.sshConfig.username} onChange={(e) => setSsh("username", e.target.value)} placeholder="root" /></div>
          <div className="space-y-1.5"><Label>{t("sshPassword")}</Label><Input type="password" value={form.sshConfig.password} onChange={(e) => setSsh("password", e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t("sshPrivateKey")}</Label>
            <Textarea
              value={form.sshConfig.privateKey}
              onChange={(e) => setSsh("privateKey", e.target.value)}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">{t("sshPrivateKeyHint")}</p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t("zproBasePath")}</Label>
            <Input value={form.sshConfig.zproBasePath} onChange={(e) => setSsh("zproBasePath", e.target.value)} placeholder="/home/deployzdg/zpro.io" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t("publicFolderPath")}</Label>
            <Input value={form.sshConfig.publicFolderPath} onChange={(e) => setSsh("publicFolderPath", e.target.value)} placeholder="/home/deployzdg/zpro.io/backend/public" />
          </div>
        </CardContent>
      </Card>

      {/* Configuração da Migração */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("migrationConfig")}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>{t("sourceTenantId")}</Label>
            <Input type="number" value={form.sourceTenantId} onChange={(e) => setForm((p) => ({ ...p, sourceTenantId: e.target.value }))} placeholder={t("sourceTenantIdPlaceholder")} />
          </div>
        </CardContent>
      </Card>

      {/* Lista de Migrações */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("migrationsListTitle")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loadingList ? (
            <div className="p-4 text-center text-sm text-muted-foreground">{t("loadingMigrations")}</div>
          ) : migrations.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">{t("noMigrationsFound")}</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t("colSourceTenant")}</TableHead>
                <TableHead>{t("colTargetTenant")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("detailProgress")}</TableHead>
                <TableHead>{t("colFiles")}</TableHead>
                <TableHead>{t("colCreatedAt")}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {migrations.map((m) => {
                  const prog = calcProgress(m);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{m.id}</TableCell>
                      <TableCell>{m.sourceTenantId ?? "—"}</TableCell>
                      <TableCell>{m.targetTenantId ?? "—"}</TableCell>
                      <TableCell><Badge variant={statusColor(m.status)}>{statusText(m.status)}</Badge></TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="space-y-1">
                          <Progress value={prog} className="h-1.5" />
                          <p className="text-xs text-muted-foreground">{prog}%{m.currentModel ? ` — ${m.currentModel}` : ""}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{m.filesDownloaded ?? 0} / {m.totalFiles ?? 0}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmt(m.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleViewDetails(m)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(m.status === "failed" || m.status === "paused") && (
                            <Button variant="ghost" size="icon" disabled={loadingResume} onClick={() => handleResume(m)}>
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resume Password Dialog */}
      <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 shrink-0" />
              {t("resumePasswordDialogTitle")}
            </DialogTitle>
            <DialogDescription>{t("resumePasswordDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("resumeDbPassword")}</Label>
              <Input
                type="password"
                value={resumePasswords.dbPassword}
                onChange={(e) => setResumePasswords((p) => ({ ...p, dbPassword: e.target.value }))}
                placeholder={t("resumeDbPasswordPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmedResume()}
              />
            </div>
            {resumeNeedsSsh && (
              <p className="text-xs text-amber-600">{t("resumeSshRequiredError")}</p>
            )}
            <div className="space-y-1.5">
              <Label>{t("resumeSshPassword")}</Label>
              <Input
                type="password"
                value={resumePasswords.sshPassword}
                onChange={(e) => setResumePasswords((p) => ({ ...p, sshPassword: e.target.value }))}
                placeholder={t("resumeSshPasswordPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmedResume()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sshPrivateKey")}</Label>
              <Textarea
                value={resumePasswords.sshPrivateKey}
                onChange={(e) => setResumePasswords((p) => ({ ...p, sshPrivateKey: e.target.value }))}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">{t("sshPrivateKeyHint")}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResumeDialogOpen(false)}>{t("close")}</Button>
            <Button onClick={handleConfirmedResume} disabled={!resumePasswords.dbPassword.trim() || (resumeNeedsSsh && !resumePasswords.sshPassword.trim() && !resumePasswords.sshPrivateKey.trim())}>
              <Play className="mr-2 h-4 w-4" />
              {t("resumeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Migration Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              {t("confirmDialogTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">{t("confirmDialogWarning1")}</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">{t("confirmDialogWarning2")}</AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t("close")}</Button>
            <Button variant="destructive" onClick={handleConfirmedRun}>
              <Play className="mr-2 h-4 w-4" />
              {t("confirmDialogProceed")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("migrationDetails")} #{selected?.id}</DialogTitle>
            <DialogDescription>{t("migrationDetailsDescription")}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="font-semibold">{t("detailSourceTenant")}:</span> {selected.sourceTenantId ?? "—"}</div>
                <div><span className="font-semibold">{t("detailTargetTenant")}:</span> {selected.targetTenantId ?? "—"}</div>
                <div><span className="font-semibold">{t("detailStatus")}:</span> <Badge variant={statusColor(selected.status)}>{statusText(selected.status)}</Badge></div>
                <div><span className="font-semibold">{t("detailCreatedAt")}:</span> {fmt(selected.createdAt)}</div>
                <div><span className="font-semibold">{t("detailUpdatedAt")}:</span> {fmt(selected.updatedAt)}</div>
                <div><span className="font-semibold">{t("colFiles")}:</span> {selected.filesDownloaded ?? 0} / {selected.totalFiles ?? 0}</div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold">{t("detailProgress")}: {calcProgress(selected)}%</p>
                <Progress value={calcProgress(selected)} className="h-2" />
                {selected.currentModel && <p className="text-xs text-muted-foreground">{selected.currentModel}</p>}
                <p className="text-xs text-muted-foreground">{selected.currentStep ?? 0} / {selected.totalSteps ?? 0}</p>
              </div>

              {selected.completedModels && selected.completedModels.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">{t("statusCompleted")}</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.completedModels.map((m) => <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>)}
                  </div>
                </div>
              )}

              {selected.errorMessage && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs font-mono">{selected.errorMessage}</AlertDescription>
                </Alert>
              )}

              {logs.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">{t("logsAvailable")}</p>
                  <div className="flex flex-wrap gap-1">
                    {logs.map((l, i) => <Badge key={i} variant="outline" className="text-xs">{l.type}</Badge>)}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
