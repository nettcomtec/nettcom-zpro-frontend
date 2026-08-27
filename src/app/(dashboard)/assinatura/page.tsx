"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, Key, Calendar, Globe, Info, RefreshCw, Pencil, AlertTriangle, HelpCircle, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  fetchTenantLicense,
  fetchTenantLicenseDetails,
  updateTenantEmail,
  updateTenantDomain,
  refreshTenantLicense,
  checkVersion,
} from "@/services/superadmin";
import { MetaHealthCard } from "@/components/assinatura/meta-health-card";
import { MetaPartnerSealDialog } from "@/components/meta-partner-seal-dialog";
import pkg from "../../../../package.json";

// F5 — Painel do Licenciado: dominios/instalacoes/numeros podem ser geridos la
// (uma instalacao nao mexe nos dominios das outras). Desde 2026-08-03 a edicao de
// dominios volta a existir tambem nesta tela, em paridade com o painel — ate que
// a licenca seja travada pelo primeiro uso do painel.
const LICENSE_PANEL_URL = process.env.NEXT_PUBLIC_LICENSE_PANEL_URL || "https://painel.zdg.com.br";

interface LicenseDetails {
  license_code?: string;
  license_expiry?: string;
  licensed_domains?: string;
  is_blocked?: boolean;
  product_name?: string;
}

interface VersionInfo {
  version?: string;
  expiresAt?: string;
  status?: string;
  daysRemaining?: number;
  expiredSince?: number;
}

