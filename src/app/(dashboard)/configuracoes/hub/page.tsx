"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { GlobalProviderNotice } from "@/components/configuracoes/global-provider-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantHubToken } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";

export default function HubPage() {
  const t = useTranslations("configHubPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [hubToken, setHubToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTenantById(tenantId)
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        setHubToken((d as Record<string, string>)?.hubToken || "");
      })
      .catch(() => toast.error(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const saveDebounced = useCallback(
    (token: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          await updateTenantHubToken(tenantId, { hubToken: token });
          toast.success(t("successSave"));
        } catch {
          toast.error(t("errorSave"));
        }
      }, 700);
    },
    [tenantId]
  );

  // A ajuda precisa existir tambem no skeleton: sem isso o botao de ajuda
  // some da pagina enquanto os dados carregam.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      />

      <GlobalProviderNotice providerType="hub" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Hub
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("tokenLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={hubToken}
                onChange={(e) => { setHubToken(e.target.value); saveDebounced(e.target.value); }}
                placeholder={t("tokenPlaceholder")}
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
    </div>
  );
}
