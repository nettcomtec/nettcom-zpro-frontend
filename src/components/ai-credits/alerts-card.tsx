"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  aiCreditsErrorKey,
  centsToReaisInput,
  parseReaisToCents,
} from "@/components/ai-credits/topup-dialog";
import { updateAiCreditsAlerts, type AiCreditsStatusResponse } from "@/services/ai-credits";

// Limite de aviso de saldo baixo, em reais. Campo vazio = null = a empresa usa o
// valor padrão da plataforma (é o servidor que decide qual é).

export interface AlertsCardProps {
  status: AiCreditsStatusResponse | null;
  /** Gravado: a página recarrega o status (o limite efetivo pode ter mudado). */
  onSaved?: () => void;
}

export function AlertsCard({ status, onSaved }: AlertsCardProps) {
  const t = useTranslations("aiCreditsPage");

  const customCents = status?.lowBalanceCustomCents;
  const effectiveCents = Number(status?.lowBalanceCents) || 0;

  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);

  // O que o tenant definiu; null = usa o padrão, então o campo nasce vazio.
  useEffect(() => {
    setValue(customCents == null ? "" : centsToReaisInput(Number(customCents) || 0));
    setInvalid(false);
  }, [customCents]);

  const handleSubmit = async () => {
    if (saving) return;

    const raw = value.trim();
    let next: number | null = null;
    if (raw) {
      const cents = parseReaisToCents(raw);
      if (cents === null || cents < 0) {
        setInvalid(true);
        toast.error(t("err_ERR_AI_CREDITS_INVALID_AMOUNT"));
        return;
      }
      next = cents;
    }

    setInvalid(false);
    setSaving(true);
    try {
      await updateAiCreditsAlerts(next);
      toast.success(t("alertsSaved"));
      onSaved?.();
    } catch (err: unknown) {
      toast.error(t(aiCreditsErrorKey(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-0">
        <CardTitle className="flex items-center gap-1.5">
          <BellRing className="h-4 w-4 shrink-0 text-muted-foreground" />
          {t("alertsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <form
          className="space-y-2"
          onSubmit={e => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <Label htmlFor="ai-credits-alert-threshold">{t("alertsThreshold")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[14rem]">
              <span className="shrink-0 text-sm text-muted-foreground">R$</span>
              <Input
                id="ai-credits-alert-threshold"
                inputMode="decimal"
                autoComplete="off"
                placeholder={effectiveCents > 0 ? centsToReaisInput(effectiveCents) : "0,00"}
                value={value}
                disabled={saving}
                aria-invalid={invalid || undefined}
                className={cn(
                  invalid && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
                )}
                onChange={e => {
                  setValue(e.target.value);
                  if (invalid) setInvalid(false);
                }}
              />
            </div>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
          <p className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
            {t("alertsNote")}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
