"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import {
  fetchResellerTermsAcceptances,
  isBackendMissing,
  type ResellerTermsAcceptance,
} from "@/services/reseller-terms";

// PLANO_ACEITE_TERMOS_REVENDA §5.8.1 — histórico de aceites dos termos do
// revendedor no modal de edição da empresa (/tenants, superadmin). Somente
// leitura. Backend antigo (404/405/501) → não renderiza nada.

interface Props {
  tenantId: number;
}

type LoadState = "loading" | "ready" | "missing" | "error";

export function TenantResellerTermsBlock({ tenantId }: Props) {
  const t = useTranslations("tenantsPage");
  const tc = useTranslations("common");

  const isMainTenant = Number(tenantId) === 1;
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<ResellerTermsAcceptance[]>([]);

  useEffect(() => {
    if (isMainTenant || !(Number(tenantId) > 0)) return;
    let cancelled = false;
    setState("loading");
    fetchResellerTermsAcceptances(Number(tenantId))
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data?.acceptances) ? [...data.acceptances] : [];
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setItems(list);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setState(isBackendMissing(err) ? "missing" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, isMainTenant]);

  if (isMainTenant) {
    return <p className="text-xs text-muted-foreground">{t("resellerTermsMainExempt")}</p>;
  }

  if (state === "missing") return null;

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {tc("loading")}
      </div>
    );
  }

  if (state === "error") {
    return <p className="text-xs text-muted-foreground">{tc("errorFetchingData")}</p>;
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("resellerTermsNone")}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const who = [item.userName, item.userEmail].filter(Boolean).join(" · ");
        return (
          <li key={item.id} className="rounded-lg border p-3 text-xs">
            <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-[max-content_minmax(0,1fr)]">
              <dt className="text-muted-foreground">{t("resellerTermsDateCol")}</dt>
              <dd className="min-w-0 font-medium">
                {item.createdAt ? formatDateTime(item.createdAt) : "—"}
              </dd>

              <dt className="text-muted-foreground">{t("resellerTermsUserCol")}</dt>
              <dd className="min-w-0 break-words">{who || "—"}</dd>

              <dt className="text-muted-foreground">{t("resellerTermsVersionCol")}</dt>
              <dd className="min-w-0">{item.version ?? "—"}</dd>

              <dt className="text-muted-foreground">{t("resellerTermsIpCol")}</dt>
              <dd className="min-w-0 break-words">
                <span className="font-mono">{item.ip || "—"}</span>
                {item.ipSource && (
                  <span className="ms-2 text-muted-foreground">
                    {t("resellerTermsIpSource", { source: item.ipSource })}
                  </span>
                )}
                {item.cfConnectingIp && (
                  <span className="block text-muted-foreground">
                    {t("resellerTermsCfIp", { ip: item.cfConnectingIp })}
                  </span>
                )}
              </dd>

              <dt className="text-muted-foreground">{t("resellerTermsBrowserCol")}</dt>
              <dd className="min-w-0 truncate" title={item.userAgent || undefined}>
                {item.userAgent || "—"}
              </dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

export default TenantResellerTermsBlock;
