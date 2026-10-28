"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, ExternalLink, HelpCircle, Link2, Loader2, LogOut, MapPin, Star, Store, UserCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { cn } from "@/lib/utils";
import {
  disconnectGoogleBusiness,
  setGoogleBusinessActiveLocations,
  // Alias: o nome começa com "use" e a regra de hooks do lint o trataria como hook.
  useGoogleBusinessLocationReviewLink as applyGoogleBusinessLocationReviewLink,
  type GoogleBusinessLocationDTO,
  type GoogleBusinessStatus,
} from "@/services/google-business";

type GoogleReviewsT = ReturnType<typeof useTranslations>;

/** Código de erro do backend → chave de `googleReviews.*`. */
const ERROR_KEYS: Record<string, string> = {
  ERR_GOOGLE_BUSINESS_NOT_CONNECTED: "errNotConnected",
  ERR_GOOGLE_BUSINESS_SYNC_THROTTLED: "errSyncThrottled",
  ERR_GOOGLE_BUSINESS_FRONTEND_URL: "errFrontendUrl",
  ERR_GOOGLE_BUSINESS_PROXY_OUTDATED: "errProxyOutdated",
  ERR_GOOGLE_BUSINESS_STATE_INVALID: "errStateInvalid",
  ERR_GOOGLE_BUSINESS_FORBIDDEN: "errForbidden",
  ERR_NO_PERMISSION: "errForbidden",
  ERR_GOOGLE_REVIEW_REPLY_TOO_LONG: "errReplyTooLong",
  ERR_GOOGLE_REVIEW_REPLY_REJECTED: "errReplyRejected",
  ERR_GOOGLE_REVIEW_REPLY_CHANGED: "errReplyChanged",
  ERR_GOOGLE_REVIEW_NOT_FOUND: "errReviewNotFound",
  ERR_GOOGLE_BUSINESS_API: "errGoogleApi",
  ERR_COPILOT_NO_API_KEY: "errCopilotNoKey",
  ERR_NO_GOOGLE_APP_CONFIGURED: "errNoGoogleApp",
  ERR_PLATFORM_GOOGLE_APP_DISABLED: "errPlatformAppDisabled",
  ERR_GOOGLE_BUSINESS_UNAVAILABLE: "errUnavailable",
  ERR_GOOGLE_REVIEW_URL_INVALID: "errReviewUrlInvalid",
  ERR_GOOGLE_BUSINESS_AUTH_EXPIRED: "errAuthExpired",
  ERR_GOOGLE_BUSINESS_LOCATION_NOT_FOUND: "locationErrorNotFound",
  ERR_GOOGLE_REVIEW_REPLY_IN_PROGRESS: "errReplyInProgress",
  ERR_GOOGLE_REVIEW_SUGGEST_FAILED: "errSuggestFailed",
};

const statusOf = (err: unknown): number | undefined => {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
};

/**
 * Texto traduzido do erro de uma ação da aba Google. `null` = não mostrar nada
 * (o interceptor já avisou: recurso fora do plano).
 */
export function googleBusinessErrorText(t: GoogleReviewsT, err: unknown): string | null {
  const code = getBackendErrorCode(err);
  if (code === "ERR_FEATURE_NOT_IN_PLAN") return null;
  const key = ERROR_KEYS[code];
  if (key) return t(key);
  if (statusOf(err) === 429) return t("errSyncThrottled");
  return t("errGeneric");
}

export function isGoogleBusinessThrottled(err: unknown): boolean {
  return getBackendErrorCode(err) === "ERR_GOOGLE_BUSINESS_SYNC_THROTTLED" || statusOf(err) === 429;
}

/**
 * Dica "?" que abre no passar do mouse E no toque (celular/PWA não tem hover).
 */
