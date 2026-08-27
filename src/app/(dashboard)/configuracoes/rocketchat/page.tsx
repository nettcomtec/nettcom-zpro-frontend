"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Globe, Key, User } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantById } from "@/services/tenants";
import { fetchAppRocketChats, updateTenantRocketChatEnabled } from "@/services/superadmin";
import { useAuthStore } from "@/stores/auth-store";

interface AppRocketChat {
  id: number;
  serverUrl?: string;
  adminUserId?: string;
  autoCreateUsers?: boolean;
  isActive?: boolean;
  description?: string;
  tenantId?: number | null;
}

export default function ConfigRocketChatPage() {
  const t = useTranslations("configRocketChatPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<AppRocketChat | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [tenantRes, configRes] = await Promise.all([
          fetchTenantById(tenantId),
          fetchAppRocketChats()
        ]);

        const tenantData = Array.isArray(tenantRes.data) ? tenantRes.data[0] : tenantRes.data;
        setEnabled((tenantData as Record<string, string>)?.rocketChatEnabled === "enabled");

        const configs: AppRocketChat[] = Array.isArray(configRes.data) ? configRes.data : [];
        const tenantConfig = configs.find(
          (c) => c.tenantId === tenantId || c.tenantId === null
        );
        setConfig(tenantConfig || null);
      } catch {
        toast.error(t("errorLoad"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId]);

  async function handleToggle(value: boolean) {
    setSaving(true);
    try {
      await updateTenantRocketChatEnabled(tenantId, {
        rocketChatEnabled: value ? "enabled" : "disabled"
      });
      setEnabled(value);
      toast.success(t("successSave"));
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      {/* Ativar / desativar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("enableTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">{t("enabledLabel")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("enabledHint")}</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={saving || !config}
            />
          </div>

          {!config && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t("notConfigured")}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info do servidor configurado */}
      {config && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("serverInfoTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("serverUrlLabel")}</p>
                <p className="font-mono text-xs truncate max-w-xs">{config.serverUrl || "---"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("adminUserIdLabel")}</p>
                <p className="font-mono text-xs">{config.adminUserId ? "••••••••" : "---"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Key className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("authTokenLabel")}</p>
                <p className="font-mono text-xs">••••••••</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Badge variant={config.isActive ? "success" : "secondary"}>
                {config.isActive ? t("active") : t("inactive")}
              </Badge>
              {config.tenantId === null && (
                <Badge variant="outline">{t("global")}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("managedBySuperadmin")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
