"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServiceWorkerUpdate } from "@/hooks/use-service-worker-update";
import { useTranslations } from "next-intl";

// Dismissal por sessão: some ao clicar em "Depois" e reaparece em nova
// sessão/aba (sessionStorage). Um update aplicado limpa a flag junto com o
// sessionStorage.clear() do clearCacheAndReload.
const DISMISS_KEY = "sw_update_dismissed";

export function UpdateNotification() {
  const { updateAvailable, clearCacheAndReload } = useServiceWorkerUpdate();
  const t = useTranslations("updateNotification");
  const tBilling = useTranslations("billingAlertBanner");
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const updatingRef = useRef(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) setDismissed(true);
    } catch {
      // noop
    }
  }, []);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // noop
    }
    setDismissed(true);
  };

  const handleUpdate = async () => {
    // Re-entrancy guard: a synchronous ref blocks the rapid double-click window
    // before React re-renders with the disabled/loading button.
    if (updatingRef.current) return;
    updatingRef.current = true;
    setIsUpdating(true);
    try {
      await clearCacheAndReload();
      // On success the page navigates away, so this never resolves to re-enable.
    } finally {
      // Only reached when the reload was blocked (loop guard) — allow a retry.
      updatingRef.current = false;
      setIsUpdating(false);
    }
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg"
    >
      <RefreshCw className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm">{t("newVersionAvailable")}</span>
      <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={isUpdating}>
        {/* Usa updateNotification.later se existir nos locales; até lá cai no
            "Dispensar" (billingAlertBanner.dismiss), presente nos 13 idiomas. */}
        {t.has("later") ? t("later") : tBilling("dismiss")}
      </Button>
      <Button size="sm" onClick={handleUpdate} loading={isUpdating}>
        {isUpdating ? t("updating") : t("updateNow")}
      </Button>
    </div>
  );
}
