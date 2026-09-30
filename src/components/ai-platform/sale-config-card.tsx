"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Info, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { AiPlatformPackage, AiPlatformSaleMode, AiTopupGateway } from "@/services/ai-credits";
import { updateAiPlatformSettings, type AiPlatformSettings } from "@/services/ai-platform";
import {
  INVALID_FIELD_CLASS,
  aiPlatformSaveErrorKey,
  centsToInput,
  inputToCents,
  type AiPlatformCardProps,
} from "./connection-card";

const GATEWAY_NONE = "__none__";

// Menor cobrança que o meio de pagamento mais comum aceita (R$ 5,00). É AVISO, não
// impedimento: quem decide o piso é o servidor, que conhece o gateway da instalação
// (o outro aceita cobranças bem menores).
const MIN_CHARGE_WARN_CENTS = 500;

const PACKAGE_ID_RE = /^[A-Za-z0-9_.:-]+$/;

interface PackageDraft {
  key: string;
  // Id gravado: pacote já vendido é referenciado por ele nas recargas — nunca é reescrito.
  id: string;
  label: string;
  price: string;
  credit: string;
}

interface SaleForm {
  saleMode: AiPlatformSaleMode;
  minTopup: string;
  lowBalanceDefault: string;
  gateway: AiTopupGateway | typeof GATEWAY_NONE;
  packages: PackageDraft[];
}

let keySeq = 0;
const nextKey = () => `sp${++keySeq}`;
const newPackageId = () => `pkg-${Date.now().toString(36)}-${++keySeq}`;

function formFrom(settings: AiPlatformSettings): SaleForm {
  const gateway = settings.fallbackTopupGateway;
  return {
    saleMode: settings.saleMode === "packages" ? "packages" : "free",
    minTopup: centsToInput(Number(settings.minTopupCents) || 0),
    lowBalanceDefault: centsToInput(Number(settings.lowBalanceDefaultCents) || 0),
    gateway: gateway === "asaas" || gateway === "stripe" ? gateway : GATEWAY_NONE,
    packages: (Array.isArray(settings.packages) ? settings.packages : []).map((item) => ({
      key: nextKey(),
      id: String(item.id ?? ""),
      label: String(item.label ?? ""),
      price: centsToInput(Number(item.priceCents) || 0),
      credit: centsToInput(Number(item.creditCents) || 0),
    })),
  };
}

function snapshotOf(form: SaleForm): string {
  return JSON.stringify({
    saleMode: form.saleMode,
    minTopup: form.minTopup,
    lowBalanceDefault: form.lowBalanceDefault,
    gateway: form.gateway,
    packages: form.packages.map((row) => [row.id, row.label, row.price, row.credit]),
  });
}

// O 422 de configuração inválida vem com `field` dizendo QUAL campo o servidor recusou
// (o piso do gateway, por exemplo, só ele conhece). O catch recebe o RESPONSE.
function invalidFieldOf(err: unknown): string {
  const e = err as { data?: { field?: unknown }; response?: { data?: { field?: unknown } } } | null;
  const field = e?.data?.field ?? e?.response?.data?.field;
  return typeof field === "string" ? field : "";
}

const SERVER_FIELD_TO_FORM: Record<string, string> = {
  minTopupCents: "minTopup",
  lowBalanceDefaultCents: "lowBalance",
  packages: "packages",
  saleMode: "saleMode",
  fallbackTopupGateway: "gateway",
};

