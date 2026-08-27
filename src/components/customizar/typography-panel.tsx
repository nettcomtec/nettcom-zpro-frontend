"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { fetchGlobalTypography, saveGlobalTypography, syncGlobalFont } from "@/services/typography";
import { CURATED_FONTS, DEFAULT_FONT_NAME, DEFAULT_WEIGHTS } from "@/lib/google-fonts";
import { loadAppFont, type FontSource } from "@/lib/load-app-font";
import { useBrandingStore } from "@/stores/branding-store";
import { Loader2 } from "lucide-react";

const ALL_WEIGHTS = ["400", "500", "600", "700"];

function patchBrandingCache(patch: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const cur = JSON.parse(localStorage.getItem("zpro-branding") || "{}");
    localStorage.setItem("zpro-branding", JSON.stringify({ ...cur, ...patch }));
  } catch { /* ignore */ }
}

export function TypographyPanel() {
  const t = useTranslations("customizarPage");
  const setTypography = useBrandingStore((s) => s.setTypography);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [family, setFamily] = useState<string>(DEFAULT_FONT_NAME);
  const [weights, setWeights] = useState<string[]>(DEFAULT_WEIGHTS);
  const [source, setSource] = useState<FontSource>("cdn");

  useEffect(() => {
    fetchGlobalTypography()
      .then(({ data }) => {
        setFamily(data.fontFamily || DEFAULT_FONT_NAME);
        setWeights((data.fontWeights || DEFAULT_WEIGHTS.join(",")).split(",").filter(Boolean));
        setSource(data.fontSource || "cdn");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function previewFont(nextFamily: string, nextWeights: string[], nextSource: FontSource) {
    const env = (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_API_URL) || "";
    loadAppFont({
      family: nextFamily,
      weights: nextWeights,
      source: nextSource,
      selfHostBaseUrl: `${env.replace(/\/$/, "")}/api/fonts`,
    });
  }

  function onChangeFamily(v: string) {
    setFamily(v);
    previewFont(v, weights, source);
  }

  function toggleWeight(w: string) {
    setWeights((prev) => {
      const set = new Set(prev);
      if (set.has(w)) set.delete(w);
      else set.add(w);
      const next = ALL_WEIGHTS.filter((x) => set.has(x));
      const final = next.length ? next : ["400"];
      previewFont(family, final, source);
      return final;
    });
  }

  function onChangeSource(v: string) {
    const s = v === "selfhost" ? "selfhost" : "cdn";
    setSource(s);
    previewFont(family, weights, s);
  }

  async function onSave() {
    setSaving(true);
    try {
      const { data } = await saveGlobalTypography({
        fontFamily: family,
        fontWeights: weights.join(","),
        fontSource: source,
      });
      setTypography({
        fontFamily: data.fontFamily,
        fontWeights: data.fontWeights,
        fontSource: data.fontSource,
      });
      patchBrandingCache({
        fontFamily: data.fontFamily,
        fontWeights: data.fontWeights,
        fontSource: data.fontSource,
      });
      toast.success(t("typographySaved"));
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string; savedWithFallback?: { fontSource?: string } } } };
      if (e?.response?.status === 502) {
        toast.error(t("typographySyncFailed"));
        if (e.response.data?.savedWithFallback?.fontSource === "cdn") {
          setSource("cdn");
        }
      } else {
        toast.error(t("typographySaveError"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setSaving(true);
    try {
      const { data } = await saveGlobalTypography({
        fontFamily: DEFAULT_FONT_NAME,
        fontWeights: DEFAULT_WEIGHTS.join(","),
        fontSource: "cdn",
      });
      setFamily(data.fontFamily);
      setWeights(data.fontWeights.split(","));
      setSource(data.fontSource);
      setTypography({
        fontFamily: data.fontFamily,
        fontWeights: data.fontWeights,
        fontSource: data.fontSource,
      });
      patchBrandingCache({
        fontFamily: data.fontFamily,
        fontWeights: data.fontWeights,
        fontSource: data.fontSource,
      });
      previewFont(data.fontFamily, data.fontWeights.split(","), data.fontSource);
      toast.success(t("typographyResetDone"));
    } catch {
      toast.error(t("typographySaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function onResync() {
    setSaving(true);
    try {
      await syncGlobalFont();
      toast.success(t("typographySaved"));
    } catch {
      toast.error(t("typographySyncFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />…</div>;
  }

  const selectedFont = CURATED_FONTS.find(f => f.name === family);
  const previewFontFamily = `"${selectedFont?.cssFamily || family}", ui-sans-serif, system-ui, -apple-system, sans-serif`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("typographyTitle")}</CardTitle>
        <CardDescription>{t("typographyDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 max-w-md">
          <Label>{t("typographyFontLabel")}</Label>
          <Select value={family} onValueChange={onChangeFamily}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURATED_FONTS.map(f => (
                <SelectItem key={f.name} value={f.name}>
                  {f.name === DEFAULT_FONT_NAME ? `${f.name} ${t("typographyFontDefaultBadge")}` : f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2 max-w-md">
          <Label>{t("typographyWeightsLabel")}</Label>
          <div className="flex flex-wrap gap-3">
            {ALL_WEIGHTS.map(w => (
              <label key={w} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={weights.includes(w)}
                  onCheckedChange={() => toggleWeight(w)}
                />
                <span style={{ fontWeight: Number(w) }}>{w}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-2 max-w-md">
          <Label>{t("typographySourceLabel")}</Label>
          <RadioGroup value={source} onValueChange={onChangeSource} className="grid gap-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="cdn" id="src-cdn" />
              <div className="grid gap-0.5 -mt-0.5">
                <span className="text-sm font-medium">{t("typographySourceCdn")}</span>
                <span className="text-xs text-muted-foreground">{t("typographySourceCdnHint")}</span>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="selfhost" id="src-selfhost" />
              <div className="grid gap-0.5 -mt-0.5">
                <span className="text-sm font-medium">{t("typographySourceSelfHost")}</span>
                <span className="text-xs text-muted-foreground">{t("typographySourceSelfHostHint")}</span>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div className="rounded-md border bg-muted/30 p-4 space-y-1" style={{ fontFamily: previewFontFamily }}>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "inherit" }}>{t("typographyPreviewTitle")}</p>
          <p className="text-2xl" style={{ fontFamily: "inherit", fontWeight: 700 }}>{selectedFont?.name || family}</p>
          <p className="text-base" style={{ fontFamily: "inherit" }}>{t("typographyPreviewSample")}</p>
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "inherit", fontWeight: 400 }}>{t("typographyPreviewSample")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t("typographySaveButton")}
          </Button>
          <Button variant="outline" onClick={onReset} disabled={saving}>
            {t("typographyResetButton")}
          </Button>
          {source === "selfhost" && (
            <Button variant="ghost" onClick={onResync} disabled={saving}>
              {t("typographySyncing")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
