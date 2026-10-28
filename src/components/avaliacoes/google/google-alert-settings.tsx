"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellRing, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateGoogleBusinessAlert, type GoogleBusinessAlertDTO } from "@/services/google-business";
import { GoogleInfoTip, googleBusinessErrorText } from "./google-connection-card";

const MIN_HOURS = 1;
const MAX_HOURS = 720;

interface GoogleAlertSettingsProps {
  alert: GoogleBusinessAlertDTO;
  onSaved: (alert: GoogleBusinessAlertDTO) => void;
}

const clampStars = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 3;
};

export function GoogleAlertSettings({ alert, onSaved }: GoogleAlertSettingsProps) {
  const t = useTranslations("googleReviews");
  const [enabled, setEnabled] = useState(alert.enabled !== false);
  const [maxStars, setMaxStars] = useState(clampStars(alert.maxStars));
  const [hours, setHours] = useState(String(alert.hours ?? 24));
  const [saving, setSaving] = useState(false);

  // Outro gestor salvou (o status veio de novo pelo servidor): acompanha o gravado.
  useEffect(() => {
    setEnabled(alert.enabled !== false);
    setMaxStars(clampStars(alert.maxStars));
    setHours(String(alert.hours ?? 24));
  }, [alert.enabled, alert.maxStars, alert.hours]);

  const hoursNumber = Number(hours);
  const hoursValid = /^\d+$/.test(hours.trim()) && hoursNumber >= MIN_HOURS && hoursNumber <= MAX_HOURS;
  const dirty =
    enabled !== (alert.enabled !== false) ||
    maxStars !== clampStars(alert.maxStars) ||
    (hoursValid ? hoursNumber : NaN) !== Number(alert.hours);

  const handleSave = async () => {
    if (!hoursValid) {
      toast.error(t("alertHoursInvalid"));
      return;
    }
    setSaving(true);
    try {
      const payload: GoogleBusinessAlertDTO = { enabled, maxStars, hours: hoursNumber };
      const { data } = await updateGoogleBusinessAlert(payload);
      onSaved(data?.alert ?? payload);
      toast.success(t("alertSaved"));
    } catch (err) {
      const msg = googleBusinessErrorText(t, err);
      if (msg) toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-muted-foreground" />
          {t("alertTitle")}
          <GoogleInfoTip text={t("alertTip")} label={t("infoLabel")} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <Label htmlFor="google-alert-enabled" className="text-sm font-medium">{t("alertEnabledLabel")}</Label>
          <Switch id="google-alert-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("alertMaxStarsLabel")}</Label>
            <Select value={String(maxStars)} onValueChange={(v) => setMaxStars(clampStars(v))} disabled={!enabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>{t("alertStarsOption", { count: n })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="google-alert-hours" className="text-xs">{t("alertHoursLabel")}</Label>
            <Input
              id="google-alert-hours"
              type="number"
              inputMode="numeric"
              min={MIN_HOURS}
              max={MAX_HOURS}
              value={hours}
              disabled={!enabled}
              onChange={(e) => setHours(e.target.value)}
              aria-invalid={!hoursValid}
            />
            <p className={hoursValid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
              {hoursValid ? t("alertHoursHint") : t("alertHoursInvalid")}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {enabled && hoursValid
            ? t("alertSummary", { stars: maxStars, hours: hoursNumber })
            : t("alertDisabledNote")}
        </p>

        <Button size="sm" onClick={handleSave} disabled={!dirty || !hoursValid} loading={saving}>
          {!saving && <Save className="h-4 w-4" />}
          {t("alertSave")}
        </Button>
      </CardContent>
    </Card>
  );
}
