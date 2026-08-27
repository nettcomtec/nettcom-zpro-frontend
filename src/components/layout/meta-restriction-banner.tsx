"use client";

// F2 PASSO 5 — Banner persistente quando há restrição Meta:
//  - Disassociated socket (algum canal foi desassociado pelo policy job)
//  - oauthBlocked = true (licença bloqueada para conectar novos canais)
// Não bloqueia UI; só informa.

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ShieldAlert, X, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";
import { toast } from "sonner";

const POLL_MS = 5 * 60 * 1000;
const DISMISS_KEY = "metaRestrictionBannerDismissedAt";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

interface HealthSnapshot {
  oauthBlocked: boolean;
  oauthBlockedReason?: string | null;
  counts?: { phonesDisassociated: number };
}

export function MetaRestrictionBanner() {
  const t = useTranslations("metaHealth");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId;
  const isSuperadmin = user?.profile === "superadmin";
  const [data, setData] = useState<HealthSnapshot | null>(null);
  const [hasDisassoc, setHasDisassoc] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [forcing, setForcing] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSuperadmin) return;
    try {
      const resp = await api.get("/license/health");
      setData(resp.data);
      setHasDisassoc(((resp.data?.counts?.phonesDisassociated ?? 0) as number) > 0);
    } catch {
      // 404 LICENSE_NOT_OBSERVED_YET ou unreachable — silencia
    }
  }, [isSuperadmin]);

  useEffect(() => {
    if (!isSuperadmin) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [isSuperadmin, refresh]);

  // Socket: meta:disassociated → marca disassoc + refresh
  useEffect(() => {
    if (!tenantId) return;
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_TTL_MS) {
        setDismissed(true);
      }
    } catch {}
  }, [tenantId]);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  // Força pull + report manual (mesmo endpoint do card em /assinatura) e relê a saúde
  // sem aguardar o job de 6h. Após o report, o proxy registra a license-health.
  const handleForceRefresh = async () => {
    setForcing(true);
    try {
      const resp = await api.post("/meta/phone-health/force-refresh");
      const r = resp.data;
      const reportTotal = r?.report?.totalPhones ?? 0;
      const reason = r?.report?.reason;
      await new Promise(res => setTimeout(res, 1500));
      await refresh();
      if (reason === "no_license") toast.warning(t("error.not_configured"));
      else if (reason === "all_endpoints_failed") toast.error(t("forceError"));
      else if (reportTotal === 0) toast.info(t("forceNoData"));
      else toast.success(t("forceSuccess"));
    } catch (err: any) {
      if (err?.response?.status === 403) toast.error(t("forceForbidden"));
      else toast.error(t("forceError"));
    } finally {
      setForcing(false);
    }
  };

  if (!isSuperadmin) return null;
  if (dismissed) return null;
  if (!data?.oauthBlocked && !hasDisassoc) return null;

  const isBlock = !!data?.oauthBlocked;
  const message = isBlock
    ? t("oauthBlocked")
    : t("bannerDisassociated");

  return (
    <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 px-4 py-2 flex items-center gap-3 text-sm">
      <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-red-900 dark:text-red-200 font-medium">{message}</span>
        {isBlock && data?.oauthBlockedReason && (
          <span className="text-red-700 dark:text-red-300 ml-2">
            ({data.oauthBlockedReason})
          </span>
        )}
      </div>
      <button
        onClick={handleForceRefresh}
        disabled={forcing}
        className="inline-flex items-center gap-1 text-red-700 dark:text-red-300 underline hover:text-red-900 dark:hover:text-red-100 shrink-0 disabled:opacity-60 disabled:no-underline"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${forcing ? "animate-spin" : ""}`} />
        {forcing ? t("forcingNow") : t("forceRefreshNow")}
      </button>
      <Link
        href="/assinatura"
        className="text-red-700 dark:text-red-300 underline hover:text-red-900 dark:hover:text-red-100 shrink-0"
      >
        {t("title")}
      </Link>
      <button
        onClick={handleDismiss}
        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
