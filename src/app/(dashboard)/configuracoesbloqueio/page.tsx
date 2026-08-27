"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, AlertTriangle, Settings } from "lucide-react";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

export default function ConfiguracoesBloqueioPage() {
  const t = useTranslations("configBloqueioPage");
  const allowed = usePageAccess("configuracoes", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [blockOnOverdue, setBlockOnOverdue] = useState(false);
  const [gracePeriod, setGracePeriod] = useState("3");
  const [blockMessage, setBlockMessage] = useState("");
  const [notifyBefore, setNotifyBefore] = useState(true);
  const [notifyDays, setNotifyDays] = useState("2");

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

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
          ],
        }}
      >
        <Button>
          <Settings className="mr-2 h-4 w-4" /> {t("save")}
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[200px]" />
        </div>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-5 w-5" /> {t("autoBlockTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("blockOnOverdue")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("blockOnOverdueDesc")}
                  </p>
                </div>
                <Switch checked={blockOnOverdue} onCheckedChange={setBlockOnOverdue} />
              </div>

              {blockOnOverdue && (
                <>
                  <div className="space-y-2">
                    <Label>{t("gracePeriod")}</Label>
                    <Input
                      type="number"
                      value={gracePeriod}
                      onChange={(e) => setGracePeriod(e.target.value)}
                      placeholder="3"
                      className="max-w-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("gracePeriodDesc")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("blockMessage")}</Label>
                    <Input
                      value={blockMessage}
                      onChange={(e) => setBlockMessage(e.target.value)}
                      placeholder={t("blockMessagePlaceholder")}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5" /> {t("preNotifTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("notifyBefore")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("notifyBeforeDesc")}
                  </p>
                </div>
                <Switch checked={notifyBefore} onCheckedChange={setNotifyBefore} />
              </div>

              {notifyBefore && (
                <div className="space-y-2">
                  <Label>{t("notifyDays")}</Label>
                  <Input
                    type="number"
                    value={notifyDays}
                    onChange={(e) => setNotifyDays(e.target.value)}
                    placeholder="2"
                    className="max-w-xs"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
