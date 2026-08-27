"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { displayContactIdentity } from "@/lib/contact-identity";
import { Plus, Pencil, Trash2, BarChart2, TrendingUp, Search, RefreshCw, ExternalLink, RotateCw, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  listConversionCredentials,
  createConversionCredential,
  updateConversionCredential,
  deleteConversionCredential,
  listConversionRules,
  createConversionRule,
  updateConversionRule,
  deleteConversionRule,
  listAdReferralReport,
  retryAdReferralConversion,
  retryBulkAdReferralConversion,
  type ConversionCredential,
  type ConversionRule,
  type AdReferralLog,
} from "@/services/conversion";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";

const TRIGGERS = [
  "conversa_iniciada_anuncio",
  "campanha_enviada",
  "bulk_enviado",
  "waba_template_enviado",
] as const;

const AD_ATTRIBUTION_TRIGGERS = new Set(["conversa_iniciada_anuncio"]);

const PLATFORMS = ["meta", "google"] as const;

const CHANNEL_LABELS: Record<string, string> = {
  waba: "WhatsApp (WABA)",
  instagram: "Instagram",
  messenger: "Messenger",
};

const CHANNEL_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  waba: "default",
  instagram: "secondary",
  messenger: "outline",
};

const CONVERSION_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "default",
  failed: "destructive",
  pending: "secondary",
  no_rule: "outline",
  skipped: "outline",
};

type MetaErrorKind =
  | "no_waba_linked"
  | "missing_waba_id"
  | "ctwa_clid_expired"
  | "invalid_token"
  | "unknown";

function parseMetaError(conversionResponse: string | null | undefined): MetaErrorKind | null {
  if (!conversionResponse) return null;
  try {
    const parsed = JSON.parse(conversionResponse);
    const err = parsed?.error;
    if (!err) return null;
    const sub = err.error_subcode;
    if (sub === 2804132) return "no_waba_linked";
    if (sub === 2804116) return "missing_waba_id";
    if (sub === 2804141) return "ctwa_clid_expired";
    if (err.code === 190 || err.type === "OAuthException" && /token/i.test(err.message || "")) {
      return "invalid_token";
    }
    return "unknown";
  } catch {
    return null;
  }
}

const emptyCredential: Omit<ConversionCredential, "id" | "createdAt" | "rules"> = {
  platform: "meta",
  name: "",
  platformId: "",
  platformSecret: "",
  isActive: true,
};

const emptyRule: Omit<ConversionRule, "id" | "createdAt" | "credential"> = {
  credentialId: 0,
  trigger: "campanha_enviada",
  eventName: "",
  conversionValue: null,
  currency: "BRL",
  isActive: true,
};

// ─── Tab: Configurações ───────────────────────────────────────────────────────

