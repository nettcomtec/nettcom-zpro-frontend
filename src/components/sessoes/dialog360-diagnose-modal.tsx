"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  diagnoseDialog360,
  fetchDialog360Health,
} from "@/services/dialog360-health"
import { revalidateDialog360Webhook } from "@/services/dialog360"
import type { Dialog360HealthCheckResult } from "@/types/dialog360"

interface Props {
  channelId: number | null
  channelName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRevalidated?: () => void
}

type ProbeStatus = "ok" | "warn" | "error"

function probeStatus(value?: unknown): ProbeStatus {
  if (value === true) return "ok"
  if (value === "ok" || value === "running") return "ok"
  if (value === false || value == null) return "error"
  if (value === "warn" || value === "pending") return "warn"
  return "warn"
}

function ProbeIcon({ status }: { status: ProbeStatus }) {
  if (status === "ok")
    return <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
  if (status === "warn")
    return <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
  return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
}

/**
 * Modal de diagnóstico Dialog360 — checa API key, channel status, webhook
 * configurado, quality_rating, BSUID compliance e similares.
 */
export function Dialog360DiagnoseModal({
  channelId,
  channelName,
  open,
  onOpenChange,
  onRevalidated,
}: Props) {
  const t = useTranslations("dialog360Diagnose")
  const [loading, setLoading] = useState(false)
  const [revalidating, setRevalidating] = useState(false)
  const [result, setResult] = useState<Dialog360HealthCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runDiagnose() {
    if (!channelId) return
    setLoading(true)
    setError(null)
    try {
      const data = await diagnoseDialog360(channelId)
      setResult(data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const msg = e.response?.data?.error || e.message || "unknown"
      // fallback para o endpoint /health caso /diagnose não exista no backend.
      try {
        const data = await fetchDialog360Health(channelId)
        setResult(data)
      } catch {
        setError(msg)
        setResult(null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && channelId) {
      runDiagnose()
    } else {
      setResult(null)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, open])

  async function handleRevalidate() {
    if (!channelId) return
    setRevalidating(true)
    try {
      await revalidateDialog360Webhook(channelId)
      toast.success(t("revalidateWebhookSuccess"))
      onRevalidated?.()
      await runDiagnose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error || t("revalidateWebhookError"))
    } finally {
      setRevalidating(false)
    }
  }

  const probes: Array<{ id: string; status: ProbeStatus; detail?: string }> =
    result
      ? [
          {
            id: "apiKey",
            status: probeStatus(result.apiKeyValid),
            detail: result.apiKeyValid
              ? t("probes.apiKey.ok")
              : t("probes.apiKey.error"),
          },
          {
            id: "channelStatus",
            status: probeStatus(result.channelStatus),
            detail: result.channelStatus || undefined,
          },
          {
            id: "webhook",
            status: probeStatus(result.webhookConfigured),
            detail: result.webhookUrl || undefined,
          },
          {
            id: "quality",
            status:
              result.qualityRating === "GREEN"
                ? "ok"
                : result.qualityRating === "YELLOW"
                  ? "warn"
                  : result.qualityRating === "RED"
                    ? "error"
                    : "warn",
            detail: result.qualityRating || undefined,
          },
        ]
      : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("title")}
            {channelName ? <span className="text-muted-foreground"> · {channelName}</span> : null}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive">{t("errorTitle")}</p>
            <p className="text-destructive/80 break-words mt-1">{error}</p>
          </div>
        ) : result ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted-foreground">
                {t("overallStatus")}:
              </span>
              <Badge
                className={
                  result.ok
                    ? "bg-green-500 text-white"
                    : "bg-red-500 text-white"
                }
              >
                {result.ok ? t("overallOk") : t("overallError")}
              </Badge>
            </div>
            <Separator />
            {probes.map((probe) => (
              <div
                key={probe.id}
                className="flex items-start gap-3 py-2 border-b last:border-b-0"
              >
                <ProbeIcon status={probe.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {t(`probes.${probe.id}.label`)}
                  </p>
                  {probe.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      {probe.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {result.warnings && result.warnings.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                  {t("warningsLabel")}
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={runDiagnose}
            disabled={loading || !channelId}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {t("rerun")}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
