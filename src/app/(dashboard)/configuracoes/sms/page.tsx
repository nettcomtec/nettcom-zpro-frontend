"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantSMSToken, updateTenantConectaSMSToken, updateTenantLivsonSMSToken } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";

export default function SMSPage() {
  const t = useTranslations("smsConfigPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [smsToken, setSmsToken] = useState("");
  const [conectaSmsToken, setConectaSmsToken] = useState("");
  const [livsonSmsToken, setLivsonSmsToken] = useState("");
  const [showSms, setShowSms] = useState(false);
  const [showConecta, setShowConecta] = useState(false);
  const [showLivson, setShowLivson] = useState(false);
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetchTenantById(tenantId)
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        setSmsToken((d as Record<string, string>)?.smsToken || "");
        setConectaSmsToken((d as Record<string, string>)?.conectaSmsToken || "");
        setLivsonSmsToken((d as Record<string, string>)?.livsonSmsToken || "");
      })
      .catch(() => toast.error(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const debounceSave = useCallback(
    (field: string, fn: () => Promise<unknown>) => {
      if (debounceRefs.current[field]) clearTimeout(debounceRefs.current[field]);
      debounceRefs.current[field] = setTimeout(async () => {
        try {
          await fn();
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
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
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
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> {t("sectionTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("comteleLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showSms ? "text" : "password"}
                value={smsToken}
                onChange={(e) => {
                  setSmsToken(e.target.value);
                  debounceSave("sms", () => updateTenantSMSToken(tenantId, { smsToken: e.target.value }));
                }}
                placeholder={t("comtelePlaceholder")}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowSms(!showSms)}>
                {showSms ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("conectaLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showConecta ? "text" : "password"}
                value={conectaSmsToken}
                onChange={(e) => {
                  setConectaSmsToken(e.target.value);
                  debounceSave("conecta", () => updateTenantConectaSMSToken(tenantId, { conectaSmsToken: e.target.value }));
                }}
                placeholder={t("conectaPlaceholder")}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowConecta(!showConecta)}>
                {showConecta ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("livsonLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showLivson ? "text" : "password"}
                value={livsonSmsToken}
                onChange={(e) => {
                  setLivsonSmsToken(e.target.value);
                  debounceSave("livson", () => updateTenantLivsonSMSToken(tenantId, { livsonSmsToken: e.target.value }));
                }}
                placeholder={t("livsonPlaceholder")}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowLivson(!showLivson)}>
                {showLivson ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("autoSave")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
