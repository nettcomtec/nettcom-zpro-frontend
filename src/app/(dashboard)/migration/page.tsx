"use client";

import { formatDateTime, formatNumber } from "@/lib/format";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertTriangle, Play, Save, RotateCcw, RefreshCw, Eye, Loader2, ShieldAlert, History, Info, Wrench,
  Unplug, Megaphone, MailX, Users, SkipForward, CheckCircle2, XCircle, PauseCircle, Mail, UserCog,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { migrateTenant, listMigrations, getMigrationProgress, resumeMigration, listMigrationLogs } from "@/services/superadmin";
import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { getBackendErrorCode } from "@/lib/backend-error-code";
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
  /** JSON em texto (sem senha). Migração "só de banco" grava "{}". */
  sshConfig?: string | { host?: string } | null;
}

/** A migração tinha SSH configurado (só então o retomar pede senha/chave SSH). */
function migrationHasSsh(m: Migration): boolean {
  const raw = m.sshConfig;
  if (!raw) return false;
  if (typeof raw === "object") return Boolean(raw.host);
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object" && parsed.host);
  } catch {
    return false;
  }
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

// ---------------------------------------------------------------------------
// Histórico da migração (docs/PLANO_MIGRACAO_TENANT_HISTORICO.md §5.5)
// `GET /admin/migrations/:id/history-state` é a fonte da tela; fica em estado PRÓPRIO,
// nunca dentro do `selected` (que é trocado pela resposta de getMigrationProgress).
// ---------------------------------------------------------------------------

type RepairMode = "source" | "local";
type RepairStatus = "running" | "completed" | "failed" | "interrupted";

interface HistoryStats {
  unsentPending?: number;
  renamedEmails?: string[];
  demotedSuperadmins?: string[];
  disabledChannels?: number;
  pausedCampaigns?: number;
  mergedContacts?: number;
  uuidConflicts?: number;
  skipped?: Record<string, number>;
}

interface HistoryRepair {
  status?: RepairStatus;
  mode?: RepairMode;
  startedAt?: string | null;
  finishedAt?: string | null;
  counts?: { messages?: number; tickets?: number; contacts?: number; quotes?: number; ticketRefs?: number; history?: number };
  skipped?: Record<string, number>;
  errorCode?: string | null;
}

interface HistoryState {
  engine: number | null;
  phase: string | null;
  stats: HistoryStats;
  repair: HistoryRepair | null;
  leaseAlive: boolean;
  repairLeaseAlive: boolean;
}

type HistoryLoad =
  | { kind: "idle" }
  | { kind: "loading"; migrationId: number }
  | { kind: "ready"; migrationId: number; state: HistoryState }
  // 404 = backend sem a rota; 409 ERR_MIGRATION_ID_MAPS_UNAVAILABLE = tabelas ainda não criadas
  | { kind: "unavailable"; migrationId: number; reason: "notSupported" | "mapsUnavailable" }
  | { kind: "error"; migrationId: number };

/** Prazo do POST do reparo: o teste de conexão com a origem leva até ~10 s antes do 202. */
const REPAIR_REQUEST_TIMEOUT_MS = 45000;
/** Depois do 202, quanto tempo a tela espera o reparo aparecer como "em andamento". */
const REPAIR_KICKOFF_WINDOW_MS = 30000;

