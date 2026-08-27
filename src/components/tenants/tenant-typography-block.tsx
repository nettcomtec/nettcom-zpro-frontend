"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  fetchTenantTypography,
  saveTenantTypography,
  type EffectiveTypography,
} from "@/services/typography";
import { CURATED_FONTS, DEFAULT_FONT_NAME } from "@/lib/google-fonts";
import { Loader2 } from "lucide-react";

const INHERIT = "__inherit__";

interface Props {
  tenantId: number;
}

export function TenantTypographyBlock({ tenantId }: Props) {
  const t = useTranslations("tenantsPage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<EffectiveTypography | null>(null);
  const [familyChoice, setFamilyChoice] = useState<string>(INHERIT);
  const [sourceChoice, setSourceChoice] = useState<string>(INHERIT);
  const [shapeChoice, setShapeChoice] = useState<string>(INHERIT);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await fetchTenantTypography(tenantId);
      setData(d);
      setFamilyChoice(d.inheritsFromGlobal.fontFamily ? INHERIT : d.fontFamily);
      setSourceChoice(d.inheritsFromGlobal.fontSource ? INHERIT : d.fontSource);
      setShapeChoice(d.inheritsFromGlobal.avatarShape ? INHERIT : d.avatarShape);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId > 0) reload();
  }, [tenantId, reload]);

  async function onSave() {
    setSaving(true);
    try {
      await saveTenantTypography(tenantId, {
        fontFamily: familyChoice === INHERIT ? null : familyChoice,
        fontSource: sourceChoice === INHERIT ? null : (sourceChoice as "cdn" | "selfhost"),
        avatarShape: shapeChoice === INHERIT ? null : (shapeChoice as "circle" | "rounded-square"),
      });
      toast.success(t("typographyTenantSaved"));
      await reload();
    } catch {
      toast.error(t("typographyTenantSaveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t("typographyTenantTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("typographyTenantHint")}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("typographyTenantFontLabel")}</Label>
          <Select value={familyChoice} onValueChange={setFamilyChoice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT}>{t("typographyTenantInherit")}</SelectItem>
              {CURATED_FONTS.map(f => (
                <SelectItem key={f.name} value={f.name}>
                  {f.name === DEFAULT_FONT_NAME ? `${f.name} ${t("typographyTenantFontDefaultBadge")}` : f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("typographyTenantSourceLabel")}</Label>
          <Select value={sourceChoice} onValueChange={setSourceChoice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT}>{t("typographyTenantInherit")}</SelectItem>
              <SelectItem value="cdn">{t("typographyTenantSourceCdn")}</SelectItem>
              <SelectItem value="selfhost">{t("typographyTenantSourceSelfHost")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("typographyTenantShapeLabel")}</Label>
          <Select value={shapeChoice} onValueChange={setShapeChoice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT}>{t("typographyTenantInherit")}</SelectItem>
              <SelectItem value="circle">{t("typographyTenantShapeCircle")}</SelectItem>
              <SelectItem value="rounded-square">{t("typographyTenantShapeRoundedSquare")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t("typographyTenantEffective")}: <span className="font-medium">{data.fontFamily}</span> · {data.fontSource} · {data.avatarShape}
      </p>

      <div>
        <Button variant="outline" size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {t("typographyTenantSaveBtn")}
        </Button>
      </div>
    </div>
  );
}
