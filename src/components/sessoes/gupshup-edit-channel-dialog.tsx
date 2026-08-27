"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save, RefreshCw, KeyRound } from "lucide-react"
import { toast } from "sonner"
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
import { Separator } from "@/components/ui/separator"
import {
  getGupshupChannel,
  updateGupshupChannel,
  refreshGupshupAppToken,
  rotateGupshupApiKey,
  setGupshupWebhook,
} from "@/services/gupshup"
import type { GupshupChannel } from "@/types/gupshup"

interface Props {
  whatsappId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function GupshupEditChannelDialog({
  whatsappId,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const t = useTranslations("gupshupEditChannel")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [reconfWebhook, setReconfWebhook] = useState(false)

  const [channel, setChannel] = useState<GupshupChannel | null>(null)
  const [name, setName] = useState("")
  const [appToken, setAppToken] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")

  useEffect(() => {
    if (!open || !whatsappId) return
    let cancelled = false
    setLoading(true)
    getGupshupChannel(whatsappId)
      .then(({ data }) => {
        if (cancelled) return
        setChannel(data)
        setName(String(data?.appName ?? ""))
        setAppToken("")
        setApiKey("")
        setPhoneNumberId(String(data?.phoneNumberId ?? ""))
        setWabaId(String(data?.wabaId ?? ""))
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadError"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, whatsappId])

  async function save() {
    if (!whatsappId) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        appName: name,
        phoneNumberId: phoneNumberId.trim() || null,
        wabaId: wabaId.trim() || null,
      }
      if (appToken.trim()) payload.appToken = appToken.trim()
      if (apiKey.trim()) payload.apiKey = apiKey.trim()
      await updateGupshupChannel(whatsappId, payload)
      toast.success(t("saveSuccess"))
      onSaved?.()
      onOpenChange(false)
    } catch {
      toast.error(t("saveError"))
    } finally {
      setSaving(false)
    }
  }

  async function refreshAppToken() {
    if (!whatsappId) return
    setRefreshing(true)
    try {
      await refreshGupshupAppToken(whatsappId)
      toast.success(t("refreshAppTokenSuccess"))
    } catch {
      toast.error(t("refreshAppTokenError"))
    } finally {
      setRefreshing(false)
    }
  }

  async function rotateKey() {
    if (!whatsappId) return
    setRotating(true)
    try {
      await rotateGupshupApiKey(whatsappId)
      toast.success(t("rotateApiKeySuccess"))
    } catch {
      toast.error(t("rotateApiKeyError"))
    } finally {
      setRotating(false)
    }
  }

  async function reconfigureWebhook() {
    if (!whatsappId) return
    setReconfWebhook(true)
    try {
      await setGupshupWebhook(whatsappId)
      toast.success(t("webhookSuccess"))
    } catch {
      toast.error(t("webhookError"))
    } finally {
      setReconfWebhook(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-lg w-full sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {channel?.appName ? `${channel.appName} · ` : ""}
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gupshup-edit-name">{t("nameLabel")}</Label>
              <Input
                id="gupshup-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("appIdLabel")}</Label>
                <Input value={channel?.appId ?? ""} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label>{t("appTokenMaskedLabel")}</Label>
                <Input value={channel?.appTokenMasked ?? ""} readOnly disabled />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="gupshup-edit-apptoken">
                {t("newAppTokenLabel")}
              </Label>
              <Input
                id="gupshup-edit-apptoken"
                type="password"
                value={appToken}
                onChange={(e) => setAppToken(e.target.value)}
                placeholder={t("leaveBlank")}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="gupshup-edit-apikey">{t("newApiKeyLabel")}</Label>
              <Input
                id="gupshup-edit-apikey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t("leaveBlank")}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="gupshup-edit-phoneid">
                  {t("phoneNumberIdLabel")}
                </Label>
                <Input
                  id="gupshup-edit-phoneid"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gupshup-edit-wabaid">{t("wabaIdLabel")}</Label>
                <Input
                  id="gupshup-edit-wabaid"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAppToken}
                disabled={refreshing}
                className="flex-1"
              >
                {refreshing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t("refreshAppToken")}
              </Button>
              {/* "Rotacionar API key" e "Configurar webhook" removidos a pedido —
                  webhook/API key sao gerenciados no painel da Gupshup. */}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
