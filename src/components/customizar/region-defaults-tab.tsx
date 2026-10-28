"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Building2, Coins, Globe, Info, Languages, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  applyRegionDefaultsToInheriting,
  fetchRegionDefaults,
  updateRegionDefaults,
  type ApplyInheritingResponse,
  type RegionDefaultsAdminResponse,
  type RegionDefaultsPatch,
} from "@/services/region";
import { REGION_LANGUAGES, countryName, countryOptions, currencyOptions, defaultCurrencyFor } from "@/lib/region";
import { localeNames, type Locale } from "@/i18n/config";

/**
 * /customizar > Região: padrão geral da instalação (país, moeda e idioma das
 * mensagens ao cliente), herdado campo a campo por toda empresa sem valor próprio
 * e pelas empresas criadas depois. Contrato 5 de docs/PLANO_REGIAO_MOEDA_IDIOMA.md.
 *
 * - Salva campo a campo (otimista + rollback), como o patchSignupConfig da página.
 * - "" = sem padrão (remove o campo; volta a Brasil/Real/Português).
 * - Lote R3: troca os textos automáticos ainda iguais ao padrão nas empresas que
 *   herdam o idioma. Nunca roda sozinho: é sempre confirmado.
 * - Backend antigo (rota inexistente, 404): aviso de indisponível e nenhum controle.
 */

type Field = "country" | "currency" | "language";

type FormState = Record<Field, string>;

// O service do backend também devolve quais campos o JSON define (`has`); o
// contrato 5 não garante a chave, então ela é opcional aqui.
type AdminDefaults = RegionDefaultsAdminResponse & {
  has?: Partial<Record<Field, boolean>>;
};

type LoadState = "loading" | "ready" | "unavailable" | "error";

// Selects do Radix não aceitam value "": o "sem padrão" do idioma usa um marcador.
const NO_LANGUAGE = "__none__";

// Lote em andamento no MÓDULO (não no componente): as abas desmontam o conteúdo
// inativo, e voltar para a aba durante o lote não pode disparar um segundo.
let inflightApply: Promise<ApplyInheritingResponse> | null = null;

function isAdminDefaults(data: unknown): data is AdminDefaults {
  return !!data && typeof data === "object" && typeof (data as AdminDefaults).country === "string";
}

/** Valor de cada select: "" quando o padrão geral não define o campo. */
function toFormState(d: AdminDefaults): FormState {
  const has = d.has;
  if (has && typeof has === "object") {
    return {
      country: has.country ? d.country : "",
      currency: has.currency ? d.currency : "",
      language: has.language ? d.language : "",
    };
  }
  if (!d.configured) return { country: "", currency: "", language: "" };
  // Sem `has` na resposta, não dá para saber campo a campo: mostra o que veio.
  return { country: d.country || "", currency: d.currency || "", language: d.language || "" };
}

function normalizeApplyResult(res: Partial<ApplyInheritingResponse> | null | undefined): ApplyInheritingResponse {
  const failed = res?.failed;
  return {
    tenants: Number(res?.tenants) || 0,
    updatedTenants: Number(res?.updatedTenants) || 0,
    failed: Array.isArray(failed) ? failed : [],
  };
}

function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | undefined;
  return e?.status ?? e?.response?.status;
}

function errorCode(err: unknown): string {
  const e = err as { data?: { error?: string; message?: string }; code?: string } | undefined;
  return String(e?.data?.error || e?.data?.message || "");
}

const ERROR_KEYS: Record<string, string> = {
  ERR_INVALID_REGION_COUNTRY: "regionTabErrorInvalidCountry",
  ERR_INVALID_REGION_CURRENCY: "regionTabErrorInvalidCurrency",
  ERR_INVALID_REGION_LANGUAGE: "regionTabErrorInvalidLanguage",
};

interface RegionDefaultsTabProps {
  /** Valores efetivos do padrão geral depois de carregar/salvar (a aba Cadastro mostra o país). */
  onDefaultsChange?: (defaults: { country: string; currency: string; language: string }) => void;
}

