"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, AppWindow, ArrowDown, ArrowUp, Info, KeyRound, Loader2, Pencil, Plus, RotateCw, ShieldCheck,
  Trash2, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { AccessDenied } from "@/components/layout/access-denied";
import { useAuthStore } from "@/stores/auth-store";
import { usePanelAppsStore } from "@/stores/panel-apps-store";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { cn } from "@/lib/utils";
import {
  MAX_GLOBAL_APPS,
  PANEL_APP_PROFILES,
  findTemplateVariables,
  getPanelAppIcon,
  type GlobalPanelAppItem,
  type PanelAppRef,
} from "@/lib/panel-apps";
import {
  deleteGlobalPanelApp,
  fetchGlobalPanelAppsManage,
  moveGlobalPanelApp,
  fetchAllPlansForTarget,
} from "@/services/panel-apps";
import { fetchAllTenants } from "@/services/superadmin";
import {
  PanelAppFormDialog,
  panelAppCanonicalCategory,
  panelAppErrorKey,
  panelAppProfileLabelKey,
  type PanelAppSavedResult,
} from "@/components/panel-apps/panel-app-form-dialog";

/**
 * Aplicativos globais do superadmin (`/aplicativos-globais`, D7/D8/D18, §5.5).
 * Alvo por OU (todas as empresas, empresas e/ou planos), perfis base que veem dentro
 * da empresa e "mostrar no meu menu". O admin de cada empresa pode ocultar a app.
 * Gate: só superadmin (o backend confere token E banco).
 *
 * Fase 2 (docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md §5.9, D4): app global abre só pelo
 * menu (sem selo de lugar) e pode levar a ficha assinada de quem abre; a lista traz o eco
 * `launch` (`fetchGlobalPanelAppsManage`, liga a fase na sessão) e os selos da chave.
 */

/** Aviso que fica na tela depois de uma gravação que criou ou trocou a chave da ficha. */
type KeyNotice = { id: number; name: string; kind: "created" | "rotated" };

export default function GlobalPanelAppsPage() {
  const profile = useAuthStore((s) => s.user?.profile);
  if (profile !== "superadmin") return <AccessDenied />;
  return <GlobalPanelAppsContent />;
}

const NAMES_IN_DETAIL = 15;