/** Código de erro do backend → chave de `migrationPage`. */
const MIGRATION_ERROR_KEYS: Record<string, string> = {
  ERR_MIGRATION_RUNNING: "errMigrationRunning",
  ERR_MIGRATION_REPAIR_RUNNING: "errRepairRunning",
  ERR_MIGRATION_NOT_COMPLETED: "errRepairNotCompleted",
  ERR_MIGRATION_NO_DB_PHASE: "errRepairNoDbPhase",
  ERR_MIGRATION_REPAIR_PASSWORD_REQUIRED: "errRepairPassword",
  ERR_MIGRATION_SOURCE_UNREACHABLE: "errRepairSourceUnreachable",
  ERR_MIGRATION_REPAIR_DISABLED: "errRepairDisabled",
  ERR_MIGRATION_HISTORY_ALREADY_PRESERVED: "errRepairAlreadyPreserved",
  ERR_MIGRATION_ID_MAPS_UNAVAILABLE: "errRepairMapsUnavailable",
  ERR_MIGRATION_TARGET_PREEXISTING: "errRepairTargetPreexisting",
  ERR_MIGRATION_SOURCE_TENANT_NOT_FOUND: "errRepairSourceTenantNotFound",
  ERR_MIGRATION_REPAIR_NOTHING_MATCHED: "errRepairNothingMatched",
  ERR_MIGRATION_REPAIR_OTHER_MIGRATION: "errRepairOtherMigration",
};

/** O interceptor rejeita com o response (status na raiz) ou com o AxiosError. */
function httpStatusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; response?: { status?: unknown } | null } | null;
  const s = e?.status ?? e?.response?.status;
  return typeof s === "number" ? s : undefined;
}

const toCount = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

const toStringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

const sumCounts = (v: unknown): number =>
  v && typeof v === "object" ? Object.values(v as Record<string, unknown>).reduce<number>((acc, n) => acc + toCount(n), 0) : 0;

function normalizeHistoryState(data: unknown): HistoryState {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rawStats = (d.stats && typeof d.stats === "object" ? d.stats : {}) as Record<string, unknown>;
  const rawRepair = d.repair && typeof d.repair === "object" ? (d.repair as Record<string, unknown>) : null;
  const engine = Number(d.engine);
  return {
    engine: Number.isFinite(engine) && d.engine !== null && d.engine !== undefined ? engine : null,
    phase: typeof d.phase === "string" ? d.phase : null,
    stats: {
      ...(rawStats as HistoryStats),
      renamedEmails: toStringList(rawStats.renamedEmails),
      demotedSuperadmins: toStringList(rawStats.demotedSuperadmins),
    },
    repair: rawRepair ? (rawRepair as HistoryRepair) : null,
    leaseAlive: d.leaseAlive === true,
    repairLeaseAlive: d.repairLeaseAlive === true,
  };
}

async function fetchHistoryState(migrationId: number): Promise<HistoryLoad> {
  try {
    const { data } = await api.get(`/admin/migrations/${migrationId}/history-state`, BACKGROUND_REQUEST);
    return { kind: "ready", migrationId, state: normalizeHistoryState(data) };
  } catch (err) {
    const code = getBackendErrorCode(err);
    if (code === "ERR_MIGRATION_ID_MAPS_UNAVAILABLE") {
      return { kind: "unavailable", migrationId, reason: "mapsUnavailable" };
    }
    if (httpStatusOf(err) === 404) {
      // Rota inexistente (backend antigo) responde sem corpo de erro. 404 COM código vem
      // da rota nova (migração sem linha de estado): vale como "sem estado gravado".
      return code
        ? { kind: "ready", migrationId, state: normalizeHistoryState(null) }
        : { kind: "unavailable", migrationId, reason: "notSupported" };
    }
    return { kind: "error", migrationId };
  }
}

