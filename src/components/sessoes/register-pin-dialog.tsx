"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Dices, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerPhone } from "@/services/waba-meta";
import { invalidateWabaPinPendingCache } from "@/hooks/use-waba-pin-pending";
import type { Whatsapp } from "@/services/whatsapp";
import { generateRandomPin } from "@/lib/waba-pin";

interface Props {
  channel: Whatsapp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RegisterPinDialog({ channel, open, onOpenChange, onSuccess }: Props) {
  const t = useTranslations("sessoesPage");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setPin("");
  }, [open]);

  const phoneNumberId = channel?.tokenAPI || "";
  const wabaToken = channel?.bmToken || "";
  const wabaVersion = channel?.wabaVersion || "v19.0";
  const missingCreds = !phoneNumberId || !wabaToken;

  async function submit() {
    if (!channel) return;
    if (!/^\d{6}$/.test(pin)) {
      toast.error(t("registerPinInvalid"));
      return;
    }
    if (missingCreds) {
      toast.error(t("registerPinMissingCreds"));
      return;
    }
    setSubmitting(true);
    try {
      await registerPhone({
        phoneNumberId,
        wabaVersion,
        wabaToken,
        pin,
      });
      toast.success(t("registerPinSuccess"));
      // Mark cache as not-pending immediately (Meta status may take
      // a few minutes to flip from PENDING to CONNECTED).
      invalidateWabaPinPendingCache({ phoneNumberId, markRegistered: true });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      // api.ts interceptor rejeita com o Response direto (err.data), não err.response
      const msg =
        err?.data?.error ??
        err?.response?.data?.error ??
        err?.data?.message ??
        err?.response?.data?.message;
      toast.error(msg || t("registerPinError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            {t("registerPinTitle")}
          </DialogTitle>
          <DialogDescription className="break-words">
            {channel?.name ? `${channel.name} · ` : ""}
            {t("registerPinDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label>{t("registerPinLabel")}</Label>
            <div className="flex gap-2">
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                className="flex-shrink-0"
                onClick={() => setPin(generateRandomPin())}
                disabled={submitting}
                title={t("registerPinGenerate")}
              >
                <Dices className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("registerPinGenerate")}</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("registerPinHint")}</p>
          </div>

          {missingCreds && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("registerPinMissingCreds")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting || pin.length !== 6 || missingCreds}>
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4 mr-2" />
            )}
            {t("registerPinSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
