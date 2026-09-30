"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/layout/empty-state";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { HardDrive, Plus, Pencil, Trash2, Plug, RefreshCw, Globe, Building2, Wrench, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { getSocket } from "@/lib/socket";
import {
  StorageConfig,
  fetchStorageConfigs,
  createStorageConfig,
  updateStorageConfig,
  deleteStorageConfig,
  testStorageConnection,
  migrateToStorage,
  repairStorage,
} from "@/services/storage-config";
import { fetchTenants } from "@/services/tenants";

type ProgressKind = "migrate" | "repair";

interface ProgressState {
  open: boolean;
  kind: ProgressKind;
  configId: number;
  phase: "starting" | "discovering" | "running" | "done" | "error";
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  currentTenantId: number;
  migrated: number;
  errors: number;
  errorMessage?: string;
  results?: Array<{ tenantId: number; migratedFiles: number; errors: number }>;
}

interface ProgressSocketPayload {
  kind: ProgressKind;
  configId: number;
  phase: "discovering" | "running" | "done" | "error";
  totalFiles?: number;
  processedFiles?: number;
  currentFile?: string;
  currentTenantId?: number;
  migrated?: number;
  errors?: number;
  errorMessage?: string;
  results?: Array<{ tenantId: number; migratedFiles: number; errors: number }>;
}

interface TenantOption {
  id: number;
  name: string;
}

type ProviderTab = "aws" | "minio" | "r2" | "custom";

const PROVIDER_PRESETS: Record<ProviderTab, Partial<StorageConfig>> = {
  aws: {
    endpoint: null,
    region: "us-east-1",
    forcePathStyle: false,
    publicUrlBase: null,
  },
  minio: {
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    forcePathStyle: true,
    publicUrlBase: null,
  },
  r2: {
    endpoint: "",
    region: "auto",
    forcePathStyle: false,
    publicUrlBase: null,
  },
  custom: {
    endpoint: "",
    region: "",
    forcePathStyle: false,
    publicUrlBase: null,
  },
};

const EMPTY: Partial<StorageConfig> = {
  isGlobal: true,
  isActive: true,
  provider: "s3",
  endpoint: null,
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  forcePathStyle: false,
  publicUrlBase: null,
  keepLocalCopy: false,
  autoDeleteEnabled: false,
  autoDeleteDays: null,
  tenantId: null,
};

/**
 * Cloudflare R2: o endpoint *.r2.cloudflarestorage.com é a API S3 PRIVADA — exige assinatura e
 * nunca serve objetos publicamente. Sem a URL pública (domínio r2.dev do bucket ou domínio
 * próprio) o backend recusa salvar com 400 (assertR2PublicUrl), então o campo NÃO é opcional
 * nesse provedor. Espelhamos a mesma condição do backend, inclusive quando o endpoint do R2 é
 * colado na aba "Personalizado". AWS S3 / MinIO seguem opcionais.
 */
const R2_S3_API_HOST = "r2.cloudflarestorage.com";

function publicUrlBaseIsRequired(
  tab: ProviderTab,
  endpoint: string | null | undefined
): boolean {
  if (tab === "r2") return true;
  return (endpoint ?? "").toLowerCase().includes(R2_S3_API_HOST);
}

export default function StorageConfigPage() {
  const t = useTranslations("storageConfigPage");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StorageConfig[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<StorageConfig>>(EMPTY);
  const [providerTab, setProviderTab] = useState<ProviderTab>("aws");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [repairConfirmId, setRepairConfirmId] = useState<number | null>(null);
  // Migrar apaga a cópia local de cada arquivo enviado quando keepLocalCopy está off
  // (o padrão) — inclusive galeria, chatbot e profile-pictures. Só "Reparar", que mexe
  // apenas no banco, tinha confirmação: a proteção estava no botão errado.
  const [migrateConfirmId, setMigrateConfirmId] = useState<number | null>(null);
  const isProgressBusy =
    !!progress &&
    progress.open &&
    progress.phase !== "done" &&
    progress.phase !== "error";
  const publicUrlRequired = publicUrlBaseIsRequired(providerTab, editing.endpoint);

  const set = (k: keyof StorageConfig, v: unknown) =>
    setEditing((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, tenantRes] = await Promise.all([
        fetchStorageConfigs(),
        fetchTenants(),
      ]);
      const arr = Array.isArray(cfgRes.data) ? cfgRes.data : [];
      setData(arr);
      const rawTenants = Array.isArray(tenantRes.data)
        ? tenantRes.data
        : (tenantRes.data as { tenants?: unknown[] })?.tenants ?? [];
      setTenants(
        (rawTenants as { id: number; name: string }[]).map((t) => ({ id: t.id, name: t.name }))
      );
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // Subscribe to backend storage progress events while a migrate/repair is running.
  // Uses a global event (not tenant-scoped) so it works for superadmin too.
  useEffect(() => {
    if (!progress?.open) return;
    const socket = getSocket();
    const event = "storage:progress";

    const handler = (payload: ProgressSocketPayload) => {
      setProgress((prev) => {
        if (!prev || !prev.open) return prev;
        if (payload.kind !== prev.kind || payload.configId !== prev.configId) return prev;

        if (payload.phase === "discovering") {
          return { ...prev, phase: "discovering" };
        }
        if (payload.phase === "running") {
          return {
            ...prev,
            phase: "running",
            totalFiles: payload.totalFiles ?? prev.totalFiles,
            processedFiles: payload.processedFiles ?? prev.processedFiles,
            currentFile: payload.currentFile ?? prev.currentFile,
            currentTenantId: payload.currentTenantId ?? prev.currentTenantId,
            migrated: payload.migrated ?? prev.migrated,
            errors: payload.errors ?? prev.errors,
          };
        }
        if (payload.phase === "done") {
          return {
            ...prev,
            phase: "done",
            totalFiles: payload.totalFiles ?? prev.totalFiles,
            processedFiles: payload.processedFiles ?? prev.processedFiles,
            migrated: payload.migrated ?? prev.migrated,
            errors: payload.errors ?? prev.errors,
            results: payload.results,
          };
        }
        if (payload.phase === "error") {
          return { ...prev, phase: "error", errorMessage: payload.errorMessage };
        }
        return prev;
      });
    };

    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [progress?.open]);

  function openCreate() {
    setProviderTab("aws");
    setEditing({ ...EMPTY, ...PROVIDER_PRESETS.aws });
    setDialogOpen(true);
  }

  function openEdit(cfg: StorageConfig) {
    // Detect which tab based on existing endpoint
    let tab: ProviderTab = "aws";
    if (cfg.endpoint) {
      if (cfg.forcePathStyle) tab = "minio";
      else if (cfg.endpoint.includes("r2.cloudflarestorage")) tab = "r2";
      else tab = "custom";
    }
    setProviderTab(tab);
    setEditing({ ...cfg });
    setDialogOpen(true);
  }

  function handleTabChange(tab: ProviderTab) {
    setProviderTab(tab);
    setEditing((p) => ({ ...p, ...PROVIDER_PRESETS[tab] }));
  }

  async function handleSave() {
    if (!editing.region?.trim()) { toast.error(t("errorRegionRequired")); return; }
    if (!editing.bucket?.trim()) { toast.error(t("errorBucketRequired")); return; }
    if (!editing.accessKeyId?.trim()) { toast.error(t("errorAccessKeyRequired")); return; }
    if (!editing.secretAccessKey?.trim()) { toast.error(t("errorSecretKeyRequired")); return; }
    // Mesma regra do backend: na criação sempre exige (a config nasce ativa); na edição só
    // quando a config vai ficar ATIVA, para não travar quem só quer desativar uma config R2.
    if (
      publicUrlRequired &&
      (!editing.id || editing.isActive) &&
      !editing.publicUrlBase?.trim()
    ) {
      toast.error(t("errorPublicUrlRequiredR2"));
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<StorageConfig> = {
        ...editing,
        endpoint: editing.endpoint?.trim() || null,
        publicUrlBase: editing.publicUrlBase?.trim() || null,
        autoDeleteDays: editing.autoDeleteEnabled ? (editing.autoDeleteDays ?? null) : null,
        tenantId: editing.isGlobal ? null : (editing.tenantId ?? null),
      };

      if (editing.id) {
        await updateStorageConfig(editing.id, payload);
        toast.success(t("configUpdated"));
      } else {
        await createStorageConfig(payload);
        toast.success(t("configCreated"));
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      // O backend recusa configurações inválidas com uma mensagem explicando o motivo
      // (ex.: R2 sem URL pública). Engolir tudo num "Erro ao criar" deixava o operador
      // sem saber o que corrigir.
      const apiMessage = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      toast.error(apiMessage || (editing.id ? t("errorUpdating") : t("errorCreating")));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("deleteDescription"))) return;
    try {
      await deleteStorageConfig(id);
      toast.success(t("configDeleted"));
      load();
    } catch {
      toast.error(t("errorDeleting"));
    }
  }

  async function handleTest(id: number) {
    setTesting(id);
    try {
      const res = await testStorageConnection(id);
      if (res.data.ok) {
        toast.success(t("testSuccess"));
      } else {
        toast.error(`${t("testFailed")}: ${res.data.error ?? "unknown"}`);
      }
    } catch {
      toast.error(t("errorTesting"));
    } finally {
      setTesting(null);
    }
  }

  function openProgress(kind: ProgressKind, configId: number) {
    setProgress({
      open: true,
      kind,
      configId,
      phase: "starting",
      totalFiles: 0,
      processedFiles: 0,
      currentFile: "",
      currentTenantId: 0,
      migrated: 0,
      errors: 0,
    });
  }

  function handleMigrate(configId: number) {
    setMigrateConfirmId(configId);
  }

  async function confirmMigrate() {
    const configId = migrateConfirmId;
    if (configId == null) return;
    setMigrateConfirmId(null);
    openProgress("migrate", configId);
    try {
      await migrateToStorage(configId);
    } catch {
      setProgress((p) => (p ? { ...p, phase: "error", errorMessage: t("errorMigrating") } : p));
      toast.error(t("errorMigrating"));
    }
  }

  function handleRepair(configId: number) {
    setRepairConfirmId(configId);
  }

  async function confirmRepair() {
    const configId = repairConfirmId;
    if (configId == null) return;
    setRepairConfirmId(null);
    openProgress("repair", configId);
    try {
      await repairStorage(configId);
    } catch {
      setProgress((p) => (p ? { ...p, phase: "error", errorMessage: t("errorRepairing") } : p));
      toast.error(t("errorRepairing"));
    }
  }

  // Shared credentials fields (all providers need these).
  // JSX element (not a component) — evita remount/perda-de-foco a cada keystroke.
  const credentialFields = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{t("labelRegion")}</Label>
          <Input
            value={editing.region ?? ""}
            onChange={(e) => set("region", e.target.value)}
            placeholder={providerTab === "r2" ? "auto" : "us-east-1"}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("labelBucket")}</Label>
          <Input
            value={editing.bucket ?? ""}
            onChange={(e) => set("bucket", e.target.value)}
            placeholder={t("bucketPlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("labelAccessKeyId")}</Label>
        <Input
          value={editing.accessKeyId ?? ""}
          onChange={(e) => set("accessKeyId", e.target.value)}
          placeholder="AKIAIOSFODNN7EXAMPLE"
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("labelSecretKey")}</Label>
        <Input
          type="password"
          value={editing.secretAccessKey ?? ""}
          onChange={(e) => set("secretAccessKey", e.target.value)}
          placeholder="••••••••••••••••"
        />
      </div>

      <div className="space-y-1.5">
        <Label>
          {publicUrlRequired ? t("labelPublicUrlBaseRequired") : t("labelPublicUrlBase")}
          {publicUrlRequired && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        <Input
          value={editing.publicUrlBase ?? ""}
          onChange={(e) => set("publicUrlBase", e.target.value)}
          placeholder={publicUrlRequired ? "https://pub-xxxx.r2.dev" : "https://cdn.example.com"}
        />
        <p className="text-xs text-muted-foreground">
          {publicUrlRequired ? t("publicUrlBaseHintR2") : t("publicUrlBaseHint")}
        </p>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newConfig")}</Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-[300px]" /></div>
      ) : data.length === 0 ? (
        <EmptyState icon={HardDrive} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newConfig")}</Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colScope")}</TableHead>
                  <TableHead>{t("colProvider")}</TableHead>
                  <TableHead>{t("colBucket")}</TableHead>
                  <TableHead>{t("colRegion")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colAutoDelete")}</TableHead>
                  <TableHead className="w-[160px]">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((cfg) => (
                  <TableRow key={cfg.id}>
                    <TableCell>
                      {cfg.isGlobal ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          <Globe className="h-4 w-4 text-blue-500" /> {t("scopeGlobal")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {tenants.find((ten) => ten.id === cfg.tenantId)?.name
                            ?? `${t("scopeTenant")} #${cfg.tenantId}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="uppercase text-xs font-medium">{cfg.provider}</TableCell>
                    <TableCell className="font-mono text-xs">{cfg.bucket}</TableCell>
                    <TableCell className="text-sm">{cfg.region}</TableCell>
                    <TableCell>
                      <Badge variant={cfg.isActive ? "success" : "secondary"}>
                        {cfg.isActive ? t("statusActive") : t("statusInactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {cfg.autoDeleteEnabled
                        ? `${cfg.autoDeleteDays ?? "—"} ${t("days")}`
                        : t("disabled")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleTest(cfg.id)}
                          disabled={testing === cfg.id}
                          title={t("testConnection")}
                        >
                          <Plug className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleMigrate(cfg.id)}
                          disabled={isProgressBusy}
                          title={t("migrate")}
                        >
                          {isProgressBusy && progress?.kind === "migrate" && progress?.configId === cfg.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RefreshCw className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleRepair(cfg.id)}
                          disabled={isProgressBusy}
                          title={t("repair")}
                        >
                          {isProgressBusy && progress?.kind === "repair" && progress?.configId === cfg.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Wrench className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => openEdit(cfg)}
                          title={t("edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleDelete(cfg.id)}
                          title={t("delete")}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="break-words">{editing.id ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Active */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("labelActive")}</Label>
              <Switch checked={!!editing.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </div>

            {/* Global */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>{t("labelGlobal")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t("globalHint")}</p>
              </div>
              <Switch
                checked={!!editing.isGlobal}
                onCheckedChange={(v) => {
                  set("isGlobal", v);
                  if (v) set("tenantId", null);
                }}
              />
            </div>

            {/* Tenant selector (only if not global) */}
            {!editing.isGlobal && (
              <div className="space-y-1.5">
                <Label>{t("labelTenantId")}</Label>
                <Select
                  value={editing.tenantId ? String(editing.tenantId) : ""}
                  onValueChange={(v) => set("tenantId", Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("tenantIdPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((ten) => (
                      <SelectItem key={ten.id} value={String(ten.id)}>
                        #{ten.id} — {ten.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            {/* Provider Tabs */}
            <p className="text-sm font-semibold">{t("sectionCredentials")}</p>

            <Tabs value={providerTab} onValueChange={(v) => handleTabChange(v as ProviderTab)}>
              <TabsList className="w-full">
                <TabsTrigger value="aws" className="flex-1">{t("tabAws")}</TabsTrigger>
                <TabsTrigger value="minio" className="flex-1">{t("tabMinio")}</TabsTrigger>
                <TabsTrigger value="r2" className="flex-1">{t("tabR2")}</TabsTrigger>
                <TabsTrigger value="custom" className="flex-1">{t("tabCustom")}</TabsTrigger>
              </TabsList>

              {/* AWS S3 */}
              <TabsContent value="aws" className="space-y-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  AWS S3 — sem endpoint customizado, region padrão AWS.
                </p>
                {credentialFields}
              </TabsContent>

              {/* MinIO */}
              <TabsContent value="minio" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>{t("labelEndpoint")}</Label>
                  <Input
                    value={editing.endpoint ?? ""}
                    onChange={(e) => set("endpoint", e.target.value)}
                    placeholder="http://localhost:9000"
                  />
                  <p className="text-xs text-muted-foreground">{t("endpointHint")}</p>
                </div>
                {credentialFields}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>{t("labelForcePathStyle")}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("forcePathStyleHint")}</p>
                  </div>
                  <Switch
                    checked={!!editing.forcePathStyle}
                    onCheckedChange={(v) => set("forcePathStyle", v)}
                  />
                </div>
              </TabsContent>

              {/* Cloudflare R2 */}
              <TabsContent value="r2" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>{t("labelEndpoint")}</Label>
                  <Input
                    value={editing.endpoint ?? ""}
                    onChange={(e) => set("endpoint", e.target.value)}
                    placeholder="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
                  />
                  <p className="text-xs text-muted-foreground">{t("endpointHint")}</p>
                </div>
                {credentialFields}
              </TabsContent>

              {/* Custom */}
              <TabsContent value="custom" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>{t("labelEndpoint")}</Label>
                  <Input
                    value={editing.endpoint ?? ""}
                    onChange={(e) => set("endpoint", e.target.value)}
                    placeholder={t("endpointPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">{t("endpointHint")}</p>
                </div>
                {credentialFields}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>{t("labelForcePathStyle")}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("forcePathStyleHint")}</p>
                  </div>
                  <Switch
                    checked={!!editing.forcePathStyle}
                    onCheckedChange={(v) => set("forcePathStyle", v)}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <Separator />

            {/* keepLocalCopy */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>{t("labelKeepLocalCopy")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t("keepLocalCopyHint")}</p>
              </div>
              <Switch
                checked={!!editing.keepLocalCopy}
                onCheckedChange={(v) => set("keepLocalCopy", v)}
              />
            </div>

            <Separator />

            {/* Auto-delete */}
            <p className="text-sm font-semibold">{t("sectionAutoDelete")}</p>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("labelAutoDelete")}</Label>
              <Switch
                checked={!!editing.autoDeleteEnabled}
                onCheckedChange={(v) => set("autoDeleteEnabled", v)}
              />
            </div>

            {editing.autoDeleteEnabled && (
              <div className="space-y-1.5">
                <Label>{t("labelAutoDeleteDays")}</Label>
                <Input
                  type="number"
                  value={editing.autoDeleteDays ?? ""}
                  onChange={(e) => set("autoDeleteDays", e.target.value ? Number(e.target.value) : null)}
                  placeholder="90"
                />
                <p className="text-xs text-muted-foreground">{t("autoDeleteDaysHint")}</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDialogOpen(false)}>{t("btnCancel")}</Button>
            <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
              {saving ? t("btnSaving") : t("btnSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Migrate confirmation modal */}
      <Dialog open={migrateConfirmId !== null} onOpenChange={(v) => { if (!v) setMigrateConfirmId(null); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              {t("migrate")}
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              {t("migrateDescription")}
            </DialogDescription>
          </DialogHeader>
          {data.find((c) => c.id === migrateConfirmId)?.keepLocalCopy ? (
            <div className="flex gap-2 rounded-md border p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              <span className="text-muted-foreground">{t("migrateKeepsLocalNotice")}</span>
            </div>
          ) : (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
              <span>{t("migrateDeletesLocalWarning")}</span>
            </div>
          )}
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setMigrateConfirmId(null)}>
              {t("btnCancel")}
            </Button>
            <Button className="w-full sm:w-auto" onClick={confirmMigrate}>
              {t("migrate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repair confirmation modal */}
      <Dialog open={repairConfirmId !== null} onOpenChange={(v) => { if (!v) setRepairConfirmId(null); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              {t("repair")}
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              {t("repairDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRepairConfirmId(null)}>
              {t("btnCancel")}
            </Button>
            <Button className="w-full sm:w-auto" onClick={confirmRepair}>
              {t("repair")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Dialog (migrate / repair) */}
      <Dialog
        open={!!progress?.open}
        onOpenChange={(v) => {
          if (v) return;
          // Only allow closing when finished (done/error). While running, lock open.
          if (progress?.phase === "done" || progress?.phase === "error") {
            setProgress(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="break-words">
              {progress?.kind === "repair" ? t("repairProgressTitle") : t("migrateProgressTitle")}
            </DialogTitle>
            <DialogDescription>
              {progress?.phase === "starting" && t("phaseStarting")}
              {progress?.phase === "discovering" && t("phaseDiscovering")}
              {progress?.phase === "running" && t("phaseRunning")}
              {progress?.phase === "done" && t("phaseDone")}
              {progress?.phase === "error" && t("phaseError")}
            </DialogDescription>
          </DialogHeader>

          {progress && (progress.phase === "starting" || progress.phase === "discovering") && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground text-center">
                {progress.phase === "starting" ? t("phaseStarting") : t("phaseDiscovering")}
              </p>
            </div>
          )}

          {progress && progress.phase === "running" && (
            <div className="space-y-4 py-2">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">
                    {t("progressLabel", {
                      processed: progress.processedFiles,
                      total: progress.totalFiles,
                    })}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {progress.totalFiles > 0
                      ? Math.floor((progress.processedFiles / progress.totalFiles) * 100)
                      : 0}%
                  </span>
                </div>
                <Progress
                  value={progress.totalFiles > 0
                    ? (progress.processedFiles / progress.totalFiles) * 100
                    : 0}
                />
              </div>

              {progress.currentFile && (
                <div className="min-w-0 rounded-md border bg-muted/40 p-2.5">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("currentFile")}</p>
                  <p className="font-mono text-xs break-all line-clamp-2" title={progress.currentFile}>
                    {progress.currentFile}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-2.5">
                  <p className="text-xs text-muted-foreground">{t("statMigrated")}</p>
                  <p className="text-xl font-semibold tabular-nums text-emerald-600">
                    {progress.migrated}
                  </p>
                </div>
                <div className="rounded-md border p-2.5">
                  <p className="text-xs text-muted-foreground">{t("statErrors")}</p>
                  <p className={`text-xl font-semibold tabular-nums ${progress.errors > 0 ? "text-destructive" : ""}`}>
                    {progress.errors}
                  </p>
                </div>
              </div>

              {progress.currentTenantId > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {t("currentTenant", { tenantId: progress.currentTenantId })}
                </p>
              )}
            </div>
          )}

          {progress && progress.phase === "done" && (
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center gap-2 py-2">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                <p className="text-sm font-medium">{t("phaseDone")}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">{t("statTotal")}</p>
                  <p className="text-xl font-semibold tabular-nums">{progress.totalFiles}</p>
                </div>
                <div className="rounded-md border p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">{t("statMigrated")}</p>
                  <p className="text-xl font-semibold tabular-nums text-emerald-600">{progress.migrated}</p>
                </div>
                <div className="rounded-md border p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">{t("statErrors")}</p>
                  <p className={`text-xl font-semibold tabular-nums ${progress.errors > 0 ? "text-destructive" : ""}`}>
                    {progress.errors}
                  </p>
                </div>
              </div>

              {progress.results && progress.results.length > 0 && (
                <div className="rounded-md border max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left p-2">{t("colTenant")}</th>
                        <th className="text-right p-2">{t("statMigrated")}</th>
                        <th className="text-right p-2">{t("statErrors")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.results.map((r) => (
                        <tr key={r.tenantId} className="border-t">
                          <td className="p-2">#{r.tenantId}</td>
                          <td className="p-2 text-right tabular-nums">{r.migratedFiles}</td>
                          <td className="p-2 text-right tabular-nums">{r.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {progress && progress.phase === "error" && (
            <div className="flex flex-col items-center gap-2 py-6">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm font-medium">{t("phaseError")}</p>
              {progress.errorMessage && (
                <p className="text-xs text-muted-foreground text-center break-words">
                  {progress.errorMessage}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant={progress?.phase === "done" || progress?.phase === "error" ? "default" : "outline"}
              className="w-full sm:w-auto"
              disabled={progress?.phase !== "done" && progress?.phase !== "error"}
              onClick={() => setProgress(null)}
            >
              {progress?.phase === "done" || progress?.phase === "error" ? t("btnClose") : t("btnRunning")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
