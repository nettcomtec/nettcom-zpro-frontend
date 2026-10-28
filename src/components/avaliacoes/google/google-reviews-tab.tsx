"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, ExternalLink, Gauge, KeyRound, Loader2, LogIn, PlugZap, RefreshCw, ShieldAlert, Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import {
  loadGoogleBusinessStatus,
  markGoogleReviewsViewed,
  requestGoogleBusinessAuthUrl,
  syncGoogleBusinessNow,
  type GoogleBusinessConnectionDTO,
  type GoogleBusinessStatus,
} from "@/services/google-business";
import {
  GoogleConnectionCard,
  GoogleInfoTip,
  formatGoogleDateTime,
  googleBusinessErrorText,
  googleLocationLabel,
  isGoogleBusinessThrottled,
} from "./google-connection-card";
import { GoogleAlertSettings } from "./google-alert-settings";
import { GoogleReviewsSummary } from "./google-reviews-summary";
import { GoogleReviewsList } from "./google-reviews-list";

type StatusLoad =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "error"; code: string }
  | { state: "ok"; data: GoogleBusinessStatus };

type PeriodPreset = "all" | "30" | "90" | "365" | "custom";

const POPUP_NAME = "google_business_oauth";
const POPUP_WATCH_MS = 1000;
const CONNECT_PENDING_MS = 10 * 60 * 1000;
const API_ACCESS_FORM_URL = "https://support.google.com/business/contact/api_default";

