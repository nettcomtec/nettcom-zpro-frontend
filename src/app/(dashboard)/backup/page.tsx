"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HardDrive, Database, CheckCircle, XCircle, RefreshCw, Play,
  AlertTriangle, Loader2, Trash2, Eye, Download, ChevronDown, ChevronUp,
  Users, Pencil, FolderOpen, Copy,
} from "lucide-react";
import { toast } from "sonner";
import {
  backupAllTenants, backupTenant, fetchBackupStatistics, fetchBackupResults,
  listAvailableBackups, getAllBackupConfigs, getBackupConfigs,
  configureBackupForTenant, deleteBackupConfig, recreateBackupConfig,
  cleanOldBackups, cleanAllBackups, downloadBackupFile, deleteBackupFile,
  fetchRunningBackups,
} from "@/services/superadmin";
import { fetchTenants } from "@/services/tenants";

interface Tenant { id: number; name: string; }
interface BackupStats {
  totalBackups?: number;
  totalSize?: number;
  lastBackup?: string;
  processedTenants?: number;
  fsBackupsCount?: number;
  fsTotalSize?: number;
  backupBasePath?: string;
}
interface BackupResult {
  id?: number; tenantId?: number; tenantName?: string; status?: string;
  databaseSuccess?: boolean; filesSuccess?: boolean;
  databaseSize?: number; filesSize?: number; totalSize?: number;
  databaseError?: string; filesError?: string; createdAt?: string;
}
interface AvailableBackup {
  backupPath?: string; tenantId?: number; tenantName?: string;
  size?: number; createdAt?: string; backupName?: string;
}
interface BackupConfig {
  id?: number; tenantId?: number; storageType?: string;
  description?: string; isActive?: boolean; createdAt?: string;
  localPath?: string; retentionDays?: number; compression?: boolean;
  storageConfig?: Record<string, unknown>;
}
// Backup disparado em background (o backend responde 202 e segue trabalhando).
interface RunningBackup {
  scope?: string; tenantId?: number | null; tenantName?: string | null; startedAt?: string;
}

// Mantido em sincronia com a lista modelsWithTenantId em TenantBackupServiceZPRO.ts (backend).
const INCLUDED_MODELS = [
  "Users","Contacts","Tickets","Messages","Whatsapps","Queues","Settings","AutoReplies",
  "ChatFlows","TodoLists","Opportunitys","Pipelines","Stages","Plans","CallLogs",
  "LogTickets","BanLists","WordLists","Kanbans","MessageUpserts","ContactUpserts","Campaigns",
  "ContactTags","ContactWallets","Tags","TicketNotes","TicketEvaluations","TicketProtocols",
  "TicketShareds","FastReplies","GreetingMessages","FarewellMessages","FarewellPrivateMessages",
  "PrivateMessages","GroupMessages","GroupLinkLists","GhostLists","BirthdayMessagesSents",
  "Notifications","Tutorials","ApiConfigs","ApiMessages","PipelineActions","PipelineActionLogs",
  "ParticipantsLists","Reasons","UsersPushSubscriptions","TenantApis","Galleries","GoogleCalendars",
  "Proxies","TicketActions","TicketActionLogs","AdReferralLogs","AppWabas","AppLinkedIns",
  "AppMercadoLivres","AppOLXs","AppRocketChats","AppTikToks","AppWooCommerces","AppNuvemshops","AppYouTubes",
  "AuditLogs","BulkDispatches","ConversionCredentials","ConversionRules","FailedJobs",
  "GlobalProviderConfigTenants","ScheduleAppointments","ScheduleReminders","ScheduleReminderLogs",
  "StorageConfigs","SupportMessages","TenantVariables","TicketPauseLogs","WavoipCalls",
  "AppGoogles","CustomProfiles","DashboardInsights","Dialog360Channels","Dialog360Calls",
  "Dialog360PhoneNumberHealth","GupshupChannels","GupshupCalls","GupshupPhoneNumberHealth",
  "MetaPhoneNumberHealth","WabaCalls",
  // Store do canal zapo (tabelas raw por sessão — ZAPO_STORE_TABLES no backend)
  "zapo_auth_credentials","zapo_signal_meta","zapo_signal_registration","zapo_signal_prekey",
  "zapo_signal_signed_prekey","zapo_signal_session","zapo_signal_identity","zapo_sender_keys",
  "zapo_sender_key_distribution","zapo_appstate_sync_keys","zapo_appstate_collection_versions",
  "zapo_appstate_collection_index_values","zapo_privacy_tokens","zapo_mailbox_contacts",
  "zapo_mailbox_messages","zapo_mailbox_threads","zapo_retry_inbound_counters",
  "zapo_retry_outbound_messages","zapo_group_participants_cache","zapo_device_list_cache",
  "zapo_chat_metadata_cache","zapo_message_secrets_cache",
];
const EXCLUDED_MODELS = [
  "MessageOffLine","CampaignContacts","ContactCustomField","UsersQueues","UserWhatsapp",
  "StepsReply","StepsReplyAction","UserMessagesLog","AutoReplyLogs","ReadPrivateMessageGroups",
  "Baileys","BaileysSessions","LicenseRequestLog","LicenseActivationLog","License",
  "UsersPrivateGroups","BackupConfig","BackupResult","QueueManager","RefreshToken",
  "GupshupTokenCache","GlobalProviderConfig",
];

