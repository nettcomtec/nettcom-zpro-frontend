"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  updateAiPlatformSettings,
  type AiPlatformMarkupTier,
  type AiPlatformModelMarkup,
  type AiPlatformProviderMarkup,
  type AiPlatformSettings,
} from "@/services/ai-platform";
import {
  INVALID_FIELD_CLASS,
  aiPlatformSaveErrorKey,
  numberToInput,
  parseDecimalInput,
  type AiPlatformCardProps,
} from "./connection-card";

interface TierDraft { key: string; upTo: string; pct: string }
interface ProviderDraft { key: string; provider: string; pct: string }
interface ModelDraft { key: string; modelId: string; pct: string }

interface MarkupForm {
  tiers: TierDraft[];
  // Faixa "sem limite" (upToUsdPer1M = null): sempre a última, sempre presente na tela.
  openPct: string;
  providers: ProviderDraft[];
  models: ModelDraft[];
}

let keySeq = 0;
const nextKey = () => `mk${++keySeq}`;

// Margem trafega em bp: 100 bp = 1%
const bpToInput = (bp: number) => numberToInput((Number(bp) || 0) / 100, 2);
const pctToBp = (pct: number) => Math.round(pct * 100);

function formFrom(settings: AiPlatformSettings): MarkupForm {
  const tiers = Array.isArray(settings.markupTiers) ? settings.markupTiers : [];
  const finite = tiers
    .filter((tier) => tier.upToUsdPer1M != null)
    .sort((a, b) => Number(a.upToUsdPer1M) - Number(b.upToUsdPer1M));
  const open = tiers.find((tier) => tier.upToUsdPer1M == null);
  return {
    tiers: finite.map((tier) => ({
      key: nextKey(),
      upTo: numberToInput(Number(tier.upToUsdPer1M), 6),
      pct: bpToInput(tier.markupBp),
    })),
    openPct: open ? bpToInput(open.markupBp) : "",
    providers: (Array.isArray(settings.providerMarkups) ? settings.providerMarkups : []).map((p) => ({
      key: nextKey(),
      provider: p.provider,
      pct: bpToInput(p.markupBp),
    })),
    models: (Array.isArray(settings.modelMarkups) ? settings.modelMarkups : []).map((m) => ({
      key: nextKey(),
      modelId: m.modelId,
      pct: bpToInput(m.markupBp),
    })),
  };
}

function snapshotOf(form: MarkupForm): string {
  return JSON.stringify({
    tiers: form.tiers.map((r) => [r.upTo, r.pct]),
    openPct: form.openPct,
    providers: form.providers.map((r) => [r.provider, r.pct]),
    models: form.models.map((r) => [r.modelId, r.pct]),
  });
}

