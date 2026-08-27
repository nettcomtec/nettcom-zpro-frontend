"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Cpu, HardDrive, MemoryStick, Activity } from "lucide-react";
import { fetchSystemMetrics } from "@/services/superadmin";

interface Metrics {
  cpu?: { usage?: string; cores?: number };
  memory?: { usedPercentage?: string; total?: string; used?: string; free?: string };
  uptime?: string;
  disk?: { usedPercentage?: string; total?: string; used?: string; free?: string };
}

function pct(val?: string) {
  return parseFloat((val || "0").replace("%", "").replace(",", ".")) || 0;
}

function badgeVariant(v: number): "destructive" | "warning" | "success" {
  return v > 80 ? "destructive" : v > 60 ? "warning" : "success";
}

export default function MonitorPage() {
  const t = useTranslations("monitorPage");
  const [metrics, setMetrics] = useState<Metrics>({});
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const { data } = await fetchSystemMetrics();
      setMetrics(data || {});
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 15000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const cpu = pct(metrics.cpu?.usage);
  const mem = pct(metrics.memory?.usedPercentage);
  const disk = pct(metrics.disk?.usedPercentage);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      >
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />{t("refresh")}</Button>
      </PageHeader>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CPU */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> CPU
                  <Badge className="ml-auto" variant={badgeVariant(cpu)}>{metrics.cpu?.usage || "—"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={cpu} className="h-2" />
                {metrics.cpu?.cores !== undefined && (
                  <p className="text-xs text-muted-foreground">{metrics.cpu.cores} {t("cores")}</p>
                )}
              </CardContent>
            </Card>

            {/* Memória */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MemoryStick className="h-4 w-4" /> {t("memorySection")}
                  <Badge className="ml-auto" variant={badgeVariant(mem)}>{metrics.memory?.usedPercentage || "—"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={mem} className="h-2" />
                <div className="grid grid-cols-3 text-xs text-muted-foreground">
                  <span>{t("total")}: {metrics.memory?.total || "—"}</span>
                  <span>{t("used")}: {metrics.memory?.used || "—"}</span>
                  <span>{t("free")}: {metrics.memory?.free || "—"}</span>
                </div>
              </CardContent>
            </Card>

            {/* Uptime */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Uptime
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{metrics.uptime || "—"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Disco */}
          {metrics.disk && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <HardDrive className="h-4 w-4" /> {t("diskSection")}
                  <Badge className="ml-auto" variant={badgeVariant(disk)}>{metrics.disk.usedPercentage || "—"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={disk} className="h-2" />
                <div className="grid grid-cols-3 text-xs text-muted-foreground">
                  <span>{t("total")}: {metrics.disk.total || "—"}</span>
                  <span>{t("used")}: {metrics.disk.used || "—"}</span>
                  <span>{t("free")}: {metrics.disk.free || "—"}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
