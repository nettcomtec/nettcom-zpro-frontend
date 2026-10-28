"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, AppWindow, ArrowDown, ArrowUp, Contact, EyeOff, Info, KeyRound, Loader2, MessageSquare,
  PanelLeft, Pencil, Plus, RotateCw, ShieldCheck, Trash2, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  PANEL_APP_PLACEMENTS,
  PANEL_APP_PROFILES,
  findTemplateVariables,
  getPanelAppIcon,
  usePanelAppsManageVisible,
  type PanelAppManageItem,
  type PanelAppManageList,
  type PanelAppPlacement,
  type PanelAppProviderItem,
} from "@/lib/panel-apps";
import {
  deletePanelApp,
  fetchPanelAppsManage,
  movePanelApp,
  setGlobalPanelAppHidden,
} from "@/services/panel-apps";
import {
  PanelAppFormDialog,
  panelAppCanonicalCategory,
  panelAppErrorKey,
  panelAppProfileLabelKey,
  type PanelAppSavedResult,
} from "@/components/panel-apps/panel-app-form-dialog";

/**
 * Aplicativos da empresa (`/aplicativos`, docs/PLANO_APLICATIVOS_PERSONALIZADOS.md §5.5).
 *
 * - Gate ANTES de qualquer hook de dados: admin, ou perfil personalizado com
 *   "Gerenciar aplicativos" (D14), e o interruptor "Aplicativos" do /tenants ligado (D30).
 * - Plano com o recurso e `own !== null`: cadastro das apps próprias. Sem o recurso (D24):
 *   só "Aplicativos do provedor" (ocultar continua disponível).
 * - Depois de salvar/mover/ocultar/excluir: recarrega a lista e o menu na hora (quem
 *   salvou não espera o aviso do servidor).
 *
 * Fase 2 (docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md §5.9): o eco `launch` da lista liga
 * a fase na sessão (`noteLaunchEcho`); selos de lugar (só quando a app aparece fora do menu)
 * e da ficha assinada ("Ficha assinada", "Chave ilegível", "Sem chave"); aviso que fica na
 * tela quando a chave nasce ou é trocada numa gravação. "Aplicativos do provedor" não mostra
 * chave.
 */