export function MarkupEditor({ settings, onSaved }: AiPlatformCardProps) {
  const t = useTranslations("aiPlatformPage");

  const [form, setForm] = useState<MarkupForm>(() => formFrom(settings));
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const savedSnapshot = useMemo(() => snapshotOf(formFrom(settings)), [settings]);
  const dirty = savedSnapshot !== snapshotOf(form);

  const clearInvalid = (key: string) =>
    setInvalid((prev) => {
      if (![...prev].some((k) => k.startsWith(key))) return prev;
      return new Set([...prev].filter((k) => !k.startsWith(key)));
    });

  const knownProviders = useMemo(() => {
    const set = new Set<string>();
    (settings.models || []).forEach((m) => { if (m.provider) set.add(m.provider); });
    return [...set].sort();
  }, [settings.models]);

  // Exceção salva para um modelo que saiu da lista de vendidos continua aparecendo.
  const modelOptions = useMemo<SearchableSelectOption[]>(() => {
    const options: SearchableSelectOption[] = (settings.models || []).map((m) => ({
      value: m.modelId,
      label: m.name || m.modelId,
      description: m.modelId,
    }));
    const known = new Set(options.map((o) => o.value));
    form.models.forEach((row) => {
      if (row.modelId && !known.has(row.modelId)) {
        known.add(row.modelId);
        options.push({ value: row.modelId, label: row.modelId });
      }
    });
    return options;
  }, [settings.models, form.models]);

  const handleSave = async () => {
    if (saving) return;
    const errors = new Set<string>();

    const readPct = (raw: string, key: string): number => {
      const pct = parseDecimalInput(raw);
      if (pct === null || pct < 0) {
        errors.add(`${key}:pct`);
        return 0;
      }
      return pctToBp(pct);
    };

    const markupTiers: AiPlatformMarkupTier[] = [];
    const ceilings = new Set<number>();
    form.tiers.forEach((row) => {
      if (!row.upTo.trim() && !row.pct.trim()) return; // linha em branco é descartada
      const upTo = parseDecimalInput(row.upTo);
      if (upTo === null || upTo <= 0 || ceilings.has(upTo)) errors.add(`${row.key}:upTo`);
      else ceilings.add(upTo);
      markupTiers.push({ upToUsdPer1M: upTo ?? 0, markupBp: readPct(row.pct, row.key) });
    });
    markupTiers.sort((a, b) => Number(a.upToUsdPer1M) - Number(b.upToUsdPer1M));
    if (markupTiers.length > 0 || form.openPct.trim()) {
      markupTiers.push({
        upToUsdPer1M: null,
        markupBp: form.openPct.trim() ? readPct(form.openPct, "open") : 0,
      });
    }

    const providerMarkups: AiPlatformProviderMarkup[] = [];
    const providersSeen = new Set<string>();
    form.providers.forEach((row) => {
      const provider = row.provider.trim().toLowerCase();
      if (!provider && !row.pct.trim()) return;
      if (!provider || providersSeen.has(provider)) errors.add(`${row.key}:target`);
      providersSeen.add(provider);
      providerMarkups.push({ provider, markupBp: readPct(row.pct, row.key) });
    });

    const modelMarkups: AiPlatformModelMarkup[] = [];
    const modelsSeen = new Set<string>();
    form.models.forEach((row) => {
      const modelId = row.modelId.trim();
      if (!modelId && !row.pct.trim()) return;
      if (!modelId || modelsSeen.has(modelId)) errors.add(`${row.key}:target`);
      modelsSeen.add(modelId);
      modelMarkups.push({ modelId, markupBp: readPct(row.pct, row.key) });
    });

    setInvalid(errors);
    if (errors.size > 0) {
      toast.error(t("err_ERR_AI_PLATFORM_INVALID_SETTINGS"));
      return;
    }

    setSaving(true);
    try {
      const { data } = await updateAiPlatformSettings({ markupTiers, providerMarkups, modelMarkups });
      onSaved(data);
      setForm(formFrom(data));
      toast.success(t("saved"));
    } catch (err: unknown) {
      toast.error(t(aiPlatformSaveErrorKey(err)));
    } finally {
      setSaving(false);
    }
  };

  const rowGrid = "grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)_2.25rem] items-center gap-2";
  const headClass = "text-xs font-medium text-muted-foreground";

  const removeButton = (onClick: () => void) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-muted-foreground hover:text-destructive"
      onClick={onClick}
      disabled={saving}
      aria-label={t("remove")}
      title={t("remove")}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  const pctInput = (value: string, key: string, onChange: (v: string) => void) => (
    <Input
      inputMode="decimal"
      value={value}
      onChange={(e) => { onChange(e.target.value); clearInvalid(`${key}:pct`); }}
      aria-label={t("tierMarkup")}
      aria-invalid={invalid.has(`${key}:pct`) || undefined}
      className={cn(invalid.has(`${key}:pct`) && INVALID_FIELD_CLASS)}
      disabled={saving}
    />
  );

  return (
    <Card>
      <CardContent className="space-y-6 p-4 sm:p-6">
        {!settings.chargeEnabled && (
          <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-2.5 text-xs text-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
            <span>{t("chargeCustomersOff")}</span>
          </div>
        )}

        {/* Faixas de custo */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("tiers")}</h3>
          <div className="max-w-xl space-y-2">
            <div className={rowGrid}>
              <span className={headClass}>{t("tierUpTo")}</span>
              <span className={headClass}>{t("tierMarkup")}</span>
              <span />
            </div>
            {form.tiers.map((row) => (
              <div key={row.key} className={rowGrid}>
                <Input
                  inputMode="decimal"
                  value={row.upTo}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      tiers: prev.tiers.map((r) => (r.key === row.key ? { ...r, upTo: value } : r)),
                    }));
                    clearInvalid(`${row.key}:upTo`);
                  }}
                  aria-label={t("tierUpTo")}
                  aria-invalid={invalid.has(`${row.key}:upTo`) || undefined}
                  className={cn(invalid.has(`${row.key}:upTo`) && INVALID_FIELD_CLASS)}
                  disabled={saving}
                />
                {pctInput(row.pct, row.key, (value) =>
                  setForm((prev) => ({
                    ...prev,
                    tiers: prev.tiers.map((r) => (r.key === row.key ? { ...r, pct: value } : r)),
                  }))
                )}
                {removeButton(() =>
                  setForm((prev) => ({ ...prev, tiers: prev.tiers.filter((r) => r.key !== row.key) }))
                )}
              </div>
            ))}
            <div className={rowGrid}>
              <div className="flex h-9 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                {t("tierEmptyCeil")}
              </div>
              {pctInput(form.openPct, "open", (value) => setForm((prev) => ({ ...prev, openPct: value })))}
              <span />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setForm((prev) => ({ ...prev, tiers: [...prev.tiers, { key: nextKey(), upTo: "", pct: "" }] }))
            }
            disabled={saving}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addTier")}
          </Button>
        </section>

        <Separator />

        {/* Exceções por provedor */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("providerExceptions")}</h3>
          {form.providers.length > 0 && (
            <div className="max-w-xl space-y-2">
              <div className={rowGrid}>
                <span className={headClass}>{t("provider")}</span>
                <span className={headClass}>{t("tierMarkup")}</span>
                <span />
              </div>
              {form.providers.map((row) => (
                <div key={row.key} className={rowGrid}>
                  <Input
                    list="ai-platform-provider-options"
                    autoComplete="off"
                    spellCheck={false}
                    value={row.provider}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        providers: prev.providers.map((r) => (r.key === row.key ? { ...r, provider: value } : r)),
                      }));
                      clearInvalid(`${row.key}:target`);
                    }}
                    aria-label={t("provider")}
                    aria-invalid={invalid.has(`${row.key}:target`) || undefined}
                    className={cn(invalid.has(`${row.key}:target`) && INVALID_FIELD_CLASS)}
                    disabled={saving}
                  />
                  {pctInput(row.pct, row.key, (value) =>
                    setForm((prev) => ({
                      ...prev,
                      providers: prev.providers.map((r) => (r.key === row.key ? { ...r, pct: value } : r)),
                    }))
                  )}
                  {removeButton(() =>
                    setForm((prev) => ({ ...prev, providers: prev.providers.filter((r) => r.key !== row.key) }))
                  )}
                </div>
              ))}
              <datalist id="ai-platform-provider-options">
                {knownProviders.map((provider) => <option key={provider} value={provider} />)}
              </datalist>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                providers: [...prev.providers, { key: nextKey(), provider: "", pct: "" }],
              }))
            }
            disabled={saving}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("add")}
          </Button>
        </section>

        <Separator />

        {/* Exceções por modelo */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("modelExceptions")}</h3>
          {form.models.length > 0 && (
            <div className="max-w-xl space-y-2">
              <div className={rowGrid}>
                <span className={headClass}>{t("colModel")}</span>
                <span className={headClass}>{t("tierMarkup")}</span>
                <span />
              </div>
              {form.models.map((row) => (
                <div key={row.key} className={rowGrid}>
                  <SearchableSelect
                    options={modelOptions}
                    value={row.modelId}
                    onValueChange={(value) => {
                      setForm((prev) => ({
                        ...prev,
                        models: prev.models.map((r) => (r.key === row.key ? { ...r, modelId: value } : r)),
                      }));
                      clearInvalid(`${row.key}:target`);
                    }}
                    placeholder={t("colModel")}
                    searchPlaceholder={t("searchModel")}
                    triggerClassName={cn(invalid.has(`${row.key}:target`) && INVALID_FIELD_CLASS)}
                    disabled={saving}
                  />
                  {pctInput(row.pct, row.key, (value) =>
                    setForm((prev) => ({
                      ...prev,
                      models: prev.models.map((r) => (r.key === row.key ? { ...r, pct: value } : r)),
                    }))
                  )}
                  {removeButton(() =>
                    setForm((prev) => ({ ...prev, models: prev.models.filter((r) => r.key !== row.key) }))
                  )}
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setForm((prev) => ({ ...prev, models: [...prev.models, { key: nextKey(), modelId: "", pct: "" }] }))
            }
            disabled={saving}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("add")}
          </Button>
        </section>

        <p className="text-xs text-muted-foreground">{t("exceptionsNote")}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void handleSave()} disabled={saving || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default MarkupEditor;