export default function AssinaturaPage() {
  const t = useTranslations("assinaturaPage");
  const [loading, setLoading] = useState(true);
  const [tenantEmail, setTenantEmail] = useState("");
  const [license, setLicense] = useState<"enabled" | "disabled">("disabled");
  const [licenseDetails, setLicenseDetails] = useState<LicenseDetails>({});
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  // Email modal
  const [emailModal, setEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Domain modal
  const [domainModal, setDomainModal] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);

  // Refresh cooldown
  const [canRefresh, setCanRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const COOLDOWN_KEY = "lastRefreshLicenseData";
  const COOLDOWN_SEC = 10;
  const VERSION_KEY = "versionInfo";
  const VERSION_TS_KEY = "versionInfoTimestamp";

  function formatDate(d?: string) {
    if (!d) return t("noDateDefined");
    return formatDateTime(new Date(d));
  }

  async function loadData() {
    try {
      const { data } = await fetchTenantLicense();
      const tenant = Array.isArray(data) ? data[0] : data;
      const email = tenant?.tenantEmail || "";
      const lic = tenant?.tenantLicense || "disabled";
      setTenantEmail(email);
      setLicense(lic);

      if (email) {
        const { data: lsData } = await fetchTenantLicenseDetails(email);
        setLicenseDetails(lsData || {});
      }
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }

  async function loadVersion() {
    const cached = localStorage.getItem(VERSION_KEY);
    const ts = localStorage.getItem(VERSION_TS_KEY);
    if (cached && ts) {
      const age = Date.now() - parseInt(ts);
      if (age < 12 * 60 * 60 * 1000) {
        try { setVersionInfo(JSON.parse(cached)); return; } catch {}
      }
    }
    try {
      const { data } = await checkVersion();
      setVersionInfo(data);
      localStorage.setItem(VERSION_KEY, JSON.stringify(data));
      localStorage.setItem(VERSION_TS_KEY, String(Date.now()));
    } catch {}
  }

  function checkCooldown() {
    const last = localStorage.getItem(COOLDOWN_KEY);
    if (last) {
      const diff = Math.floor((Date.now() - parseInt(last)) / 1000);
      if (diff < COOLDOWN_SEC) {
        setCanRefresh(false);
        setTimeout(() => setCanRefresh(true), (COOLDOWN_SEC - diff) * 1000);
      }
    }
  }

  useEffect(() => {
    loadData();
    loadVersion();
    checkCooldown();
  }, []);

  async function handleSaveEmail() {
    if (!newEmail.trim()) { toast.error(t("emailRequired")); return; }
    setSavingEmail(true);
    try {
      await updateTenantEmail({ tenantEmail: newEmail.trim() });
      toast.success(t("emailUpdated"));
      setEmailModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      if (msg === "ERR_LIMIT_MAX") toast.error(t("errorMaxUpdates"));
      else toast.error(t("errorUpdateEmail"));
    } finally {
      setSavingEmail(false);
    }
  }

  // A licenca respondeu que os dominios so podem ser mudados no Painel do
  // Licenciado? O codigo pode vir no corpo do erro (axios) ou no payload de
  // sucesso HTTP com status:false do LicenseBox — por isso varremos os dois.
  function isDomainsLockedError(payload: unknown): boolean {
    const p = payload as {
      error?: string;
      message?: string;
      data?: { error?: string; message?: string };
      response?: { data?: { error?: string; message?: string } };
    } | null;
    const parts = [
      p?.error,
      p?.message,
      p?.data?.error,
      p?.data?.message,
      p?.response?.data?.error,
      p?.response?.data?.message,
    ];
    return parts.some((v) => typeof v === "string" && v.includes("ERR_DOMAINS_LOCKED_PANEL_ONLY"));
  }

  // 2026-08-03: a edicao de dominios voltou a ter ponto de entrada aqui (botao no
  // bloco de dominios), em paridade com o Painel do Licenciado — o card do painel
  // continua na tela. O tratamento de licenca travada segue sendo necessario: assim
  // que o licenciado altera um dominio pelo painel, a licenca so aceita mudanca por
  // la e o POST /tenantsDomain responde ERR_DOMAINS_LOCKED_PANEL_ONLY, que precisa
  // de mensagem propria em vez do erro generico.
  async function handleSaveDomain() {
    const domains = domainInput.split(",").map((d) => d.trim()).filter(Boolean);
    if (domains.length === 0) { toast.error(t("enterAtLeastOneDomain")); return; }
    setSavingDomain(true);
    try {
      const { data } = await updateTenantDomain({ domains });
      if (data?.status === true || data?.status === 1) {
        toast.success(data.message || t("domainsUpdated"));
        setDomainModal(false);
        loadData();
      } else if (isDomainsLockedError(data)) {
        toast.error(t("domainsLockedError"));
      } else {
        toast.error(data?.message || t("errorUpdateDomains"));
      }
    } catch (err: unknown) {
      if (isDomainsLockedError(err)) toast.error(t("domainsLockedError"));
      else toast.error(t("errorUpdateDomains"));
    } finally {
      setSavingDomain(false);
    }
  }

  async function handleRefresh() {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    setCanRefresh(false);
    setTimeout(() => setCanRefresh(true), COOLDOWN_SEC * 1000);
    setRefreshing(true);
    try {
      const { data } = await refreshTenantLicense();
      setLicenseDetails({
        ...licenseDetails,
        license_code: data.license_code,
        license_expiry: data.license_expiry,
        licensed_domains: data.licensed_domains,
        product_name: data.product_name,
      });
      toast.success(t("licenseUpdated"));
      setTimeout(() => window.location.reload(), 8000);
    } catch {
      toast.error(t("errorUpdateLicense"));
    } finally {
      setRefreshing(false);
    }
  }

  const domains = licenseDetails.licensed_domains || "";
  const productSuffix = licenseDetails.product_name?.includes("ZPRO_")
    ? licenseDetails.product_name.split("ZPRO_")[1]
    : "";

  // Abre o modal ja preenchido com os dominios atuais (editar em vez de redigitar).
  // A licenca devolve a lista separada por virgula, mas normalizamos quebra de linha
  // e ponto e virgula para preservar o contrato do campo: handleSaveDomain faz
  // split(",") e o textarea representa a lista inteira.
  function openDomainModal() {
    setDomainInput(
      domains
        .split(/[\n;,]+/)
        .map((d) => d.trim())
        .filter(Boolean)
        .join(", ")
    );
    setDomainModal(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
            { title: t("helpScoreT"), items: [t("helpScoreI0"), t("helpScoreI1"), t("helpScoreI2"), t("helpScoreI3")] },
          ],
        }}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setNewEmail(""); setEmailModal(true); }}>
            <Pencil className="mr-2 h-4 w-4" /> {t("updateLicense")}
          </Button>
          <Button size="sm" disabled={!canRefresh || refreshing} onClick={handleRefresh}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("refreshData")}
          </Button>
        </div>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="max-w-xl space-y-4">
          {/* Meta Business Partner */}
          <div className="flex items-center gap-3 py-2 px-4 rounded-lg border bg-card">
            <MetaPartnerSealDialog imgClassName="h-8 object-contain opacity-90 shrink-0" zoomLabel={t("metaPartnerLabel")} />
            <div>
              <p className="text-xs font-semibold text-[#0866FF] dark:text-blue-400 mb-0.5">{t("metaPartnerLabel")}</p>
              <p className="text-xs text-muted-foreground leading-snug">{t("metaPartnerDescription")}</p>
            </div>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("licenseCard")}</CardTitle></CardHeader>
            <CardContent className="space-y-4 divide-y">
              {/* Status */}
              <div className="flex items-center gap-3 py-2">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">{t("licenseStatus")}</p>
                </div>
                <Badge variant={license === "enabled" ? "success" : "destructive"}>
                  {license === "enabled" ? t("licenseActive") : t("licenseValidating")}
                </Badge>
              </div>

              {/* Código */}
              <div className="flex items-center gap-3 py-2">
                <Key className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">{t("licenseCode")}</p>
                  <p className="font-mono text-sm">{licenseDetails.license_code ? "•".repeat(Math.min(licenseDetails.license_code.length, 32)) : "—"}</p>
                </div>
              </div>

              {/* Validade */}
              <div className="flex items-center gap-3 py-2">
                <Calendar className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">{t("validity")}</p>
                  <p className="text-sm font-medium">{formatDate(licenseDetails.license_expiry)}</p>
                </div>
              </div>

              {/* Domínios — editáveis aqui e no Painel do Licenciado (paridade, 2026-08-03) */}
              <div className="flex items-start gap-3 py-2">
                <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">{t("domains")} {productSuffix && <span className="font-mono">({productSuffix})</span>}</p>
                  <p className="text-sm break-all whitespace-pre-line">{domains || "—"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Button variant="outline" size="sm" onClick={openDomainModal}>
                      <Pencil className="mr-2 h-4 w-4" /> {t("editDomains")}
                    </Button>
                    <a
                      href={LICENSE_PANEL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {t("panelCta")} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-snug">{t("domainsEditNote")}</p>
                </div>
              </div>

              {domains && domains.trim().toLowerCase() === "whatsapp.com" && (
                <Alert variant="warning" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{t("invalidDomainWarning")}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* F5 — Painel do Licenciado (domínios, instalações e números) */}
          <Card>
            <CardHeader><CardTitle className="text-base">{t("panelTitle")}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground leading-snug">{t("panelDesc")}</p>
              <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
                <a href={LICENSE_PANEL_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> {t("panelCta")}
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* F1.36 — Saúde do App Meta (decisão #22) */}
          <MetaHealthCard />

          {versionInfo && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("versionCard")}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1 text-sm">
                    {versionInfo.version && <p>Backend: <strong>{versionInfo.version}</strong></p>}
                    <p>Frontend: <strong>{pkg.version}</strong></p>
                    <p className="flex items-center gap-1.5">
                      {t("expiresAt")}: <strong>{versionInfo.expiresAt || "—"}</strong>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {t("expiresAtTooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </p>
                    {versionInfo.status === "valid" && versionInfo.daysRemaining != null ? (
                      <p>{t("daysRemaining")}: <strong className="text-green-600">{versionInfo.daysRemaining} {t("days")}</strong></p>
                    ) : (
                      <p className="text-destructive">
                        {t("versionExpired")}{versionInfo.expiredSince ? ` — ${t("expiredSince", { days: versionInfo.expiredSince })}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Modal: Atualizar email */}
      <Dialog open={emailModal} onOpenChange={setEmailModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("updateLicense")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{t("serverBlockWarning")}</AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <Label>{t("licenseKey")}</Label>
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailModal(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveEmail} disabled={savingEmail}>
              {savingEmail ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar domínios */}
      <Dialog open={domainModal} onOpenChange={setDomainModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editDomains")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>{t("domainsLabel")}</Label>
            <Textarea
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="exemplo1.com, exemplo2.com"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{t("domainsExample")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDomainModal(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveDomain} disabled={savingDomain}>
              {savingDomain ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