export function RegionDefaultsTab({ onDefaultsChange }: RegionDefaultsTabProps) {
  const t = useTranslations("customizarPage");
  const tErrors = useTranslations("errors");
  const uiLocale = useLocale();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [defaults, setDefaults] = useState<AdminDefaults | null>(null);
  const [form, setForm] = useState<FormState>({ country: "", currency: "", language: "" });
  const [saving, setSaving] = useState<Field | null>(null);
  const [suggestedCurrency, setSuggestedCurrency] = useState<{ country: string; currency: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [afterLanguageChange, setAfterLanguageChange] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyInheritingResponse | null>(null);

  const onChangeRef = useRef(onDefaultsChange);
  onChangeRef.current = onDefaultsChange;

  const applyData = useCallback((data: AdminDefaults) => {
    setDefaults(data);
    setForm(toFormState(data));
    // Sem país no padrão geral, o cadastro segue com o país que o signup já tinha
    // (o backend decide igual): "" = não mexe no país mostrado na aba Cadastro.
    onChangeRef.current?.({
      country: data.has?.country === false ? "" : data.country,
      currency: data.currency,
      language: data.language,
    });
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const { data } = await fetchRegionDefaults();
      if (!isAdminDefaults(data)) {
        setLoadState("unavailable");
        return;
      }
      applyData(data);
      setLoadState("ready");
    } catch (err) {
      setLoadState(errorStatus(err) === 404 ? "unavailable" : "error");
    }
  }, [applyData]);

  useEffect(() => {
    load();
  }, [load]);

  // Lote iniciado antes de a aba desmontar: retoma o estado de "aplicando".
  useEffect(() => {
    if (!inflightApply) return;
    setApplying(true);
    inflightApply
      .then((res) => setApplyResult(normalizeApplyResult(res)))
      .catch(() => undefined)
      .finally(() => setApplying(false));
  }, []);

  const countrySelectOptions = useMemo<SearchableSelectOption[]>(() => [
    { value: "", label: t("regionTabNoDefaultOption", { value: countryName("BR", uiLocale) }) },
    ...countryOptions(uiLocale).map((o) => ({ value: o.iso, label: o.name, description: `${o.iso} · +${o.dial}` })),
  ], [t, uiLocale]);

  const currencySelectOptions = useMemo<SearchableSelectOption[]>(() => [
    { value: "", label: t("regionTabNoDefaultCurrencyOption") },
    ...currencyOptions(uiLocale).map((o) => ({
      value: o.code,
      label: o.name && o.name !== o.code ? `${o.name} (${o.code})` : o.code,
    })),
  ], [t, uiLocale]);

  const languageName = (code?: string | null) =>
    (code && localeNames[code as Locale]) || code || localeNames.pt;

  const inheritingLanguage = defaults?.inheriting?.language ?? 0;
  const busy = saving !== null;

  function saveErrorMessage(err: unknown): string {
    const key = ERROR_KEYS[errorCode(err)];
    return key ? t(key) : tErrors("saveFailed");
  }

  async function saveField(field: Field, value: string) {
    if (!defaults || busy || value === form[field]) return;
    const prevDefaults = defaults;
    const prevForm = form;
    setSaving(field);
    setForm((f) => ({ ...f, [field]: value }));
    try {
      const patch: RegionDefaultsPatch = {};
      patch[field] = value;
      const { data } = await updateRegionDefaults(patch);
      const next: AdminDefaults = isAdminDefaults(data) ? data : prevDefaults;
      if (isAdminDefaults(data)) applyData(data);
      toast.success(t("regionTabSaved"));

      if (field === "country") {
        // Moeda sugerida para o país novo: só quando a moeda padrão está definida
        // (sem ela, a moeda já segue o país de cada empresa). Nunca salva sozinha.
        const nextForm = toFormState(next);
        const suggested = defaultCurrencyFor(next.country);
        setSuggestedCurrency(
          nextForm.currency && nextForm.currency !== suggested ? { country: next.country, currency: suggested } : null
        );
      } else if (field === "currency") {
        setSuggestedCurrency(null);
      } else if (next.language !== prevDefaults.language && (next.inheriting?.language ?? 0) > 0) {
        // Idioma novo: oferece na hora o lote de textos (R3), sempre com confirmação.
        setApplyResult(null);
        setAfterLanguageChange(true);
        setConfirmOpen(true);
      }
    } catch (err) {
      setDefaults(prevDefaults);
      setForm(prevForm);
      toast.error(saveErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function runApply() {
    setConfirmOpen(false);
    setAfterLanguageChange(false);
    setApplyResult(null);
    setApplying(true);
    if (!inflightApply) {
      inflightApply = applyRegionDefaultsToInheriting()
        .then((res) => res.data)
        .finally(() => {
          inflightApply = null;
        });
    }
    try {
      const result = normalizeApplyResult(await inflightApply);
      setApplyResult(result);
      if (result.failed.length > 0) {
        toast.warning(t("regionTabApplyInheritingFailed", { count: result.failed.length }));
      } else if (result.tenants === 0) {
        toast.info(t("regionTabApplyInheritingNothing"));
      } else {
        toast.success(t("regionTabApplyInheritingResult", { updated: result.updatedTenants, total: result.tenants }));
      }
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      toast.error(
        code === "ECONNABORTED" || code === "ETIMEDOUT"
          ? t("regionTabApplyInheritingTimeout")
          : t("regionTabApplyInheritingError")
      );
    } finally {
      setApplying(false);
    }
  }

  const note = (
    <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 flex gap-2 items-start text-xs text-blue-700 dark:text-blue-300">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{t("regionTabNote")}</span>
    </div>
  );

  if (loadState === "loading") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-full max-w-md" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadState === "unavailable") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 flex gap-2 items-start text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t("regionTabUnavailable")}</span>
      </div>
    );
  }

  if (loadState === "error" || !defaults) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-red-700 dark:text-red-300">
        <span className="flex gap-2 items-start">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("regionTabLoadError")}</span>
        </span>
        <Button type="button" variant="outline" size="sm" className="shrink-0 self-start sm:self-auto" onClick={load}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {t("regionTabRetry")}
        </Button>
      </div>
    );
  }

  const inheritingLine = (count: number | undefined) =>
    typeof count === "number" ? (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span>{t("regionTabInheritingCount", { count })}</span>
      </p>
    ) : null;

  return (
    <div className="space-y-4">
      {note}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card>
          <CardHeader>
            <CardTitle>{t("regionTabTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t("regionTabDescription")}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* País */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                {t("regionTabCountryLabel")}
                {saving === "country" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </Label>
              <SearchableSelect
                options={countrySelectOptions}
                value={form.country}
                onValueChange={(v) => saveField("country", v)}
                searchPlaceholder={t("regionTabSearchCountry")}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">{t("regionTabCountryHint")}</p>
              {inheritingLine(defaults.inheriting?.country)}
              {suggestedCurrency && (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs">
                    {t("regionTabCurrencySuggested", {
                      country: countryName(suggestedCurrency.country, uiLocale),
                      currency: suggestedCurrency.currency,
                    })}
                  </p>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => saveField("currency", suggestedCurrency.currency)}
                    >
                      {t("regionTabCurrencySuggestedApply", { currency: suggestedCurrency.currency })}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestedCurrency(null)}>
                      {t("regionTabCurrencySuggestedDismiss")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Moeda */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                {t("regionTabCurrencyLabel")}
                {saving === "currency" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </Label>
              <SearchableSelect
                options={currencySelectOptions}
                value={form.currency}
                onValueChange={(v) => saveField("currency", v)}
                searchPlaceholder={t("regionTabSearchCurrency")}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">{t("regionTabCurrencyHint")}</p>
              {inheritingLine(defaults.inheriting?.currency)}
            </div>

            {/* Idioma das mensagens ao cliente */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                {t("regionTabLanguageLabel")}
                {saving === "language" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </Label>
              <Select
                value={form.language || NO_LANGUAGE}
                onValueChange={(v) => saveField("language", v === NO_LANGUAGE ? "" : v)}
                disabled={busy}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LANGUAGE}>
                    {t("regionTabNoDefaultOption", { value: localeNames.pt })}
                  </SelectItem>
                  {REGION_LANGUAGES.map((code) => (
                    <SelectItem key={code} value={code}>{localeNames[code]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("regionTabLanguageHint")}</p>
              {inheritingLine(defaults.inheriting?.language)}
            </div>
          </CardContent>
        </Card>

        {/* Lote R3: textos padrão nas empresas que herdam o idioma */}
        <Card>
          <CardHeader>
            <CardTitle>{t("regionTabApplyTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("regionTabApplyDesc", { language: languageName(defaults.language) })}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto h-auto min-h-9 py-2 whitespace-normal justify-start text-left"
              disabled={inheritingLanguage === 0 || applying || busy}
              onClick={() => {
                setAfterLanguageChange(false);
                setConfirmOpen(true);
              }}
            >
              {applying && <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />}
              {applying ? t("regionTabApplying") : t("regionTabApplyInheritingButton", { count: inheritingLanguage })}
            </Button>

            {applyResult && (
              <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1 text-xs">
                {applyResult.tenants === 0 ? (
                  <p>{t("regionTabApplyInheritingNothing")}</p>
                ) : (
                  <>
                    <p>{t("regionTabApplyInheritingResult", { updated: applyResult.updatedTenants, total: applyResult.tenants })}</p>
                    {applyResult.updatedTenants === 0 && applyResult.failed.length === 0 && (
                      <p className="text-muted-foreground">{t("regionTabApplyInheritingNoChanges")}</p>
                    )}
                  </>
                )}
                {applyResult.failed.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    {t("regionTabApplyInheritingFailed", { count: applyResult.failed.length })}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setAfterLanguageChange(false);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("regionTabApplyInheritingConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {afterLanguageChange && (
                  <p className="font-medium text-foreground">
                    {t("regionTabApplyAfterLanguageChange", { language: languageName(defaults.language) })}
                  </p>
                )}
                <p>
                  {t("regionTabApplyInheritingConfirm", {
                    count: inheritingLanguage,
                    language: languageName(defaults.language),
                  })}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={runApply} disabled={inheritingLanguage === 0 || applying}>
              {t("regionTabApplyInheritingConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