export default function PanelAppsPage() {
  const visible = usePanelAppsManageVisible();
  if (!visible) return <AccessDenied />;
  return <PanelAppsManageContent />;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

const NAMES_IN_DETAIL = 15;

/** Selo de cada lugar onde a app aparece (fase 2). */
const PLACEMENT_BADGES: Record<PanelAppPlacement, { key: string; icon: LucideIcon }> = {
  menu: { key: "badgeMenu", icon: PanelLeft },
  contact: { key: "badgeContact", icon: Contact },
  ticket: { key: "badgeTicket", icon: MessageSquare },
};

/** Aviso que fica na tela depois de uma gravação que criou ou trocou a chave da ficha. */
type KeyNotice = { id: number; name: string; kind: "created" | "rotated" };

function PanelAppsManageContent() {
  const t = useTranslations("panelAppsPage");
  const tf = useTranslations("panelAppForm");
  const featureOn = useAuthStore((s) => s.hasFeature("customApps"));
  // Fase 2 ligada no servidor (eco visto na sessão): ajuda da página com o "Abrir em…".
  const launchSupported = usePanelAppsStore((s) => s.launchSupported);

  const [data, setData] = useState<PanelAppManageList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PanelAppManageItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PanelAppManageItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [hidingId, setHidingId] = useState<number | null>(null);
  const [keyNotice, setKeyNotice] = useState<KeyNotice | null>(null);

  const loadSeqRef = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++loadSeqRef.current;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetchPanelAppsManage();
        if (seq !== loadSeqRef.current) return;
        hasDataRef.current = true;
        setData(res);
        // O eco da gestão também liga a fase 2 na sessão (cadastro com "Onde aparece").
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
        // Recarga depois de uma ação: a lista que está na tela continua; só avisa.
        if (opts?.silent && hasDataRef.current) toast.error(t(key));
        else setLoadErrorKey(key);
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refreshMenu = () => {
    void usePanelAppsStore.getState().fetch({ force: true });
  };

  const afterChange = async () => {
    await load({ silent: true });
    refreshMenu();
  };

  const own = data?.own ?? null;
  const canOwn = featureOn && own !== null;
  const maxApps = data?.maxApps ?? 50;
  const ownList = own ?? [];
  const atLimit = ownList.length >= maxApps;
  const globalList = data?.global ?? [];

  const openCreate = () => {
    if (atLimit) return;
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (app: PanelAppManageItem) => {
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
    const target = ownList.find((a) => a.id === keyNotice.id);
    setKeyNotice(null);
    if (target) openEdit(target);
  };

  const handleMove = async (app: PanelAppManageItem, direction: "up" | "down") => {
    if (movingId !== null) return;
    setMovingId(app.id);
    try {
      await movePanelApp(app.id, direction);
      await afterChange();
    } catch (err: unknown) {
      const key = panelAppErrorKey(err, "errors.moveFailed");
      if (key) toast.error(t(key));
    } finally {
      setMovingId(null);
    }
  };

  const handleHide = async (app: PanelAppProviderItem, hidden: boolean) => {
    if (hidingId !== null) return;
    setHidingId(app.id);
    const apply = (value: boolean) =>
      setData((prev) =>
        prev ? { ...prev, global: prev.global.map((g) => (g.id === app.id ? { ...g, hidden: value } : g)) } : prev
      );
    apply(hidden);
    try {
      await setGlobalPanelAppHidden(app.id, hidden);
      toast.success(hidden ? t("hiddenOn") : t("hiddenOff"));
      await afterChange();
    } catch (err: unknown) {
      apply(!hidden);
      const key = panelAppErrorKey(err, "errors.hideFailed");
      if (key) toast.error(t(key));
    } finally {
      setHidingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const deletedId = deleteTarget.id;
      await deletePanelApp(deletedId);
      toast.success(t("deleted"));
      setDeleteTarget(null);
      setKeyNotice((n) => (n && n.id === deletedId ? null : n));
      await afterChange();
    } catch (err: unknown) {
      const code = getBackendErrorCode(err);
      const key = panelAppErrorKey(err, "errors.deleteFailed");
      if (key) toast.error(t(key));
      if (code === "ERR_PANEL_APP_NOT_FOUND") {
        setDeleteTarget(null);
        await load({ silent: true });
      }
    } finally {
      setDeleting(false);
    }
  };

  const profilesLabel = (app: PanelAppManageItem): string =>
    PANEL_APP_PROFILES.filter((p) => p === "admin" || (app.profiles || []).includes(p))
      .map((p) => tf(panelAppProfileLabelKey(p)))
      .join(", ");

  const accessSummary = (app: PanelAppManageItem): string => {
    const parts = [profilesLabel(app)];
    const customCount = app.customProfiles?.length ?? 0;
    const usersCount = app.users?.length ?? 0;
    const teamsCount = app.teams?.length ?? 0;
    if (customCount > 0) parts.push(t("accessCustomProfiles", { count: customCount }));
    if (usersCount > 0) parts.push(t("accessUsers", { count: usersCount }));
    if (teamsCount > 0) parts.push(t("accessTeams", { count: teamsCount }));
    return parts.join(" · ");
  };

  const namesOf = (refs: { name: string }[] | undefined): string => {
    const list = (refs || []).map((r) => r.name);
    const shown = list.slice(0, NAMES_IN_DETAIL).join(", ");
    const rest = list.length - NAMES_IN_DETAIL;
    return rest > 0 ? `${shown} ${t("andMore", { count: rest })}` : shown;
  };

  const accessDetail = (app: PanelAppManageItem): string[] => {
    const lines = [`${tf("profiles")}: ${profilesLabel(app)}`];
    if (app.customProfiles?.length) lines.push(`${tf("customProfiles")}: ${namesOf(app.customProfiles)}`);
    if (app.users?.length) lines.push(`${tf("users")}: ${namesOf(app.users)}`);
    if (app.teams?.length) lines.push(`${tf("teams")}: ${namesOf(app.teams)}`);
    return lines;
  };

  const categoryLabel = (category: string) => tf(`categories.${panelAppCanonicalCategory(category)}`);
  const modeLabel = (mode: string) => (mode === "new_tab" ? tf("modeNewTab") : tf("modeEmbed"));

  // Mesmo `help` em todos os estados (carregando, erro, lista). A seção do "Abrir em…" e da
  // ficha só aparece com a fase 2 ligada no servidor.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      ...(launchSupported
        ? [{ title: t("helpS4T"), items: [t("helpS4I0"), t("helpS4I1"), t("helpS4I2"), t("helpS4I3")] }]
        : []),
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2"), t("helpS2I3")] },
      { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1")] },
    ],
  };

  const newAppButton = canOwn ? (
    atLimit ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Button disabled className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("newApp")}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{t("limitReached", { max: maxApps })}</TooltipContent>
      </Tooltip>
    ) : (
      <Button onClick={openCreate} className="gap-1.5">
        <Plus className="h-4 w-4" />
        {t("newApp")}
      </Button>
    )
  ) : null;

  const embedBadge = (app: PanelAppManageItem) => {
    if (app.openMode !== "embed" || app.embedCheck === "ok") return null;
    const blocked = app.embedCheck === "blocked";
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <Badge variant={blocked ? "warning-soft" : "secondary"} className="gap-1 whitespace-nowrap">
              {blocked ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
              {blocked ? t("badgeBlocked") : t("badgeUnknown")}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3 text-xs leading-relaxed text-muted-foreground">
          {blocked ? t("badgeBlockedHint") : t("badgeUnknownHint")}
        </PopoverContent>
      </Popover>
    );
  };

  /**
   * Selo da ficha assinada (fase 2): só com a ficha no endereço e com os campos da gestão
   * (`signingKey` null = sem chave; ausente = servidor sem a fase, sem selo).
   */
  const keyBadge = (app: PanelAppManageItem) => {
    if (!findTemplateVariables(app.url || "").includes("token")) return null;
    let kind: "signed" | "unreadable" | "missing" | null = null;
    if (app.signingKeyUnreadable === true) kind = "unreadable";
    else if (app.signingKey && typeof app.signingKey === "object") kind = "signed";
    else if (app.signingKey === null) kind = "missing";
    if (!kind) return null;
    const label =
      kind === "signed" ? t("badgeSigned") : kind === "unreadable" ? t("badgeKeyUnreadable") : t("badgeKeyMissing");
    const hint =
      kind === "signed"
        ? t("badgeSignedHint")
        : kind === "unreadable"
          ? t("badgeKeyUnreadableHint")
          : t("badgeKeyMissingHint");
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

  /** Lugares (fase 2): só quando a app aparece fora do menu (app só de menu fica como na v1). */
  const placementBadges = (app: PanelAppManageItem) => {
    const placements = Array.isArray(app.placements) ? app.placements : null;
    if (!placements || !placements.some((p) => p !== "menu")) return null;
    return PANEL_APP_PLACEMENTS.filter((p) => placements.includes(p)).map((p) => {
      const { key, icon: Icon } = PLACEMENT_BADGES[p];
      const label = t(key);
      return (
        <Badge
          key={p}
          variant="outline"
          className="gap-1 whitespace-nowrap font-medium"
          title={`${tf("placementsTitle")}: ${label}`}
        >
          <Icon className="h-3 w-3" aria-hidden />
          <span className="sr-only">{tf("placementsTitle")}: </span>
          {label}
        </Badge>
      );
    });
  };

  const badgesRow = (app: PanelAppManageItem) => {
    const embed = embedBadge(app);
    const key = keyBadge(app);
    const places = placementBadges(app);
    if (!embed && !key && !places) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {embed}
        {key}
        {places}
      </div>
    );
  };

  /** A app aparece no menu (sem `placements` = app da v1, só no menu). */
  const inMenu = (app: PanelAppManageItem) => !Array.isArray(app.placements) || app.placements.includes("menu");

  const statusBadge = (app: PanelAppManageItem) => (
    <Badge variant={app.isActive ? "success-soft" : "secondary"} className="whitespace-nowrap">
      {app.isActive ? t("statusActive") : t("statusInactive")}
    </Badge>
  );

  const rowActions = (app: PanelAppManageItem, index: number) => {
    const busy = movingId !== null;
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleMove(app, "up")}
          disabled={busy || index === 0}
          aria-label={t("moveUp")}
          title={t("moveUp")}
        >
          {movingId === app.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleMove(app, "down")}
          disabled={busy || index === ownList.length - 1}
          aria-label={t("moveDown")}
          title={t("moveDown")}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => openEdit(app)}
          aria-label={t("edit")}
          title={t("edit")}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteTarget(app)}
          aria-label={t("delete")}
          title={t("delete")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  const appIdentity = (app: PanelAppManageItem) => {
    const Icon = getPanelAppIcon(app.icon);
    const host = hostOf(app.url);
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium" title={app.name}>{app.name}</p>
          {host && <p className="truncate text-[11px] text-muted-foreground" title={host}>{host}</p>}
        </div>
      </div>
    );
  };

  const accessCell = (app: PanelAppManageItem) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="block max-w-[16rem] truncate text-sm text-muted-foreground">
          {accessSummary(app)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-0.5 whitespace-normal">
        {accessDetail(app).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );

  const ownSection = canOwn ? (
    <Card>
      <CardHeader className="flex flex-col gap-1 space-y-0 p-4 pb-3 sm:flex-row sm:items-start sm:justify-between md:p-6 md:pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{t("ownSection")}</CardTitle>
          <CardDescription>{t("ownSectionDesc")}</CardDescription>
        </div>
        <span className={cn("shrink-0 text-xs tabular-nums", atLimit ? "text-warning" : "text-muted-foreground")}>
          {t("countOf", { count: ownList.length, max: maxApps })}
        </span>
      </CardHeader>
      <CardContent className={cn("px-4 pb-4 md:px-6 md:pb-6", ownList.length > 0 && "p-0 md:p-0")}>
        {atLimit && (
          <p className="mx-4 mb-3 flex items-start gap-1.5 text-xs text-warning md:mx-6">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{t("limitReached", { max: maxApps })}</span>
          </p>
        )}
        {ownList.length === 0 ? (
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
              {t("newApp")}
            </Button>
          </EmptyState>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">{t("colName")}</TableHead>
                    <TableHead>{t("colCategory")}</TableHead>
                    <TableHead>{t("colMode")}</TableHead>
                    <TableHead>{t("colAccess")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead className="pr-6 text-right">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownList.map((app, index) => (
                    <TableRow key={app.id} className={cn(!app.isActive && "opacity-70")}>
                      <TableCell className="max-w-[18rem] pl-6">
                        <div className="space-y-1">
                          {appIdentity(app)}
                          {badgesRow(app)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {inMenu(app) ? categoryLabel(app.category) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{modeLabel(app.openMode)}</TableCell>
                      <TableCell>{accessCell(app)}</TableCell>
                      <TableCell>{statusBadge(app)}</TableCell>
                      <TableCell className="pr-6">{rowActions(app, index)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Celular: cartões */}
            <div className="divide-y md:hidden">
              {ownList.map((app, index) => (
                <div key={app.id} className={cn("space-y-2 p-4", !app.isActive && "opacity-70")}>
                  <div className="flex items-start justify-between gap-2">
                    {appIdentity(app)}
                    {statusBadge(app)}
                  </div>
                  {badgesRow(app)}
                  <p className="text-xs text-muted-foreground">
                    {inMenu(app) ? `${categoryLabel(app.category)} · ` : ""}
                    {modeLabel(app.openMode)}
                  </p>
                  <p className="text-xs text-muted-foreground break-words">{accessSummary(app)}</p>
                  {rowActions(app, index)}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  ) : null;

  const showProviderSection = !canOwn || globalList.length > 0;

  const providerSection = showProviderSection ? (
    <Card>
      <CardHeader className="space-y-1 p-4 pb-3 md:p-6 md:pb-3">
        <CardTitle className="text-base">{t("providerSection")}</CardTitle>
        <CardDescription>{t("providerSectionDesc")}</CardDescription>
      </CardHeader>
      <CardContent className={cn("px-4 pb-4 md:px-6 md:pb-6", globalList.length > 0 && "p-0 md:p-0")}>
        {globalList.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("providerEmpty")}</p>
        ) : (
          <div className="divide-y">
            {globalList.map((app) => {
              const Icon = getPanelAppIcon(app.icon);
              const switchId = `panel-app-hide-${app.id}`;
              return (
                <div
                  key={app.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6"
                >
                  <div className={cn("flex min-w-0 items-center gap-2.5", app.hidden && "opacity-60")}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate font-medium" title={app.name}>{app.name}</p>
                        {app.hidden && (
                          <Badge variant="secondary" className="shrink-0 gap-1">
                            <EyeOff className="h-3 w-3" />
                            {t("hiddenBadge")}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {categoryLabel(app.category)} · {modeLabel(app.openMode)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    {hidingId === app.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <label htmlFor={switchId} className="cursor-pointer text-sm">
                      {t("hideInTenant")}
                    </label>
                    <Switch
                      id={switchId}
                      checked={app.hidden}
                      disabled={hidingId !== null}
                      onCheckedChange={(v) => handleHide(app, v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  ) : null;

  const errorBanner = loadErrorKey ? (
    <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>{t(loadErrorKey)}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void load()} className="shrink-0 gap-1.5">
        <RotateCw className="h-3.5 w-3.5" />
        {t("retry")}
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
            ? t("keyRotatedNotice", { name: keyNotice.name })
            : t("keyCreatedNotice", { name: keyNotice.name })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        {ownList.some((a) => a.id === keyNotice.id) && (
          <Button variant="outline" size="sm" onClick={openKeyNotice} className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            {t("keyNoticeOpen")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setKeyNotice(null)}
          aria-label={t("keyNoticeDismiss")}
          title={t("keyNoticeDismiss")}
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
          {!denied && !loadErrorKey && data && newAppButton}
        </PageHeader>

        {denied ? (
          <AccessDenied />
        ) : loading && !data ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !data ? (
          errorBanner
        ) : (
          <>
            {!canOwn && (
              <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <p>{t("notInPlan")}</p>
              </div>
            )}
            {canOwn && keyNoticeBanner}
            {ownSection}
            {providerSection}
          </>
        )}
      </div>

      {canOwn && (
        <PanelAppFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          scope="tenant"
          item={editing}
          onSaved={handleSaved}
          onKeyChanged={() => load({ silent: true })}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDesc", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
