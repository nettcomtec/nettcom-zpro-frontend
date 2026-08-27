"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, MoreVertical, Pencil, Trash2, Package, Eye, EyeOff, Globe, CreditCard, Webhook, Copy, Check, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import { fetchPlans, createPlan, updatePlan, deletePlan, type Plan } from "@/services/plans";
import { PLAN_CAPABILITIES, CAPABILITY_CATEGORIES } from "@/lib/plan-capabilities";
import { CHANNEL_TYPES } from "@/lib/channel-types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fetchTenants,
  updatePaymentGatewayConfig,
  migrateTenantsToGlobalGateway,
  fetchPaymentGatewayGlobalConfig,
  updatePaymentGatewayGlobalConfig,
} from "@/services/tenants";

const EMPTY: Partial<Plan> = { name: "", value: 0, connections: 3, users: 5, trial: "disabled", trialPeriod: 3, isPublic: false, highlight: false, displayOrder: 0, description: "" };

type Gateway = "asaas" | "stripe" | "pagarme" | "mercadopago";

interface TenantOption {
  id: number;
  name: string;
  paymentGateway?: string;
  asaasToken?: string;
  stripeToken?: string;
  pagarmeToken?: string;
  mercadopagoToken?: string;
}

function TokenInput({
  label,
  placeholder,
  value,
  onChange,
  onGenerate,
  generateLabel,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onGenerate?: () => void;
  generateLabel?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {onGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
            title={generateLabel}
          >
            <RefreshCw className="h-3 w-3" />
            {generateLabel}
          </button>
        )}
      </div>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateBasicPair(): string {
  return `${randomHex(4)}:${randomHex(12)}`;
}

export default function PlanosPage() {
  const t = useTranslations("planosPage");
  const tErrors = useTranslations("errors");
  const tt = useTranslations("tenantsPage"); // labels de canal (channelXxx) reusadas
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Plan>>(EMPTY);
  const [planCaps, setPlanCaps] = useState<Record<string, boolean>>({});
  // Canais por plano: restringir on/off + tipos incluídos (allowedChannels) + limite por tipo.
  const [channelRestrict, setChannelRestrict] = useState(false);
  const [planChannels, setPlanChannels] = useState<string[]>([]);
  const [planChannelLimits, setPlanChannelLimits] = useState<Record<string, number>>({});
  // Quota da galeria em MB ("" = não definido no plano → preserva o valor do tenant; 0 = ilimitado)
  const [planGalleryMB, setPlanGalleryMB] = useState("");
  const [saving, setSaving] = useState(false);

  const togglePlanChannel = (val: string) =>
    setPlanChannels((prev) => (prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]));

  // ── Global gateway config ──────────────────────────────────────────────────
  const [globalGateway, setGlobalGateway] = useState<Gateway>("asaas");
  const [globalAsaasToken, setGlobalAsaasToken] = useState("");
  const [globalStripeToken, setGlobalStripeToken] = useState("");
  const [globalPagarmeToken, setGlobalPagarmeToken] = useState("");
  const [globalMercadopagoToken, setGlobalMercadopagoToken] = useState("");
  const [globalFirstChargeDueDays, setGlobalFirstChargeDueDays] = useState<number>(30);
  const [globalRequirePaymentBeforeAccess, setGlobalRequirePaymentBeforeAccess] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);

  // ── Webhook secrets (superadmin-only, stored in payment-config.json) ──────
  const [asaasWebhookToken, setAsaasWebhookToken] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [pagarmeWebhookBasic, setPagarmeWebhookBasic] = useState("");
  const [mercadopagoWebhookSecret, setMercadopagoWebhookSecret] = useState("");
  const [savingWebhooks, setSavingWebhooks] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);

  const backendUrl =
    (typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : "") ||
    "http://localhost:3101";
  // URL pública da vitrine de planos (mesma origem do app). Mostrada no banner do Catálogo.
  const pricingUrl = (typeof window !== "undefined" ? window.location.origin : "") + "/precos";
  const webhookUrls: Record<Gateway, string> = {
    asaas: `${backendUrl.replace(/\/$/, "")}/asaas/webhook`,
    stripe: `${backendUrl.replace(/\/$/, "")}/stripe/webhook`,
    pagarme: `${backendUrl.replace(/\/$/, "")}/pagarme/webhook`,
    mercadopago: `${backendUrl.replace(/\/$/, "")}/mercadopago/webhook`,
  };

  async function copyWebhookUrl(gateway: Gateway) {
    try {
      await navigator.clipboard.writeText(webhookUrls[gateway]);
      setCopiedWebhook(gateway);
      setTimeout(() => setCopiedWebhook(null), 1500);
    } catch {
      toast.error(tErrors("loadFailed"));
    }
  }

  // ── Per-tenant gateway config ──────────────────────────────────────────────
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [tenantGateway, setTenantGateway] = useState<Gateway>("asaas");
  const [tenantAsaasToken, setTenantAsaasToken] = useState("");
  const [tenantStripeToken, setTenantStripeToken] = useState("");
  const [tenantPagarmeToken, setTenantPagarmeToken] = useState("");
  const [tenantMercadopagoToken, setTenantMercadopagoToken] = useState("");
  const [savingTenant, setSavingTenant] = useState(false);
  const [migrating, setMigrating] = useState(false);

  async function load() {
    try {
      const { data } = await fetchPlans();
      setPlans(Array.isArray(data) ? data : data?.plan || data?.plans || []);
    } catch { toast.error(t("errorLoading")); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();

    fetchTenants().then((res) => {
      const list: TenantOption[] = Array.isArray(res.data) ? res.data : res.data?.tenants || [];
      setTenants(list);
    }).catch(() => { toast.error(tErrors("loadFailed")); });

    fetchPaymentGatewayGlobalConfig().then((res) => {
      const cfg = res.data || {};
      setGlobalGateway((cfg.gateway as Gateway) || "asaas");
      setGlobalAsaasToken(cfg.asaasToken || "");
      setGlobalStripeToken(cfg.stripeToken || "");
      setGlobalPagarmeToken(cfg.pagarmeToken || "");
      setGlobalMercadopagoToken(cfg.mercadopagoToken || "");
      setGlobalFirstChargeDueDays(typeof cfg.firstChargeDueDays === "number" ? cfg.firstChargeDueDays : 30);
      setGlobalRequirePaymentBeforeAccess(cfg.requirePaymentBeforeAccess === true);
      setAsaasWebhookToken(cfg.asaasWebhookToken || "");
      setStripeWebhookSecret(cfg.stripeWebhookSecret || "");
      setPagarmeWebhookBasic(cfg.pagarmeWebhookBasic || "");
      setMercadopagoWebhookSecret(cfg.mercadopagoWebhookSecret || "");
    }).catch(() => { toast.error(tErrors("loadFailed")); });
  }, []);

  // When tenant selection changes, populate fields with that tenant's data
  useEffect(() => {
    if (!selectedTenantId) return;
    const tenant = tenants.find((t) => String(t.id) === selectedTenantId);
    if (!tenant) return;
    const gw = (tenant.paymentGateway as Gateway) || "asaas";
    setTenantGateway(gw);
    setTenantAsaasToken(tenant.asaasToken || "");
    setTenantStripeToken(tenant.stripeToken || "");
    setTenantPagarmeToken(tenant.pagarmeToken || "");
    setTenantMercadopagoToken(tenant.mercadopagoToken || "");
  }, [selectedTenantId, tenants]);

  function openCreate() {
    setEditing(EMPTY);
    setPlanCaps({});
    setChannelRestrict(false);
    setPlanChannels([]);
    setPlanChannelLimits({});
    setPlanGalleryMB("");
    setOpen(true);
  }
  function openEdit(p: Plan) {
    setEditing({ ...p });
    setPlanCaps((p.features?.caps as Record<string, boolean>) || {});
    const ac = p.features?.limits?.allowedChannels;
    setChannelRestrict(Array.isArray(ac) && ac.length > 0);
    setPlanChannels(Array.isArray(ac) ? [...ac] : []);
    setPlanChannelLimits((p.features?.limits?.channelConnectionLimits as Record<string, number>) || {});
    const galleryMB = (p.features?.limits as Record<string, unknown> | undefined)?.maxGalleryMB;
    setPlanGalleryMB(typeof galleryMB === "number" ? String(galleryMB) : "");
    setOpen(true);
  }

  async function handleSave() {
    if (!editing.name) { toast.error(t("errorNameRequired")); return; }
    setSaving(true);
    try {
      // O plano é o teto: features.caps define o que o tenant poderá acessar.
      const limits: Record<string, any> = { ...(editing.features?.limits || {}) };
      if (channelRestrict) {
        // Tipos liberados = selecionados; quantidade por tipo (0/vazio = ilimitado).
        // Tipos não selecionados ficam de fora => bloqueados pelo guard do backend.
        limits.allowedChannels = planChannels;
        limits.channelConnectionLimits = Object.fromEntries(
          planChannels.map((c) => [c, planChannelLimits[c] || 0])
        );
      } else {
        // Sem restrição de canais neste plano (herda o default do tenant — sem regressão).
        delete limits.allowedChannels;
        delete limits.channelConnectionLimits;
      }
      // Quota da galeria: vazio = não definido (preserva o tenant); 0 = ilimitado explícito.
      if (planGalleryMB.trim() === "") {
        delete limits.maxGalleryMB;
      } else {
        limits.maxGalleryMB = Math.max(0, Number(planGalleryMB) || 0);
      }
      const features = { ...(editing.features || {}), caps: planCaps, limits };
      const payload = { ...editing, features };
      if (editing.id) {
        await updatePlan(editing.id, payload);
        toast.success(t("planUpdated"));
      } else {
        await createPlan(payload);
        toast.success(t("planCreated"));
      }
      setOpen(false);
      load();
    } catch { toast.error(t("errorSaving")); }
    finally { setSaving(false); }
  }

  async function handleSaveGlobal() {
    setSavingGlobal(true);
    try {
      await updatePaymentGatewayGlobalConfig({
        gateway: globalGateway,
        asaasToken: globalAsaasToken,
        stripeToken: globalStripeToken,
        pagarmeToken: globalPagarmeToken,
        mercadopagoToken: globalMercadopagoToken,
        firstChargeDueDays: globalFirstChargeDueDays,
        requirePaymentBeforeAccess: globalRequirePaymentBeforeAccess,
      });
      toast.success(t("globalConfigSaved"));
    } catch { toast.error(t("errorSavingGlobalConfig")); }
    finally { setSavingGlobal(false); }
  }

  async function handleSaveWebhooks() {
    setSavingWebhooks(true);
    try {
      await updatePaymentGatewayGlobalConfig({
        asaasWebhookToken,
        stripeWebhookSecret,
        pagarmeWebhookBasic,
        mercadopagoWebhookSecret,
      });
      toast.success(t("webhookSecretsSaved"));
    } catch { toast.error(t("errorSavingWebhookSecrets")); }
    finally { setSavingWebhooks(false); }
  }

  async function handleSaveTenantConfig() {
    if (!selectedTenantId) { toast.error(t("errorSelectTenant")); return; }
    setSavingTenant(true);
    try {
      await updatePaymentGatewayConfig({
        tenantId: Number(selectedTenantId),
        paymentGateway: tenantGateway,
        asaasToken: tenantAsaasToken,
        stripeToken: tenantStripeToken,
        pagarmeToken: tenantPagarmeToken,
        mercadopagoToken: tenantMercadopagoToken,
      });
      toast.success(t("gatewayConfigSaved"));
    } catch { toast.error(t("errorSavingGatewayConfig")); }
    finally { setSavingTenant(false); }
  }

  async function handleMigrateTenant() {
    if (!selectedTenantId) { toast.error(t("errorSelectTenant")); return; }
    setMigrating(true);
    try {
      const { data } = await migrateTenantsToGlobalGateway({ tenantIds: [Number(selectedTenantId)] });
      const r = data?.results?.[0];
      if (r?.ok) {
        toast.success(t("migrateOk", { gateway: data.gateway }));
        load();
      } else {
        toast.error(t("migrateFail", { error: r?.error || "erro" }));
      }
    } catch { toast.error(t("migrateFail", { error: "erro" })); }
    finally { setMigrating(false); }
  }

  async function handleDelete(p: Plan) {
    if (!confirm(t("confirmDelete", { name: p.name }))) return;
    try {
      await deletePlan(p.id);
      toast.success(t("planDeleted"));
      load();
    } catch { toast.error(t("errorDeleting")); }
  }

  // Aviso de inconsistência: a soma dos limites por tipo não pode exceder o teto geral (Conexões).
  const planMaxConn = Number(editing.connections) || 0;
  const planChannelSum = channelRestrict
    ? planChannels.reduce((acc, c) => acc + (Number(planChannelLimits[c]) > 0 ? Number(planChannelLimits[c]) : 0), 0)
    : 0;
  const showPlanChannelOverflow = channelRestrict && planMaxConn > 0 && planChannelSum > planMaxConn;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2"), t("helpS2I3"), t("helpS2I4")] },
          ],
        }}
      >
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> {t("newPlan")}
        </Button>
      </PageHeader>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : plans.length === 0 ? (
        <EmptyState icon={Package} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colPrice")}</TableHead>
                  <TableHead>{t("colConnections")}</TableHead>
                  <TableHead>{t("colUsers")}</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead>{t("colTrialDays")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">{p.id}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>R$ {Number(p.value).toFixed(2)}</TableCell>
                    <TableCell>{p.connections}</TableCell>
                    <TableCell>{p.users}</TableCell>
                    <TableCell>
                      <Badge variant={p.trial === "enabled" ? "warning" : "secondary"}>
                        {p.trial === "enabled" ? t("yes") : t("no")}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.trialPeriod ?? "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="mr-2 h-4 w-4" /> {t("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(p)}>
                            <Trash2 className="mr-2 h-4 w-4" /> {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Global gateway config ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{t("sectionGlobalConfig")}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("sectionGlobalConfigDesc")}</p>

          {/* Banner: como funcionam planos, cobrança e bloqueio */}
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">{t("billingFlowTitle")}</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>{t("billingFlowI0")}</li>
                <li>{t("billingFlowI1")}</li>
                <li>{t("billingFlowI2")}</li>
                <li>{t("billingFlowI3")}</li>
              </ul>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("labelGateway")}</Label>
            <Select value={globalGateway} onValueChange={(v) => setGlobalGateway(v as Gateway)}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asaas">{t("gatewayAsaas")}</SelectItem>
                <SelectItem value="stripe">{t("gatewayStripe")}</SelectItem>
                <SelectItem value="pagarme">{t("gatewayPagarme")}</SelectItem>
                <SelectItem value="mercadopago">{t("gatewayMercadopago")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {globalGateway === "asaas" && (
            <TokenInput
              label={t("sectionAsaasToken")}
              placeholder={t("asaasTokenPlaceholder")}
              value={globalAsaasToken}
              onChange={setGlobalAsaasToken}
            />
          )}
          {globalGateway === "stripe" && (
            <TokenInput
              label={t("labelStripeToken")}
              placeholder={t("stripeTokenPlaceholder")}
              value={globalStripeToken}
              onChange={setGlobalStripeToken}
            />
          )}
          {globalGateway === "pagarme" && (
            <TokenInput
              label={t("labelPagarmeToken")}
              placeholder={t("pagarmeTokenPlaceholder")}
              value={globalPagarmeToken}
              onChange={setGlobalPagarmeToken}
            />
          )}
          {globalGateway === "mercadopago" && (
            <TokenInput
              label={t("labelMercadopagoToken")}
              placeholder={t("mercadopagoTokenPlaceholder")}
              value={globalMercadopagoToken}
              onChange={setGlobalMercadopagoToken}
            />
          )}

          {/* Cobrança no cadastro (signup) — globais */}
          <div className="space-y-1.5">
            <Label>{t("labelFirstChargeDueDays")}</Label>
            <Input
              type="number"
              min={0}
              max={365}
              className="w-full sm:w-64"
              value={globalFirstChargeDueDays}
              onChange={(e) => setGlobalFirstChargeDueDays(Math.min(365, Math.max(0, Number(e.target.value) || 0)))}
            />
            <p className="text-xs text-muted-foreground">{t("firstChargeDueDaysHelp")}</p>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-semibold">{t("labelRequirePaymentBeforeAccess")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("requirePaymentBeforeAccessHelp")}</p>
            </div>
            <Switch
              checked={globalRequirePaymentBeforeAccess}
              onCheckedChange={setGlobalRequirePaymentBeforeAccess}
            />
          </div>

          <Button onClick={handleSaveGlobal} disabled={savingGlobal}>
            {savingGlobal ? t("saving") : t("saveGlobalConfig")}
          </Button>
        </CardContent>
      </Card>

      {/* ── Webhook secrets per gateway ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{t("sectionWebhooks")}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("sectionWebhooksDesc")}</p>

          <div className="grid gap-4 lg:grid-cols-2">
            {(["asaas", "stripe", "pagarme", "mercadopago"] as Gateway[]).map((gw) => (
              <div key={gw} className="border rounded-md p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{gw === "mercadopago" ? "Mercado Pago" : gw === "pagarme" ? "Pagar.me" : gw}</span>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("webhookUrl")}</Label>
                  <div className="relative">
                    <Input
                      readOnly
                      value={webhookUrls[gw]}
                      className="pr-10 font-mono text-xs bg-muted/40"
                    />
                    <button
                      type="button"
                      onClick={() => copyWebhookUrl(gw)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={t("copy")}
                    >
                      {copiedWebhook === gw ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {gw === "asaas" && (
                  <TokenInput
                    label={t("webhookAsaasTokenLabel")}
                    placeholder={t("webhookAsaasTokenPlaceholder")}
                    value={asaasWebhookToken}
                    onChange={setAsaasWebhookToken}
                    generateLabel={t("generateToken")}
                    onGenerate={() => {
                      setAsaasWebhookToken(randomHex(16));
                      toast.success(t("tokenGenerated"));
                    }}
                  />
                )}
                {gw === "stripe" && (
                  <>
                    <TokenInput
                      label={t("webhookStripeSecretLabel")}
                      placeholder={t("webhookStripeSecretPlaceholder")}
                      value={stripeWebhookSecret}
                      onChange={setStripeWebhookSecret}
                    />
                    <p className="text-[11px] text-muted-foreground">{t("webhookStripeNote")}</p>
                  </>
                )}
                {gw === "pagarme" && (
                  <TokenInput
                    label={t("webhookPagarmeBasicLabel")}
                    placeholder={t("webhookPagarmeBasicPlaceholder")}
                    value={pagarmeWebhookBasic}
                    onChange={setPagarmeWebhookBasic}
                    generateLabel={t("generateToken")}
                    onGenerate={() => {
                      setPagarmeWebhookBasic(generateBasicPair());
                      toast.success(t("tokenGenerated"));
                    }}
                  />
                )}
                {gw === "mercadopago" && (
                  <>
                    <TokenInput
                      label={t("webhookMpSecretLabel")}
                      placeholder={t("webhookMpSecretPlaceholder")}
                      value={mercadopagoWebhookSecret}
                      onChange={setMercadopagoWebhookSecret}
                    />
                    <p className="text-[11px] text-muted-foreground">{t("webhookMpNote")}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          <Button onClick={handleSaveWebhooks} disabled={savingWebhooks}>
            {savingWebhooks ? t("saving") : t("saveWebhookSecrets")}
          </Button>
        </CardContent>
      </Card>

      {/* ── Per-tenant gateway config ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{t("sectionGateway")}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("sectionGatewayDesc")}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("labelTenant")}</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectTenantPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((ten) => (
                    <SelectItem key={ten.id} value={String(ten.id)}>
                      {ten.name} (ID: {ten.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("labelGateway")}</Label>
              <Select value={tenantGateway} onValueChange={(v) => setTenantGateway(v as Gateway)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asaas">{t("gatewayAsaas")}</SelectItem>
                  <SelectItem value="stripe">{t("gatewayStripe")}</SelectItem>
                  <SelectItem value="pagarme">{t("gatewayPagarme")}</SelectItem>
                  <SelectItem value="mercadopago">{t("gatewayMercadopago")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {tenantGateway === "asaas" && (
            <TokenInput
              label={t("sectionAsaasToken")}
              placeholder={t("asaasTokenPlaceholder")}
              value={tenantAsaasToken}
              onChange={setTenantAsaasToken}
            />
          )}
          {tenantGateway === "stripe" && (
            <TokenInput
              label={t("labelStripeToken")}
              placeholder={t("stripeTokenPlaceholder")}
              value={tenantStripeToken}
              onChange={setTenantStripeToken}
            />
          )}
          {tenantGateway === "pagarme" && (
            <TokenInput
              label={t("labelPagarmeToken")}
              placeholder={t("pagarmeTokenPlaceholder")}
              value={tenantPagarmeToken}
              onChange={setTenantPagarmeToken}
            />
          )}
          {tenantGateway === "mercadopago" && (
            <TokenInput
              label={t("labelMercadopagoToken")}
              placeholder={t("mercadopagoTokenPlaceholder")}
              value={tenantMercadopagoToken}
              onChange={setTenantMercadopagoToken}
            />
          )}

          <Button onClick={handleSaveTenantConfig} disabled={savingTenant || !selectedTenantId}>
            {savingTenant ? t("saving") : t("saveGatewayConfig")}
          </Button>

          <div className="mt-3 space-y-1.5 border-t pt-3">
            <Button
              variant="outline"
              onClick={handleMigrateTenant}
              disabled={migrating || !selectedTenantId}
            >
              {migrating ? t("migrating") : t("migrateToGlobalBtn")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("migrateHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing.id ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("labelName")}</Label>
              <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t("namePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("labelValue")}</Label>
                <Input type="number" step="0.01" value={editing.value ?? 0} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelConnections")}</Label>
                <Input type="number" value={editing.connections ?? 3} onChange={(e) => setEditing({ ...editing, connections: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelUsers")}</Label>
                <Input type="number" value={editing.users ?? 5} onChange={(e) => setEditing({ ...editing, users: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelTrialDays")}</Label>
                <Input type="number" value={editing.trialPeriod ?? 3} onChange={(e) => setEditing({ ...editing, trialPeriod: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>{t("labelGalleryQuota")}</Label>
                <Input type="number" min={0} value={planGalleryMB} onChange={(e) => setPlanGalleryMB(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("galleryQuotaHelp")}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("labelTrialPeriod")}</Label>
              <Switch
                checked={editing.trial === "enabled"}
                onCheckedChange={(v) => setEditing({ ...editing, trial: v ? "enabled" : "disabled" })}
              />
            </div>

            {/* Catálogo (pricing pública) */}
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-semibold">{t("catalogSection")}</p>
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs leading-relaxed text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 space-y-1">
                  <p>{t("catalogUrlBanner")}</p>
                  <a href={pricingUrl} target="_blank" rel="noreferrer" className="block break-all font-mono font-semibold underline">
                    {pricingUrl}
                  </a>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label>{t("labelIsPublic")}</Label>
                  <p className="text-xs text-muted-foreground">{t("isPublicHelp")}</p>
                </div>
                <Switch checked={editing.isPublic === true} onCheckedChange={(v) => setEditing({ ...editing, isPublic: v })} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label>{t("labelHighlight")}</Label>
                  <p className="text-xs text-muted-foreground">{t("highlightHelp")}</p>
                </div>
                <Switch checked={editing.highlight === true} onCheckedChange={(v) => setEditing({ ...editing, highlight: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelDisplayOrder")}</Label>
                <Input type="number" value={editing.displayOrder ?? 0} onChange={(e) => setEditing({ ...editing, displayOrder: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelDescription")}</Label>
                <Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder={t("descriptionPlaceholder")} />
              </div>
            </div>

            {/* Funcionalidades incluídas — o plano é o teto do acesso do tenant */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t("featuresSection")}</p>
                  <p className="text-xs text-muted-foreground">{t("featuresSectionHelp")}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setPlanCaps(Object.fromEntries(PLAN_CAPABILITIES.map((c) => [c.key, true])))}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {tt("selectAll")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanCaps(Object.fromEntries(PLAN_CAPABILITIES.map((c) => [c.key, false])))}
                    className="text-xs font-medium text-muted-foreground hover:underline"
                  >
                    {tt("deselectAll")}
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs leading-relaxed text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{t("featuresSectionSyncNote")}</p>
              </div>
              {CAPABILITY_CATEGORIES.map((cat) => {
                const items = PLAN_CAPABILITIES.filter((c) => c.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`planCapCat.${cat}` as Parameters<typeof t>[0])}
                    </p>
                    {items.map((c) => (
                      <div key={c.key} className="flex items-center justify-between pl-1">
                        <span className="text-sm">{t(`planCap.${c.key}` as Parameters<typeof t>[0])}</span>
                        <Switch
                          checked={planCaps[c.key] !== false}
                          onCheckedChange={(v) => setPlanCaps((prev) => ({ ...prev, [c.key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Canais & limites por tipo — o plano define quais tipos e quantos de cada */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t("channelsSection")}</p>
                  <p className="text-xs text-muted-foreground">{t("channelsSectionHelp")}</p>
                </div>
                <Switch checked={channelRestrict} onCheckedChange={setChannelRestrict} />
              </div>
              {showPlanChannelOverflow && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
                  {tt("channelLimitsOverflowWarning", { sum: planChannelSum, max: planMaxConn })}
                </div>
              )}
              {channelRestrict && (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setPlanChannels(CHANNEL_TYPES.map((c) => c.value)); setPlanChannelLimits({}); }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {tt("markAllUnlimited")}
                    </button>
                  </div>
                  <div className="space-y-0.5">
                  {CHANNEL_TYPES.map((ch) => {
                    const included = planChannels.includes(ch.value);
                    const limit = Number(planChannelLimits[ch.value]) || 0;
                    const unlimited = limit <= 0; // 0/ausente = ilimitado
                    return (
                      <div key={ch.value} className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-muted/40">
                        <Checkbox
                          checked={included}
                          onCheckedChange={() => togglePlanChannel(ch.value)}
                          className="shrink-0"
                        />
                        <span
                          className="flex-1 min-w-0 cursor-pointer text-sm"
                          onClick={() => togglePlanChannel(ch.value)}
                        >
                          {tt(ch.labelKey as Parameters<typeof tt>[0])}
                        </span>
                        {included && (
                          <div className="flex shrink-0 items-center gap-2">
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                              <Checkbox
                                checked={unlimited}
                                onCheckedChange={(v) =>
                                  setPlanChannelLimits((prev) => ({ ...prev, [ch.value]: v ? 0 : 1 }))
                                }
                              />
                              {t("channelQtyUnlimited")}
                            </label>
                            <Input
                              type="number"
                              min={1}
                              disabled={unlimited}
                              value={unlimited ? "" : limit}
                              placeholder="—"
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                setPlanChannelLimits((prev) => ({ ...prev, [ch.value]: val }));
                              }}
                              className="h-7 w-16 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? t("saving") : t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
