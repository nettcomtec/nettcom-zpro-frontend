"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageSquare, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantDialog360Partner } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Form reusavel das credenciais Partner Dialog360. Usado em:
 * - /configuracoes/dialog360-credentials (pagina standalone)
 * - /configuracoes/dialog360 (aba "Credenciais")
 */
export function Dialog360CredentialsForm() {
  const t = useTranslations("dialog360CredentialsPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [partnerId, setPartnerId] = useState("");
  const [partnerApiKey, setPartnerApiKey] = useState("");
  const [platformSecret, setPlatformSecret] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTenantById(tenantId)
      .then(({ data }) => {
        const d = (Array.isArray(data) ? data[0] : data) as Record<string, string> | undefined;
        setPartnerId(d?.dialog360PartnerId || "");
        setPartnerApiKey(d?.dialog360PartnerApiKey || "");
        setPlatformSecret(d?.dialog360PlatformSecret || "");
      })
      .catch(() => toast.error(t("errorLoad")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const saveDebounced = useCallback(
    (pid: string, key: string, secret: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          await updateTenantDialog360Partner(tenantId, {
            dialog360PartnerId: pid,
            dialog360PartnerApiKey: key,
            dialog360PlatformSecret: secret,
          });
          toast.success(t("successSave"));
        } catch {
          toast.error(t("errorSave"));
        }
      }, 700);
    },
    [tenantId, t]
  );

  if (loading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900">
        <CardContent className="pt-5 text-sm space-y-2">
          <p className="font-semibold text-foreground">Customer Account vs Partner Account</p>
          <p className="text-muted-foreground">
            {t.rich("partnerAccountInfo", { strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
          <p className="text-muted-foreground">
            {t.rich("customerAccountInfo", { strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
          <p className="text-muted-foreground">
            {t.rich("partnerIdFormatInfo", {
              strong: (chunks) => <strong>{chunks}</strong>,
              code: (chunks) => <code>{chunks}</code>,
              em: (chunks) => <em>{chunks}</em>,
            })}
          </p>
          <p className="text-muted-foreground">
            {t("leaveBlankInfo")}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Dialog360 (BSP)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("partnerIdLabel")}</Label>
            <Input
              value={partnerId}
              onChange={(e) => { setPartnerId(e.target.value); saveDebounced(e.target.value, partnerApiKey, platformSecret); }}
              placeholder={t("partnerIdPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("partnerApiKeyLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? "text" : "password"}
                value={partnerApiKey}
                onChange={(e) => { setPartnerApiKey(e.target.value); saveDebounced(partnerId, e.target.value, platformSecret); }}
                placeholder={t("partnerApiKeyPlaceholder")}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("platformSecretLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showSecret ? "text" : "password"}
                value={platformSecret}
                onChange={(e) => { setPlatformSecret(e.target.value); saveDebounced(partnerId, partnerApiKey, e.target.value); }}
                placeholder={t("platformSecretPlaceholder")}
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