function formatBytes(b?: number) {
  if (!b) return "0 B";
  const sizes = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}
const fmt = (d?: string) => d ? formatDateTime(new Date(d)) : "—";

// O backup controller envelopa toda resposta em { success, message, data }.
// Desembrulha o payload real (res.data.data), com fallback p/ resposta crua (res.data).
function unwrap(res: { data?: unknown } | undefined): unknown {
  const body = res?.data as { data?: unknown } | undefined;
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

export default function BackupPage() {
  const t = useTranslations("backupPage");
  const tCommon = useTranslations("common");

  // Confirmação via AlertDialog (substitui o confirm() nativo): a ação só roda no Confirmar.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ message: string; destructive?: boolean; action: () => void } | null>(null);
  function askConfirm(message: string, action: () => void, destructive = false) {
    setConfirmData({ message, action, destructive });
    setConfirmOpen(true);
  }

  // Data
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [stats, setStats] = useState<BackupStats>({});
  const [results, setResults] = useState<BackupResult[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [availableBackups, setAvailableBackups] = useState<AvailableBackup[]>([]);
  const [allConfigs, setAllConfigs] = useState<BackupConfig[]>([]);

  // Backup individual
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [runningTenant, setRunningTenant] = useState(false);

  // Execuções em andamento (backend responde 202 e o backup segue em background)
  const [runningBackups, setRunningBackups] = useState<RunningBackup[]>([]);
  const hasRunningAll = runningBackups.some((r) => r.scope === "all");
  const isTenantRunning = (id: string) =>
    !!id && runningBackups.some((r) => String(r.tenantId ?? "") === String(id));

  // Config por tenant
  const [configTenant, setConfigTenant] = useState<string>("");
  const [tenantConfigs, setTenantConfigs] = useState<BackupConfig[]>([]);
  const [loadingTenantConfig, setLoadingTenantConfig] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configTab, setConfigTab] = useState("storage");
  const [configStorageType, setConfigStorageType] = useState("local");
  const [configRetentionDays, setConfigRetentionDays] = useState<number>(30);
  const [configCompression, setConfigCompression] = useState(true);
  const [configDescription, setConfigDescription] = useState("");
  // Somente leitura: quem define a pasta de gravação é o servidor.
  const [configLocalPath, setConfigLocalPath] = useState("");

  // Cleanup
  const [cleanupTenant, setCleanupTenant] = useState<string>("");
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [runningCleanupAll, setRunningCleanupAll] = useState(false);

  // Details
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<BackupResult | null>(null);

  // Config search
  const [configSearch, setConfigSearch] = useState("");

  // Available backups
  const [downloadingBackup, setDownloadingBackup] = useState<string | null>(null);
  const [deletingBackup, setDeletingBackup] = useState<string | null>(null);

  // Models info
  const [showModelsInfo, setShowModelsInfo] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([fetchBackupStatistics(), fetchBackupResults()]);
      setStats((unwrap(sRes) as BackupStats) || {});
      const raw = unwrap(rRes);
      setResults(Array.isArray(raw) ? raw : (raw as { results?: BackupResult[] })?.results || []);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  async function handleUpdateStatus() {
    setLoadingStatus(true);
    try {
      const [sRes, rRes] = await Promise.all([fetchBackupStatistics(), fetchBackupResults()]);
      setStats((unwrap(sRes) as BackupStats) || {});
      const raw = unwrap(rRes);
      setResults(Array.isArray(raw) ? raw : (raw as { results?: BackupResult[] })?.results || []);
      loadRunningBackups();
    } catch { /* silencioso */ }
    finally { setLoadingStatus(false); }
  }

  async function loadTenants() {
    try {
      const { data } = await fetchTenants();
      setTenants(Array.isArray(data) ? data : []);
    } catch { /* silencioso */ }
  }

  async function loadAvailableBackups() {
    try {
      const body = unwrap(await listAvailableBackups());
      setAvailableBackups(Array.isArray(body) ? body : (body as { backups?: AvailableBackup[] })?.backups || []);
    } catch { /* silencioso */ }
  }

  async function loadAllConfigs() {
    try {
      const body = unwrap(await getAllBackupConfigs());
      setAllConfigs(Array.isArray(body) ? body : (body as { configs?: BackupConfig[] })?.configs || []);
    } catch { /* silencioso */ }
  }

  // Backend antigo não tem a rota (404): a lista fica vazia e a tela segue como antes.
  async function loadRunningBackups(): Promise<RunningBackup[]> {
    try {
      const body = unwrap(await fetchRunningBackups());
      const list = Array.isArray(body)
        ? (body as RunningBackup[])
        : (body as { running?: RunningBackup[] })?.running || [];
      setRunningBackups(list);
      return list;
    } catch {
      setRunningBackups([]);
      return [];
    }
  }

  useEffect(() => {
    load();
    loadTenants();
    loadAvailableBackups();
    loadAllConfigs();
    loadRunningBackups();
  }, []);

  // Acompanha o que está rodando em background: quando a última execução some, recarrega
  // cards e histórico — o 202 não traz resultado, então é esta ronda que fecha o ciclo.
  useEffect(() => {
    if (runningBackups.length === 0) return;
    const timer = setTimeout(async () => {
      const stillRunning = await loadRunningBackups();
      if (stillRunning.length === 0) {
        toast.success(t("backupFinished"));
        load();
        loadAvailableBackups();
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [runningBackups]); // eslint-disable-line react-hooks/exhaustive-deps

  // O interceptor rejeita com `error.response || error`: em timeout não há response, então
  // o status fica indefinido e sobra o `code` do axios. Aborto por timeout NÃO é falha de
  // backup — o servidor continua trabalhando —, e por isso não pode virar toast de erro.
  function handleBackupError(err: unknown) {
    const e = err as { status?: number; code?: string } | undefined;
    if (e?.status === 409) { toast.info(t("backupAlreadyRunning")); return; }
    if (!e?.status && (e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT")) {
      toast.info(t("backupStillRunning"));
      return;
    }
    toast.error(t("errorStartBackup"));
  }

  function handleBackupAll() {
    askConfirm(t("confirmBackupAll"), async () => {
      setRunning(true);
      try {
        await backupAllTenants();
        toast.success(t("backupAllStarted"));
        setTimeout(load, 3000);
      } catch (err) { handleBackupError(err); }
      finally { setRunning(false); loadRunningBackups(); }
    });
  }

  function handleBackupTenant() {
    if (!selectedTenant) return;
    askConfirm(t("confirmBackupTenant", { id: selectedTenant }), async () => {
      setRunningTenant(true);
      try {
        await backupTenant(Number(selectedTenant));
        toast.success(t("backupStarted"));
        setTimeout(load, 3000);
      } catch (err) { handleBackupError(err); }
      finally { setRunningTenant(false); loadRunningBackups(); }
    });
  }

  async function loadTenantConfigs(tid: string) {
    if (!tid) return;
    setLoadingTenantConfig(true);
    try {
      const body = unwrap(await getBackupConfigs(Number(tid)));
      setTenantConfigs(Array.isArray(body) ? body : (body as { configs?: BackupConfig[] })?.configs || []);
    } catch { /* silencioso */ }
    finally { setLoadingTenantConfig(false); }
  }

  function openNewConfig() {
    setEditingConfigId(null);
    setConfigStorageType("local");
    setConfigRetentionDays(30);
    setConfigCompression(true);
    setConfigDescription("");
    setConfigLocalPath(tenantConfigs[0]?.localPath || "");
    setConfigTab("storage");
    setShowConfigForm(true);
  }

  function openEditConfig(cfg: BackupConfig) {
    setEditingConfigId(cfg.id ?? null);
    setConfigStorageType(cfg.storageType || "local");
    setConfigRetentionDays(cfg.retentionDays ?? 30);
    setConfigCompression(cfg.compression ?? true);
    setConfigDescription(cfg.description || "");
    setConfigLocalPath(cfg.localPath || "");
    setConfigTab("storage");
    setShowConfigForm(true);
  }

  async function handleSaveConfig() {
    if (!configTenant) { toast.error(t("selectTenant")); return; }
    setSavingConfig(true);
    try {
      await configureBackupForTenant(Number(configTenant), {
        storageType: configStorageType,
        retentionDays: configRetentionDays,
        compression: configCompression,
        description: configDescription,
      });
      toast.success(t("configSaved"));
      setShowConfigForm(false);
      setEditingConfigId(null);
      loadTenantConfigs(configTenant);
      loadAllConfigs();
    } catch { toast.error(t("errorSaveConfig")); }
    finally { setSavingConfig(false); }
  }

  function handleDeleteConfig(id: number) {
    askConfirm(t("confirmDeleteConfig"), async () => {
      try {
        await deleteBackupConfig(id);
        toast.success(t("configDeleted"));
        loadTenantConfigs(configTenant);
        loadAllConfigs();
      } catch { toast.error(t("errorDelete")); }
    }, true);
  }

  async function handleRecreateConfig(tenantId: number) {
    try {
      await recreateBackupConfig(tenantId);
      toast.success(t("defaultConfigRecreated"));
      if (configTenant === tenantId.toString()) loadTenantConfigs(configTenant);
      loadAllConfigs();
    } catch { toast.error(t("errorRecreateConfig")); }
  }

  function handleCleanup() {
    if (!cleanupTenant) return;
    askConfirm(t("confirmCleanupTenant", { id: cleanupTenant }), async () => {
      setRunningCleanup(true);
      try {
        await cleanOldBackups(Number(cleanupTenant));
        toast.success(t("cleanupStarted"));
      } catch { toast.error(t("errorCleanup")); }
      finally { setRunningCleanup(false); }
    }, true);
  }

  function handleCleanupAll() {
    askConfirm(t("confirmCleanupAll"), async () => {
      setRunningCleanupAll(true);
      try {
        await cleanAllBackups();
        toast.success(t("cleanupAllStarted"));
      } catch { toast.error(t("errorCleanup")); }
      finally { setRunningCleanupAll(false); }
    }, true);
  }

  async function handleDownloadBackup(backup: AvailableBackup) {
    const key = backup.backupPath || "";
    if (!key || !backup.tenantId) return;
    setDownloadingBackup(key);
    const toastId = toast.loading(t("downloadBackupFile") + "...");
    try {
      const response = await downloadBackupFile(backup.tenantId, key);
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backup.backupName || key.split("/").pop() || "backup.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(t("backupDownloaded"), { id: toastId });
    } catch {
      toast.error(t("errorDownloadingBackup"), { id: toastId });
    } finally {
      setDownloadingBackup(null);
    }
  }

  function handleDeleteBackupFile(backup: AvailableBackup) {
    const key = backup.backupPath || "";
    if (!key || !backup.tenantId) return;
    const tenantId = backup.tenantId;
    askConfirm(t("confirmDeleteBackup"), async () => {
      setDeletingBackup(key);
      try {
        await deleteBackupFile(tenantId, key);
        toast.success(t("backupFileDeleted"));
        loadAvailableBackups();
      } catch {
        toast.error(t("errorDeletingBackup"));
      } finally {
        setDeletingBackup(null);
      }
    }, true);
  }

  const tenantName = (id?: number) => tenants.find((t) => t.id === id)?.name || `#${id}`;
  const filteredConfigs = allConfigs.filter((c) =>
    !configSearch || tenantName(c.tenantId).toLowerCase().includes(configSearch.toLowerCase())
  );

  return (
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { load(); loadAvailableBackups(); loadAllConfigs(); loadRunningBackups(); }} title={t("refresh")}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("refresh")}</span>
          </Button>
          <Button variant="outline" size="sm" disabled={loadingStatus} onClick={handleUpdateStatus} title={t("updateStatus")}>
            {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <RefreshCw className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">{t("updateStatus")}</span>
          </Button>
          <Button size="sm" disabled={running || hasRunningAll} onClick={handleBackupAll} title={t("generalBackup")}>
            {running || hasRunningAll ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Play className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">{t("generalBackup")}</span>
          </Button>
        </div>
      </PageHeader>

      {runningBackups.length > 0 && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            <span className="font-medium">{t("backupInProgress")}</span>
            {": "}
            {runningBackups
              .map((r) => (r.scope === "all" ? t("backupInProgressAll") : r.tenantName || `#${r.tenantId}`))
              .join(", ")}
            <span className="block text-xs text-muted-foreground">{t("backupInProgressDesc")}</span>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4 flex items-center gap-3"><Database className="h-8 w-8 text-primary opacity-80" /><div><p className="text-2xl font-bold">{stats.totalBackups ?? 0}</p><p className="text-xs text-muted-foreground">{t("totalBackups")}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3"><HardDrive className="h-8 w-8 text-primary opacity-80" /><div><p className="text-2xl font-bold">{formatBytes(stats.totalSize)}</p><p className="text-xs text-muted-foreground">{t("totalSize")}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3"><CheckCircle className="h-8 w-8 text-emerald-500 opacity-80" /><div><p className="text-sm font-bold">{fmt(stats.lastBackup)}</p><p className="text-xs text-muted-foreground">{t("lastBackup")}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3"><Users className="h-8 w-8 text-amber-500 opacity-80" /><div><p className="text-2xl font-bold">{stats.processedTenants ?? results.length}</p><p className="text-xs text-muted-foreground">{t("processedTenants")}</p></div></CardContent></Card>
        </div>
      )}

      {/* Backup folder path */}
      {!loading && stats.backupBasePath && (
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-primary opacity-80 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">{t("backupFolderPath")}</p>
              <p className="text-xs font-mono truncate" title={stats.backupBasePath}>{stats.backupBasePath}</p>
              {typeof stats.fsBackupsCount === "number" && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("fsBackupsCountLabel", { count: stats.fsBackupsCount, size: formatBytes(stats.fsTotalSize) })}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              title={t("copyPath")}
              onClick={() => {
                if (stats.backupBasePath) {
                  navigator.clipboard.writeText(stats.backupBasePath).then(
                    () => toast.success(t("pathCopied")),
                    () => toast.error(t("copyError"))
                  );
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Informações de modelos do banco */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{t("databaseModelsInfo")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowModelsInfo(!showModelsInfo)}>
              {showModelsInfo ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {showModelsInfo ? t("hideDetails") : t("showDetails")}
            </Button>
          </div>
        </CardHeader>
        {showModelsInfo && (
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2">{t("includedModels")} ({INCLUDED_MODELS.length})</p>
                <div className="flex flex-wrap gap-1">
                  {INCLUDED_MODELS.map((m) => (
                    <Badge key={m} variant="outline" className="text-xs border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">{m}</Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-4">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">{t("excludedModels")} ({EXCLUDED_MODELS.length})</p>
                <div className="flex flex-wrap gap-1">
                  {EXCLUDED_MODELS.map((m) => (
                    <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Backup Individual */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("backupByTenant")}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedTenant} onValueChange={setSelectedTenant}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={t("selectTenant")} /></SelectTrigger>
              <SelectContent>{tenants.map((ten) => <SelectItem key={ten.id} value={ten.id.toString()}>{ten.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button
              className="w-full sm:w-auto"
              disabled={!selectedTenant || runningTenant || isTenantRunning(selectedTenant)}
              onClick={handleBackupTenant}
            >
              {runningTenant || isTenantRunning(selectedTenant)
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Play className="mr-2 h-4 w-4" />}
              {t("doBackup")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configurações de Backup por Tenant */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("backupConfigByTenant")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Select value={configTenant} onValueChange={(v) => { setConfigTenant(v); loadTenantConfigs(v); setShowConfigForm(false); }}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={t("selectTenant")} /></SelectTrigger>
              <SelectContent>{tenants.map((ten) => <SelectItem key={ten.id} value={ten.id.toString()}>{ten.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="w-full sm:w-auto" variant="outline" disabled={!configTenant} onClick={openNewConfig}>
              {t("newConfig")}
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" disabled={!configTenant} onClick={() => handleRecreateConfig(Number(configTenant))}>
              {t("recreateDefault")}
            </Button>
          </div>

          {loadingTenantConfig && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

          {tenantConfigs.length > 0 && (
            <div className="space-y-2">
              {tenantConfigs.map((c) => (
                <div key={c.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                  <div>
                    <Badge variant={c.isActive ? "success" : "secondary"} className="mr-2">{c.isActive ? t("active") : t("inactive")}</Badge>
                    <span className="text-sm font-medium">{(c.storageType || "local").toUpperCase()}</span>
                    {c.description && <span className="text-xs text-muted-foreground ml-2">— {c.description}</span>}
                    <p className="text-xs text-muted-foreground">{t("createdAt")} {fmt(c.createdAt)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditConfig(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => c.id && handleDeleteConfig(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showConfigForm && (
            <div className="border rounded-lg p-4 space-y-4">
              <p className="text-sm font-semibold">
                {editingConfigId ? t("editConfiguration") : t("newConfiguration")}
              </p>
              <Tabs value={configTab} onValueChange={setConfigTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="storage" className="flex-1">{t("storageTab")}</TabsTrigger>
                  <TabsTrigger value="general" className="flex-1">{t("generalTab")}</TabsTrigger>
                </TabsList>

                <TabsContent value="storage" className="space-y-3 pt-3">
                  <div className="space-y-1.5">
                    <Label>{t("storageType")}</Label>
                    <Select value={configStorageType} onValueChange={setConfigStorageType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">{t("local")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {configStorageType === "local" && (
                    <div className="space-y-1.5">
                      <Label>{t("storagePath")}</Label>
                      <Input
                        value={configLocalPath || t("storagePathServerDefault")}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">{t("storagePathNote")}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="general" className="space-y-4 pt-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("retentionDays")}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={configRetentionDays}
                        onChange={(e) => setConfigRetentionDays(Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-6">
                      <Switch checked={configCompression} onCheckedChange={setConfigCompression} />
                      <Label>{t("compression")}</Label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("configDescription")}</Label>
                    <Input
                      value={configDescription}
                      onChange={(e) => setConfigDescription(e.target.value)}
                      placeholder={t("configDescription")}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-2">
                <Button size="sm" disabled={savingConfig} onClick={handleSaveConfig}>
                  {savingConfig ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                  {t("save")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowConfigForm(false); setEditingConfigId(null); }}>{t("cancel")}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configurações de Todos os Tenants */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{t("allTenantsConfig")}</CardTitle>
            <Button variant="outline" size="sm" onClick={loadAllConfigs}><RefreshCw className="mr-2 h-4 w-4" />{t("refresh")}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder={t("searchTenant")} value={configSearch} onChange={(e) => setConfigSearch(e.target.value)} className="max-w-sm" />
          {filteredConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noConfigFound")}</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tenant</TableHead><TableHead>{t("type")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("createdAt")}</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {filteredConfigs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{tenantName(c.tenantId)}</TableCell>
                    <TableCell><Badge variant="secondary">{(c.storageType || "—").toUpperCase()}</Badge></TableCell>
                    <TableCell><Badge variant={c.isActive ? "success" : "secondary"}>{c.isActive ? t("active") : t("inactive")}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmt(c.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" title={t("editConfig")} onClick={() => { setConfigTenant(c.tenantId?.toString() || ""); openEditConfig(c); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => c.tenantId && handleRecreateConfig(c.tenantId)}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => c.id && handleDeleteConfig(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Limpeza */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("cleanOldBackups")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <Select value={cleanupTenant} onValueChange={setCleanupTenant}>
                <SelectTrigger><SelectValue placeholder={t("selectTenant")} /></SelectTrigger>
                <SelectContent>{tenants.map((ten) => <SelectItem key={ten.id} value={ten.id.toString()}>{ten.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button className="w-full" variant="outline" disabled={!cleanupTenant || runningCleanup} onClick={handleCleanup}>
                {runningCleanup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("cleanTenantBackups")}
              </Button>
            </div>
            <div className="space-y-3">
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{t("cleanAllWarning")}</AlertDescription>
              </Alert>
              <Button className="w-full" variant="destructive" disabled={runningCleanupAll} onClick={handleCleanupAll}>
                {runningCleanupAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("cleanAllTenants")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resultados de Backups */}
      {results.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("backupResults")}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tenant</TableHead><TableHead>{t("status")}</TableHead>
                <TableHead>{t("database")}</TableHead><TableHead>{t("files")}</TableHead>
                <TableHead>{t("size")}</TableHead><TableHead>{t("date")}</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {results.slice(0, 50).map((r, i) => (
                  <TableRow key={r.id ?? i}>
                    <TableCell>{r.tenantName || tenantName(r.tenantId)}</TableCell>
                    <TableCell>
                      {r.databaseSuccess && r.filesSuccess
                        ? <Badge variant="success"><CheckCircle className="mr-1 h-3 w-3" />OK</Badge>
                        : <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />{t("failed")}</Badge>}
                    </TableCell>
                    <TableCell><Badge variant={r.databaseSuccess ? "success" : "destructive"} className="text-xs">{r.databaseSuccess ? "OK" : t("failed")}</Badge></TableCell>
                    <TableCell><Badge variant={r.filesSuccess ? "success" : "destructive"} className="text-xs">{r.filesSuccess ? "OK" : t("failed")}</Badge></TableCell>
                    <TableCell>{formatBytes(r.totalSize)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmt(r.createdAt)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedDetail(r); setDetailOpen(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Backups Disponíveis */}
      {availableBackups.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("availableBackups")}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tenant</TableHead><TableHead>{t("name")}</TableHead>
                <TableHead>{t("size")}</TableHead><TableHead>{t("date")}</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {availableBackups.map((b, i) => {
                  const key = b.backupPath || String(i);
                  return (
                    <TableRow key={i}>
                      <TableCell>{b.tenantName || tenantName(b.tenantId)}</TableCell>
                      <TableCell className="font-mono text-xs">{b.backupName || b.backupPath || "—"}</TableCell>
                      <TableCell>{formatBytes(b.size)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmt(b.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="icon"
                            title={t("copyPath")}
                            onClick={() => {
                              if (b.backupPath) {
                                navigator.clipboard.writeText(b.backupPath).then(
                                  () => toast.success(t("pathCopied")),
                                  () => toast.error(t("copyError"))
                                );
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            disabled={downloadingBackup === key}
                            title={t("downloadBackupFile")}
                            onClick={() => handleDownloadBackup(b)}
                          >
                            {downloadingBackup === key
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Download className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive"
                            disabled={deletingBackup === key}
                            title={t("deleteBackupFile")}
                            onClick={() => handleDeleteBackupFile(b)}
                          >
                            {deletingBackup === key
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detalhes dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("backupDetails")}</DialogTitle>
            <DialogDescription>{t("backupDetailsDescription")}</DialogDescription>
          </DialogHeader>
          {selectedDetail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><span className="font-semibold">Tenant:</span> {selectedDetail.tenantName || tenantName(selectedDetail.tenantId)}</div>
                <div><span className="font-semibold">{t("date")}:</span> {fmt(selectedDetail.createdAt)}</div>
                <div className="flex items-center gap-2"><span className="font-semibold">{t("database")}:</span> <Badge variant={selectedDetail.databaseSuccess ? "success" : "destructive"}>{selectedDetail.databaseSuccess ? t("success") : t("failed")}</Badge></div>
                <div className="flex items-center gap-2"><span className="font-semibold">{t("files")}:</span> <Badge variant={selectedDetail.filesSuccess ? "success" : "destructive"}>{selectedDetail.filesSuccess ? t("success") : t("failed")}</Badge></div>
                <div><span className="font-semibold">{t("databaseSize")}:</span> {formatBytes(selectedDetail.databaseSize)}</div>
                <div><span className="font-semibold">{t("filesSize")}:</span> {formatBytes(selectedDetail.filesSize)}</div>
                <div><span className="font-semibold">{t("totalSize")}:</span> {formatBytes(selectedDetail.totalSize)}</div>
              </div>
              {(selectedDetail.databaseError || selectedDetail.filesError) && (
                <div className="space-y-1">
                  <p className="font-semibold text-destructive">{t("errors")}</p>
                  {selectedDetail.databaseError && <p className="text-xs font-mono text-destructive">{selectedDetail.databaseError}</p>}
                  {selectedDetail.filesError && <p className="text-xs font-mono text-destructive">{selectedDetail.filesError}</p>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação (AlertDialog) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon("confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{confirmData?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={confirmData?.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
              onClick={() => confirmData?.action()}
            >
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