/** Ícone "i" que abre uma explicação curta. Popover (e não Tooltip) para abrir também no toque. */
function HelpPopover({ label, children, align = "start" }: { label: string; children: React.ReactNode; align?: "start" | "center" | "end" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(20rem,calc(100vw-2rem))] text-xs leading-relaxed space-y-2">
        {children}
      </PopoverContent>
    </Popover>
  );
}

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

  // Histórico da migração aberta no detalhe: estado PRÓPRIO (nunca dentro do `selected`).
  const [historyLoad, setHistoryLoadState] = useState<HistoryLoad>({ kind: "idle" });
  const historyLoadRef = useRef<HistoryLoad>({ kind: "idle" });
  const openMigrationIdRef = useRef<number | null>(null);
  const migrationsRef = useRef<Migration[]>([]);
  const selectedRef = useRef<Migration | null>(null);
  const listInFlightRef = useRef(false);
  const historyInFlightRef = useRef(false);
  const detailInFlightRef = useRef(false);
  // Depois do 202 o reparo começa em segundo plano: até ele aparecer no estado, a tela
  // mantém "em andamento" (comparando com o reparo que havia antes de iniciar).
  const repairKickoffRef = useRef<{ migrationId: number; until: number; baseline: string; mode: RepairMode } | null>(null);

  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [repairMode, setRepairMode] = useState<RepairMode>("source");
  const [repairPassword, setRepairPassword] = useState("");
  const [repairSubmitting, setRepairSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTickRef = useRef<() => void>(() => {});

  useEffect(() => { migrationsRef.current = migrations; }, [migrations]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  /** Código do backend → texto da tela; código desconhecido cai no texto genérico. */
  const errorText = (err: unknown, fallbackKey: string): string => {
    const code = getBackendErrorCode(err);
    const key = MIGRATION_ERROR_KEYS[code];
    if (key) return t(key);
    if (!code || /^ERR_[A-Z0-9_]+$/.test(code)) return t(fallbackKey);
    return code;
  };

  function applyHistoryLoad(next: HistoryLoad, opts: { background?: boolean } = {}) {
    if (next.kind !== "idle" && openMigrationIdRef.current !== next.migrationId) return;
    const prev = historyLoadRef.current;
    // No polling, uma falha passageira não apaga o último estado bom.
    if (opts.background && next.kind === "error" && prev.kind === "ready" && prev.migrationId === next.migrationId) return;

    let finalNext = next;
    let quietTransition = false;
    const kick = repairKickoffRef.current;
    if (next.kind === "ready" && kick && kick.migrationId === next.migrationId) {
      const unchanged = JSON.stringify(next.state.repair ?? null) === kick.baseline;
      if (unchanged && Date.now() <= kick.until) {
        finalNext = {
          ...next,
          state: { ...next.state, repair: { ...(next.state.repair ?? {}), status: "running", mode: kick.mode, errorCode: null } },
        };
      } else {
        // Prazo vencido sem o reparo aparecer: volta ao estado real sem anunciar fim.
        quietTransition = unchanged;
        repairKickoffRef.current = null;
      }
    }

    if (
      !quietTransition &&
      prev.kind === "ready" && finalNext.kind === "ready" &&
      prev.migrationId === finalNext.migrationId &&
      prev.state.repair?.status === "running"
    ) {
      const st = finalNext.state.repair?.status;
      if (st === "completed") toast.success(t("repairCompleted"));
      else if (st === "failed") toast.error(t("repairFailed"));
      else if (st === "interrupted") toast.warning(t("repairInterrupted"));
    }

    historyLoadRef.current = finalNext;
    setHistoryLoadState(finalNext);
  }

  async function loadHistoryState(migrationId: number, opts: { background?: boolean } = {}) {
    if (opts.background && historyInFlightRef.current) return;
    historyInFlightRef.current = true;
    if (!opts.background) applyHistoryLoad({ kind: "loading", migrationId });
    try {
      applyHistoryLoad(await fetchHistoryState(migrationId), opts);
    } finally {
      historyInFlightRef.current = false;
    }
  }

  /** Atualiza o detalhe aberto (só durante execução viva da migração). */
  async function refreshSelected(migrationId: number) {
    if (detailInFlightRef.current) return;
    detailInFlightRef.current = true;
    try {
      const { data } = await getMigrationProgress(migrationId);
      if (data && openMigrationIdRef.current === migrationId) setSelected(data as Migration);
    } catch { /* mantém o último */ }
    finally { detailInFlightRef.current = false; }
  }

  // Polling de 5 s: lista com migração em andamento (como antes) e, na migração aberta,
  // reparo em andamento ou execução viva (posse do motor).
  pollTickRef.current = () => {
    const openId = openMigrationIdRef.current;
    const hl = historyLoadRef.current;
    const openState = hl.kind === "ready" && hl.migrationId === openId ? hl.state : null;
    const sel = selectedRef.current;
    const kick = repairKickoffRef.current;
    const runAlive = openState?.leaseAlive === true;
    const repairRunning = openState?.repair?.status === "running";
    const kickoffActive = !!kick && kick.migrationId === openId;
    const openInProgress = !!sel && sel.id === openId && sel.status === "in_progress";

    if (migrationsRef.current.some((m) => m.status === "in_progress") || runAlive) {
      void loadMigrations({ background: true });
    }
    if (openId !== null && (repairRunning || runAlive || kickoffActive || openInProgress)) {
      void loadHistoryState(openId, { background: true });
    }
    if (openId !== null && (openInProgress || runAlive)) {
      void refreshSelected(openId);
    }
  };

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
    pollRef.current = setInterval(() => pollTickRef.current(), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // `background`: atualização do polling, sem trocar a lista por "Carregando...".
  async function loadMigrations(opts: { background?: boolean } = {}) {
    if (opts.background && listInFlightRef.current) return;
    listInFlightRef.current = true;
    if (!opts.background) setLoadingList(true);
    try {
      const { data } = await listMigrations();
      setMigrations(Array.isArray(data) ? data : []);
    } catch { /* silencioso */ }
    finally {
      listInFlightRef.current = false;
      if (!opts.background) setLoadingList(false);
    }
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
      toast.error(errorText(e, "errorStartMigration"));
    }
    finally { setRunning(false); }
  }

  function handleResume(m: Migration) {
    setResumeTargetId(m.id);
    // SSH só é necessário se a migração tinha SSH e ainda houver download de arquivos pendente
    setResumeNeedsSsh(
      migrationHasSsh(m) && !(m.publicFilesCompleted && m.sessionsFilesCompleted && m.wwebjsAuthFilesCompleted)
    );
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
      toast.error(errorText(e, "errorResumeMigration"));
    }
    finally { setLoadingResume(false); }
  }

  async function handleViewDetails(m: Migration) {
    openMigrationIdRef.current = m.id;
    // Estado do histórico em paralelo ao detalhe de hoje (estado próprio).
    const historyPromise = loadHistoryState(m.id);
    let detail: Migration = m;
    try {
      const { data } = await getMigrationProgress(m.id);
      if (data) detail = data as Migration;
    } catch { /* usa a linha da lista */ }
    let detailLogs: MigrationLog[] = [];
    try {
      const { data } = await listMigrationLogs(m.id);
      detailLogs = (data as { logs?: MigrationLog[] })?.logs || [];
    } catch { detailLogs = []; }
    // Outro detalhe aberto no meio do caminho: a resposta antiga não sobrescreve.
    if (openMigrationIdRef.current !== m.id) return;
    setSelected(detail);
    setLogs(detailLogs);
    setDetailOpen(true);
    await historyPromise;
  }

  function handleDetailOpenChange(open: boolean) {
    setDetailOpen(open);
    if (!open) {
      openMigrationIdRef.current = null;
      setRepairDialogOpen(false);
      setRepairPassword("");
    }
  }

  function openRepairDialog() {
    setRepairMode("source");
    setRepairPassword("");
    setRepairDialogOpen(true);
  }

  function handleRepairDialogOpenChange(open: boolean) {
    if (repairSubmitting) return;
    setRepairDialogOpen(open);
    if (!open) setRepairPassword("");
  }

  async function handleConfirmedRepair() {
    const migrationId = openMigrationIdRef.current;
    if (migrationId === null || repairSubmitting) return;
    const mode = repairMode;
    if (mode === "source" && !repairPassword.trim()) {
      toast.error(t("errRepairPassword"));
      return;
    }
    setRepairSubmitting(true);
    try {
      await api.post(
        `/admin/migrations/${migrationId}/repair-history`,
        mode === "source" ? { mode, dbPassword: repairPassword } : { mode },
        { timeout: REPAIR_REQUEST_TIMEOUT_MS }
      );
      const hl = historyLoadRef.current;
      const current = hl.kind === "ready" && hl.migrationId === migrationId ? hl : null;
      repairKickoffRef.current = null;
      if (current) {
        applyHistoryLoad({
          ...current,
          state: { ...current.state, repair: { ...(current.state.repair ?? {}), status: "running", mode, errorCode: null } },
        });
      }
      repairKickoffRef.current = {
        migrationId,
        until: Date.now() + REPAIR_KICKOFF_WINDOW_MS,
        baseline: JSON.stringify(current?.state.repair ?? null),
        mode,
      };
      setRepairDialogOpen(false);
      setRepairPassword("");
      toast.success(t("repairStarted"));
      void loadHistoryState(migrationId, { background: true });
    } catch (err: unknown) {
      const code = getBackendErrorCode(err);
      // 404 sem corpo de erro = backend sem a rota do reparo.
      if (httpStatusOf(err) === 404 && !code) {
        toast.error(t("historyStateUnavailable"));
        setRepairDialogOpen(false);
        setRepairPassword("");
      } else {
        toast.error(errorText(err, "repairFailed"));
        // Senha ausente ou origem fora do ar: o diálogo fica aberto para corrigir ou trocar de modo.
        if (code !== "ERR_MIGRATION_SOURCE_UNREACHABLE" && code !== "ERR_MIGRATION_REPAIR_PASSWORD_REQUIRED") {
          setRepairDialogOpen(false);
          setRepairPassword("");
          void loadHistoryState(migrationId, { background: true });
        }
      }
    } finally {
      setRepairSubmitting(false);
    }
  }

  const completed = migrations.filter((m) => m.status === "completed").length;
  const inProgress = migrations.filter((m) => m.status === "in_progress").length;
  const failed = migrations.filter((m) => m.status === "failed").length;

  // ---- Histórico da migração aberta no detalhe ----
  const selectedHistory = selected && historyLoad.kind !== "idle" && historyLoad.migrationId === selected.id ? historyLoad : null;
  const historyState = selectedHistory?.kind === "ready" ? selectedHistory.state : null;
  const historyStats = historyState?.stats;
  const renamedEmails = historyStats?.renamedEmails ?? [];
  const demotedSuperadmins = historyStats?.demotedSuperadmins ?? [];
  const statItems: { key: string; icon: LucideIcon; labelKey: string; helpKey: string; count: number }[] = historyStats
    ? [
        { key: "unsent", icon: MailX, labelKey: "statUnsentPending", helpKey: "statUnsentPendingHelp", count: toCount(historyStats.unsentPending) },
        { key: "channels", icon: Unplug, labelKey: "statDisabledChannels", helpKey: "statDisabledChannelsHelp", count: toCount(historyStats.disabledChannels) },
        { key: "campaigns", icon: Megaphone, labelKey: "statPausedCampaigns", helpKey: "statPausedCampaignsHelp", count: toCount(historyStats.pausedCampaigns) },
        { key: "contacts", icon: Users, labelKey: "statMergedContacts", helpKey: "statMergedContactsHelp", count: toCount(historyStats.mergedContacts) },
        { key: "skipped", icon: SkipForward, labelKey: "statSkipped", helpKey: "statSkippedHelp", count: sumCounts(historyStats.skipped) },
      ]
    : [];
  // Migração com histórico preservado (motor novo) sempre mostra os contadores; a antiga só se houver algo.
  const showHistoryStats =
    !!historyState &&
    (historyState.engine === 2 || statItems.some((s) => s.count > 0) || renamedEmails.length > 0 || demotedSuperadmins.length > 0);
  const canRepairHistory = selected?.status === "completed" && !!historyState && historyState.engine !== 2;
  const repairState = historyState?.repair ?? null;
  const repairIsRunning = repairState?.status === "running";

  function renderRepairStatus(repair: HistoryRepair) {
    const modeBadge = repair.mode === "source" || repair.mode === "local" ? (
      <Badge variant="outline" className="text-[11px]">
        {t(repair.mode === "source" ? "repairModeSourceShort" : "repairModeLocalShort")}
      </Badge>
    ) : null;
    if (repair.status === "running") {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" />
          <span>{t("repairRunning")}</span>
          {modeBadge}
        </div>
      );
    }
    if (repair.status === "completed") {
      const counts = repair.counts ?? {};
      const skippedCount = sumCounts(repair.skipped);
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{t("repairCompleted")}</span>
            {modeBadge}
            {repair.finishedAt && <span className="text-xs text-muted-foreground">{fmt(repair.finishedAt)}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {repair.mode === "local"
              ? t("repairResultSummaryLocal", {
                  messages: formatNumber(toCount(counts.messages)),
                  tickets: formatNumber(toCount(counts.tickets)),
                })
              : t("repairResultSummary", {
                  messages: formatNumber(toCount(counts.messages)),
                  tickets: formatNumber(toCount(counts.tickets)),
                  quotes: formatNumber(toCount(counts.quotes)),
                })}
          </p>
          {skippedCount > 0 && <p className="text-xs text-muted-foreground">{t("repairSkipped", { count: skippedCount })}</p>}
        </div>
      );
    }
    if (repair.status === "failed") {
      const errorKey = repair.errorCode ? MIGRATION_ERROR_KEYS[repair.errorCode] : undefined;
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="font-medium">{t("repairFailed")}</span>
            {modeBadge}
          </div>
          {errorKey ? (
            <p className="text-xs text-muted-foreground">{t(errorKey)}</p>
          ) : repair.errorCode ? (
            <p className="text-xs text-muted-foreground">{t("errRepairGeneric")}</p>
          ) : null}
        </div>
      );
    }
    if (repair.status === "interrupted") {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <PauseCircle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>{t("repairInterrupted")}</span>
          {modeBadge}
        </div>
      );
    }
    return null;
  }

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
          <Button variant="outline" size="sm" onClick={() => loadMigrations()} title={t("refresh")}>
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

      <Alert variant="info-soft">
        <History className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-1.5">
            <p>{t("historyPreservedNote")}</p>
            <p>{t("channelsDisabledNote")}</p>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  {t("migrationRulesMore")}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] text-xs leading-relaxed">
                <p className="mb-2 text-sm font-semibold">{t("migrationRulesTitle")}</p>
                <ul className="list-disc space-y-1.5 pl-4">
                  <li>{t("migrationRuleCampaigns")}</li>
                  <li>{t("migrationRuleSuperadmin")}</li>
                  <li>{t("migrationRuleEmails")}</li>
                  <li>{t("migrationRulePending")}</li>
                  <li>{t("migrationRuleScheduled")}</li>
                </ul>
              </PopoverContent>
            </Popover>
          </div>
        </AlertDescription>
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
      <Dialog open={detailOpen} onOpenChange={handleDetailOpenChange}>
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

              {/* Histórico da migração: estado próprio (GET history-state) */}
              {selectedHistory?.kind === "loading" && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  {t("loadingMigrations")}
                </p>
              )}
              {selectedHistory?.kind === "unavailable" && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{t(selectedHistory.reason === "mapsUnavailable" ? "errRepairMapsUnavailable" : "historyStateUnavailable")}</span>
                </p>
              )}
              {selectedHistory?.kind === "error" && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("historyStateLoadError")}</span>
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => loadHistoryState(selected.id)}>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    {t("refresh")}
                  </Button>
                </div>
              )}

              {showHistoryStats && (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-semibold">{t("statsTitle")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {statItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.key} className="flex items-start gap-2 text-sm">
                          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${item.count > 0 ? "text-foreground" : "text-muted-foreground"}`} />
                          <span className={`min-w-0 flex-1 ${item.count > 0 ? "" : "text-muted-foreground"}`}>
                            {t(item.labelKey, { count: item.count })}
                          </span>
                          <HelpPopover label={t("moreInfo")} align="end">
                            <p>{t(item.helpKey)}</p>
                          </HelpPopover>
                        </div>
                      );
                    })}
                  </div>

                  {renamedEmails.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-4 w-4 shrink-0" />
                        <p className="text-sm font-semibold">{t("renamedEmailsTitle")}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("renamedEmailsDesc")}</p>
                      <ul className="max-h-40 overflow-y-auto rounded-md bg-muted/40 p-2 space-y-1 text-xs font-mono break-all">
                        {renamedEmails.map((email, i) => <li key={`${email}-${i}`}>{email}</li>)}
                      </ul>
                    </div>
                  )}

                  {demotedSuperadmins.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <UserCog className="h-4 w-4 shrink-0" />
                        <p className="text-sm font-semibold">{t("demotedSuperadminsTitle")}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("demotedSuperadminsDesc")}</p>
                      <ul className="max-h-40 overflow-y-auto rounded-md bg-muted/40 p-2 space-y-1 text-xs font-mono break-all">
                        {demotedSuperadmins.map((email, i) => <li key={`${email}-${i}`}>{email}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {canRepairHistory && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {repairState?.status ? (
                        renderRepairStatus(repairState)
                      ) : (
                        <div className="flex items-start gap-2">
                          <History className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">{t("repairHistoryTooltip")}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 sm:shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={repairIsRunning || repairSubmitting}
                        onClick={openRepairDialog}
                        title={t("repairHistoryTooltip")}
                      >
                        {repairIsRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
                        {t("repairHistory")}
                      </Button>
                      {repairState?.status && (
                        <HelpPopover label={t("moreInfo")} align="end">
                          <p>{t("repairHistoryTooltip")}</p>
                        </HelpPopover>
                      )}
                    </div>
                  </div>
                </div>
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
            <Button variant="outline" onClick={() => handleDetailOpenChange(false)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repair History Dialog (molde do diálogo de retomada) */}
      <Dialog open={repairDialogOpen} onOpenChange={handleRepairDialogOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 shrink-0" />
              {t("repairDialogTitle")}
            </DialogTitle>
            <DialogDescription>{t("repairDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <RadioGroup
              value={repairMode}
              onValueChange={(v) => setRepairMode(v === "local" ? "local" : "source")}
              className="gap-3"
              disabled={repairSubmitting}
            >
              {(["source", "local"] as const).map((mode) => (
                <div
                  key={mode}
                  className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 ${repairMode === mode ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => { if (!repairSubmitting) setRepairMode(mode); }}
                >
                  <RadioGroupItem value={mode} id={`repair-mode-${mode}`} className="mt-0.5" />
                  <label htmlFor={`repair-mode-${mode}`} className="flex-1 cursor-pointer space-y-0.5">
                    <span className="block text-sm font-medium">{t(mode === "source" ? "repairModeSource" : "repairModeLocal")}</span>
                    <span className="block text-xs text-muted-foreground">{t(mode === "source" ? "repairModeSourceDesc" : "repairModeLocalDesc")}</span>
                  </label>
                </div>
              ))}
            </RadioGroup>
            {repairMode === "source" && (
              <div className="space-y-1.5">
                <Label htmlFor="repair-db-password">{t("repairPasswordLabel")}</Label>
                <Input
                  id="repair-db-password"
                  type="password"
                  autoComplete="new-password"
                  value={repairPassword}
                  disabled={repairSubmitting}
                  onChange={(e) => setRepairPassword(e.target.value)}
                  placeholder={t("resumeDbPasswordPlaceholder")}
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmedRepair()}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={repairSubmitting} onClick={() => handleRepairDialogOpenChange(false)}>{t("close")}</Button>
            <Button
              onClick={handleConfirmedRepair}
              disabled={repairSubmitting || (repairMode === "source" && !repairPassword.trim())}
            >
              {repairSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
              {t("repairStart")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