export function GoogleInfoTip({ text, label, className }: { text: React.ReactNode; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className={cn(
              "inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              className,
            )}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" collisionPadding={16} className="max-w-[20rem] whitespace-normal text-xs font-normal leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Data/hora curta no idioma da tela; vazio para valor ilegível. */
export function formatGoogleDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return formatDateTime(d, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toLocaleString();
  }
}

export function formatGoogleRating(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return formatNumber(Number(value), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function googleLocationLabel(t: GoogleReviewsT, loc: { id: number; title: string | null; address?: string | null }): string {
  return (loc.title || "").trim() || (loc.address || "").trim() || t("locationUntitled");
}

function locationErrorKey(code: string): string {
  const c = code.toLowerCase();
  if (c.includes("not_found") || c === "404") return "locationErrorNotFound";
  if (c.includes("not_verified") || c.includes("unverified")) return "locationErrorNotVerified";
  if (c.includes("suspend") || c.includes("disabled")) return "locationErrorSuspended";
  return "locationErrorGeneric";
}

const safeExternalUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  return /^https:\/\//i.test(url) ? url : null;
};

interface GoogleConnectionCardProps {
  status: GoogleBusinessStatus;
  /** Status novo devolvido pelo backend (troca de fichas). */
  onStatusChange: (status: GoogleBusinessStatus) => void;
  /** Recarregar o status do servidor (depois de desconectar, ou resposta sem status). */
  onReload: () => void;
}

export function GoogleConnectionCard({ status, onStatusChange, onReload }: GoogleConnectionCardProps) {
  const t = useTranslations("googleReviews");
  const connection = status.connection;
  const canManage = status.canManage === true;
  const [savingLocationId, setSavingLocationId] = useState<number | null>(null);
  const [linkLocationId, setLinkLocationId] = useState<number | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  if (!connection) return null;
  const locations = Array.isArray(connection.locations) ? connection.locations : [];

  const toggleLocation = async (loc: GoogleBusinessLocationDTO, next: boolean) => {
    if (!canManage || savingLocationId !== null) return;
    const activeIds = locations.filter((l) => l.isActive).map((l) => l.id);
    const ids = next
      ? Array.from(new Set([...activeIds, loc.id]))
      : activeIds.filter((id) => id !== loc.id);
    setSavingLocationId(loc.id);
    try {
      const { data } = await setGoogleBusinessActiveLocations(ids);
      if (data && typeof data === "object" && "connection" in data) onStatusChange(data);
      else onReload();
      toast.success(next ? t("locationActivated") : t("locationDeactivated"));
    } catch (err) {
      const msg = googleBusinessErrorText(t, err);
      if (msg) toast.error(msg);
      onReload();
    } finally {
      setSavingLocationId(null);
    }
  };

  const applyLink = async (loc: GoogleBusinessLocationDTO) => {
    if (!canManage || linkLocationId !== null) return;
    setLinkLocationId(loc.id);
    try {
      await applyGoogleBusinessLocationReviewLink(loc.id);
      toast.success(t("useReviewLinkDone"), { description: t("useReviewLinkDoneDesc") });
    } catch (err) {
      const msg = googleBusinessErrorText(t, err);
      if (msg) toast.error(msg);
    } finally {
      setLinkLocationId(null);
    }
  };

  const handleDisconnect = async () => {
    if (!canManage) return;
    setDisconnecting(true);
    try {
      await disconnectGoogleBusiness();
      toast.success(t("disconnected"));
      setDisconnectOpen(false);
      onReload();
    } catch (err) {
      const msg = googleBusinessErrorText(t, err);
      if (msg) toast.error(msg);
    } finally {
      setDisconnecting(false);
    }
  };

  const connectedAt = formatGoogleDateTime(connection.connectedAt);
  const lastSync = formatGoogleDateTime(connection.lastSyncAt);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCircle2 className="h-4 w-4 text-muted-foreground" />
              {t("connectionTitle")}
              <GoogleInfoTip text={t("connectionTip")} label={t("infoLabel")} />
            </CardTitle>
            <p className="text-sm break-all">
              {connection.accountEmail ? t("connectedAs", { email: connection.accountEmail }) : t("connectedAccountUnknown")}
            </p>
            <p className="text-xs text-muted-foreground">
              {connectedAt ? t("connectedSince", { date: connectedAt }) : null}
              {connectedAt ? " · " : null}
              {lastSync ? t("lastSync", { date: lastSync }) : t("lastSyncNever")}
            </p>
          </div>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDisconnectOpen(true)}
            >
              <LogOut className="h-4 w-4" />
              {t("disconnect")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Store className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("locationsTitle")}</span>
          <GoogleInfoTip text={t("locationsTip")} label={t("infoLabel")} />
        </div>

        {locations.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("locationsEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {locations.map((loc) => {
              const label = googleLocationLabel(t, loc);
              const rating = formatGoogleRating(loc.averageRating);
              const total = Number(loc.totalReviewCount ?? 0);
              const mapsUrl = safeExternalUrl(loc.mapsUri);
              const saving = savingLocationId === loc.id;
              const errorKey = loc.lastError ? locationErrorKey(loc.lastError) : null;
              return (
                <li key={loc.id} className={cn("rounded-lg border p-3", loc.isActive ? "bg-background" : "bg-muted/30")}>
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      {saving ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <Switch
                          checked={loc.isActive === true}
                          disabled={!canManage || savingLocationId !== null}
                          onCheckedChange={(v) => toggleLocation(loc, v)}
                          aria-label={`${t("locationActiveLabel")}: ${label}`}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium break-words">{label}</p>
                      {loc.address && loc.title && (
                        <p className="flex items-start gap-1 text-xs text-muted-foreground break-words">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          {loc.address}
                        </p>
                      )}
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {rating ? t("locationRating", { rating, count: total }) : t("locationNoRating")}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {loc.isActive && !loc.historyImported && (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="info-soft" className="gap-1 font-normal">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {t("locationImporting")}
                            </Badge>
                            <GoogleInfoTip text={t("locationImportingTip")} label={t("infoLabel")} />
                          </span>
                        )}
                        {errorKey && (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="destructive-soft" className="gap-1 font-normal">
                              <AlertTriangle className="h-3 w-3" />
                              {t(errorKey)}
                            </Badge>
                            <GoogleInfoTip text={t("locationErrorTip")} label={t("infoLabel")} />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                        {canManage && loc.newReviewUri && (
                          <span className="inline-flex items-center gap-1">
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto whitespace-normal p-0 text-left text-xs"
                              disabled={linkLocationId !== null}
                              onClick={() => applyLink(loc)}
                            >
                              {linkLocationId === loc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                              {t("useReviewLink")}
                            </Button>
                            <GoogleInfoTip text={t("useReviewLinkTip")} label={t("infoLabel")} />
                          </span>
                        )}
                        {mapsUrl && (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t("openInMaps")}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!canManage && <p className="text-xs text-muted-foreground">{t("manageOnlyHint")}</p>}
      </CardContent>

      <AlertDialog open={disconnectOpen} onOpenChange={(o) => { if (!disconnecting) setDisconnectOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disconnectTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{t("disconnectDesc")}</p>
                <p>
                  {t.rich("disconnectRevokeHint", {
                    link: (chunks) => (
                      <a
                        href="https://myaccount.google.com/permissions"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
                <p>{t("disconnectLinkKept")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>{t("cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={disconnecting}
              onClick={handleDisconnect}
            >
              {t("disconnectConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
