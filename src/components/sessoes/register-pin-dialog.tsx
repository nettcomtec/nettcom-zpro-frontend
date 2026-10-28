"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Dices, Info, KeyRound, Loader2, ShieldCheck } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { registerPhone, setPhonePin } from "@/services/waba-meta";
import { invalidateWabaPinPendingCache, useWabaPinPending } from "@/hooks/use-waba-pin-pending";
import type { Whatsapp } from "@/services/whatsapp";
import { generateRandomPin } from "@/lib/waba-pin";

interface Props {
  channel: Whatsapp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  // "Definir novo PIN" exige `sessions_manage` no servidor: sem ela, só registrar.
  canSetPin?: boolean;
}

type Mode = "register" | "new";

// Códigos da Meta para "o PIN informado não confere com o do número" — nesse caso
// o caminho é definir um PIN novo.
const PIN_MISMATCH_CODES = new Set([133005]);

// Códigos do servidor para o "definir novo PIN" que têm texto próprio na tela; o
// resto (texto da Meta, já localizado) é mostrado como veio.
const SET_PIN_ERROR_KEYS: Record<string, string> = {
  ERR_INVALID_PIN: "registerPinInvalid",
  ERR_WABA_CREDENTIALS_MISSING: "registerPinMissingCreds",
  ERR_WHATSAPP_NOT_FOUND: "registerPinChannelNotFound",
  ERR_WHATSAPP_ID_REQUIRED: "registerPinChannelNotFound",
  ERR_SET_PIN_FAILED: "registerPinNewError",
  ERR_META_UNAVAILABLE: "registerPinMetaUnavailable",
};

function readError(err: any): { status?: number; error?: string; code?: number | string } {
  // api.ts interceptor rejeita com o Response direto (err.data), não err.response
  const status = err?.status ?? err?.response?.status;
  const data = err?.data ?? err?.response?.data;
  const obj = data && typeof data === "object" ? data : null;
  const error = obj?.error ?? obj?.message;
  return {
    status: typeof status === "number" ? status : undefined,
    error: typeof error === "string" ? error : undefined,
    code: obj?.code,
  };
}

