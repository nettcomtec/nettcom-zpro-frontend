"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { GlobalProviderNotice } from "@/components/configuracoes/global-provider-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, Eye, EyeOff, ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantEvolution } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";

interface EvoPayload {
  evoHost: string;
  evoToken: string;
  evoInjectorUrl: string;
  evoInjectorSecret: string;
}

export default function EvolutionPage() {
  const t = useTranslations("configEvolutionPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [evoHost, setEvoHost] = useState("");
  const [evoToken, setEvoToken] = useState("");
  const [evoInjectorUrl, setEvoInjectorUrl] = useState("");
  const [evoInjectorSecret, setEvoInjectorSecret] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTenantById(tenantId)
      .then(({ data }) => {
        const d = (Array.isArray(data) ? data[0] : data) as Record<string, string>;
        setEvoHost(d?.evoHost || "");
        setEvoToken(d?.evoToken || "");
        setEvoInjectorUrl(d?.evoInjectorUrl || "");
        setEvoInjectorSecret(d?.evoInjectorSecret || "");
      })
      .catch(() => toast.error(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const saveDebounced = useCallback(
    (payload: EvoPayload) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          await updateTenantEvolution(tenantId, payload);
          toast.success(t("successSave"));
        } catch {
          toast.error(t("errorSave"));
        }
      }, 700);
    },
    [tenantId]
  );

  const handleHostChange = (v: string) => {
    setEvoHost(v);
    saveDebounced({ evoHost: v, evoToken, evoInjectorUrl, evoInjectorSecret });
  };

  const handleTokenChange = (v: string) => {
    setEvoToken(v);
    saveDebounced({ evoHost, evoToken: v, evoInjectorUrl, evoInjectorSecret });
  };

  const handleInjectorUrlChange = (v: string) => {
    setEvoInjectorUrl(v);
    saveDebounced({ evoHost, evoToken, evoInjectorUrl: v, evoInjectorSecret });
  };

  const handleInjectorSecretChange = (v: string) => {
    setEvoInjectorSecret(v);
    saveDebounced({ evoHost, evoToken, evoInjectorUrl, evoInjectorSecret: v });
  };

  const checkStatus = () => {
    if (!evoHost) {
      toast.error(t("errorNoUrl"));
      return;
    }
    window.open(`${evoHost}/manager`, "_blank", "noopener,noreferrer");
  };

  // A ajuda precisa existir tambem no skeleton: sem isso o botao de ajuda
  // some da pagina enquanto os dados carregam.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      >
        <Button variant="outline" onClick={checkStatus}>
          <ExternalLink className="mr-2 h-4 w-4" /> {t("checkStatus")}
        </Button>
      </PageHeader>

      <GlobalProviderNotice providerType="evo" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Evolution API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("urlLabel")}</Label>
            <Input
              value={evoHost}
              onChange={(e) => handleHostChange(e.target.value)}
              placeholder={t("urlPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("globalKeyLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={evoToken}
                onChange={(e) => handleTokenChange(e.target.value)}
                placeholder={t("globalKeyPlaceholder")}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("autoSave")}</p>
        </CardContent>
      </Card>

      {/* Passkey Linker — sidecar injetor (conectar via WhatsApp Web sem QR) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> {t("injectorSectionTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("injectorSectionDesc")}</p>
          <div className="space-y-2">
            <Label>{t("injectorUrlLabel")}</Label>
            <Input
              value={evoInjectorUrl}
              onChange={(e) => handleInjectorUrlChange(e.target.value)}
              placeholder={t("injectorUrlPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("injectorSecretLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showSecret ? "text" : "password"}
                value={evoInjectorSecret}
                onChange={(e) => handleInjectorSecretChange(e.target.value)}
                placeholder={t("injectorSecretPlaceholder")}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("autoSave")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
