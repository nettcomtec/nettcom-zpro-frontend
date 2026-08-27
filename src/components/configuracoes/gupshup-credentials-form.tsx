"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageSquare, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantGupshupPartner } from "@/services/tenants";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Form reusavel das credenciais Partner Gupshup. Usado em:
 * - /configuracoes/gupshup-credentials (pagina standalone)
 * - /configuracoes/gupshup (aba "Credenciais")
 */
export function GupshupCredentialsForm() {
  const t = useTranslations("gupshupCredentialsPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerPassword, setPartnerPassword] = useState("");
  const [solutionId, setSolutionId] = useState("");
  const [appId, setAppId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTenantById(tenantId)
      .then(({ data }) => {
        const d = (Array.isArray(data) ? data[0] : data) as Record<string, string> | undefined;
        setPartnerEmail(d?.gupshupPartnerEmail || "");
        setPartnerPassword(d?.gupshupPartnerPassword || "");
        setSolutionId(d?.gupshupSolutionId || "");
        setAppId(d?.gupshupAppId || "");
      })
      .catch(() => toast.error(t("errorLoad")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const saveDebounced = (email: string, password: string, sol: string, app: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await updateTenantGupshupPartner(tenantId, {
          gupshupPartnerEmail: email,
          gupshupPartnerPassword: password,
          gupshupSolutionId: sol,
          gupshupAppId: app,
        });
        toast.success(t("saveSuccess"));
      } catch {
        toast.error(t("saveError"));
      }
    }, 700);
  };

  if (loading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900">
        <CardContent className="pt-5 text-sm space-y-2">
          <p className="font-semibold text-foreground">Customer Account vs Partner Account</p>
          <p className="text-muted-foreground">
            <strong>Partner Account</strong> (partner.gupshup.io) tem acesso a Partner API:
            cria apps via Solution ID, gera Embedded Signup links, autenticacao via email/senha.
            Cadastro separado, exige aprovacao Gupshup (gupshup.io/whatsapp/partner-program).
          </p>
          <p className="text-muted-foreground">
            <strong>Customer Account</strong> (gupshup.io comum) so permite gerenciar apps
            criados via painel — sem Partner API. Para conectar canais Customer no Z-PRO use
            o fluxo <strong>Manual</strong> em /sessoes (cola App ID + App Token direto, sem
            Solution ID nem Partner login). Webhook precisa ser configurado manualmente no
            painel do app Gupshup.
          </p>
          <p className="text-muted-foreground">
            Os campos abaixo sao credenciais <strong>Partner</strong>. Deixe em branco se
            so vai usar o fluxo Manual com Customer Account.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Gupshup (BSP)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("partnerEmailLabel")}</Label>
            <Input
              type="email"
              value={partnerEmail}
              onChange={(e) => { setPartnerEmail(e.target.value); saveDebounced(e.target.value, partnerPassword, solutionId, appId); }}
              placeholder={t("partnerEmailPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("partnerPasswordLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showPassword ? "text" : "password"}
                value={partnerPassword}
                onChange={(e) => { setPartnerPassword(e.target.value); saveDebounced(partnerEmail, e.target.value, solutionId, appId); }}
                placeholder={t("partnerPasswordPlaceholder")}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("solutionIdLabel")}</Label>
            <Input
              value={solutionId}
              onChange={(e) => { setSolutionId(e.target.value); saveDebounced(partnerEmail, partnerPassword, e.target.value, appId); }}
              placeholder={t("solutionIdPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("appIdLabel")}</Label>
            <Input
              value={appId}
              onChange={(e) => { setAppId(e.target.value); saveDebounced(partnerEmail, partnerPassword, solutionId, e.target.value); }}
              placeholder={t("appIdPlaceholder")}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("autoSave")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
