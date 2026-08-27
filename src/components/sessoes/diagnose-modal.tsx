"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  diagnoseMetaChannel,
  revalidateMetaWebhook,
  DiagnoseResult,
  ProbeResult,
  ProbeStatus,
} from "@/services/meta-channel-health";

interface DiagnoseModalProps {
  whatsappId: number | null;
  channelName?: string;
  channelType?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconnect?: () => void;
  onRevalidated?: (needsRevalidation: boolean) => void;
  /** Quando true, usa os endpoints cross-tenant /whatsappTenants/actions/* (página /sessoestenants, superadmin). */
  crossTenant?: boolean;
}

const STATUS_BADGE_CLASS: Record<ProbeStatus, string> = {
  ok: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
  warn: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
  error: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
};

function ProbeIcon({ status }: { status: ProbeStatus }) {
  if (status === "ok") return <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />;
  if (status === "warn") return <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />;
  return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
}

function ProbeRow({ probe, t }: { probe: ProbeResult; t: ReturnType<typeof useTranslations> }) {
  const labelKey = `probes.${probe.id}.label` as Parameters<typeof t>[0];
  let label: string;
  try {
    label = t(labelKey);
  } catch {
    label = probe.id;
  }

  return (
    <div className="flex items-start gap-3 py-2">
      <ProbeIcon status={probe.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {probe.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">
            {probe.detail.replace(/zdg_oauth/gi, "tech_provider_oauth")}
          </p>
        )}
      </div>
    </div>
  );
}

export function DiagnoseModal({
  whatsappId,
  channelName,
  channelType,
  open,
  onOpenChange,
  onReconnect,
  onRevalidated,
  crossTenant = false,
}: DiagnoseModalProps) {
  const t = useTranslations("metaChannelHealth");
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnose() {
    if (!whatsappId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await diagnoseMetaChannel(whatsappId, crossTenant);
      setResult(data);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "unknown";
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && whatsappId) {
      void runDiagnose();
    }
    if (!open) {
      setResult(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, whatsappId]);

  const showReconnect = !!result && result.overallStatus !== "ok";
  const revalidatableChannel = channelType === "instagram" || channelType === "messenger";
  const showRevalidate = revalidatableChannel && !!result && result.overallStatus !== "ok";

  async function runRevalidate() {
    if (!whatsappId) return;
    setRevalidating(true);
    try {
      const { data } = await revalidateMetaWebhook(whatsappId, crossTenant);
      if (data?.needsRevalidation) {
        toast.warning(t("revalidate.partial"));
      } else {
        toast.success(t("revalidate.success"));
      }
      onRevalidated?.(!!data?.needsRevalidation);
      await runDiagnose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "unknown";
      toast.error(t("revalidate.error", { detail: msg }));
    } finally {
      setRevalidating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="break-words">
            {channelName ? channelName : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-5 h-5 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-center pt-2">{t("running")}</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-4">
            <div className="flex items-start gap-2 text-sm">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-muted-foreground break-words">{error}</p>
            </div>
          </div>
        )}

        {!loading && result && (
          <>
            <div className="flex items-center justify-between gap-2 py-2">
              <span className="text-xs text-muted-foreground">
                {new Date(result.checkedAt).toLocaleString()}
              </span>
              <Badge variant="outline" className={STATUS_BADGE_CLASS[result.overallStatus]}>
                {t(`overallStatus.${result.overallStatus}`)}
              </Badge>
            </div>
            <Separator />
            <div className="divide-y divide-border">
              {result.probes.map((probe, idx) => (
                <ProbeRow key={`${probe.id}-${idx}`} probe={probe} t={t} />
              ))}
            </div>
          </>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          {!loading && (
            <Button
              variant="outline"
              size="sm"
              onClick={runDiagnose}
              disabled={!whatsappId}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t("retest")}
            </Button>
          )}
          {loading && (
            <Button variant="outline" size="sm" disabled className="w-full sm:w-auto">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("running")}
            </Button>
          )}
          {!loading && showRevalidate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={runRevalidate}
              disabled={revalidating}
              className="w-full sm:w-auto"
            >
              {revalidating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              {revalidating ? t("revalidate.running") : t("revalidate.action")}
            </Button>
          )}
          {!loading && showReconnect && onReconnect && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onReconnect();
                onOpenChange(false);
              }}
              className="w-full sm:w-auto"
            >
              {t("reconnect")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