function ConfigTab() {
  const t = useTranslations("conversoesPage");

  const [credentials, setCredentials] = useState<ConversionCredential[]>([]);
  const [rules, setRules] = useState<ConversionRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [credDialog, setCredDialog] = useState(false);
  const [credForm, setCredForm] = useState({ ...emptyCredential });
  const [editingCredId, setEditingCredId] = useState<number | null>(null);
  const [credSaving, setCredSaving] = useState(false);
  const [deleteCredId, setDeleteCredId] = useState<number | null>(null);

  const [ruleDialog, setRuleDialog] = useState(false);
  const [ruleForm, setRuleForm] = useState({ ...emptyRule });
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [creds, rls] = await Promise.all([
        listConversionCredentials(),
        listConversionRules(),
      ]);
      setCredentials(creds);
      setRules(rls);
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);

  const openNewCred = () => {
    setEditingCredId(null);
    setCredForm({ ...emptyCredential });
    setCredDialog(true);
  };

  const openEditCred = (cred: ConversionCredential) => {
    setEditingCredId(cred.id);
    setCredForm({
      platform: cred.platform,
      name: cred.name,
      platformId: cred.platformId,
      platformSecret: cred.platformSecret,
      isActive: cred.isActive,
    });
    setCredDialog(true);
  };

  const saveCred = async () => {
    if (!credForm.name || !credForm.platformId || !credForm.platformSecret) {
      toast.error(t("errorRequiredFields"));
      return;
    }
    setCredSaving(true);
    try {
      if (editingCredId) {
        await updateConversionCredential(editingCredId, credForm);
        toast.success(t("credUpdated"));
      } else {
        await createConversionCredential(credForm);
        toast.success(t("credCreated"));
      }
      setCredDialog(false);
      loadData();
    } catch {
      toast.error(t("errorSaving"));
    } finally {
      setCredSaving(false);
    }
  };

  const confirmDeleteCred = async () => {
    if (!deleteCredId) return;
    try {
      await deleteConversionCredential(deleteCredId);
      toast.success(t("credDeleted"));
      setDeleteCredId(null);
      loadData();
    } catch {
      toast.error(t("errorDeleting"));
    }
  };

  const openNewRule = () => {
    setEditingRuleId(null);
    setRuleForm({ ...emptyRule, credentialId: credentials[0]?.id || 0 });
    setRuleDialog(true);
  };

  const openEditRule = (rule: ConversionRule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      credentialId: rule.credentialId,
      trigger: rule.trigger,
      eventName: rule.eventName,
      conversionValue: rule.conversionValue,
      currency: rule.currency || "BRL",
      isActive: rule.isActive,
    });
    setRuleDialog(true);
  };

  const saveRule = async () => {
    if (!ruleForm.credentialId || !ruleForm.eventName) {
      toast.error(t("errorRequiredFields"));
      return;
    }
    setRuleSaving(true);
    try {
      if (editingRuleId) {
        await updateConversionRule(editingRuleId, ruleForm);
        toast.success(t("ruleUpdated"));
      } else {
        await createConversionRule(ruleForm);
        toast.success(t("ruleCreated"));
      }
      setRuleDialog(false);
      loadData();
    } catch {
      toast.error(t("errorSaving"));
    } finally {
      setRuleSaving(false);
    }
  };

  const confirmDeleteRule = async () => {
    if (!deleteRuleId) return;
    try {
      await deleteConversionRule(deleteRuleId);
      toast.success(t("ruleDeleted"));
      setDeleteRuleId(null);
      loadData();
    } catch {
      toast.error(t("errorDeleting"));
    }
  };

  const getTriggerLabel = (trigger: string) => t(`trigger_${trigger}` as any);
  const isAdAttributionTrigger = (trigger: string) => AD_ATTRIBUTION_TRIGGERS.has(trigger);
  const getPlatformLabel = (platform: string) =>
    platform === "meta" ? "Meta / Facebook" : "Google GA4";
  const getCredentialName = (credentialId: number) =>
    credentials.find((c) => c.id === credentialId)?.name || "-";

  return (
    <div className="space-y-6">
      {/* Credenciais */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5" />
              {t("credTitle")}
            </CardTitle>
            <CardDescription>{t("credDescription")}</CardDescription>
          </div>
          <Button size="sm" onClick={openNewCred}>
            <Plus className="h-4 w-4 mr-1" />
            {t("addCred")}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : credentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCredentials")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colPlatform")}</TableHead>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colPlatformId")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.map((cred) => (
                  <TableRow key={cred.id}>
                    <TableCell>
                      <Badge variant="outline">{getPlatformLabel(cred.platform)}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{cred.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">
                      {cred.platformId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cred.isActive ? "default" : "secondary"}>
                        {cred.isActive ? t("active") : t("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditCred(cred)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDeleteCredId(cred.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Regras */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t("ruleTitle")}
            </CardTitle>
            <CardDescription>{t("ruleDescription")}</CardDescription>
          </div>
          <Button size="sm" onClick={openNewRule} disabled={credentials.length === 0}>
            <Plus className="h-4 w-4 mr-1" />
            {t("addRule")}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRules")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colTrigger")}</TableHead>
                  <TableHead>{t("colEventName")}</TableHead>
                  <TableHead>{t("colCredential")}</TableHead>
                  <TableHead>{t("colValue")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary">{getTriggerLabel(rule.trigger)}</Badge>
                        {isAdAttributionTrigger(rule.trigger) ? (
                          <span className="text-xs text-green-600 font-medium">{t("adAttributionLabel")}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("noAdAttributionLabel")}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium font-mono text-sm">{rule.eventName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.credential?.name || getCredentialName(rule.credentialId)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {rule.conversionValue != null
                        ? `${rule.conversionValue} ${rule.currency}`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.isActive ? "default" : "secondary"}>
                        {rule.isActive ? t("active") : t("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDeleteRuleId(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Credencial */}
      <Dialog open={credDialog} onOpenChange={setCredDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCredId ? t("editCred") : t("newCred")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{t("labelPlatform")}</Label>
              <Select
                value={credForm.platform}
                onValueChange={(v) => setCredForm((f) => ({ ...f, platform: v as "meta" | "google" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>{getPlatformLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("labelName")}</Label>
              <Input
                value={credForm.name}
                onChange={(e) => setCredForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("placeholderName")}
              />
            </div>
            <div className="space-y-1">
              <Label>{credForm.platform === "meta" ? t("labelPixelId") : t("labelMeasurementId")}</Label>
              <Input
                value={credForm.platformId}
                onChange={(e) => setCredForm((f) => ({ ...f, platformId: e.target.value }))}
                placeholder={credForm.platform === "meta" ? "123456789" : "G-XXXXXXXXXX"}
              />
            </div>
            <div className="space-y-1">
              <Label>{credForm.platform === "meta" ? t("labelAccessToken") : t("labelApiSecret")}</Label>
              <Input
                type="password"
                value={credForm.platformSecret}
                onChange={(e) => setCredForm((f) => ({ ...f, platformSecret: e.target.value }))}
                placeholder={credForm.platform === "meta" ? "EAAxxxxx..." : "api_secret"}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={credForm.isActive}
                onCheckedChange={(v) => setCredForm((f) => ({ ...f, isActive: v }))}
              />
              <Label>{t("labelActive")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredDialog(false)}>{t("cancel")}</Button>
            <Button onClick={saveCred} disabled={credSaving}>
              {credSaving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Regra */}
      <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRuleId ? t("editRule") : t("newRule")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{t("labelCredential")}</Label>
              <Select
                value={String(ruleForm.credentialId)}
                onValueChange={(v) => setRuleForm((f) => ({ ...f, credentialId: Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {credentials.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} ({getPlatformLabel(c.platform)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("labelTrigger")}</Label>
              <Select
                value={ruleForm.trigger}
                onValueChange={(v) => setRuleForm((f) => ({ ...f, trigger: v as ConversionRule["trigger"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((tr) => (
                    <SelectItem key={tr} value={tr}>
                      <span className="flex flex-col">
                        <span>{getTriggerLabel(tr)}</span>
                        {!isAdAttributionTrigger(tr) && (
                          <span className="text-xs text-muted-foreground">{t("noAdAttributionLabel")}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("labelEventName")}</Label>
              <Input
                value={ruleForm.eventName}
                onChange={(e) => setRuleForm((f) => ({ ...f, eventName: e.target.value }))}
                placeholder={t("placeholderEventName")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("labelValue")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ruleForm.conversionValue ?? ""}
                  onChange={(e) =>
                    setRuleForm((f) => ({
                      ...f,
                      conversionValue: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("labelCurrency")}</Label>
                <Input
                  value={ruleForm.currency}
                  onChange={(e) => setRuleForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                  placeholder="BRL"
                  maxLength={3}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={ruleForm.isActive}
                onCheckedChange={(v) => setRuleForm((f) => ({ ...f, isActive: v }))}
              />
              <Label>{t("labelActive")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialog(false)}>{t("cancel")}</Button>
            <Button onClick={saveRule} disabled={ruleSaving}>
              {ruleSaving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete credential */}
      <Dialog open={!!deleteCredId} onOpenChange={(o) => !o && setDeleteCredId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("confirmDeleteTitle")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("confirmDeleteCredDesc")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCredId(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={confirmDeleteCred}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete rule */}
      <Dialog open={!!deleteRuleId} onOpenChange={(o) => !o && setDeleteRuleId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("confirmDeleteTitle")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("confirmDeleteRuleDesc")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRuleId(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={confirmDeleteRule}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Conversion Status Cell ───────────────────────────────────────────────────

function ConversionStatusCell({
  row,
  onRetry,
}: {
  row: AdReferralLog;
  onRetry: (id: number) => Promise<void>;
}) {
  const t = useTranslations("relatorioAnunciosPage");
  const [retrying, setRetrying] = useState(false);
  const status = row.conversionStatus || "pending";
  const variant = CONVERSION_STATUS_VARIANT[status] || "outline";
  const label = t(`conversionStatus_${status}` as any);

  const hasDetails =
    row.conversionStatusCode != null ||
    row.conversionFbtraceId ||
    row.conversionError ||
    row.conversionEventName ||
    row.conversionAttemptedAt;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry(row.id);
    } finally {
      setRetrying(false);
    }
  };

  const badge = <Badge variant={variant}>{label}</Badge>;

  const badgeWithTooltip = hasDetails ? (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{badge}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-md whitespace-pre-wrap break-all">
          <div className="space-y-1 text-left">
            {row.conversionEventName && (
              <div>
                <span className="opacity-70">{t("tooltipEventName")}:</span>{" "}
                <span className="font-mono">{row.conversionEventName}</span>
              </div>
            )}
            {row.conversionStatusCode != null && (
              <div>
                <span className="opacity-70">{t("tooltipHttp")}:</span>{" "}
                <span className="font-mono">{row.conversionStatusCode}</span>
              </div>
            )}
            {row.conversionFbtraceId && (
              <div>
                <span className="opacity-70">{t("tooltipFbtrace")}:</span>{" "}
                <span className="font-mono">{row.conversionFbtraceId}</span>
              </div>
            )}
            {row.conversionError && (
              <div>
                <span className="opacity-70">{t("tooltipError")}:</span>{" "}
                <span className="font-mono">{row.conversionError}</span>
              </div>
            )}
            {row.conversionAttemptedAt && (
              <div>
                <span className="opacity-70">{t("tooltipAttemptedAt")}:</span>{" "}
                {new Date(row.conversionAttemptedAt).toLocaleString()}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    badge
  );

  const canRetry = status === "failed" || status === "pending";

  return (
    <div className="flex items-center gap-1.5">
      {badgeWithTooltip}
      {canRetry && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={retrying}
          onClick={handleRetry}
          title={retrying ? t("retrying") : t("retry")}
        >
          <RotateCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
        </Button>
      )}
    </div>
  );
}

// ─── Aviso de erro Meta detectado ────────────────────────────────────────────

function MetaErrorAlert({ kind }: { kind: MetaErrorKind }) {
  const t = useTranslations("relatorioAnunciosPage");
  const stepKeys: Record<MetaErrorKind, string[]> = {
    no_waba_linked: ["metaErr_step1", "metaErr_step2", "metaErr_step3_noWaba", "metaErr_step4_noWaba", "metaErr_step5"],
    missing_waba_id: ["metaErr_step_missingWaba1", "metaErr_step_missingWaba2", "metaErr_step5"],
    ctwa_clid_expired: ["metaErr_step_expired1", "metaErr_step_expired2"],
    invalid_token: ["metaErr_step_token1", "metaErr_step_token2"],
    unknown: ["metaErr_step_unknown1", "metaErr_step_unknown2"],
  };
  const steps = stepKeys[kind] || [];
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t(`metaErr_${kind}_title` as any)}</AlertTitle>
      <AlertDescription>
        <p className="mb-2">{t(`metaErr_${kind}_desc` as any)}</p>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          {steps.map((k) => (
            <li key={k}>{t(k as any)}</li>
          ))}
        </ol>
        {kind === "no_waba_linked" && (
          <a
            href="https://business.facebook.com/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm underline"
          >
            {t("metaErr_openBusinessManager")}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ─── Tab: Relatórios ──────────────────────────────────────────────────────────

function ReportTab() {
  const { isLiveMode } = useLiveMode();
  const t = useTranslations("relatorioAnunciosPage");

  const [data, setData] = useState<AdReferralLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Sessões disponíveis para o filtro por canal
  const [sessions, setSessions] = useState<Whatsapp[]>([]);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [channelType, setChannelType] = useState("all");  // waba | instagram | messenger | all
  const [sessionId, setSessionId] = useState("all");      // whatsappId específico
  const [adId, setAdId] = useState("");

  const PAGE_SIZE = 50;

  // Carregar sessões disponíveis uma vez (apenas tipos relevantes para anúncios)
  useEffect(() => {
    fetchWhatsapps().then((res) => {
      const relevant = (res.data || []).filter((s) => {
        const tp = (s.type || "").toLowerCase();
        return tp === "waba" || tp === "waba_coex" || tp.includes("waba") ||
               tp === "instagram" || tp.includes("instagram") ||
               tp === "messenger" || tp.includes("messenger");
      });
      setSessions(relevant);
    }).catch(() => {});
  }, []);

  // Sessões filtradas pelo tipo selecionado
  const filteredSessions = sessions.filter((s) => {
    if (channelType === "all") return true;
    const t = (s.type || "").toLowerCase();
    if (channelType === "waba") return t === "waba" || t === "waba_coex" || t.includes("waba");
    if (channelType === "instagram") return t === "instagram" || t.includes("instagram");
    if (channelType === "messenger") return t === "messenger" || t.includes("messenger");
    return true;
  });

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await listAdReferralReport({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        channel: channelType !== "all" ? channelType : undefined,
        whatsappId: sessionId !== "all" ? Number(sessionId) : undefined,
        adId: adId || undefined,
        page: p,
        pageSize: PAGE_SIZE,
      });
      setData(res.data);
      setTotal(res.total);
      setPage(p);
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, channelType, sessionId, adId, t]);

  const handleRetry = useCallback(async (id: number) => {
    try {
      const updated = await retryAdReferralConversion(id);
      setData((prev) => prev.map((r) => (r.id === id ? updated : r)));
      if (updated.conversionStatus === "sent") {
        toast.success(t("retrySuccess"));
      } else {
        toast.error(t("retryFailed"));
      }
    } catch {
      toast.error(t("retryFailed"));
    }
  }, [t]);

  const [retryingAll, setRetryingAll] = useState(false);

  const handleRetryAll = useCallback(async () => {
    setRetryingAll(true);
    try {
      const result = await retryBulkAdReferralConversion({
        statuses: ["failed", "pending"],
        channel: channelType !== "all" ? channelType : undefined,
        whatsappId: sessionId !== "all" ? Number(sessionId) : undefined,
      });
      if (result.total === 0) {
        toast.info(t("retryAllNoneFound"));
      } else {
        toast.success(
          t("retryAllResult", {
            total: result.total,
            sent: result.sent,
            failed: result.failed,
          } as any)
        );
      }
      await load(page);
    } catch {
      toast.error(t("retryAllError"));
    } finally {
      setRetryingAll(false);
    }
  }, [channelType, sessionId, page, load, t]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Quando o tipo de canal muda, resetar seleção de sessão específica
  const handleChannelTypeChange = (val: string) => {
    setChannelType(val);
    setSessionId("all");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const detectedErrors = useMemo<MetaErrorKind[]>(() => {
    const seen = new Set<MetaErrorKind>();
    for (const row of data) {
      if (row.conversionStatus !== "failed") continue;
      const kind = parseMetaError(row.conversionResponse);
      if (kind) seen.add(kind);
    }
    return Array.from(seen);
  }, [data]);

  const hasRetryable = useMemo(
    () => data.some((r) => r.conversionStatus === "failed" || r.conversionStatus === "pending"),
    [data]
  );

  return (
    <div className="space-y-6">
      {detectedErrors.length > 0 && (
        <div className="space-y-3">
          {detectedErrors.map((kind) => (
            <MetaErrorAlert key={kind} kind={kind} />
          ))}
        </div>
      )}
      {hasRetryable && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetryAll}
            disabled={retryingAll || loading}
          >
            <RotateCw className={`mr-2 h-3.5 w-3.5 ${retryingAll ? "animate-spin" : ""}`} />
            {retryingAll ? t("retryingAll") : t("retryAll")}
          </Button>
        </div>
      )}
      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>{t("filterFrom")}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("filterTo")}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("filterAdId")}</Label>
              <Input
                value={adId}
                onChange={(e) => setAdId(e.target.value)}
                placeholder={t("filterAdIdPlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("filterChannel")}</Label>
              <Select value={channelType} onValueChange={handleChannelTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allChannels")}</SelectItem>
                  <SelectItem value="waba">WhatsApp (WABA)</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="messenger">Messenger</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("filterSession")}</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allSessions")}</SelectItem>
                  {filteredSessions.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                      {s.number ? ` (${s.number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={() => load(1)} disabled={loading} size="sm">
              <Search className="h-4 w-4 mr-1" />
              {t("search")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateFrom(""); setDateTo(""); setChannelType("all"); setSessionId("all"); setAdId("");
                setTimeout(() => load(1), 0);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {t("clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("totalResults", { count: total })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colChannel")}</TableHead>
                      <TableHead>{t("colSession")}</TableHead>
                      <TableHead>{t("colAdId")}</TableHead>
                      <TableHead>{t("colHeadline")}</TableHead>
                      <TableHead>{t("colContact")}</TableHead>
                      <TableHead>{t("colTicket")}</TableHead>
                      <TableHead>{t("colCtwaClid")}</TableHead>
                      <TableHead>{t("colSourceUrl")}</TableHead>
                      <TableHead>{t("colConversionStatus")}</TableHead>
                      <TableHead>{t("colDate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge variant={CHANNEL_COLORS[row.channel] || "outline"}>
                            {CHANNEL_LABELS[row.channel] || row.channel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.whatsapp?.name || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.adId || "-"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">
                          {row.adHeadline || "-"}
                        </TableCell>
                        <TableCell className={cn("text-sm", isLiveMode && "live-blur-text")}>
                          {row.contact
                            ? (row.contact.name || displayContactIdentity(row.contact) || row.contact.email || "-")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {row.ticket ? (
                            <span className="font-mono text-xs">#{row.ticket.id}</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[100px] truncate">
                          {row.ctwaClid ? (
                            <span title={row.ctwaClid}>{row.ctwaClid.slice(0, 18)}...</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {row.adSourceUrl ? (
                            <a
                              href={row.adSourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary inline-flex items-center gap-1 text-xs"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t("viewAd")}
                            </a>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <ConversionStatusCell row={row} onRetry={handleRetry} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    {t("page", { current: page, total: totalPages })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => load(page - 1)}
                    >
                      {t("prev")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || loading}
                      onClick={() => load(page + 1)}
                    >
                      {t("next")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConversoesPage() {
  const t = useTranslations("conversoesPage");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Tabs defaultValue="config">
        <TabsList className="mb-4">
          <TabsTrigger value="config">{t("tabConfig")}</TabsTrigger>
          <TabsTrigger value="report">{t("tabReport")}</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <ConfigTab />
        </TabsContent>

        <TabsContent value="report">
          <ReportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