export function RegisterPinDialog({ channel, open, onOpenChange, onSuccess, canSetPin = true }: Props) {
  const t = useTranslations("sessoesPage");
  const [mode, setMode] = useState<Mode>("register");
  const [pin, setPin] = useState("");
  const [noted, setNoted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin("");
      setMode("register");
      setNoted(false);
      setCopied(false);
      setMismatch(false);
    }
  }, [open]);

  const phoneNumberId = channel?.tokenAPI || "";
  const wabaToken = channel?.bmToken || "";
  const wabaVersion = channel?.wabaVersion || "v19.0";
  const missingCreds = !phoneNumberId || !wabaToken;

  // Número ainda pendente de registro? Decide se o "definir novo PIN" já registra em
  // seguida. Mesma consulta (em cache) do aviso "Pendente" do card.
  const { pending } = useWabaPinPending({
    type: channel?.type,
    tokenAPI: channel?.tokenAPI,
    bmToken: channel?.bmToken,
    wabaVersion: channel?.wabaVersion,
    webhookOrigin: channel?.webhookOrigin,
    wabaId: channel?.status === "CONNECTED" ? channel?.wabaId : null,
    enabled: open && !!channel,
  });

  function changePin(next: string) {
    setPin(next);
    setNoted(false);
    setCopied(false);
  }

  async function copyPin() {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      toast.success(t("registerPinCopied"));
    } catch {
      // sem acesso à área de transferência: o PIN segue visível para anotar
    }
  }

  // Registra o número com o PIN atual. Devolve true no sucesso.
  async function doRegister(currentPin: string): Promise<boolean> {
    try {
      await registerPhone({
        phoneNumberId,
        wabaVersion,
        wabaToken,
        pin: currentPin,
      });
      toast.success(t("registerPinSuccess"));
      // Mark cache as not-pending immediately (Meta status may take
      // a few minutes to flip from PENDING to CONNECTED).
      invalidateWabaPinPendingCache({ phoneNumberId, markRegistered: true });
      return true;
    } catch (err: any) {
      const { error, code } = readError(err);
      if (error === "ERR_NO_PERMISSION") return false; // aviso global de permissão já aparece
      const numericCode = Number(code);
      if (PIN_MISMATCH_CODES.has(numericCode)) setMismatch(true);
      const msg = error === "ERR_WHATSAPP_NOT_FOUND" ? t("registerPinChannelNotFound") : error;
      toast.error(msg || t("registerPinError"));
      return false;
    }
  }

  async function submitRegister() {
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
    setMismatch(false);
    try {
      const ok = await doRegister(pin);
      if (ok) {
        onOpenChange(false);
        onSuccess?.();
      }
    } finally {
      setSubmitting(false);
    }
  }

  // "Definir novo PIN" (D16): grava o PIN novo na Meta pelo canal (o servidor usa o
  // token do canal) e, se o número ainda está pendente de registro, registra em
  // seguida com o mesmo PIN. Número já registrado só troca o PIN.
  async function submitNewPin() {
    if (!channel) return;
    if (!/^\d{6}$/.test(pin)) {
      toast.error(t("registerPinInvalid"));
      return;
    }
    if (!noted) return;
    setSubmitting(true);
    setMismatch(false);
    try {
      try {
        await setPhonePin({ whatsappId: Number(channel.id), pin });
      } catch (err: any) {
        const { status, error, code } = readError(err);
        // 404 sem o código do canal = servidor sem a rota (versão antiga).
        if (status === 404 && error !== "ERR_WHATSAPP_NOT_FOUND") {
          toast.error(t("registerPinUpdateSystem"));
          return;
        }
        if (error === "ERR_NO_PERMISSION") return; // aviso global de permissão já aparece
        const key = error ? SET_PIN_ERROR_KEYS[error] : undefined;
        const base = key ? t(key as Parameters<typeof t>[0]) : (error || t("registerPinNewError"));
        toast.error(code !== undefined && code !== null && !key ? `${base} (${code})` : base);
        return;
      }
      toast.success(t("registerPinNewSuccess"));
      if (pending === true && !missingCreds) {
        const ok = await doRegister(pin);
        if (!ok) {
          // O PIN novo já vale: deixa o diálogo no modo de registro com ele preenchido
          // para tentar de novo sem gerar outro.
          setMode("register");
          return;
        }
      }
      onOpenChange(false);
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  }

  const pinComplete = /^\d{6}$/.test(pin);
  const submitDisabled =
    submitting ||
    !pinComplete ||
    (mode === "register" ? missingCreds : !noted);

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
            {mode === "register" ? t("registerPinDesc") : t("registerPinNewHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {canSetPin && (
          <div className="flex items-center gap-2">
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as Mode);
                setNoted(false);
                setMismatch(false);
              }}
              className="flex-1 min-w-0"
            >
              <TabsList className="grid w-full grid-cols-2 h-auto">
                <TabsTrigger value="register" className="text-xs sm:text-sm whitespace-normal py-1.5" disabled={submitting}>
                  <ShieldCheck className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                  {t("registerPin")}
                </TabsTrigger>
                <TabsTrigger value="new" className="text-xs sm:text-sm whitespace-normal py-1.5" disabled={submitting}>
                  <KeyRound className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                  {t("registerPinModeNew")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                    aria-label={t("registerPinModeNewTooltip")}
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {t("registerPinModeNewTooltip")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          )}

          <div className="space-y-1">
            <Label>{t("registerPinLabel")}</Label>
            <div className="flex gap-2">
              <Input
                value={pin}
                onChange={(e) => changePin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                className="flex-shrink-0"
                onClick={() => changePin(generateRandomPin())}
                disabled={submitting}
                title={t("registerPinGenerate")}
              >
                <Dices className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("registerPinGenerate")}</span>
              </Button>
            </div>
            {mode === "register" && (
              <p className="text-[11px] text-muted-foreground">{t("registerPinHint")}</p>
            )}
          </div>

          {mode === "register" && mismatch && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div className="space-y-1.5 min-w-0">
                <p>{t("registerPinMismatchHint")}</p>
                {canSetPin && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setMode("new");
                    setMismatch(false);
                    setNoted(false);
                  }}
                >
                  <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                  {t("registerPinModeNew")}
                </Button>
                )}
              </div>
            </div>
          )}

          {mode === "new" && pinComplete && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 dark:border-amber-700 dark:bg-amber-950/30">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                {t("registerPinWriteDown")}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-2xl tracking-[0.3em] font-semibold text-foreground break-all">
                  {pin}
                </span>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={copyPin}>
                  {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  {t("registerPinCopy")}
                </Button>
              </div>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={noted}
                  onCheckedChange={(v) => setNoted(v === true)}
                  className="mt-0.5"
                />
                <span>{t("registerPinNoted")}</span>
              </label>
            </div>
          )}

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
          <Button
            onClick={mode === "register" ? submitRegister : submitNewPin}
            disabled={submitDisabled}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : mode === "register" ? (
              <ShieldCheck className="w-4 h-4 mr-2" />
            ) : (
              <KeyRound className="w-4 h-4 mr-2" />
            )}
            {mode === "register" ? t("registerPinSubmit") : t("registerPinNewSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