const toRefs = (list: unknown): PanelAppRef[] => {
  if (!Array.isArray(list)) return [];
  const out: PanelAppRef[] = [];
  for (const row of list) {
    const id = Number((row as { id?: unknown })?.id);
    const name = (row as { name?: unknown })?.name;
    if (Number.isInteger(id) && id > 0) out.push({ id, name: typeof name === "string" && name ? name : `#${id}` });
  }
  return out;
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

function GlobalPanelAppsContent() {
  const t = useTranslations("panelAppsGlobalPage");
  const tp = useTranslations("panelAppsPage");
  const tf = useTranslations("panelAppForm");
  // Fase 2 ligada no servidor (eco visto na sessão): ajuda da página com a ficha assinada.
  const launchSupported = usePanelAppsStore((s) => s.launchSupported);

  const [apps, setApps] = useState<GlobalPanelAppItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // Empresas e planos: nomes no resumo do alvo e opções do formulário
  const [tenants, setTenants] = useState<PanelAppRef[] | undefined>(undefined);
  const [plans, setPlans] = useState<PanelAppRef[] | undefined>(undefined);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GlobalPanelAppItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalPanelAppItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [keyNotice, setKeyNotice] = useState<KeyNotice | null>(null);

  const loadSeqRef = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++loadSeqRef.current;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetchGlobalPanelAppsManage();
        if (seq !== loadSeqRef.current) return;
        hasDataRef.current = true;
        setApps(res.apps);
        // O eco da gestão também liga a fase 2 na sessão (variáveis e ficha no cadastro).
        usePanelAppsStore.getState().noteLaunchEcho(res.launch);
        setLoadErrorKey(null);
        setDenied(false);
      } catch (err: unknown) {
        if (seq !== loadSeqRef.current) return;
        if (getBackendErrorCode(err) === "ERR_NO_PERMISSION") {
          setDenied(true);
          return;
        }
        const key = panelAppErrorKey(err, "errors.loadFailed") ?? "errors.loadFailed";
        if (opts?.silent && hasDataRef.current) toast.error(tp(key));
        else setLoadErrorKey(key);
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [tp]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchAllTenants()
      .then(({ data }) => {
        if (!cancelled) setTenants(toRefs(Array.isArray(data) ? data : data?.tenants));
      })
      .catch(() => {
        if (!cancelled) setTenants([]);
      });
    fetchAllPlansForTarget()
      .then((list) => {
        if (!cancelled) setPlans(toRefs(list));
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tenantNames = useMemo(() => new Map((tenants || []).map((r) => [r.id, r.name])), [tenants]);
  const planNames = useMemo(() => new Map((plans || []).map((r) => [r.id, r.name])), [plans]);

  const afterChange = async () => {
    await load({ silent: true });
    // "Mostrar no meu menu": o menu do superadmin muda na hora
    void usePanelAppsStore.getState().fetch({ force: true });
  };

  const list = apps ?? [];
  const atLimit = list.length >= MAX_GLOBAL_APPS;

  const openCreate = () => {
    if (atLimit) return;
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (app: GlobalPanelAppItem) => {
    setEditing(app);
    setDialogOpen(true);
  };

  /** Depois de salvar: chave da ficha criada ou trocada nesta gravação vira aviso na tela. */
  const handleSaved = async (result?: PanelAppSavedResult) => {
    const app = result?.app;
    const keyEvent = result?.keyEvent;
    if (app && keyEvent) setKeyNotice({ id: app.id, name: app.name, kind: keyEvent });
    await afterChange();
  };

  const openKeyNotice = () => {
    if (!keyNotice) return;
    const target = list.find((a) => a.id === keyNotice.id);
    setKeyNotice(null);
    if (target) openEdit(target);
  };

  const handleMove = async (app: GlobalPanelAppItem, direction: "up" | "down") => {
    if (movingId !== null) return;
    setMovingId(app.id);
    try {
      await moveGlobalPanelApp(app.id, direction);
      await afterChange();
    } catch (err: unknown) {
      const key = panelAppErrorKey(err, "errors.moveFailed");
      if (key) toast.error(tp(key));
    } finally {
      setMovingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const deletedId = deleteTarget.id;
      await deleteGlobalPanelApp(deletedId);
      toast.success(tp("deleted"));
      setDeleteTarget(null);
      setKeyNotice((n) => (n && n.id === deletedId ? null : n));
      await afterChange();
    } catch (err: unknown) {
      const key = panelAppErrorKey(err, "errors.deleteFailed");
      if (key) toast.error(tp(key));
      if (getBackendErrorCode(err) === "ERR_PANEL_APP_NOT_FOUND") {
        setDeleteTarget(null);
        await load({ silent: true });
      }
    } finally {
      setDeleting(false);
    }
  };

  const namesFrom = (ids: number[], names: Map<number, string>): string => {
    const all = ids.map((id) => names.get(id) ?? `#${id}`);
    const shown = all.slice(0, NAMES_IN_DETAIL).join(", ");
    const rest = all.length - NAMES_IN_DETAIL;
    return rest > 0 ? `${shown} ${tp("andMore", { count: rest })}` : shown;
  };

  const targetSummary = (app: GlobalPanelAppItem): string => {
    if (app.allTenants) return t("targetAll");
    const parts: string[] = [];
    const tenantCount = app.targetTenantIds?.length ?? 0;
    const planCount = app.targetPlanIds?.length ?? 0;
    if (tenantCount > 0) parts.push(t("targetTenantsCount", { count: tenantCount }));
    if (planCount > 0) parts.push(t("targetPlansCount", { count: planCount }));
    return parts.length > 0 ? parts.join(" · ") : t("targetNone");
  };

  const targetDetail = (app: GlobalPanelAppItem): string[] => {
    if (app.allTenants) return [t("targetAllDetail")];
    const lines: string[] = [];
    if (app.targetTenantIds?.length) lines.push(`${tf("targetTenants")}: ${namesFrom(app.targetTenantIds, tenantNames)}`);
    if (app.targetPlanIds?.length) lines.push(`${tf("targetPlans")}: ${namesFrom(app.targetPlanIds, planNames)}`);
    return lines.length > 0 ? lines : [t("targetNoneDetail")];
  };

  const profilesLabel = (app: GlobalPanelAppItem): string => {
    const labels = PANEL_APP_PROFILES.filter((p) => (app.profiles || []).includes(p)).map((p) =>
      tf(panelAppProfileLabelKey(p))
    );
    return labels.length > 0 ? labels.join(", ") : t("profilesNone");
  };

  const hasTarget = (app: GlobalPanelAppItem) =>
    app.allTenants || (app.targetTenantIds?.length ?? 0) > 0 || (app.targetPlanIds?.length ?? 0) > 0;

  const categoryLabel = (category: string) => tf(`categories.${panelAppCanonicalCategory(category)}`);
  const modeLabel = (mode: string) => (mode === "new_tab" ? tf("modeNewTab") : tf("modeEmbed"));

  // Mesmo `help` em todos os estados. A seção da ficha só aparece com a fase 2 ligada.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2"), t("helpS0I3")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
      ...(launchSupported ? [{ title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1"), t("helpS3I2")] }] : []),
      { title: tp("helpS2T"), items: [tp("helpS2I0"), tp("helpS2I1"), tp("helpS2I2"), tp("helpS2I3")] },
    ],
  };

  const newAppButton = atLimit ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          <Button disabled className="gap-1.5">
            <Plus className="h-4 w-4" />
            {tp("newApp")}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tp("limitReached", { max: MAX_GLOBAL_APPS })}</TooltipContent>
    </Tooltip>
  ) : (
    <Button onClick={openCreate} className="gap-1.5">
      <Plus className="h-4 w-4" />
      {tp("newApp")}
    </Button>
  );

  const embedBadge = (app: GlobalPanelAppItem) => {
    if (app.openMode !== "embed" || app.embedCheck === "ok") return null;
    const blocked = app.embedCheck === "blocked";
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <Badge variant={blocked ? "warning-soft" : "secondary"} className="gap-1 whitespace-nowrap">
              {blocked ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
              {blocked ? tp("badgeBlocked") : tp("badgeUnknown")}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3 text-xs leading-relaxed text-muted-foreground">
          {blocked ? tp("badgeBlockedHint") : tp("badgeUnknownHint")}
        </PopoverContent>
      </Popover>
    );
  };

  /**
   * Selo da ficha assinada (fase 2): só com a ficha no endereço e com os campos da gestão
   * (`signingKey` null = sem chave; ausente = servidor sem a fase, sem selo).
   */
  const keyBadge = (app: GlobalPanelAppItem) => {
    if (!findTemplateVariables(app.url || "").includes("token")) return null;
    let kind: "signed" | "unreadable" | "missing" | null = null;
    if (app.signingKeyUnreadable === true) kind = "unreadable";
    else if (app.signingKey && typeof app.signingKey === "object") kind = "signed";
    else if (app.signingKey === null) kind = "missing";
    if (!kind) return null;
    const label =
      kind === "signed" ? tp("badgeSigned") : kind === "unreadable" ? tp("badgeKeyUnreadable") : tp("badgeKeyMissing");
    const hint =
      kind === "signed"
        ? tp("badgeSignedHint")
        : kind === "unreadable"
          ? tp("badgeKeyUnreadableHint")
          : tp("badgeKeyMissingHint");
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <Badge variant={kind === "signed" ? "info-soft" : "warning-soft"} className="gap-1 whitespace-nowrap">
              {kind === "signed" ? <ShieldCheck className="h-3 w-3" /> : <KeyRound className="h-3 w-3" />}
              {label}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </PopoverContent>
      </Popover>
    );
  };

  const badgesRow = (app: GlobalPanelAppItem) => {
    const embed = embedBadge(app);
    const key = keyBadge(app);
    if (!embed && !key) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {embed}
        {key}
      </div>
    );
  };

  const statusBadge = (app: GlobalPanelAppItem) => (
    <Badge variant={app.isActive ? "success-soft" : "secondary"} className="whitespace-nowrap">
      {app.isActive ? tp("statusActive") : tp("statusInactive")}
    </Badge>
  );

  const inMyMenuBadge = (app: GlobalPanelAppItem) =>
    app.showToSuperadmin ? (
      <Badge variant="info-soft" className="whitespace-nowrap">{t("inMyMenu")}</Badge>
    ) : (
      <span className="text-xs text-muted-foreground">{t("notInMyMenu")}</span>
    );

  const targetCell = (app: GlobalPanelAppItem) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "block max-w-[14rem] truncate text-sm",
            hasTarget(app) ? "text-muted-foreground" : "text-warning"
          )}
        >
          {targetSummary(app)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-0.5 whitespace-normal">
        {targetDetail(app).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );

  const rowActions = (app: GlobalPanelAppItem, index: number) => {
    const busy = movingId !== null;
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleMove(app, "up")}
          disabled={busy || index === 0}
          aria-label={tp("moveUp")}
          title={tp("moveUp")}
        >
          {movingId === app.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleMove(app, "down")}
          disabled={busy || index === list.length - 1}
          aria-label={tp("moveDown")}
          title={tp("moveDown")}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(app)} aria-label={tp("edit")} title={tp("edit")}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteTarget(app)}
          aria-label={tp("delete")}
          title={tp("delete")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  const appIdentity = (app: GlobalPanelAppItem) => {
    const Icon = getPanelAppIcon(app.icon);
    const host = hostOf(app.url);
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium" title={app.name}>{app.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {categoryLabel(app.category)} · {modeLabel(app.openMode)}
            {host ? ` · ${host}` : ""}
          </p>
        </div>
      </div>
    );
  };

  const errorBanner = loadErrorKey ? (
    <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>{tp(loadErrorKey)}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void load()} className="shrink-0 gap-1.5">
        <RotateCw className="h-3.5 w-3.5" />
        {tp("retry")}
      </Button>
    </div>
  ) : null;

  // Fase 2: a ferramenta precisa receber a chave (nova) — o aviso fica até ser fechado.
  const keyNoticeRotated = keyNotice?.kind === "rotated";
  const keyNoticeBanner = keyNotice ? (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center",
        keyNoticeRotated ? "border-warning/40 bg-warning/10" : "border-info/30 bg-info/10"
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <KeyRound className={cn("mt-0.5 h-4 w-4 shrink-0", keyNoticeRotated ? "text-warning" : "text-info")} />
        <p className="min-w-0 break-words">
          {keyNoticeRotated
            ? tp("keyRotatedNotice", { name: keyNotice.name })
            : tp("keyCreatedNotice", { name: keyNotice.name })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        {list.some((a) => a.id === keyNotice.id) && (
          <Button variant="outline" size="sm" onClick={openKeyNotice} className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            {tp("keyNoticeOpen")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setKeyNotice(null)}
          aria-label={tp("keyNoticeDismiss")}
          title={tp("keyNoticeDismiss")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp}>
          {!denied && apps && newAppButton}
        </PageHeader>

        {denied ? (
          <AccessDenied />
        ) : loading && !apps ? (
          <Skeleton className="h-48 w-full" aria-busy="true" />
        ) : !apps ? (
          errorBanner
        ) : (
          <>
          {keyNoticeBanner}
          <Card>
            <CardHeader className="flex flex-col gap-1 space-y-0 p-4 pb-3 sm:flex-row sm:items-start sm:justify-between md:p-6 md:pb-3">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base">{t("listTitle")}</CardTitle>
                <CardDescription>{t("listDesc")}</CardDescription>
              </div>
              <span className={cn("shrink-0 text-xs tabular-nums", atLimit ? "text-warning" : "text-muted-foreground")}>
                {tp("countOf", { count: list.length, max: MAX_GLOBAL_APPS })}
              </span>
            </CardHeader>
            <CardContent className={cn("px-4 pb-4 md:px-6 md:pb-6", list.length > 0 && "p-0 md:p-0")}>
              {list.length === 0 ? (
                <EmptyState
                  icon={AppWindow}
                  title={t("emptyTitle")}
                  description={t("emptyDesc")}
                  className="py-10"
                  steps={[
                    { number: 1, title: t("emptyStep1") },
                    { number: 2, title: t("emptyStep2") },
                    { number: 3, title: t("emptyStep3") },
                  ]}
                >
                  <Button onClick={openCreate} variant="outline" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    {tp("newApp")}
                  </Button>
                </EmptyState>
              ) : (
                <>
                  {/* Desktop: tabela */}
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-6">{tp("colName")}</TableHead>
                          <TableHead>{t("colTarget")}</TableHead>
                          <TableHead>{t("colProfiles")}</TableHead>
                          <TableHead>{t("colInMyMenu")}</TableHead>
                          <TableHead>{tp("colStatus")}</TableHead>
                          <TableHead className="pr-6 text-right">{tp("colActions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((app, index) => (
                          <TableRow key={app.id} className={cn(!app.isActive && "opacity-70")}>
                            <TableCell className="max-w-[20rem] pl-6">
                              <div className="space-y-1">
                                {appIdentity(app)}
                                {badgesRow(app)}
                              </div>
                            </TableCell>
                            <TableCell>{targetCell(app)}</TableCell>
                            <TableCell className="max-w-[12rem]">
                              <span className="block truncate text-sm text-muted-foreground" title={profilesLabel(app)}>
                                {profilesLabel(app)}
                              </span>
                            </TableCell>
                            <TableCell>{inMyMenuBadge(app)}</TableCell>
                            <TableCell>{statusBadge(app)}</TableCell>
                            <TableCell className="pr-6">{rowActions(app, index)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Celular: cartões */}
                  <div className="divide-y md:hidden">
                    {list.map((app, index) => (
                      <div key={app.id} className={cn("space-y-2 p-4", !app.isActive && "opacity-70")}>
                        <div className="flex items-start justify-between gap-2">
                          {appIdentity(app)}
                          {statusBadge(app)}
                        </div>
                        {badgesRow(app)}
                        <p className={cn("text-xs break-words", hasTarget(app) ? "text-muted-foreground" : "text-warning")}>
                          <span className="font-medium text-foreground">{t("colTarget")}:</span> {targetSummary(app)}
                        </p>
                        <p className="text-xs text-muted-foreground break-words">
                          <span className="font-medium text-foreground">{t("colProfiles")}:</span> {profilesLabel(app)}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          {inMyMenuBadge(app)}
                          {rowActions(app, index)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          </>
        )}
      </div>

      <PanelAppFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scope="global"
        item={editing}
        onSaved={handleSaved}
        onKeyChanged={() => load({ silent: true })}
        tenantOptions={tenants}
        planOptions={plans}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tp("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDesc", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tp("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {tp("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