export function SaleConfigCard({ settings, onSaved }: AiPlatformCardProps) {
  const t = useTranslations("aiPlatformPage");

  const [form, setForm] = useState<SaleForm>(() => formFrom(settings));
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const savedSnapshot = useMemo(() => snapshotOf(formFrom(settings)), [settings]);
  const dirty = savedSnapshot !== snapshotOf(form);

  const clearInvalid = (key: string) =>
    setInvalid((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  const setPackageField = (key: string, field: "label" | "price" | "credit", value: string) => {
    setForm((prev) => ({
      ...prev,
      packages: prev.packages.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    }));
    clearInvalid(`${key}:${field}`);
    clearInvalid("packages");
  };

  const handleSave = async () => {
    if (saving) return;
    const errors = new Set<string>();

    const minTopupCents = inputToCents(form.minTopup);
    if (minTopupCents === null || minTopupCents < 1) errors.add("minTopup");

    const lowBalanceDefaultCents = inputToCents(form.lowBalanceDefault);
    if (lowBalanceDefaultCents === null || lowBalanceDefaultCents < 0) errors.add("lowBalance");

    const packages: AiPlatformPackage[] = [];
    const idsSeen = new Set<string>();
    form.packages.forEach((row) => {
      const label = row.label.trim();
      // Linha inteiramente em branco é descartada em silêncio
      if (!label && !row.price.trim() && !row.credit.trim()) return;

      const price = inputToCents(row.price);
      const credit = inputToCents(row.credit);
      if (!label) errors.add(`${row.key}:label`);
      if (price === null || price < 1) errors.add(`${row.key}:price`);
      if (credit === null || credit < 1) errors.add(`${row.key}:credit`);
      // Pacote é BÔNUS por volume: nunca entra menos saldo do que o cliente pagou.
      if (price !== null && credit !== null && credit >= 1 && credit < price) {
        errors.add(`${row.key}:credit`);
      }

      let id = row.id && PACKAGE_ID_RE.test(row.id) ? row.id : newPackageId();
      if (idsSeen.has(id)) id = newPackageId();
      idsSeen.add(id);
      packages.push({ id, label, priceCents: price ?? 0, creditCents: credit ?? 0 });
    });
    // No modo pacotes o cliente não tem outro caminho para recarregar
    if (form.saleMode === "packages" && packages.length === 0) errors.add("packages");

    setInvalid(errors);
    if (errors.size > 0) {
      toast.error(t("err_ERR_AI_PLATFORM_INVALID_SETTINGS"));
      return;
    }

    setSaving(true);
    try {
      const { data } = await updateAiPlatformSettings({
        saleMode: form.saleMode,
        minTopupCents: minTopupCents as number,
        lowBalanceDefaultCents: lowBalanceDefaultCents as number,
        fallbackTopupGateway: form.gateway === GATEWAY_NONE ? null : form.gateway,
        packages,
      });
      onSaved(data);
      setForm(formFrom(data));
      toast.success(t("saved"));
    } catch (err: unknown) {
      const formField = SERVER_FIELD_TO_FORM[invalidFieldOf(err)];
      setInvalid(formField ? new Set<string>([formField]) : new Set<string>());
      toast.error(t(aiPlatformSaveErrorKey(err)));
    } finally {
      setSaving(false);
    }
  };

  const fieldNote = (id: string, text: string) => (
    <p id={id} className="text-xs text-muted-foreground">{text}</p>
  );

  return (
    <Card>
      <CardContent className="space-y-6 p-4 sm:p-6">
        {/* Modo de venda */}
        <section className="space-y-3">
          <Label className="text-sm font-semibold">{t("saleMode")}</Label>
          <RadioGroup
            value={form.saleMode}
            onValueChange={(value) => {
              setForm((prev) => ({ ...prev, saleMode: value === "packages" ? "packages" : "free" }));
              clearInvalid("saleMode");
              clearInvalid("packages");
            }}
            className="grid gap-2 sm:grid-cols-2"
            disabled={saving}
          >
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors",
                form.saleMode === "free" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              )}
            >
              <RadioGroupItem value="free" id="ai-platform-sale-free" className="mt-0.5" />
              <div className="min-w-0 space-y-0.5">
                <div className="text-sm font-medium leading-none">{t("saleFree")}</div>
                <p className="text-[11px] leading-tight text-muted-foreground">{t("saleFreeDesc")}</p>
              </div>
            </label>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors",
                form.saleMode === "packages" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              )}
            >
              <RadioGroupItem value="packages" id="ai-platform-sale-packages" className="mt-0.5" />
              <div className="min-w-0 space-y-0.5">
                <div className="text-sm font-medium leading-none">{t("salePackages")}</div>
                <p className="text-[11px] leading-tight text-muted-foreground">{t("salePackagesDesc")}</p>
              </div>
            </label>
          </RadioGroup>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-platform-min-topup">{t("minTopup")}</Label>
            <Input
              id="ai-platform-min-topup"
              inputMode="decimal"
              autoComplete="off"
              value={form.minTopup}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, minTopup: value }));
                clearInvalid("minTopup");
              }}
              aria-invalid={invalid.has("minTopup") || undefined}
              className={cn(invalid.has("minTopup") && INVALID_FIELD_CLASS)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-platform-low-balance">{t("lowBalanceDefault")}</Label>
            <Input
              id="ai-platform-low-balance"
              inputMode="decimal"
              autoComplete="off"
              value={form.lowBalanceDefault}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, lowBalanceDefault: value }));
                clearInvalid("lowBalance");
              }}
              aria-invalid={invalid.has("lowBalance") || undefined}
              className={cn(invalid.has("lowBalance") && INVALID_FIELD_CLASS)}
              disabled={saving}
            />
          </div>
        </div>

        <Separator />

        {/* Pacotes */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("salePackages")}</h3>

          {form.saleMode === "free" && (
            <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-2.5 text-xs text-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
              <span>{t("saleFreeDesc")}</span>
            </div>
          )}

          {invalid.has("packages") && (
            <p className="text-xs text-destructive">{t("err_ERR_AI_PLATFORM_INVALID_SETTINGS")}</p>
          )}

          <div className="space-y-2">
            {form.packages.map((row) => {
              const priceCents = inputToCents(row.price);
              const belowMin =
                row.price.trim() !== "" && priceCents !== null && priceCents < MIN_CHARGE_WARN_CENTS;
              return (
                <div key={row.key} className="space-y-2 rounded-md border p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_2.25rem] sm:items-end">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor={`pkg-label-${row.key}`} className="text-xs text-muted-foreground">
                        {t("packageLabel")}
                      </Label>
                      <Input
                        id={`pkg-label-${row.key}`}
                        autoComplete="off"
                        maxLength={80}
                        value={row.label}
                        onChange={(e) => setPackageField(row.key, "label", e.target.value)}
                        aria-invalid={invalid.has(`${row.key}:label`) || undefined}
                        className={cn(invalid.has(`${row.key}:label`) && INVALID_FIELD_CLASS)}
                        disabled={saving}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor={`pkg-price-${row.key}`} className="text-xs text-muted-foreground">
                        {t("packagePrice")}
                      </Label>
                      <Input
                        id={`pkg-price-${row.key}`}
                        inputMode="decimal"
                        autoComplete="off"
                        value={row.price}
                        onChange={(e) => setPackageField(row.key, "price", e.target.value)}
                        aria-invalid={invalid.has(`${row.key}:price`) || undefined}
                        className={cn(invalid.has(`${row.key}:price`) && INVALID_FIELD_CLASS)}
                        disabled={saving}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor={`pkg-credit-${row.key}`} className="text-xs text-muted-foreground">
                        {t("packageCredit")}
                      </Label>
                      <Input
                        id={`pkg-credit-${row.key}`}
                        inputMode="decimal"
                        autoComplete="off"
                        value={row.credit}
                        onChange={(e) => setPackageField(row.key, "credit", e.target.value)}
                        aria-invalid={invalid.has(`${row.key}:credit`) || undefined}
                        className={cn(invalid.has(`${row.key}:credit`) && INVALID_FIELD_CLASS)}
                        disabled={saving}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            packages: prev.packages.filter((item) => item.key !== row.key),
                          }))
                        }
                        disabled={saving}
                        aria-label={t("remove")}
                        title={t("remove")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {belowMin && (
                    <p className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <span>{t("packageBelowMin")}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                packages: [
                  ...prev.packages,
                  { key: nextKey(), id: newPackageId(), label: "", price: "", credit: "" },
                ],
              }))
            }
            disabled={saving}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addPackage")}
          </Button>
        </section>

        <Separator />

        {/* Gateway reserva */}
        <section className="space-y-2">
          <Label htmlFor="ai-platform-fallback-gateway">{t("fallbackGateway")}</Label>
          <Select
            value={form.gateway}
            onValueChange={(value) => {
              setForm((prev) => ({
                ...prev,
                gateway: value === "asaas" || value === "stripe" ? value : GATEWAY_NONE,
              }));
              clearInvalid("gateway");
            }}
            disabled={saving}
          >
            <SelectTrigger
              id="ai-platform-fallback-gateway"
              aria-describedby="ai-platform-fallback-gateway-note"
              className={cn("w-full sm:max-w-xs", invalid.has("gateway") && INVALID_FIELD_CLASS)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GATEWAY_NONE}>{t("fallbackNone")}</SelectItem>
              <SelectItem value="asaas">Asaas</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
            </SelectContent>
          </Select>
          {fieldNote("ai-platform-fallback-gateway-note", t("fallbackGatewayNote"))}
        </section>

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

export default SaleConfigCard;
