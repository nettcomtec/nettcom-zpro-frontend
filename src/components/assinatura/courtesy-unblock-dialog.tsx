"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const ERR_MAP: Record<string, string> = {
  ERR_COURTESY_NOT_BLOCKED: "errNotBlocked",
  ERR_COURTESY_BLOCKING_NUMBERS: "errBlocking",
  ERR_COURTESY_COOLDOWN: "errCooldown",
  ERR_CONSENT_REQUIRED: "errConsent",
  ERR_COURTESY_UNAVAILABLE: "errUnavailable",
  ERR_COURTESY_PROXY_UNREACHABLE: "errUnreachable",
  ERR_LICENSE_NOT_CONFIGURED: "errLicenseNotConfigured",
  ERR_NO_PERMISSION: "errNoPermission",
  ERR_COURTESY_FAILED: "errGeneric",
};

function extractErrData(err: any): { code: string; nextEligibleAt?: string | null } {
  const data = err?.response?.data || err?.data || {};
  return { code: data.error || "generic", nextEligibleAt: data.nextEligibleAt ?? null };
}

export function CourtesyUnblockDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const t = useTranslations("metaHealth.courtesy");
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(v: boolean) {
    if (!v) {
      setAccept(false);
      setSubmitting(false);
    }
    onOpenChange(v);
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await api.post("/meta/phone-health/courtesy-unblock", { acceptCourtesyTerms: true });
      toast.success(t("success"));
      onDone?.();
      handleOpenChange(false);
    } catch (err: any) {
      const { code, nextEligibleAt } = extractErrData(err);
      const key = ERR_MAP[code] || "errGeneric";
      // Cooldown: mostra a data real da proxima janela em vez do texto generico.
      if (key === "errCooldown" && nextEligibleAt) {
        let when = nextEligibleAt;
        try { when = new Date(nextEligibleAt).toLocaleString("pt-BR"); } catch { /* keep raw */ }
        toast.error(t("cooldown", { date: when }));
      } else {
        toast.error(t(key));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            {t("dialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("dialogIntro")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
            <li>{t("term1")}</li>
            <li>{t("term2")}</li>
            <li>{t("term3")}</li>
          </ul>
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-0.5" />
            <span className="text-xs">{t("accept")}</span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button disabled={!accept || submitting} onClick={handleConfirm}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("confirming")}
              </>
            ) : (
              t("confirm")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