const isoDay = (d: Date): string => {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

function popupFeatures(): string {
  const w = 600;
  const h = 720;
  const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  return `width=${w},height=${h},left=${left},top=${top},popup=yes`;
}

/** A conexão ficou utilizável (nova, outra conta ou acesso que voltou). */
function becameConnected(prev: GoogleBusinessConnectionDTO | null, next: GoogleBusinessConnectionDTO | null): boolean {
  if (!next || next.authExpired) return false;
  if (!prev) return true;
  return prev.authExpired || prev.accountEmail !== next.accountEmail || prev.connectedAt !== next.connectedAt;
}

export default function GoogleReviewsTab() {
  const t = useTranslations("googleReviews");
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const [load, setLoad] = useState<StatusLoad>({ state: "loading" });
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [awaitingGoogle, setAwaitingGoogle] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const statusRef = useRef<GoogleBusinessStatus | null>(null);
  const connectPendingUntilRef = useRef(0);
  const popupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupStartedRef = useRef(0);
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Novas" (D10): marcadas como vistas depois que a lista carregou com elas na tela.
  const markPendingRef = useRef(true);
  const markWaitingVisibleRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (popupTimerRef.current) clearInterval(popupTimerRef.current);
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
    };
  }, []);

  const applyStatus = useCallback((next: GoogleBusinessStatus) => {
    const prev = statusRef.current;
    statusRef.current = next;
    setLoad({ state: "ok", data: next });
    if (connectPendingUntilRef.current > Date.now() && becameConnected(prev?.connection ?? null, next.connection)) {
      connectPendingUntilRef.current = 0;
      setAwaitingGoogle(false);
      toast.success(t("connectSuccess"));
    }
  }, [t]);

  const reloadStatus = useCallback(async (background = true) => {
    const res = await loadGoogleBusinessStatus({ background });
    if (!mountedRef.current) return;
    if (res.state === "ok") {
      applyStatus(res.data);
      return;
    }
    // Releitura em segundo plano que falha não apaga a tela que já está montada.
    if (statusRef.current && background) return;
    if (res.state === "unavailable") setLoad({ state: "unavailable" });
    else setLoad({ state: "error", code: res.code });
  }, [applyStatus]);

  const reloadStatusRef = useRef(reloadStatus);
  reloadStatusRef.current = reloadStatus;

  useEffect(() => {
    void reloadStatus(false);
  }, [reloadStatus]);

  const markViewedNow = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      markWaitingVisibleRef.current = true;
      return;
    }
    markWaitingVisibleRef.current = false;
    markGoogleReviewsViewed().catch(() => { /* aviso do sino fica; a próxima abertura marca */ });
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && markWaitingVisibleRef.current) markViewedNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markViewedNow]);

  const handleListLoaded = useCallback(() => {
    if (!markPendingRef.current) return;
    markPendingRef.current = false;
    markViewedNow();
  }, [markViewedNow]);

  const scheduleDataReload = useCallback((markAfter: boolean) => {
    if (markAfter) markPendingRef.current = true;
    if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
    reloadDebounceRef.current = setTimeout(() => {
      reloadDebounceRef.current = null;
      if (mountedRef.current) setReloadKey((k) => k + 1);
    }, 1200);
  }, []);

  // Tempo real: conexão mudou (conectou, venceu, desconectou) e avaliações novas.
  useEffect(() => {
    if (!tenantId) return;
    const socket = getSocket();
    if (!socket) return;
    const statusEvent = `${tenantId}:google-business:status`;
    const badgeEvent = `${tenantId}:google-business:badge`;
    const onStatus = () => {
      void reloadStatusRef.current(true);
      scheduleDataReload(false);
    };
    const onBadge = (payload: { newCount?: unknown } | null) => {
      const newCount = Number(payload?.newCount);
      if (Number.isFinite(newCount) && newCount > 0) scheduleDataReload(true);
    };
    socket.on(statusEvent, onStatus);
    socket.on(badgeEvent, onBadge);
    return () => {
      socket.off(statusEvent, onStatus);
      socket.off(badgeEvent, onBadge);
    };
  }, [tenantId, scheduleDataReload]);

  // Atalho: a página de retorno avisa pela janela que abriu. Não confiamos no conteúdo
  // (a origem pode ser outro domínio da instalação): só relemos o status do servidor.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null;
      if (!data || typeof data !== "object" || data.type !== "OAUTH_COMPLETE_GOOGLE_BUSINESS") return;
      void reloadStatusRef.current(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const watchPopup = useCallback((popup: Window) => {
    if (popupTimerRef.current) clearInterval(popupTimerRef.current);
    popupStartedRef.current = Date.now();
    setAwaitingGoogle(true);
    popupTimerRef.current = setInterval(() => {
      let closed = false;
      try {
        closed = popup.closed;
      } catch {
        closed = true;
      }
      const expired = Date.now() - popupStartedRef.current > CONNECT_PENDING_MS;
      if (closed || expired) {
        if (popupTimerRef.current) clearInterval(popupTimerRef.current);
        popupTimerRef.current = null;
        if (mountedRef.current) {
          setAwaitingGoogle(false);
          void reloadStatusRef.current(true);
        }
      }
    }, POPUP_WATCH_MS);
  }, []);

  const handleConnect = async () => {
    if (connecting) return;
    // Janela aberta já no clique (senão o bloqueador de pop-up do navegador a barra);
    // o endereço do Google entra nela quando o servidor responder.
    let popup: Window | null = null;
    try {
      popup = window.open("", POPUP_NAME, popupFeatures());
    } catch {
      popup = null;
    }
    setConnecting(true);
    try {
      const { data } = await requestGoogleBusinessAuthUrl();
      const url = typeof data?.authUrl === "string" ? data.authUrl : "";
      if (!/^https?:\/\//i.test(url)) throw new Error("ERR_GOOGLE_BUSINESS_AUTH_URL");
      connectPendingUntilRef.current = Date.now() + CONNECT_PENDING_MS;
      let win: Window | null = null;
      if (popup && !popup.closed) {
        try {
          popup.location.href = url;
          win = popup;
        } catch {
          win = null;
        }
      }
      if (!win) {
        try {
          win = window.open(url, POPUP_NAME, popupFeatures());
        } catch {
          win = null;
        }
      }
      if (win) {
        watchPopup(win);
      } else {
        toast.warning(t("popupBlocked"), {
          duration: 20000,
          action: {
            label: t("popupOpenAction"),
            onClick: () => {
              const w = window.open(url, POPUP_NAME, popupFeatures());
              if (w) watchPopup(w);
            },
          },
        });
      }
    } catch (err) {
      try { popup?.close(); } catch { /* janela já fechada */ }
      connectPendingUntilRef.current = 0;
      const msg = googleBusinessErrorText(t, err);
      if (msg) toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncGoogleBusinessNow();
      toast.success(t("syncStarted"));
      markPendingRef.current = true;
      await reloadStatus(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (isGoogleBusinessThrottled(err)) {
        toast.info(t("errSyncThrottled"));
      } else {
        const msg = googleBusinessErrorText(t, err);
        if (msg) toast.error(msg);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleStatusChange = useCallback((next: GoogleBusinessStatus) => {
    applyStatus(next);
    setReloadKey((k) => k + 1);
  }, [applyStatus]);

  const handleConnectionReload = useCallback(() => {
    void reloadStatus(true);
    setReloadKey((k) => k + 1);
  }, [reloadStatus]);

  // ─── Estados sem conexão utilizável ─────────────────────────────

  if (load.state === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (load.state === "unavailable") {
    return <EmptyState icon={Star} title={t("unavailableTitle")} description={t("unavailableDesc")} />;
  }

  if (load.state === "error") {
    const msg = load.code === "ERR_GOOGLE_BUSINESS_FORBIDDEN" || load.code === "ERR_NO_PERMISSION"
      ? t("errForbidden")
      : t("loadError");
    return (
      <EmptyState icon={AlertTriangle} title={t("tabTitle")} description={msg}>
        <Button variant="outline" onClick={() => { setLoad({ state: "loading" }); void reloadStatus(false); }}>
          <RefreshCw className="h-4 w-4" />
          {t("retry")}
        </Button>
      </EmptyState>
    );
  }

  const status = load.data;
  const connection = status.connection;
  const canManage = status.canManage === true;

  const connectButton = (label: string) =>
    canManage ? (
      <Button onClick={handleConnect} disabled={connecting || awaitingGoogle}>
        {connecting || awaitingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {awaitingGoogle ? t("connectWaiting") : label}
      </Button>
    ) : (
      <p className="text-sm text-muted-foreground">{t("connectManageOnly")}</p>
    );

  // Sem App Google com o serviço do Perfil e sem conexão: nada a fazer na empresa.
  if (!status.appConfigured && !connection) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="rounded-full bg-muted p-4 ring-1 ring-border/60">
            <PlugZap className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">{t("noAppTitle")}</h3>
          <p className="max-w-xl text-sm text-muted-foreground">{t("noAppDesc")}</p>
          {status.appError === "ERR_PLATFORM_GOOGLE_APP_DISABLED" && (
            <p className="max-w-xl text-sm text-muted-foreground">{t("noAppPlatformDisabled")}</p>
          )}
          <p className="max-w-xl text-xs text-muted-foreground">{t("noAppMeanwhile")}</p>
        </CardContent>
      </Card>
    );
  }

  if (!connection) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="rounded-full bg-muted p-4 ring-1 ring-border/60">
            <Star className="h-8 w-8 text-yellow-500" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{t("connectTitle")}</h3>
            <p className="max-w-xl text-sm text-muted-foreground">{t("connectDesc")}</p>
          </div>
          <ul className="max-w-xl space-y-1.5 text-left text-sm">
            {["connectPoint1", "connectPoint2", "connectPoint3", "connectPoint4"].map((k) => (
              <li key={k} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
          {connectButton(t("connectButton"))}
        </CardContent>
      </Card>
    );
  }

  // ─── Conectado ──────────────────────────────────────────────────

  const locations = Array.isArray(connection.locations) ? connection.locations : [];
  const activeCount = locations.filter((l) => l.isActive).length;
  const locationId = locationFilter !== "all" && locations.some((l) => String(l.id) === locationFilter)
    ? Number(locationFilter)
    : undefined;
  const today = new Date();
  const from = period === "custom"
    ? (customFrom || undefined)
    : period === "all"
      ? undefined
      : isoDay(new Date(today.getTime() - (Number(period) - 1) * 86400000));
  const to = period === "custom" ? (customTo || undefined) : undefined;
  const lastSync = formatGoogleDateTime(connection.lastSyncAt);
  const apiStateSince = formatGoogleDateTime(connection.apiStateAt);
  // Leitura parcial: só com a conexão "ok" (os outros estados já têm o próprio aviso).
  const partialRead =
    connection.apiState === "ok" && connection.partialRead && connection.partialRead.failedAccounts > 0
      ? connection.partialRead
      : null;
  const partialReadSince = formatGoogleDateTime(partialRead?.at ?? null);

  const expiredReasonKey =
    connection.authExpiredReason === "revoked" ? "expiredRevoked"
      : connection.authExpiredReason === "app_changed" ? "expiredAppChanged"
        : connection.authExpiredReason === "decrypt" ? "expiredDecrypt"
          : "expiredGeneric";

  return (
    <div className="space-y-4">
      {/* Cabeçalho da aba */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-base font-semibold">{t("tabTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("tabDescription")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {lastSync ? t("lastSync", { date: lastSync }) : t("lastSyncNever")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing || connection.authExpired}
          >
            <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {t("syncNow")}
          </Button>
          <GoogleInfoTip text={t("syncNowTip")} label={t("infoLabel")} />
        </div>
      </div>

      {!status.appConfigured && (
        <Alert variant="warning-soft">
          <PlugZap className="h-4 w-4" />
          <AlertTitle>{t("noAppTitle")}</AlertTitle>
          <AlertDescription>{t("noAppWarningConnected")}</AlertDescription>
        </Alert>
      )}

      {connection.authExpired && (
        <Alert variant="warning-soft">
          <KeyRound className="h-4 w-4" />
          <AlertTitle>{t("expiredTitle")}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{t(expiredReasonKey)}</p>
            <p className="text-xs text-muted-foreground">{t("expiredKeepData")}</p>
            {status.appConfigured && <div className="pt-1">{connectButton(t("reconnectButton"))}</div>}
          </AlertDescription>
        </Alert>
      )}

      {!connection.authExpired && connection.apiState === "not_approved" && (
        <Alert variant="warning-soft">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>{t("apiNotApprovedTitle")}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{t("apiNotApprovedDesc")}</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>{t("apiNotApprovedStep1")}</li>
              <li>{t("apiNotApprovedStep2")}</li>
              <li>{t("apiNotApprovedStep3")}</li>
            </ol>
            <a
              href={API_ACCESS_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("apiNotApprovedLink")}
            </a>
            {apiStateSince && <p className="text-xs text-muted-foreground">{t("apiStateSince", { date: apiStateSince })}</p>}
          </AlertDescription>
        </Alert>
      )}

      {!connection.authExpired && connection.apiState === "api_disabled" && (
        <Alert variant="warning-soft">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>{t("apiDisabledTitle")}</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{t("apiDisabledDesc")}</p>
            {apiStateSince && <p className="text-xs text-muted-foreground">{t("apiStateSince", { date: apiStateSince })}</p>}
          </AlertDescription>
        </Alert>
      )}

      {!connection.authExpired && connection.apiState === "quota" && (
        <Alert variant="info-soft">
          <Gauge className="h-4 w-4" />
          <AlertTitle>{t("apiQuotaTitle")}</AlertTitle>
          <AlertDescription>{t("apiQuotaDesc")}</AlertDescription>
        </Alert>
      )}

      {!connection.authExpired && connection.apiState === "error" && (
        <Alert variant="warning-soft">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("apiErrorTitle")}</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{t("apiErrorDesc")}</p>
            {apiStateSince && <p className="text-xs text-muted-foreground">{t("apiStateSince", { date: apiStateSince })}</p>}
          </AlertDescription>
        </Alert>
      )}

      {!connection.authExpired && partialRead && (
        <Alert variant="warning-soft">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("partialReadTitle", { count: partialRead.failedAccounts })}</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{t("partialReadDesc", { code: partialRead.code || "-" })}</p>
            {partialReadSince && <p className="text-xs text-muted-foreground">{t("apiStateSince", { date: partialReadSince })}</p>}
          </AlertDescription>
        </Alert>
      )}

      <div className={canManage ? "grid gap-4 lg:grid-cols-3" : "grid gap-4"}>
        <div className={canManage ? "lg:col-span-2" : undefined}>
          <GoogleConnectionCard status={status} onStatusChange={handleStatusChange} onReload={handleConnectionReload} />
        </div>
        {canManage && (
          <GoogleAlertSettings
            alert={connection.alert}
            onSaved={(alert) => applyStatus({ ...status, connection: { ...connection, alert } })}
          />
        )}
      </div>

      {locations.length > 0 && activeCount === 0 && (
        <Alert variant="info-soft">
          <Star className="h-4 w-4" />
          <AlertDescription>{t("noActiveLocations")}</AlertDescription>
        </Alert>
      )}

      {/* Filtros: valem para o resumo e para a lista */}
      <div className="flex flex-wrap items-end gap-3">
        {locations.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs">{t("filterLocation")}</Label>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-full min-w-[12rem] sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterLocationAll")}</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>{googleLocationLabel(t, l)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">{t("filterPeriod")}</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("periodAll")}</SelectItem>
              <SelectItem value="30">{t("period30")}</SelectItem>
              <SelectItem value="90">{t("period90")}</SelectItem>
              <SelectItem value="365">{t("period365")}</SelectItem>
              <SelectItem value="custom">{t("periodCustom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="google-period-from" className="text-xs">{t("periodFrom")}</Label>
              <Input id="google-period-from" type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="google-period-to" className="text-xs">{t("periodTo")}</Label>
              <Input id="google-period-to" type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
            </div>
          </>
        )}
        <div className="pb-2">
          <GoogleInfoTip text={t("filtersTip")} label={t("infoLabel")} />
        </div>
      </div>

      <GoogleReviewsSummary locationId={locationId} from={from} to={to} reloadKey={reloadKey} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <GoogleReviewsList
            locationId={locationId}
            from={from}
            to={to}
            showLocation={locations.length > 1 && !locationId}
            reloadKey={reloadKey}
            onLoaded={handleListLoaded}
          />
        </CardContent>
      </Card>
    </div>
  );
}
