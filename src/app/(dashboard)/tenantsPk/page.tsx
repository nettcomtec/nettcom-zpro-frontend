"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, Package, Server, Copy, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { fetchTenantsEv, fetchTenantsPk } from "@/services/superadmin";

function CopyButton({ value }: { value: string }) {
  const t = useTranslations("tenantsPkPage");
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("copy")}</TooltipContent>
    </Tooltip>
  );
}

function EnvEntry({ k, v, i }: { k: string; v: string; i: number }) {
  return (
    <div className={`py-2 px-1 space-y-0.5 ${i % 2 === 0 ? "" : "bg-muted/30 rounded"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-muted-foreground">{k}</span>
        <CopyButton value={String(v)} />
      </div>
      <p className="font-mono text-xs break-all text-foreground">{String(v)}</p>
    </div>
  );
}

function PkEntry({ k, v, i }: { k: string; v: unknown; i: number }) {
  const isObject = typeof v === "object" && v !== null;
  const raw = isObject ? JSON.stringify(v, null, 2) : String(v);

  return (
    <div className={`py-2 px-1 space-y-1 ${i % 2 === 0 ? "" : "bg-muted/30 rounded"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-muted-foreground">{k}</span>
        <CopyButton value={raw} />
      </div>
      {isObject ? (
        <pre className="font-mono text-[11px] bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {raw}
        </pre>
      ) : (
        <p className="font-mono text-xs break-all text-foreground">{raw}</p>
      )}
    </div>
  );
}

export default function TenantsPkPage() {
  const t = useTranslations("tenantsPkPage");
  const [envData, setEnvData] = useState<Record<string, string>>({});
  const [pkData, setPkData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [evRes, pkRes] = await Promise.all([fetchTenantsEv(), fetchTenantsPk()]);
      setEnvData(evRes.data || {});
      setPkData(pkRes.data || {});
    } catch { toast.error(t("loadError")); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const envEntries = Object.entries(envData);
  const pkEntries = Object.entries(pkData);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader title={t("pageTitle")} description={t("pageDescription")} help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> {t("refresh")}
          </Button>
        </PageHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" /> {t("envVarsTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {envEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noEnvVars")}</p>
                ) : (
                  <div className="divide-y">
                    {envEntries.map(([k, v], i) => (
                      <EnvEntry key={k} k={k} v={v} i={i} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" /> {t("packageJsonTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pkEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noPackageData")}</p>
                ) : (
                  <div className="divide-y">
                    {pkEntries.map(([k, v], i) => (
                      <PkEntry key={k} k={k} v={v} i={i} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
