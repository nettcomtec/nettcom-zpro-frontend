"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, RotateCcw, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getDialog360Channel,
  updateDialog360Channel,
  rotateDialog360ApiKey,
  revalidateDialog360Webhook,
} from "@/services/dialog360"
import type { Dialog360Channel } from "@/types/dialog360"

interface Props {
  open: boolean
  channelId: number | null
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
}

export function Dialog360EditChannelDialog({
  open,
  channelId,
  onOpenChange,
  onUpdated,
}: Props) {
  const t = useTranslations("dialog360")
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [revalidating, setRevalidating] = useState(false)
  const [channel, setChannel] = useState<Dialog360Channel | null>(null)

  // Editable fields.
  const [displayName, setDisplayName] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")

  useEffect(() => {
    if (!open || !channelId) return
    let cancelled = false
    setLoading(true)
    getDialog360Channel(channelId)
      .then(({ data }) => {
        if (cancelled) return
        setChannel(data)
        setDisplayName(data.displayPhoneNumber || data.verifiedName || "")
        setWebhookUrl(data.webhookUrl || "")
      })
      .catch((err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } }
        toast.error(e.response?.data?.error || t("loadError"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [channelId, open, t])

  async function handleSubmit() {
    if (!channelId) return
    setSubmitting(true)
    try {
      await updateDialog360Channel(channelId, {
        displayPhoneNumber: displayName,
        webhookUrl,
      })
      toast.success(t("updatedSuccess"))
      onOpenChange(false)
      onUpdated?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error || t("updatedError"))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRotate() {
    if (!channelId) return
    if (!window.confirm(t("rotateConfirm"))) return
    setRotating(true)
    try {
      await rotateDialog360ApiKey(channelId)
      toast.success(t("rotateSuccess"))
      onUpdated?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error || t("rotateError"))
    } finally {
      setRotating(false)
    }
  }

  async function handleRevalidate() {
    if (!channelId) return
    setRevalidating(true)
    try {
      await revalidateDialog360Webhook(channelId)
      toast.success(t("revalidateWebhookSuccess"))
      onUpdated?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error || t("revalidateWebhookError"))
    } finally {
      setRevalidating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editChannelTitle")}</DialogTitle>
          <DialogDescription>{t("editChannelDesc")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("phoneNumberIdLabel")}</Label>
              <Input value={channel?.phoneNumberId || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t("wabaIdLabel")}</Label>
              <Input value={channel?.wabaId || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d360-edit-display">{t("displayNameLabel")}</Label>
              <Input
                id="d360-edit-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d360-edit-webhook">{t("webhookUrlLabel")}</Label>
              <Input
                id="d360-edit-webhook"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>{t("apiKeyMaskedLabel")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={channel?.apiKeyMasked || "•••• •••• ••••"}
                  disabled
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRotate}
                  disabled={rotating}
                  title={t("rotateApiKey")}
                >
                  {rotating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("webhookOriginLabel")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={channel?.webhookOrigin || "partner"}
                  disabled
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevalidate}
                  disabled={revalidating}
                  title={t("revalidateWebhook")}
                >
                  {revalidating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
