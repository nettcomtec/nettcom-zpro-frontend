"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, ScrollText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { isNativeApp } from "@/lib/native";
import { formatDateTime } from "@/lib/format";
import { fetchMyResellerTerms, type MyResellerTermsResponse } from "@/services/reseller-terms";

// PLANO_ACEITE_TERMOS_REVENDA §5.8.3 — card em /meu-perfil com o registro do
// aceite dos termos do revendedor pela empresa. Só para `admin` de empresa
// cliente (a principal é dispensada). Backend antigo, erro, não aplicável ou
// nada publicado → o card não aparece.

export function ResellerTermsCard() {
  const t = useTranslations("configPerfilPage");
  const { user } = useAuthStore();

  const eligible = user?.profile === "admin" && Number(user?.tenantId) !== 1;
  const [data, setData] = useState<MyResellerTermsResponse | null>(null);
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isNativeApp());
  }, []);

  useEffect(() => {
    if (!eligible) {
      setData(null);
      return;
    }
    let cancelled = false;
    fetchMyResellerTerms()
      .then((res) => { if (!cancelled) setData(res.data ?? null); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [eligible, user?.userId]);

  if (!eligible || !data || !data.applicable || data.currentVersion == null) return null;

  const last = data.lastAcceptance;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" /> {t("resellerTermsTitle")}
        </CardTitle>
        <CardDescription>{t("resellerTermsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm break-words">
          {last
            ? t("resellerTermsAccepted", {
                version: last.version,
                date: last.acceptedAt ? formatDateTime(last.acceptedAt) : "—",
                name: last.userName || "—",
              })
            : t("resellerTermsNotAccepted")}
        </p>
        {!native && (
          <Button variant="outline" asChild>
            <a href="/contrato" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("resellerTermsView")}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default ResellerTermsCard;
