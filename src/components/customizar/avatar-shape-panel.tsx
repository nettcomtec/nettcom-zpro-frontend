"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { fetchGlobalTypography, saveGlobalTypography } from "@/services/typography";
import { applyAvatarShape, type AvatarShape } from "@/lib/load-app-font";
import { useBrandingStore } from "@/stores/branding-store";
import { Loader2 } from "lucide-react";

export function AvatarShapePanel() {
  const t = useTranslations("customizarPage");
  const setTypography = useBrandingStore((s) => s.setTypography);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shape, setShape] = useState<AvatarShape>("circle");

  useEffect(() => {
    fetchGlobalTypography()
      .then(({ data }) => setShape(data.avatarShape || "circle"))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function onChange(v: string) {
    const next = v === "rounded-square" ? "rounded-square" : "circle";
    setShape(next);
    applyAvatarShape(next);
  }

  async function onSave() {
    setSaving(true);
    try {
      const { data } = await saveGlobalTypography({ avatarShape: shape });
      setTypography({ avatarShape: data.avatarShape });
      applyAvatarShape(data.avatarShape);
      try {
        const cur = JSON.parse(localStorage.getItem("zpro-branding") || "{}");
        localStorage.setItem("zpro-branding", JSON.stringify({ ...cur, avatarShape: data.avatarShape }));
      } catch { /* ignore */ }
      toast.success(t("avatarShapeSaved"));
    } catch {
      toast.error(t("typographySaveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("avatarShapeLabel")}</CardTitle>
        <CardDescription>{t("avatarShapeHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={shape} onValueChange={onChange} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-3 cursor-pointer rounded-md border p-3 hover:bg-accent/40">
            <RadioGroupItem value="circle" id="shape-circle" />
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5" data-avatar-shape="circle">
                <Avatar className="h-9 w-9" style={{ borderRadius: "9999px" }}>
                  <AvatarFallback style={{ borderRadius: "9999px", backgroundColor: "#7c3aed", color: "#fff" }}>A</AvatarFallback>
                </Avatar>
                <Avatar className="h-9 w-9" style={{ borderRadius: "9999px" }}>
                  <AvatarFallback style={{ borderRadius: "9999px", backgroundColor: "#0ea5e9", color: "#fff" }}>B</AvatarFallback>
                </Avatar>
              </div>
              <span className="text-sm font-medium">{t("avatarShapeCircle")}</span>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer rounded-md border p-3 hover:bg-accent/40">
            <RadioGroupItem value="rounded-square" id="shape-rounded" />
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <Avatar className="h-9 w-9" style={{ borderRadius: "0.5rem" }}>
                  <AvatarFallback style={{ borderRadius: "0.5rem", backgroundColor: "#7c3aed", color: "#fff" }}>A</AvatarFallback>
                </Avatar>
                <Avatar className="h-9 w-9" style={{ borderRadius: "0.5rem" }}>
                  <AvatarFallback style={{ borderRadius: "0.5rem", backgroundColor: "#0ea5e9", color: "#fff" }}>B</AvatarFallback>
                </Avatar>
              </div>
              <span className="text-sm font-medium">{t("avatarShapeRoundedSquare")}</span>
            </div>
          </label>
        </RadioGroup>
        <div>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t("typographySaveButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
